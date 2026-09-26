/**
 * SECRET: the cheats menu opens when the Konami code is typed during play:
 *
 *   ↑ ↑ ↓ ↓ ← → ← → B A
 *
 * The title screen only hints at it ("a certain 1986 code"). Keys are matched by
 * `KeyboardEvent.code`, so the code works on any keyboard layout.
 */
export const CHEAT_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA',
];

/** Watches key presses for CHEAT_CODE and calls onUnlock each time the full sequence is typed. */
export class CheatCode {
  /** The most recent key codes, at most code.length of them. */
  private recent: string[] = [];

  constructor(target: EventTarget, private onUnlock: () => void, private code: readonly string[] = CHEAT_CODE) {
    target.addEventListener('keydown', e => this.onKey(e as KeyboardEvent));
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    const tag = (e.target as { tagName?: string } | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.recent.push(e.code);
    if (this.recent.length > this.code.length) this.recent.shift();
    if (this.recent.length === this.code.length && this.recent.every((c, i) => c === this.code[i])) {
      this.recent = [];
      this.onUnlock();
    }
  }
}
