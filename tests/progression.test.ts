import { createSession, nextCity, type Session } from '../src/game/session';
import { generateMission } from '../src/game/missions/generator';
import { MissionRunner } from '../src/game/missions/runner';
import { cityGoal, cityTarget, gameOver } from '../src/game/progression';
import { TUNING, missionDifficulty } from '../src/game/tuning';
import { landmarksOf } from '../src/world/query';
import { readSave, restoreSession, writeSave, DEFAULT_SETTINGS, SAVE_KEY, type Store } from '../src/save/save';
import { DT } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });

/** Completes payphone jobs one after another until the city is done; returns how many it took. */
function missionsToFinish(s: Session): number {
  const w = s.world, phones = landmarksOf(w.city, 'payphone');
  let done = false; const off = w.bus.on('cityComplete', () => { done = true; });
  let n = 0;
  while (!done && n < 200) {
    w.mission = new MissionRunner(w, generateMission(w.city, phones[n % phones.length], n, w.ps));
    w.mission.forceSuccess();
    w.step(idle(), DT); w.step(idle(), DT);
    n++;
  }
  off();
  return n;
}

test.each(['malmö', 'kiruna', 'göteborg'])('a mission-only player finishes cities 1–3 in 15–25 jobs each (seed %s)', seed => {
  let s = createSession(seed, 1);
  for (let city = 1; city <= 3; city++) {
    const n = missionsToFinish(s);
    expect(n, `city ${city}`).toBeGreaterThanOrEqual(15);
    expect(n, `city ${city}`).toBeLessThanOrEqual(25);
    s = nextCity(s);
  }
});

test('the city target is relative to the score you arrived with', () => {
  const s = createSession('target', 2); const w = s.world;
  w.ps.cityStartScore = 1_300_000;
  expect(cityTarget(w)).toBe(1_300_000 + cityGoal(2));
});

test('mission difficulty grows with the city and with jobs done in it', () => {
  expect(missionDifficulty(1, 0)).toBe(1);
  expect(missionDifficulty(1, TUNING.missionsPerDifficulty)).toBe(2);
  expect(missionDifficulty(2, 0)).toBe(2);
  expect(missionDifficulty(3, 100)).toBe(TUNING.maxDifficulty);
});

test('jobs never push the multiplier past the cap, and nextCity resets the per-city job count', () => {
  const s = createSession('cap', 1); const w = s.world, ph = landmarksOf(w.city, 'payphone')[0];
  for (let i = 0; i < 30; i++) {
    w.mission = new MissionRunner(w, generateMission(w.city, ph, i, w.ps));
    w.mission.forceSuccess(); w.step(idle(), DT);
  }
  expect(w.ps.multiplier).toBe(TUNING.multiplierCap);
  expect(w.ps.cityMissions).toBe(30);
  expect(nextCity(s).world.ps.cityMissions).toBe(0);
});

test('game over keeps half the multiplier', () => {
  const { world: w } = createSession('over', 1);
  w.ps.multiplier = 4; w.ps.score = 500_000;
  gameOver(w);
  expect(w.ps.multiplier).toBe(2); expect(w.ps.score).toBe(0);
});

test('a save from before cityMissions existed still loads', () => {
  const m = new Map<string, string>();
  const store: Store = { get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
  const s = createSession('old', 1);
  writeSave(store, s, DEFAULT_SETTINGS);
  const raw = JSON.parse(m.get(SAVE_KEY)!); delete raw.ps.cityMissions; m.set(SAVE_KEY, JSON.stringify(raw));
  const loaded = readSave(store);
  if (!loaded.ok) throw new Error(`save rejected: ${loaded.reason}`);
  expect(restoreSession(loaded.save).world.ps.cityMissions).toBe(0);
});
