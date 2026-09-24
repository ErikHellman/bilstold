import { composeBar, STATIONS, RADIO_OFF } from '../src/audio/radio';

test('four stations plus off', () => { expect(STATIONS.length).toBe(4); expect(RADIO_OFF).toBe(4); });
test('bars are deterministic, in range and in scale', () => {
  for (let s = 0; s < 4; s++) for (let bar = 0; bar < 32; bar++) {
    const a = composeBar(s, 123, bar), b = composeBar(s, 123, bar);
    expect(a).toEqual(b);
    for (const n of a) {
      expect(n.t).toBeGreaterThanOrEqual(0); expect(n.t).toBeLessThan(4); expect(n.dur).toBeGreaterThan(0);
      if (n.voice === 'lead' || n.voice === 'bass') expect(STATIONS[s].scale).toContain(((n.midi - STATIONS[s].root) % 12 + 12) % 12);
    }
  }
});
test('different song seeds give different music', () => {
  expect(composeBar(0, 1, 4)).not.toEqual(composeBar(0, 2, 4));
});
test('every bar has drums and bass', () => {
  for (let s = 0; s < 4; s++) {
    const bar = composeBar(s, 9, 5);
    expect(bar.some(n => n.voice === 'kick')).toBe(true);
    expect(bar.some(n => n.voice === 'bass')).toBe(true);
  }
});
test('intro bars are without lead melody', () => {
  expect(composeBar(0, 7, 0).some(n => n.voice === 'lead')).toBe(false);
  expect(composeBar(0, 7, 4).some(n => n.voice === 'lead')).toBe(true);
});
