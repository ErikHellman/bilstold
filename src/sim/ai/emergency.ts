import { SIM_RADIUS, SPAWN_MAX, SPAWN_MIN, TILE } from '../../core/const';
import type { VehicleModelId } from '../../game/data/vehicles';
import { hasLineOfSight } from '../../world/los';
import { tileAtWorld } from '../../world/query';
import { T, DIRS, DIR_ANGLE } from '../../world/tiles';
import type { Ped, PedKind, Vehicle } from '../types';
import type { World } from '../world';
import { PED_AI } from './pedestrian';
import { DRIVE_AI, laneTowards, steerTowards } from './traffic';

const crews = new WeakMap<Ped, Vehicle>();

function walkTo(w: World, p: Ped, x: number, y: number, speed: number, dt: number) {
  const a = Math.atan2(y - p.y, x - p.x);
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const b = a + off, t = tileAtWorld(w.city, p.x + Math.cos(b) * 12, p.y + Math.sin(b) * 12);
    if (t !== T.Building && t !== T.Tree && t !== T.Water) {
      p.angle = b; p.vx = Math.cos(b) * speed; p.vy = Math.sin(b) * speed; p.anim += speed * dt;
      return;
    }
  }
  p.vx = 0; p.vy = 0;
}

function spawnResponder(w: World, model: VehicleModelId, crew: PedKind, tx: number, ty: number): Vehicle | null {
  const c = w.city, p = w.player;
  for (let i = 0; i < 12; i++) {
    const a = w.rng() * Math.PI * 2, d = SPAWN_MIN + w.rng() * (SPAWN_MAX - SPAWN_MIN);
    const gx = Math.floor((p.x + Math.cos(a) * d) / TILE), gy = Math.floor((p.y + Math.sin(a) * d) / TILE);
    if (gx < 1 || gy < 1 || gx >= c.size - 1 || gy >= c.size - 1) continue;
    const k = gy * c.size + gx, f = c.roadDir[k];
    if (c.tiles[k] !== T.Road || !f) continue;
    const x = gx * TILE + TILE / 2, y = gy * TILE + TILE / 2;
    if (w.nearbyVehicles(x, y, 60).length) continue;
    const dir = DIRS.find(dd => f & dd)!;
    const v = w.spawnVehicle(model, x, y, DIR_ANGLE[dir], 0, false);
    if (!v) return null;
    const dr = w.spawnPed(crew, x, y, v.angle);
    if (!dr) { w.removeVehicle(v); return null; }
    dr.vehicle = v; v.driver = dr; dr.persistent = true; v.persistent = true; v.siren = true;
    Object.assign(v.ai, { mode: 'respond', dir, lastTile: k, tx, ty });
    return v;
  }
  return null;
}

/** Drive to (ai.tx, ai.ty); on arrival the crew gets out to do its job. */
DRIVE_AI.respond = (w, v, dt) => {
  const { tx, ty } = v.ai;
  const d = Math.hypot(tx - v.x, ty - v.y);
  if (d < 70) {
    v.throttle = 0; v.brake = 1; v.steer = 0;
    const crew = v.driver;
    if (!crew) return;
    crew.vehicle = null; v.driver = null;
    crew.x = v.x - Math.sin(v.angle) * (v.def.width / 2 + 8);
    crew.y = v.y + Math.cos(v.angle) * (v.def.width / 2 + 8);
    crews.set(crew, v);
    Object.assign(crew.ai, { mode: crew.kind === 'medic' ? 'revive' : 'extinguish', tx, ty, timer: 0 });
    v.ai.mode = 'block';
    return;
  }
  const see = d < 250 && hasLineOfSight(w.city, v.x, v.y, tx, ty);
  const aim = see ? { x: tx, y: ty } : laneTowards(w, v, tx, ty);
  steerTowards(v, aim.x, aim.y, Math.min(v.def.maxSpeed * 0.7, Math.max(40, (d - 60) * 1.2)));
  if (Math.hypot(v.vx, v.vy) < 10 && v.throttle > 0) v.ai.stuck += dt; else v.ai.stuck = 0;
  if (v.ai.stuck > 3) { v.ai.stuck = -1; v.brake = 1; v.throttle = 0; }
};

