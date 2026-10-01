import type { Action, InputState } from '../input/input';
import { uiRoot } from './overlay';

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Box { x: number; y: number; w: number; h: number }

const FOCUSABLE = 'button:not(:disabled), summary, input:not(:disabled)';
const NAV: [Action, Dir][] = [['navUp', 'up'], ['navDown', 'down'], ['navLeft', 'left'], ['navRight', 'right']];
/** Range sliders move this many percent per D-pad press. */
const SLIDER_STEP = 5;

/** Gap between the spans [a0, a1] and [b0, b1]; 0 when they overlap. */
const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

/**
 * Index of the candidate box that lies most directly in `dir` from `from`, or -1.
 * Distances are edge to edge, so a control must actually sit past `from` (not merely have its centre there)
 * and side-by-side controls don't count as above or below each other. Distance along the direction counts
 * once; sideways gap between the boxes counts double, so rows and grids feel natural.
 */
export function pickInDirection(from: Box, candidates: Box[], dir: Dir): number {
  const vertical = dir === 'up' || dir === 'down';
  let best = -1, bestScore = Infinity;
  candidates.forEach((c, i) => {
    const along = dir === 'down' ? c.y - (from.y + from.h) : dir === 'up' ? from.y - (c.y + c.h)
      : dir === 'right' ? c.x - (from.x + from.w) : from.x - (c.x + c.w);
    if (along < -(vertical ? Math.min(from.h, c.h) : Math.min(from.w, c.w)) / 4) return;
    const side = vertical ? gap(from.x, from.x + from.w, c.x, c.x + c.w) : gap(from.y, from.y + from.h, c.y, c.y + c.h);
    const centre = vertical ? Math.abs(c.x + c.w / 2 - from.x - from.w / 2) : Math.abs(c.y + c.h / 2 - from.y - from.h / 2);
    const score = Math.max(0, along) + 2 * side + 0.01 * centre;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** Inputs are measured by their whole <label> row, so a small checkbox or slider sits where its row does. */
const box = (e: Element): Box => {
  const r = (e.tagName === 'INPUT' && e.closest('label') || e).getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** Inside a collapsed <details> (other than being its own summary)? Chromium still lays such content out. */
function collapsed(e: HTMLElement): boolean {
  for (let d = e.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
    if (!d.open && !(e.tagName === 'SUMMARY' && e.parentElement === d)) return true;
  }
  return false;
}

/** Focusable menu controls that are actually shown (not in a closed <details> or a hidden row). */
function focusables(): HTMLElement[] {
  return [...uiRoot().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(e => e.getClientRects().length > 0 && !collapsed(e));
}

function move(dir: Dir) {
  const items = focusables();
  if (!items.length) return;
  const cur = document.activeElement;
  if (!(cur instanceof HTMLElement) || !items.includes(cur)) { items[0].focus(); return; }
  if (cur instanceof HTMLInputElement && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    if (dir === 'right') cur.stepUp(SLIDER_STEP); else cur.stepDown(SLIDER_STEP);
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const others = items.filter(e => e !== cur);
  const i = pickInDirection(box(cur), others.map(box), dir);
  if (i >= 0) others[i].focus();
  // Nothing further down/up: wrap around like most console menus.
  else if (dir === 'down') items[0].focus();
  else if (dir === 'up') items[items.length - 1].focus();
}

/**
 * Gamepad control of the DOM menus: D-pad / left stick moves focus, A (Cross) activates, B (Circle) goes back.
 * Keyboard users already get this natively from Tab / Enter / Space.
 */
export function menuInput(inp: InputState, fromGamepad: boolean, onBack?: () => void): void {
  if (inp.pressed.has('back') && onBack) { onBack(); return; }
  for (const [a, d] of NAV) if (inp.pressed.has(a)) move(d);
  if (!inp.pressed.has('enter') || !fromGamepad) return;
  const el = document.activeElement;
  const activatable = el instanceof HTMLButtonElement || (el instanceof HTMLElement && el.tagName === 'SUMMARY')
    || (el instanceof HTMLInputElement && el.type === 'checkbox');
  if (activatable) el.click();
}

/** Show focus rings while the gamepad is in use; browsers hide them after mouse use or programmatic focus. */
export function syncGamepadClass(gamepad: boolean): void {
  document.body.classList.toggle('gamepad', gamepad);
}
