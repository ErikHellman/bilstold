import { clamp } from '../core/math';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  shake = 0;
  private shakeX = 0;
  private shakeY = 0;

  constructor(public viewW: number, public viewH: number) {}

  follow(tx: number, ty: number, vx: number, vy: number, speed: number, dt: number): void {
    const target = 1 - 0.45 * clamp((speed - 80) / 420, 0, 1);
    this.zoom += (target - this.zoom) * Math.min(1, 2 * dt);
    let lx = vx * 0.3, ly = vy * 0.3;
    const l = Math.hypot(lx, ly);
    if (l > 120) { lx *= 120 / l; ly *= 120 / l; }
    const k = Math.min(1, 6 * dt);
    this.x += (tx + lx - this.x) * k;
    this.y += (ty + ly - this.y) * k;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 12);
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
    } else this.shakeX = this.shakeY = 0;
  }

  snap(x: number, y: number) { this.x = x; this.y = y; }

  addShake(amount: number) { this.shake = Math.min(12, this.shake + amount); }

  worldToScreen(x: number, y: number, out: { x: number; y: number }) {
    out.x = (x - this.x) * this.zoom + this.viewW / 2 + this.shakeX;
    out.y = (y - this.y) * this.zoom + this.viewH / 2 + this.shakeY;
    return out;
  }

  /** Applies the world transform to a 2D context. */
  apply(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom,
      Math.round(this.viewW / 2 - this.x * this.zoom + this.shakeX), Math.round(this.viewH / 2 - this.y * this.zoom + this.shakeY));
  }

  visibleRect() {
    const hw = this.viewW / 2 / this.zoom, hh = this.viewH / 2 / this.zoom;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
