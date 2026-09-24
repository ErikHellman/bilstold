import type { VehicleModelId, VehicleModel } from '../game/data/vehicles';
import type { WeaponId } from '../game/data/weapons';
import type { PickupId } from '../game/data/pickups';

export type PedKind = 'player' | 'civ' | 'businessman' | 'elder' | 'criminal' | 'gang' | 'cop' | 'swat'
  | 'fbi' | 'soldier' | 'medic' | 'fireman' | 'target' | 'passenger';
export type PedMode = 'idle' | 'wander' | 'flee' | 'chase' | 'attack' | 'enterCar' | 'drive' | 'arrest'
  | 'mug' | 'stealCar' | 'revive' | 'extinguish' | 'follow' | 'passenger';

export interface PedAI { mode: PedMode; target: Ped | null; targetCar: Vehicle | null; timer: number; tx: number; ty: number; dir: number }
export interface Ped {
  id: number; active: boolean; kind: PedKind; skin: number;
  x: number; y: number; angle: number; vx: number; vy: number;
  health: number; armor: number; dead: boolean; deadTime: number;
  /** Seconds remaining. */
  burning: number; shocked: number; knocked: number;
  vehicle: Vehicle | null;
  weapon: WeaponId; ammo: number; cooldown: number;
  /** -1 = none */
  gang: number;
  ai: PedAI; anim: number;
  /** Never despawned (mission targets, player). */
  persistent: boolean;
}

export type DriveMode = 'none' | 'cruise' | 'flee' | 'chase' | 'respond' | 'block' | 'goto';
export interface DriveAI { mode: DriveMode; dir: number; turnedHere: boolean; lastTile: number; target: Ped | Vehicle | null; tx: number; ty: number; stuck: number; honk: number }
export interface Vehicle {
  id: number; active: boolean; model: VehicleModelId; def: VehicleModel; color: number;
  x: number; y: number; angle: number; vx: number; vy: number; angVel: number;
  /** Control inputs set by player/AI each tick. */
  throttle: number; steer: number; brake: number; handbrake: boolean;
  health: number; burning: number; wreck: boolean; sinking: number;
  driver: Ped | null; parked: boolean; siren: boolean;
  ai: DriveAI; bomb: 'none' | 'armed' | 'timed'; bombTimer: number;
  carWeapon: WeaponId | null; carAmmo: number;
  persistent: boolean; lastHitBy: Ped | null; skid: number;
}

export type ProjKind = 'bullet' | 'flame' | 'arc' | 'thrown' | 'rocket' | 'shell';
export interface Projectile {
  id: number; active: boolean; kind: ProjKind; weapon: WeaponId; owner: Ped | null;
  x: number; y: number; vx: number; vy: number; life: number; damage: number;
}
export interface Pickup { id: number; active: boolean; kind: PickupId; x: number; y: number; respawn: number; fixed: boolean }
export interface Explosion { id: number; active: boolean; x: number; y: number; r: number; t: number; owner: Ped | null }
export interface Fire { id: number; active: boolean; x: number; y: number; life: number }
export interface Hazard { id: number; active: boolean; kind: 'oil' | 'mine'; x: number; y: number; life: number; owner: Ped | null }

export interface Wanted { level: number; heat: number; unseen: number }
export interface PowerUps { doubleDamage: number; fastReload: number; invuln: number; electroFingers: number }
export interface PlayerState {
  score: number; multiplier: number; lives: number; cityStartScore: number;
  /** Ammo per weapon; Infinity for fists (serialized as -1). */
  weapons: Partial<Record<WeaponId, number>>;
  current: WeaponId;
  wanted: Wanted; respect: number[]; powerups: PowerUps; jailFree: boolean;
  missionsDone: number; kills: number; playTime: number;
  deathState: 'alive' | 'wasted' | 'busted'; deathTimer: number;
}
