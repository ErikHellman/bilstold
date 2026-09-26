import { SIM_RADIUS, SPAWN_MAX, SPAWN_MIN, TILE } from '../../core/const';
import { angleDiff } from '../../core/math';
import type { VehicleModelId } from '../../game/data/vehicles';
import type { WeaponId } from '../../game/data/weapons';
import { LAW_KINDS, LAW_ROLES } from '../../game/wanted';
import { hasLineOfSight } from '../../world/los';
import { isSolidWorld, tileAtWorld } from '../../world/query';
import { T, DIR, DIRS, DIR_ANGLE } from '../../world/tiles';
import { armNpc, fireWeapon, npcAcquire } from '../combat';
import type { Ped, PedKind, Vehicle } from '../types';
import { forwardSpeed, speedOf } from '../vehicle';
import type { World } from '../world';
import { PED_AI } from './pedestrian';
import { DRIVE_AI, laneTowards, obstacleAhead, steerTowards } from './traffic';

type Unit = 'foot' | 'police' | 'swat' | 'fbi' | 'tank';
/** Desired chasing units per wanted level. */
const DESIRED: Record<number, Partial<Record<Unit, number>>> = {
  1: { foot: 2 }, 2: { foot: 2, police: 2 }, 3: { foot: 3, police: 4 }, 4: { foot: 3, police: 3, swat: 2 },
  5: { foot: 2, police: 2, swat: 2, fbi: 2 }, 6: { foot: 2, swat: 2, fbi: 2, tank: 2 },
};
const UNIT_MODEL: Record<Exclude<Unit, 'foot'>, VehicleModelId> = { police: 'police', swat: 'swat', fbi: 'fbi', tank: 'tank' };
const H = DIR.E | DIR.W;
const SINGLE = new Set<number>([DIR.N, DIR.E, DIR.S, DIR.W]);

interface PoliceState { spawnTimer: number; roadblockTimer: number; lastPlayerShot: number; slowTime: number }
const states = new WeakMap<World, PoliceState>();
const st = (w: World) => {
  let s = states.get(w);
  if (!s) {
    s = { spawnTimer: 0, roadblockTimer: 10, lastPlayerShot: -99, slowTime: 0 };
    states.set(w, s);
    w.bus.on('shot', e => { if (e.byPlayer) s!.lastPlayerShot = w.time; });
  }
  return s;
};

export const weaponFor = (kind: PedKind): WeaponId => (kind === 'cop' ? 'pistol' : kind === 'swat' || kind === 'fbi' || kind === 'soldier' ? 'smg' : 'fists');
const crewKind = (u: Unit, level: number): PedKind => (u === 'tank' || level >= 6 ? 'soldier' : u === 'police' || u === 'foot' ? 'cop' : u);

function unitOf(v: Vehicle): Unit | null {
  switch (v.def.role) {
    case 'police': return 'police';
    case 'swat': return 'swat';
    case 'fbi': return 'fbi';
    case 'army': return 'tank';
    default: return null;
  }
}

