import { wrapAngle, angleDiff, obbOverlap } from '../src/core/math';
import { Pool } from '../src/core/pool';
import { SpatialHash } from '../src/core/spatial';
import { Bus } from '../src/core/events';
import { FixedLoop } from '../src/core/loop';
import { DT, MAX_STEPS } from '../src/core/const';

test('angles wrap', () => {
  expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2);
  expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
});
test('obbOverlap detects overlap and separation', () => {
  const a = { x: 0, y: 0, hw: 10, hh: 5, angle: 0 };
  expect(obbOverlap(a, { x: 15, y: 0, hw: 10, hh: 5, angle: 0 })!.depth).toBeCloseTo(5);
  expect(obbOverlap(a, { x: 30, y: 0, hw: 10, hh: 5, angle: 0 })).toBeNull();
  expect(obbOverlap(a, { x: 0, y: 14, hw: 10, hh: 5, angle: Math.PI / 2 })).not.toBeNull();
});
test('obbOverlap normal points from a to b', () => {
  const n = obbOverlap({ x: 0, y: 0, hw: 10, hh: 5, angle: 0 }, { x: -15, y: 0, hw: 10, hh: 5, angle: 0 })!;
  expect(n.nx).toBeCloseTo(-1);
});
test('pool respects capacity and reuses', () => {
  const p = new Pool(2, () => ({ id: 0, active: false }));
  const a = p.spawn()!, b = p.spawn()!;
  expect(p.spawn()).toBeNull();
  expect(p.count).toBe(2);
  p.release(a);
  expect(p.count).toBe(1);
  expect(p.spawn()).toBe(a);
  expect(b.active).toBe(true);
});
test('spatial hash query finds nearby only', () => {
  const s = new SpatialHash<{ x: number; y: number }>(64, 6144);
  const near = { x: 100, y: 100 }, far = { x: 2000, y: 2000 };
  s.insert(near); s.insert(far);
  const out: { x: number; y: number }[] = [];
  expect(s.query(110, 110, 30, out)).toContain(near);
  expect(out).not.toContain(far);
  s.clear();
  expect(s.query(110, 110, 30, out)).toHaveLength(0);
});
test('bus delivers and unsubscribes', () => {
  const b = new Bus<{ ping: number }>();
  let got = 0;
  const off = b.on('ping', v => (got += v));
  b.emit('ping', 2); off(); b.emit('ping', 5);
  expect(got).toBe(2);
});
test('fixed loop steps at DT, clamps huge frames, keeps alpha', () => {
  let n = 0;
  const l = new FixedLoop(() => n++);
  l.advance(DT * 1000 * 2.5);
  expect(n).toBe(2);
  expect(l.alpha).toBeCloseTo(0.5, 1);
  n = 0;
  l.advance(60_000);
  expect(n).toBe(MAX_STEPS);
  expect(l.alpha).toBeLessThan(1);
});
