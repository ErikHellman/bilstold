import { CHEAT_CAR_WEAPONS, CHEAT_POWERUPS } from '../game/cheats';
import { PICKUPS, type PickupId } from '../game/data/pickups';
import { VEHICLES, type VehicleModelId } from '../game/data/vehicles';
import { FOOT_WEAPONS, WEAPONS, type WeaponId } from '../game/data/weapons';
import { el, show } from './overlay';

export interface CheatsOptions {
  inVehicle: boolean;
  godMode: boolean;
  onWeapon: (id: WeaponId) => boolean;
  onRefill: () => void;
  onPowerup: (kind: PickupId) => void;
  onClearWanted: () => void;
  onGodMode: (on: boolean) => void;
  /** Closes the menu so the player can see the new car. */
  onSpawnCar: (model: VehicleModelId) => void;
  onClose: () => void;
}

/** The hidden cheats menu (see src/input/cheatcode.ts for how to open it). */
export function showCheats(o: CheatsOptions): void {
  const status = el('p', { class: 'status', role: 'status' }, 'Pick your poison.');
  const done = (text: string) => { status.textContent = text; };
  const grid = (...buttons: HTMLElement[]) => el('div', { class: 'grid' }, ...buttons);
  const btn = (label: string, onclick: () => void, disabled = false) => el('button', { onclick, disabled }, label);

  let god = o.godMode;
  const godBtn = el('button', {
    class: god ? 'choice active' : 'choice', 'aria-pressed': String(god),
    onclick: () => {
      god = !god; o.onGodMode(god);
      godBtn.className = god ? 'choice active' : 'choice';
      godBtn.setAttribute('aria-pressed', String(god));
      godBtn.textContent = god ? 'God mode: ON' : 'God mode: OFF';
      done(god ? 'God mode on — nothing can hurt you' : 'God mode off');
    },
  }, god ? 'God mode: ON' : 'God mode: OFF');

  const weapon = (id: WeaponId) => btn(WEAPONS[id].name, () => done(o.onWeapon(id) ? `${WEAPONS[id].name} added` : 'Get in a car first'), WEAPONS[id].vehicle && !o.inVehicle);
  const vehicles = Object.keys(VEHICLES) as VehicleModelId[];

  show(el('div', { class: 'panel cheats' },
    el('h2', {}, 'Cheats'),
    status,
    el('h3', {}, 'Weapons'),
    grid(...FOOT_WEAPONS.filter(id => id !== 'fists').map(weapon), btn('Refill all ammo', () => { o.onRefill(); done('Ammo refilled'); })),
    el('h3', {}, 'Car weapons'),
    o.inVehicle ? null : el('p', { class: 'note' }, 'Get in a car to fit car weapons.'),
    grid(...CHEAT_CAR_WEAPONS.map(weapon)),
    el('h3', {}, 'Power-ups'),
    el('div', { class: 'row' }, godBtn),
    grid(...CHEAT_POWERUPS.map(k => btn(PICKUPS[k].name, () => { o.onPowerup(k); done(`${PICKUPS[k].name}!`); })),
      btn('Lose the cops', () => { o.onClearWanted(); done('Wanted level cleared'); })),
    el('h3', {}, 'Spawn a car'),
    grid(...vehicles.map(m => btn(VEHICLES[m].name, () => o.onSpawnCar(m)))),
    el('button', { class: 'primary', onclick: o.onClose }, 'Back to game'),
  ));
}
