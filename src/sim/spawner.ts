import { SIM_RADIUS, SPAWN_MAX, SPAWN_MIN, TILE } from '../core/const';
import { derive, makeRng, randInt, type Rng } from '../core/rng';
import { CIV_MODELS, VEHICLES, type VehicleModelId } from '../game/data/vehicles';
import { T, D, DIR, DIRS, DIR_VEC, DIR_ANGLE } from '../world/tiles';
import type { City } from '../world/citygen';
import type { PedKind, Vehicle } from './types';
import type { World } from './world';

const CHUNK = 16;

export interface ParkSpot { key: string; x: number; y: number; angle: number; model: VehicleModelId; color: number }

/** Weighted pick from the civilian traffic catalogue. */
export function pickCivModel(r: Rng, boost: Partial<Record<VehicleModelId, number>> = {}): VehicleModelId {
  let total = 0;
  for (const m of CIV_MODELS) total += VEHICLES[m].weight * (boost[m] ?? 1);
  let v = r() * total;
  for (const m of CIV_MODELS) {
    v -= VEHICLES[m].weight * (boost[m] ?? 1);
    if (v <= 0) return m;
  }
  return CIV_MODELS[0];
}

/** Deterministic parking spots of one chunk: parking lots and curbside sidewalk. */
export function parkSpots(city: City, cx: number, cy: number): ParkSpot[] {
  const r = makeRng(derive(city.seed, 'park', city.index, cy * 100 + cx));
  const { size } = city;
  const landmark = new Set(city.landmarks.map(l => l.ty * size + l.tx));
  const cands: { tx: number; ty: number; angle: number; ox: number; oy: number }[] = [];
  for (let ty = cy * CHUNK; ty < Math.min(size, (cy + 1) * CHUNK); ty++)
    for (let tx = cx * CHUNK; tx < Math.min(size, (cx + 1) * CHUNK); tx++) {
      const i = ty * size + tx;
      if (landmark.has(i)) continue;
      const t = city.tiles[i];
      if (t === T.Parking) cands.push({ tx, ty, angle: (tx + ty) % 2 ? Math.PI / 2 : -Math.PI / 2, ox: 0, oy: 0 });
      else if (t === T.Sidewalk) {
        for (const d of DIRS) {
          const [dx, dy] = DIR_VEC[d];
          const n = city.tiles[(ty + dy) * size + tx + dx];
          if (n !== T.Road) continue;
          const horizontal = dy !== 0;
          cands.push({ tx, ty, angle: horizontal ? 0 : Math.PI / 2, ox: dx * 4, oy: dy * 4 });
          break;
        }
      }
    }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const want = randInt(r, 3, 6);
  const out: ParkSpot[] = [];
  for (const c of cands) {
    if (out.length >= want) break;
    const x = c.tx * TILE + TILE / 2 + c.ox, y = c.ty * TILE + TILE / 2 + c.oy;
    if (out.some(o => Math.hypot(o.x - x, o.y - y) < 60)) continue;
    const model = pickCivModel(r, { bus: 0, truck: 0.3 });
    const color = Math.floor(r() * VEHICLES[model].colors.length);
    out.push({ key: `${c.tx},${c.ty}`, x, y, angle: c.angle + (r() < 0.5 ? Math.PI : 0), model, color });
  }
  return out;
}

/** Keeps parked cars around the player; forgets spots whose car was taken. */
export class ParkedCars {
  private spotCache = new Map<number, ParkSpot[]>();
  private present = new Map<string, Vehicle>();
  private bySpot = new Map<Vehicle, string>();
  private timer = 0;

  constructor(private w: World) {
    w.bus.on('enterCar', e => this.take(e.vehicle));
    w.bus.on('vehicleDestroyed', e => this.take(e.vehicle));
  }

  private take(v: Vehicle) {
    const key = this.bySpot.get(v);
    if (!key) return;
    this.w.takenSpots.add(key);
    this.present.delete(key);
    this.bySpot.delete(v);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const w = this.w, p = w.player;
    for (const [key, v] of this.present) {
      if (!v.active || !v.parked) { this.present.delete(key); this.bySpot.delete(v); continue; }
      if (Math.hypot(v.x - p.x, v.y - p.y) > SIM_RADIUS + 200) {
        this.present.delete(key); this.bySpot.delete(v); w.removeVehicle(v);
      }
    }
    const px = CHUNK * TILE, n = Math.ceil(w.city.size / CHUNK);
    const reach = SIM_RADIUS + px;
    const first = w.tick < 2;
    for (let cy = Math.max(0, Math.floor((p.y - reach) / px)); cy <= Math.min(n - 1, Math.floor((p.y + reach) / px)); cy++)
      for (let cx = Math.max(0, Math.floor((p.x - reach) / px)); cx <= Math.min(n - 1, Math.floor((p.x + reach) / px)); cx++) {
        const id = cy * 100 + cx;
        let spots = this.spotCache.get(id);
        if (!spots) { spots = parkSpots(w.city, cx, cy); this.spotCache.set(id, spots); }
        for (const s of spots) {
          if (this.present.has(s.key) || w.takenSpots.has(s.key)) continue;
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          if (d > SIM_RADIUS || (!first && d < SPAWN_MIN)) continue;
          if (w.nearbyVehicles(s.x, s.y, 40).length) continue;
          const v = w.spawnVehicle(s.model, s.x, s.y, s.angle, s.color, true);
          if (!v) return;
          this.present.set(s.key, v);
          this.bySpot.set(v, s.key);
        }
      }
  }
}

