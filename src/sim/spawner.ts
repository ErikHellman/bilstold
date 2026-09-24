import { SIM_RADIUS, SPAWN_MIN, TILE } from '../core/const';
import { derive, makeRng, randInt, type Rng } from '../core/rng';
import { CIV_MODELS, VEHICLES, type VehicleModelId } from '../game/data/vehicles';
import { T, DIRS, DIR_VEC } from '../world/tiles';
import type { City } from '../world/citygen';
import type { Vehicle } from './types';
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
          cands.push({ tx, ty, angle: horizontal ? 0 : Math.PI / 2, ox: dx * 7, oy: dy * 7 });
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
