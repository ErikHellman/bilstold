import { CAP_PARKED, CAP_PEDS, CAP_VEHICLES, TILE } from '../core/const';
import { Bus, type GameEvents } from '../core/events';
import { Pool } from '../core/pool';
import { makeRng, type Rng } from '../core/rng';
import { SpatialHash } from '../core/spatial';
import type { VehicleModelId } from '../game/data/vehicles';
import type { InputState } from '../input/input';
import type { City } from '../world/citygen';
import { makePed, resetPed, skinFor } from './ped';
import type { Explosion, Fire, Hazard, Pickup, PlayerState, Ped, PedKind, Projectile, Vehicle } from './types';
import { makeVehicle, resetVehicle } from './vehicle';

export type System = (w: World, dt: number) => void;

export function newPlayerState(): PlayerState {
  return {
    score: 0, multiplier: 1, lives: 4, cityStartScore: 0,
    weapons: { fists: Infinity }, current: 'fists',
    wanted: { level: 0, heat: 0, unseen: 0 }, respect: [0, 0, 0],
    powerups: { doubleDamage: 0, fastReload: 0, invuln: 0, electroFingers: 0 }, jailFree: false,
    missionsDone: 0, kills: 0, playTime: 0, collected: [], deathState: 'alive', deathTimer: 0,
  };
}

const idleInput = (): InputState => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() });

export class World {
  readonly bus = new Bus<GameEvents>();
  readonly rng: Rng;
  time = 0;
  tick = 0;
  readonly peds = new Pool<Ped>(CAP_PEDS, () => makePed(0));
  readonly vehicles = new Pool<Vehicle>(CAP_VEHICLES + CAP_PARKED, () => makeVehicle(0));
  readonly projectiles = new Pool<Projectile>(256, () => ({
    id: 0, active: false, kind: 'bullet', weapon: 'pistol', owner: null, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0,
  }));
  readonly explosions = new Pool<Explosion>(32, () => ({ id: 0, active: false, x: 0, y: 0, r: 0, t: 0, owner: null }));
  readonly fires = new Pool<Fire>(64, () => ({ id: 0, active: false, x: 0, y: 0, life: 0 }));
  readonly hazards = new Pool<Hazard>(32, () => ({ id: 0, active: false, kind: 'oil', x: 0, y: 0, life: 0, owner: null }));
  readonly pickups = new Pool<Pickup>(96, () => ({ id: 0, active: false, kind: 'health', x: 0, y: 0, respawn: 0, fixed: false }));
  readonly pedGrid: SpatialHash<Ped>;
  readonly vehGrid: SpatialHash<Vehicle>;
  readonly player: Ped;
  ps: PlayerState = newPlayerState();
  input: InputState = idleInput();
  readonly systemsEnabled: Record<string, boolean> = {};
  /** Parking spots whose car was stolen or destroyed this session. */
  readonly takenSpots = new Set<string>();
  private systems: { name: string; fn: System }[] = [];
  private scratchPeds: Ped[] = [];
  private scratchVehicles: Vehicle[] = [];
  private outPeds: Ped[] = [];
  private outVehicles: Vehicle[] = [];

  constructor(readonly city: City, seed: number) {
    this.rng = makeRng(seed ^ 0x5eed);
    const worldSize = city.size * TILE;
    this.pedGrid = new SpatialHash<Ped>(64, worldSize);
    this.vehGrid = new SpatialHash<Vehicle>(128, worldSize);
    const p = this.peds.spawn()!;
    resetPed(p, 'player', city.startX, city.startY, 0, 0);
    p.persistent = true;
    this.player = p;
  }

  addSystem(name: string, fn: System): void {
    this.systems.push({ name, fn });
    if (!(name in this.systemsEnabled)) this.systemsEnabled[name] = true;
  }

  step(input: InputState, dt: number): void {
    this.input = input;
    this.pedGrid.clear();
    this.vehGrid.clear();
    this.peds.each(p => this.pedGrid.insert(p));
    this.vehicles.each(v => this.vehGrid.insert(v));
    for (const s of this.systems) if (this.systemsEnabled[s.name] !== false) s.fn(this, dt);
    this.time += dt;
    this.tick++;
  }

  spawnPed(kind: PedKind, x: number, y: number, angle: number): Ped | null {
    const p = this.peds.spawn();
    if (!p) return null;
    resetPed(p, kind, x, y, angle, skinFor(kind, -1, this.rng));
    this.pedGrid.insert(p); // visible to proximity queries before the next rebuild
    return p;
  }

  countVehicles(parked: boolean): number {
    let n = 0;
    this.vehicles.each(v => { if (v.parked === parked) n++; });
    return n;
  }

  spawnVehicle(model: VehicleModelId, x: number, y: number, angle: number, color: number, parked: boolean): Vehicle | null {
    if (this.countVehicles(parked) >= (parked ? CAP_PARKED : CAP_VEHICLES)) return null;
    const v = this.vehicles.spawn();
    if (!v) return null;
    resetVehicle(v, model, x, y, angle, color);
    v.parked = parked;
    this.vehGrid.insert(v);
    return v;
  }

  removePed(p: Ped): void {
    if (p === this.player) return;
    if (p.vehicle && p.vehicle.driver === p) p.vehicle.driver = null;
    p.vehicle = null;
    this.peds.release(p);
  }

  removeVehicle(v: Vehicle): void {
    const d = v.driver;
    if (d) {
      d.vehicle = null;
      v.driver = null;
      if (d !== this.player) this.removePed(d);
    }
    this.vehicles.release(v);
  }

  /** Peds within r. The returned array is reused; do not keep it. */
  nearbyPeds(x: number, y: number, r: number): Ped[] {
    const out = this.outPeds;
    out.length = 0;
    for (const p of this.pedGrid.query(x, y, r, this.scratchPeds))
      if (p.active && (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) out.push(p);
    return out;
  }

  /** Vehicles whose centre is within r. The returned array is reused; do not keep it. */
  nearbyVehicles(x: number, y: number, r: number): Vehicle[] {
    const out = this.outVehicles;
    out.length = 0;
    for (const v of this.vehGrid.query(x, y, r, this.scratchVehicles))
      if (v.active && (v.x - x) ** 2 + (v.y - y) ** 2 <= r * r) out.push(v);
    return out;
  }
}