const TRAFFIC_BOOST: Record<number, Partial<Record<VehicleModelId, number>>> = {
  [D.Downtown]: { taxi: 2, sports: 2 },
  [D.Residential]: { compact: 2, sedan: 2 },
  [D.Industrial]: { truck: 2, van: 2 },
};

/** Spawns traffic and pedestrians in a ring around the player and despawns what is far away. */
export class Population {
  private timer = 0;

  constructor(private w: World) {}

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const w = this.w;
    this.despawn();
    const p = w.player;
    const district = w.city.district[Math.floor(p.y / TILE) * w.city.size + Math.floor(p.x / TILE)] ?? 0;
    const moving = w.countVehicles(false);
    if (moving < (district === D.Downtown ? 30 : 24)) this.spawnTraffic(district);
    const pedTarget = district === D.Downtown ? 50 : district === D.Park ? 25 : 40;
    for (let i = 0; i < 2 && w.peds.count < pedTarget; i++) this.spawnPed(district);
  }

  private ringPoint(): { x: number; y: number; tx: number; ty: number } {
    const w = this.w, p = w.player;
    const a = w.rng() * Math.PI * 2, d = SPAWN_MIN + w.rng() * (SPAWN_MAX - SPAWN_MIN);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    return { x, y, tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
  }

  private spawnTraffic(district: number) {
    const w = this.w, c = w.city;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { tx, ty } = this.ringPoint();
      if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) continue;
      const i = ty * c.size + tx;
      const flags = c.roadDir[i];
      if (c.tiles[i] !== T.Road || !SINGLE.has(flags)) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (w.nearbyVehicles(x, y, 70).length) continue;
      const gang = c.gangs[c.gangZone[i]];
      const gangCar = gang && w.rng() < 0.2;
      const model = gangCar ? gang.carModel : pickCivModel(w.rng, TRAFFIC_BOOST[district]);
      const color = gangCar ? 0 : Math.floor(w.rng() * VEHICLES[model].colors.length);
      const angle = DIR_ANGLE[flags];
      const v = w.spawnVehicle(model, x, y, angle, color, false);
      if (!v) return;
      const driver = w.spawnPed(gangCar ? 'gang' : 'civ', x, y, angle);
      if (!driver) { w.removeVehicle(v); return; }
      if (gangCar) { driver.gang = gang.id; driver.skin = 12 + gang.id; }
      driver.vehicle = v;
      v.driver = driver;
      v.ai.mode = 'cruise';
      v.ai.dir = flags;
      v.ai.lastTile = i;
      const sp = Math.min(0.45 * v.def.maxSpeed, 190) * 0.4;
      v.vx = Math.cos(angle) * sp; v.vy = Math.sin(angle) * sp;
      return;
    }
  }

  private spawnPed(district: number) {
    const w = this.w, c = w.city;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { x, y, tx, ty } = this.ringPoint();
      if (tx < 0 || ty < 0 || tx >= c.size || ty >= c.size) continue;
      const i = ty * c.size + tx;
      const t = c.tiles[i];
      if (t !== T.Sidewalk && t !== T.Plaza) continue;
      const r = w.rng();
      const gangZone = c.gangZone[i];
      let kind: PedKind = r < 0.8 ? 'civ' : r < 0.9 ? (district === D.Downtown ? 'businessman' : 'civ') : r < 0.95 ? 'elder' : 'criminal';
      const gangMember = c.gangs.length > 0 && w.rng() < 0.12;
      if (gangMember) kind = 'gang';
      const p = w.spawnPed(kind, tx * TILE + TILE / 2 + (x % 8) - 4, ty * TILE + TILE / 2 + (y % 8) - 4, 0);
      if (!p) return;
      if (gangMember) { p.gang = gangZone; p.skin = 12 + gangZone; }
      p.ai.dir = DIRS[Math.floor(w.rng() * 4)];
      p.ai.timer = 1 + w.rng() * 5;
      return;
    }
  }

  private despawn() {
    const w = this.w, p = w.player;
    const far = (x: number, y: number, r: number) => (x - p.x) ** 2 + (y - p.y) ** 2 > r * r;
    w.vehicles.each(v => {
      if (v.parked || v.persistent || v === p.vehicle || v.driver === p) return;
      if (far(v.x, v.y, SIM_RADIUS) || (v.wreck && far(v.x, v.y, 450))) w.removeVehicle(v);
    });
    w.peds.each(q => {
      if (q === p || q.persistent || q.vehicle) return;
      if (far(q.x, q.y, SIM_RADIUS) || (q.dead && q.deadTime > 25 && far(q.x, q.y, 450))) w.removePed(q);
    });
  }
}

const SINGLE = new Set<number>([DIR.N, DIR.E, DIR.S, DIR.W]);
