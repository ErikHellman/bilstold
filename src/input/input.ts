import { DT } from '../core/const';

export type Action = 'enter' | 'select' | 'weaponNext' | 'weaponPrev' | 'radio' | 'map' | 'registry' | 'pause' | 'fire' | 'handbrake'
  | 'back' | 'navUp' | 'navDown' | 'navLeft' | 'navRight';

export interface InputState {
  accel: number;
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  fire: boolean;
  handbrake: boolean;
  /** Left analog stick in screen space (x right, y down), deadzoned; 0/absent when centred. Gamepad only. */
  moveX?: number;
  moveY?: number;
  /** Touch stick: in a car, point where you want to go instead of steering left and right. */
  absolute?: boolean;
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
// W3C "standard" mapping: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle, 4 LB/L1, 5 RB/R1,
// 6 LT/L2, 7 RT/R2, 8 View/Create, 9 Menu/Options, 12-15 D-pad up/down/left/right.
// In play (GTA-style): RT gas, LT brake, A fire, X handbrake, Y enter/exit, LB/RB or D-pad left/right weapon,
// D-pad up radio, D-pad down vehicle registry, View map, Menu pause. In menus: A select, B back.
// The labels in ui/overlay.ts (PAD_HELP) must match.
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const PAD_EDGE: [number, Action][] = [
  [PAD.A, 'select'], [PAD.B, 'back'], [PAD.Y, 'enter'], [PAD.LB, 'weaponPrev'], [PAD.RB, 'weaponNext'],
  [PAD.LEFT, 'weaponPrev'], [PAD.RIGHT, 'weaponNext'], [PAD.UP, 'radio'], [PAD.DOWN, 'registry'],
  [PAD.VIEW, 'map'], [PAD.MENU, 'pause'],
];
/** Pad actions that still fire while a text field has focus, so menus stay navigable. */
const MENU_ACTIONS = new Set<Action>(['select', 'back']);
const DPAD: [number, Action][] = [[12, 'navUp'], [13, 'navDown'], [14, 'navLeft'], [15, 'navRight']];
const DEADZONE = 0.2;
/** Stick deflection that counts as a menu direction. */
const NAV_THRESHOLD = 0.5;
/** Held menu directions auto-repeat after this delay, at this interval (in ticks). */
const NAV_DELAY = Math.round(0.4 / DT), NAV_RATE = Math.round(0.15 / DT);
const ACTIVATORS = new Set(['Enter', 'NumpadEnter', 'Space']);
const CONTROLS = new Set(['BUTTON', 'SUMMARY', 'SELECT', 'A']);

type PadLike = { connected: boolean; mapping?: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] };
type NavAction = 'navUp' | 'navDown' | 'navLeft' | 'navRight';
/** Which button names to show: PlayStation pads get Cross/Circle/Square/Triangle, everything else Xbox names. */
export type PadKind = 'none' | 'xbox' | 'playstation';

export class Input {
  enabled = true;
  lastDevice: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  /** The pad read on the last poll, if any. */
  padKind: PadKind = 'none';
  /** Latest on-screen controls state (see input/touch.ts). */
  private touch = { x: 0, y: 0, fire: false, handbrake: false, brake: false };
  private held = new Set<string>();
  private edges = new Set<Action>();
  private prevPad: boolean[] = [];
  private navDir: NavAction | null = null;
  private navTicks = 0;
  /** Set by releaseAll: buttons held on the next poll are ignored until released, so they don't act again. */
  private latchPad = false;
  private suppressed = new Set<number>();
  private state: InputState = { accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, moveX: 0, moveY: 0, pressed: new Set() };

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

  /** On-screen stick (-1..1 each axis, screen space) and held buttons. */
  setTouch(t: { x: number; y: number; fire: boolean; handbrake: boolean; brake: boolean }): void {
    this.touch = t;
    this.lastDevice = 'touch';
  }

  /** An on-screen button press. */
  tap(a: Action): void {
    this.lastDevice = 'touch';
    if (this.enabled) this.edges.add(a);
  }

