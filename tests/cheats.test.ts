import { CAP_VEHICLES } from '../src/core/const';
import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { giveWeapon, refillAmmo, setGodMode, spawnCarNear, givePowerup } from '../src/game/cheats';
import { damagePed } from '../src/sim/combat';
import { killPed } from '../src/sim/ped';
import { isSolidWorld } from '../src/world/query';
import { CheatCode, CHEAT_CODE } from '../src/input/cheatcode';

const arena = () => { const w = new World(testCity(60), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false; return w; };

test('giveWeapon fills ammo to max and selects a foot weapon', () => {
  const w = arena();
  expect(giveWeapon(w, 'rocket')).toBe(true);
  expect(w.ps.weapons.rocket).toBe(20);
  expect(w.ps.current).toBe('rocket');
});

test('car weapons need a car', () => {
  const w = arena();
  expect(giveWeapon(w, 'carMG')).toBe(false);
  const v = w.spawnVehicle('sedan', w.player.x + 40, w.player.y, 0, 0, false)!;
  w.player.vehicle = v; v.driver = w.player;
  expect(giveWeapon(w, 'carMG')).toBe(true);
  expect(v.carWeapon).toBe('carMG');
  expect(v.carAmmo).toBe(999);
});

test('refillAmmo tops up owned weapons only', () => {
  const w = arena();
  w.ps.weapons.pistol = 3;
  refillAmmo(w);
  expect(w.ps.weapons.pistol).toBe(99);
  expect(w.ps.weapons.smg).toBeUndefined();
});

test('invulnerability power-up is handed out like a crate', () => {
  const w = arena();
  givePowerup(w, 'invuln');
  expect(w.ps.powerups.invuln).toBeGreaterThan(0);
});

test('god mode blocks damage and death', () => {
  const w = arena(), p = w.player, hp = p.health;
  setGodMode(w, true);
  damagePed(w, p, 500, null, 'pistol');
  killPed(w, p, null, 'water');
  expect(p.health).toBe(hp);
  expect(p.dead).toBe(false);
  setGodMode(w, false);
  damagePed(w, p, 50, null, 'pistol');
  expect(p.health).toBeLessThan(hp);
});

test('spawnCarNear places the requested model on free ground next to the player', () => {
  const w = arena(), p = w.player;
  const v = spawnCarNear(w, 'tank')!;
  expect(v).not.toBeNull();
  expect(v.model).toBe('tank');
  const d = Math.hypot(v.x - p.x, v.y - p.y);
  expect(d).toBeGreaterThan(v.def.width / 2);
  expect(d).toBeLessThan(120);
  expect(isSolidWorld(w.city, v.x, v.y)).toBe(false);
  expect(v.driver).toBeNull();
});

test('spawnCarNear makes room when traffic is at its cap', () => {
  const w = arena(), p = w.player;
  for (let i = 0; i < CAP_VEHICLES; i++) w.spawnVehicle('compact', p.x + 400 + (i % 5) * 50, p.y + 300 + Math.floor(i / 5) * 30, 0, 0, false);
  expect(w.countVehicles(false)).toBe(CAP_VEHICLES);
  const v = spawnCarNear(w, 'sports');
  expect(v?.model).toBe('sports');
  expect(w.countVehicles(false)).toBe(CAP_VEHICLES);
});

function key(t: EventTarget, code: string, extra: object = {}) {
  const e = new Event('keydown') as any;
  e.code = code;
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(e, k, { value: v });
  t.dispatchEvent(e);
}

test('the cheat code unlocks once per full sequence', () => {
  const t = new EventTarget(); let n = 0;
  new CheatCode(t, () => n++);
  for (const c of CHEAT_CODE.slice(0, -1)) key(t, c);
  expect(n).toBe(0);
  key(t, 'KeyA');
  expect(n).toBe(1);
  for (const c of CHEAT_CODE) key(t, c);
  expect(n).toBe(2);
});

test('a wrong key resets the cheat code, repeats and text fields are ignored', () => {
  const t = new EventTarget(); let n = 0;
  new CheatCode(t, () => n++);
  key(t, 'ArrowUp'); key(t, 'ArrowUp'); key(t, 'KeyX');
  for (const c of CHEAT_CODE.slice(2)) key(t, c);
  expect(n).toBe(0);
  // ↑ ↑ ↑ still counts as a fresh start on the extra ↑
  key(t, 'ArrowUp');
  for (const c of CHEAT_CODE) key(t, c);
  expect(n).toBe(1);
  for (const c of CHEAT_CODE) key(t, c, { repeat: true });
  for (const c of CHEAT_CODE) key(t, c, { target: { tagName: 'INPUT' } });
  expect(n).toBe(1);
});
