import { createSession } from '../src/game/session';
import { T, isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';
import { DT, CAP_PEDS, CAP_VEHICLES, CAP_PARKED } from '../src/core/const';
import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { DIR } from '../src/world/tiles';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });

test('spawner populates the city within caps', () => {
  const w = createSession('populate', 1).world;
  for (let i = 0; i < 600; i++) w.step(idle(), DT);
  const moving = w.vehicles.items.filter(v => v.active && !v.parked).length;
  const parked = w.vehicles.items.filter(v => v.active && v.parked).length;
  expect(w.peds.count).toBeGreaterThan(15); expect(w.peds.count).toBeLessThanOrEqual(CAP_PEDS);
  expect(moving).toBeGreaterThan(8); expect(moving).toBeLessThanOrEqual(CAP_VEHICLES);
  expect(parked).toBeLessThanOrEqual(CAP_PARKED);
});
test('traffic follows roads and makes progress', () => {
  const w = createSession('traffic', 1).world;
  for (let i = 0; i < 60; i++) w.step(idle(), DT);
  const v = w.vehicles.items.find(v => v.active && !v.parked && v.driver)!;
  v.persistent = true;
  let onRoad = 0, dist = 0, px = v.x, py = v.y;
  const N = 3600;
  for (let i = 0; i < N; i++) {
    w.step(idle(), DT);
    w.player.x = v.x; w.player.y = v.y + 200;
    if (tileAtWorld(w.city, v.x, v.y) === T.Road) onRoad++;
    dist += Math.hypot(v.x - px, v.y - py); px = v.x; py = v.y;
  }
  expect(onRoad / N).toBeGreaterThan(0.9);
  expect(dist).toBeGreaterThan(2500);
});
test('traffic stops behind a stationary car', () => {
  const c = testCity(60); c.roadDir.fill(DIR.E);
  const w = new World(c, 1); registerCoreSystems(w); w.systemsEnabled.spawner = false;
  w.player.x = 100; w.player.y = 100;
  const block = w.spawnVehicle('van', 1200, 1000, 0, 0, true)!;
  const car = w.spawnVehicle('sedan', 700, 1000, 0, 0, false)!;
  const d = w.spawnPed('civ', car.x, car.y, 0)!; d.vehicle = car; car.driver = d; car.ai.mode = 'cruise'; car.ai.dir = DIR.E;
  car.persistent = true; block.persistent = true;
  for (let i = 0; i < 600; i++) w.step(idle(), DT);
  expect(car.x).toBeLessThan(block.x - 40);
  expect(block.health).toBe(block.def.health);
});
test('pedestrians flee from gunshots', () => {
  const w = createSession('flee', 1).world;
  for (let i = 0; i < 120; i++) w.step(idle(), DT);
  const p = w.peds.items.find(p => p.active && p !== w.player && p.kind === 'civ' && !p.vehicle)!;
  const sx = p.x + 20, sy = p.y;
  w.bus.emit('shot', { x: sx, y: sy, weapon: 'pistol', byPlayer: true });
  w.step(idle(), DT);
  expect(p.ai.mode).toBe('flee');
  for (let i = 0; i < 60; i++) w.step(idle(), DT);
  expect(Math.hypot(p.x - sx, p.y - sy)).toBeGreaterThan(40);
});
test('peds never end up inside solids', () => {
  const w = createSession('solid', 1).world;
  for (let i = 0; i < 1200; i++) {
    w.step(idle(), DT);
    if (i % 60 === 0) w.peds.each(p => {
      if (p.vehicle || p.dead) return;
      const t = tileAtWorld(w.city, p.x, p.y);
      expect(isWalkable(t) || t === T.Water).toBe(true);
    });
  }
});
