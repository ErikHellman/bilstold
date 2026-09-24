import { TILE } from '../core/const';
import { obbOverlap, type OBB } from '../core/math';
import type { Bus, GameEvents } from '../core/events';
import type { City } from '../world/citygen';
import { isSolidWorld } from '../world/query';
import type { Ped, Vehicle } from './types';
import { PED_RADIUS, killPed } from './ped';
import type { World } from './world';
import { damageVehicle, vehicleOBB } from './vehicle';

const RESTITUTION = 0.3;
const SAMPLE = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

/** Push a vehicle out of solid tiles by sampling its corners and edge midpoints. */
export function vehicleVsTiles(v: Vehicle, city: City, bus: Bus<GameEvents>): void {
  for (let iter = 0; iter < 2; iter++) {
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const hw = v.def.length / 2, hh = v.def.width / 2;
    let px = 0, py = 0;
    for (const [a, b] of SAMPLE) {
      const x = v.x + c * hw * a - s * hh * b;
      const y = v.y + s * hw * a + c * hh * b;
      if (!isSolidWorld(city, x, y)) continue;
      const tx = Math.floor(x / TILE) * TILE, ty = Math.floor(y / TILE) * TILE;
      const opts: [number, number, number][] = [
        [-(x - tx) - 0.01, 0, x - tx], [tx + TILE - x + 0.01, 0, tx + TILE - x],
        [0, -(y - ty) - 0.01, y - ty], [0, ty + TILE - y + 0.01, ty + TILE - y],
      ];
      let best: [number, number, number] | null = null;
      for (const o of opts) {
        const free = !isSolidWorld(city, x + Math.sign(o[0]) * TILE, y + Math.sign(o[1]) * TILE);
        if (free && (!best || o[2] < best[2])) best = o;
      }
      if (!best) best = opts.reduce((m, o) => (o[2] < m[2] ? o : m));
      if (Math.abs(best[0]) > Math.abs(px)) px = best[0];
      if (Math.abs(best[1]) > Math.abs(py)) py = best[1];
    }
    if (px === 0 && py === 0) return;
    v.x += px; v.y += py;
    const len = Math.hypot(px, py), nx = px / len, ny = py / len;
    const vn = v.vx * nx + v.vy * ny;
    if (vn < 0) {
      v.vx -= (1 + RESTITUTION) * vn * nx;
      v.vy -= (1 + RESTITUTION) * vn * ny;
      if (-vn > 90) {
        bus.emit('crash', { x: v.x, y: v.y, force: -vn });
        damageVehicle(v, (-vn - 90) * 0.12, null);
      }
    }
  }
}

const oa: OBB = { x: 0, y: 0, hw: 0, hh: 0, angle: 0 }, ob: OBB = { x: 0, y: 0, hw: 0, hh: 0, angle: 0 };

/** Separates two overlapping vehicles and applies an impulse. Returns true if they touched. */
export function resolveVehiclePair(a: Vehicle, b: Vehicle, bus: Bus<GameEvents>): boolean {
  const hit = obbOverlap(vehicleOBB(a, oa), vehicleOBB(b, ob));
  if (!hit) return false;
  const ima = a.wreck && a.parked ? 0.5 / a.def.mass : 1 / a.def.mass, imb = 1 / b.def.mass;
  const sum = ima + imb;
  a.x -= hit.nx * hit.depth * (ima / sum); a.y -= hit.ny * hit.depth * (ima / sum);
  b.x += hit.nx * hit.depth * (imb / sum); b.y += hit.ny * hit.depth * (imb / sum);
  const vn = (b.vx - a.vx) * hit.nx + (b.vy - a.vy) * hit.ny;
  if (vn >= 0) return true;
  const j = (-(1 + 0.2) * vn) / sum;
  a.vx -= j * ima * hit.nx; a.vy -= j * ima * hit.ny;
  b.vx += j * imb * hit.nx; b.vy += j * imb * hit.ny;
  const force = -vn;
  if (force > 70) {
    damageVehicle(a, (force - 70) * 0.1 * Math.sqrt(b.def.mass / a.def.mass), b.driver);
    damageVehicle(b, (force - 70) * 0.1 * Math.sqrt(a.def.mass / b.def.mass), a.driver);
    if (b.driver) a.lastHitBy = b.driver;
    if (a.driver) b.lastHitBy = a.driver;
    bus.emit('crash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, force });
  }
  return true;
}

/** Resolves a pedestrian touching a vehicle: separation, knock-down or death depending on impact speed. */
export function pedVsVehicle(w: World, p: Ped, v: Vehicle): void {
  if (p.dead || p.vehicle || v.sinking > 0) return;
  const c = Math.cos(v.angle), s = Math.sin(v.angle);
  const dx = p.x - v.x, dy = p.y - v.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const hw = v.def.length / 2 + PED_RADIUS, hh = v.def.width / 2 + PED_RADIUS;
  if (Math.abs(lx) >= hw || Math.abs(ly) >= hh) return;
  const px = hw - Math.abs(lx), py = hh - Math.abs(ly);
  let nx: number, ny: number, depth: number;
  if (px < py) { const sg = Math.sign(lx) || 1; nx = c * sg; ny = s * sg; depth = px; }
  else { const sg = Math.sign(ly) || 1; nx = -s * sg; ny = c * sg; depth = py; }
  const vn = v.vx * nx + v.vy * ny; // only the car's motion hurts; walking into a car just separates
  p.x += nx * (depth + 0.5);
  p.y += ny * (depth + 0.5);
  if (v.wreck || vn <= 0) return;
  const by = v.driver;
  if (vn > 150 || (v.def.kind === 'tank' && vn > 20)) {
    w.bus.emit('blood', { x: p.x, y: p.y });
    killPed(w, p, by, 'car');
  } else if (vn > 60) {
    p.health -= vn * 0.25;
    p.knocked = 0.8;
    p.vx = nx * vn * 0.5;
    p.vy = ny * vn * 0.5;
    if (p.health <= 0) { w.bus.emit('blood', { x: p.x, y: p.y }); killPed(w, p, by, 'car'); }
  }
}
