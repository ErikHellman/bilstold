import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { createSession, registerCoreSystems } from '../src/game/session';
import { armNpc, damagePed, fireWeapon } from '../src/sim/combat';
import { applyPickup } from '../src/game/pickups';
import { DIFFICULTY, type Difficulty } from '../src/game/difficulty';
import { writeSave, readSave, DEFAULT_SETTINGS, SAVE_KEY, type Store } from '../src/save/save';
import { DT, PLAYER_MAX_HEALTH } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) w.step(idle(), DT); };
function arena(difficulty: Difficulty = 'normal') {
  const w = new World(testCity(120), 1); registerCoreSystems(w);
  for (const k of ['spawner', 'wanted', 'police', 'gangs', 'criminals', 'emergency']) w.systemsEnabled[k] = false;
  w.difficulty = difficulty;
  w.player.x = 1900; w.player.y = 1900; w.player.angle = 0;
  return w;
}
const mem = (): Store & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
};

test('the player has 200 HP: new game, health pickup and respawn (with spawn protection)', () => {
  const { world: w } = createSession('hp', 1);
  expect(PLAYER_MAX_HEALTH).toBe(200);
  expect(w.player.health).toBe(200);
  w.player.health = 30; applyPickup(w, 'health'); expect(w.player.health).toBe(200);
  w.player.health = 0; w.player.dead = true;
  run(w, 3.5);
  expect(w.player.health).toBe(200); expect(w.player.dead).toBe(false);
  expect(w.ps.powerups.invuln).toBeGreaterThan(2); expect(w.ps.powerups.invuln).toBeLessThanOrEqual(3);
});

test('health regenerates to half after 6 s without damage, never above', () => {
  const w = arena(); const cop = w.spawnPed('cop', 2100, 1900, 0)!; cop.ai.mode = 'idle';
  w.player.health = 50; damagePed(w, w.player, 10, cop, 'pistol'); // normal: 6 damage
  const hurt = w.player.health;
  run(w, 5.5); expect(w.player.health).toBe(hurt);
  run(w, 2); expect(w.player.health).toBeGreaterThan(hurt);
  run(w, 15); expect(w.player.health).toBe(100);
  damagePed(w, w.player, 10, cop, 'pistol');
  const h2 = w.player.health; run(w, 3); expect(w.player.health).toBe(h2);
  w.player.health = 150; run(w, 10); expect(w.player.health).toBe(150);
});

test.each([['easy', 8], ['normal', 12], ['hard', 20]] as const)('a 20-damage hit costs the player %s → %i HP; NPCs unaffected', (d, lost) => {
  const w = arena(d); const cop = w.spawnPed('cop', 2100, 1900, 0)!; const civ = w.spawnPed('civ', 2000, 2000, 0)!;
  damagePed(w, w.player, 20, cop, 'pistol');
  expect(200 - w.player.health).toBeCloseTo(lost);
  damagePed(w, civ, 20, cop, 'pistol'); expect(civ.health).toBe(80);
});

test('the player takes half damage from their own explosions', () => {
  const w = arena('hard');
  damagePed(w, w.player, 40, w.player, 'explosion');
  expect(w.player.health).toBe(180);
});

test('a cop firing from 150 units misses a standing player often but not always', () => {
  const w = arena('normal'); w.systemsEnabled.ai = false; w.systemsEnabled.death = false;
  const cop = w.spawnPed('cop', 2050, 1900, Math.PI)!; cop.ai.mode = 'idle';
  let hits = 0; w.bus.on('playerHurt', () => hits++);
  for (let i = 0; i < 40; i++) {
    w.player.health = 200; cop.cooldown = 0; cop.angle = Math.PI;
    fireWeapon(w, cop, 'pistol');
    run(w, 0.3);
  }
  expect(hits / 40).toBeLessThan(0.75);
  expect(hits / 40).toBeGreaterThan(0.1);
});

test('a SWAT officer with an SMG does not kill a standing player within 10 s on Normal', () => {
  const w = arena('normal'); w.systemsEnabled.death = false;
  w.ps.wanted.level = 4; w.ps.wanted.heat = 1700;
  const s = w.spawnPed('swat', 2050, 1900, Math.PI)!; armNpc(w, s, 'smg'); s.persistent = true;
  Object.assign(s.ai, { mode: 'chase', target: null, timer: 0 });
  let shots = 0; w.bus.on('shot', e => { if (!e.byPlayer) shots++; });
  run(w, 10);
  expect(shots).toBeGreaterThan(5);
  expect(w.player.dead).toBe(false);
});

test.each([[15, true], [40, false]] as const)('aim assist: a civilian %i° off the facing is hit: %s', (deg, hit) => {
  const w = arena('normal');
  const a = (deg * Math.PI) / 180;
  const civ = w.spawnPed('civ', 1900 + Math.cos(a) * 150, 1900 + Math.sin(a) * 150, 0)!; civ.ai.mode = 'idle';
  w.ps.weapons.pistol = 10; w.ps.current = 'pistol';
  const i = idle(); i.fire = true;
  for (let n = 0; n < 150 && !civ.dead; n++) w.step(i, DT);
  if (hit) { expect(civ.dead).toBe(true); expect(w.ps.weapons.pistol).toBeGreaterThanOrEqual(6); }
  else expect(civ.health).toBe(100);
});

test('a freshly armed NPC waits before its first shot', () => {
  const w = arena('normal'); const cop = w.spawnPed('cop', 2050, 1900, Math.PI)!;
  armNpc(w, cop, 'pistol');
  expect(cop.cooldown).toBeCloseTo(DIFFICULTY.normal.npcFirstShot);
  expect(fireWeapon(w, cop, 'pistol')).toBe(false);
});

test('old saves without a difficulty load; an unknown difficulty is rejected', () => {
  const s = createSession('diffsave', 1); const st = mem();
  writeSave(st, s, DEFAULT_SETTINGS);
  const o = JSON.parse(st.get(SAVE_KEY)!);
  delete o.settings.difficulty; st.set(SAVE_KEY, JSON.stringify(o));
  expect(readSave(st).ok).toBe(true);
  o.settings.difficulty = 'insane'; st.set(SAVE_KEY, JSON.stringify(o));
  expect(readSave(st).ok).toBe(false);
});
