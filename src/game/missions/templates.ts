import type { VehicleModelId } from '../data/vehicles';
import type { WeaponId } from '../data/weapons';

export type MissionKind = 'deliverCar' | 'assassinate' | 'carBomb' | 'checkpoint' | 'destroyVehicles' | 'taxi' | 'crush' | 'rampage';

export type MissionParams =
  | { kind: 'deliverCar'; model: VehicleModelId; garage: number; sx: number; sy: number }
  | { kind: 'assassinate'; tx: number; ty: number; inCar: boolean; guards: number; gang: number }
  | { kind: 'carBomb'; tx: number; ty: number; model: VehicleModelId; gang: number }
  | { kind: 'checkpoint'; points: { tx: number; ty: number }[] }
  | { kind: 'destroyVehicles'; model: VehicleModelId; count: number }
  | { kind: 'taxi'; fromPhone: number; tx: number; ty: number }
  | { kind: 'crush'; model: VehicleModelId }
  | { kind: 'rampage'; weapon: WeaponId; kills: number; target: 'any' | 'gang' | 'cop' };

export interface MissionSpec {
  id: string; kind: MissionKind; title: string;
  /** Gang that gave the job, or -1. */
  giver: number;
  reward: number; respect: number;
  /** Seconds; 0 = no limit. */
  timeLimit: number;
  params: MissionParams;
}

export interface MissionSave { spec: MissionSpec; stage: number; timer: number; progress: number }

export const REWARD_FACTOR: Record<MissionKind, number> = {
  deliverCar: 1, assassinate: 1.5, carBomb: 1.8, checkpoint: 1, destroyVehicles: 1.3, taxi: 0.6, crush: 0.8, rampage: 1.2,
};

export const TARGET_NAMES = ['Kalle Kniv', 'Svenne Banan', 'Doktor Död', 'Lill-Stefan', 'Mästerkocken', 'Tjocke Lasse', 'Grevinnan', 'Bosse Bums'];
