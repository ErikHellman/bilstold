export type Action = 'enter' | 'weaponNext' | 'weaponPrev' | 'radio' | 'map' | 'registry' | 'pause' | 'fire' | 'handbrake';

export interface InputState {
  accel: number;
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  fire: boolean;
  handbrake: boolean;
  /** Edge-triggered actions for this tick. */
  pressed: Set<Action>;
}

const HOLD: Record<string, 'up' | 'down' | 'left' | 'right' | 'fire' | 'handbrake'> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake', ControlLeft: 'fire', ControlRight: 'fire', KeyJ: 'fire',
};
const EDGE: Record<string, Action> = {
  Enter: 'enter', KeyF: 'enter', KeyQ: 'weaponPrev', KeyE: 'weaponNext',
  KeyR: 'radio', KeyM: 'map', KeyC: 'registry', Escape: 'pause', KeyP: 'pause',
};
const PAD_EDGE: [number, Action][] = [[0, 'enter'], [4, 'weaponPrev'], [3, 'weaponNext'], [9, 'pause'], [8, 'map']];
const DEADZONE = 0.2;
const ACTIVATORS = new Set(['Enter', 'NumpadEnter', 'Space']);
const CONTROLS = new Set(['BUTTON', 'SUMMARY', 'SELECT', 'A']);

type PadLike = { connected: boolean; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] };

export class Input {
  enabled = true;
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  private held = new Set<string>();
  private edges = new Set<Action>();
  private prevPad: boolean[] = [];
  private state: InputState = { accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set() };

  constructor(target: EventTarget, private getPads: () => (PadLike | Gamepad | null)[] = defaultPads) {
    target.addEventListener('keydown', e => this.onKey(e as KeyboardEvent, true));
    target.addEventListener('keyup', e => this.onKey(e as KeyboardEvent, false));
    target.addEventListener('blur', () => this.releaseAll());
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const tag = (e.target as { tagName?: string } | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // Let focused menu buttons handle activation keys themselves.
    if (ACTIVATORS.has(e.code) && tag && CONTROLS.has(tag)) return;
    if (!this.enabled) { if (!down) this.held.delete(e.code); return; }
    const mapped = e.code in HOLD || e.code in EDGE;
    if (!mapped) return;
    e.preventDefault?.();
    this.lastDevice = 'keyboard';
    if (down) {
      this.held.add(e.code);
      if (e.code in EDGE && !e.repeat) this.edges.add(EDGE[e.code]);
    } else this.held.delete(e.code);
  }

  releaseAll(): void {
    this.held.clear();
    this.edges.clear();
    this.prevPad = [];
  }

  poll(): InputState {
    const s = this.state;
    s.pressed = this.edges;
    this.edges = new Set();
    let up = 0, down = 0, left = 0, right = 0, fire = false, hb = false;
    if (this.enabled) {
      for (const code of this.held) {
        const h = HOLD[code];
        if (h === 'up') up = 1; else if (h === 'down') down = 1; else if (h === 'left') left = 1;
        else if (h === 'right') right = 1; else if (h === 'fire') fire = true; else if (h === 'handbrake') hb = true;
      }
    } else s.pressed.clear();
    let steer = right - left, accel = up, brake = down;

    const pad = this.enabled ? firstPad(this.getPads()) : null;
    if (pad) {
      const b = (i: number) => pad.buttons[i]?.pressed ?? false;
      const v = (i: number) => pad.buttons[i]?.value ?? 0;
      const ax = pad.axes[0] ?? 0;
      const padSteer = Math.abs(ax) < DEADZONE ? 0 : ax;
      const padAccel = v(7), padBrake = v(6);
      const padFire = b(2) || b(5), padHb = b(1);
      const any = padSteer !== 0 || padAccel > 0 || padBrake > 0 || padFire || padHb || pad.buttons.some(x => x.pressed);
      if (any) this.lastDevice = 'gamepad';
      if (Math.abs(padSteer) > Math.abs(steer)) steer = padSteer;
      accel = Math.max(accel, padAccel);
      brake = Math.max(brake, padBrake);
      fire ||= padFire;
      hb ||= padHb;
      for (const [i, a] of PAD_EDGE) if (b(i) && !this.prevPad[i]) s.pressed.add(a);
      this.prevPad = pad.buttons.map(x => x.pressed);
    } else this.prevPad = [];

    s.accel = accel; s.brake = brake; s.steer = Math.max(-1, Math.min(1, steer)); s.fire = fire; s.handbrake = hb;
    return s;
  }
}

function firstPad(pads: (PadLike | Gamepad | null)[]): PadLike | null {
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

function defaultPads(): (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
}