function ring(w: World) {
  const p = w.player;
  const a = w.rng() * Math.PI * 2, d = SPAWN_MIN + w.rng() * (SPAWN_MAX - SPAWN_MIN);
  const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
  return { x, y, tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

function arm(w: World, p: Ped) {
  armNpc(w, p, weaponFor(p.kind));
}

/** Whether each shooter could see its target last tick; regaining sight means aiming again. */
const sawTarget = new WeakMap<Ped, boolean>();

function spawnUnit(w: World, u: Unit, level: number): boolean {
  const c = w.city;
  for (let i = 0; i < 10; i++) {
    const { tx, ty } = ring(w);
    if (tx < 1 || ty < 1 || tx >= c.size - 1 || ty >= c.size - 1) continue;
    const k = ty * c.size + tx;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (u === 'foot') {
      if (c.tiles[k] !== T.Sidewalk) continue;
      const p = w.spawnPed(crewKind(u, level), x, y, 0);
      if (!p) return false;
      arm(w, p);
      Object.assign(p.ai, { mode: 'chase', target: null, timer: 0 });
      p.persistent = true;
      return true;
    }
    const f = c.roadDir[k];
    if (c.tiles[k] !== T.Road || !f || (i < 6 && !SINGLE.has(f)) || w.nearbyVehicles(x, y, 60).length) continue;
    const dir = DIRS.find(d => f & d)!;
    const v = w.spawnVehicle(UNIT_MODEL[u], x, y, DIR_ANGLE[dir], 0, false);
    if (!v) return false;
    const d = w.spawnPed(crewKind(u, level), x, y, v.angle);
    if (!d) { w.removeVehicle(v); return false; }
    arm(w, d);
    d.vehicle = v; v.driver = d; d.persistent = true;
    Object.assign(v.ai, { mode: 'chase', dir, lastTile: k, target: null });
    v.siren = u !== 'tank';
    v.persistent = true;
    return true;
  }
  return false;
}

function countUnits(w: World): Record<Unit, number> {
  const n: Record<Unit, number> = { foot: 0, police: 0, swat: 0, fbi: 0, tank: 0 };
  w.vehicles.each(v => { const u = unitOf(v); if (u && v.ai.mode === 'chase' && !v.wreck && v.driver) n[u]++; });
  w.peds.each(p => { if (!p.dead && !p.vehicle && LAW_KINDS.has(p.kind) && p.ai.mode === 'chase') n.foot++; });
  return n;
}

/** Crew leaves the car and continues on foot; a partner joins them. */
function bail(w: World, v: Vehicle) {
  const d = v.driver;
  if (!d || d === w.player) return;
  d.vehicle = null; v.driver = null;
  const side = (s: number) => ({ x: v.x - Math.sin(v.angle) * (v.def.width / 2 + 8) * s, y: v.y + Math.cos(v.angle) * (v.def.width / 2 + 8) * s });
  const a = side(1);
  d.x = a.x; d.y = a.y;
  Object.assign(d.ai, { mode: 'chase', target: null, timer: 0 });
  const b = side(-1);
  if (!isSolidWorld(w.city, b.x, b.y)) {
    const partner = w.spawnPed(d.kind, b.x, b.y, v.angle);
    if (partner) { arm(w, partner); partner.persistent = true; Object.assign(partner.ai, { mode: 'chase', target: null, timer: 0 }); }
  }
  v.ai.mode = 'none';
  v.siren = v.def.role !== 'army';
}

const targetOf = (w: World, t: Ped | Vehicle | null): { x: number; y: number; vx: number; vy: number } => {
  const p = (t && 'kind' in t ? t : null) ?? w.player;
  const src = p.vehicle ?? p;
  return { x: src.x, y: src.y, vx: src.vx, vy: src.vy };
};

DRIVE_AI.chase = (w, v, dt) => {
  const level = w.ps.wanted.level;
  const tgt = targetOf(w, v.ai.target);
  const dist = Math.hypot(tgt.x - v.x, tgt.y - v.y);
  const targetOnFoot = !(v.ai.target ? (v.ai.target as Ped).vehicle : w.player.vehicle);
  if ((targetOnFoot && dist < 90) || v.ai.stuck > 2) { bail(w, v); return; }
  const see = dist < 260 && hasLineOfSight(w.city, v.x, v.y, tgt.x, tgt.y);
  const aim = see ? { x: tgt.x + tgt.vx * 0.6, y: tgt.y + tgt.vy * 0.6 } : laneTowards(w, v, tgt.x, tgt.y);
  let speed = v.def.maxSpeed;
  if (targetOnFoot && dist < 140) speed = 60;
  const blocker = obstacleAhead(w, v, true);
  const blockedByOther = blocker && blocker !== w.player.vehicle && 'def' in blocker;
  if (blockedByOther && !(level >= 3 && speedOf(v) > 100)) speed = Math.min(speed, 40);
  steerTowards(v, aim.x, aim.y, speed);
  if (level < 2 && see && dist < 70) { v.throttle = 0; v.brake = 1; }
  if (speedOf(v) < 15 && v.throttle > 0) v.ai.stuck += dt; else v.ai.stuck = Math.max(0, v.ai.stuck - dt);
  const d = v.driver;
  if (v.def.kind === 'tank' && d && see && dist < 350 && Math.abs(angleDiff(v.angle, Math.atan2(tgt.y - v.y, tgt.x - v.x))) < 0.2)
    fireWeapon(w, d, 'tankGun', v);
};

DRIVE_AI.block = (_w, v) => { v.throttle = 0; v.brake = 1; v.steer = 0; };

const passable = (w: World, x: number, y: number) => {
  const t = tileAtWorld(w.city, x, y);
  return t !== T.Building && t !== T.Tree && t !== T.Water;
};

PED_AI.chase = (w, p, dt) => {
  const level = w.ps.wanted.level;
  const tp = (p.ai.target as Ped | null) ?? w.player;
  if (tp === w.player && level === 0) { Object.assign(p.ai, { mode: 'wander', target: null, timer: 2 }); p.persistent = false; return; }
  if (!tp.active || tp.dead) { Object.assign(p.ai, { mode: 'wander', target: null, timer: 2 }); return; }
  const tgt = targetOf(w, tp);
  const dx = tgt.x - p.x, dy = tgt.y - p.y, dist = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const s = st(w);
  const armed = p.weapon !== 'fists';
  const mayShoot = armed && (level >= 3 || w.time - s.lastPlayerShot < 5 || tp !== w.player);
  const canShoot = mayShoot && dist < 250 && dist > 30 && hasLineOfSight(w.city, p.x, p.y, tgt.x, tgt.y);
  if (canShoot && !sawTarget.get(p)) npcAcquire(w, p);
  sawTarget.set(p, canShoot);
  if (canShoot) {
    p.angle = base;
    p.vx = 0; p.vy = 0;
    fireWeapon(w, p, p.weapon);
    if (dist > 120) { p.vx = Math.cos(base) * 50; p.vy = Math.sin(base) * 50; }
    return;
  }
  // arrest
  if (tp === w.player && !w.player.vehicle && dist < 12 && w.ps.deathState === 'alive') {
    p.ai.timer += dt;
    p.vx = 0; p.vy = 0;
    if (p.ai.timer >= 0.4) w.ps.deathState = 'busted';
    return;
  }
  p.ai.timer = 0;
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const a = base + off;
    if (passable(w, p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12)) {
      p.angle = a;
      const sp = dist < 14 ? 30 : 100;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.anim += sp * dt;
      return;
    }
  }
  p.vx = 0; p.vy = 0;
};

function checkCarArrest(w: World, dt: number) {
  const s = st(w), v = w.player.vehicle;
  if (!v || w.ps.wanted.level === 0) { s.slowTime = 0; return; }
  if (Math.abs(forwardSpeed(v)) < 15) s.slowTime += dt; else s.slowTime = 0;
  if (s.slowTime < 1.2) return;
  for (const p of w.nearbyPeds(v.x, v.y, 50)) {
    if (p.dead || p.vehicle || !LAW_KINDS.has(p.kind)) continue;
    for (const side of [-1, 1]) {
      const dx = v.x - Math.sin(v.angle) * (v.def.width / 2 + 8) * side, dy = v.y + Math.cos(v.angle) * (v.def.width / 2 + 8) * side;
      if (Math.hypot(p.x - dx, p.y - dy) < 20) { w.ps.deathState = 'busted'; return; }
    }
  }
}

function roadblock(w: World) {
  const p = w.player, v = p.vehicle ?? p;
  const sp = Math.hypot(v.vx, v.vy);
  if (sp < 60) return;
  const c = w.city;
  for (let tries = 0; tries < 6; tries++) {
    const d = 450 + w.rng() * 200;
    const x = p.x + (v.vx / sp) * d, y = p.y + (v.vy / sp) * d;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 1 || ty < 1 || tx >= c.size - 1 || ty >= c.size - 1) continue;
    const f = c.roadDir[ty * c.size + tx];
    if (c.tiles[ty * c.size + tx] !== T.Road || !SINGLE.has(f)) continue;
    const horizontal = (f & H) !== 0;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    for (const off of [-16, 16]) {
      const bx = horizontal ? cx : cx + off, by = horizontal ? cy + off : cy;
      const car = w.spawnVehicle('police', bx, by, horizontal ? Math.PI / 2 : 0, 0, false);
      if (!car) return;
      const cop = w.spawnPed('cop', bx + (horizontal ? -30 : 0), by + (horizontal ? 0 : -30), 0);
      if (cop) { arm(w, cop); cop.persistent = true; Object.assign(cop.ai, { mode: 'chase', target: null, timer: 0 }); }
      Object.assign(car.ai, { mode: 'block' });
      car.siren = true; car.persistent = true;
    }
    return;
  }
}

