import type { Settings } from '../save/save';
import { controlsTable, el, show } from './overlay';
import { DIFFICULTIES, type Difficulty } from '../game/difficulty';

export interface PauseOptions {
  settings: Settings;
  onResume: () => void;
  onQuit: () => void;
  onSettings: (s: Settings) => void;
}

function slider(label: string, value: number, onchange: (v: number) => void) {
  const out = el('span', { class: 'val' }, `${Math.round(value * 100)}%`);
  const input = el('input', {
    type: 'range', min: 0, max: 100, value: Math.round(value * 100), 'aria-label': label,
    oninput: () => { out.textContent = `${input.value}%`; onchange(Number(input.value) / 100); },
  });
  return el('label', { class: 'slider' }, el('span', {}, label), input, out);
}

export function showPause(o: PauseOptions): void {
  const s = { ...o.settings };
  const update = () => o.onSettings({ ...s });
  const label: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  const diffButtons = DIFFICULTIES.map(d => el('button', {
    class: d === s.difficulty ? 'choice active' : 'choice', 'aria-pressed': String(d === s.difficulty),
    onclick: () => {
      s.difficulty = d; update();
      for (const [i, b] of diffButtons.entries()) { const on = DIFFICULTIES[i] === d; b.className = on ? 'choice active' : 'choice'; b.setAttribute('aria-pressed', String(on)); }
    },
  }, label[d]));
  const panel = el('div', { class: 'panel' },
    el('h2', {}, 'Paused'),
    el('button', { class: 'primary', autofocus: true, onclick: o.onResume }, 'Resume'),
    el('div', { class: 'row difficulty' }, el('span', {}, 'Difficulty'), ...diffButtons),
    el('details', {}, el('summary', {}, 'Settings'),
      slider('Master volume', s.master, v => { s.master = v; update(); }),
      slider('Music', s.music, v => { s.music = v; update(); }),
      slider('Sound effects', s.sfx, v => { s.sfx = v; update(); }),
      el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: s.batterySaver, onchange: (e: Event) => { s.batterySaver = (e.target as HTMLInputElement).checked; update(); } }),
        ' Battery saver (30 fps)')),
    el('details', {}, el('summary', {}, 'Controls'), controlsTable()),
    el('button', { onclick: o.onQuit }, 'Save & quit to title'),
  );
  show(panel);
}

export function showCityComplete(index: number, onNext: () => void): void {
  show(el('div', { class: 'panel' },
    el('h2', {}, `City ${index} complete!`),
    el('p', {}, 'The next city is waiting — same seed, new streets.'),
    el('button', { class: 'primary', autofocus: true, onclick: onNext }, `Continue to city ${index + 1}`)));
}
