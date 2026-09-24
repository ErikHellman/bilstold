import { testCity, setTile } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { reportCrime, lowerWanted, WANTED_THRESHOLDS } from '../src/game/wanted';
import { hasLineOfSight } from '../src/world/los';
import { killPed } from '../src/sim/ped';
import { T } from '../src/world/tiles';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const arena = () => {
  const w = new World(testCity(120), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false;
  w.player.x = 1900; w.player.y = 1900; return w;
};
const run = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(idle(), DT); };

test('line of sight is blocked by buildings', () => {
  const w = arena(); expect(hasLineOfSight(w.city, 100, 100, 600, 100)).toBe(true);
  setTile(w.city, 10, 3, T.Building); expect(hasLineOfSight(w.city, 100, 100, 600, 100)).toBe(false);
});
test('crime witnessed by cop raises wanted level', () => {
  const w = arena(); const c = w.spawnPed('cop', 2000, 1900, 0)!; c.ai.mode = 'idle';
  reportCrime(w, 1900, 1900, 2, null);
  expect(w.ps.wanted.heat).toBe(150); expect(w.ps.wanted.level).toBe(1);
});
test('unwitnessed minor crime is ignored, major crime is half', () => {
  const w = arena(); reportCrime(w, 1900, 1900, 1, null); expect(w.ps.wanted.heat).toBe(0);
  reportCrime(w, 1900, 1900, 4, null); expect(w.ps.wanted.heat).toBe(250);
});
test('killing a civilian in front of a cop makes you wanted', () => {
  const w = arena(); const c = w.spawnPed('cop', 2000, 1900, 0)!; c.ai.mode = 'idle';
  const v = w.spawnPed('civ', 1920, 1900, 0)!; killPed(w, v, w.player, 'pistol');
  expect(w.ps.wanted.level).toBeGreaterThanOrEqual(1);
});
test('wanted level decays when out of sight', () => {
  const w = arena(); w.ps.wanted.heat = WANTED_THRESHOLDS[2]; w.ps.wanted.level = 3;
  w.systemsEnabled.police = false; run(w, 60);
  expect(w.ps.wanted.level).toBe(0);
});
test('police chase at level 2', () => {
  const w = arena(); w.ps.wanted.level = 2; w.ps.wanted.heat = 300; run(w, 8);
  expect(w.vehicles.items.some(v => v.active && v.def.role === 'police' && v.ai.mode === 'chase')).toBe(true);
});
test('cop touching idle player on foot busts them', () => {
  const w = arena(); w.ps.wanted.level = 1; w.ps.wanted.heat = 60;
  const c = w.spawnPed('cop', 1906, 1900, 0)!; c.ai.mode = 'chase';
  run(w, 2); expect(w.ps.deathState).toBe('busted');
});
test('lowerWanted resets heat to threshold', () => {
  const w = arena(); w.ps.wanted.level = 4; w.ps.wanted.heat = 2000; lowerWanted(w, 1);
  expect(w.ps.wanted).toMatchObject({ level: 3, heat: 800 });
});
test('cops shoot at level 3', () => {
  const w = arena(); w.ps.wanted.level = 3; w.ps.wanted.heat = 800; w.systemsEnabled.police = true;
  const c = w.spawnPed('cop', 2050, 1900, Math.PI)!; c.ai.mode = 'chase'; c.weapon = 'pistol'; c.ammo = -1;
  let shots = 0; w.bus.on('shot', e => { if (!e.byPlayer) shots++; });
  run(w, 2); expect(shots).toBeGreaterThan(0);
});
