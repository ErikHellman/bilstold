import type { VehicleModelId } from '../data/vehicles';
import type { WeaponId } from '../data/weapons';

export type MissionKind = 'deliverCar' | 'assassinate' | 'carBomb' | 'checkpoint' | 'destroyVehicles' | 'taxi' | 'crush' | 'rampage'
  | 'escort' | 'chase' | 'heat' | 'defend';

export type MissionParams =
  | { kind: 'deliverCar'; model: VehicleModelId; garage: number; sx: number; sy: number }
  | { kind: 'assassinate'; tx: number; ty: number; inCar: boolean; guards: number; gang: number }
  | { kind: 'carBomb'; tx: number; ty: number; model: VehicleModelId; gang: number }
  | { kind: 'checkpoint'; points: { tx: number; ty: number }[] }
  | { kind: 'destroyVehicles'; model: VehicleModelId; count: number }
  | { kind: 'taxi'; fromPhone: number; tx: number; ty: number }
  | { kind: 'crush'; model: VehicleModelId }
  | { kind: 'rampage'; weapon: WeaponId; kills: number; target: 'any' | 'gang' | 'cop' }
  /** Pick someone up at the phone and drive them to (tx, ty) while gang cars hunt you. */
  | { kind: 'escort'; fromPhone: number; tx: number; ty: number; attackers: number; gang: number }
  /** A car flees from you; wreck it or kill its driver before it gets away. */
  | { kind: 'chase'; tx: number; ty: number; model: VehicleModelId; gang: number }
  /** Reach the wanted level, then lose the police. */
  | { kind: 'heat'; level: number }
  /** Stay near (tx, ty) for `duration` seconds while waves of gang members attack. gang -1 = every gang. */
  | { kind: 'defend'; tx: number; ty: number; gang: number; waves: number; perWave: number; duration: number };

export interface MissionSpec {
  id: string; kind: MissionKind; title: string;
  /** Gang that gave the job, or -1. */
  giver: number;
  reward: number; respect: number;
  /** Seconds; 0 = no limit. */
  timeLimit: number;
  params: MissionParams;
  /** Set on storyline jobs: which gang's line (-1 = city finale) and which step. */
  story?: { gang: number; step: number };
  /** What the caller says before the job starts, and on the pager when it is done. */
  brief?: { speaker: string; gang: number; lines: string[] };
  outro?: string;
}

export interface MissionSave { spec: MissionSpec; stage: number; timer: number; progress: number }

export const REWARD_FACTOR: Record<MissionKind, number> = {
  deliverCar: 1, assassinate: 1.5, carBomb: 1.8, checkpoint: 1, destroyVehicles: 1.3, taxi: 0.6, crush: 0.8, rampage: 1.2,
  escort: 1.4, chase: 1.3, heat: 1.2, defend: 1.6,
};

export const TARGET_NAMES = ['Kalle Kniv', 'Svenne Banan', 'Doktor Död', 'Lill-Stefan', 'Mästerkocken', 'Tjocke Lasse', 'Grevinnan', 'Bosse Bums'];
