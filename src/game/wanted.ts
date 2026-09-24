import type { World } from '../sim/world';

/** Heat needed for wanted levels 1..6. */
export const WANTED_THRESHOLDS = [50, 300, 800, 1600, 2800, 4500];

export function levelFor(heat: number): number {
  let l = 0;
  while (l < 6 && heat >= WANTED_THRESHOLDS[l]) l++;
  return l;
}

export function lowerWanted(w: World, n: number): void {
  const wd = w.ps.wanted;
  wd.level = Math.max(0, wd.level - n);
  wd.heat = wd.level ? WANTED_THRESHOLDS[wd.level - 1] : 0;
  wd.unseen = 0;
}

export function clearWanted(w: World): void {
  Object.assign(w.ps.wanted, { level: 0, heat: 0, unseen: 0 });
}
