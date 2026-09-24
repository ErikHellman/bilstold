import { makeRng, randomSeedName } from '../core/rng';
import type { SaveV1 } from '../save/save';
import { controlsTable, el, show } from './overlay';

export interface TitleOptions {
  save: SaveV1 | null;
  notice: string | null;
  initialSeed: string;
  onContinue: () => void;
  onNewGame: (seed: string) => void;
  onSeedChange: (seed: string) => void;
  onFocusText: (focused: boolean) => void;
}

export const randomSeed = () => randomSeedName(makeRng((Math.random() * 2 ** 32) >>> 0));

export function showTitle(o: TitleOptions): void {
  const input = el('input', {
    type: 'text', maxLength: 64, value: o.initialSeed, spellcheck: false, 'aria-label': 'City seed',
    onfocus: () => o.onFocusText(true), onblur: () => o.onFocusText(false),
    oninput: () => o.onSeedChange(input.value),
    onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') start(); },
  });
  const confirmRow = el('div', { class: 'confirm', hidden: true },
    el('span', {}, 'Overwrite your saved game? '),
    el('button', { onclick: () => o.onNewGame(input.value) }, 'Yes, start over'),
    el('button', { onclick: () => { confirmRow.hidden = true; } }, 'No'));
  const start = () => {
    if (o.save) confirmRow.hidden = false;
    else o.onNewGame(input.value);
  };
  const s = o.save;
  const panel = el('div', { class: 'panel title' },
    el('h2', {}, 'Stjäl bilar. Skapa kaos.'),
    o.notice ? el('p', { class: 'notice' }, o.notice) : null,
    s ? el('button', { class: 'primary', autofocus: true, onclick: o.onContinue },
      `Continue — seed "${s.seed}", city ${s.cityIndex}, $${Math.floor(s.ps.score).toLocaleString('sv-SE')}`) : null,
    el('div', { class: 'row' },
      el('label', {}, 'City seed ', input),
      el('button', { title: 'Random seed', onclick: () => { input.value = randomSeed(); o.onSeedChange(input.value); } }, '🎲')),
    el('button', { class: s ? '' : 'primary', autofocus: !s, onclick: start }, 'New game'),
    confirmRow,
    el('details', {}, el('summary', {}, 'Controls'), controlsTable()),
  );
  show(panel);
}
