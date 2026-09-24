import { Input } from '../src/input/input';

function key(t: EventTarget, type: string, code: string, extra: object = {}) {
  const e = new Event(type) as any;
  e.code = code;
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(e, k, { value: v });
  t.dispatchEvent(e);
}
const pad = (axes: number[], pressed: number[]) => ({
  connected: true, mapping: 'standard', axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

test('keyboard maps to analog state and edges', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []);
  key(t, 'keydown', 'ArrowUp'); key(t, 'keydown', 'KeyA'); key(t, 'keydown', 'Enter');
  let s = inp.poll();
  expect(s.accel).toBe(1); expect(s.steer).toBe(-1); expect(s.pressed.has('enter')).toBe(true);
  s = inp.poll();
  expect(s.pressed.has('enter')).toBe(false); expect(s.accel).toBe(1);
  key(t, 'keyup', 'ArrowUp');
  expect(inp.poll().accel).toBe(0);
});
test('key repeat does not re-trigger edge actions', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []);
  key(t, 'keydown', 'KeyE'); inp.poll();
  key(t, 'keydown', 'KeyE', { repeat: true });
  expect(inp.poll().pressed.has('weaponNext')).toBe(false);
});
test('blur releases everything', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []);
  key(t, 'keydown', 'KeyW'); t.dispatchEvent(new Event('blur'));
  expect(inp.poll().accel).toBe(0);
});
test('disabled input (text field focused) produces nothing', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []); inp.enabled = false;
  key(t, 'keydown', 'KeyW');
  expect(inp.poll().accel).toBe(0);
});
test('events from input elements are ignored', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []);
  key(t, 'keydown', 'KeyW', { target: { tagName: 'INPUT' } });
  expect(inp.poll().accel).toBe(0);
});
test('gamepad axes, triggers, edges and disconnect', () => {
  let pads: any[] = [pad([0.8, 0], [7])];
  const inp = new Input(new EventTarget(), () => pads);
  let s = inp.poll();
  expect(s.steer).toBeCloseTo(0.8); expect(s.accel).toBe(1); expect(inp.lastDevice).toBe('gamepad');
  pads = [pad([0.1, 0], [0])];
  s = inp.poll();
  expect(s.steer).toBe(0); expect(s.pressed.has('enter')).toBe(true);
  expect(inp.poll().pressed.has('enter')).toBe(false);
  pads = [];
  s = inp.poll();
  expect(s.steer).toBe(0); expect(s.accel).toBe(0);
});
