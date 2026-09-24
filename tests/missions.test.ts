import { createSession, nextCity } from '../src/game/session';
import { generateMission } from '../src/game/missions/generator';
import { MissionRunner } from '../src/game/missions/runner';
import { startFrenzy } from '../src/game/frenzy';
import { cityTarget } from '../src/game/progression';
import { killPed } from '../src/sim/ped';
import { landmarksOf } from '../src/world/query';
import { isWalkable } from '../src/world/tiles';
import { DT, TILE } from '../src/core/const';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });

test('mission generation is deterministic and targets are walkable', () => {
  const { world: w } = createSession('missions', 1);
  const phones = landmarksOf(w.city, 'payphone');
  const kinds = new Set<string>();
  for (const ph of phones) for (let n = 0; n < 6; n++) {
    const a = generateMission(w.city, ph, n, w.ps), b = generateMission(w.city, ph, n, w.ps);
    expect(a).toEqual(b);
    kinds.add(a.kind);
    expect(a.reward).toBeGreaterThan(0);
    const p: any = a.params;
    for (const t of [p, ...(p.points ?? [])]) if (t.tx !== undefined) expect(isWalkable(w.city.tiles[t.ty * w.city.size + t.tx])).toBe(true);
    if (ph.gang >= 0) expect(a.giver).toBe(ph.gang);
  }
  expect(kinds.size).toBeGreaterThanOrEqual(6);
});
test('checkpoint mission succeeds when checkpoints are visited and fails on timeout', () => {
  const { world: w } = createSession('race', 1); const ph = landmarksOf(w.city, 'payphone')[0];
  let spec: any;
  for (let n = 0; n < 80; n++) { spec = generateMission(w.city, ph, n, w.ps); if (spec.kind === 'checkpoint') break; }
  expect(spec.kind).toBe('checkpoint');
  const r = new MissionRunner(w, spec); let res = 'running';
  for (const pt of spec.params.points) { w.player.x = pt.tx * TILE + 16; w.player.y = pt.ty * TILE + 16; res = r.update(DT); }
  expect(res).toBe('success');
  r.cleanup();
  const r2 = new MissionRunner(w, spec); let res2 = 'running';
  for (let i = 0; i < (spec.timeLimit + 1) * 60 && res2 === 'running'; i++) res2 = r2.update(DT);
  expect(res2).toBe('fail');
  r2.cleanup();
});
test('answering a ringing phone starts a mission; success pays reward and bumps multiplier every 3rd', () => {
  const { world: w } = createSession('phone', 1); w.ps.missionsDone = 2; w.ps.multiplier = 1;
  const ph = landmarksOf(w.city, 'payphone').find(p => p.gang < 0)!;
  w.player.x = ph.tx * TILE + 16; w.player.y = ph.ty * TILE + 16;
  for (let i = 0; i < 180 && !w.mission; i++) w.step(idle(), DT);
  expect(w.mission).toBeTruthy();
  const reward = w.mission!.spec.reward; const s0 = w.ps.score;
  w.mission!.forceSuccess(); w.step(idle(), DT);
  expect(w.ps.score).toBe(s0 + reward); expect(w.ps.multiplier).toBe(2); expect(w.mission).toBeNull();
  expect(w.phoneCounts[ph.id]).toBe(1);
});
test('dying fails the active mission', () => {
  const { world: w } = createSession('diefail', 1); const ph = landmarksOf(w.city, 'payphone')[0];
  w.mission = new MissionRunner(w, generateMission(w.city, ph, 0, w.ps));
  let failed = 0; w.bus.on('missionEnd', e => { if (!e.success) failed++; });
  w.player.health = 0; w.player.dead = true;
  for (let i = 0; i < 5 * 60; i++) w.step(idle(), DT);
  expect(failed).toBe(1); expect(w.mission).toBeNull();
});
test('mission state survives serialization', () => {
  const { world: w } = createSession('serial', 1); const ph = landmarksOf(w.city, 'payphone')[0];
  const r = new MissionRunner(w, generateMission(w.city, ph, 0, w.ps)); r.timer = 12.5; r.stage = 1;
  const r2 = MissionRunner.fromJSON(w, JSON.parse(JSON.stringify(r.toJSON())));
  expect(r2.spec).toEqual(r.spec); expect(r2.timer).toBe(12.5); expect(r2.stage).toBe(1);
});
test('frenzy counts kills and pays out', () => {
  const { world: w } = createSession('frenzy', 1); w.systemsEnabled.spawner = false; w.systemsEnabled.wanted = false;
  startFrenzy(w, 'smg', 5, 30, 'any'); expect(w.ps.current).toBe('smg');
  const s0 = w.ps.score;
  for (let i = 0; i < 5; i++) { const c = w.spawnPed('civ', w.player.x + 40 + i * 10, w.player.y, 0)!; killPed(w, c, w.player, 'smg'); }
  w.step(idle(), DT);
  expect(w.ps.score - s0).toBeGreaterThanOrEqual(10000); expect(w.frenzy).toBeNull(); expect(w.ps.weapons.smg).toBeUndefined();
});
test('frenzy fails when time runs out', () => {
  const { world: w } = createSession('frenzyfail', 1); w.systemsEnabled.spawner = false;
  let ended: boolean | null = null; w.bus.on('frenzyEnd', e => { ended = e.success; });
  startFrenzy(w, 'rocket', 5, 1, 'any');
  for (let i = 0; i < 90; i++) w.step(idle(), DT);
  expect(ended).toBe(false); expect(w.frenzy).toBeNull();
});
test('reaching the city target completes the city and nextCity carries progress', () => {
  const s = createSession('progress', 1); const w = s.world;
  let done = 0; w.bus.on('cityComplete', () => done++);
  w.ps.score = cityTarget(1); w.ps.lives = 2; w.ps.multiplier = 3; w.ps.weapons.smg = 40;
  w.step(idle(), DT); w.step(idle(), DT);
  expect(done).toBe(1);
  const n = nextCity(s);
  expect(n.world.city.index).toBe(2); expect(n.world.ps.score).toBe(cityTarget(1)); expect(n.world.ps.cityStartScore).toBe(cityTarget(1));
  expect(n.world.ps.lives).toBe(2); expect(n.world.ps.multiplier).toBe(3); expect(n.world.ps.weapons.smg).toBe(40);
  expect(n.world.city.tiles).not.toEqual(w.city.tiles);
});
