import type { World } from '../sim/world';
import type { Ctx } from './canvas';
import { drawText } from './font';

/** Dev-only performance overlay (F3). */
export class DebugOverlay {
  visible = false;
  private frames = 0;
  private fps = 0;
  private acc = 0;
  simMs = 0;
  renderMs = 0;

  frame(dt: number) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) { this.fps = this.frames / this.acc; this.frames = 0; this.acc = 0; }
  }

  draw(ctx: Ctx, w: World, chunks: number, viewH: number) {
    if (!this.visible) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(4, viewH - 76, 170, 52);
    const lines = [
      `FPS ${this.fps.toFixed(0)}  SIM ${this.simMs.toFixed(2)}MS`,
      `RENDER ${this.renderMs.toFixed(2)}MS`,
      `PEDS ${w.peds.count} CARS ${w.countVehicles(false)}+${w.countVehicles(true)}`,
      `CHUNKS ${chunks} PROJ ${w.projectiles.count}`,
    ];
    lines.forEach((l, i) => drawText(ctx, l, 8, viewH - 72 + i * 12, '#9f9'));
  }
}
