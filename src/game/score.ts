import type { World } from '../sim/world';
import type { PedKind } from '../sim/types';

export const POINTS = { civKill: 10, gangKill: 25, copKill: 50, vehicleDestroyed: 100, copCarDestroyed: 250 };
const LAW = new Set<PedKind>(['cop', 'swat', 'fbi', 'soldier']);
const LAW_CARS = new Set(['police', 'swat', 'fbi', 'army']);

/** Adds points scaled by the current multiplier. */
export function addPoints(w: World, base: number): void {
  w.ps.score += Math.round(base * w.ps.multiplier);
}

export function registerScoring(w: World): void {
  w.bus.on('pedKilled', e => {
    if (e.by !== w.player || e.ped === w.player) return;
    w.ps.kills++;
    addPoints(w, LAW.has(e.ped.kind) ? POINTS.copKill : e.ped.kind === 'gang' ? POINTS.gangKill : POINTS.civKill);
  });
  w.bus.on('vehicleDestroyed', e => {
    if (e.by !== w.player) return;
    addPoints(w, LAW_CARS.has(e.vehicle.def.role) ? POINTS.copCarDestroyed : POINTS.vehicleDestroyed);
  });
}
