import type { City } from '../src/world/citygen';
import { T, DIR } from '../src/world/tiles';
import { Bus, type GameEvents } from '../src/core/events';

/** A synthetic open city: every tile the same type, all directions allowed. */
export function testCity(size = 40, fill: number = T.Road): City {
  const n = size * size;
  const tiles = new Uint8Array(n).fill(fill);
  return {
    seed: 0, index: 1, size, tiles, height: new Uint8Array(n),
    roadDir: new Uint8Array(n).fill(DIR.E | DIR.W | DIR.N | DIR.S),
    district: new Uint8Array(n), gangZone: new Uint8Array(n), landmarks: [], gangs: [], startX: 64, startY: 64,
  };
}
export function setTile(c: City, tx: number, ty: number, t: number, h = 3) {
  c.tiles[ty * c.size + tx] = t;
  c.height[ty * c.size + tx] = h;
}
export const bus = () => new Bus<GameEvents>();
