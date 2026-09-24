import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { applyPickup, placePickups } from '../src/game/pickups';
import { addPoints } from '../src/game/score';
import { killPed } from '../src/sim/ped';
import { generateCity } from '../src/world/citygen';
import { isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const arena = () => { const w = new World(testCity(60), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false; return w; };

test('weapon pickup adds capped ammo and selects weapon', () => {
  const w = arena(); applyPickup(w, 'w_pistol');
  expect(w.ps.weapons.pistol).toBe(30); expect(w.ps.current).toBe('pistol');
  for (let i = 0; i < 10; i++) applyPickup(w, 'w_pistol');
  expect(w.ps.weapons.pistol).toBe(99);
});
test('health, armor, life, multiplier, jail card', () => {
  const w = arena(); w.player.health = 20;
  applyPickup(w, 'health'); applyPickup(w, 'armor'); applyPickup(w, 'life'); applyPickup(w, 'multiplier'); applyPickup(w, 'jailFree');
  expect(w.player.health).toBe(100); expect(w.player.armor).toBe(100); expect(w.ps.lives).toBe(5);
  expect(w.ps.multiplier).toBe(2); expect(w.ps.jailFree).toBe(true);
});
test('bribe lowers wanted level', () => {
  const w = arena(); w.ps.wanted.level = 3; applyPickup(w, 'bribe'); expect(w.ps.wanted.level).toBe(2);
});
test('power-ups expire', () => {
  const w = arena(); applyPickup(w, 'doubleDamage');
  expect(w.ps.powerups.doubleDamage).toBeCloseTo(30);
  for (let i = 0; i < 31 * 60; i++) w.step(idle(), DT);
  expect(w.ps.powerups.doubleDamage).toBe(0);
});
test('multiplier affects points', () => {
  const w = arena(); w.ps.multiplier = 3; addPoints(w, 10); expect(w.ps.score).toBe(30);
});
test('killing peds scores points', () => {
  const w = arena(); const c = w.spawnPed('civ', 100, 100, 0)!; const cop = w.spawnPed('cop', 120, 100, 0)!;
  killPed(w, c, w.player, 'pistol'); killPed(w, cop, w.player, 'pistol');
  expect(w.ps.score).toBe(60); expect(w.ps.kills).toBe(2);
});
test('pickup placement is deterministic and on walkable tiles', () => {
  const c = generateCity(11, 1); const a = placePickups(c), b = placePickups(c);
  expect(a).toEqual(b); expect(a.length).toBe(70);
  for (const p of a) expect(isWalkable(tileAtWorld(c, p.x, p.y))).toBe(true);
  expect(a.filter(p => p.kind.startsWith('c_')).length).toBe(6);
});
test('collecting by walking over', () => {
  const w = arena(); w.player.x = 300; w.player.y = 300;
  const pk = w.pickups.spawn()!; Object.assign(pk, { kind: 'armor', x: 305, y: 300, respawn: 0, fixed: true });
  w.step(idle(), DT);
  expect(w.player.armor).toBe(100); expect(pk.active).toBe(false);
});
test('car weapon crates only work in a car', () => {
  const w = arena(); w.player.x = 300; w.player.y = 300;
  const pk = w.pickups.spawn()!; Object.assign(pk, { kind: 'c_mg', x: 305, y: 300, respawn: 0, fixed: true });
  w.step(idle(), DT); expect(pk.active).toBe(true);
  const v = w.spawnVehicle('sedan', 300, 300, 0, 0, false)!; w.player.vehicle = v; v.driver = w.player;
  w.step(idle(), DT); expect(pk.active).toBe(false); expect(v.carWeapon).toBe('carMG'); expect(v.carAmmo).toBe(200);
});
