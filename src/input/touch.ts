import type { Action, Input } from './input';

/** Pixels the thumb travels from where it landed to reach full stick deflection. */
const STICK_RADIUS = 60;

export type TouchMode = 'playing' | 'overlay' | 'hidden';

/** Phones and tablets, or any browser with ?touch=1 for testing. */
export function isTouchDevice(): boolean {
  return new URLSearchParams(location.search).has('touch')
    || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
}

/**
 * On-screen controls: a floating stick on the left half, action buttons on the right and menu buttons
 * along the top. In 'overlay' mode (map, registry) any tap closes the overlay.
 */
export class TouchControls {
  private root = document.createElement('div');
  private overlay = document.createElement('div');
  private stick = document.createElement('div');
  private knob = document.createElement('div');
  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private state = { x: 0, y: 0, fire: false, handbrake: false, brake: false };
  private mode: TouchMode = 'hidden';

  constructor(private input: Input, parent: HTMLElement = document.body) {
    document.body.classList.add('touch');
    this.root.id = 'touch';
    this.root.hidden = true;
    this.overlay.id = 'touch-overlay';
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', e => { e.preventDefault(); input.tap('back'); });

    const zone = div('zone');
    zone.addEventListener('pointerdown', e => this.stickDown(e));
    zone.addEventListener('pointermove', e => this.stickMove(e));
    zone.addEventListener('pointerup', e => this.stickUp(e));
    zone.addEventListener('pointercancel', e => this.stickUp(e));
    this.stick.className = 'stick';
    this.knob.className = 'knob';
    this.stick.append(this.knob);
    this.stick.hidden = true;
    zone.append(this.stick);

    const pad = div('pad');
    pad.append(
      this.hold('FIRE', 'fire', 'fire'),
      this.tapButton('ENTER', 'enter', 'enter'),
      this.hold('DRIFT', 'handbrake', 'handbrake'),
      this.hold('BRAKE', 'brake', 'brake'),
      this.tapButton('GUN', 'weaponNext', 'weapon'),
    );
    const top = div('top');
    top.append(this.tapButton('II', 'pause', 'small'), this.tapButton('MAP', 'map', 'small'), this.tapButton('RADIO', 'radio', 'small'));

    this.root.append(zone, pad, top);
    const rotate = div('rotate');
    rotate.id = 'rotate';
    rotate.textContent = 'Turn your device sideways';
    parent.append(this.root, this.overlay, rotate);
    // Browsers only allow fullscreen from a user gesture.
    addEventListener('pointerdown', () => { void document.documentElement.requestFullscreen?.().catch(() => {}); }, { once: true });
  }

  setMode(mode: TouchMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.hidden = mode !== 'playing';
    this.overlay.hidden = mode !== 'overlay';
    if (mode !== 'playing') this.reset();
  }

  private reset() {
    this.stickId = null;
    this.stick.hidden = true;
    this.state = { x: 0, y: 0, fire: false, handbrake: false, brake: false };
    this.root.querySelectorAll('.down').forEach(b => b.classList.remove('down'));
    this.push();
  }

  private push() { this.input.setTouch({ ...this.state }); }

  private stickDown(e: PointerEvent) {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic or already-ended pointer */ }
    this.ox = e.clientX; this.oy = e.clientY;
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.stick.hidden = false;
    this.moveKnob(0, 0);
  }

  private stickMove(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    let dx = (e.clientX - this.ox) / STICK_RADIUS, dy = (e.clientY - this.oy) / STICK_RADIUS;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    this.moveKnob(dx, dy);
  }

  private stickUp(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.stick.hidden = true;
    this.moveKnob(0, 0);
  }

  private moveKnob(x: number, y: number) {
    this.knob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
    this.state.x = x; this.state.y = y;
    this.push();
  }

  private hold(label: string, key: 'fire' | 'handbrake' | 'brake', cls: string) {
    const b = button(label, cls);
    const set = (on: boolean) => (e: PointerEvent) => {
      e.preventDefault();
      if (on) try { b.setPointerCapture(e.pointerId); } catch { /* synthetic or already-ended pointer */ }
      b.classList.toggle('down', on);
      this.state[key] = on;
      this.push();
    };
    b.addEventListener('pointerdown', set(true));
    b.addEventListener('pointerup', set(false));
    b.addEventListener('pointercancel', set(false));
    return b;
  }

  private tapButton(label: string, action: Action, cls: string) {
    const b = button(label, cls);
    b.addEventListener('pointerdown', e => { e.preventDefault(); this.input.tap(action); });
    return b;
  }
}

function div(cls: string) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function button(label: string, cls: string) {
  const b = document.createElement('button');
  b.className = `tb ${cls}`;
  b.textContent = label;
  b.tabIndex = -1;
  return b;
}
