import { AudioEngine } from './audio/audio';
import { Sfx } from './audio/sfx';
import { Radio, RADIO_OFF } from './audio/radio';
import { FixedLoop, startRaf } from './core/loop';
import { createSession, nextCity, resolveSeed, type Session } from './game/session';
import { Input, type InputState } from './input/input';
import { Renderer } from './render/renderer';
import { DEFAULT_SETTINGS, readSave, restoreSession, safeStorage, writeSave, type SaveV1, type Settings } from './save/save';
import { hide } from './ui/overlay';
import { menuInput, syncGamepadClass } from './ui/padnav';
import { showCityComplete, showPause } from './ui/pause';
import { cityGoal } from './game/progression';
import { randomSeed, showTitle } from './ui/title';
import { screenOnHide, type Screen } from './ui/screens';
import { DIFFICULTIES } from './game/difficulty';
import { CheatCode } from './input/cheatcode';
import { isTouchDevice, TouchControls } from './input/touch';
import { giveWeapon, givePowerup, loseTheCops, refillAmmo, setGodMode, spawnCarNear } from './game/cheats';
import { showCheats } from './ui/cheats';
import { showBriefing } from './ui/briefing';
import { makePortrait } from './render/sprites/portraits';
import { bossFor } from './game/story/characters';
import { themeFor } from './world/themes';
import { STORY_STEPS } from './game/story/story';
import { PACKAGES_PER_CITY } from './game/activities/packages';
import type { World } from './sim/world';
import type { GameEvents } from './core/events';

const SETTINGS_KEY = 'bilstold.settings';
const AUTOSAVE_S = 10;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(window);
const renderer = new Renderer(canvas);
const store = safeStorage();
const touch = isTouchDevice() ? new TouchControls(input) : null;

let settings: Settings = loadSettings();
let screen: Screen = 'title';
let session: Session | null = null;
let attract: Session | null = null;
let seedField = new URLSearchParams(location.search).get('seed') ?? randomSeed();
let saveTimer = AUTOSAVE_S;
let unsub: (() => void)[] = [];
const audio = new AudioEngine(settings);
const sfx = new Sfx(audio, () => ({ x: renderer.cam.x, y: renderer.cam.y }));
const radio = new Radio(audio);
const unlockAudio = () => { audio.unlock(); audio.setActive(screen === 'playing' && !document.hidden); };
addEventListener('keydown', unlockAudio);
addEventListener('pointerdown', unlockAudio);

const idle: InputState = { accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() };

function loadSettings(): Settings {
  try {
    const raw = store.get(SETTINGS_KEY);
    if (raw) {
      const s: Settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if (!DIFFICULTIES.includes(s.difficulty)) s.difficulty = DEFAULT_SETTINGS.difficulty;
      return s;
    }
  } catch { /* fall back to defaults */ }
  // Phones run hot at 60 fps; start them on the battery saver.
  return { ...DEFAULT_SETTINGS, batterySaver: isTouchDevice() };
}

function saveSettings() { store.set(SETTINGS_KEY, JSON.stringify(settings)); }

function save() {
  if (session && session.world.ps.deathState === 'alive') writeSave(store, session, settings);
}

function setAttract(seed: string) {
  attract = createSession(resolveSeed(seed, () => 'BILSTÖLD'), 1);
  renderer.attract = true;
  renderer.showMap = false;
  renderer.showRegistry = false;
  renderer.setWorld(attract.world);
  expose(attract);
}

let seedDebounce = 0;
function openTitle(notice: string | null = null) {
  screen = 'title';
  session = null;
  sfx.attach(null);
  audio.setActive(false);
  for (const u of unsub) u();
  unsub = [];
  const r = readSave(store);
  const saved: SaveV1 | null = r.ok ? r.save : null;
  if (!r.ok && r.reason === 'corrupt') notice = 'Save was corrupt and has been discarded';
  setAttract(saved ? saved.seed : seedField);
  showTitle({
    save: saved, notice, initialSeed: seedField,
    onContinue: () => { if (saved) startSession(restoreSession(saved)); },
    onNewGame: seed => {
      const s = resolveSeed(seed, randomSeed);
      seedField = s;
      startSession(createSession(s, 1));
      save();
    },
    onSeedChange: seed => {
      seedField = seed;
      clearTimeout(seedDebounce);
      seedDebounce = window.setTimeout(() => { if (screen === 'title') setAttract(seed); }, 400);
    },
    onFocusText: focused => { input.enabled = !focused; if (focused) input.releaseAll(); },
  });
}

