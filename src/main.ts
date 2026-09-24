import { FixedLoop, startRaf } from './core/loop';
import { createSession, nextCity, resolveSeed, type Session } from './game/session';
import { Input, type InputState } from './input/input';
import { Renderer } from './render/renderer';
import { DEFAULT_SETTINGS, readSave, restoreSession, safeStorage, writeSave, type SaveV1, type Settings } from './save/save';
import { hide } from './ui/overlay';
import { showCityComplete, showPause } from './ui/pause';
import { randomSeed, showTitle } from './ui/title';

type Screen = 'title' | 'playing' | 'paused' | 'map' | 'cityComplete';
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

const idle: InputState = { accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() };

function loadSettings(): Settings {
  try {
    const raw = store.get(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
  renderer.setWorld(attract.world);
  expose(attract);
}

let seedDebounce = 0;
function openTitle(notice: string | null = null) {
  screen = 'title';
  session = null;
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
  attract = null;
  renderer.attract = false;
  renderer.showMap = false;
  renderer.setWorld(s.world);
  input.enabled = true;
  input.releaseAll();
  hide();
  screen = 'playing';
  saveTimer = AUTOSAVE_S;
  for (const u of unsub) u();
  unsub = [
    s.world.bus.on('missionEnd', () => save()),
    s.world.bus.on('cityComplete', e => {
      save();
      screen = 'cityComplete';
      showCityComplete(e.index, () => { const n = nextCity(s); startSession(n); save(); });
    }),
  ];
  expose(s);
  canvas.focus();
}

function pause() {
  screen = 'paused';
  showPause({
    settings,
    onResume: resume,
    onQuit: () => { save(); openTitle(); },
    onSettings: s => { settings = s; saveSettings(); },
  });
}

function resume() {
  hide();
  input.releaseAll();
  screen = 'playing';
}

function step(dt: number) {
  const inp = input.poll();
  switch (screen) {
    case 'title':
      attract?.world.step(idle, dt);
      break;
    case 'playing': {
      const w = session!.world;
      if (inp.pressed.has('pause')) { pause(); return; }
      if (inp.pressed.has('map')) { screen = 'map'; renderer.showMap = true; return; }
      w.step(inp, dt);
      w.ps.playTime += dt;
      saveTimer -= dt;
      if (saveTimer <= 0) { saveTimer = AUTOSAVE_S; save(); }
      break;
    }
    case 'map':
      if (inp.pressed.has('map') || inp.pressed.has('pause')) { screen = 'playing'; renderer.showMap = false; }
      break;
    case 'paused':
      if (inp.pressed.has('pause')) resume();
      break;
    case 'cityComplete':
      break;
  }
}

const loop = new FixedLoop(step);
let raf = startRaf(loop, a => renderer.render(a), () => (settings.batterySaver || screen === 'title' ? 30 : 60));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    raf.stop();
  } else {
    raf.stop();
    raf = startRaf(loop, a => renderer.render(a), () => (settings.batterySaver || screen === 'title' ? 30 : 60));
  }
});
addEventListener('pagehide', save);

function expose(s: Session) {
  if (!import.meta.env.DEV) return;
  const g = window as unknown as Record<string, unknown>;
  g.__w = s.world;
  g.__game = { get screen() { return screen; }, renderer, input };
}

openTitle();
