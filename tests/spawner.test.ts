import { createSession } from '../src/game/session';
import { DT, CAP_PARKED } from '../src/core/const';
import { isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const parked = (w: any) => w.vehicles.items.filter((v: any) => v.active && v.parked);

test('parked cars spawn deterministically near player and respect cap', () => {
  const a = createSession('parktest', 1).world, b = createSession('parktest', 1).world;
  a.step(idle(), DT); b.step(idle(), DT);
  const pa = parked(a).map((v: any) => [v.model, Math.round(v.x), Math.round(v.y)]);
  const pb = parked(b).map((v: any) => [v.model, Math.round(v.x), Math.round(v.y)]);
  expect(pa.length).toBeGreaterThan(3);
  expect(pa).toEqual(pb);
  expect(pa.length).toBeLessThanOrEqual(CAP_PARKED);
  for (const v of parked(a)) expect(isWalkable(tileAtWorld(a.city, v.x, v.y))).toBe(true);
});
test('parked cars far away are removed and a stolen car does not reappear', () => {
  const { world: w } = createSession('parktest', 1);
  w.step(idle(), DT);
  const v = parked(w)[0];
  const spot = [Math.round(v.x), Math.round(v.y)];
  w.player.vehicle = v; v.driver = w.player; v.parked = false;
  w.bus.emit('enterCar', { vehicle: v });
  w.removeVehicle(v);
  const home = { x: w.player.x, y: w.player.y };
  w.player.x = 150 * 32; w.player.y = 150 * 32;
  for (let i = 0; i < 60; i++) w.step(idle(), DT);
  expect(parked(w).every((c: any) => Math.hypot(c.x - home.x, c.y - home.y) > 900)).toBe(true);
  w.player.x = home.x; w.player.y = home.y;
  for (let i = 0; i < 60; i++) w.step(idle(), DT);
  expect(parked(w).some((c: any) => Math.round(c.x) === spot[0] && Math.round(c.y) === spot[1])).toBe(false);
});
