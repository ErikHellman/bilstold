import type { PickupId } from '../../game/data/pickups';
import type { WeaponId } from '../../game/data/weapons';
import { makeCanvas, ctx2d, type Canvas, type Ctx } from '../canvas';
import { drawText } from '../font';

function icon(w: number, h: number, draw: (x: Ctx) => void): Canvas {
  const c = makeCanvas(w, h);
  draw(ctx2d(c));
  return c;
}

const px = (x: Ctx, color: string, rects: number[][]) => {
  x.fillStyle = color;
  for (const [a, b, c, d] of rects) x.fillRect(a, b, c, d);
};

/** 16×16 weapon silhouettes. */
function weaponIcon(id: WeaponId): Canvas {
  return icon(16, 16, x => {
    const g = '#d8d8d8', dk = '#7a7a7a';
    switch (id) {
      case 'fists': px(x, '#e0b089', [[4, 5, 8, 7], [3, 6, 1, 5], [12, 6, 1, 4]]); px(x, '#b8865f', [[5, 7, 1, 1], [7, 7, 1, 1], [9, 7, 1, 1]]); break;
      case 'pistol': px(x, g, [[3, 5, 10, 3], [4, 8, 3, 5]]); px(x, dk, [[11, 5, 2, 1]]); break;
      case 'smg': px(x, g, [[2, 5, 12, 3], [5, 8, 2, 5], [9, 8, 2, 3]]); px(x, dk, [[1, 6, 1, 1]]); break;
      case 'shotgun': px(x, '#8b5a2b', [[1, 7, 5, 3]]); px(x, g, [[6, 6, 9, 2], [6, 8, 6, 1]]); break;
      case 'electro': px(x, '#7fd3ff', [[3, 5, 9, 4], [4, 9, 3, 4]]); px(x, '#fff', [[12, 4, 2, 1], [13, 6, 2, 1], [12, 8, 2, 1]]); break;
      case 'flamer': px(x, '#c0392b', [[2, 5, 4, 7]]); px(x, g, [[6, 7, 7, 2]]); px(x, '#ff9f1a', [[13, 6, 2, 4]]); break;
      case 'molotov': px(x, '#6b8e23', [[6, 5, 4, 9]]); px(x, '#ddd', [[7, 2, 2, 3]]); px(x, '#ff9f1a', [[7, 0, 2, 2]]); break;
      case 'grenade': px(x, '#3d5a2a', [[4, 5, 8, 9]]); px(x, g, [[6, 2, 4, 3], [10, 3, 3, 1]]); break;
      case 'rocket': px(x, '#556b2f', [[1, 6, 13, 4]]); px(x, '#ddd', [[13, 5, 3, 6]]); px(x, dk, [[5, 10, 2, 3]]); break;
      case 'carMG': px(x, g, [[1, 4, 10, 2], [1, 10, 10, 2]]); px(x, '#555', [[9, 3, 4, 10]]); break;
      case 'oil': px(x, '#111', [[2, 6, 12, 6], [4, 4, 8, 10]]); px(x, '#444', [[5, 6, 3, 2]]); break;
      case 'mines': px(x, '#333', [[3, 3, 10, 10]]); px(x, '#f33', [[7, 7, 2, 2]]); break;
      case 'carBomb': px(x, '#222', [[3, 5, 10, 8]]); px(x, '#f33', [[5, 7, 6, 4]]); px(x, '#ddd', [[7, 2, 2, 3]]); break;
      case 'tankGun': px(x, '#556b2f', [[2, 5, 8, 7], [10, 7, 6, 3]]); break;
    }
  });
}

const PICKUP_COLOR: Partial<Record<PickupId, string>> = {
  health: '#e74c3c', armor: '#3498db', bribe: '#2ecc71', jailFree: '#f1c40f', life: '#ff7ab6', multiplier: '#9b59b6',
  doubleDamage: '#e67e22', fastReload: '#1abc9c', invuln: '#ecf0f1', electroFingers: '#7fd3ff', frenzy: '#c0392b',
};
const PICKUP_GLYPH: Partial<Record<PickupId, string>> = {
  health: '+', armor: '#', bribe: '$', jailFree: 'J', life: '♥', multiplier: 'X', doubleDamage: '2', fastReload: '>', invuln: '*', electroFingers: '!',
};

