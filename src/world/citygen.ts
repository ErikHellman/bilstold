import { MAP_SIZE, TILE } from '../core/const';
import { type Rng, makeRng, derive, randInt, pick, chance } from '../core/rng';
import type { VehicleModelId } from '../game/data/vehicles';
import { T, D, DIR, DIRS, DIR_VEC } from './tiles';
import { gangNames } from './gangnames';
import { placeLandmarks } from './landmarks';

export interface GangDef { id: number; name: string; color: string; carModel: VehicleModelId }
export type LandmarkKind = 'hospital' | 'police' | 'respray' | 'bomb' | 'crusher' | 'garage' | 'gangHQ' | 'payphone';
export interface Landmark { id: number; kind: LandmarkKind; tx: number; ty: number; gang: number }
export interface City {
  seed: number; index: number; size: number;
  tiles: Uint8Array; height: Uint8Array; roadDir: Uint8Array; district: Uint8Array; gangZone: Uint8Array;
  landmarks: Landmark[]; gangs: GangDef[];
  /** World units, on a sidewalk tile. */
  startX: number; startY: number;
}

export const GANG_COLORS = ['#e8c547', '#4fb3e8', '#d9534f'];
const GANG_CARS: VehicleModelId[] = ['muscle', 'sports', 'pickup', 'van', 'sedan'];
/** Ring road inset from the map edge. */
export const RING = 8;

interface Line { pos: number; w: number; ring: boolean; avenue: boolean }
interface Pt { x: number; y: number; kind: number }

export function generateCity(seed: number, index: number): City {
  const size = MAP_SIZE, n = size * size;
  const c: City = {
    seed, index, size,
    tiles: new Uint8Array(n).fill(T.Grass), height: new Uint8Array(n), roadDir: new Uint8Array(n),
    district: new Uint8Array(n), gangZone: new Uint8Array(n), landmarks: [], gangs: [], startX: 0, startY: 0,
  };
  const R = (step: string) => makeRng(derive(seed, 'city', index, step));
  const water = placeWater(c, R('water'));
  const points = assignDistricts(c, R('districts'), water.coasts);
  const vx = planRoadLines(R('roads-v'), size, water.river?.vertical ? water.river.band : null);
  const hy = planRoadLines(R('roads-h'), size, water.river && !water.river.vertical ? water.river.band : null);
  const kept = pruneSegments(vx, hy, R('prune'));
  paintLanes(c, vx, hy, kept);
  cleanFlags(c);
  addSidewalks(c);
  const outskirts = fillOutskirts(c, R('outskirts'));
  fillBlocks(c, R('blocks'), outskirts);
  fillBorder(c);
  assignGangs(c, R('gangs'), points);
  placeLandmarks(c, R('landmarks'));
  pickStart(c);
  return c;
}

// ---------------------------------------------------------------- water

interface WaterInfo { coasts: number[]; river: { vertical: boolean; band: [number, number] } | null }

function placeWater(c: City, r: Rng): WaterInfo {
  const { size } = c;
  const coasts: number[] = [];
  const edges = [0, 1, 2, 3]; // 0 = north, 1 = east, 2 = south, 3 = west
  const count = randInt(r, 1, 2);
  for (let i = 0; i < count; i++) coasts.push(edges.splice(Math.floor(r() * edges.length), 1)[0]);
  for (const edge of coasts) {
    let depth = randInt(r, 3, 6);
    for (let i = 0; i < size; i++) {
      if (i % 6 === 0) depth = Math.max(3, Math.min(6, depth + randInt(r, -1, 1)));
      for (let d = 0; d < depth; d++) {
        const [x, y] = edge === 0 ? [i, d] : edge === 1 ? [size - 1 - d, i] : edge === 2 ? [i, size - 1 - d] : [d, i];
        c.tiles[y * size + x] = T.Water;
      }
    }
  }
  let river: WaterInfo['river'] = null;
  if (chance(r, 0.6)) {
    const vertical = chance(r, 0.5);
    const w = randInt(r, 3, 4);
    const p0 = randInt(r, 40, size - 40 - w);
    let p = p0;
    for (let i = 0; i < size; i++) {
      if (i % 8 === 0) p = Math.max(p0 - 4, Math.min(p0 + 4, p + randInt(r, -1, 1)));
      for (let k = 0; k < w; k++) {
        const [x, y] = vertical ? [p + k, i] : [i, p + k];
        c.tiles[y * size + x] = T.Water;
      }
    }
    river = { vertical, band: [p0 - 4 - 2, p0 + 4 + w + 2] };
  }
  return { coasts, river };
}

