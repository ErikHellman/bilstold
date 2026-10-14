import { createSession } from '../src/game/session';
import { buildMission } from '../src/game/missions/generator';
import { MissionRunner } from '../src/game/missions/runner';
import type { MissionKind, MissionSpec } from '../src/game/missions/templates';
import { completeStoryStep, finaleOpen, liveStoryPhones, STORY_STEPS, storyMission, storyPhones } from '../src/game/story/story';
import { ARCS } from '../src/game/story/arcs';
import { bossFor, BOSSES } from '../src/game/story/characters';
import { landmarkCenter, landmarksOf } from '../src/world/query';
import { makeRng } from '../src/core/rng';
import { readSave, restoreSession, writeSave, DEFAULT_SETTINGS, type Store } from '../src/save/save';
import { DT, TILE } from '../src/core/const';
import type { World } from '../src/sim/world';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const spec = (w: World, kind: MissionKind, d = 2): MissionSpec => {
  const phone = landmarksOf(w.city, 'payphone')[0];
  const b = buildMission(kind, makeRng(7), w.city, phone, d, { enemy: 1 });
  return { id: 't', kind, title: b.title, giver: -1, reward: 1000, respect: 0, timeLimit: b.timeLimit, params: b.params };
};

test.each(['malmö', 'luleå', 'visby'])('every gang has a story phone and every step builds a complete job (seed %s)', seed => {
  const { world: w } = createSession(seed, 1);
  const phones = storyPhones(w.city);
  expect(phones.gang.map(l => l.gang)).toEqual([0, 1, 2]);
  expect(phones.finale?.gang).toBe(-1);
  for (const ph of phones.gang) for (let step = 0; step < STORY_STEPS; step++) {
    w.ps.story[ph.gang] = step;
    const s = storyMission(w, ph);
    expect(s.kind).toBe(ARCS[ph.gang][step].kind);
    expect(s.story).toEqual({ gang: ph.gang, step });
    expect(s.brief!.speaker).toBe(bossFor(w.city.gangs[ph.gang].name).name);
    for (const t of [s.title, s.outro!, ...s.brief!.lines]) expect(t, t).not.toMatch(/[{}]|undefined/);
    expect(storyMission(w, ph)).toEqual(s);
  }
});

test('every gang-name prefix has a boss', () => {
  for (const p of ['Söder', 'Hamn', 'Norr', 'Rost', 'Järn', 'Svart', 'Guld', 'Neon', 'Is', 'Krom']) expect(BOSSES[p]).toBeTruthy();
});

test('two finished storylines open the finale, which pays a bonus and is recorded', () => {
  const { world: w } = createSession('finale', 1);
  expect(finaleOpen(w)).toBe(false);
  w.ps.story = [STORY_STEPS, STORY_STEPS, 1];
  expect(finaleOpen(w)).toBe(true);
  const fin = storyPhones(w.city).finale!;
  expect(liveStoryPhones(w)).toContain(fin);
  const s = storyMission(w, fin);
  expect(s.story).toEqual({ gang: -1, step: 0 });
  expect(s.kind).toBe('defend');
  expect(s.reward).toBeGreaterThan(250_000);
  completeStoryStep(w, s);
  expect(w.ps.finaleDone).toBe(true);
  expect(liveStoryPhones(w)).not.toContain(fin);
});

test('answering a story phone briefs the player and success advances the storyline', () => {
  const { world: w } = createSession('briefing', 1);
  const ph = storyPhones(w.city).gang[0];
  const briefs: unknown[] = []; w.bus.on('missionStart', e => briefs.push(e.brief));
  const c = landmarkCenter(ph); w.player.x = c.x; w.player.y = c.y;
  for (let i = 0; i < 70 && !w.mission; i++) w.step(idle(), DT);
  expect(w.mission?.spec.story).toEqual({ gang: 0, step: 0 });
  expect(briefs[0]).toBeTruthy();
  const s0 = w.ps.score;
  w.mission!.forceSuccess(); w.step(idle(), DT);
  expect(w.ps.story[0]).toBe(1);
  expect(w.ps.score).toBeGreaterThan(s0);
});

