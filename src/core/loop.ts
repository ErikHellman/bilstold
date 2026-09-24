import { DT, MAX_STEPS, MAX_FRAME_MS } from './const';

/** Fixed-timestep accumulator. Pure logic so it can be tested without rAF. */
export class FixedLoop {
  acc = 0;
  alpha = 0;

  constructor(private step: (dt: number) => void) {}

  advance(frameMs: number): number {
    this.acc += Math.min(Math.max(frameMs, 0), MAX_FRAME_MS) / 1000;
    let n = 0;
    while (this.acc >= DT && n < MAX_STEPS) {
      this.step(DT);
      this.acc -= DT;
      n++;
    }
    if (this.acc >= DT) this.acc = 0; // drop backlog: no spiral of death
    this.alpha = this.acc / DT;
    return n;
  }
}

/** Whether enough time has passed since the last drawn frame for the given fps cap. */
export function shouldDraw(elapsedMs: number, capFps: number): boolean {
  // 0.8 tolerance: on a 60 Hz display every frame qualifies at cap 60; on 144 Hz every other frame does.
  return elapsedMs >= (1000 / capFps) * 0.8;
}

export function startRaf(loop: FixedLoop, render: (alpha: number) => void, fpsCap: () => number) {
  let last = performance.now(), lastDraw = 0, id = 0;
  const frame = (t: number) => {
    id = requestAnimationFrame(frame);
    const cap = fpsCap();
    if (!shouldDraw(t - lastDraw, cap)) return;
    lastDraw = t;
    loop.advance(t - last);
    last = t;
    render(loop.alpha);
  };
  id = requestAnimationFrame(frame);
  return { stop() { cancelAnimationFrame(id); } };
}
