import type { World } from '../sim/world';
import type { WeaponId } from '../game/data/weapons';
import type { AudioEngine } from './audio';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const voiceGain = (dist: number) => { const v = clamp(1 - dist / 700, 0, 1); return v * v; };
export const pan = (dx: number) => clamp(dx / 400, -1, 1);

export class RateLimiter {
  private last = new Map<string, number>();
  constructor(private minMs: number) {}
  ok(key: string, now: number, minMs = this.minMs): boolean {
    const l = this.last.get(key);
    if (l !== undefined && now - l < minMs) return false;
    this.last.set(key, now);
    return true;
  }
}

export function engineParams(kind: 'car' | 'bike' | 'tank' | 'heavy'): { base: number; k: number } {
  switch (kind) {
    case 'bike': return { base: 70, k: 0.35 };
    case 'tank': return { base: 25, k: 0.08 };
    case 'heavy': return { base: 30, k: 0.15 };
    default: return { base: 45, k: 0.22 };
  }
}

type Build = (ctx: AudioContext, out: AudioNode, t: number) => AudioScheduledSourceNode[];

/** Synthesised sound effects driven by simulation events. */
export class Sfx {
  private limit = new RateLimiter(90);
  private unsub: (() => void)[] = [];
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private flame: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastFlame = -1;
  private world: World | null = null;

  constructor(private a: AudioEngine, private listener: () => { x: number; y: number }) {}

