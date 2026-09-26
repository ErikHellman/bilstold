import { AudioEngine } from './audio/audio';
import { Sfx } from './audio/sfx';
import { Radio, RADIO_OFF } from './audio/radio';
import { FixedLoop, startRaf } from './core/loop';
import { createSession, nextCity, resolveSeed, type Session } from './game/session';
import { Input, type InputState } from './input/input';
import { Renderer } from './render/renderer';
import { DEFAULT_SETTINGS, readSave, restoreSession, safeStorage, writeSave, type SaveV1, type Settings } from './save/save';
import { hide } from './ui/overlay';
import { showCityComplete, showPause } from './ui/pause';
import { randomSeed, showTitle } from './ui/title';
import { screenOnHide, type Screen } from './ui/screens';
import { DIFFICULTIES } from './game/difficulty';

const SETTINGS_KEY = 'bilstold.settings';
const AUTOSAVE_S = 10;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(window);
const renderer = new Renderer(canvas);
const store = safeStorage();

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
  return { ...DEFAULT_SETTINGS };
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
    s.world.bus.on('cityComplete', e => {
      save();
      screen = 'cityComplete';
      audio.setActive(false);
      showCityComplete(e.index, () => { const n = nextCity(s); startSession(n); save(); });
    }),
  ];
  expose(s);
  canvas.focus();
}

function pause() {
  screen = 'paused';
  audio.setActive(false);
  showPause({
    settings,
    onResume: resume,
    onQuit: () => { save(); if (import.meta.env.DEV) addEventListener('keydown', e => { if (e.code === 'F3') renderer.debug.visible = !renderer.debug.visible; });

openTitle(); },
    onSettings: s => { settings = s; saveSettings(); audio.setVolumes(s); if (session) session.world.difficulty = s.difficulty; },
  });
}

function resume() {
  hide();
  input.releaseAll();
  screen = 'playing';
  audio.setActive(true);
}

/** Gamepad A activates the focused menu button (keyboard Enter/Space already does natively). */
function pressFocusedButton(inp: InputState) {
  if (!inp.pressed.has('enter') || input.lastDevice !== 'gamepad') return;
  const el = document.activeElement;
  if (el instanceof HTMLButtonElement) el.click();
}

function step(dt: number) {
  const inp = input.poll();
  switch (screen) {
    case 'title':
      attract?.world.step(idle, dt);
      pressFocusedButton(inp);
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
      if (inp.pressed.has('map') || inp.pressed.has('pause')) { screen = 'playing'; renderer.showMap = false; audio.setActive(true); }
      break;
    case 'registry':
      if (inp.pressed.has('registry') || inp.pressed.has('pause')) { screen = 'playing'; renderer.showRegistry = false; audio.setActive(true); }
      break;
    case 'paused':
      if (inp.pressed.has('pause')) { resume(); break; }
      pressFocusedButton(inp);
      break;
    case 'cityComplete':
      pressFocusedButton(inp);
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
const fpsCap = () => (screen === 'paused' || screen === 'cityComplete' ? 10 : settings.batterySaver || screen === 'title' || screen === 'map' || screen === 'registry' ? 30 : 60);
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
}

if (import.meta.env.DEV) addEventListener('keydown', e => { if (e.code === 'F3') renderer.debug.visible = !renderer.debug.visible; });

openTitle();
