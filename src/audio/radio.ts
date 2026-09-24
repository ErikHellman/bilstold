import { derive, makeRng, pick } from '../core/rng';
import type { AudioEngine } from './audio';

export interface StationDef { name: string; bpm: number; scale: number[]; root: number; lead: OscillatorType; bass: OscillatorType; drums: 'four' | 'rock' | 'polka' | 'lazy'; swing: number }
export interface NoteEvent { t: number; dur: number; midi: number; voice: 'lead' | 'bass' | 'kick' | 'snare' | 'hat'; vel: number }

const MINOR = [0, 2, 3, 5, 7, 8, 10], MINOR_PENT = [0, 3, 5, 7, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], MAJOR_PENT = [0, 2, 4, 7, 9];
export const STATIONS: StationDef[] = [
  { name: 'Radio Bilstöld', bpm: 118, scale: MINOR, root: 57, lead: 'square', bass: 'sawtooth', drums: 'four', swing: 0 },
  { name: 'Hårdrock FM', bpm: 140, scale: MINOR_PENT, root: 52, lead: 'sawtooth', bass: 'square', drums: 'rock', swing: 0 },
  { name: 'Dansbandet', bpm: 128, scale: MAJOR, root: 60, lead: 'triangle', bass: 'square', drums: 'polka', swing: 0 },
  { name: 'Lugna Favoriter', bpm: 84, scale: MAJOR_PENT, root: 62, lead: 'sine', bass: 'triangle', drums: 'lazy', swing: 0.12 },
];
export const RADIO_OFF = STATIONS.length;
const PROGRESSIONS = [[0, 3, 4, 5], [0, 5, 3, 4], [5, 3, 0, 4], [0, 4, 5, 3]];

function scaleNote(s: StationDef, degree: number): number {
  const len = s.scale.length;
  const oct = Math.floor(degree / len);
  return s.root + s.scale[((degree % len) + len) % len] + 12 * oct;
}

const DRUMS: Record<StationDef['drums'], { kick: number[]; snare: number[]; hat: number[] }> = {
  four: { kick: [0, 1, 2, 3], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] },
  rock: { kick: [0, 1.5, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  polka: { kick: [0, 2], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] },
  lazy: { kick: [0, 2.5], snare: [2], hat: [0, 1, 2, 3] },
};

