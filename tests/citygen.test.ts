import { generateCity, type City } from '../src/world/citygen';
import { T, DIR_VEC, OPPOSITE, isWalkable } from '../src/world/tiles';
import { findWalkableNear, tileAtWorld, landmarksOf } from '../src/world/query';
import { TILE } from '../src/core/const';
import { hashString } from '../src/core/rng';

const SEEDS = [1, 2, 3, 42, 1337, hashString('Bilstöld'), 99999, 123456789];

function roadTiles(c: City) {
  const r: number[] = [];
  c.tiles.forEach((t, i) => t === T.Road && r.push(i));
  return r;
}
function reach(c: City, from: number, reverse: boolean) {
  const seen = new Uint8Array(c.tiles.length);
  const q = [from]; seen[from] = 1; let n = 1;
  while (q.length) {
    const i = q.pop()!; const x = i % c.size, y = (i / c.size) | 0;
    for (const d of [1, 2, 4, 8]) {
      const [dx, dy] = DIR_VEC[d];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= c.size || ny >= c.size) continue;
      const j = ny * c.size + nx;
      if (seen[j] || c.tiles[j] !== T.Road) continue;
      const ok = reverse ? (c.roadDir[j] & OPPOSITE[d]) !== 0 : (c.roadDir[i] & d) !== 0;
      if (ok) { seen[j] = 1; n++; q.push(j); }
    }
  }
  return n;
}

test('deterministic per seed and index', () => {
  const a = generateCity(42, 1), b = generateCity(42, 1), c = generateCity(42, 2);
  expect(a.tiles).toEqual(b.tiles); expect(a.height).toEqual(b.height); expect(a.roadDir).toEqual(b.roadDir);
  expect(a.landmarks).toEqual(b.landmarks); expect(a.gangs).toEqual(b.gangs);
  expect(a.tiles).not.toEqual(c.tiles);
});
test.each(SEEDS)('road network is valid and strongly connected (seed %i)', seed => {
  const c = generateCity(seed, 1); const roads = roadTiles(c);
  expect(roads.length).toBeGreaterThan(2000);
  for (const i of roads) {
    expect(c.roadDir[i]).not.toBe(0);
    const x = i % c.size, y = (i / c.size) | 0;
    for (const d of [1, 2, 4, 8]) if (c.roadDir[i] & d) {
      const [dx, dy] = DIR_VEC[d];
      expect(c.tiles[(y + dy) * c.size + x + dx]).toBe(T.Road);
    }
  }
  expect(reach(c, roads[0], false)).toBe(roads.length);
  expect(reach(c, roads[0], true)).toBe(roads.length);
});
test.each(SEEDS)('landmarks, border and start are sane (seed %i)', seed => {
  const c = generateCity(seed, 1);
  const count = (k: string) => c.landmarks.filter(l => l.kind === k).length;
  expect(count('hospital')).toBe(2); expect(count('police')).toBe(3); expect(count('respray')).toBe(3);
  expect(count('bomb')).toBe(1); expect(count('crusher')).toBe(1); expect(count('garage')).toBe(3);
  expect(count('gangHQ')).toBe(3); expect(count('payphone')).toBe(24);
  for (const l of c.landmarks) expect(c.tiles[l.ty * c.size + l.tx]).toBe(T.Sidewalk);
  for (const l of landmarksOf(c, 'gangHQ')) expect(c.gangZone[l.ty * c.size + l.tx]).toBe(l.gang);
  for (const l of landmarksOf(c, 'payphone')) if (l.gang >= 0) expect(c.gangZone[l.ty * c.size + l.tx]).toBe(l.gang);
  for (let i = 0; i < c.size; i++) for (const [x, y] of [[i, 0], [0, i], [i, c.size - 1], [c.size - 1, i]]) {
    const t = c.tiles[y * c.size + x];
    expect(t === T.Tree || t === T.Water).toBe(true);
  }
  expect(isWalkable(tileAtWorld(c, c.startX, c.startY))).toBe(true);
  expect(new Set(c.gangs.map(g => g.name)).size).toBe(3);
  expect(c.tiles.includes(T.Building)).toBe(true);
});
test('findWalkableNear escapes buildings and water', () => {
  const c = generateCity(7, 1); const b = c.tiles.indexOf(T.Building); const w = c.tiles.indexOf(T.Water);
  for (const i of [b, w]) {
    const p = findWalkableNear(c, (i % c.size) * TILE + 16, ((i / c.size) | 0) * TILE + 16);
    expect(isWalkable(tileAtWorld(c, p.x, p.y))).toBe(true);
  }
});
test('generation is fast', () => {
  const t = performance.now(); generateCity(5, 1);
  expect(performance.now() - t).toBeLessThan(500);
});
