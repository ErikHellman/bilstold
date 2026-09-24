import type { Ped, Vehicle } from '../sim/types';
import type { WeaponId } from '../game/data/weapons';
import type { PickupId } from '../game/data/pickups';

type Handler<P> = (p: P) => void;

/** Minimal typed event bus. */
export class Bus<E> {
  private handlers = new Map<keyof E, Handler<any>[]>();

  on<K extends keyof E>(k: K, fn: Handler<E[K]>): () => void {
    let list = this.handlers.get(k);
    if (!list) this.handlers.set(k, (list = []));
    list.push(fn);
    return () => {
      const l = this.handlers.get(k);
      if (l) l.splice(l.indexOf(fn), 1);
    };
  }

  emit<K extends keyof E>(k: K, p: E[K]): void {
    const list = this.handlers.get(k);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](p);
  }
}

export type KillWeapon = WeaponId | 'car' | 'fire' | 'explosion' | 'water';

export interface GameEvents {
  shot: { x: number; y: number; weapon: WeaponId; byPlayer: boolean };
  explosion: { x: number; y: number; r: number };
  pedKilled: { ped: Ped; by: Ped | null; weapon: KillWeapon };
  vehicleDestroyed: { vehicle: Vehicle; by: Ped | null };
  crime: { x: number; y: number; severity: number; victim: Ped | Vehicle | null };
  pickup: { kind: PickupId };
  message: { text: string; seconds: number; big?: boolean };
  crash: { x: number; y: number; force: number };
  skid: { x: number; y: number; angle: number };
  blood: { x: number; y: number };
  scorch: { x: number; y: number; r: number };
  horn: { x: number; y: number };
  enterCar: { vehicle: Vehicle };
  exitCar: { vehicle: Vehicle };
  wasted: {};
  busted: {};
  missionStart: { title: string };
  missionEnd: { success: boolean; reward: number };
  phoneRing: { x: number; y: number };
  cityComplete: { index: number };
}
