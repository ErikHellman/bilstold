import type { World } from '../sim/world';
import type { Vehicle } from '../sim/types';
import { doorPoint, forwardSpeed } from '../sim/vehicle';
import { fireWeapon } from '../sim/combat';
import { FOOT_WEAPONS, type WeaponId } from './data/weapons';
import { findWalkableNear, nearestLandmark, tileAtWorld } from '../world/query';
import { TILE } from '../core/const';
import { clearWanted, LAW_KINDS, LAW_ROLES } from './wanted';
import { gameOver } from './progression';
import { T, isWalkable } from '../world/tiles';

export { newPlayerState } from '../sim/world';

const WALK = 95, BACK = 50, TURN = 4.5, APPROACH = 110, ENTER_RANGE = 56;

export function controlPlayer(w: World, dt: number): void {
  const p = w.player, inp = w.input;
  if (p.dead || w.ps.deathState !== 'alive') {
    if (p.vehicle) Object.assign(p.vehicle, { throttle: 0, brake: 0, steer: 0, handbrake: false });
    p.vx = 0; p.vy = 0;
    return;
  }
  const v = p.vehicle;
  if (v) {
    v.throttle = inp.accel; v.brake = inp.brake; v.steer = inp.steer; v.handbrake = inp.handbrake;
    p.x = v.x; p.y = v.y; p.angle = v.angle;
    if (inp.fire && v.carWeapon) fireWeapon(w, p, v.carWeapon, v);
    if (inp.pressed.has('enter')) playerExit(w);
    return;
  }
  if (p.knocked > 0) return;

  if (p.ai.mode === 'enterCar') {
    const car = p.ai.targetCar;
    const cancel = inp.pressed.has('enter') || inp.accel > 0 || inp.brake > 0 || Math.abs(inp.steer) > 0.3;
    if (cancel || !car || !car.active || car.wreck) { cancelEnter(w); return; }
    const door = nearerDoor(car, p.x, p.y);
    const dx = door.x - p.x, dy = door.y - p.y, d = Math.hypot(dx, dy);
    p.ai.timer += dt;
    if (d < 10 || p.ai.timer > 1.2) { completeEnter(w, car); return; }
    p.angle = Math.atan2(dy, dx);
    p.vx = (dx / d) * APPROACH; p.vy = (dy / d) * APPROACH;
    p.anim += APPROACH * dt;
    return;
  }

  p.angle += inp.steer * TURN * dt;
  const sp = inp.accel > 0 ? WALK * inp.accel : inp.brake > 0 ? -BACK * inp.brake : 0;
  p.vx = Math.cos(p.angle) * sp;
  p.vy = Math.sin(p.angle) * sp;
  p.anim += Math.abs(sp) * dt;
  if (inp.pressed.has('weaponNext')) cycleWeapon(w, 1);
  if (inp.pressed.has('weaponPrev')) cycleWeapon(w, -1);
  if (inp.fire) {
    fireWeapon(w, p, w.ps.current);
    if ((w.ps.weapons[w.ps.current] ?? 0) <= 0) cycleWeapon(w, 1);
  }
  if (inp.pressed.has('enter')) playerEnterNearest(w);
}

/** Next/previous owned foot weapon with ammo; fists are always available. */
export function cycleWeapon(w: World, dir: 1 | -1): void {
  const owned = FOOT_WEAPONS.filter(id => (w.ps.weapons[id] ?? 0) > 0);
  if (!owned.length) { w.ps.current = 'fists'; return; }
  const i = owned.indexOf(w.ps.current as WeaponId);
  w.ps.current = owned[(i + dir + owned.length) % owned.length];
}

function nearerDoor(v: Vehicle, x: number, y: number) {
  const l = doorPoint(v, -1), r = doorPoint(v, 1);
  return (l.x - x) ** 2 + (l.y - y) ** 2 <= (r.x - x) ** 2 + (r.y - y) ** 2 ? l : r;
}

function cancelEnter(w: World) {
  w.player.ai.mode = 'idle';
  w.player.ai.targetCar = null;
  w.player.vx = 0; w.player.vy = 0;
}

/** Starts walking to the nearest enterable vehicle. */
export function playerEnterNearest(w: World): boolean {
  const p = w.player;
  let best: Vehicle | null = null, bd = Infinity;
  for (const v of w.nearbyVehicles(p.x, p.y, ENTER_RANGE + 50)) {
    if (v.wreck || tileAtWorld(w.city, v.x, v.y) === T.Water) continue;
    const door = nearerDoor(v, p.x, p.y);
    const d = Math.min(Math.hypot(v.x - p.x, v.y - p.y) - v.def.length / 2, Math.hypot(door.x - p.x, door.y - p.y));
    if (d <= ENTER_RANGE && d < bd) { bd = d; best = v; }
  }
  if (!best) return false;
  Object.assign(p.ai, { mode: 'enterCar', targetCar: best, timer: 0 });
  return true;
}

