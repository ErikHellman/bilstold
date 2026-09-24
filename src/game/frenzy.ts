import type { World } from '../sim/world';
import type { WeaponId } from './data/weapons';
import { LAW_KINDS } from './wanted';

export interface FrenzyState {
  weapon: WeaponId; need: number; kills: number; timer: number; target: 'any' | 'gang' | 'cop';
  /** Ammo the player had for this weapon before the frenzy; null if they did not own it. */
  savedAmmo: number | null;
}

const FRENZY_WEAPONS: WeaponId[] = ['smg', 'shotgun', 'flamer', 'electro', 'rocket', 'grenade'];

export function startFrenzy(w: World, weapon: WeaponId, need: number, seconds: number, target: FrenzyState['target']): void {
  const had = w.ps.weapons[weapon];
  w.frenzy = { weapon, need, kills: 0, timer: seconds, target, savedAmmo: had !== undefined && had > 0 ? had : null };
  w.ps.weapons[weapon] = 999;
  w.ps.current = weapon;
  w.bus.emit('message', { text: 'KILL FRENZY!', seconds: 2, big: true });
  w.bus.emit('message', { text: `Kill ${need} in ${seconds} seconds`, seconds: 4 });
}

function end(w: World, success: boolean) {
  const f = w.frenzy;
  if (!f) return;
  w.frenzy = null;
  if (f.savedAmmo !== null) w.ps.weapons[f.weapon] = f.savedAmmo;
  else {
    delete w.ps.weapons[f.weapon];
    if (w.ps.current === f.weapon) w.ps.current = 'fists';
  }
  if (success) w.ps.score += 2000 * f.need;
  w.bus.emit('message', { text: success ? 'KILL FRENZY PASSED!' : 'FRENZY FAILED', seconds: 3, big: true });
  w.bus.emit('frenzyEnd', { success });
}

export function registerFrenzy(w: World): void {
  w.bus.on('pedKilled', e => {
    const f = w.frenzy;
    if (!f || e.by !== w.player || e.ped === w.player) return;
    const k = e.ped.kind;
    if (f.target === 'gang' && k !== 'gang') return;
    if (f.target === 'cop' && !LAW_KINDS.has(k)) return;
    if (++f.kills >= f.need) end(w, true);
  });
  w.bus.on('frenzyStart', () => {
    if (w.frenzy || w.mission) return;
    startFrenzy(w, FRENZY_WEAPONS[Math.floor(w.rng() * FRENZY_WEAPONS.length)], 10 + Math.floor(w.rng() * 11), 30, 'any');
  });
  w.bus.on('respawn', () => end(w, false));
}

export function frenzySystem(w: World, dt: number): void {
  const f = w.frenzy;
  if (!f) return;
  f.timer -= dt;
  if (f.timer <= 0) end(w, false);
}
