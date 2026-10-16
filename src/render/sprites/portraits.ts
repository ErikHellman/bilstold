import type { Boss } from '../../game/story/characters';
import { ctx2d, makeCanvas, shade, type Canvas } from '../canvas';

const SKIN = ['#f1c9a5', '#d9a77e', '#a86b45', '#6b4128'];
const HAIR = ['#2b2118', '#c9a14a', '#8a3b1d', '#d0d0d0'];

/** A 24×24 pixel-art bust of a gang boss in their gang colour. Unknown callers are a silhouette. */
export function makePortrait(look: Boss['look'] | null, color: string, seed = 0): Canvas {
  const c = makeCanvas(24, 24), x = ctx2d(c);
  const px = (col: string, r: number[][]) => { x.fillStyle = col; for (const [a, b, w, h] of r) x.fillRect(a, b, w, h); };
  px('#14161b', [[0, 0, 24, 24]]);
  px(shade(color, 0.35), [[0, 18, 24, 6]]);
  if (!look) {
    px('#30343c', [[7, 4, 10, 11], [4, 15, 16, 9]]);
    px('#f1c40f', [[11, 8, 2, 3], [11, 12, 2, 1]]);
    return c;
  }
  const skin = SKIN[look.skin % SKIN.length], hair = HAIR[seed % HAIR.length];
  // shoulders and jacket in gang colour
  px(color, [[3, 17, 18, 7]]);
  px(shade(color, 0.7), [[10, 17, 4, 7]]);
  // neck and head
  px(skin, [[10, 14, 4, 3], [7, 5, 10, 10]]);
  px(shade(skin, 0.8), [[7, 13, 10, 2]]);
  // hair
  switch (look.hair) {
    case 'short': px(hair, [[7, 4, 10, 2], [6, 5, 1, 4], [17, 5, 1, 4]]); break;
    case 'long': px(hair, [[6, 3, 12, 3], [5, 5, 2, 12], [17, 5, 2, 12]]); break;
    case 'mohawk': px(hair, [[11, 1, 2, 5]]); break;
    case 'cap': px(shade(color, 0.6), [[6, 3, 12, 3], [5, 5, 15, 1]]); break;
    case 'bald': px(shade(skin, 1.15), [[9, 5, 3, 1]]); break;
  }
  // eyes or shades
  if (look.shades) px('#111', [[8, 8, 3, 2], [13, 8, 3, 2], [11, 8, 2, 1]]);
  else px('#111', [[9, 8, 1, 2], [14, 8, 1, 2]]);
  // beard or mouth
  if (look.beard) px(hair, [[8, 12, 8, 3], [7, 11, 1, 2], [16, 11, 1, 2]]);
  px('#5a2a22', [[10, 12, 4, 1]]);
  return c;
}
