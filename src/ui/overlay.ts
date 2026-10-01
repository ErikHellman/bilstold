type Child = Node | string | null | false | undefined;

/** Tiny DOM builder for the menu overlay. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
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

export const CONTROLS_HELP = [
  ['W / ↑', 'Accelerate / walk'], ['S / ↓', 'Brake / reverse'], ['A D / ← →', 'Steer / turn'], ['Space', 'Handbrake'],
  ['Ctrl / J', 'Fire'], ['Enter / F', 'Enter or exit car'], ['Q / E', 'Change weapon'], ['R', 'Radio station'],
  ['M', 'Map'], ['C', 'Vehicle registry'], ['Esc / P', 'Pause'], ['Gamepad', 'Left stick walk / steer, RT gas, LT brake, A car, X or RB fire, B handbrake, LB/Y weapon, Back map, Start pause'],
  ['Gamepad menus', 'D-pad or stick to move, A select, B back'],
];

export function controlsTable(): HTMLElement {
  return el('table', { class: 'controls' }, ...CONTROLS_HELP.map(([k, v]) => el('tr', {}, el('td', { class: 'key' }, k), el('td', {}, v))));
}
