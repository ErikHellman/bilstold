import { TILE } from '../../core/const';
import { derive, makeRng } from '../../core/rng';
import type { World } from '../../sim/world';
import type { City } from '../../world/citygen';
import { T } from '../../world/tiles';
import { addPoints } from '../score';

export const PACKAGES_PER_CITY = 20;
/** Packages found → what you get every time you respawn. */
export const PACKAGE_REWARDS: { at: number; text: string }[] = [
  { at: 5, text: 'Pistol at every respawn' },
  { at: 10, text: 'SMG at every respawn' },
  { at: 15, text: 'Shotgun at every respawn' },
  { at: 20, text: 'Rockets and armor at every respawn' },
];

export interface Package { id: number; x: number; y: number }
const cache = new WeakMap<City, Package[]>();

/** Twenty hidden packages per city, tucked into parks, plazas and car parks, spread across the map. */
export function packageSpots(c: City): Package[] {
  let list = cache.get(c);
  if (list) return list;
  const r = makeRng(derive(c.seed, 'packages', c.index));
  const ok = (t: number) => t === T.Grass || t === T.Plaza || t === T.Parking;
  list = [];
  for (let tries = 0; tries < 20000 && list.length < PACKAGES_PER_CITY; tries++) {
    const tx = Math.floor(r() * c.size), ty = Math.floor(r() * c.size);
    if (!ok(c.tiles[ty * c.size + tx])) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    const minGap = tries < 15000 ? 25 * TILE : 8 * TILE;
    if (list.some(p => Math.hypot(p.x - x, p.y - y) < minGap)) continue;
    list.push({ id: list.length, x, y });
  }
  cache.set(c, list);
  return list;
}

export function packagesSystem(w: World): void {
  if (w.tick % 6 !== 0 || w.player.dead) return;
  const src = w.player.vehicle ?? w.player, ps = w.ps;
  for (const p of packageSpots(w.city)) {
    if (ps.packages.includes(p.id) || Math.hypot(p.x - src.x, p.y - src.y) > 20) continue;
    ps.packages.push(p.id);
    const n = ps.packages.length;
    w.bus.emit('message', { text: `Hidden package ${n}/${PACKAGES_PER_CITY} +$${addPoints(w, 1000 * n)}`, seconds: 3 });
    const reward = PACKAGE_REWARDS.find(r => r.at === n);
    if (reward) w.bus.emit('message', { text: `Unlocked: ${reward.text}`, seconds: 4 });
    w.bus.emit('pickup', { kind: 'health' });
  }
}

/** Gear the found packages give you back after being wasted or busted. */
export function registerPackageRewards(w: World): void {
  w.bus.on('respawn', e => {
    if (e.kind === 'gameover') return;
    const n = w.ps.packages.length, wp = w.ps.weapons;
    if (n >= 5) wp.pistol = Math.max(wp.pistol ?? 0, 60);
    if (n >= 10) wp.smg = Math.max(wp.smg ?? 0, 150);
    if (n >= 15) wp.shotgun = Math.max(wp.shotgun ?? 0, 30);
    if (n >= 20) { wp.rocket = Math.max(wp.rocket ?? 0, 10); w.player.armor = 100; }
  });
}