// ---------------------------------------------------------------- districts

function assignDistricts(c: City, r: Rng, coasts: number[]): Pt[] {
  const { size } = c;
  const pts: Pt[] = [];
  for (let i = 0; i < 14; i++) pts.push({ x: randInt(r, RING, size - RING), y: randInt(r, RING, size - RING), kind: 0 });
  const mid = size / 2;
  const byCenter = pts.map((p, i) => [Math.hypot(p.x - mid, p.y - mid), i]).sort((a, b) => a[0] - b[0]);
  const downtown = new Set(byCenter.slice(0, 3).map(e => e[1]));
  pts.forEach((p, i) => {
    const nearCoast = coasts.some(e => (e === 0 ? p.y : e === 1 ? size - p.x : e === 2 ? size - p.y : p.x) < 20);
    if (downtown.has(i)) p.kind = D.Downtown;
    else if (nearCoast) p.kind = D.Waterfront;
    else { const v = r(); p.kind = v < 0.5 ? D.Residential : v < 0.8 ? D.Industrial : D.Park; }
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) c.district[y * size + x] = pts[nearest(pts, x, y)].kind;
  return pts;
}

function nearest(pts: { x: number; y: number }[], x: number, y: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- roads

function planRoadLines(r: Rng, size: number, avoid: [number, number] | null): Line[] {
  const lines: Line[] = [{ pos: RING, w: 2, ring: true, avenue: false }];
  const last = size - RING - 2;
  let x = RING + 2, k = 0;
  for (;;) {
    x += randInt(r, 11, 16);
    const avenue = ++k % 3 === 0;
    const w = avenue ? 4 : 2;
    if (avoid && x + w > avoid[0] && x < avoid[1]) x = avoid[1];
    if (x + w > last - 12) break;
    lines.push({ pos: x, w, ring: false, avenue });
    x += w;
  }
  lines.push({ pos: last, w: 2, ring: true, avenue: false });
  return lines;
}

/** Segment keys: `v:i:j` = vertical line i between horizontal lines j and j+1; `h:j:i` likewise. */
function pruneSegments(vx: Line[], hy: Line[], r: Rng): Set<string> {
  const kept = new Set<string>();
  for (let i = 0; i < vx.length; i++) for (let j = 0; j < hy.length - 1; j++) kept.add(`v:${i}:${j}`);
  for (let j = 0; j < hy.length; j++) for (let i = 0; i < vx.length - 1; i++) kept.add(`h:${j}:${i}`);
  const degree = (i: number, j: number) =>
    +kept.has(`v:${i}:${j - 1}`) + +kept.has(`v:${i}:${j}`) + +kept.has(`h:${j}:${i - 1}`) + +kept.has(`h:${j}:${i}`);
  const candidates = [...kept].filter(k => {
    const [t, a] = k.split(':');
    const line = t === 'v' ? vx[+a] : hy[+a];
    return !line.ring && !line.avenue;
  });
  for (const key of candidates) {
    if (!chance(r, 0.15)) continue;
    const [t, a, b] = key.split(':');
    const ends: [number, number][] = t === 'v' ? [[+a, +b], [+a, +b + 1]] : [[+b, +a], [+b + 1, +a]];
    kept.delete(key);
    const ok = ends.every(([i, j]) => degree(i, j) >= 2) && connected(kept, vx.length);
    if (!ok) kept.add(key);
  }
  return kept;
}

function connected(kept: Set<string>, nv: number): boolean {
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const k of kept) {
    const [t, a, b] = k.split(':');
    if (t === 'v') link(+b * nv + +a, (+b + 1) * nv + +a);
    else link(+a * nv + +b, +a * nv + +b + 1);
  }
  const start = adj.keys().next().value;
  if (start === undefined) return false;
  const seen = new Set([start]);
  const q = [start];
  while (q.length) for (const nb of adj.get(q.pop()!)!) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  return seen.size === adj.size;
}

function paintLanes(c: City, vx: Line[], hy: Line[], kept: Set<string>) {
  const { size } = c;
  const paint = (x: number, y: number, dir: number) => {
    const i = y * size + x;
    c.tiles[i] = T.Road;
    c.height[i] = 0;
    c.roadDir[i] |= dir;
  };
  for (const k of kept) {
    const [t, a, b] = k.split(':');
    if (t === 'v') {
      const L = vx[+a], y0 = hy[+b].pos, y1 = hy[+b + 1].pos + hy[+b + 1].w - 1;
      for (let y = y0; y <= y1; y++)
        for (let dx = 0; dx < L.w; dx++) paint(L.pos + dx, y, dx < L.w / 2 ? DIR.S : DIR.N);
    } else {
      const L = hy[+a], x0 = vx[+b].pos, x1 = vx[+b + 1].pos + vx[+b + 1].w - 1;
      for (let x = x0; x <= x1; x++)
        for (let dy = 0; dy < L.w; dy++) paint(x, L.pos + dy, dy < L.w / 2 ? DIR.W : DIR.E);
    }
  }
}

function cleanFlags(c: City) {
  const { size } = c;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (c.tiles[i] !== T.Road) continue;
      for (const d of DIRS) {
        if (!(c.roadDir[i] & d)) continue;
        const [dx, dy] = DIR_VEC[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || c.tiles[ny * size + nx] !== T.Road) c.roadDir[i] &= ~d;
      }
    }
}

