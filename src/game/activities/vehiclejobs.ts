import type { Ped, Vehicle, VehicleJobKind } from '../../sim/types';
import { speedOf } from '../../sim/vehicle';
import type { World } from '../../sim/world';
import { findWalkableNear, landmarkCenter, nearestLandmark } from '../../world/query';
import { pickTile } from '../missions/generator';
import { addPoints } from '../score';

/** Jobs of one kind that unlock its perk. */
export const PERK_AT = 10;
export const PERKS: Record<VehicleJobKind, string> = {
  taxi: 'Taxi legend: +1 multiplier',
  ambulance: 'Paramedic: health regenerates all the way',
  fire: 'Firefighter: fire no longer hurts you',
  vigilante: 'Vigilante: armor at every respawn',
};
const JOB_FOR_ROLE: Record<string, VehicleJobKind> = { taxi: 'taxi', ambulance: 'ambulance', fire: 'fire', police: 'vigilante' };
const NAMES: Record<VehicleJobKind, string> = { taxi: 'Taxi', ambulance: 'Ambulance', fire: 'Fire truck', vigilante: 'Vigilante' };

export const hasPerk = (w: World, k: VehicleJobKind) => w.ps.jobs[k] >= PERK_AT;

interface Job {
  kind: VehicleJobKind;
  car: Vehicle;
  stage: 'find' | 'deliver';
  /** Passenger or patient waiting at the kerb, or the fleeing criminal's car. */
  ped: Ped | null;
  target: Vehicle | null;
  at: { x: number; y: number };
  dest: { x: number; y: number };
  timer: number;
  /** Seconds the fire truck has spent hosing the fire. */
  hose: number;
  fire: { x: number; y: number; life: number; active: boolean } | null;
}

const jobs = new WeakMap<World, Job>();
const here = (w: World) => ({ x: w.player.x, y: w.player.y });
const tilePos = (t: { tx: number; ty: number }, w: World) => findWalkableNear(w.city, t.tx * 32 + 16, t.ty * 32 + 16);

/** Vehicle side jobs: drive a taxi, ambulance, fire truck or police car and work the streets until you get out. */
export function registerVehicleJobs(w: World): void {
  w.bus.on('enterCar', e => {
    const v = e.vehicle, kind = JOB_FOR_ROLE[v.def.role];
    if (!kind || v.driver !== w.player || w.mission || w.frenzy || w.activity) return;
    const job: Job = { kind, car: v, stage: 'find', ped: null, target: null, at: here(w), dest: here(w), timer: 0, hose: 0, fire: null };
    jobs.set(w, job);
    w.activity = { target: null, counter: null, timer: null };
    w.bus.emit('message', { text: `${NAMES[kind]} job! Get out of the car to stop.`, seconds: 4 });
    next(w, job);
  });
  w.bus.on('exitCar', () => stop(w));
  w.bus.on('missionStart', () => stop(w));
  w.bus.on('respawn', () => stop(w));
  w.bus.on('pedKilled', e => { const j = jobs.get(w); if (j && e.ped === j.ped && j.kind !== 'vigilante') { w.bus.emit('message', { text: 'They did not make it', seconds: 2 }); clear(w, j); next(w, j); } });
  w.bus.on('vehicleDestroyed', e => {
    const j = jobs.get(w);
    if (!j) return;
    if (e.vehicle === j.car) stop(w);
    else if (e.vehicle === j.target) done(w, j, 4000);
  });
}

function stop(w: World) {
  const j = jobs.get(w);
  if (!j) return;
  clear(w, j);
  jobs.delete(w);
  w.activity = null;
}

function clear(w: World, j: Job) {
  if (j.ped) { j.ped.persistent = false; if (j.ped.active && !j.ped.dead && j.stage === 'deliver') w.removePed(j.ped); }
  if (j.target) j.target.persistent = false;
  if (j.fire) j.fire.life = Math.min(j.fire.life, 0.1);
  j.ped = null; j.target = null; j.fire = null; j.hose = 0;
}

