import { createSession, resolveSeed } from '../src/game/session';
import { serialize, writeSave, readSave, safeStorage, restoreSession, SAVE_KEY, DEFAULT_SETTINGS, type Store } from '../src/save/save';
import { generateMission } from '../src/game/missions/generator';
import { MissionRunner } from '../src/game/missions/runner';
import { landmarksOf } from '../src/world/query';
import { T, isWalkable } from '../src/world/tiles';
import { tileAtWorld } from '../src/world/query';

const mem = (): Store & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
};

test('round trip restores player state, vehicle, mission and position', () => {
  const s = createSession('roundtrip', 2); const w = s.world;
  Object.assign(w.ps, { score: 43210, multiplier: 3, lives: 2 });
  w.ps.weapons.smg = 77; w.ps.respect = [10, -30, 0]; w.ps.wanted.level = 2; w.ps.wanted.heat = 300; w.ps.collected = [3, 7];
  const v = w.spawnVehicle('sports', w.player.x, w.player.y, 1, 2, false)!;
  w.player.vehicle = v; v.driver = w.player; v.health = 50; v.carWeapon = 'carMG'; v.carAmmo = 40;
  const ph = landmarksOf(w.city, 'payphone')[0];
  w.mission = new MissionRunner(w, generateMission(w.city, ph, 0, w.ps)); w.mission.timer = 33;
  w.phoneCounts[ph.id] = 1; w.takenSpots.add('5,6');
  const st = mem();
  expect(writeSave(st, s, DEFAULT_SETTINGS)).toBe(true);
  const r = readSave(st); expect(r.ok).toBe(true); if (!r.ok) return;
  expect(r.save.settings).toEqual(DEFAULT_SETTINGS);
  const s2 = restoreSession(r.save); const w2 = s2.world;
  expect(s2.seedString).toBe('roundtrip');
  expect(w2.city.index).toBe(2); expect(w2.ps.score).toBe(43210); expect(w2.ps.weapons.smg).toBe(77); expect(w2.ps.weapons.fists).toBe(Infinity);
  expect(w2.ps.respect).toEqual([10, -30, 0]); expect(w2.ps.wanted.level).toBe(2); expect(w2.ps.collected).toEqual([3, 7]);
  expect(w2.player.vehicle!.model).toBe('sports'); expect(w2.player.vehicle!.health).toBe(50); expect(w2.player.vehicle!.carAmmo).toBe(40);
  expect(Math.hypot(w2.player.x - w.player.x, w2.player.y - w.player.y)).toBeLessThan(40);
  expect(w2.mission!.spec).toEqual(w.mission.spec); expect(w2.mission!.timer).toBe(33);
  expect(w2.phoneCounts[ph.id]).toBe(1); expect(w2.takenSpots.has('5,6')).toBe(true);
});
test.each([['not json{'], ['{"version":1'], [JSON.stringify({ version: 99 })], [JSON.stringify({ version: 1, seed: 5 })]])('corrupt save %# is discarded', raw => {
  const st = mem(); st.set(SAVE_KEY, raw);
  const r = readSave(st);
  expect(r).toEqual({ ok: false, reason: 'corrupt' }); expect(st.get(SAVE_KEY)).toBeNull();
});
test('missing save reports none', () => { expect(readSave(mem())).toEqual({ ok: false, reason: 'none' }); });
test('non-finite numbers are rejected', () => {
  const s = createSession('nan', 1); const st = mem(); writeSave(st, s, DEFAULT_SETTINGS);
  const o = JSON.parse(st.get(SAVE_KEY)!); o.player.x = null; st.set(SAVE_KEY, JSON.stringify(o));
  expect(readSave(st).ok).toBe(false);
});
test('throwing storage never throws out of writeSave/readSave', () => {
  const bad: Store = { get: () => { throw new Error('denied'); }, set: () => { throw new Error('quota'); }, remove: () => { throw new Error('x'); } };
  const s = createSession('bad', 1);
  expect(() => writeSave(bad, s, DEFAULT_SETTINGS)).not.toThrow(); expect(writeSave(bad, s, DEFAULT_SETTINGS)).toBe(false);
  expect(() => readSave(bad)).not.toThrow();
});
test('safeStorage falls back to memory when localStorage is unavailable', () => {
  const st = safeStorage(); expect(st.set('k', 'v')).toBe(true); expect(st.get('k')).toBe('v');
});
test('save with position inside a building restores to walkable ground', () => {
  const s = createSession('inside', 1); const st = mem(); writeSave(st, s, DEFAULT_SETTINGS);
  const o = JSON.parse(st.get(SAVE_KEY)!);
  const b = s.world.city.tiles.indexOf(T.Building);
  o.player.x = (b % 192) * 32 + 16; o.player.y = Math.floor(b / 192) * 32 + 16; st.set(SAVE_KEY, JSON.stringify(o));
  const r = readSave(st); if (!r.ok) throw new Error('should load');
  const w = restoreSession(r.save).world;
  expect(isWalkable(tileAtWorld(w.city, w.player.x, w.player.y))).toBe(true);
});
test('serialize is plain JSON', () => {
  const s = createSession('json', 1); const o = serialize(s, DEFAULT_SETTINGS);
  expect(JSON.parse(JSON.stringify(o))).toEqual(o); expect(o.ps.weapons.fists).toBe(-1);
});
test('resolveSeed trims and falls back to random for empty input', () => {
  expect(resolveSeed('  Bilstöld ', () => 'X')).toBe('Bilstöld');
  expect(resolveSeed('   ', () => 'RANDOM-1')).toBe('RANDOM-1');
});
