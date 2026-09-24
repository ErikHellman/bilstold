import { TILE } from '../../core/const';
import { derive, makeRng, pick, randInt, type Rng } from '../../core/rng';
import type { PlayerState } from '../../sim/types';
import type { City, Landmark } from '../../world/citygen';
import { T, DIRS, DIR_VEC } from '../../world/tiles';
import { VEHICLES, type VehicleModelId } from '../data/vehicles';
import type { WeaponId } from '../data/weapons';
import { RIVAL } from '../gangs';
import { REWARD_FACTOR, TARGET_NAMES, type MissionKind, type MissionParams, type MissionSpec } from './templates';

const curbCache = new WeakMap<City, number[]>();

/** Sidewalk tiles next to a road: always reachable by car and on foot. */
function curbTiles(c: City): number[] {
  let list = curbCache.get(c);
  if (list) return list;
  list = [];
  const { size, tiles } = c;
  for (let i = 0; i < size * size; i++) {
    if (tiles[i] !== T.Sidewalk) continue;
    const x = i % size, y = (i / size) | 0;
    if (DIRS.some(d => tiles[(y + DIR_VEC[d][1]) * size + x + DIR_VEC[d][0]] === T.Road)) list.push(i);
  }
  curbCache.set(c, list);
  return list;
}

function pickTile(r: Rng, c: City, from: { x: number; y: number }, minD: number, maxD: number, gang = -1): { tx: number; ty: number } {
  const list = curbTiles(c);
  for (let tries = 0; tries < 400; tries++) {
    const i = list[Math.floor(r() * list.length)];
    const tx = i % c.size, ty = (i / c.size) | 0;
    const d = Math.hypot(tx * TILE - from.x, ty * TILE - from.y);
    if (d < minD || d > maxD) continue;
    if (gang >= 0 && c.gangZone[i] !== gang && tries < 300) continue;
    return { tx, ty };
  }
  const i = list[Math.floor(r() * list.length)];
  return { tx: i % c.size, ty: (i / c.size) | 0 };
}

const STEAL_MODELS: VehicleModelId[] = ['sedan', 'compact', 'van', 'pickup', 'taxi', 'muscle', 'sports', 'icecream'];
const COMMON_MODELS: VehicleModelId[] = ['sedan', 'compact', 'taxi', 'van', 'pickup'];
const RAMPAGE_WEAPONS: WeaponId[] = ['pistol', 'smg', 'shotgun', 'flamer', 'electro', 'rocket'];

export function generateMission(city: City, phone: Landmark, n: number, ps: PlayerState): MissionSpec {
  const r = makeRng(derive(city.seed, 'mission', city.index, phone.id, n));
  const d = Math.min(5, 1 + Math.floor(ps.missionsDone / 3) + (city.index - 1));
  const gangPhone = phone.gang >= 0;
  const enemy = gangPhone ? RIVAL(phone.gang) : Math.floor(r() * 3);
  const here = { x: phone.tx * TILE, y: phone.ty * TILE };
  const pool: MissionKind[] = gangPhone
    ? ['assassinate', 'assassinate', 'carBomb', 'destroyVehicles', 'deliverCar', 'rampage', 'checkpoint']
    : ['deliverCar', 'deliverCar', 'checkpoint', 'taxi', 'crush', 'destroyVehicles', 'assassinate', 'rampage', 'taxi'];
  const kind = pick(r, pool);
  const enemyName = city.gangs[enemy]?.name ?? 'the gang';
  let params: MissionParams, title: string, timeLimit = 0;
  switch (kind) {
    case 'deliverCar': {
      const model = STEAL_MODELS[Math.min(STEAL_MODELS.length - 1, randInt(r, 0, 2 + d))];
      const garages = city.landmarks.filter(l => l.kind === 'garage');
      const garage = garages.length ? pick(r, garages).id : -1;
      const s = pickTile(r, city, here, 300, 1100);
      params = { kind, model, garage, sx: s.tx, sy: s.ty };
      title = `Steal a ${VEHICLES[model].name} and deliver it to the garage`;
      timeLimit = 240;
      break;
    }
    case 'assassinate': {
      const t = pickTile(r, city, here, 600, 2500, enemy);
      params = { kind, ...t, inCar: d >= 3 && r() < 0.4, guards: Math.min(3, d - 1), gang: enemy };
      title = `Take out ${pick(r, TARGET_NAMES)} in ${enemyName} turf`;
      timeLimit = 150 + d * 10;
      break;
    }
    case 'carBomb': {
      const t = pickTile(r, city, here, 500, 2200, enemy);
      params = { kind, ...t, model: city.gangs[enemy]?.carModel ?? 'sedan', gang: enemy };
      title = `Blow up the ${enemyName} car`;
      timeLimit = 240;
      break;
    }
    case 'checkpoint': {
      const points: { tx: number; ty: number }[] = [];
      let from = here, total = 0;
      for (let i = 0; i < randInt(r, 4, 6); i++) {
        const p = pickTile(r, city, from, 300, 700);
        total += Math.hypot(p.tx * TILE - from.x, p.ty * TILE - from.y);
        points.push(p);
        from = { x: p.tx * TILE, y: p.ty * TILE };
      }
      params = { kind, points };
      title = 'Get to the checkpoints before the time runs out';
      timeLimit = Math.round(total / 250 + 10);
      break;
    }
    case 'destroyVehicles': {
      const model = gangPhone ? city.gangs[enemy]?.carModel ?? 'sedan' : pick(r, COMMON_MODELS);
      const count = 2 + d;
      params = { kind, model, count };
      title = `Destroy ${count} vehicles of type ${VEHICLES[model].name}`;
      timeLimit = 90 + 20 * count;
      break;
    }
    case 'taxi': {
      const t = pickTile(r, city, here, 800, 2000);
      params = { kind, fromPhone: phone.id, ...t };
      title = 'Pick up the passenger and drive them across town';
      timeLimit = Math.round(Math.hypot(t.tx * TILE - here.x, t.ty * TILE - here.y) / 200 + 25);
      break;
    }
    case 'crush': {
      const model = pick(r, COMMON_MODELS);
      params = { kind, model };
      title = `Take a ${VEHICLES[model].name} to the crusher`;
      timeLimit = 240;
      break;
    }
    default: {
      const weapon = RAMPAGE_WEAPONS[Math.min(RAMPAGE_WEAPONS.length - 1, randInt(r, 0, 1 + d))];
      const target = gangPhone ? 'gang' : r() < 0.3 ? 'cop' : 'any';
      const kills = target === 'cop' ? 3 + d : 8 + 3 * d;
      params = { kind: 'rampage', weapon, kills, target };
      title = `Rampage! Kill ${kills} ${target === 'any' ? 'people' : target === 'cop' ? 'cops' : 'gang members'}`;
      timeLimit = 0;
    }
  }
  const reward = Math.round(((5000 + 2500 * d) * REWARD_FACTOR[kind]) / 100) * 100;
  return { id: `${phone.id}-${n}`, kind, title, giver: phone.gang, reward, respect: 10 + 2 * d, timeLimit, params };
}
