import { Input, type InputState } from '../src/input/input';
import { testCity } from './helpers';
import { World } from '../src/sim/world';
import { registerCoreSystems } from '../src/game/session';
import { DT, TILE } from '../src/core/const';

const idle = (): InputState => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() });

test('touch stick and buttons merge into the input state', () => {
  const inp = new Input(new EventTarget(), () => []);
  inp.setTouch({ x: 1, y: 0, fire: true, handbrake: false, brake: true });
  const s = inp.poll();
  expect(s.moveX).toBeCloseTo(1); expect(s.moveY).toBeCloseTo(0);
  expect(s.absolute).toBe(true); expect(s.fire).toBe(true); expect(s.brake).toBe(1);
  expect(inp.lastDevice).toBe('touch');
});
test('a stick inside the deadzone does nothing', () => {
  const inp = new Input(new EventTarget(), () => []);
  inp.setTouch({ x: 0.1, y: 0.05, fire: false, handbrake: false, brake: false });
  const s = inp.poll();
  expect(s.moveX).toBe(0); expect(s.absolute).toBe(false);
});
test('taps are one-tick edges and ignored while input is disabled', () => {
  const inp = new Input(new EventTarget(), () => []);
  inp.tap('map');
  expect(inp.poll().pressed.has('map')).toBe(true);
  expect(inp.poll().pressed.has('map')).toBe(false);
  inp.enabled = false; inp.tap('map');
  expect(inp.poll().pressed.has('map')).toBe(false);
});

function driving() {
  const w = new World(testCity(60), 1); registerCoreSystems(w); w.systemsEnabled.spawner = false;
  const v = w.spawnVehicle('sedan', 30 * TILE, 30 * TILE, 0, 0, true)!;
  w.player.vehicle = v; v.driver = w.player; v.parked = false;
  return { w, v };
}
test('in a car the touch stick steers towards where it points', () => {
  const { w, v } = driving();
  const i = { ...idle(), moveX: 0, moveY: 1, absolute: true }; // car faces east, stick points south (down)
  w.step(i, DT);
  expect(v.steer).toBeGreaterThan(0); expect(v.throttle).toBeGreaterThan(0);
  for (let n = 0; n < 120; n++) w.step(i, DT);
  expect(Math.abs(Math.sin(v.angle) - 1)).toBeLessThan(0.2);
});
test('pointing the stick behind the car reverses', () => {
  const { w, v } = driving();
  w.step({ ...idle(), moveX: -1, moveY: 0, absolute: true }, DT);
  expect(v.throttle).toBe(0); expect(v.brake).toBeGreaterThan(0);
});
