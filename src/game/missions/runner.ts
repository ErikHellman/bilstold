import { TILE } from '../../core/const';
import type { GameEvents } from '../../core/events';
import type { Ped, Vehicle } from '../../sim/types';
import type { World } from '../../sim/world';
import { speedOf } from '../../sim/vehicle';
import { armNpc } from '../../sim/combat';
import { findWalkableNear, landmarkCenter, nearestLandmark } from '../../world/query';
import { VEHICLES } from '../data/vehicles';
import { startFrenzy } from '../frenzy';
import type { MissionSave, MissionSpec } from './templates';

export type MissionStatus = 'running' | 'success' | 'fail';
const center = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** Runs one mission: spawns what it needs, tracks objectives, timer and target marker. */
export class MissionRunner {
  stage = 0;
  timer: number;
  progress = 0;
  target: { x: number; y: number } | null = null;
  counter: string | null = null;
  entities: (Ped | Vehicle)[] = [];
  private status: MissionStatus = 'running';
  private unsub: (() => void)[] = [];
  private primary: Ped | Vehicle | null = null;
  private origin = { x: 0, y: 0 };

  constructor(private w: World, readonly spec: MissionSpec, restore?: Omit<MissionSave, 'spec'>) {
    this.timer = spec.timeLimit;
    if (restore) { this.stage = restore.stage; this.timer = restore.timer; this.progress = restore.progress; }
    this.setup();
    this.unsub.push(w.bus.on('respawn', () => this.fail('Mission failed')));
  }

  static fromJSON(w: World, s: MissionSave): MissionRunner {
    return new MissionRunner(w, s.spec, s);
  }

  toJSON(): MissionSave {
    return { spec: this.spec, stage: this.stage, timer: this.timer, progress: this.progress };
  }

  forceSuccess() { this.status = 'success'; }

  fail(reason: string) {
    if (this.status !== 'running') return;
    this.status = 'fail';
    this.w.bus.emit('message', { text: reason, seconds: 3 });
  }

  cleanup() {
    for (const u of this.unsub) u();
    this.unsub = [];
    for (const e of this.entities) e.persistent = false;
  }

  private keep<T extends Ped | Vehicle>(e: T | null): T | null {
    if (e) { e.persistent = true; this.entities.push(e); }
    return e;
  }

  private setup() {
    const w = this.w, p = this.spec.params;
    const on = (k: keyof GameEvents, fn: (e: any) => void) => this.unsub.push(w.bus.on(k, fn));
    switch (p.kind) {
      case 'deliverCar': {
        if (this.stage === 0) {
          const s = findWalkableNear(w.city, p.sx * TILE + TILE / 2, p.sy * TILE + TILE / 2);
          this.primary = this.keep(w.spawnVehicle(p.model, s.x, s.y, 0, 0, false));
        }
        on('garage', (e: { landmark: { id: number }; vehicle: Vehicle }) => {
          if (e.landmark.id === p.garage && e.vehicle.model === p.model) {
            if (e.vehicle.health > e.vehicle.def.health * 0.3) this.succeed();
            else w.bus.emit('message', { text: 'That car is too damaged!', seconds: 3 });
          }
        });
        on('vehicleDestroyed', (e: { vehicle: Vehicle }) => {
          if (e.vehicle === this.primary || (this.stage === 1 && e.vehicle === w.player.vehicle && e.vehicle.model === p.model)) this.fail('The car was destroyed');
        });
        break;
      }
      case 'assassinate': {
        const c = center(p.tx, p.ty);
        this.origin = c;
        let t: Ped | null;
        if (p.inCar) {
          const v = this.keep(w.spawnVehicle('sedan', c.x, c.y, 0, 1, false));
          t = this.keep(w.spawnPed('target', c.x, c.y, 0));
          if (v && t) { t.vehicle = v; v.driver = t; v.ai.mode = 'cruise'; }
        } else {
          t = this.keep(w.spawnPed('target', c.x, c.y, 0));
          if (t) t.ai.mode = 'wander';
        }
        this.primary = t;
        for (let i = 0; i < p.guards; i++) {
          const g = this.keep(w.spawnPed('gang', c.x + (i - 1) * 14, c.y + 12, 0));
          if (g) { g.gang = p.gang; g.skin = 12 + Math.max(0, p.gang); armNpc(w, g, 'pistol'); g.ai.mode = 'idle'; }
        }
        on('pedKilled', (e: { ped: Ped }) => { if (e.ped === this.primary) this.succeed(); });
        break;
      }
      case 'carBomb': {
        const c = findWalkableNear(w.city, p.tx * TILE + TILE / 2, p.ty * TILE + TILE / 2);
        this.primary = this.keep(w.spawnVehicle(p.model, c.x, c.y, 0, 0, false));
        on('vehicleDestroyed', (e: { vehicle: Vehicle }) => {
          if (e.vehicle === this.primary) this.succeed();
        });
        break;
      }
      case 'taxi': {
        const phone = w.city.landmarks.find(l => l.id === p.fromPhone);
        const c = phone ? landmarkCenter(phone) : { x: w.player.x, y: w.player.y };
        if (this.stage === 0) {
          const q = this.keep(w.spawnPed('passenger', c.x + 10, c.y, 0));
          if (q) q.ai.mode = 'idle';
          this.primary = q;
        }
        on('pedKilled', (e: { ped: Ped }) => { if (e.ped === this.primary) this.fail('Your passenger died'); });
        break;
      }
      case 'destroyVehicles':
        on('vehicleDestroyed', (e: { vehicle: Vehicle; by: Ped | null }) => {
          if (e.by === w.player && e.vehicle.model === p.model && ++this.progress >= p.count) this.succeed();
        });
        break;
      case 'crush':
        on('crushed', (e: { vehicle: Vehicle }) => { if (e.vehicle.model === p.model) this.succeed(); });
        break;
      case 'rampage':
        if (!w.frenzy) startFrenzy(w, p.weapon, p.kills, 30 + 5 * Math.min(5, p.kills / 4), p.target);
        on('frenzyEnd', (e: { success: boolean }) => (e.success ? this.succeed() : this.fail('Rampage failed')));
        break;
      case 'checkpoint':
        break;
    }
  }

