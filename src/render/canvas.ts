export type Canvas = HTMLCanvasElement;
export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: Canvas): Ctx {
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return x;
}

/** Deterministic hash → [0,1) for stable per-tile texture variation. */
export function hash01(a: number, b = 0): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

/** Sprinkles noise pixels over a rect. */
export function speckle(x: Ctx, w: number, h: number, colors: string[], density: number, rnd: () => number) {
  const n = Math.floor(w * h * density);
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[Math.floor(rnd() * colors.length)];
    x.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
  }
}
