import { TILE } from '../core/const';
import type { City, Landmark, LandmarkKind } from './citygen';
import { T, isSolid, isWalkable } from './tiles';

export const idx = (c: City, tx: number, ty: number) => ty * c.size + tx;

/** Out of bounds counts as water. */
export function tileAt(c: City, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) return T.Water;
  return c.tiles[ty * c.size + tx];
}
export const tileAtWorld = (c: City, x: number, y: number) => tileAt(c, Math.floor(x / TILE), Math.floor(y / TILE));

/** Out of bounds counts as solid. */
export function isSolidWorld(c: City, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) return true;
  return isSolid(c.tiles[ty * c.size + tx]);
}

export function roadDirAt(c: City, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) return 0;
  return c.roadDir[ty * c.size + tx];
}

/** Returns (x, y) unchanged if already walkable, else the centre of the nearest walkable tile (sidewalk preferred per ring). */
export function findWalkableNear(c: City, x: number, y: number): { x: number; y: number } {
  if (isWalkable(tileAtWorld(c, x, y))) return { x, y };
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 1; r <= 24; r++) {
    let fallback: [number, number] | null = null;
    let best = Infinity, bx = 0, by = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = tileAt(c, cx + dx, cy + dy);
        if (!isWalkable(t)) continue;
        const d = dx * dx + dy * dy;
        if (t === T.Sidewalk && d < best) { best = d; bx = cx + dx; by = cy + dy; }
        else if (!fallback) fallback = [cx + dx, cy + dy];
      }
    if (best < Infinity) return { x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2 };
    if (fallback) return { x: fallback[0] * TILE + TILE / 2, y: fallback[1] * TILE + TILE / 2 };
  }
  return { x: c.startX, y: c.startY };
}

export const landmarksOf = (c: City, kind: LandmarkKind): Landmark[] => c.landmarks.filter(l => l.kind === kind);

export function nearestLandmark(c: City, kind: LandmarkKind, x: number, y: number): Landmark | null {
  let best: Landmark | null = null, bd = Infinity;
  for (const l of c.landmarks) {
    if (l.kind !== kind) continue;
    const d = (l.tx * TILE + TILE / 2 - x) ** 2 + (l.ty * TILE + TILE / 2 - y) ** 2;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

export const landmarkCenter = (l: Landmark) => ({ x: l.tx * TILE + TILE / 2, y: l.ty * TILE + TILE / 2 });
