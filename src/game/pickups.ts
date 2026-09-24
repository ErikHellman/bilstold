import { SIM_RADIUS, TILE } from '../core/const';
import { derive, makeRng } from '../core/rng';
import type { Pickup } from '../sim/types';
import type { World } from '../sim/world';
import type { City } from '../world/citygen';
import { T, DIR, DIRS, DIR_VEC } from '../world/tiles';
import { CAR_PICKUPS, PICKUPS, PICKUP_MIX, type PickupId } from './data/pickups';
import { WEAPONS } from './data/weapons';
import { lowerWanted } from './wanted';

export interface PickupSpot { id: number; kind: PickupId; x: number; y: number }
const POWERUP_SECONDS = 30;
const SINGLE_LANE = new Set<number>([DIR.N, DIR.E, DIR.S, DIR.W]);

/** Tiles reachable on foot from the start point. */
function reachable(c: City): Uint8Array {
  const { size, tiles } = c;
  const seen = new Uint8Array(size * size);
  const s = Math.floor(c.startY / TILE) * size + Math.floor(c.startX / TILE);
  const q = [s]; seen[s] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % size, y = (i / size) | 0;
    for (const d of DIRS) {
      const nx = x + DIR_VEC[d][0], ny = y + DIR_VEC[d][1];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx, t = tiles[j];
      if (seen[j] || t === T.Building || t === T.Tree || t === T.Water) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

/** Deterministic crate spots for a city: 64 on foot-reachable ground and 6 car-weapon crates on roads. */
export function placePickups(c: City): PickupSpot[] {
  const r = makeRng(derive(c.seed, 'pickups', c.index));
  const { size, tiles } = c;
  const reach = reachable(c);
  const nearLandmark = (x: number, y: number) => c.landmarks.some(l => Math.abs(l.tx - x) <= 2 && Math.abs(l.ty - y) <= 2);
  const foot: number[] = [], road: number[] = [];
  for (let i = 0; i < size * size; i++) {
    if (!reach[i]) continue;
    const t = tiles[i], x = i % size, y = (i / size) | 0;
    if (t === T.Road && SINGLE_LANE.has(c.roadDir[i])) road.push(i);
    else if ((t === T.Plaza || t === T.Grass || t === T.Sidewalk || t === T.Parking) && !nearLandmark(x, y)) foot.push(i);
  }
  const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } };
  shuffle(foot); shuffle(road);
  const kinds: PickupId[] = [];
  for (const [k, n] of PICKUP_MIX) for (let i = 0; i < n; i++) kinds.push(k);
  const out: PickupSpot[] = [];
  const far = (i: number, min: number) => out.every(o => Math.abs(o.x / TILE - (i % size)) + Math.abs(o.y / TILE - ((i / size) | 0)) >= min);
  const take = (pool: number[], kind: PickupId, min: number) => {
    if (!pool.length) return;
    let k = pool.findIndex(i => far(i, min));
    if (k < 0) k = 0;
    const i = pool.splice(k, 1)[0];
    out.push({ id: out.length, kind, x: (i % size) * TILE + TILE / 2, y: Math.floor(i / size) * TILE + TILE / 2 });
  };
  for (const kind of kinds) take(foot, kind, 8);
  for (const kind of CAR_PICKUPS) take(road, kind, 20);
  return out;
}

export function applyPickup(w: World, kind: PickupId): void {
  const ps = w.ps, def = PICKUPS[kind];
  if (def.weapon && def.car) {
    const v = w.player.vehicle;
    if (v) { v.carWeapon = def.weapon; v.carAmmo = Math.min(WEAPONS[def.weapon].maxAmmo, (v.carWeapon === def.weapon ? v.carAmmo : 0) + WEAPONS[def.weapon].ammoPickup); }
  } else if (def.weapon) {
    const wd = WEAPONS[def.weapon];
    const had = ps.weapons[def.weapon] ?? 0;
    ps.weapons[def.weapon] = Math.min(wd.maxAmmo, had + wd.ammoPickup);
    if (had <= 0) ps.current = def.weapon;
  } else switch (kind) {
    case 'health': w.player.health = 100; break;
    case 'armor': w.player.armor = 100; break;
    case 'bribe': lowerWanted(w, 1); break;
    case 'jailFree': ps.jailFree = true; break;
    case 'life': ps.lives++; break;
    case 'multiplier': ps.multiplier++; break;
    case 'doubleDamage': case 'fastReload': case 'invuln': case 'electroFingers': ps.powerups[kind] = POWERUP_SECONDS; break;
    case 'frenzy': w.bus.emit('frenzyStart', {}); break;
  }
  w.bus.emit('pickup', { kind });
  w.bus.emit('message', { text: def.name, seconds: 2 });
}

/** Keeps crates alive near the player, handles collection, respawn and power-up timers. */
export class Pickups {
  readonly spots: PickupSpot[];
  private live = new Map<number, Pickup>();
  private respawnAt = new Map<number, number>();
  private timer = 0;

  constructor(private w: World) {
    this.spots = placePickups(w.city);
  }

  update(dt: number) {
    const w = this.w, p = w.player, ps = w.ps;
    for (const k of ['doubleDamage', 'fastReload', 'invuln', 'electroFingers'] as const) ps.powerups[k] = Math.max(0, ps.powerups[k] - dt);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      for (const s of this.spots) {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        const cur = this.live.get(s.id);
        if (cur && d > SIM_RADIUS + 100) { w.pickups.release(cur); this.live.delete(s.id); continue; }
        if (cur || d > SIM_RADIUS) continue;
        if (PICKUPS[s.kind].once && ps.collected.includes(s.id)) continue;
        if ((this.respawnAt.get(s.id) ?? 0) > w.time) continue;
        const e = w.pickups.spawn();
        if (!e) break;
        Object.assign(e, { kind: s.kind, x: s.x, y: s.y, respawn: 0, fixed: true });
        this.live.set(s.id, e);
      }
    }
    if (p.dead || ps.deathState !== 'alive') return;
    w.pickups.each(e => {
      if (!(Math.hypot(e.x - p.x, e.y - p.y) <= 16)) return;
      const def = PICKUPS[e.kind];
      if (def.car && !p.vehicle) return;
      applyPickup(w, e.kind);
      w.pickups.release(e);
      for (const [id, pk] of this.live) if (pk === e) {
        this.live.delete(id);
        if (def.once) ps.collected.push(id);
        else this.respawnAt.set(id, w.time + def.respawn);
      }
    });
  }
}
