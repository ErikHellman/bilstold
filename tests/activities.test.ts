import { createSession } from '../src/game/session';
import { packageSpots, PACKAGES_PER_CITY } from '../src/game/activities/packages';
import { raceFlags, RACES_PER_CITY } from '../src/game/activities/races';
import { PERK_AT } from '../src/game/activities/vehiclejobs';
import { playerEnterNearest, playerExit, respawnPlayer } from '../src/game/player';
import { clearWanted, lowerWanted } from '../src/game/wanted';
import { damagePed } from '../src/sim/combat';
import { isWalkable, T } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';
import { readSave, restoreSession, writeSave, DEFAULT_SETTINGS, SAVE_KEY, type Store } from '../src/save/save';
import { DT } from '../src/core/const';
import type { VehicleModelId } from '../src/game/data/vehicles';
import type { World } from '../src/sim/world';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const run = (w: World, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) w.step(idle(), DT); };
const quiet = (w: World) => { for (const k of ['police', 'wanted', 'gangs', 'criminals', 'payphones']) w.systemsEnabled[k] = false; };
/** Puts the player in a fresh car of the given model at their feet. */
function drive(w: World, model: VehicleModelId) {
  const v = w.spawnVehicle(model, w.player.x + 20, w.player.y, 0, 0, false)!;
  v.persistent = true;
  expect(playerEnterNearest(w)).toBe(true);
  run(w, 2);
  expect(w.player.vehicle).toBe(v);
  return v;
}
const park = (w: World, x: number, y: number) => {
  const v = w.player.vehicle!;
  Object.assign(v, { x, y, vx: 0, vy: 0 }); w.player.x = x; w.player.y = y;
};

test.each(['malmö', 'kiruna'])('20 hidden packages per city, deterministic, walkable and off the road (seed %s)', seed => {
  for (const index of [1, 2, 3]) {
    const { world: w } = createSession(seed, index);
    const a = packageSpots(w.city);
    expect(a.length).toBe(PACKAGES_PER_CITY);
    expect(packageSpots(createSession(seed, index).world.city)).toEqual(a);
    for (const p of a) {
      const t = tileAtWorld(w.city, p.x, p.y);
      expect(isWalkable(t)).toBe(true); expect(t).not.toBe(T.Road);
    }
  }
});

test('finding packages pays, and five of them give a pistol at every respawn', () => {
  const { world: w } = createSession('packages', 1); quiet(w);
  const spots = packageSpots(w.city);
  for (let i = 0; i < 5; i++) {
    const s0 = w.ps.score;
    w.player.x = spots[i].x; w.player.y = spots[i].y; run(w, 0.2);
    expect(w.ps.packages.length).toBe(i + 1); expect(w.ps.score).toBeGreaterThan(s0);
  }
  respawnPlayer(w, 'wasted');
  expect(w.ps.weapons.pistol).toBeGreaterThan(0);
});

test('a taxi job: pick up the fare, drop them off, get paid; leaving the car ends it', () => {
  const { world: w } = createSession('taxi', 1); quiet(w);
  drive(w, 'taxi');
  expect(w.activity).toBeTruthy();
  const fare = w.activity!.target!;
  park(w, fare.x + 20, fare.y); run(w, 0.1);
  expect(w.activity!.counter).toBe('Drive the fare');
  const dest = w.activity!.target!, s0 = w.ps.score;
  park(w, dest.x, dest.y); run(w, 0.1);
  expect(w.ps.jobs.taxi).toBe(1); expect(w.ps.score).toBeGreaterThan(s0);
  playerExit(w); run(w, 0.1);
  expect(w.activity).toBeNull();
});

test('a fire truck job: park by the fire and hose it down', () => {
  const { world: w } = createSession('fire', 1); quiet(w);
  drive(w, 'firetruck');
  const f = w.activity!.target!;
  park(w, f.x + 30, f.y); run(w, 3);
  expect(w.ps.jobs.fire).toBe(1);
});

