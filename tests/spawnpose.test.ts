import { createSession } from '../src/game/session';
import { generateCity, type City } from '../src/world/citygen';
import { isSolidWorld, landmarksOf, tileAtWorld } from '../src/world/query';
import { T, isSolid } from '../src/world/tiles';
import { DT, TILE } from '../src/core/const';
import { hashString } from '../src/core/rng';

const SEEDS = [1, 2, 3, 42, 1337, hashString('Bilstöld'), 99999, 123456789];
const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });

/** Distance from (x, y) to the nearest solid tile edge, searching 2 tiles around. */
function wallClearance(c: City, x: number, y: number): number {
  let best = Infinity;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!isSolidWorld(c, (tx + dx) * TILE + 1, (ty + dy) * TILE + 1)) continue;
    const x0 = (tx + dx) * TILE, y0 = (ty + dy) * TILE;
    const cx = Math.max(x0, Math.min(x, x0 + TILE)), cy = Math.max(y0, Math.min(y, y0 + TILE));
    best = Math.min(best, Math.hypot(x - cx, y - cy));
  }
  return best;
}

/** Faces straight away from a building: the tile behind is solid, the tile ahead is not. */
function facesAwayFromBuilding(c: City, x: number, y: number, angle: number) {
  const fx = Math.round(Math.cos(angle)), fy = Math.round(Math.sin(angle));
  expect(Math.abs(fx) + Math.abs(fy)).toBe(1); // cardinal
  expect(Math.abs(Math.cos(angle) - fx) + Math.abs(Math.sin(angle) - fy)).toBeLessThan(1e-9);
  expect(isSolid(tileAtWorld(c, x - fx * TILE, y - fy * TILE))).toBe(true);
  expect(isSolid(tileAtWorld(c, x + fx * TILE, y + fy * TILE))).toBe(false);
}

test.each(SEEDS)('new game starts on a sidewalk, clear of walls, facing away from a building (seed %i)', seed => {
  const c = generateCity(seed, 1);
  expect(tileAtWorld(c, c.startX, c.startY)).toBe(T.Sidewalk);
  expect(wallClearance(c, c.startX, c.startY)).toBeGreaterThanOrEqual(12);
  facesAwayFromBuilding(c, c.startX, c.startY, c.startAngle);
});

test('the player actually spawns with that pose', () => {
  const { world: w } = createSession('pose', 1);
  expect(w.player.x).toBe(w.city.startX); expect(w.player.y).toBe(w.city.startY); expect(w.player.angle).toBe(w.city.startAngle);
});

test.each([['wasted', 'hospital'], ['busted', 'police']] as const)('%s respawn stands outside the %s facing the street', (state, kind) => {
  const { world: w } = createSession('respawnpose', 1);
  w.systemsEnabled.spawner = false;
  w.player.angle = 2.345;
  if (state === 'wasted') { w.player.health = 0; w.player.dead = true; } else w.ps.deathState = 'busted';
  for (let i = 0; i < 4 * 60; i++) w.step(idle(), DT);
  const l = landmarksOf(w.city, kind).find(l => Math.hypot(l.tx * TILE + 16 - w.player.x, l.ty * TILE + 16 - w.player.y) < TILE)!;
  expect(l).toBeTruthy();
  expect(wallClearance(w.city, w.player.x, w.player.y)).toBeGreaterThanOrEqual(12);
  facesAwayFromBuilding(w.city, w.player.x, w.player.y, w.player.angle);
});
