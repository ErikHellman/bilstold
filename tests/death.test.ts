import { createSession } from '../src/game/session';
import { landmarksOf } from '../src/world/query';
import { isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';
import { DT, TILE } from '../src/core/const';
import type { World } from '../src/sim/world';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const run = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(idle(), DT); };
const near = (w: World, kind: string) => landmarksOf(w.city, kind as any).some(l => Math.hypot(l.tx * TILE - w.player.x, l.ty * TILE - w.player.y) < 4 * TILE);

test('wasted: lose life and weapons, respawn at hospital', () => {
  const { world: w } = createSession('death', 1);
  let wasted = 0; w.bus.on('wasted', () => wasted++);
  w.ps.weapons.smg = 50; w.ps.wanted.level = 2; w.ps.wanted.heat = 300; w.player.health = 0; w.player.dead = true;
  run(w, 4);
  expect(wasted).toBe(1); expect(w.ps.lives).toBe(3); expect(w.ps.weapons.smg).toBeUndefined();
  expect(w.ps.wanted.level).toBe(0); expect(near(w, 'hospital')).toBe(true);
  expect(w.player.dead).toBe(false); expect(w.player.health).toBe(100); expect(w.ps.deathState).toBe('alive');
  expect(isWalkable(tileAtWorld(w.city, w.player.x, w.player.y))).toBe(true);
});
test('busted: respawn at police station, multiplier reset; jail card saves weapons', () => {
  const { world: w } = createSession('busted', 1);
  w.ps.multiplier = 3; w.ps.weapons.smg = 50; w.ps.score = 1000; w.ps.deathState = 'busted'; run(w, 4);
  expect(w.ps.multiplier).toBe(1); expect(near(w, 'police')).toBe(true); expect(w.ps.score).toBe(900);
  w.ps.multiplier = 3; w.ps.weapons.smg = 50; w.ps.jailFree = true; w.ps.deathState = 'busted'; run(w, 4);
  expect(w.ps.multiplier).toBe(3); expect(w.ps.weapons.smg).toBe(50); expect(w.ps.jailFree).toBe(false);
});
test('game over at zero lives restarts city score', () => {
  const { world: w } = createSession('gameover', 1);
  w.ps.lives = 1; w.ps.cityStartScore = 0; w.ps.score = 12345; w.player.health = 0; w.player.dead = true;
  run(w, 4);
  expect(w.ps.lives).toBe(4); expect(w.ps.score).toBe(0);
});
test('respray clears wanted for $5000, refuses when broke', () => {
  const { world: w } = createSession('respray', 1); const r = landmarksOf(w.city, 'respray')[0];
  const v = w.spawnVehicle('sedan', r.tx * TILE + 16, r.ty * TILE + 16, 0, 0, false)!;
  w.player.vehicle = v; v.driver = w.player; const c0 = v.color;
  w.systemsEnabled.police = false; w.ps.wanted.level = 3; w.ps.wanted.heat = 800; w.ps.score = 1000;
  run(w, 0.2); expect(w.ps.wanted.level).toBe(3);
  w.ps.score = 6000; w.shopCooldowns.clear(); run(w, 1);
  expect(w.ps.wanted.level).toBe(0); expect(w.ps.score).toBe(1000); expect(v.color).not.toBe(c0);
});
test('crusher pays for the car and removes it', () => {
  const { world: w } = createSession('crusher', 1); const r = landmarksOf(w.city, 'crusher')[0];
  const v = w.spawnVehicle('sports', r.tx * TILE + 16, r.ty * TILE + 16, 0, 0, false)!;
  w.player.vehicle = v; v.driver = w.player; w.ps.score = 0;
  let crushed = 0; w.bus.on('crushed', () => crushed++);
  run(w, 0.5);
  expect(w.player.vehicle).toBeNull(); expect(w.ps.score).toBe(8000); expect(crushed).toBe(1);
  // the pooled object may be reused by a new spawn, but never at the crusher
  expect(!v.active || Math.hypot(v.x - r.tx * TILE - 16, v.y - r.ty * TILE - 16) > 100).toBe(true);
});
test('bomb shop fits a car bomb', () => {
  const { world: w } = createSession('bombshop', 1); const r = landmarksOf(w.city, 'bomb')[0];
  const v = w.spawnVehicle('sedan', r.tx * TILE + 16, r.ty * TILE + 16, 0, 0, false)!;
  w.player.vehicle = v; v.driver = w.player; w.ps.score = 6000;
  run(w, 0.5);
  expect(v.carWeapon).toBe('carBomb'); expect(w.ps.score).toBe(1000);
});
