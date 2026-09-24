import { hashString, normalizeSeed, makeRng, derive, randInt, randomSeedName } from '../src/core/rng';

test('hashString is stable and unsigned', () => {
  expect(hashString('bilstöld')).toBe(hashString('bilstöld'));
  expect(hashString('a')).not.toBe(hashString('b'));
  expect(hashString('🚗')).toBeGreaterThanOrEqual(0);
});
test('normalizeSeed trims, collapses whitespace and NFC-normalizes', () => {
  expect(normalizeSeed('  Bilstöld  ')).toBe('Bilstöld');
  expect(normalizeSeed('Bilstöld')).toBe('Bilstöld');
  expect(normalizeSeed('a   b')).toBe('a b');
  expect(normalizeSeed('   ')).toBe('');
  expect(normalizeSeed('x'.repeat(500)).length).toBe(64);
});
test('makeRng is deterministic and in [0,1)', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
test('derive separates streams', () => {
  expect(derive(1, 'city', 1)).not.toBe(derive(1, 'city', 2));
  expect(derive(1, 'roads')).toBe(derive(1, 'roads'));
});
test('randInt is inclusive and covers range', () => {
  const r = makeRng(7);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i++) seen.add(randInt(r, 1, 3));
  expect([...seen].sort()).toEqual([1, 2, 3]);
});
test('randomSeedName looks like WORD-WORD-1234', () => {
  expect(randomSeedName(makeRng(3))).toMatch(/^[A-ZÅÄÖ]+-[A-ZÅÄÖ]+-\d{4}$/);
});
