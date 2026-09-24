import type { City } from './citygen';
import { isSolidWorld } from './query';

/** True when no building lies on the segment (sampled every 12 units). */
export function hasLineOfSight(city: City, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 12));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolidWorld(city, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}
