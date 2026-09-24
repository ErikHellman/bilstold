import { MAX_SUBSTEP } from '../core/const';
import type { OBB } from '../core/math';
import type { Bus, GameEvents } from '../core/events';
import { VEHICLES, type VehicleModelId } from '../game/data/vehicles';
import type { City } from '../world/citygen';
import { tileAtWorld } from '../world/query';
import { T } from '../world/tiles';
import type { Ped, Vehicle } from './types';
import { vehicleVsTiles, resolveVehiclePair as resolvePair } from './collision';

export function makeVehicle(id: number): Vehicle {
  return {
    id, active: false, model: 'sedan', def: VEHICLES.sedan, color: 0,
    x: 0, y: 0, angle: 0, vx: 0, vy: 0, angVel: 0,
    throttle: 0, steer: 0, brake: 0, handbrake: false,
    health: 0, burning: 0, wreck: false, sinking: 0,
    driver: null, parked: false, siren: false,
    ai: { mode: 'none', dir: 2, turnedHere: false, lastTile: -1, target: null, tx: 0, ty: 0, stuck: 0, honk: 0 },
    bomb: 'none', bombTimer: 0, carWeapon: null, carAmmo: 0,
    persistent: false, lastHitBy: null, skid: 0, reacted: false,
  };
}

export function resetVehicle(v: Vehicle, model: VehicleModelId, x: number, y: number, angle: number, color: number): Vehicle {
  const def = VEHICLES[model];
  Object.assign(v, {
    model, def, color, x, y, angle, vx: 0, vy: 0, angVel: 0,
    throttle: 0, steer: 0, brake: 0, handbrake: false,
    health: def.health, burning: 0, wreck: false, sinking: 0,
    driver: null, parked: false, siren: false, bomb: 'none', bombTimer: 0,
    carWeapon: model === 'tank' ? 'tankGun' : null, carAmmo: 0,
    persistent: false, lastHitBy: null, skid: 0, reacted: false,
  });
  Object.assign(v.ai, { mode: 'none', dir: 2, turnedHere: false, lastTile: -1, target: null, tx: 0, ty: 0, stuck: 0, honk: 0 });
  return v;
}

export function vehicleOBB(v: Vehicle, out: OBB = { x: 0, y: 0, hw: 0, hh: 0, angle: 0 }): OBB {
  out.x = v.x; out.y = v.y; out.hw = v.def.length / 2; out.hh = v.def.width / 2; out.angle = v.angle;
  return out;
}

export const forwardSpeed = (v: Vehicle) => v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
export const speedOf = (v: Vehicle) => Math.hypot(v.vx, v.vy);

/** Door position; side -1 = left (driver side), 1 = right. */
export function doorPoint(v: Vehicle, side: -1 | 1): { x: number; y: number } {
  const off = v.def.width / 2 + 8;
  return { x: v.x - Math.sin(v.angle) * off * side, y: v.y + Math.cos(v.angle) * off * side };
}

export function damageVehicle(v: Vehicle, amount: number, by: Ped | null): void {
  if (v.wreck || amount <= 0) return;
  v.health -= amount;
  if (by) v.lastHitBy = by;
  if (v.health <= 0 && v.burning <= 0) { v.health = 0; v.burning = 4; }
}

/** Optional grip modifier (e.g. oil slicks), installed by the effects module. */
export let gripFactor: (v: Vehicle) => number = () => 1;
export function setGripFactor(fn: (v: Vehicle) => number) { gripFactor = fn; }

export function stepVehicle(v: Vehicle, dt: number, city: City, bus: Bus<GameEvents>): void {
  const def = v.def;
  if (v.wreck) {
    const k = Math.max(0, 1 - 3 * dt);
    v.vx *= k; v.vy *= k; v.angVel = 0;
  } else {
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    let fwd = v.vx * c + v.vy * s;
    let lat = -v.vx * s + v.vy * c;
    const accel = def.accel;
    if (v.throttle > 0) fwd += accel * v.throttle * dt * (fwd < 0 ? 2 : 1);
    if (v.brake > 0) {
      if (fwd > 5) fwd = Math.max(0, fwd - 2.2 * accel * v.brake * dt);
      else fwd = Math.max(-def.reverse, fwd - 0.6 * accel * v.brake * dt);
    }
    fwd *= 1 - 0.5 * dt;
    if (v.throttle <= 0 && v.brake <= 0) fwd = Math.abs(fwd) <= 60 * dt ? 0 : fwd - Math.sign(fwd) * 60 * dt;
    const top = def.maxSpeed * (v.health > 0 ? 1 : 0.3);
    if (fwd > top) fwd = top;
    if (v.sinking > 0) fwd *= 0.9;

    const turnFactor = def.kind === 'tank' ? Math.max(0.5, Math.min(1, Math.abs(fwd) / 50)) : Math.min(1, Math.abs(fwd) / 50);
    const dirSign = def.kind === 'tank' && Math.abs(fwd) < 5 ? 1 : Math.sign(fwd);
    v.angVel = v.steer * def.turn * turnFactor * dirSign * (v.handbrake ? 1.6 : 1);
    const grip = (v.handbrake ? 0.15 : 1) * def.grip * gripFactor(v);
    lat *= Math.max(0, 1 - grip * dt);
    if (Math.abs(lat) > 70 && ++v.skid % 3 === 0) bus.emit('skid', { x: v.x, y: v.y, angle: v.angle });

    // Recompose in the pre-turn frame: velocity lags the heading, which is what makes the car slide.
    v.vx = c * fwd - s * lat;
    v.vy = s * fwd + c * lat;
    v.angle += v.angVel * dt;
  }

  const dist = Math.hypot(v.vx, v.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
  for (let i = 0; i < n; i++) {
    v.x += (v.vx * dt) / n;
    v.y += (v.vy * dt) / n;
    vehicleVsTiles(v, city, bus);
  }

  if (tileAtWorld(city, v.x, v.y) === T.Water) {
    v.sinking += dt;
    v.vx *= 0.9; v.vy *= 0.9;
    if (v.sinking > 1.5) v.wreck = true;
  }
}

export const resolveVehiclePair = resolvePair;