  attach(w: World | null): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.stopLoops();
    this.world = w;
    if (!w) return;
    const on = w.bus.on.bind(w.bus);
    this.unsub.push(
      on('shot', e => this.shot(e.weapon, e.x, e.y)),
      on('explosion', e => this.at(e.x, e.y, 'explosion', 0, (c, o, t) => [...this.noise(c, o, t, 1.1, 'lowpass', 1400, 80, 1.2), this.tone(c, o, t, 'sine', 55, 0.5, 0.9, 30)])),
      on('crash', e => this.at(e.x, e.y, 'crash', 120, (c, o, t) => this.noise(c, o, t, 0.15, 'bandpass', 350, 350, clamp(e.force / 300, 0.2, 1)))),
      on('skid', e => this.at(e.x, e.y, 'skid', 100, (c, o, t) => this.noise(c, o, t, 0.12, 'bandpass', 1800, 1800, 0.18, 3))),
      on('horn', e => this.at(e.x, e.y, 'horn', 400, (c, o, t) => [this.tone(c, o, t, 'square', 392, 0.35, 0.12), this.tone(c, o, t, 'square', 494, 0.35, 0.12)])),
      on('pickup', () => this.ui((c, o, t) => [523, 659, 784, 1046].map((f, i) => this.tone(c, o, t + i * 0.06, 'sine', f, 0.08, 0.25)))),
      on('phoneRing', e => this.at(e.x, e.y, 'phone', 1500, (c, o, t) => [this.tone(c, o, t, 'square', 1300, 0.4, 0.12), this.tone(c, o, t + 0.55, 'square', 1300, 0.4, 0.12)])),
      on('wasted', () => this.ui((c, o, t) => [392, 330, 262, 196].map((f, i) => this.tone(c, o, t + i * 0.22, 'triangle', f, 0.24, 0.35)))),
      on('busted', () => this.ui((c, o, t) => [440, 392, 349, 262].map((f, i) => this.tone(c, o, t + i * 0.2, 'triangle', f, 0.22, 0.35)))),
      on('enterCar', e => this.at(e.vehicle.x, e.vehicle.y, 'door', 200, (c, o, t) => this.noise(c, o, t, 0.08, 'lowpass', 500, 300, 0.4))),
      on('missionEnd', e => this.ui((c, o, t) => (e.success ? [523, 659, 784, 1046, 1318] : [330, 262]).map((f, i) => this.tone(c, o, t + i * 0.1, 'square', f, 0.12, 0.18)))),
    );
  }

  private shot(weapon: WeaponId, x: number, y: number) {
    if (weapon === 'flamer') { this.lastFlame = performance.now(); return; }
    this.at(x, y, `shot-${weapon}`, weapon === 'smg' || weapon === 'carMG' ? 60 : 30, (c, o, t) => {
      switch (weapon) {
        case 'shotgun': return this.noise(c, o, t, 0.18, 'lowpass', 2500, 800, 0.8);
        case 'rocket': case 'tankGun': return this.noise(c, o, t, 0.3, 'bandpass', 600, 1500, 0.6, 2);
        case 'electro': return [this.tone(c, o, t, 'square', 90 + Math.random() * 40, 0.06, 0.25)];
        case 'grenade': case 'molotov': return this.noise(c, o, t, 0.06, 'bandpass', 900, 900, 0.2);
        case 'smg': case 'carMG': return [...this.noise(c, o, t, 0.04, 'highpass', 900, 900, 0.5), this.tone(c, o, t, 'sine', 110, 0.03, 0.4, 60)];
        default: return [...this.noise(c, o, t, 0.07, 'highpass', 900, 900, 0.7), this.tone(c, o, t, 'sine', 110, 0.04, 0.6, 60)];
      }
    });
  }

  private ui(build: Build) { this.play(0, 1, build); }

  private at(x: number, y: number, key: string, minMs: number, build: Build) {
    const l = this.listener();
    const d = Math.hypot(x - l.x, y - l.y);
    const g = voiceGain(d);
    if (g < 0.02) return;
    if (minMs > 0 && !this.limit.ok(key, performance.now(), minMs)) return;
    this.play(pan(x - l.x), g, build);
  }

  private play(p: number, g: number, build: Build) {
    const a = this.a, ctx = a.ctx;
    if (!ctx || !a.voice()) return;
    const gain = ctx.createGain();
    gain.gain.value = g;
    const panner = ctx.createStereoPanner();
    panner.pan.value = p;
    gain.connect(panner).connect(a.sfx);
    const nodes = build(ctx, gain, ctx.currentTime);
    let left = nodes.length;
    for (const n of nodes) n.onended = () => { if (--left === 0) { gain.disconnect(); panner.disconnect(); a.release(); } };
    if (!nodes.length) a.release();
  }

  private noise(c: AudioContext, out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): AudioScheduledSourceNode[] {
    const src = c.createBufferSource();
    src.buffer = this.a.noise;
    const filt = c.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return [src];
  }

  private tone(c: AudioContext, out: AudioNode, t: number, type: OscillatorType, f: number, dur: number, vol: number, fEnd?: number): OscillatorNode {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** Continuous sounds: player engine, nearest siren, flamethrower. Called every rendered frame. */
  tick(): void {
    const ctx = this.a.ctx, w = this.world;
    if (!ctx || !w) return;
    const now = ctx.currentTime;
    const v = w.player.vehicle;
    if (v && !v.wreck) {
      if (!this.engine) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth';
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        const gain = ctx.createGain(); gain.gain.value = 0;
        osc.connect(lp).connect(gain).connect(this.a.sfx);
        osc.start();
        this.engine = { osc, gain };
      }
      const kind = v.def.kind === 'bike' ? 'bike' : v.def.kind === 'tank' ? 'tank' : v.def.mass > 3000 ? 'heavy' : 'car';
      const e = engineParams(kind);
      const sp = Math.hypot(v.vx, v.vy);
      this.engine.osc.frequency.setTargetAtTime(e.base + sp * e.k + v.throttle * 12, now, 0.05);
      this.engine.gain.gain.setTargetAtTime(0.05 + v.throttle * 0.03, now, 0.05);
    } else if (this.engine) { this.engine.gain.gain.setTargetAtTime(0, now, 0.05); this.engine.osc.stop(now + 0.2); this.engine = null; }

    const l = this.listener();
    let nearest = Infinity;
    w.vehicles.each(c => { if (c.siren && !c.wreck && c.driver !== w.player) nearest = Math.min(nearest, Math.hypot(c.x - l.x, c.y - l.y)); });
    const sg = voiceGain(nearest) * 0.12;
    if (sg > 0.005) {
      if (!this.siren) {
        const osc = ctx.createOscillator(); osc.type = 'triangle';
        const gain = ctx.createGain(); gain.gain.value = 0;
        osc.connect(gain).connect(this.a.sfx);
        osc.start();
        this.siren = { osc, gain };
      }
      this.siren.osc.frequency.setTargetAtTime(Math.floor(now / 0.45) % 2 ? 950 : 650, now, 0.02);
      this.siren.gain.gain.setTargetAtTime(sg, now, 0.1);
    } else if (this.siren) { this.siren.gain.gain.setTargetAtTime(0, now, 0.1); this.siren.osc.stop(now + 0.5); this.siren = null; }

    const flaming = performance.now() - this.lastFlame < 120;
    if (flaming && !this.flame) {
      const src = ctx.createBufferSource(); src.buffer = this.a.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500;
      const gain = ctx.createGain(); gain.gain.value = 0.25;
      src.connect(bp).connect(gain).connect(this.a.sfx);
      src.start();
      this.flame = { src, gain };
    } else if (!flaming && this.flame) { this.flame.src.stop(); this.flame = null; }
  }

  stopLoops(): void {
    const t = this.a.ctx?.currentTime ?? 0;
    this.engine?.osc.stop(t); this.engine = null;
    this.siren?.osc.stop(t); this.siren = null;
    this.flame?.src.stop(t); this.flame = null;
  }
}