function startSession(s: Session) {
  clearTimeout(seedDebounce);
  session = s;
  s.world.difficulty = settings.difficulty;
  attract = null;
  renderer.attract = false;
  renderer.showMap = false;
  renderer.showRegistry = false;
  renderer.setWorld(s.world);
  const theme = s.world.city.theme;
  renderer.hud.big = { text: theme.name.toUpperCase(), t: 3 };
  renderer.hud.messages.push({ text: theme.tagline, t: 6 });
  input.enabled = true;
  input.releaseAll();
  hide();
  screen = 'playing';
  saveTimer = AUTOSAVE_S;
  sfx.attach(s.world);
  audio.setActive(true);
  for (const u of unsub) u();
  unsub = [
    s.world.bus.on('missionEnd', () => save()),
    s.world.bus.on('missionStart', e => { if (e.brief) brief(s, e.title, e.brief); }),
    s.world.bus.on('cityComplete', e => {
      save();
      screen = 'cityComplete';
      audio.setActive(false);
      showCityComplete(e.index, s.world.city.theme.name, themeFor(e.index + 1).name, statsOf(s.world), () => { const n = nextCity(s); startSession(n); save(); });
    }),
  ];
  expose(s);
  canvas.focus();
}

function pause() {
  screen = 'paused';
  audio.setActive(false);
  const w = session?.world;
  showPause({
    settings,
    stats: w && statsOf(w),
    progress: w && { city: w.city.index, earned: w.ps.score - w.ps.cityStartScore, goal: cityGoal(w.city.index), jobs: w.ps.cityMissions },
    onResume: resume,
    onQuit: () => { save(); openTitle(); },
    onSettings: s => { settings = s; saveSettings(); audio.setVolumes(s); if (session) session.world.difficulty = s.difficulty; },
  });
}

// Hidden cheats menu. The secret key sequence is documented in src/input/cheatcode.ts.
new CheatCode(window, openCheats);

function openCheats() {
  if (screen !== 'playing' || !session) return;
  const w = session.world;
  if (w.ps.deathState !== 'alive') return;
  screen = 'cheats';
  audio.setActive(false);
  input.releaseAll();
  showCheats({
    inVehicle: !!w.player.vehicle,
    godMode: w.godMode,
    onWeapon: id => giveWeapon(w, id),
    onRefill: () => refillAmmo(w),
    onPowerup: k => givePowerup(w, k),
    onClearWanted: () => loseTheCops(w),
    onGodMode: on => setGodMode(w, on),
    onSpawnCar: m => { spawnCarNear(w, m); resume(); },
    onClose: resume,
  });
}

/** Pauses for the boss's phone call before a storyline job. */
function brief(s: Session, title: string, b: NonNullable<GameEvents['missionStart']['brief']>) {
  const c = s.world.city, gang = c.gangs[b.gang];
  screen = 'briefing';
  input.releaseAll();
  showBriefing({
    speaker: b.speaker, lines: b.lines, title, color: gang?.color ?? '#f1c40f',
    portrait: makePortrait(gang ? bossFor(gang.name).look : null, gang?.color ?? '#f1c40f', b.gang + c.index),
    onDone: resume,
  });
}

function statsOf(w: World): [string, string][] {
  const ps = w.ps, t = Math.floor(ps.playTime), j = ps.jobs;
  const races = Object.entries(ps.raceBest).filter(([k]) => k.startsWith(`${w.city.index}-`)).map(([, v]) => `${v}s`);
  return [
    ['Play time', `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`],
    ['Jobs done', `${ps.missionsDone} (${ps.cityMissions} in this city)`],
    ['Storylines', `${ps.story.filter(n => n >= STORY_STEPS).length}/3${ps.finaleDone ? ', finale won' : ''}`],
    ['Kills / wrecks', `${ps.kills} / ${ps.wrecks}`],
    ['Hidden packages', `${ps.packages.length}/${PACKAGES_PER_CITY}`],
    ['Race records', races.length ? races.join(', ') : 'none yet'],
    ['Vehicle jobs', `taxi ${j.taxi}, ambulance ${j.ambulance}, fire ${j.fire}, vigilante ${j.vigilante}`],
    ['Cars driven', `${ps.driven.length}`],
    ['Stunts', `${ps.stunts}`],
  ];
}

