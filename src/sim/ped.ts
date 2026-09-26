import { MAX_SUBSTEP, PLAYER_MAX_HEALTH, TILE } from '../core/const';
import type { Rng } from '../core/rng';
import type { KillWeapon } from '../core/events';
import type { City } from '../world/citygen';
import { isSolidWorld, tileAtWorld } from '../world/query';
import { T } from '../world/tiles';
import type { Ped, PedKind } from './types';
import type { World } from './world';

export const PED_RADIUS = 5;

export function makePed(id: number): Ped {
  return {
    id, active: false, kind: 'civ', skin: 1,
    x: 0, y: 0, angle: 0, vx: 0, vy: 0,
    health: 100, armor: 0, dead: false, deadTime: 0,
    burning: 0, shocked: 0, knocked: 0,
    vehicle: null, weapon: 'fists', ammo: -1, cooldown: 0, gang: -1,
    ai: { mode: 'idle', target: null, targetCar: null, timer: 0, tx: 0, ty: 0, dir: 2 },
    anim: 0, persistent: false,
  };
}

const HEALTH: Partial<Record<PedKind, number>> = { player: PLAYER_MAX_HEALTH, elder: 60, swat: 150, soldier: 150, fbi: 120 };

export function resetPed(p: Ped, kind: PedKind, x: number, y: number, angle: number, skin = 1): Ped {
  Object.assign(p, {
    kind, skin, x, y, angle, vx: 0, vy: 0,
    health: HEALTH[kind] ?? 100, armor: 0, dead: false, deadTime: 0,
    burning: 0, shocked: 0, knocked: 0, vehicle: null,
    weapon: 'fists', ammo: -1, cooldown: 0, gang: -1, anim: 0, persistent: false,
  });
  Object.assign(p.ai, { mode: kind === 'player' ? 'idle' : 'wander', target: null, targetCar: null, timer: 0, tx: 0, ty: 0, dir: 2 });
  return p;
}

/** Sprite skin index per kind (see render/sprites/peds PED_SKINS). */
export function skinFor(kind: PedKind, gang: number, r: Rng): number {
  switch (kind) {
    case 'player': return 0;
    case 'businessman': return 9;
    case 'elder': return 10;
    case 'criminal': return 11;
    case 'gang': return 12 + Math.max(0, gang);
    case 'cop': return 15;
    case 'swat': return 16;
    case 'fbi': return 17;
    case 'soldier': return 18;
    case 'medic': return 19;
    case 'fireman': return 20;
    default: return 1 + Math.floor(r() * 8);
  }
}

/** Pushes a circle out of the solid tiles it overlaps. */
function pedVsTiles(p: Ped, city: City) {
  const r = PED_RADIUS;
  for (let iter = 0; iter < 2; iter++) {
    let moved = false;
    const tx0 = Math.floor((p.x - r) / TILE), tx1 = Math.floor((p.x + r) / TILE);
    const ty0 = Math.floor((p.y - r) / TILE), ty1 = Math.floor((p.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isSolidWorld(city, tx * TILE + 1, ty * TILE + 1)) continue;
        const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
        const cx = Math.max(x0, Math.min(p.x, x1)), cy = Math.max(y0, Math.min(p.y, y1));
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d > 1e-6) {
          p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r;
        } else {
          const opts = [[p.x - x0 + r, -1, 0], [x1 - p.x + r, 1, 0], [p.y - y0 + r, 0, -1], [y1 - p.y + r, 0, 1]];
          const o = opts.reduce((m, e) => (e[0] < m[0] ? e : m));
          p.x += o[1] * o[0]; p.y += o[2] * o[0];
        }
        moved = true;
      }
    if (!moved) return;
  }
}

/** Moves a ped on foot by its velocity with tile collision; drowns it in water. */
export function stepPedMovement(w: World, p: Ped, dt: number): void {
  if (p.dead || p.vehicle) return;
  if (p.knocked > 0) {
    p.knocked -= dt;
    const k = Math.max(0, 1 - 6 * dt);
    p.vx *= k; p.vy *= k;
  }
  if (p.shocked > 0) { p.shocked -= dt; p.vx = 0; p.vy = 0; }
  const dist = Math.hypot(p.vx, p.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  for (let i = 0; i < n; i++) {
    p.x += (p.vx * dt) / n;
    p.y += (p.vy * dt) / n;
    pedVsTiles(p, w.city);
  }
  if (tileAtWorld(w.city, p.x, p.y) === T.Water) killPed(w, p, null, 'water');
}

export function killPed(w: World, p: Ped, by: Ped | null, weapon: KillWeapon): void {
  if (p.dead || w.isGod(p)) return;
  p.dead = true;
  p.health = 0;
  p.deadTime = 0;
  p.burning = 0;
  p.vx = 0; p.vy = 0;
  if (p.vehicle) {
    if (p.vehicle.driver === p) p.vehicle.driver = null;
    p.vehicle = null;
  }
  w.bus.emit('pedKilled', { ped: p, by, weapon });
}
