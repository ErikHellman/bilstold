import { testCity, setTile, bus } from './helpers';
import { makeVehicle, resetVehicle, stepVehicle, forwardSpeed, resolveVehiclePair, doorPoint } from '../src/sim/vehicle';
import { VEHICLES, CIV_MODELS } from '../src/game/data/vehicles';
import { isSolidWorld } from '../src/world/query';
import { T } from '../src/world/tiles';
import { DT, TILE } from '../src/core/const';

const car = (x = 200, y = 200, a = 0) => resetVehicle(makeVehicle(1), 'sedan', x, y, a, 0);

test('catalogue has civilian models and no emergency models in traffic', () => {
  expect(CIV_MODELS).toContain('sedan');
  expect(CIV_MODELS).not.toContain('police');
  expect(VEHICLES.tank.kind).toBe('tank');
});
test('accelerates towards but never exceeds max speed', () => {
  const c = testCity(200), b = bus(), v = car(100, 3200);
  v.throttle = 1; let max = 0;
  for (let i = 0; i < 600; i++) { stepVehicle(v, DT, c, b); max = Math.max(max, forwardSpeed(v)); }
  expect(max).toBeGreaterThan(VEHICLES.sedan.maxSpeed * 0.9);
  expect(max).toBeLessThanOrEqual(VEHICLES.sedan.maxSpeed + 1e-6);
});
test('brakes to a stop within 3 seconds from top speed', () => {
  const c = testCity(300), b = bus(), v = car(100, 4800); v.vx = VEHICLES.sedan.maxSpeed;
  v.brake = 1;
  for (let i = 0; i < 180 && forwardSpeed(v) > 5; i++) stepVehicle(v, DT, c, b);
  expect(forwardSpeed(v)).toBeLessThanOrEqual(5);
});
test('reverses when braking from standstill', () => {
  const c = testCity(100), b = bus(), v = car(1600, 1600); v.brake = 1;
  for (let i = 0; i < 60; i++) stepVehicle(v, DT, c, b);
  expect(forwardSpeed(v)).toBeLessThan(-20);
});
test('never tunnels through a wall even at absurd speed', () => {
  const c = testCity(40); for (let y = 0; y < 40; y++) setTile(c, 20, y, T.Building);
  const b = bus(), v = car(15 * TILE, 10 * TILE); v.vx = 3000; v.throttle = 1;
  for (let i = 0; i < 60; i++) {
    stepVehicle(v, DT, c, b);
    expect(isSolidWorld(c, v.x, v.y)).toBe(false);
    expect(v.x).toBeLessThan(20 * TILE);
  }
});
test('wall hit damages car and emits crash', () => {
  const c = testCity(40); for (let y = 0; y < 40; y++) setTile(c, 20, y, T.Building);
  const b = bus(), v = car(17 * TILE, 10 * TILE); v.vx = 400; const h = v.health;
  let crashes = 0; b.on('crash', () => crashes++);
  for (let i = 0; i < 30; i++) stepVehicle(v, DT, c, b);
  expect(v.health).toBeLessThan(h); expect(crashes).toBeGreaterThan(0);
});
test('steering turns the car and handbrake slides more', () => {
  const run = (hb: boolean) => {
    const c = testCity(200), b = bus(), v = car(3200, 3200); v.vx = 350; v.steer = 1; v.handbrake = hb;
    let lat = 0;
    for (let i = 0; i < 30; i++) {
      stepVehicle(v, DT, c, b);
      lat = Math.max(lat, Math.abs(-v.vx * Math.sin(v.angle) + v.vy * Math.cos(v.angle)));
    }
    return { angle: v.angle, lat };
  };
  const n = run(false), h = run(true);
  expect(n.angle).toBeGreaterThan(0.5); expect(h.lat).toBeGreaterThan(n.lat);
});
test('vehicle pair separates and exchanges momentum', () => {
  const b = bus(), a = car(100, 100), o = resetVehicle(makeVehicle(2), 'sedan', 140, 100, 0, 0); a.vx = 300;
  expect(resolveVehiclePair(a, o, b)).toBe(true);
  expect(o.vx).toBeGreaterThan(0); expect(a.vx).toBeLessThan(300);
  expect(o.x - a.x).toBeGreaterThanOrEqual(44 - 0.01);
});
test('driving into water sinks the car', () => {
  const c = testCity(40); for (let y = 0; y < 40; y++) for (let x = 20; x < 40; x++) setTile(c, x, y, T.Water, 0);
  const b = bus(), v = car(18 * TILE, 10 * TILE); v.throttle = 1;
  for (let i = 0; i < 300; i++) stepVehicle(v, DT, c, b);
  expect(v.wreck).toBe(true);
});
test('door points are beside the car', () => {
  const v = car(100, 100, 0);
  const l = doorPoint(v, -1), r = doorPoint(v, 1);
  expect(l.y).toBeLessThan(100); expect(r.y).toBeGreaterThan(100);
});
