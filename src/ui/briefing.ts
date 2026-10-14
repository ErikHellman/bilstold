import { el, show } from './overlay';

export interface BriefingOptions {
  speaker: string;
  lines: string[];
  title: string;
  color: string;
  portrait: HTMLCanvasElement;
  onDone: () => void;
}

/** A phone call before a storyline job: who is talking, what they say, and the job. */
export function showBriefing(o: BriefingOptions): void {
  o.portrait.className = 'portrait';
  o.portrait.style.borderColor = o.color;
  show(el('div', { class: 'panel briefing' },
    el('div', { class: 'row' }, o.portrait,
      el('div', { class: 'who' }, el('h2', { style: `color:${o.color}` }, o.speaker), el('span', {}, 'is on the line'))),
    ...o.lines.map(l => el('p', {}, `“${l}”`)),
    el('p', { class: 'job' }, o.title),
    el('button', { class: 'primary', autofocus: true, onclick: o.onDone }, 'Take the job')));
}