export function policeSystem(w: World, dt: number): void {
  const s = st(w), level = w.ps.wanted.level;
  checkCarArrest(w, dt);
  if (level === 0) {
    w.vehicles.each(v => {
      if (!LAW_ROLES.has(v.def.role) || !v.persistent) return;
      v.persistent = false; v.siren = false;
      if (v.ai.mode === 'chase' || v.ai.mode === 'block') v.ai.mode = v.driver ? 'cruise' : 'none';
    });
    w.peds.each(p => { if (LAW_KINDS.has(p.kind) && p.persistent && p.ai.mode === 'chase') { p.persistent = false; Object.assign(p.ai, { mode: 'wander', timer: 2 }); } });
    return;
  }
  // units left far behind (roadblocks, abandoned cars, lost foot cops) are released so the pools recycle them
  if (w.tick % 30 === 15) {
    const far = (x: number, y: number) => Math.hypot(x - w.player.x, y - w.player.y) > SIM_RADIUS;
    w.vehicles.each(v => { if (v.persistent && LAW_ROLES.has(v.def.role) && v.driver !== w.player && far(v.x, v.y)) v.persistent = false; });
    w.peds.each(p => { if (p.persistent && !p.vehicle && LAW_KINDS.has(p.kind) && far(p.x, p.y)) p.persistent = false; });
  }
  // patrols nearby join in
  if (w.tick % 30 === 0) {
    for (const v of w.nearbyVehicles(w.player.x, w.player.y, 500))
      if (LAW_ROLES.has(v.def.role) && v.driver && v.driver !== w.player && v.ai.mode === 'cruise') { v.ai.mode = 'chase'; v.siren = true; v.persistent = true; }
    for (const p of w.nearbyPeds(w.player.x, w.player.y, 500))
      if (LAW_KINDS.has(p.kind) && !p.vehicle && !p.dead && p.ai.mode === 'wander') { arm(w, p); p.ai.mode = 'chase'; p.persistent = true; }
  }
  s.spawnTimer -= dt;
  if (s.spawnTimer <= 0) {
    s.spawnTimer = 1.5;
    const want = DESIRED[Math.min(6, level)], have = countUnits(w);
    for (const u of Object.keys(want) as Unit[]) if (have[u] < (want[u] ?? 0) && spawnUnit(w, u, level)) break;
  }
  if (level >= 3) {
    s.roadblockTimer -= dt;
    if (s.roadblockTimer <= 0) { s.roadblockTimer = 20; roadblock(w); }
  }
}
