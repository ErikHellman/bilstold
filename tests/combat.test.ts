import { PLAYER_MAX_HEALTH } from '../src/core/const';
import { testCity, setTile } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { fireWeapon, damagePed } from '../src/sim/combat';
import { T } from '../src/world/tiles';
import { DT, TILE } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
function arena() {
  const w = new World(testCity(60), 1); registerCoreSystems(w);
  w.systemsEnabled.spawner = false;
  w.player.x = 400; w.player.y = 400; w.player.angle = 0;
  return w;
}
const civAt = (w: World, x: number, y: number) => { const p = w.spawnPed('civ', x, y, 0)!; p.ai.mode = 'idle'; return p; };
const projCount = (w: World) => { let n = 0; w.projectiles.each(() => n++); return n; };

test('pistol kills a civilian in at most 4 hits and uses ammo', () => {
  const w = arena(); w.ps.weapons.pistol = 10; w.ps.current = 'pistol';
  const p = civAt(w, 500, 400);
  const i = idle(); i.fire = true;
  for (let n = 0; n < 150 && !p.dead; n++) w.step(i, DT);
  expect(p.dead).toBe(true); expect(w.ps.weapons.pistol!).toBeGreaterThanOrEqual(6);
});
test('cooldown limits fire rate', () => {
  const w = arena(); w.ps.weapons.pistol = 99; w.ps.current = 'pistol';
  const i = idle(); i.fire = true;
  for (let n = 0; n < 60; n++) w.step(i, DT);
  expect(99 - w.ps.weapons.pistol!).toBeLessThanOrEqual(3);
  expect(99 - w.ps.weapons.pistol!).toBeGreaterThanOrEqual(2);
});
test('bullets stop at walls', () => {
  const w = arena(); for (let y = 0; y < 60; y++) setTile(w.city, 14, y, T.Building);
  const p = civAt(w, 15.5 * TILE + 20, 400);
  w.ps.weapons.pistol = 99; w.ps.current = 'pistol';
  const i = idle(); i.fire = true;
  for (let n = 0; n < 120; n++) w.step(i, DT);
  expect(p.health).toBe(100);
});
test('shotgun fires multiple pellets', () => {
  const w = arena(); const before = projCount(w);
  w.ps.weapons.shotgun = 5;
  expect(fireWeapon(w, w.player, 'shotgun')).toBe(true);
  expect(projCount(w) - before).toBe(6);
});
test('no ammo, no shot', () => {
  const w = arena(); w.ps.weapons.pistol = 0;
  expect(fireWeapon(w, w.player, 'pistol')).toBe(false);
});
test('armor absorbs damage first, invulnerability blocks it', () => {
  const w = arena(); w.difficulty = 'hard'; w.player.armor = 30; // hard: no damage scaling
  damagePed(w, w.player, 20, null, 'pistol');
  expect(w.player.health).toBe(PLAYER_MAX_HEALTH); expect(w.player.armor).toBe(10);
  w.ps.powerups.invuln = 5;
  damagePed(w, w.player, 50, null, 'pistol');
  expect(w.player.health).toBe(PLAYER_MAX_HEALTH);
});
test('double damage doubles player damage', () => {
  const w = arena(); const p = civAt(w, 500, 400); w.ps.powerups.doubleDamage = 5;
  damagePed(w, p, 20, w.player, 'pistol');
  expect(p.health).toBe(60);
});
test('fists damage and knock', () => {
  const w = arena(); const p = civAt(w, 410, 400);
  fireWeapon(w, w.player, 'fists');
  expect(p.health).toBeLessThan(100); expect(p.knocked).toBeGreaterThan(0);
});
test('bullets damage vehicles', () => {
  const w = arena(); const v = w.spawnVehicle('sedan', 520, 400, 0, 0, true)!;
  w.ps.weapons.smg = 50; w.ps.current = 'smg';
  const i = idle(); i.fire = true;
  for (let n = 0; n < 60; n++) w.step(i, DT);
  expect(v.health).toBeLessThan(v.def.health); expect(v.lastHitBy).toBe(w.player);
});
test('weapon cycling skips empty weapons', () => {
  const w = arena(); w.ps.weapons.smg = 10; w.ps.weapons.pistol = 0;
  const i = idle(); i.pressed.add('weaponNext'); w.step(i, DT);
  expect(w.ps.current).toBe('smg');
  const j = idle(); j.pressed.add('weaponNext'); w.step(j, DT);
  expect(w.ps.current).toBe('fists');
});
test('shots emit shot events for panic', () => {
  const w = arena(); let shots = 0; w.bus.on('shot', () => shots++);
  w.ps.weapons.pistol = 5; fireWeapon(w, w.player, 'pistol');
  expect(shots).toBe(1);
});
