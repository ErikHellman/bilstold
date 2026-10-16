import { TILE } from '../../core/const';
import { derive, makeRng } from '../../core/rng';
import { DRIVE_AI, laneTowards, steerTowards } from '../../sim/ai/traffic';
import type { Vehicle } from '../../sim/types';
import type { World } from '../../sim/world';
import type { City } from '../../world/citygen';
import { hasLineOfSight } from '../../world/los';
import { findWalkableNear } from '../../world/query';
import type { VehicleModelId } from '../data/vehicles';
import { pickTile } from '../missions/generator';
import { addPoints } from '../score';

export const RACES_PER_CITY = 3;
const PRIZES = [30_000, 15_000, 5_000];
const RIVALS: VehicleModelId[] = ['sports', 'muscle', 'compact'];
const CHECKPOINTS = 6;

export interface RaceFlag { id: number; x: number; y: number; route: { x: number; y: number }[] }
const cache = new WeakMap<City, RaceFlag[]>();

/** Three race start flags per city, each with a fixed route of checkpoints. */
export function raceFlags(c: City): RaceFlag[] {
  let list = cache.get(c);
  if (list) return list;
  const r = makeRng(derive(c.seed, 'races', c.index));
  const pos = (t: { tx: number; ty: number }) => findWalkableNear(c, t.tx * TILE + TILE / 2, t.ty * TILE + TILE / 2);
  list = [];
  const mid = { x: (c.size * TILE) / 2, y: (c.size * TILE) / 2 };
  for (let id = 0; id < RACES_PER_CITY; id++) {
    let start = pos(pickTile(r, c, mid, 500, 2600));
    for (let k = 0; k < 20 && list.some(f => Math.hypot(f.x - start.x, f.y - start.y) < 1200); k++) start = pos(pickTile(r, c, mid, 500, 2600));
    const route: { x: number; y: number }[] = [];
    let from = start;
    for (let i = 0; i < CHECKPOINTS; i++) { const p = pos(pickTile(r, c, from, 400, 800)); route.push(p); from = p; }
    list.push({ id, ...start, route });
  }
  cache.set(c, list);
  return list;
}

interface Race { flag: RaceFlag; time: number; next: number; rivals: Vehicle[]; finished: number }
const races = new WeakMap<World, Race>();
const progress = new WeakMap<Vehicle, { route: { x: number; y: number }[]; next: number; race: Race }>();
const cooldown = new WeakMap<World, number>();

/** Rival racers: head for the next checkpoint along the lanes, straight at it once it is in sight. */
DRIVE_AI.race = (w, v) => {
  const p = progress.get(v);
  if (!p) { v.ai.mode = 'cruise'; return; }
  const t = p.route[p.next];
  if (!t) { v.throttle = 0; v.brake = 1; return; }
  const d = Math.hypot(t.x - v.x, t.y - v.y);
  const aim = d < 220 && hasLineOfSight(w.city, v.x, v.y, t.x, t.y) ? t : laneTowards(w, v, t.x, t.y);
  steerTowards(v, aim.x, aim.y, v.def.maxSpeed * 0.82);
  if (d < 60) {
    p.next++;
    if (p.next >= p.route.length) p.race.finished++;
  }
};

export function racesSystem(w: World, dt: number): void {
  const pl = w.player, v = pl.vehicle;
  const race = races.get(w);
  if (!race) {
    if ((cooldown.get(w) ?? 0) > w.time || !v || w.mission || w.frenzy || w.activity || w.tick % 10 !== 0) return;
    const flag = raceFlags(w.city).find(f => Math.hypot(f.x - v.x, f.y - v.y) < 36);
    if (flag) start(w, flag, v);
    return;
  }
  const a = w.activity!;
  race.time += dt;
  const t = race.flag.route[race.next];
  a.target = t;
  a.counter = `Checkpoint ${race.next + 1}/${race.flag.route.length} · ${Math.min(3, race.finished) + 1}${['st', 'nd', 'rd', 'th'][Math.min(3, race.finished)]}`;
  a.timer = Math.max(0, 240 - race.time);
  const src = v ?? pl;
  if (!v || race.time > 240 || Math.hypot(t.x - src.x, t.y - src.y) > 2000) { end(w, race, false); return; }
  if (Math.hypot(t.x - v.x, t.y - v.y) < 50) {
    race.next++;
    if (race.next >= race.flag.route.length) end(w, race, true);
  }
}

function start(w: World, flag: RaceFlag, car: Vehicle) {
  const race: Race = { flag, time: 0, next: 0, rivals: [], finished: 0 };
  const back = { x: -Math.cos(car.angle), y: -Math.sin(car.angle) }, side = { x: -back.y, y: back.x };
  RIVALS.forEach((m, i) => {
    const off = (i - 1) * 30, behind = 40 + 30 * (i % 2);
    const at = findWalkableNear(w.city, car.x + back.x * behind + side.x * off, car.y + back.y * behind + side.y * off);
    const r = w.spawnVehicle(m, at.x, at.y, car.angle, i + 1, false), d = w.spawnPed('civ', at.x, at.y, 0);
    if (!r || !d) return;
    d.vehicle = r; r.driver = d; r.persistent = true; d.persistent = true;
    Object.assign(r.ai, { mode: 'race', stuck: 0 });
    progress.set(r, { route: flag.route, next: 0, race });
    race.rivals.push(r);
  });
  races.set(w, race);
  w.activity = { target: flag.route[0], counter: null, timer: 240 };
  w.bus.emit('message', { text: 'STREET RACE! GO!', seconds: 2, big: true });
}

function end(w: World, race: Race, finished: boolean) {
  races.delete(w);
  w.activity = null;
  cooldown.set(w, w.time + 30);
  for (const r of race.rivals) {
    r.persistent = false;
    if (r.driver) { r.driver.persistent = false; if (r.ai.mode === 'race') r.ai.mode = 'cruise'; }
    progress.delete(r);
  }
  if (!finished) { w.bus.emit('message', { text: 'Race lost', seconds: 3, big: true }); return; }
  const place = Math.min(race.finished, 3);
  const key = `${w.city.index}-${race.flag.id}`;
  const best = w.ps.raceBest[key];
  const record = best === undefined || race.time < best;
  if (record) w.ps.raceBest[key] = Math.round(race.time * 10) / 10;
  if (place >= PRIZES.length) { w.bus.emit('message', { text: `Last place. ${race.time.toFixed(1)}s`, seconds: 3, big: true }); return; }
  w.bus.emit('message', { text: `${['1ST', '2ND', '3RD'][place]} PLACE!`, seconds: 3, big: true });
  w.bus.emit('message', { text: `${race.time.toFixed(1)}s${record ? ' (record!)' : ''} +$${addPoints(w, PRIZES[place])}`, seconds: 4 });
}

/** Races in progress are not saved; a reload simply ends them. */
export const racing = (w: World) => races.has(w);