function next(w: World, j: Job) {
  j.stage = 'find';
  const t = tilePos(pickTile(w.rng, w.city, here(w), 300, 700), w);
  j.at = t;
  switch (j.kind) {
    case 'taxi':
    case 'ambulance': {
      const p = w.spawnPed(j.kind === 'taxi' ? 'passenger' : 'civ', t.x, t.y, 0);
      if (p) { p.persistent = true; p.ai.mode = 'idle'; if (j.kind === 'ambulance') p.knocked = 999; }
      j.ped = p;
      j.timer = 60;
      break;
    }
    case 'fire': {
      const f = w.fires.spawn();
      if (f) Object.assign(f, { x: t.x, y: t.y, life: 90 });
      j.fire = f;
      j.timer = 75;
      break;
    }
    case 'vigilante': {
      const car = w.spawnVehicle('sedan', t.x, t.y, 0, 0, false), d = w.spawnPed('criminal', t.x, t.y, 0);
      if (car && d) { d.vehicle = car; car.driver = d; car.persistent = true; d.persistent = true; Object.assign(car.ai, { mode: 'flee', tx: w.player.x, ty: w.player.y }); }
      j.target = car;
      j.timer = 90;
      break;
    }
  }
}

function done(w: World, j: Job, base: number) {
  const ps = w.ps;
  ps.jobs[j.kind]++;
  const n = ps.jobs[j.kind];
  w.bus.emit('message', { text: `${NAMES[j.kind]} job ${n} done +$${addPoints(w, base)}`, seconds: 3 });
  if (n === PERK_AT) {
    w.bus.emit('message', { text: `Perk unlocked! ${PERKS[j.kind]}`, seconds: 5, big: false });
    if (j.kind === 'taxi') ps.multiplier++;
  }
  clear(w, j);
  next(w, j);
}

export function vehicleJobsSystem(w: World, dt: number): void {
  const j = jobs.get(w), a = w.activity;
  if (!j || !a) return;
  if (w.player.vehicle !== j.car || j.car.wreck) { stop(w); return; }
  j.timer -= dt;
  const v = j.car, slow = speedOf(v) < 60;
  if (j.timer <= 0) { w.bus.emit('message', { text: 'Too slow! Next one.', seconds: 2 }); clear(w, j); next(w, j); return; }
  a.timer = j.timer;
  switch (j.kind) {
    case 'taxi':
    case 'ambulance': {
      if (j.stage === 'find') {
        const p = j.ped;
        if (!p || !p.active) { clear(w, j); next(w, j); return; }
        a.target = { x: p.x, y: p.y };
        a.counter = j.kind === 'taxi' ? 'Pick up the fare' : 'Pick up the patient';
        if (slow && Math.hypot(p.x - v.x, p.y - v.y) < 44) {
          w.removePed(p);
          j.ped = null;
          j.stage = 'deliver';
          const h = nearestLandmark(w.city, 'hospital', v.x, v.y);
          j.dest = j.kind === 'ambulance' && h ? landmarkCenter(h) : tilePos(pickTile(w.rng, w.city, here(w), 700, 1600), w);
          j.timer = Math.hypot(j.dest.x - v.x, j.dest.y - v.y) / 170 + 20;
        }
      } else {
        a.target = j.dest;
        a.counter = j.kind === 'taxi' ? 'Drive the fare' : 'To the hospital!';
        if (slow && Math.hypot(j.dest.x - v.x, j.dest.y - v.y) < 60)
          done(w, j, Math.round(Math.hypot(j.dest.x - j.at.x, j.dest.y - j.at.y) * (j.kind === 'taxi' ? 3 : 4) / 100) * 100 + 500);
      }
      break;
    }
    case 'fire': {
      const f = j.fire;
      if (!f || !f.active) { clear(w, j); next(w, j); return; }
      a.target = { x: f.x, y: f.y };
      const near = Math.hypot(f.x - v.x, f.y - v.y) < 70;
      if (near && slow) j.hose += dt; else j.hose = Math.max(0, j.hose - dt);
      a.counter = near ? `Putting it out ${Math.min(100, Math.round((j.hose / 2.5) * 100))}%` : 'Put out the fire';
      if (j.hose >= 2.5) done(w, j, 3000);
      break;
    }
    case 'vigilante': {
      const t = j.target;
      if (!t || !t.active) { clear(w, j); next(w, j); return; }
      a.target = { x: t.x, y: t.y };
      a.counter = 'Stop the criminal';
      if (t.driver && t.ai.mode !== 'flee') t.ai.mode = 'flee';
      if (Math.hypot(t.x - v.x, t.y - v.y) > 1300) { w.bus.emit('message', { text: 'They got away', seconds: 2 }); clear(w, j); next(w, j); }
      break;
    }
  }
}
