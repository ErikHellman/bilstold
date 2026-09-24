import type { Settings } from '../save/save';

const MAX_VOICES = 16;

/** Owns the AudioContext (created lazily on the first user gesture) and the mixer buses. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  noise!: AudioBuffer;
  private voices = 0;
  private active = true;

  constructor(private settings: Settings) {}

  unlock(): void {
    if (this.ctx) { if (this.active && this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.settings);
    if (!this.active) void ctx.suspend();
  }

  setActive(on: boolean): void {
    this.active = on;
    if (!this.ctx) return;
    if (on) void this.ctx.resume(); else void this.ctx.suspend();
  }

  setVolumes(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    this.master.gain.value = s.master;
    this.sfx.gain.value = s.sfx;
    this.music.gain.value = s.music * 0.5;
  }

  /** Reserve a one-shot voice; false when too many are already playing. */
  voice(): boolean {
    if (!this.ctx || !this.active || this.voices >= MAX_VOICES) return false;
    this.voices++;
    return true;
  }
  release(): void { this.voices = Math.max(0, this.voices - 1); }
}