test('perks: taxi raises the multiplier, ambulance heals fully, firefighter ignores fire', () => {
  const { world: w } = createSession('perks', 1); quiet(w);
  w.ps.jobs.taxi = PERK_AT - 1;
  drive(w, 'taxi');
  const m0 = w.ps.multiplier, fare = w.activity!.target!;
  park(w, fare.x + 20, fare.y); run(w, 0.1);
  const dest = w.activity!.target!; park(w, dest.x, dest.y); run(w, 0.1);
  expect(w.ps.multiplier).toBe(m0 + 1);
  playerExit(w); run(w, 0.1);
  w.ps.jobs.ambulance = PERK_AT; w.player.health = 50; w.playerHurtAt = -100; run(w, 60);
  expect(w.player.health).toBe(200);
  w.ps.jobs.fire = PERK_AT; damagePed(w, w.player, 50, null, 'fire');
  expect(w.player.health).toBe(200);
});

test('street races: three flags; driving into one starts a race against three rivals; finishing first pays and sets a record', () => {
  const { world: w } = createSession('race', 1); quiet(w);
  const flags = raceFlags(w.city);
  expect(flags.length).toBe(RACES_PER_CITY);
  drive(w, 'sports');
  park(w, flags[0].x, flags[0].y); run(w, 0.3);
  expect(w.activity).toBeTruthy();
  let rivals = 0; w.vehicles.each(v => { if (v.ai.mode === 'race') rivals++; });
  expect(rivals).toBe(3);
  const s0 = w.ps.score;
  for (const p of flags[0].route) { park(w, p.x, p.y); run(w, 0.05); }
  expect(w.activity).toBeNull();
  expect(w.ps.score - s0).toBeGreaterThanOrEqual(30_000);
  expect(w.ps.raceBest['1-0']).toBeGreaterThan(0);
});

test('first drive of each model pays once', () => {
  const { world: w } = createSession('collect', 1); quiet(w);
  drive(w, 'bus');
  expect(w.ps.driven).toEqual(['bus']);
  const s = w.ps.score;
  playerExit(w); run(w, 1); playerEnterNearest(w); run(w, 2);
  expect(w.ps.driven).toEqual(['bus']); expect(w.ps.score).toBe(s);
});

test('a clean getaway pays when the stars fade one by one, not when a respray wipes them', () => {
  const { world: w } = createSession('getaway', 1); quiet(w);
  w.ps.wanted.level = 3; run(w, 0.1);
  const s0 = w.ps.score;
  lowerWanted(w, 1); run(w, 0.1); lowerWanted(w, 1); run(w, 0.1); lowerWanted(w, 1); run(w, 0.1);
  expect(w.ps.score).toBeGreaterThan(s0); expect(w.ps.stunts).toBe(1);
  w.ps.wanted.level = 4; run(w, 0.1); clearWanted(w); run(w, 0.1);
  expect(w.ps.stunts).toBe(1);
});

test('side activity progress is saved, and older saves without it still load', () => {
  const m = new Map<string, string>();
  const store: Store = { get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
  const s = createSession('saved', 1); const ps = s.world.ps;
  ps.packages = [1, 4]; ps.jobs.fire = 3; ps.raceBest['1-2'] = 61.5; ps.driven = ['taxi']; ps.wrecks = 9;
  writeSave(store, s, DEFAULT_SETTINGS);
  let r = readSave(store); if (!r.ok) throw new Error(r.reason);
  const back = restoreSession(r.save).world.ps;
  expect(back.packages).toEqual([1, 4]); expect(back.jobs.fire).toBe(3); expect(back.raceBest['1-2']).toBe(61.5);
  expect(back.driven).toEqual(['taxi']); expect(back.wrecks).toBe(9);
  const raw = JSON.parse(m.get(SAVE_KEY)!);
  for (const k of ['packages', 'jobs', 'raceBest', 'driven', 'wrecks', 'stunts']) delete raw.ps[k];
  m.set(SAVE_KEY, JSON.stringify(raw));
  r = readSave(store); if (!r.ok) throw new Error(r.reason);
  expect(restoreSession(r.save).world.ps.jobs).toEqual({ taxi: 0, ambulance: 0, fire: 0, vigilante: 0 });
});
