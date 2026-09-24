import type { Rng } from '../core/rng';
import type { City, Landmark, LandmarkKind } from './citygen';
import { T, DIRS, DIR_VEC } from './tiles';

interface Want { kind: LandmarkKind; gang: number; spacing: number }

/** Places landmarks on sidewalk tiles that face a road and back onto a building. */
export function placeLandmarks(c: City, r: Rng): void {
  const { size } = c;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? T.Water : c.tiles[y * size + x]);
  const touches = (x: number, y: number, t: number) => DIRS.some(d => at(x + DIR_VEC[d][0], y + DIR_VEC[d][1]) === t);

  const primary: number[] = [], secondary: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (c.tiles[i] !== T.Sidewalk) continue;
    const x = i % size, y = (i / size) | 0;
    if (!touches(x, y, T.Road)) continue;
    (touches(x, y, T.Building) ? primary : secondary).push(i);
  }
  shuffle(r, primary);
  shuffle(r, secondary);

  const wants: Want[] = [];
  const add = (kind: LandmarkKind, count: number, spacing: number, gang = -1) => {
    for (let i = 0; i < count; i++) wants.push({ kind, gang, spacing });
  };
  add('hospital', 2, 30); add('police', 3, 30); add('respray', 3, 30); add('bomb', 1, 30);
  add('crusher', 1, 30); add('garage', 3, 30);
  for (let g = 0; g < 3; g++) add('gangHQ', 1, 30, g);
  for (let g = 0; g < 3; g++) add('payphone', 4, 12, g);
  add('payphone', 12, 12);

  const placed: Landmark[] = [];
  const fits = (i: number, w: Want, spacing: number) => {
    const x = i % size, y = (i / size) | 0;
    if (w.gang >= 0 && c.gangZone[i] !== w.gang) return false;
    for (const l of placed) {
      const d = Math.hypot(l.tx - x, l.ty - y);
      if (d < 3) return false;
      if (l.kind === w.kind && d < spacing) return false;
    }
    return true;
  };

  for (const w of wants) {
    let chosen = -1;
    for (let spacing = w.spacing; chosen < 0; spacing *= 0.75) {
      chosen = primary.find(i => fits(i, w, spacing)) ?? -1;
      if (chosen < 0 && spacing < 4) chosen = secondary.find(i => fits(i, w, 0)) ?? -1;
      if (chosen < 0 && spacing < 0.5) break;
    }
    if (chosen < 0) continue;
    placed.push({ id: placed.length, kind: w.kind, tx: chosen % size, ty: (chosen / size) | 0, gang: w.gang });
  }
  c.landmarks = placed;
}

function shuffle(r: Rng, a: number[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
