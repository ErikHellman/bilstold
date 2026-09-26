import { FogOfWar } from '../src/world/fog';

test('tiles start unrevealed', () => {
  const fog = new FogOfWar(10);
  expect(fog.isRevealed(5, 5)).toBe(false);
});

test('reveal marks tiles within radius as revealed', () => {
  const fog = new FogOfWar(20);
  fog.reveal(10, 10, 3);
  expect(fog.isRevealed(10, 10)).toBe(true);
  expect(fog.isRevealed(12, 10)).toBe(true);
  expect(fog.isRevealed(10, 12)).toBe(true);
});

test('reveal does not mark tiles outside radius', () => {
  const fog = new FogOfWar(20);
  fog.reveal(10, 10, 3);
  expect(fog.isRevealed(19, 19)).toBe(false);
  expect(fog.isRevealed(0, 0)).toBe(false);
});

test('reveal clamps to the grid without throwing near edges', () => {
  const fog = new FogOfWar(10);
  expect(() => fog.reveal(0, 0, 5)).not.toThrow();
  expect(fog.isRevealed(0, 0)).toBe(true);
  expect(() => fog.reveal(9, 9, 5)).not.toThrow();
  expect(fog.isRevealed(9, 9)).toBe(true);
});

test('isRevealed is false for out-of-bounds coordinates', () => {
  const fog = new FogOfWar(10);
  fog.reveal(5, 5, 20);
  expect(fog.isRevealed(-1, 5)).toBe(false);
  expect(fog.isRevealed(5, -1)).toBe(false);
  expect(fog.isRevealed(10, 5)).toBe(false);
  expect(fog.isRevealed(5, 10)).toBe(false);
});

test('version increments only when a new tile is revealed', () => {
  const fog = new FogOfWar(20);
  expect(fog.version).toBe(0);
  fog.reveal(10, 10, 3);
  expect(fog.version).toBe(1);
  fog.reveal(10, 10, 3);
  expect(fog.version).toBe(1);
  fog.reveal(10, 10, 4);
  expect(fog.version).toBe(2);
});

import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { TILE, DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });

test('world reveals fog around the player as it steps', () => {
  const w = new World(testCity(60), 1);
  registerCoreSystems(w);
  w.systemsEnabled.spawner = false;
  const tx = Math.floor(w.player.x / TILE), ty = Math.floor(w.player.y / TILE);
  w.step(idle(), DT);
  expect(w.fog.isRevealed(tx, ty)).toBe(true);
  expect(w.fog.isRevealed(tx + 40, ty + 40)).toBe(false);
});
