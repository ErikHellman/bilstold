import { FOG_REVEAL_RADIUS, TILE } from '../core/const';
import type { World } from '../sim/world';

/** Reveals the map screen's fog around the player as they explore. */
export function fogSystem(w: World): void {
  if (w.tick % 6 !== 0) return;
  const tx = Math.floor(w.player.x / TILE), ty = Math.floor(w.player.y / TILE);
  w.fog.reveal(tx, ty, FOG_REVEAL_RADIUS);
}
