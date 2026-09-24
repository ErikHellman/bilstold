export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

const TAU = Math.PI * 2;
/** Wrap to (-π, π]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}
/** Signed shortest rotation from a to b. */
export const angleDiff = (a: number, b: number) => wrapAngle(b - a);

/** Oriented box: hw = half-length along heading, hh = half-width. */
export interface OBB { x: number; y: number; hw: number; hh: number; angle: number }
export interface Contact { nx: number; ny: number; depth: number }

function radiusOn(o: OBB, ax: number, ay: number): number {
  const c = Math.cos(o.angle), s = Math.sin(o.angle);
  return o.hw * Math.abs(c * ax + s * ay) + o.hh * Math.abs(-s * ax + c * ay);
}

/** SAT test. Returns the minimum-translation normal pointing from a to b, or null. */
export function obbOverlap(a: OBB, b: OBB): Contact | null {
  const ca = Math.cos(a.angle), sa = Math.sin(a.angle), cb = Math.cos(b.angle), sb = Math.sin(b.angle);
  const axes = [ca, sa, -sa, ca, cb, sb, -sb, cb];
  const dx = b.x - a.x, dy = b.y - a.y;
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i], ay = axes[i + 1];
    const d = dx * ax + dy * ay;
    const overlap = radiusOn(a, ax, ay) + radiusOn(b, ax, ay) - Math.abs(d);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const sign = d < 0 ? -1 : 1;
      bx = ax * sign; by = ay * sign;
    }
  }
  return { nx: bx, ny: by, depth: best };
}
