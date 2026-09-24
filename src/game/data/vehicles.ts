export type VehicleModelId = 'compact' | 'sedan' | 'sports' | 'muscle' | 'taxi' | 'pickup' | 'van' | 'truck' | 'bus'
  | 'icecream' | 'police' | 'swat' | 'fbi' | 'ambulance' | 'firetruck' | 'tank' | 'bike';
export type VehicleRole = 'civ' | 'taxi' | 'bus' | 'icecream' | 'police' | 'swat' | 'fbi' | 'army' | 'ambulance' | 'fire';
export interface VehicleModel {
  id: VehicleModelId; name: string; kind: 'car' | 'bike' | 'tank'; role: VehicleRole;
  length: number; width: number; mass: number; accel: number; maxSpeed: number; reverse: number;
  turn: number; grip: number; health: number; weight: number; value: number; colors: string[];
}
