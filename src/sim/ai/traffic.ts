import { TILE } from '../../core/const';
import { angleDiff, clamp } from '../../core/math';
import { T, DIRS, DIR_VEC, OPPOSITE, DIR } from '../../world/tiles';
import type { Ped, Vehicle, DriveMode } from '../types';
import { forwardSpeed } from '../vehicle';
import type { World } from '../world';

const H = DIR.E | DIR.W, V = DIR.N | DIR.S;
const aim = { x: 0, y: 0 };

/** Sets throttle/brake/steer to head for (x, y) at roughly targetSpeed. */
export function steerTowards(v: Vehicle, x: number, y: number, targetSpeed: number): void {
  const desired = Math.atan2(y - v.y, x - v.x);
  const diff = angleDiff(v.angle, desired);
  const fwd = forwardSpeed(v);
  v.handbrake = false;
  // Target inside our turning circle: back up while steering the other way.
  const dist = Math.hypot(x - v.x, y - v.y);
  if (Math.abs(diff) > 1.5 && dist < v.def.length * 1.4) {
    v.throttle = 0; v.brake = 1; v.steer = -Math.sign(diff);
    return;
  }
  v.steer = clamp(diff * 2.5, -1, 1);
  if (fwd < targetSpeed - 10) { v.throttle = 1; v.brake = 0; }
  else if (fwd > targetSpeed + 25) { v.throttle = 0; v.brake = 0.6; }
  else { v.throttle = 0.3; v.brake = 0; }
}

/** Picks the lane direction on entering a new tile and returns the aim point (next tile centre). */
export function laneStep(w: World, v: Vehicle, random: boolean): { x: number; y: number } {
  const c = w.city, size = c.size, ai = v.ai;
  const tx = Math.floor(v.x / TILE), ty = Math.floor(v.y / TILE);
  const ti = ty * size + tx;
  if (tx < 0 || ty < 0 || tx >= size || ty >= size || c.tiles[ti] !== T.Road) {
    let best = -1, bd = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= size || y >= size || c.tiles[y * size + x] !== T.Road) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = y * size + x; }
      }
    if (best >= 0) { aim.x = (best % size) * TILE + TILE / 2; aim.y = Math.floor(best / size) * TILE + TILE / 2; }
    else { aim.x = v.x + Math.cos(v.angle) * 40; aim.y = v.y + Math.sin(v.angle) * 40; }
    return aim;
  }
  if (ti !== ai.lastTile) {
    const flags = c.roadDir[ti];
    const isX = (flags & H) !== 0 && (flags & V) !== 0;
    if (!isX) ai.turnedHere = false;
    const all = DIRS.filter(d => (flags & d) && d !== OPPOSITE[ai.dir]);
    // Skip turns whose next tile only lets us U-turn back the way we came (tight ring-road T-junctions).
    let cands = all.filter(d => {
      const [ddx, ddy] = DIR_VEC[d];
      const nx = tx + ddx, ny = ty + ddy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
      const exits = c.roadDir[ny * size + nx] & ~OPPOSITE[d];
      return exits !== 0 && exits !== OPPOSITE[ai.dir];
    });
    if (!cands.length) cands = all.length ? all : DIRS.filter(d => flags & d);
    let choice = ai.dir;
    if (cands.length) {
      const straight = cands.includes(ai.dir as (typeof DIRS)[number]);
      if (straight && (ai.turnedHere || !isX)) choice = ai.dir;
      else if (!straight) choice = cands[Math.floor(w.rng() * cands.length)];
      else {
        let total = 0;
        for (const d of cands) total += d === ai.dir ? 3 : random ? 1.5 : 1;
        let r = w.rng() * total;
        for (const d of cands) { r -= d === ai.dir ? 3 : random ? 1.5 : 1; if (r <= 0) { choice = d; break; } }
      }
    }
    if (choice !== ai.dir && isX) ai.turnedHere = true;
    ai.dir = choice;
    ai.lastTile = ti;
  }
  const [dx, dy] = DIR_VEC[ai.dir] ?? [1, 0];
  aim.x = (tx + dx) * TILE + TILE / 2;
  aim.y = (ty + dy) * TILE + TILE / 2;
  return aim;
}

/** Nearest vehicle or pedestrian in a cone in front of the vehicle. */
export function obstacleAhead(w: World, v: Vehicle, ignorePeds = false): Ped | Vehicle | null {
  const c = Math.cos(v.angle), s = Math.sin(v.angle);
  const look = 40 + 0.3 * Math.max(0, forwardSpeed(v)) + v.def.length / 2;
  for (const o of w.nearbyVehicles(v.x, v.y, look + 40)) {
    if (o === v) continue;
    const dx = o.x - v.x, dy = o.y - v.y;
    const along = dx * c + dy * s;
    if (along <= 0 || along > look + o.def.length / 2) continue;
    if (Math.abs(-dx * s + dy * c) >= v.def.width / 2 + o.def.width / 2 - 3) continue;
    // Deadlock breaker: a stopped vehicle crossing our path yields to the lower id.
    const crossing = Math.abs(Math.cos(o.angle - v.angle)) < 0.5;
    if (crossing && o.driver && o.ai.stuck > 0.5 && v.id < o.id) continue;
    return o;
  }
  if (ignorePeds) return null;
  for (const p of w.nearbyPeds(v.x, v.y, look)) {
    if (p.vehicle || p.dead) continue;
    const dx = p.x - v.x, dy = p.y - v.y;
    const along = dx * c + dy * s;
    if (along <= 0) continue;
    if (Math.abs(-dx * s + dy * c) < v.def.width / 2 + 4) return p;
  }
  return null;
}

