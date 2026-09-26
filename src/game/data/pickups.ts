export type PickupId = 'w_pistol' | 'w_smg' | 'w_shotgun' | 'w_electro' | 'w_flamer' | 'w_molotov' | 'w_grenade' | 'w_rocket'
  | 'c_mg' | 'c_oil' | 'c_mines' | 'health' | 'armor' | 'bribe' | 'jailFree' | 'life' | 'multiplier'
  | 'doubleDamage' | 'fastReload' | 'invuln' | 'electroFingers' | 'frenzy';

import type { WeaponId } from './weapons';

export interface PickupDef { name: string; once: boolean; respawn: number; weapon?: WeaponId; car?: boolean }

const wp = (name: string, weapon: WeaponId, car = false): PickupDef => ({ name, once: false, respawn: 60, weapon, car });

export const PICKUPS: Record<PickupId, PickupDef> = {
  w_pistol: wp('Pistol', 'pistol'), w_smg: wp('Kulspruta', 'smg'), w_shotgun: wp('Hagelgevär', 'shotgun'),
  w_electro: wp('Elpistol', 'electro'), w_flamer: wp('Eldkastare', 'flamer'), w_molotov: wp('Molotovs', 'molotov'),
  w_grenade: wp('Granater', 'grenade'), w_rocket: wp('Raketgevär', 'rocket'),
  c_mg: wp('Car machine guns', 'carMG', true), c_oil: wp('Oil slicks', 'oil', true), c_mines: wp('Car mines', 'mines', true),
  health: { name: 'Health', once: false, respawn: 90 }, armor: { name: 'Armor', once: false, respawn: 90 },
  bribe: { name: 'Cop bribe', once: false, respawn: 60 }, jailFree: { name: 'Get Outta Jail Free', once: true, respawn: 0 },
  life: { name: 'Extra life', once: true, respawn: 0 }, multiplier: { name: 'Multiplier bonus', once: true, respawn: 0 },
  doubleDamage: { name: 'Double damage', once: false, respawn: 60 }, fastReload: { name: 'Fast reload', once: false, respawn: 60 },
  invuln: { name: 'Invulnerability', once: false, respawn: 60 }, electroFingers: { name: 'Electro fingers', once: false, respawn: 60 },
  frenzy: { name: 'Kill frenzy', once: true, respawn: 0 },
};

/** How many of each non-car crate a city gets (64 in total). */
export const PICKUP_MIX: [PickupId, number][] = [
  ['w_pistol', 6], ['w_smg', 5], ['w_shotgun', 5], ['w_electro', 2], ['w_flamer', 2], ['w_molotov', 3], ['w_grenade', 2], ['w_rocket', 2],
  ['health', 9], ['armor', 5], ['bribe', 3], ['jailFree', 2], ['life', 2], ['multiplier', 2],
  ['doubleDamage', 2], ['fastReload', 2], ['invuln', 2], ['electroFingers', 2], ['frenzy', 6],
];
export const CAR_PICKUPS: PickupId[] = ['c_mg', 'c_mg', 'c_oil', 'c_oil', 'c_mines', 'c_mines'];