function addSidewalks(c: City) {
  const { size } = c;
  const mark: number[] = [];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const t = c.tiles[i];
      if (t === T.Road || t === T.Water) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1; dx++) if (c.tiles[(y + dy) * size + x + dx] === T.Road) { near = true; break; }
      if (near) mark.push(i);
    }
  for (const i of mark) c.tiles[i] = T.Sidewalk;
}

// ---------------------------------------------------------------- blocks

function fillOutskirts(c: City, r: Rng): Uint8Array {
  const { size } = c;
  const mask = new Uint8Array(size * size);
  const lo = RING - 2, hi = size - RING + 1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (x > lo && x < hi && y > lo && y < hi) continue;
      const i = y * size + x;
      mask[i] = 1;
      if (c.tiles[i] === T.Grass && chance(r, 0.35)) c.tiles[i] = T.Tree;
    }
  return mask;
}

function fillBlocks(c: City, r: Rng, excluded: Uint8Array) {
  const { size } = c;
  const block = new Int32Array(size * size).fill(-1);
  let id = 0;
  for (let s = 0; s < size * size; s++) {
    if (block[s] !== -1 || excluded[s] || c.tiles[s] !== T.Grass) continue;
    const cells: number[] = [];
    const q = [s];
    block[s] = id;
    let x0 = size, y0 = size, x1 = 0, y1 = 0;
    while (q.length) {
      const i = q.pop()!;
      cells.push(i);
      const x = i % size, y = (i / size) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const d of DIRS) {
        const [dx, dy] = DIR_VEC[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        if (block[j] === -1 && !excluded[j] && c.tiles[j] === T.Grass) { block[j] = id; q.push(j); }
      }
    }
    const cxy = ((y0 + y1) >> 1) * size + ((x0 + x1) >> 1);
    const district = c.district[block[cxy] === id ? cxy : cells[0]];
    const set = (x: number, y: number, t: number, h = 0) => {
      const i = y * size + x;
      if (block[i] !== id) return;
      c.tiles[i] = t;
      c.height[i] = h;
    };
    fillBlock(r, district, x0, y0, x1, y1, set);
    id++;
  }
}

type Setter = (x: number, y: number, t: number, h?: number) => void;

function lots(r: Rng, x0: number, y0: number, x1: number, y1: number, max: number, out: number[][] = []): number[][] {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w > max && w >= h) {
    const s = x0 + randInt(r, Math.max(1, Math.floor(w / 3)), Math.max(1, Math.ceil((2 * w) / 3)) - 1);
    lots(r, x0, y0, s - 1, y1, max, out); lots(r, s, y0, x1, y1, max, out);
  } else if (h > max) {
    const s = y0 + randInt(r, Math.max(1, Math.floor(h / 3)), Math.max(1, Math.ceil((2 * h) / 3)) - 1);
    lots(r, x0, y0, x1, s - 1, max, out); lots(r, x0, s, x1, y1, max, out);
  } else out.push([x0, y0, x1, y1]);
  return out;
}

