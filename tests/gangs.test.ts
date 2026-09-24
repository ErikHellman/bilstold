import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { killPed } from '../src/sim/ped';
import { changeRespect } from '../src/game/gangs';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const arena = () => {
  const c = testCity(120);
  c.gangs = [0, 1, 2].map(i => ({ id: i, name: `G${i}`, color: '#fff', carModel: 'sedan' as const }));
  const w = new World(c, 1); registerCoreSystems(w);
  w.player.x = 1900; w.player.y = 1900; w.systemsEnabled.spawner = false; w.systemsEnabled.wanted = false;
  return w;
};
const run = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(idle(), DT); };

test('killing gang members lowers their respect and raises rival respect', () => {
  const w = arena(); const g = w.spawnPed('gang', 2000, 1900, 0)!; g.gang = 0;
  killPed(w, g, w.player, 'pistol');
  expect(w.ps.respect[0]).toBe(-8); expect(w.ps.respect[1]).toBe(3);
});
test('respect is clamped', () => {
  const w = arena(); changeRespect(w, 2, -500); expect(w.ps.respect[2]).toBe(-100);
});
test('hostile gang in its zone attacks player', () => {
  const w = arena(); w.ps.respect[0] = -50;
  const g = w.spawnPed('gang', 2050, 1900, 0)!; g.gang = 0; g.ai.mode = 'wander';
  run(w, 1.5);
  expect(g.ai.mode).toBe('attack'); expect(g.ai.target).toBe(w.player);
});
test('attacking gang member hurts the player', () => {
  const w = arena(); w.ps.respect[0] = -50; w.systemsEnabled.death = false;
  const g = w.spawnPed('gang', 2050, 1900, 0)!; g.gang = 0; g.ai.mode = 'wander';
  run(w, 5);
  expect(w.player.health).toBeLessThan(100);
});
test('friendly gang ignores player', () => {
  const w = arena(); w.ps.respect[0] = 40;
  const g = w.spawnPed('gang', 2050, 1900, 0)!; g.gang = 0; g.ai.mode = 'wander';
  run(w, 2); expect(g.ai.mode).not.toBe('attack');
});
test('criminal steals a parked car', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 2300, 1900, 0, 0, true)!;
  const c = w.spawnPed('criminal', 2260, 1900, 0)!;
  c.ai.mode = 'stealCar'; c.ai.targetCar = v;
  run(w, 4); expect(v.driver).toBe(c);
});
test('mugger knocks down a civilian', () => {
  const w = arena(); const victim = w.spawnPed('civ', 2300, 2000, 0)!; victim.ai.mode = 'idle';
  const m = w.spawnPed('criminal', 2260, 2000, 0)!; m.ai.mode = 'mug'; m.ai.target = victim;
  run(w, 4); expect(victim.health).toBeLessThan(100);
});
test('ambulance revives a corpse', () => {
  const w = arena(); const p = w.spawnPed('civ', 2000, 2000, 0)!; p.persistent = true;
  killPed(w, p, null, 'pistol');
  run(w, 45); expect(p.dead).toBe(false);
});
test('fire truck puts out a burning car', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 2000, 2000, 0, 0, true)!; v.persistent = true;
  v.burning = 3; v.health = 1;
  let trucks = 0;
  for (let i = 0; i < 60 * 30 && !v.wreck; i++) { w.step(idle(), DT); if (v.burning > 0) v.burning = Math.max(v.burning, 2); trucks = w.vehicles.items.filter(x => x.active && x.def.role === 'fire').length; if (v.burning <= 0) break; }
  expect(trucks).toBeGreaterThan(0); expect(v.burning).toBe(0); expect(v.wreck).toBe(false);
});
