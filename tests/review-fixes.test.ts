import { createSession, registerCoreSystems } from '../src/game/session';
import { startFrenzy } from '../src/game/frenzy';
import { killPed } from '../src/sim/ped';
import { World } from '../src/sim/world';
import { Input } from '../src/input/input';
import { shouldDraw } from '../src/core/loop';
import { screenOnHide } from '../src/ui/screens';
import { writeSave, readSave, restoreSession, DEFAULT_SETTINGS, SAVE_KEY, type Store } from '../src/save/save';
import { SIM_RADIUS, DT, TILE, CAP_PARKED } from '../src/core/const';
import { testCity } from './helpers';

const idle = () => ({ accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() });
const run = (w: World, s: number) => { for (let i = 0; i < s * 60; i++) w.step(idle(), DT); };

test('destroyed parked cars stop counting as parked, so new parked cars keep appearing', () => {
  const { world: w } = createSession('wrecks', 1);
  w.step(idle(), DT);
  const home = { x: w.player.x, y: w.player.y };
  w.vehicles.each(v => { if (v.parked) { v.health = 0; v.burning = 0.05; } });
  run(w, 1);
  expect(w.vehicles.items.filter(v => v.active && v.parked && v.wreck).length).toBe(0);
  w.player.x = home.x + 60 * TILE; w.player.y = home.y;
  run(w, 3);
  expect(w.countVehicles(true)).toBeGreaterThan(3);
  expect(w.countVehicles(true)).toBeLessThanOrEqual(CAP_PARKED);
});

test('Enter/Space on a focused button is left to the browser; Escape still pauses', () => {
  const t = new EventTarget(); const inp = new Input(t, () => []);
  let prevented = 0;
  const press = (code: string) => {
    const e = new Event('keydown') as any;
    Object.defineProperty(e, 'code', { value: code });
    Object.defineProperty(e, 'target', { value: { tagName: 'BUTTON' } });
    e.preventDefault = () => prevented++;
    t.dispatchEvent(e);
  };
  press('Enter'); press('Space');
  let s = inp.poll();
  expect(prevented).toBe(0); expect(s.pressed.has('enter')).toBe(false); expect(s.handbrake).toBe(false);
  press('Escape'); s = inp.poll();
  expect(s.pressed.has('pause')).toBe(true);
});

test('frame gate caps drawing at the fps cap on fast displays', () => {
  const count = (hz: number, cap: number) => {
    let last = 0, draws = 0;
    for (let i = 1; i <= hz; i++) { const t = (i * 1000) / hz; if (shouldDraw(t - last, cap)) { draws++; last = t; } }
    return draws;
  };
  expect(count(144, 60)).toBeLessThanOrEqual(75);
  expect(count(60, 60)).toBe(60);
  expect(count(60, 30)).toBe(30);
  expect(count(144, 10)).toBeLessThanOrEqual(12);
});

test.each(['chasepool', 'a', 'b', 'c', 'd', 'e'])('units left far behind stop being persistent so the pools never fill (seed %s)', seed => {
  const { world: w } = createSession(seed, 1);
  w.systemsEnabled.death = false;
  for (let s = 0; s < 180; s++) {
    w.ps.wanted.level = 4; w.ps.wanted.heat = 1700;
    if (s % 20 === 0) { w.player.x = ((s / 20) % 2 ? 40 : 150) * TILE; w.player.y = 96 * TILE; }
    run(w, 1);
  }
  let farPersistent = 0;
  w.vehicles.each(v => { if (v.persistent && Math.hypot(v.x - w.player.x, v.y - w.player.y) > SIM_RADIUS + 300) farPersistent++; });
  w.peds.each(p => { if (p !== w.player && p.persistent && Math.hypot(p.x - w.player.x, p.y - w.player.y) > SIM_RADIUS + 300) farPersistent++; });
  expect(farPersistent).toBe(0);
});

test('a kill frenzy gives back the ammo you already had', () => {
  const { world: w } = createSession('frenzyammo', 1); w.systemsEnabled.spawner = false; w.systemsEnabled.wanted = false;
  w.ps.weapons.smg = 250;
  startFrenzy(w, 'smg', 2, 30, 'any');
  for (let i = 0; i < 2; i++) killPed(w, w.spawnPed('civ', w.player.x + 30, w.player.y, 0)!, w.player, 'smg');
  expect(w.frenzy).toBeNull(); expect(w.ps.weapons.smg).toBe(250);
});

test('hit-and-run reactions still work after a vehicle slot is reused', () => {
  const w = new World(testCity(60), 1); registerCoreSystems(w);
  w.systemsEnabled.spawner = false; w.systemsEnabled.ai = false;
  const ram = () => {
    const mine = w.spawnVehicle('sedan', 300, 1000, 0, 0, false)!; w.player.vehicle = mine; mine.driver = w.player; mine.vx = 300;
    const other = w.spawnVehicle('sedan', 360, 1000, 0, 0, false)!;
    const d = w.spawnPed('civ', 360, 1000, 0)!; d.vehicle = other; other.driver = d; d.ai.mode = 'idle';
    for (let n = 0; n < 20; n++) w.step(idle(), DT);
    const mode: string = d.ai.mode;
    const reacted = mode === 'flee' || mode === 'attack';
    w.player.vehicle = null; mine.driver = null;
    w.removeVehicle(other); w.removeVehicle(mine); if (d.active) w.removePed(d);
    return reacted;
  };
  expect(ram()).toBe(true);
  expect(ram()).toBe(true);
});

test('a malformed mission in an otherwise valid save is dropped instead of crashing', () => {
  const m = new Map<string, string>();
  const st: Store = { get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => void m.delete(k) };
  const s = createSession('badmission', 1); writeSave(st, s, DEFAULT_SETTINGS);
  const o = JSON.parse(m.get(SAVE_KEY)!);
  o.mission = { spec: { id: 'x', kind: 'checkpoint', title: 't', giver: -1, reward: 1, respect: 1, timeLimit: 0, params: { kind: 'checkpoint' } }, stage: 0, timer: 0, progress: 0 };
  m.set(SAVE_KEY, JSON.stringify(o));
  const r = readSave(st); expect(r.ok).toBe(true); if (!r.ok) return;
  const w = restoreSession(r.save).world;
  expect(() => run(w, 0.5)).not.toThrow();
  expect(w.mission).toBeNull();
});

test('hiding the tab while playing opens the pause menu', () => {
  expect(screenOnHide('playing')).toBe('paused');
  expect(screenOnHide('map')).toBe('map');
  expect(screenOnHide('title')).toBe('title');
});
