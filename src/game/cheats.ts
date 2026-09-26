import { obbOverlap, type OBB } from '../core/math';
import type { Vehicle } from '../sim/types';
import { vehicleOBB } from '../sim/vehicle';
import type { World } from '../sim/world';
import { isSolidWorld, tileAtWorld } from '../world/query';
import { T } from '../world/tiles';
import type { PickupId } from './data/pickups';
import { VEHICLES, type VehicleModelId } from './data/vehicles';
import { CAR_WEAPONS, FOOT_WEAPONS, WEAPONS, type WeaponId } from './data/weapons';
import { applyPickup } from './pickups';
import { clearWanted } from './wanted';

/** Car weapons the cheats menu can fit (the tank gun comes with the tank). */
export const CHEAT_CAR_WEAPONS = CAR_WEAPONS.filter(id => id !== 'tankGun');
/** Pick-ups the cheats menu can hand out. */
export const CHEAT_POWERUPS: PickupId[] = ['health', 'armor', 'invuln', 'doubleDamage', 'fastReload', 'electroFingers',
  'life', 'multiplier', 'jailFree', 'bribe', 'frenzy'];

/**
 * Foot weapons are given with full ammo and selected. Car weapons need the player to be in a car.
 * Returns false when nothing could be given.
 */
export function giveWeapon(w: World, id: WeaponId): boolean {
  const def = WEAPONS[id];
  if (def.vehicle) {
    const v = w.player.vehicle;
    if (!v || id === 'tankGun') return false;
    v.carWeapon = id;
    v.carAmmo = def.maxAmmo;
  } else {
    if (id !== 'fists') w.ps.weapons[id] = def.maxAmmo;
    w.ps.current = id;
  }
  w.bus.emit('message', { text: `${def.name} added`, seconds: 2 });
  return true;
}

/** Fills every owned foot weapon, and the current car's weapon, to its maximum. */
export function refillAmmo(w: World): void {
  for (const id of FOOT_WEAPONS) {
    if (id === 'fists') continue;
    if ((w.ps.weapons[id] ?? 0) > 0) w.ps.weapons[id] = WEAPONS[id].maxAmmo;
  }
  const v = w.player.vehicle;
  if (v?.carWeapon && v.carWeapon !== 'tankGun') v.carAmmo = WEAPONS[v.carWeapon].maxAmmo;
  w.bus.emit('message', { text: 'Ammo refilled', seconds: 2 });
}

/** Same effect, sound and message as driving over the crate. */
export function givePowerup(w: World, kind: PickupId): void {
  applyPickup(w, kind);
}

export function loseTheCops(w: World): void {
  clearWanted(w);
  w.bus.emit('message', { text: 'Wanted level cleared', seconds: 2 });
}

export function setGodMode(w: World, on: boolean): void {
  w.godMode = on;
  if (on) { w.player.health = Math.max(w.player.health, 1); w.player.burning = 0; }
  w.bus.emit('message', { text: on ? 'God mode on' : 'God mode off', seconds: 2 });
}

const GAP = 10;

/** Candidate centres for a new car beside, ahead of, behind, then around the player (or the player's car). */
function candidates(w: World, model: VehicleModelId): { x: number; y: number }[] {
  const p = w.player, v = p.vehicle, m = VEHICLES[model];
  const a = v ? v.angle : p.angle;
  const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
  const halfW = v ? v.def.width / 2 : 6, halfL = v ? v.def.length / 2 : 6;
  const side = halfW + m.width / 2 + GAP, along = halfL + m.length / 2 + GAP;
  const cx = v ? v.x : p.x, cy = v ? v.y : p.y;
  const out = [
    { x: cx + rx * side, y: cy + ry * side }, { x: cx - rx * side, y: cy - ry * side },
    { x: cx + fx * along, y: cy + fy * along }, { x: cx - fx * along, y: cy - fy * along },
  ];
  for (let r = along; r <= along + 160; r += 24)
    for (let i = 0; i < 16; i++) {
      const t = a + (i / 16) * Math.PI * 2;
      out.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
  return out;
}

function fits(w: World, box: OBB): boolean {
  const c = Math.cos(box.angle), s = Math.sin(box.angle);
  for (const [lx, ly] of [[0, 0], [box.hw, box.hh], [box.hw, -box.hh], [-box.hw, box.hh], [-box.hw, -box.hh]]) {
    const x = box.x + lx * c - ly * s, y = box.y + lx * s + ly * c;
    if (isSolidWorld(w.city, x, y) || tileAtWorld(w.city, x, y) === T.Water) return false;
  }
  const scratch: OBB = { x: 0, y: 0, hw: 0, hh: 0, angle: 0 };
  for (const o of w.nearbyVehicles(box.x, box.y, box.hw + 80)) if (obbOverlap(box, vehicleOBB(o, scratch))) return false;
  const p = w.player;
  if (!p.vehicle && obbOverlap(box, { x: p.x, y: p.y, hw: 8, hh: 8, angle: 0 })) return false;
  return true;
}

/** Frees one traffic slot by dropping the farthest car nobody cares about. */
function makeRoom(w: World): void {
  const p = w.player;
  let far: Vehicle | null = null, fd = -1;
  w.vehicles.each(v => {
    if (v.parked || v.persistent || v === p.vehicle) return;
    const d = (v.x - p.x) ** 2 + (v.y - p.y) ** 2;
    if (d > fd) { fd = d; far = v; }
  });
  if (far) w.removeVehicle(far);
}

/** Spawns an empty car of the given model on free ground next to the player, facing the same way. */
export function spawnCarNear(w: World, model: VehicleModelId): Vehicle | null {
  const m = VEHICLES[model], p = w.player;
  const angle = p.vehicle ? p.vehicle.angle : p.angle;
  const box: OBB = { x: 0, y: 0, hw: m.length / 2, hh: m.width / 2, angle };
  const spot = candidates(w, model).find(c => { box.x = c.x; box.y = c.y; return fits(w, box); });
  if (!spot) {
    w.bus.emit('message', { text: 'No room for that here', seconds: 2 });
    return null;
  }
  const color = Math.floor(w.rng() * m.colors.length);
  let v = w.spawnVehicle(model, spot.x, spot.y, angle, color, false);
  if (!v) { makeRoom(w); v = w.spawnVehicle(model, spot.x, spot.y, angle, color, false); }
  if (v) w.bus.emit('message', { text: `${m.name} delivered`, seconds: 2 });
  return v;
}