function completeEnter(w: World, v: Vehicle) {
  const p = w.player;
  const d = v.driver;
  const lawCar = ['police', 'swat', 'fbi', 'army'].includes(v.def.role);
  w.bus.emit('crime', { x: v.x, y: v.y, severity: lawCar ? 3 : 1, victim: lawCar ? v : d });
  if (d && d !== p) {
    d.vehicle = null;
    v.driver = null;
    const side = nearerDoor(v, p.x, p.y) === doorPoint(v, -1) ? 1 : -1;
    const spot = exitSpot(w, v, side);
    d.x = spot.x; d.y = spot.y;
    const angry = d.kind === 'gang' || d.kind === 'cop' || d.kind === 'swat' || d.kind === 'fbi' || d.kind === 'soldier' || w.rng() < 0.15;
    Object.assign(d.ai, { mode: angry ? 'attack' : 'flee', target: p, targetCar: null, timer: 6, tx: p.x, ty: p.y });
  }
  p.vehicle = v;
  v.driver = p;
  v.parked = false;
  v.ai.mode = 'none';
  p.vx = 0; p.vy = 0;
  p.ai.mode = 'idle';
  p.ai.targetCar = null;
  w.bus.emit('enterCar', { vehicle: v });
}

/** A walkable spot next to a car: preferred door, then the other, then the nearest walkable tile. */
function exitSpot(w: World, v: Vehicle, first: -1 | 1) {
  for (const side of [first, -first as -1 | 1]) {
    const d = doorPoint(v, side);
    if (isWalkable(tileAtWorld(w.city, d.x, d.y))) return d;
  }
  return findWalkableNear(w.city, v.x, v.y);
}

export function playerExit(w: World): void {
  const p = w.player, v = p.vehicle;
  if (!v) return;
  const speed = Math.abs(forwardSpeed(v));
  const spot = exitSpot(w, v, -1);
  Object.assign(v, { throttle: 0, brake: 0, steer: 0, handbrake: false, driver: null });
  p.vehicle = null;
  p.x = spot.x; p.y = spot.y;
  p.vx = 0; p.vy = 0;
  if (speed > 150) { p.knocked = 0.6; p.health -= 5; }
  w.bus.emit('exitCar', { vehicle: v });
}

/** Watches for the player dying or being arrested and respawns them after a short pause. */
export function deathSystem(w: World, dt: number): void {
  const p = w.player, ps = w.ps;
  if (ps.deathState === 'alive') {
    if (p.dead || p.health <= 0) {
      ps.deathState = 'wasted';
      ps.deathTimer = 0;
    } else return;
  }
  if (ps.deathTimer <= 0) {
    ps.deathTimer = 3;
    w.bus.emit(ps.deathState === 'wasted' ? 'wasted' : 'busted', {});
    if (p.vehicle) Object.assign(p.vehicle, { throttle: 0, brake: 1, steer: 0 });
    return;
  }
  ps.deathTimer -= dt;
  if (ps.deathTimer <= 0) respawnPlayer(w, ps.deathState === 'wasted' ? 'wasted' : 'busted');
}

export function respawnPlayer(w: World, kind: 'wasted' | 'busted'): void {
  const p = w.player, ps = w.ps;
  if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; }
  const l = nearestLandmark(w.city, kind === 'wasted' ? 'hospital' : 'police', p.x, p.y);
  const at = l ? findWalkableNear(w.city, l.tx * TILE + TILE / 2, l.ty * TILE + TILE / 2) : { x: w.city.startX, y: w.city.startY };
  Object.assign(p, { x: at.x, y: at.y, vx: 0, vy: 0, dead: false, health: 100, armor: 0, burning: 0, knocked: 0, shocked: 0 });
  p.ai.mode = 'idle';
  clearWanted(w);
  ps.deathState = 'alive';
  ps.deathTimer = 0;
  w.peds.each(q => { if (q !== p && LAW_KINDS.has(q.kind)) q.persistent = false; });
  w.vehicles.each(v => { if (LAW_ROLES.has(v.def.role) && v.driver !== p) { v.persistent = false; if (v.ai.mode === 'chase') v.ai.mode = 'cruise'; } });
  if (kind === 'wasted') {
    ps.lives--;
    ps.weapons = { fists: Infinity };
    ps.current = 'fists';
    ps.multiplier = Math.max(1, ps.multiplier - 1);
    if (ps.lives <= 0) { gameOver(w); return; }
  } else if (ps.jailFree) {
    ps.jailFree = false;
    w.bus.emit('message', { text: 'Get Outta Jail Free card used!', seconds: 3 });
  } else {
    ps.weapons = { fists: Infinity };
    ps.current = 'fists';
    ps.multiplier = 1;
    ps.score = Math.max(0, ps.score - Math.floor(ps.score * 0.1));
  }
  w.bus.emit('respawn', { kind });
}
