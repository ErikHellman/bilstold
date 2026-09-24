import { Camera } from '../src/render/camera';

test('camera zooms out with speed and back in', () => {
  const c = new Camera(640, 360);
  for (let i = 0; i < 300; i++) c.follow(0, 0, 500, 0, 500, 1 / 60);
  expect(c.zoom).toBeLessThan(0.62);
  for (let i = 0; i < 300; i++) c.follow(0, 0, 0, 0, 0, 1 / 60);
  expect(c.zoom).toBeGreaterThan(0.98);
});
test('worldToScreen centers camera target', () => {
  const c = new Camera(640, 360); c.x = 1000; c.y = 500; c.zoom = 1;
  const o = { x: 0, y: 0 };
  c.worldToScreen(1000, 500, o);
  expect(o).toEqual({ x: 320, y: 180 });
});
test('visible rect grows when zoomed out', () => {
  const c = new Camera(640, 360); c.x = 0; c.y = 0; c.zoom = 0.5;
  const r = c.visibleRect();
  expect(r.x1 - r.x0).toBeCloseTo(1280);
});
test('look-ahead is clamped', () => {
  const c = new Camera(640, 360);
  for (let i = 0; i < 600; i++) c.follow(0, 0, 5000, 0, 500, 1 / 60);
  expect(c.x).toBeLessThanOrEqual(120.01);
});
