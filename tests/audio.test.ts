import { voiceGain, pan, RateLimiter, engineParams } from '../src/audio/sfx';

test('distance attenuation', () => {
  expect(voiceGain(0)).toBe(1); expect(voiceGain(700)).toBe(0); expect(voiceGain(350)).toBeCloseTo(0.25); expect(voiceGain(2000)).toBe(0);
});
test('pan clamps', () => { expect(pan(-1000)).toBe(-1); expect(pan(200)).toBeCloseTo(0.5); });
test('rate limiter', () => {
  const r = new RateLimiter(100);
  expect(r.ok('skid', 0)).toBe(true); expect(r.ok('skid', 50)).toBe(false); expect(r.ok('skid', 150)).toBe(true);
  expect(r.ok('horn', 50)).toBe(true);
});
test('engine pitch rises with speed and depends on vehicle kind', () => {
  expect(engineParams('car').base).toBe(45); expect(engineParams('tank').base).toBe(25);
  const car = engineParams('car'); expect(car.base + car.k * 400).toBeGreaterThan(car.base);
});
