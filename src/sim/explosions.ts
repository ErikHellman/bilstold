import { damagePed, damageVehicleBy, effects } from './combat';
import { killPed } from './ped';
import type { Ped, Vehicle } from './types';
import { setGripFactor } from './vehicle';
import type { World } from './world';

const oil = new WeakMap<Vehicle, number>();
setGripFactor(v => ((oil.get(v) ?? 0) > 0 ? 0.1 : 1));

export function explode(w: World, x: number, y: number, r: number, owner: Ped | null): void {
  const e = w.explosions.spawn();
  if (e) Object.assign(e, { x, y, r, t: 0, owner });
  w.bus.emit('explosion', { x, y, r });
  w.bus.emit('scorch', { x, y, r: r * 0.45 });
  if (owner === w.player) w.bus.emit('crime', { x, y, severity: 4, victim: null });
  for (const p of w.nearbyPeds(x, y, r * 1.5)) {
    if (p.vehicle) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < r && !p.dead) {
      damagePed(w, p, 220 * (1 - d / r), owner, 'explosion');
      if (!p.dead && d < r / 2) p.burning = Math.max(p.burning, 2);
    }
    if (!p.dead && d > 0.1) {
      const k = 400 * (1 - d / (r * 1.5));
      p.knocked = 0.5;
      p.vx = ((p.x - x) / d) * k;
      p.vy = ((p.y - y) / d) * k;
    }
  }
  for (const v of w.nearbyVehicles(x, y, r * 1.5 + 40)) {
    const d = Math.hypot(v.x - x, v.y - y);
    if (d < r * 1.2 && !v.wreck) {
      damageVehicleBy(w, v, 180 * (1 - d / (r * 1.2)), owner);
      if (v.health <= 0 && !v.wreck) v.burning = Math.min(v.burning || 1, 1);
    }
    if (d < r * 1.5 && d > 0.1) {
      const k = 400 * (1 - d / (r * 1.5)) * Math.min(1, 1500 / v.def.mass);
      v.vx += ((v.x - x) / d) * k;
      v.vy += ((v.y - y) / d) * k;
      v.angVel += (w.rng() - 0.5) * 4;
    }
  }
}

export function spawnFire(w: World, x: number, y: number, life = 6): void {
  const f = w.fires.spawn();
  if (f) Object.assign(f, { x, y, life });
}

effects.explode = explode;
effects.fire = (w, x, y) => spawnFire(w, x, y);

function explodeVehicle(w: World, v: Vehicle, r: number) {
  v.wreck = true;
  v.parked = false;
  v.health = 0;
  v.burning = 0;
  v.bomb = 'none';
  const d = v.driver;
  if (d && !(d === w.player && w.ps.powerups.invuln > 0)) killPed(w, d, v.lastHitBy, 'explosion');
  explode(w, v.x, v.y, r, v.lastHitBy);
  w.bus.emit('vehicleDestroyed', { vehicle: v, by: v.lastHitBy });
}

function bail(w: World, v: Vehicle) {
  const d = v.driver;
  if (!d || d === w.player) return;
  d.vehicle = null;
  v.driver = null;
  d.x = v.x - Math.sin(v.angle) * (v.def.width / 2 + 8);
  d.y = v.y + Math.cos(v.angle) * (v.def.width / 2 + 8);
  d.burning = Math.max(d.burning, 1.5);
  Object.assign(d.ai, { mode: 'flee', tx: v.x, ty: v.y, timer: 6 });
}

function pointInVehicle(v: Vehicle, x: number, y: number, pad: number): boolean {
  const c = Math.cos(v.angle), s = Math.sin(v.angle);
  const dx = x - v.x, dy = y - v.y;
  return Math.abs(dx * c + dy * s) < v.def.length / 2 + pad && Math.abs(-dx * s + dy * c) < v.def.width / 2 + pad;
}

export function effectsSystem(w: World, dt: number): void {
  w.explosions.each(e => { e.t += dt; if (e.t > 0.6) w.explosions.release(e); });

  w.vehicles.each(v => {
    const o = oil.get(v);
    if (o !== undefined) { if (o - dt <= 0) oil.delete(v); else oil.set(v, o - dt); }
    if (v.wreck) return;
    if (v.bomb === 'timed') {
      v.bombTimer -= dt;
      if (v.bombTimer <= 0) { explodeVehicle(w, v, 95); return; }
    }
    if (v.burning > 0) {
      bail(w, v);
      v.burning -= dt;
      if (v.burning <= 0) explodeVehicle(w, v, 70);
    }
  });

  w.peds.each(p => {
    if (p.dead || p.burning <= 0) return;
    p.burning -= dt;
    damagePed(w, p, 14 * dt, null, 'fire');
    if (p.dead) return;
    if (p !== w.player && !p.vehicle && p.ai.mode !== 'flee')
      Object.assign(p.ai, { mode: 'flee', tx: p.x + (w.rng() - 0.5) * 40, ty: p.y + (w.rng() - 0.5) * 40, timer: p.burning });
    if (w.rng() < 0.2 * dt)
      for (const o of w.nearbyPeds(p.x, p.y, 10)) if (o !== p && !o.dead && !o.vehicle) o.burning = Math.max(o.burning, 2);
  });

  w.fires.each(f => {
    f.life -= dt;
    if (f.life <= 0) { w.fires.release(f); return; }
    for (const p of w.nearbyPeds(f.x, f.y, 12)) if (!p.dead && !p.vehicle) p.burning = Math.max(p.burning, 3);
    for (const v of w.nearbyVehicles(f.x, f.y, 40)) if (pointInVehicle(v, f.x, f.y, 6)) damageVehicleBy(w, v, 10 * dt, null);
  });

  w.hazards.each(h => {
    h.life -= dt;
    if (h.life <= 0) { w.hazards.release(h); return; }
    for (const v of w.nearbyVehicles(h.x, h.y, 50)) {
      if (!pointInVehicle(v, h.x, h.y, h.kind === 'mine' ? 4 : 8)) continue;
      if (h.kind === 'mine') {
        if (v.driver === h.owner && v.driver !== null && h.life > 59) continue; // arming delay for the layer
        w.hazards.release(h);
        explode(w, h.x, h.y, 60, h.owner);
        return;
      }
      oil.set(v, 1.2);
    }
  });
}
