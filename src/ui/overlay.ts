import type { PadKind } from '../input/input';

type Child = Node | string | null | false | undefined;

/** Tiny DOM builder for the menu overlay. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    // aria-*, data-*: not DOM properties, so they must be set as attributes.
    else if (k.includes('-')) e.setAttribute(k, String(v));
    else if (v !== undefined && v !== null && v !== false) (e as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

export const uiRoot = () => document.getElementById('ui')!;

export function show(panel: HTMLElement) {
  const root = uiRoot();
  root.replaceChildren(panel);
  const first = panel.querySelector<HTMLElement>('[autofocus]') ?? panel.querySelector<HTMLElement>('button');
  first?.focus();
}

export function hide() { uiRoot().replaceChildren(); }

export const CONTROLS_HELP: [string, string][] = [
  ['W / ↑', 'Accelerate / walk'], ['S / ↓', 'Brake / reverse'], ['A D / ← →', 'Steer / turn'], ['Space', 'Handbrake'],
  ['Ctrl / J', 'Fire'], ['Enter / F', 'Enter or exit car'], ['Q / E', 'Change weapon'], ['R', 'Radio station'],
  ['M', 'Map'], ['C', 'Vehicle registry'], ['Esc / P', 'Pause'],
];

type PadButton = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'View' | 'Menu' | 'LS' | '✚↑' | '✚↓' | '✚←→';
/** Gamepad bindings (see PAD in input/input.ts), as button glyphs. */
export const PAD_HELP: [PadButton[], string][] = [
  [['LS'], 'Walk / steer'], [['RT'], 'Accelerate'], [['LT'], 'Brake / reverse'], [['X'], 'Handbrake'],
  [['A'], 'Fire'], [['Y'], 'Enter or exit car'], [['LB', 'RB'], 'Change weapon (or ✚ left / right)'],
  [['✚↑'], 'Radio station'], [['✚↓'], 'Vehicle registry'], [['View'], 'Map'], [['Menu'], 'Pause'],
  [['A', 'B'], 'Menus: select / back (B also closes the map)'],
];
const PS_NAMES: Partial<Record<PadButton, string>> = { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', View: 'Create', Menu: 'Options' };

let padKind: PadKind = 'none';

function glyph(b: PadButton): HTMLElement {
  const face = b.length === 1 ? ` face ${b.toLowerCase()}` : '';
  return el('span', { class: `btn${face}` }, padKind === 'playstation' ? PS_NAMES[b] ?? b : b);
}

function fillControls(table: HTMLElement) {
  const rows = padKind === 'none'
    ? CONTROLS_HELP.map(([k, v]) => el('tr', {}, el('td', { class: 'key' }, k), el('td', {}, v)))
    : PAD_HELP.map(([bs, v]) => el('tr', {}, el('td', { class: 'key' }, ...bs.map(glyph)), el('td', {}, v)));
  table.replaceChildren(...rows);
}

/** The controls help: keyboard keys, or the connected gamepad's buttons (updated live by syncControlsHelp). */
export function controlsTable(): HTMLElement {
  const t = el('table', { class: 'controls help' });
  fillControls(t);
  return t;
}

/** Switch every shown controls table between keyboard and gamepad when a pad is plugged in or removed. */
export function syncControlsHelp(kind: PadKind): void {
  if (kind === padKind) return;
  padKind = kind;
  for (const t of uiRoot().querySelectorAll<HTMLElement>('table.controls.help')) fillControls(t);
}
