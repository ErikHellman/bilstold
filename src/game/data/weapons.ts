export type WeaponId = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'electro' | 'flamer' | 'molotov' | 'grenade' | 'rocket'
  | 'carMG' | 'oil' | 'mines' | 'carBomb' | 'tankGun';

export interface WeaponDef {
  id: WeaponId; name: string;
  kind: 'melee' | 'bullet' | 'arc' | 'flame' | 'thrown' | 'rocket' | 'shell' | 'drop' | 'bomb';
  damage: number; cooldown: number; speed: number; range: number; spread: number; pellets: number;
  ammoPickup: number; maxAmmo: number; vehicle: boolean; severity: number;
}

const w = (id: WeaponId, name: string, kind: WeaponDef['kind'], damage: number, cooldown: number, speed: number, range: number,
  spread: number, pellets: number, ammoPickup: number, maxAmmo: number, vehicle: boolean, severity: number): WeaponDef =>
  ({ id, name, kind, damage, cooldown, speed, range, spread, pellets, ammoPickup, maxAmmo, vehicle, severity });

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists:   w('fists', 'Fists', 'melee', 8, 0.35, 0, 16, 0, 1, 0, 0, false, 1),
  pistol:  w('pistol', 'Pistol', 'bullet', 25, 0.35, 900, 420, 0.015, 1, 30, 99, false, 2),
  smg:     w('smg', 'Kulspruta', 'bullet', 14, 0.08, 900, 380, 0.08, 1, 90, 999, false, 2),
  shotgun: w('shotgun', 'Hagelgevär', 'bullet', 12, 0.8, 800, 260, 0.25, 6, 20, 99, false, 2),
  electro: w('electro', 'Elpistol', 'arc', 6, 0.1, 0, 150, 0.5, 1, 100, 999, false, 2),
  flamer:  w('flamer', 'Eldkastare', 'flame', 3, 0.04, 260, 130, 0.15, 1, 200, 999, false, 3),
  molotov: w('molotov', 'Molotov', 'thrown', 0, 0.8, 300, 240, 0, 1, 5, 20, false, 3),
  grenade: w('grenade', 'Granat', 'thrown', 0, 0.8, 300, 240, 0, 1, 5, 20, false, 3),
  rocket:  w('rocket', 'Raketgevär', 'rocket', 200, 1.0, 500, 600, 0, 1, 5, 20, false, 4),
  carMG:   w('carMG', 'Bilkulspruta', 'bullet', 14, 0.1, 1000, 420, 0.05, 1, 200, 999, true, 2),
  oil:     w('oil', 'Oljefläck', 'drop', 0, 0.5, 0, 0, 0, 1, 10, 20, true, 1),
  mines:   w('mines', 'Minor', 'drop', 0, 0.8, 0, 0, 0, 1, 5, 20, true, 3),
  carBomb: w('carBomb', 'Bilbomb', 'bomb', 0, 1, 0, 0, 0, 1, 1, 1, true, 4),
  tankGun: w('tankGun', 'Kanon', 'shell', 250, 1.2, 600, 700, 0, 1, 0, 0, true, 4),
};

export const FOOT_WEAPONS: WeaponId[] = ['fists', 'pistol', 'smg', 'shotgun', 'electro', 'flamer', 'molotov', 'grenade', 'rocket'];
export const CAR_WEAPONS: WeaponId[] = ['carMG', 'oil', 'mines', 'carBomb', 'tankGun'];
