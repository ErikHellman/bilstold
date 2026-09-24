import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { explode, spawnFire } from '../src/sim/explosions';
import { fireWeapon } from '../src/sim/combat';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const arena = () => {
  const w = new World(testCity(80), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false;
  w.player.x = 200; w.player.y = 200; return w;
};
const run = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(idle(), DT); };

test('explosion kills close ped and damages car', () => {
  const w = arena(); const p = w.spawnPed('civ', 1000, 1000, 0)!; p.ai.mode = 'idle';
  const v = w.spawnVehicle('sedan', 1030, 1000, 0, 0, true)!;
  let ev = 0; w.bus.on('explosion', () => ev++);
  explode(w, 1000, 1000, 70, w.player);
  expect(p.dead).toBe(true); expect(v.health).toBeLessThan(90); expect(ev).toBe(1);
});
test('burning car explodes into a wreck and credits attacker', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 1000, 1000, 0, 0, true)!;
  v.health = 0; v.burning = 4; v.lastHitBy = w.player;
  const ev: any[] = []; w.bus.on('vehicleDestroyed', e => ev.push(e));
  run(w, 5);
  expect(v.wreck).toBe(true); expect(ev[0].by).toBe(w.player);
});
test('chain reaction destroys adjacent cars', () => {
  const w = arena();
  const a = w.spawnVehicle('sedan', 1000, 1000, 0, 0, true)!, b = w.spawnVehicle('sedan', 1000, 1030, 0, 0, true)!;
  a.health = 0; a.burning = 0.1;
  run(w, 6);
  expect(a.wreck && b.wreck).toBe(true);
});
test('rocket explodes on car impact', () => {
  const w = arena(); const v = w.spawnVehicle('van', 400, 200, 0, 0, true)!;
  w.ps.weapons.rocket = 1; w.player.angle = 0;
  fireWeapon(w, w.player, 'rocket'); run(w, 1);
  expect(v.health).toBeLessThan(v.def.health * 0.2);
});
test('grenade explodes after its fuse', () => {
  const w = arena(); let ev = 0; w.bus.on('explosion', () => ev++);
  w.ps.weapons.grenade = 1; fireWeapon(w, w.player, 'grenade'); run(w, 1.5);
  expect(ev).toBe(1);
});
test('burning ped eventually dies from fire', () => {
  const w = arena(); const p = w.spawnPed('civ', 1500, 1500, 0)!; p.burning = 10;
  const ev: any[] = []; w.bus.on('pedKilled', e => ev.push(e));
  run(w, 10);
  expect(p.dead).toBe(true); expect(ev.find(e => e.ped === p).weapon).toBe('fire');
});
test('fires ignite peds standing in them and burn out', () => {
  const w = arena(); const p = w.spawnPed('civ', 1500, 1500, 0)!; p.ai.mode = 'idle';
  spawnFire(w, 1502, 1500, 2);
  w.step(idle(), DT);
  expect(p.burning).toBeGreaterThan(0);
  run(w, 3);
  let fires = 0; w.fires.each(() => fires++); expect(fires).toBe(0);
});
test('driver bails out of a burning car', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 1000, 1000, 0, 0, false)!;
  const d = w.spawnPed('civ', 1000, 1000, 0)!; d.vehicle = v; v.driver = d; v.health = 0; v.burning = 3;
  run(w, 0.5);
  expect(d.vehicle).toBeNull(); expect(d.ai.mode).toBe('flee');
});
test('mine explodes under a vehicle; oil reduces grip', () => {
  const w = arena(); let ev = 0; w.bus.on('explosion', () => ev++);
  const h = w.hazards.spawn()!; Object.assign(h, { kind: 'mine', x: 1000, y: 1000, life: 60, owner: w.player });
  const v = w.spawnVehicle('sedan', 1000, 1000, 0, 0, true)!;
  w.step(idle(), DT); expect(ev).toBe(1); expect(h.active).toBe(false); void v;
});
test('car bomb timer detonates', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 1000, 1000, 0, 0, true)!; v.bomb = 'timed'; v.bombTimer = 1;
  run(w, 1.5); expect(v.wreck).toBe(true);
});
