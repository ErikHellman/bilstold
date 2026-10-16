import { generateCity } from '../src/world/citygen';
import { THEMES, themeFor } from '../src/world/themes';
import { D } from '../src/world/tiles';
import { stepVehicle, makeVehicle } from '../src/sim/vehicle';
import { createSession } from '../src/game/session';
import { bossFor, BOSSES } from '../src/game/story/characters';
import { testCity } from './helpers';
import { DT } from '../src/core/const';

test('cities 1–3 have their own themes and the cycle repeats with more police', () => {
  expect([1, 2, 3].map(i => themeFor(i).id)).toEqual(['harbour', 'winter', 'night']);
  expect(themeFor(4).id).toBe('harbour');
  expect(themeFor(4).policeBoost).toBe(THEMES[0].policeBoost + 1);
  expect(themeFor(6).policeBoost).toBe(THEMES[2].policeBoost + 1);
});

test.each([1, 2, 3])('city %i uses its theme for gangs, and every gang has a boss', index => {
  const c = generateCity(12345, index), t = themeFor(index);
  expect(c.theme.id).toBe(t.id);
  c.gangs.forEach((g, i) => {
    expect(g.name.startsWith(t.gangPrefixes[i])).toBe(true);
    expect(g.color).toBe(t.gangColors[i]);
    expect(g.carModel).toBe(t.gangCars[i]);
    expect(bossFor(g.name)).toBe(BOSSES[t.gangPrefixes[i]]);
  });
  expect(new Set(c.gangs.map(g => g.name)).size).toBe(3);
});

test('the winter town is more industrial than the harbour town', () => {
  const share = (index: number) => {
    let ind = 0, all = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const c = generateCity(seed, index);
      for (const d of c.district) { all++; if (d === D.Industrial) ind++; }
    }
    return ind / all;
  };
  expect(share(2)).toBeGreaterThan(share(1));
});

test('cars slide further on winter roads', () => {
  const slide = (index: number) => {
    const c = testCity(40); c.theme = themeFor(index);
    const s = createSession('grip', 1);
    const v = makeVehicle(1); Object.assign(v, { active: true, x: 600, y: 600, angle: 0, vx: 0, vy: 300, health: 100 });
    for (let i = 0; i < 30; i++) stepVehicle(v, DT, c, s.world.bus);
    return Math.abs(v.vy);
  };
  expect(slide(2)).toBeGreaterThan(slide(1));
});
