export type VehicleModelId = 'compact' | 'sedan' | 'sports' | 'muscle' | 'taxi' | 'pickup' | 'van' | 'truck' | 'bus'
  | 'icecream' | 'police' | 'swat' | 'fbi' | 'ambulance' | 'firetruck' | 'tank' | 'bike';
export type VehicleRole = 'civ' | 'taxi' | 'bus' | 'icecream' | 'police' | 'swat' | 'fbi' | 'army' | 'ambulance' | 'fire';
export interface VehicleModel {
  id: VehicleModelId; name: string; kind: 'car' | 'bike' | 'tank'; role: VehicleRole;
  length: number; width: number; mass: number; accel: number; maxSpeed: number; reverse: number;
  turn: number; grip: number; health: number; weight: number; value: number; colors: string[];
}

const civColors = ['#c0392b', '#2e86de', '#f1c40f', '#27ae60', '#ecf0f1', '#2d3436', '#8e44ad', '#e67e22', '#95a5a6', '#16a085'];

const m = (id: VehicleModelId, name: string, kind: VehicleModel['kind'], role: VehicleRole, length: number, width: number,
  mass: number, accel: number, maxSpeed: number, turn: number, grip: number, health: number, weight: number, value: number,
  colors = civColors): VehicleModel =>
  ({ id, name, kind, role, length, width, mass, accel, maxSpeed, reverse: maxSpeed * 0.35, turn, grip, health, weight, value, colors });

export const VEHICLES: Record<VehicleModelId, VehicleModel> = {
  compact:   m('compact', 'Kvick', 'car', 'civ', 38, 20, 900, 260, 380, 3.4, 9, 70, 10, 2000),
  sedan:     m('sedan', 'Pendlare', 'car', 'civ', 44, 22, 1200, 280, 420, 3.0, 8, 90, 10, 3000),
  sports:    m('sports', 'Blixten', 'car', 'civ', 44, 22, 1100, 420, 560, 3.3, 9, 80, 3, 8000),
  muscle:    m('muscle', 'Tjuren', 'car', 'civ', 46, 23, 1400, 380, 520, 2.8, 7, 100, 3, 6000),
  taxi:      m('taxi', 'Taxi', 'car', 'taxi', 44, 22, 1200, 280, 420, 3.0, 8, 90, 5, 3000, ['#f5c518']),
  pickup:    m('pickup', 'Flakis', 'car', 'civ', 48, 24, 1600, 260, 400, 2.7, 7, 110, 6, 3000),
  van:       m('van', 'Skåpis', 'car', 'civ', 50, 25, 1900, 220, 360, 2.4, 6, 120, 6, 2500),
  truck:     m('truck', 'Långtradare', 'car', 'civ', 72, 28, 5000, 160, 300, 1.7, 5, 200, 3, 4000),
  bus:       m('bus', 'Buss', 'car', 'bus', 80, 28, 6000, 150, 280, 1.5, 5, 220, 2, 3500, ['#d63031', '#0984e3']),
  icecream:  m('icecream', 'Glassbil', 'car', 'icecream', 50, 25, 1900, 200, 340, 2.4, 6, 110, 1, 2500, ['#fdcfe8']),
  police:    m('police', 'Polis', 'car', 'police', 46, 22, 1400, 400, 540, 3.1, 9, 130, 0, 5000, ['#f5f6fa']),
  swat:      m('swat', 'Insats', 'car', 'swat', 56, 27, 3000, 280, 440, 2.3, 7, 250, 0, 7000, ['#2d3436']),
  fbi:       m('fbi', 'SÄPO', 'car', 'fbi', 48, 23, 1600, 440, 580, 3.0, 9, 160, 0, 7000, ['#1e272e']),
  ambulance: m('ambulance', 'Ambulans', 'car', 'ambulance', 54, 26, 2200, 280, 440, 2.5, 7, 140, 0, 4000, ['#ffffff']),
  firetruck: m('firetruck', 'Brandbil', 'car', 'fire', 72, 28, 6000, 200, 360, 1.7, 6, 250, 0, 6000, ['#c0392b']),
  tank:      m('tank', 'Stridsvagn', 'tank', 'army', 64, 38, 40000, 140, 200, 1.8, 20, 1500, 0, 20000, ['#556b2f']),
  bike:      m('bike', 'Moppe', 'bike', 'civ', 28, 10, 250, 360, 480, 4.0, 10, 40, 3, 1500),
};

export const CIV_MODELS = (Object.keys(VEHICLES) as VehicleModelId[]).filter(k => VEHICLES[k].weight > 0);