/** One bar (4 beats) of a procedurally composed song. Pure and deterministic. */
export function composeBar(station: number, songSeed: number, bar: number): NoteEvent[] {
  const s = STATIONS[station];
  const out: NoteEvent[] = [];
  const swing = (t: number) => (t % 1 === 0.5 ? Math.min(3.99, t + s.swing) : t);
  const prog = pick(makeRng(derive(songSeed, station, 'prog')), PROGRESSIONS);
  const deg = prog[bar % 4] % s.scale.length;

  const d = DRUMS[s.drums];
  for (const t of d.kick) out.push({ t, dur: 0.2, midi: 0, voice: 'kick', vel: 1 });
  for (const t of d.snare) out.push({ t, dur: 0.15, midi: 0, voice: 'snare', vel: 0.8 });
  for (const t of d.hat) out.push({ t: swing(t), dur: 0.05, midi: 0, voice: 'hat', vel: 0.6 });

  const bass = (off: number, t: number, dur: number) => out.push({ t, dur, midi: scaleNote(s, deg + off) - 24, voice: 'bass', vel: 0.9 });
  switch (s.drums) {
    case 'four': for (let i = 0; i < 8; i++) bass(i % 2 ? s.scale.length : 0, i * 0.5, 0.4); break;
    case 'rock': for (let i = 0; i < 8; i++) bass(0, i * 0.5, 0.45); break;
    case 'polka': bass(0, 0, 0.8); bass(4, 1, 0.8); bass(0, 2, 0.8); bass(4, 3, 0.8); break;
    case 'lazy': bass(0, 0, 1.5); bass(2, 2, 1.5); break;
  }

  if (bar % 8 >= 2) {
    const phrase = Math.floor(bar / 4);
    const r = makeRng(derive(songSeed, station, 'motif', phrase % 2));
    const vary = makeRng(derive(songSeed, station, 'vary', phrase));
    const shift = bar % 4 >= 2 ? (vary() < 0.5 ? 1 : -1) : 0;
    let walk = deg + s.scale.length;
    // generate both bars of the 2-bar motif and keep the one we need
    for (let half = 0; half < 2; half++) {
      for (let slot = 0; slot < 8; slot++) {
        const play = slot === 0 || r() < 0.6;
        walk += Math.round((r() - 0.5) * 3);
        walk = Math.max(s.scale.length - 2, Math.min(s.scale.length * 2 + 2, walk));
        const long = r() < 0.3;
        if (!play || half !== bar % 2) continue;
        out.push({ t: swing(slot * 0.5), dur: long ? 0.9 : 0.4, midi: scaleNote(s, walk + shift) + 12, voice: 'lead', vel: 0.8 });
      }
    }
  }
  return out;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Schedules composed bars a little ahead of time on the music bus. */
export class Radio {
  station = RADIO_OFF;
  private songSeed = 1;
  private bar = 0;
  private nextBar = 0;
  private out: GainNode | null = null;

  constructor(private a: AudioEngine) {}

  name(): string { return this.station === RADIO_OFF ? 'Radio off' : STATIONS[this.station].name; }

  setStation(i: number): void {
    this.stop();
    this.station = i;
    const ctx = this.a.ctx;
    if (!ctx || i === RADIO_OFF) return;
    this.out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3500;
    this.out.connect(lp).connect(this.a.music);
    this.songSeed = (Math.random() * 2 ** 31) | 0;
    this.bar = 0;
    this.nextBar = ctx.currentTime + 0.1;
  }

  stop(): void {
    const ctx = this.a.ctx;
    if (this.out && ctx) {
      const g = this.out;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => g.disconnect(), 600);
    }
    this.out = null;
  }

  get playing() { return this.out !== null; }

  update(): void {
    const ctx = this.a.ctx, out = this.out;
    if (!ctx || !out || this.station === RADIO_OFF) return;
    const s = STATIONS[this.station], spb = 60 / s.bpm;
    if (this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.05;
    while (this.nextBar < ctx.currentTime + 0.3) {
      for (const n of composeBar(this.station, this.songSeed, this.bar)) this.note(ctx, out, s, n, this.nextBar + n.t * spb, n.dur * spb);
      this.nextBar += 4 * spb;
      if (++this.bar % 32 === 0) this.songSeed = (this.songSeed * 1103515245 + 12345) | 0;
    }
  }

  private note(ctx: AudioContext, out: AudioNode, s: StationDef, n: NoteEvent, t: number, dur: number) {
    const g = ctx.createGain();
    g.connect(out);
    if (n.voice === 'lead' || n.voice === 'bass') {
      const o = ctx.createOscillator();
      o.type = n.voice === 'lead' ? s.lead : s.bass;
      o.frequency.value = hz(n.midi);
      const v = (n.voice === 'lead' ? 0.1 : 0.14) * n.vel;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.setTargetAtTime(v * 0.6, t + 0.02, 0.1);
      g.gain.setTargetAtTime(0, t + dur, 0.03);
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.2);
      o.onended = () => g.disconnect();
      return;
    }
    if (n.voice === 'kick') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g); o.start(t); o.stop(t + 0.2);
      o.onended = () => g.disconnect();
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.a.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = n.voice === 'snare' ? 1500 : 7000;
    const len = n.voice === 'snare' ? 0.12 : 0.03;
    g.gain.setValueAtTime(n.voice === 'snare' ? 0.22 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(hp).connect(g);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
    src.onended = () => g.disconnect();
  }
}