function approachingJunction(w: World, v: Vehicle): boolean {
  const [dx, dy] = DIR_VEC[v.ai.dir] ?? [1, 0];
  const c = w.city;
  for (let k = 1; k <= 2; k++) {
    const tx = Math.floor(v.x / TILE) + dx * k, ty = Math.floor(v.y / TILE) + dy * k;
    if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) return false;
    const f = c.roadDir[ty * c.size + tx];
    if ((f & H) && (f & V)) return true;
  }
  return false;
}

/** Lane following that prefers turns towards a target. */
export function laneTowards(w: World, v: Vehicle, tx: number, ty: number) {
  const c = w.city, size = c.size, ai = v.ai;
  const cx = Math.floor(v.x / TILE), cy = Math.floor(v.y / TILE), ti = cy * size + cx;
  if (cx < 0 || cy < 0 || cx >= size || cy >= size || c.tiles[ti] !== T.Road) return { x: tx, y: ty };
  if (ti !== ai.lastTile) {
    const f = c.roadDir[ti];
    let cands = DIRS.filter(d => (f & d) && d !== OPPOSITE[ai.dir]);
    if (!cands.length) cands = DIRS.filter(d => f & d);
    let best = ai.dir, bd = Infinity;
    for (const d of cands) {
      const nx = (cx + DIR_VEC[d][0] * 3 + 0.5) * TILE, ny = (cy + DIR_VEC[d][1] * 3 + 0.5) * TILE;
      const dist = Math.hypot(tx - nx, ty - ny) + (d === ai.dir ? -20 : 0) + w.rng() * 30;
      if (dist < bd) { bd = dist; best = d; }
    }
    ai.dir = best;
    ai.lastTile = ti;
    ai.turnedHere = ((f & H) && (f & V)) ? true : false;
  }
  const [dx, dy] = DIR_VEC[ai.dir] ?? [1, 0];
  return { x: (cx + dx + 0.5) * TILE, y: (cy + dy + 0.5) * TILE };
}

type DriveFn = (w: World, v: Vehicle, dt: number) => void;
/** Handlers for other drive modes are registered by later modules (police, emergency, ...). */
export const DRIVE_AI: Partial<Record<DriveMode, DriveFn>> = {};

function cruise(w: World, v: Vehicle, dt: number, flee: boolean) {
  const target = laneStep(w, v, flee);
  const desired = Math.atan2(target.y - v.y, target.x - v.x);
  let speed = flee ? v.def.maxSpeed : Math.min(0.45 * v.def.maxSpeed, 190);
  const turnSpeed = v.def.turn * (flee ? 40 : 24);
  if (Math.abs(angleDiff(v.angle, desired)) > 0.35) speed = Math.min(speed, turnSpeed);
  else if (approachingJunction(w, v)) speed = Math.min(speed, flee ? 220 : 110);
  const ai = v.ai;
  if (ai.stuck < -0.01) {
    // reversing out of a jam
    ai.stuck += dt;
    v.throttle = 0; v.brake = 1; v.steer = -clamp(angleDiff(v.angle, desired) * 2, -1, 1);
    if (ai.stuck >= 0) ai.stuck = 0;
    return;
  }
  const blocker = obstacleAhead(w, v, flee);
  if (blocker) {
    v.throttle = 0; v.brake = 1; v.steer = 0;
    if (forwardSpeed(v) < 10) {
      ai.stuck += dt;
      ai.honk -= dt;
      if (ai.stuck > 1.5 && ai.honk <= 0) { ai.honk = 1.2; w.bus.emit('horn', { x: v.x, y: v.y }); }
      if (ai.stuck > 6) ai.stuck = -1;
    }
    return;
  }
  if (forwardSpeed(v) > 30) ai.stuck = 0;
  steerTowards(v, target.x, target.y, speed);
}

DRIVE_AI.cruise = (w, v, dt) => cruise(w, v, dt, false);
DRIVE_AI.flee = (w, v, dt) => cruise(w, v, dt, true);

export function driveAI(w: World, v: Vehicle, dt: number): void {
  const fn = DRIVE_AI[v.ai.mode];
  if (fn) fn(w, v, dt);
  else { v.throttle = 0; v.brake = 0.3; v.steer = 0; }
}
