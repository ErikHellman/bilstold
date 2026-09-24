import { LAW_KINDS } from '../../game/wanted';
import { tileAtWorld } from '../../world/query';
import { T } from '../../world/tiles';
import { fireWeapon } from '../combat';
import type { Ped } from '../types';
import { doorPoint, speedOf } from '../vehicle';
import type { World } from '../world';
import { PED_AI } from './pedestrian';

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

function alertCops(w: World, criminal: Ped) {
  for (const c of w.nearbyPeds(criminal.x, criminal.y, 300)) {
    if (c.dead || c.vehicle || !LAW_KINDS.has(c.kind) || c.ai.mode === 'chase') continue;
    c.weapon = 'pistol'; c.ammo = -1;
    Object.assign(c.ai, { mode: 'chase', target: criminal, timer: 0 });
  }
}

PED_AI.mug = (w, p, dt) => {
  const v = p.ai.target;
  if (!v || !v.active || v.dead || v.vehicle) { Object.assign(p.ai, { mode: 'wander', target: null, timer: 3 }); return; }
  const d = Math.hypot(v.x - p.x, v.y - p.y);
  if (d > 12) { walkTo(w, p, v.x, v.y, 85, dt); return; }
  p.vx = 0; p.vy = 0;
  p.angle = Math.atan2(v.y - p.y, v.x - p.x);
  fireWeapon(w, p, 'fists');
  if (v.health < 90) {
    Object.assign(v.ai, { mode: 'flee', tx: p.x, ty: p.y, timer: 5 });
    Object.assign(p.ai, { mode: 'flee', tx: v.x, ty: v.y, timer: 4, target: null });
    alertCops(w, p);
  }
};

PED_AI.stealCar = (w, p, dt) => {
  const car = p.ai.targetCar;
  if (!car || !car.active || car.wreck || car.driver === w.player || speedOf(car) > 60) { Object.assign(p.ai, { mode: 'wander', targetCar: null, timer: 3 }); return; }
  const door = doorPoint(car, -1);
  if (Math.hypot(door.x - p.x, door.y - p.y) > 12) { walkTo(w, p, door.x, door.y, 85, dt); return; }
  const d = car.driver;
  if (d) {
    d.vehicle = null; car.driver = null;
    d.x = door.x; d.y = door.y;
    Object.assign(d.ai, { mode: 'flee', tx: p.x, ty: p.y, timer: 6 });
  }
  p.vehicle = car; car.driver = p; car.parked = false;
  p.vx = 0; p.vy = 0;
  car.ai.mode = 'flee';
  p.ai.mode = 'drive';
  p.ai.targetCar = null;
  w.bus.emit('enterCar', { vehicle: car });
  alertCops(w, p);
};

/** Idle criminals pick a victim now and then. */
export function criminalSystem(w: World): void {
  if (w.tick % 60 !== 17) return;
  w.peds.each(p => {
    if (p.kind !== 'criminal' || p.dead || p.vehicle || p.ai.mode !== 'wander' || w.rng() > 0.25) return;
    if (w.rng() < 0.5) {
      const victim = w.nearbyPeds(p.x, p.y, 150).find(o => o !== p && !o.dead && !o.vehicle && (o.kind === 'civ' || o.kind === 'businessman' || o.kind === 'elder'));
      if (victim) Object.assign(p.ai, { mode: 'mug', target: victim });
    } else {
      const car = w.nearbyVehicles(p.x, p.y, 200).find(v => !v.wreck && v.driver !== w.player && speedOf(v) < 20 && !v.persistent);
      if (car) Object.assign(p.ai, { mode: 'stealCar', targetCar: car });
    }
  });
}
