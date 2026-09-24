/** Seeded randomness. Nothing in world/sim/game may use Math.random. */
export type Rng = () => number;

export function normalizeSeed(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 64);
}

/** FNV-1a over UTF-16 code units, unsigned 32-bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function splitmix32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^= t >>> 15) >>> 0;
  };
}

/** sfc32 seeded via splitmix32. Returns values in [0, 1). */
export function makeRng(seed: number): Rng {
  const sm = splitmix32(seed);
  let a = sm(), b = sm(), c = sm(), d = sm();
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function derive(seed: number, ...parts: (string | number)[]): number {
  return hashString(seed + ':' + parts.join(':'));
}

export const randInt = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
export const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export const chance = (r: Rng, p: number) => r() < p;

const W1 = ['RUSTIG', 'SNABB', 'BLANK', 'TYST', 'VILD', 'KALL', 'HET', 'GAMMAL', 'STOR', 'LILLA', 'MÖRK', 'GUL'];
const W2 = ['TRAKTOR', 'ÄLG', 'KORV', 'BIL', 'STAD', 'GATA', 'HAMN', 'BRO', 'TORG', 'KAFFE', 'LAMPA', 'VARG'];

export function randomSeedName(r: Rng): string {
  return `${pick(r, W1)}-${pick(r, W2)}-${randInt(r, 1000, 9999)}`;
}
