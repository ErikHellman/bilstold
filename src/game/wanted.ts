import type { Ped, Vehicle } from '../sim/types';
import type { World } from '../sim/world';
import { hasLineOfSight } from '../world/los';

/** Heat needed for wanted levels 1..6. */
export const WANTED_THRESHOLDS = [50, 300, 800, 1600, 2800, 4500];
export const CRIME_HEAT: Record<number, number> = { 1: 60, 2: 150, 3: 300, 4: 500 };
export const LAW_KINDS = new Set(['cop', 'swat', 'fbi', 'soldier']);
export const LAW_ROLES = new Set(['police', 'swat', 'fbi', 'army']);

export function levelFor(heat: number): number {
  let l = 0;
  while (l < 6 && heat >= WANTED_THRESHOLDS[l]) l++;
  return l;
}

export function lowerWanted(w: World, n: number): void {
  const wd = w.ps.wanted;
  wd.level = Math.max(0, wd.level - n);
  wd.heat = wd.level ? WANTED_THRESHOLDS[wd.level - 1] : 0;
  wd.unseen = 0;
}

export function clearWanted(w: World): void {
  Object.assign(w.ps.wanted, { level: 0, heat: 0, unseen: 0 });
}

const isLawPed = (p: Ped) => p.active && !p.dead && LAW_KINDS.has(p.kind);
const isLawCar = (v: Vehicle) => v.active && !v.wreck && LAW_ROLES.has(v.def.role) && !!v.driver && v.driver !== null;

/** Is any police unit within r of (x, y) with a clear view? */
export function lawSees(w: World, x: number, y: number, r: number): boolean {
  for (const p of w.nearbyPeds(x, y, r)) if (isLawPed(p) && hasLineOfSight(w.city, p.x, p.y, x, y)) return true;
  for (const v of w.nearbyVehicles(x, y, r)) if (isLawCar(v) && v.driver !== w.player && hasLineOfSight(w.city, v.x, v.y, x, y)) return true;
  return false;
}

export function reportCrime(w: World, x: number, y: number, severity: number, victim: Ped | Vehicle | null): void {
  const heat = CRIME_HEAT[Math.max(1, Math.min(4, Math.round(severity)))] ?? 0;
  const victimIsLaw = !!victim && ('kind' in victim ? LAW_KINDS.has(victim.kind) : LAW_ROLES.has(victim.def.role));
  let add = 0;
  if (victimIsLaw || lawSees(w, x, y, 350)) add = heat;
  else if (severity >= 3) add = heat / 2;
  if (add <= 0) return;
  const wd = w.ps.wanted;
  wd.heat += add;
  wd.level = Math.max(wd.level, levelFor(wd.heat));
}

export function wantedSystem(w: World, dt: number): void {
  const wd = w.ps.wanted;
  if (wd.level <= 0) { wd.unseen = 0; return; }
  if (lawSees(w, w.player.x, w.player.y, 400)) wd.unseen = 0;
  else wd.unseen += dt;
  if (wd.unseen > 6 + 3 * wd.level) lowerWanted(w, 1);
}

/** Converts game events into crimes. */
export function registerCrimes(w: World): void {
  w.bus.on('crime', e => reportCrime(w, e.x, e.y, e.severity, e.victim));
  w.bus.on('pedKilled', e => {
    if (e.by !== w.player || e.ped === w.player) return;
    const k = e.ped.kind;
    const sev = LAW_KINDS.has(k) || k === 'medic' || k === 'fireman' ? 3 : 2;
    reportCrime(w, e.ped.x, e.ped.y, sev, e.ped);
  });
}