  private succeed() { if (this.status === 'running') this.status = 'success'; }

  update(dt: number): MissionStatus {
    if (this.status !== 'running') return this.status;
    const w = this.w, pl = w.player, p = this.spec.params;
    if (this.spec.timeLimit > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.fail('Out of time!'); return this.status; }
    }
    this.counter = null;
    switch (p.kind) {
      case 'deliverCar': {
        const inModel = pl.vehicle?.model === p.model;
        this.stage = inModel ? 1 : 0;
        const g = w.city.landmarks.find(l => l.id === p.garage);
        this.target = inModel && g ? landmarkCenter(g) : this.primary && this.primary.active ? { x: this.primary.x, y: this.primary.y } : null;
        if (!inModel && !this.target) this.counter = `Find a ${VEHICLES[p.model].name}`;
        break;
      }
      case 'assassinate': {
        const t = this.primary as Ped | null;
        if (!t || !t.active) { this.fail('The target got away'); break; }
        const src = t.vehicle ?? t;
        this.target = { x: src.x, y: src.y };
        if (Math.hypot(src.x - this.origin.x, src.y - this.origin.y) > 800 && t.vehicle) this.fail('The target got away');
        else if (!t.vehicle && t.ai.mode === 'wander' && Math.hypot(pl.x - t.x, pl.y - t.y) < 150)
          Object.assign(t.ai, { mode: 'flee', tx: pl.x, ty: pl.y, timer: 10 });
        break;
      }
      case 'carBomb': {
        const v = this.primary as Vehicle | null;
        if (!v || !v.active) { this.fail('The car is gone'); break; }
        this.target = { x: v.x, y: v.y };
        break;
      }
      case 'checkpoint': {
        const pt = p.points[this.stage];
        if (!pt) { this.succeed(); break; }
        const c = center(pt.tx, pt.ty);
        this.target = c;
        this.counter = `Checkpoint ${this.stage + 1}/${p.points.length}`;
        if (Math.hypot(pl.x - c.x, pl.y - c.y) < 40) {
          this.stage++;
          if (this.stage >= p.points.length) this.succeed();
        }
        break;
      }
      case 'destroyVehicles':
        this.counter = `${this.progress}/${p.count} ${VEHICLES[p.model].name}`;
        this.target = null;
        break;
      case 'taxi': {
        const q = this.primary as Ped | null;
        if (this.stage === 0) {
          if (!q || !q.active || q.dead) { this.fail('Your passenger died'); break; }
          this.target = { x: q.x, y: q.y };
          if (pl.vehicle && Math.hypot(pl.vehicle.x - q.x, pl.vehicle.y - q.y) < 40) {
            this.stage = 1;
            w.removePed(q);
            this.primary = null;
            w.bus.emit('message', { text: 'Passenger picked up', seconds: 2 });
          }
        } else {
          const c = center(p.tx, p.ty);
          this.target = c;
          const v = pl.vehicle;
          if (v && Math.hypot(v.x - c.x, v.y - c.y) < 48 && speedOf(v) < 30) this.succeed();
        }
        break;
      }
      case 'crush': {
        const inModel = pl.vehicle?.model === p.model;
        const cr = nearestLandmark(w.city, 'crusher', pl.x, pl.y);
        this.target = inModel && cr ? landmarkCenter(cr) : null;
        if (!inModel) this.counter = `Find a ${VEHICLES[p.model].name}`;
        break;
      }
      case 'rampage':
        this.target = null;
        break;
    }
    return this.status;
  }
}