test('story progress survives a save', () => {
  const m = new Map<string, string>();
  const store: Store = { get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
  const s = createSession('saved-story', 1);
  s.world.ps.story = [5, 2, 0]; s.world.ps.finaleDone = true;
  writeSave(store, s, DEFAULT_SETTINGS);
  const r = readSave(store);
  if (!r.ok) throw new Error(r.reason);
  const w = restoreSession(r.save).world;
  expect(w.ps.story).toEqual([5, 2, 0]); expect(w.ps.finaleDone).toBe(true);
});

test('heat: reach the wanted level, then lose the cops', () => {
  const { world: w } = createSession('heat', 1);
  const s = spec(w, 'heat'); const r = new MissionRunner(w, s);
  const lvl = (s.params as { level: number }).level;
  expect(r.update(DT)).toBe('running');
  w.ps.wanted.level = lvl; expect(r.update(DT)).toBe('running'); expect(r.stage).toBe(1);
  w.ps.wanted.level = 0; expect(r.update(DT)).toBe('success');
  r.cleanup();
});

test('defend: waves attack while you hold the spot; leaving it fails', () => {
  const { world: w } = createSession('defend', 1);
  for (const k of ['police', 'wanted']) w.systemsEnabled[k] = false;
  w.godMode = true;
  const s = spec(w, 'defend'); const p = s.params as { tx: number; ty: number; duration: number; perWave: number; waves: number };
  w.player.x = p.tx * TILE + 16; w.player.y = p.ty * TILE + 16;
  w.mission = new MissionRunner(w, s);
  let ended: boolean | null = null; w.bus.on('missionEnd', e => { ended = e.success; });
  let attackers = 0;
  for (let i = 0; i < (p.duration + 2) * 60 && ended === null; i++) {
    w.player.x = p.tx * TILE + 16; w.player.y = p.ty * TILE + 16;
    w.step(idle(), DT);
    if (i === 30) w.peds.each(q => { if (q.kind === 'gang' && q.ai.mode === 'attack' && q.ai.target === w.player) attackers++; });
  }
  expect(attackers).toBeGreaterThanOrEqual(p.perWave - 1);
  expect(ended).toBe(true);
  const r = new MissionRunner(w, s);
  w.player.x += 2000;
  let res = 'running';
  for (let i = 0; i < 11 * 60 && res === 'running'; i++) res = r.update(DT);
  expect(res).toBe('fail');
  r.cleanup();
});

test('chase: wrecking the fleeing car succeeds', () => {
  const { world: w } = createSession('chase', 1);
  const s = spec(w, 'chase'); const r = new MissionRunner(w, s);
  const p = s.params as { tx: number; ty: number };
  w.player.x = p.tx * TILE + 100; w.player.y = p.ty * TILE;
  expect(r.update(DT)).toBe('running');
  const car = r.entities.find(e => 'def' in e)!;
  w.bus.emit('vehicleDestroyed', { vehicle: car as any, by: w.player });
  expect(r.update(DT)).toBe('success');
  r.cleanup();
});

test('escort: picking up the passenger sends gang cars hunting you, arriving succeeds', () => {
  const { world: w } = createSession('escort', 1);
  const s = spec(w, 'escort', 4); const r = new MissionRunner(w, s);
  const q = r.entities[0] as any;
  const car = w.spawnVehicle('sedan', q.x, q.y + 20, 0, 0, false)!;
  w.player.vehicle = car; car.driver = w.player; w.player.x = car.x; w.player.y = car.y;
  r.update(DT);
  expect(r.stage).toBe(1);
  const hunters = r.entities.filter(e => 'def' in e && (e as any).ai.mode === 'hunt');
  expect(hunters.length).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 120; i++) w.step(idle(), DT);
  const p = s.params as { tx: number; ty: number };
  car.x = p.tx * TILE + 16; car.y = p.ty * TILE + 16; car.vx = 0; car.vy = 0; w.player.x = car.x; w.player.y = car.y;
  expect(r.update(DT)).toBe('success');
  r.cleanup();
});