/** Crew walks back to its vehicle and drives off. */
function returnToVehicle(w: World, p: Ped, dt: number) {
  const v = crews.get(p);
  if (!v || !v.active || v.wreck || v.driver) { Object.assign(p.ai, { mode: 'wander', timer: 2 }); p.persistent = false; return; }
  if (Math.hypot(v.x - p.x, v.y - p.y) > v.def.length / 2 + 14) { walkTo(w, p, v.x, v.y, 70, dt); return; }
  p.vehicle = v; v.driver = p; p.vx = 0; p.vy = 0;
  v.ai.mode = 'cruise'; v.siren = false; v.persistent = false; p.persistent = false;
  crews.delete(p);
}

PED_AI.revive = (w, p, dt) => {
  const corpse = p.ai.target;
  if (!corpse || !corpse.active || !corpse.dead || corpse === w.player) {
    const found = w.nearbyPeds(p.ai.tx, p.ai.ty, 40).find(o => o.dead && o !== w.player);
    if (found) { p.ai.target = found; return; }
    returnToVehicle(w, p, dt);
    return;
  }
  if (Math.hypot(corpse.x - p.x, corpse.y - p.y) > 24) { walkTo(w, p, corpse.x, corpse.y, 80, dt); return; }
  p.vx = 0; p.vy = 0;
  p.ai.timer += dt;
  if (p.ai.timer >= 2) {
    Object.assign(corpse, { dead: false, health: 50, deadTime: 0, burning: 0 });
    Object.assign(corpse.ai, { mode: 'wander', timer: 2 });
    p.ai.target = null;
    p.ai.timer = 0;
  }
};

PED_AI.extinguish = (w, p, dt) => {
  let burning = false;
  for (const v of w.nearbyVehicles(p.ai.tx, p.ai.ty, 60)) if (v.burning > 0 && !v.wreck) burning = true;
  w.fires.each(f => { if (Math.hypot(f.x - p.ai.tx, f.y - p.ai.ty) < 60) burning = true; });
  if (!burning) { returnToVehicle(w, p, dt); return; }
  if (Math.hypot(p.ai.tx - p.x, p.ai.ty - p.y) > 40) { walkTo(w, p, p.ai.tx, p.ai.ty, 80, dt); return; }
  p.vx = 0; p.vy = 0;
  p.angle = Math.atan2(p.ai.ty - p.y, p.ai.tx - p.x);
  for (const v of w.nearbyVehicles(p.x, p.y, 60)) if (!(v.health <= 0 && v.burning < 1)) v.burning = 0;
  w.fires.each(f => { if (Math.hypot(f.x - p.x, f.y - p.y) < 50) w.fires.release(f); });
};

export function emergencySystem(w: World): void {
  if (w.tick % 60 !== 31) return;
  const pl = w.player;
  // responders the player has left far behind are released so the pools recycle them
  const far = (x: number, y: number) => Math.hypot(x - pl.x, y - pl.y) > SIM_RADIUS;
  w.vehicles.each(v => {
    if (v.persistent && (v.def.role === 'ambulance' || v.def.role === 'fire') && v.driver !== pl && far(v.x, v.y)) {
      v.persistent = false;
      if (v.driver) v.driver.persistent = false;
    }
  });
  w.peds.each(p => { if (p.persistent && (p.kind === 'medic' || p.kind === 'fireman') && far(p.x, p.y)) p.persistent = false; });
  let ambulance = false, firetruck = false;
  w.vehicles.each(v => {
    if (v.def.role === 'ambulance' && v.persistent) ambulance = true;
    if (v.def.role === 'fire' && v.persistent) firetruck = true;
  });
  if (!ambulance) {
    let corpse: Ped | null = null;
    w.peds.each(p => {
      if (!corpse && p.dead && p !== pl && p.deadTime > 2 && Math.hypot(p.x - pl.x, p.y - pl.y) < SIM_RADIUS - 100) corpse = p;
    });
    const c = corpse as Ped | null;
    if (c) spawnResponder(w, 'ambulance', 'medic', c.x, c.y);
  }
  if (!firetruck) {
    let target: { x: number; y: number } | null = null;
    w.vehicles.each(v => { if (!target && v.burning > 0 && !v.wreck && Math.hypot(v.x - pl.x, v.y - pl.y) < 600) target = { x: v.x, y: v.y }; });
    if (!target) w.fires.each(f => { if (!target && Math.hypot(f.x - pl.x, f.y - pl.y) < 600) target = { x: f.x, y: f.y }; });
    const t = target as { x: number; y: number } | null;
    if (t) spawnResponder(w, 'firetruck', 'fireman', t.x, t.y);
  }
}