export interface Icons {
  weapon: Record<WeaponId, Canvas>;
  pickup: Record<PickupId, Canvas>;
  heart: Canvas[]; // full, half, empty
  copHead: Canvas[]; // off, red, blue
  person: Canvas;
}

export function makeIcons(): Icons {
  const weapon = {} as Record<WeaponId, Canvas>;
  for (const id of ['fists', 'pistol', 'smg', 'shotgun', 'electro', 'flamer', 'molotov', 'grenade', 'rocket', 'carMG', 'oil', 'mines', 'carBomb', 'tankGun'] as WeaponId[])
    weapon[id] = weaponIcon(id);
  const pickup = {} as Record<PickupId, Canvas>;
  const ids: PickupId[] = ['w_pistol', 'w_smg', 'w_shotgun', 'w_electro', 'w_flamer', 'w_molotov', 'w_grenade', 'w_rocket', 'c_mg', 'c_oil', 'c_mines',
    'health', 'armor', 'bribe', 'jailFree', 'life', 'multiplier', 'doubleDamage', 'fastReload', 'invuln', 'electroFingers', 'frenzy'];
  for (const id of ids) pickup[id] = icon(16, 16, x => {
    if (id === 'frenzy') {
      px(x, '#eee', [[4, 2, 8, 8], [5, 10, 6, 3]]); px(x, '#111', [[5, 5, 2, 2], [9, 5, 2, 2], [7, 8, 2, 1], [6, 11, 1, 2], [9, 11, 1, 2]]);
      return;
    }
    px(x, '#6b4a2b', [[1, 1, 14, 14]]); px(x, '#8b6a45', [[2, 2, 12, 12]]); px(x, '#5a3d22', [[2, 7, 12, 2], [7, 2, 2, 12]]);
    if (id.startsWith('w_') || id.startsWith('c_')) {
      const map: Record<string, WeaponId> = { w_pistol: 'pistol', w_smg: 'smg', w_shotgun: 'shotgun', w_electro: 'electro', w_flamer: 'flamer',
        w_molotov: 'molotov', w_grenade: 'grenade', w_rocket: 'rocket', c_mg: 'carMG', c_oil: 'oil', c_mines: 'mines' };
      x.drawImage(weapon[map[id]], 1, 1, 14, 14);
    } else {
      px(x, PICKUP_COLOR[id] ?? '#fff', [[3, 3, 10, 10]]);
      drawText(x, PICKUP_GLYPH[id] ?? '?', 8, 4, '#111', 1, 'center', false);
    }
  });
  const heartShape = (x: Ctx, color: string, half = false) => {
    px(x, '#000', [[0, 1, 9, 5], [1, 0, 3, 1], [5, 0, 3, 1], [1, 6, 7, 1], [2, 7, 5, 1], [3, 8, 3, 1]]);
    px(x, '#444', [[1, 1, 7, 5], [2, 6, 5, 1], [3, 7, 3, 1]]);
    x.save();
    if (half) { x.beginPath(); x.rect(0, 0, 4.5, 9); x.clip(); }
    px(x, color, [[1, 1, 7, 5], [2, 6, 5, 1], [3, 7, 3, 1]]);
    x.restore();
    if (color !== '#444') px(x, '#ffb3b3', [[2, 2, 2, 1]]);
  };
  const heart = [icon(9, 9, x => heartShape(x, '#e0283c')), icon(9, 9, x => heartShape(x, '#e0283c', true)), icon(9, 9, x => heartShape(x, '#444'))];
  const head = (cap: string) => icon(11, 11, x => {
    px(x, '#000', [[1, 1, 9, 9]]); px(x, '#e0b089', [[2, 4, 7, 5]]); px(x, cap, [[2, 2, 7, 3], [1, 4, 9, 1]]);
    px(x, '#111', [[3, 6, 1, 1], [7, 6, 1, 1]]);
  });
  const copHead = [head('#333'), head('#e74c3c'), head('#3498db')];
  const person = icon(7, 9, x => { px(x, '#f2c230', [[1, 3, 5, 4]]); px(x, '#e0b089', [[2, 0, 3, 3]]); px(x, '#2b3a67', [[1, 7, 2, 2], [4, 7, 2, 2]]); });
  return { weapon, pickup, heart, copHead, person };
}