function resume() {
  hide();
  input.releaseAll();
  screen = 'playing';
  audio.setActive(true);
}

const menu = (inp: InputState, onBack?: () => void) => menuInput(inp, input.lastDevice === 'gamepad', onBack);

function step(dt: number) {
  const inp = input.poll();
  syncGamepadClass(input.lastDevice === 'gamepad');
  touch?.setMode(screen === 'playing' ? 'playing' : screen === 'map' || screen === 'registry' ? 'overlay' : 'hidden');
  switch (screen) {
    case 'title':
      attract?.world.step(idle, dt);
      menu(inp);
      break;
    case 'playing': {
      const w = session!.world;
      if (inp.pressed.has('pause')) { pause(); return; }
      if (inp.pressed.has('map')) { screen = 'map'; renderer.showMap = true; audio.setActive(false); return; }
      if (inp.pressed.has('registry')) { screen = 'registry'; renderer.showRegistry = true; audio.setActive(false); return; }
      if (input.lastDevice === 'gamepad' && !audio.ctx) unlockAudio();
      if (inp.pressed.has('radio') && w.player.vehicle) {
        settings.station = (settings.station + 1) % (RADIO_OFF + 1);
        saveSettings();
        radio.setStation(settings.station);
        renderer.hud.radio = { text: radio.name(), t: 2 };
      }
      const t0 = performance.now();
      w.step(inp, dt);
      renderer.debug.simMs = renderer.debug.simMs * 0.9 + (performance.now() - t0) * 0.1;
      w.ps.playTime += dt;
      saveTimer -= dt;
      if (saveTimer <= 0) { saveTimer = AUTOSAVE_S; save(); }
      break;
    }
    case 'map':
      if (inp.pressed.has('map') || inp.pressed.has('pause') || inp.pressed.has('back')) { screen = 'playing'; renderer.showMap = false; audio.setActive(true); }
      break;
    case 'registry':
      if (inp.pressed.has('registry') || inp.pressed.has('pause') || inp.pressed.has('back')) { screen = 'playing'; renderer.showRegistry = false; audio.setActive(true); }
      break;
    case 'briefing':
      menu(inp, resume);
      break;
    case 'paused':
    case 'cheats':
      if (inp.pressed.has('pause')) { resume(); break; }
      menu(inp, resume);
      break;
    case 'cityComplete':
      menu(inp);
      break;
  }
}

const loop = new FixedLoop(step);
/** Radio plays only while the player sits in a car during play. */
function syncRadio() {
  const want = screen === 'playing' && !!session?.world.player.vehicle && settings.station !== RADIO_OFF;
  if (want && !radio.playing && audio.ctx) {
    radio.setStation(settings.station);
    renderer.hud.radio = { text: radio.name(), t: 2 };
  } else if (!want && radio.playing) radio.stop();
  radio.update();
}
/** Menus and the map barely change: draw them at a trickle. */
const fpsCap = () => (screen === 'paused' || screen === 'cheats' || screen === 'cityComplete' || screen === 'briefing' ? 10 : settings.batterySaver || screen === 'title' || screen === 'map' || screen === 'registry' ? 30 : 60);
const frame = (a: number) => { renderer.render(a); if (screen === 'playing') sfx.tick(); syncRadio(); };
let raf = startRaf(loop, frame, fpsCap);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    if (screenOnHide(screen) === 'paused' && screen === 'playing') pause();
    raf.stop();
    audio.setActive(false);
  } else {
    raf.stop();
    raf = startRaf(loop, frame, fpsCap);
  }
});
addEventListener('pagehide', save);

function expose(s: Session) {
  if (!import.meta.env.DEV) return;
  const g = window as unknown as Record<string, unknown>;
  g.__w = s.world;
  g.__game = { get screen() { return screen; }, renderer, input, audio };
  /** Dev only: jump straight to city N of the current seed. */
  g.__city = (index: number) => startSession(createSession(s.seedString, index));
}

if (import.meta.env.DEV) addEventListener('keydown', e => { if (e.code === 'F3') renderer.debug.visible = !renderer.debug.visible; });

openTitle();