function rect(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
}

function fillBlock(r: Rng, district: number, x0: number, y0: number, x1: number, y1: number, set: Setter) {
  switch (district) {
    case D.Downtown:
      for (const [a, b, c2, d] of lots(r, x0, y0, x1, y1, 6)) {
        if (chance(r, 0.1)) rect(a, b, c2, d, (x, y) => set(x, y, T.Plaza));
        else { const h = randInt(r, 3, 6); rect(a, b, c2, d, (x, y) => set(x, y, T.Building, h)); }
      }
      break;
    case D.Residential:
      for (const [a, b, c2, d] of lots(r, x0, y0, x1, y1, 4)) {
        const h = randInt(r, 1, 2);
        const side = randInt(r, 0, 3);
        rect(a, b, c2, d, (x, y) => {
          const garden = (side === 0 && y === b) || (side === 1 && x === c2) || (side === 2 && y === d) || (side === 3 && x === a);
          if (garden && c2 > a && d > b) set(x, y, chance(r, 0.2) ? T.Tree : T.Grass);
          else set(x, y, T.Building, h);
        });
      }
      break;
    case D.Industrial:
      for (const [a, b, c2, d] of lots(r, x0, y0, x1, y1, 8)) {
        if (chance(r, 0.25)) rect(a, b, c2, d, (x, y) => set(x, y, T.Parking));
        else { const h = randInt(r, 1, 3); rect(a, b, c2, d, (x, y) => set(x, y, T.Building, h)); }
      }
      break;
    case D.Park: {
      const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
      rect(x0, y0, x1, y1, (x, y) => {
        if (x === mx || y === my) set(x, y, T.Plaza);
        else if (chance(r, 0.15)) set(x, y, T.Tree);
      });
      break;
    }
    default: // Waterfront
      for (const [a, b, c2, d] of lots(r, x0, y0, x1, y1, 6)) {
        const v = r();
        if (v < 0.4) { const h = randInt(r, 1, 2); rect(a, b, c2, d, (x, y) => set(x, y, T.Building, h)); }
        else if (v < 0.7) rect(a, b, c2, d, (x, y) => set(x, y, T.Parking));
        else rect(a, b, c2, d, (x, y) => set(x, y, T.Plaza));
      }
  }
}

function fillBorder(c: City) {
  const { size } = c;
  for (let i = 0; i < size; i++)
    for (const [x, y] of [[i, 0], [0, i], [i, size - 1], [size - 1, i]]) {
      const k = y * size + x;
      if (c.tiles[k] !== T.Water) { c.tiles[k] = T.Tree; c.roadDir[k] = 0; c.height[k] = 0; }
    }
}

// ---------------------------------------------------------------- gangs, start

function assignGangs(c: City, r: Rng, pts: Pt[]) {
  const cand = pts.filter(p => p.kind !== D.Park);
  const pool = cand.length >= 3 ? cand : pts;
  let best: Pt[] = pool.slice(0, 3), bestScore = -1;
  for (let a = 0; a < pool.length; a++)
    for (let b = a + 1; b < pool.length; b++)
      for (let d = b + 1; d < pool.length; d++) {
        const P = [pool[a], pool[b], pool[d]];
        const s = Math.min(dist(P[0], P[1]), dist(P[0], P[2]), dist(P[1], P[2]));
        if (s > bestScore) { bestScore = s; best = P; }
      }
  const { size } = c;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) c.gangZone[y * size + x] = nearest(best, x, y);
  const names = gangNames(r);
  c.gangs = [0, 1, 2].map(i => ({ id: i, name: names[i], color: GANG_COLORS[i], carModel: pick(r, GANG_CARS) }));
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function pickStart(c: City) {
  const { size } = c;
  const taken = new Set(c.landmarks.map(l => l.ty * size + l.tx));
  const mid = size / 2;
  let best = -1, bd = Infinity;
  for (let i = 0; i < size * size; i++) {
    if (c.tiles[i] !== T.Sidewalk || taken.has(i)) continue;
    const d = (i % size - mid) ** 2 + (((i / size) | 0) - mid) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  c.startX = (best % size) * TILE + TILE / 2;
  c.startY = ((best / size) | 0) * TILE + TILE / 2;
}
