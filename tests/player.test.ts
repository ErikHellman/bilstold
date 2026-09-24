import { testCity, setTile } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems, createSession } from '../src/game/session';
import { T, isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';
import { DT, TILE, CAP_PARKED } from '../src/core/const';
import type { InputState } from '../src/input/input';

const idle = (): InputState => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() });
function world(c = testCity(40)) {
  const w = new World(c, 1); registerCoreSystems(w);
  w.player.x = 10 * TILE; w.player.y = 10 * TILE;
  return w;
}

test('player walks forward and is stopped by walls', () => {
  const c = testCity(40); for (let y = 0; y < 40; y++) setTile(c, 13, y, T.Building);
  const w = world(c);
  const i = idle(); i.accel = 1;
  for (let n = 0; n < 240; n++) w.step(i, DT);
  expect(w.player.x).toBeGreaterThan(11 * TILE); expect(w.player.x).toBeLessThan(13 * TILE);
});
test('steering turns the player', () => {
  const w = world(); const i = idle(); i.steer = 1;
  for (let n = 0; n < 30; n++) w.step(i, DT);
  expect(w.player.angle).toBeGreaterThan(1);
});
test('enter nearest car, drive, exit onto walkable tile', () => {
  const w = world(); const v = w.spawnVehicle('sedan', 10 * TILE + 30, 10 * TILE, 0, 0, true)!;
  const i = idle(); i.pressed.add('enter'); w.step(i, DT);
  for (let n = 0; n < 90 && !w.player.vehicle; n++) w.step(idle(), DT);
  expect(w.player.vehicle).toBe(v); expect(v.driver).toBe(w.player); expect(v.parked).toBe(false);
  const g = idle(); g.accel = 1;
  for (let n = 0; n < 60; n++) w.step(g, DT);
  expect(v.x).toBeGreaterThan(10 * TILE + 60);
  expect(w.player.x).toBeCloseTo(v.x);
  const e = idle(); e.pressed.add('enter'); w.step(e, DT);
  expect(w.player.vehicle).toBeNull(); expect(v.driver).toBeNull();
  expect(isWalkable(tileAtWorld(w.city, w.player.x, w.player.y))).toBe(true);
});
test('exit between two walls still lands on walkable ground', () => {
  const c = testCity(40); for (let x = 0; x < 40; x++) { setTile(c, x, 9, T.Building); setTile(c, x, 11, T.Building); }
  const w = world(c); const v = w.spawnVehicle('sedan', 10 * TILE, 10 * TILE + 16, 0, 0, true)!;
  w.player.vehicle = v; v.driver = w.player;
  const e = idle(); e.pressed.add('enter'); w.step(e, DT);
  expect(isWalkable(tileAtWorld(c, w.player.x, w.player.y))).toBe(true);
});
test('carjacking ejects the driver', () => {
  const w = world(); const v = w.spawnVehicle('sedan', 10 * TILE + 30, 10 * TILE, 0, 0, false)!;
  const d = w.spawnPed('civ', v.x, v.y, 0)!; d.vehicle = v; v.driver = d;
  const i = idle(); i.pressed.add('enter'); w.step(i, DT);
  for (let n = 0; n < 90 && !w.player.vehicle; n++) w.step(idle(), DT);
  expect(v.driver).toBe(w.player); expect(d.vehicle).toBeNull(); expect(['flee', 'attack']).toContain(d.ai.mode);
});
test('moving cancels an enter approach', () => {
  const w = world(); w.spawnVehicle('sedan', 10 * TILE + 40, 10 * TILE, 0, 0, true);
  const i = idle(); i.pressed.add('enter'); w.step(i, DT);
  const m = idle(); m.brake = 1; w.step(m, DT);
  for (let n = 0; n < 90; n++) w.step(idle(), DT);
  expect(w.player.vehicle).toBeNull();
});
test('walking into water drowns the player', () => {
  const c = testCity(40); for (let y = 0; y < 40; y++) for (let x = 12; x < 40; x++) setTile(c, x, y, T.Water, 0);
  const w = world(c); const i = idle(); i.accel = 1;
  for (let n = 0; n < 240; n++) w.step(i, DT);
  expect(w.player.health).toBeLessThanOrEqual(0);
});
test('spawn caps are separate for parked and moving vehicles', () => {
  const w = world(testCity(100));
  let parked = 0; while (w.spawnVehicle('sedan', 100 + parked * 50, 100, 0, 0, true)) parked++;
  expect(parked).toBe(CAP_PARKED);
  expect(w.spawnVehicle('sedan', 1000, 1000, 0, 0, false)).not.toBeNull();
});
test('createSession places the player at the city start', () => {
  const { world: w, seedString } = createSession('  Bilstöld ', 1);
  expect(seedString).toBe('Bilstöld');
  expect(w.player.x).toBe(w.city.startX); expect(w.player.kind).toBe('player');
});