  releaseAll(): void {
    this.held.clear();
    this.edges.clear();
    // A button still held from a menu (e.g. A on "Resume") must not act again in the next screen.
    this.latchPad = true;
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
    let steer = right - left, accel = up, brake = down, moveX = 0, moveY = 0;

    // The pad is read even while a text field has focus: it can't type, and it must be able to leave the field.
    const pad = firstPad(this.getPads());
    if (pad) {
      this.padKind = padKind(pad);
      if (this.latchPad) pad.buttons.forEach((x, i) => { if (x.pressed) this.suppressed.add(i); });
      for (const i of this.suppressed) if (!pad.buttons[i]?.pressed) this.suppressed.delete(i);
      const b = (i: number) => (pad.buttons[i]?.pressed ?? false) && !this.suppressed.has(i);
      const v = (i: number) => this.suppressed.has(i) ? 0 : pad.buttons[i]?.value ?? 0;
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      const any = mag >= DEADZONE || pad.buttons.some(x => x.pressed);
      if (any) this.lastDevice = 'gamepad';
      if (this.enabled) {
        const padSteer = Math.abs(ax) < DEADZONE ? 0 : ax;
        if (mag >= DEADZONE) { const k = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag; moveX = ax * k; moveY = ay * k; }
        if (Math.abs(padSteer) > Math.abs(steer)) steer = padSteer;
        accel = Math.max(accel, v(PAD.RT));
        brake = Math.max(brake, v(PAD.LT));
        fire ||= b(PAD.A);
        hb ||= b(PAD.X);
      }
      const edges = this.latchPad ? new Set<Action>() : s.pressed;
      for (const [i, a] of PAD_EDGE) if (b(i) && !this.prevPad[i] && (this.enabled || MENU_ACTIONS.has(a))) edges.add(a);
      this.navigate(pad, ax, ay, edges);
      this.prevPad = pad.buttons.map(x => x.pressed);
    } else { this.prevPad = []; this.navDir = null; this.suppressed.clear(); this.padKind = 'none'; }
    this.latchPad = false;

    let absolute = false;
    const t = this.touch, tm = Math.hypot(t.x, t.y);
    if (this.enabled) {
      if (tm >= DEADZONE && tm > Math.hypot(moveX, moveY)) {
        const k = Math.min(1, (tm - DEADZONE) / (1 - DEADZONE)) / tm;
        moveX = t.x * k; moveY = t.y * k; absolute = true;
      }
      fire ||= t.fire; hb ||= t.handbrake;
      if (t.brake) brake = 1;
    }

    s.accel = accel; s.brake = brake; s.steer = Math.max(-1, Math.min(1, steer)); s.fire = fire; s.handbrake = hb;
    s.moveX = moveX; s.moveY = moveY; s.absolute = absolute;
    return s;
  }

  /** Menu directions from the D-pad or left stick, with keyboard-style auto-repeat while held. */
  private navigate(pad: PadLike, ax: number, ay: number, out: Set<Action>) {
    let dir: NavAction | null = null;
    for (const [i, a] of DPAD) if (pad.buttons[i]?.pressed) { dir = a as NavAction; break; }
    if (!dir && Math.max(Math.abs(ax), Math.abs(ay)) >= NAV_THRESHOLD) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'navRight' : 'navLeft') : (ay > 0 ? 'navDown' : 'navUp');
    }
    if (dir !== this.navDir) { this.navDir = dir; this.navTicks = 0; if (dir) out.add(dir); return; }
    if (!dir) return;
    this.navTicks++;
    if (this.navTicks >= NAV_DELAY && (this.navTicks - NAV_DELAY) % NAV_RATE === 0) out.add(dir);
  }
}

/** Prefer a pad the browser maps to the standard layout: some controllers (e.g. a DualSense on Linux)
 *  also expose motion-sensor or touchpad devices that would otherwise shadow the real one. */
function firstPad(pads: (PadLike | Gamepad | null)[]): PadLike | null {
  let fallback: PadLike | null = null;
  for (const p of pads) {
    if (!p || !p.connected) continue;
    if (p.mapping === 'standard') return p;
    if (!fallback || p.buttons.length > fallback.buttons.length) fallback = p;
  }
  return fallback;
}

function padKind(p: PadLike | Gamepad): PadKind {
  const id = 'id' in p ? p.id : '';
  // 054c is Sony's USB vendor id.
  return /054c|playstation|dualsense|dualshock/i.test(id) ? 'playstation' : 'xbox';
}

function defaultPads(): (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
}
