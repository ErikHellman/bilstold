import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
function setup(speed: number, model: any = 'sedan') {
  const w = new World(testCity(60), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false;
  w.player.x = 300; w.player.y = 1000;
  const v = w.spawnVehicle(model, 300, 1000, 0, 0, false)!;
  w.player.vehicle = v; v.driver = w.player; v.vx = speed;
  const p = w.spawnPed('civ', 380, 1000, 0)!; p.ai.mode = 'idle';
  const killed: any[] = []; w.bus.on('pedKilled', e => killed.push(e));
  let blood = 0; w.bus.on('blood', () => blood++);
  return { w, v, p, killed, blood: () => blood };
}

test('fast car kills pedestrian and credits driver', () => {
  const { w, p, killed, blood } = setup(320);
  const i = idle(); i.accel = 1;
  for (let n = 0; n < 30; n++) w.step(i, DT);
  expect(p.dead).toBe(true); expect(killed[0].by).toBe(w.player); expect(killed[0].weapon).toBe('car');
  expect(blood()).toBeGreaterThan(0);
});
test('medium speed knocks and hurts', () => {
  const { w, p, v } = setup(110);
  for (let n = 0; n < 60; n++) { v.vx = 110; v.vy = 0; w.step(idle(), DT); }
  expect(p.health).toBeLessThan(100);
});
test('slow car only pushes pedestrian', () => {
  const { w, p, v } = setup(30);
  let inside = 0;
  for (let n = 0; n < 240; n++) {
    v.vx = 30; v.vy = 0; w.step(idle(), DT);
    if (Math.abs(p.y - v.y) < v.def.width / 2 && Math.abs(p.x - v.x) < v.def.length / 2) inside++;
  }
  expect(p.dead).toBe(false); expect(p.health).toBe(100);
  expect(inside).toBe(0);
});
test('tank crushes at low speed', () => {
  const { w, p, v } = setup(40, 'tank');
  for (let n = 0; n < 90; n++) { v.vx = 40; v.vy = 0; w.step(idle(), DT); }
  expect(p.dead).toBe(true);
});
test('hit-and-run: rammed civilian driver reacts', () => {
  const w = new World(testCity(60), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false; w.systemsEnabled.ai = false;
  const mine = w.spawnVehicle('sedan', 300, 1000, 0, 0, false)!; w.player.vehicle = mine; mine.driver = w.player; mine.vx = 300;
  const other = w.spawnVehicle('sedan', 360, 1000, 0, 0, false)!; const d = w.spawnPed('civ', 360, 1000, 0)!; d.vehicle = other; other.driver = d;
  for (let n = 0; n < 20; n++) w.step(idle(), DT);
  expect(['flee', 'attack']).toContain(d.ai.mode);
});
