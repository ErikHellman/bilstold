import { TILE } from '../core/const';
import type { World } from '../sim/world';
import { T } from '../world/tiles';
import type { Camera } from './camera';
import { ctx2d, hash01, makeCanvas, type Canvas, type Ctx } from './canvas';

/** Darkness drawn over the street level of a night city, with holes cut for street lamps, headlights and fire. */
export class NightLayer {
  private dark: Canvas = makeCanvas(1, 1);
  private dctx: Ctx = ctx2d(this.dark);
  private glow = soft(64);
  private tmp = { x: 0, y: 0 };

  draw(ctx: Ctx, cam: Camera, w: World): void {
    const W = cam.viewW, H = cam.viewH, z = cam.zoom, d = this.dctx;
    if (this.dark.width !== W || this.dark.height !== H) { this.dark.width = W; this.dark.height = H; }
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = 'rgba(6, 8, 28, 0.66)';
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      cam.worldToScreen(x, y, this.tmp);
      const s = r * z;
      if (this.tmp.x < -s || this.tmp.y < -s || this.tmp.x > W + s || this.tmp.y > H + s) return;
      d.globalAlpha = a;
      d.drawImage(this.glow, this.tmp.x - s, this.tmp.y - s, s * 2, s * 2);
    };
    // street lamps on kerbs, placed by a fixed hash so they never move
    const r = cam.visibleRect(), c = w.city;
    const tx0 = Math.max(0, Math.floor(r.x0 / TILE) - 2), tx1 = Math.min(c.size - 1, Math.ceil(r.x1 / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(r.y0 / TILE) - 2), ty1 = Math.min(c.size - 1, Math.ceil(r.y1 / TILE) + 2);
    const lamps: number[] = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * c.size + tx;
      if (c.tiles[i] !== T.Sidewalk || (tx + ty) % 3 !== 0 || hash01(tx, ty) > 0.3) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      hole(x, y, 70, 0.85);
      lamps.push(x, y);
    }
    // headlights: a pool ahead of every car with a driver
    w.vehicles.each(v => {
      if (!v.driver || v.wreck) return;
      const ca = Math.cos(v.angle), sa = Math.sin(v.angle);
      hole(v.x + ca * (v.def.length * 0.5 + 34), v.y + sa * (v.def.length * 0.5 + 34), 44, 0.9);
      hole(v.x + ca * (v.def.length * 0.5 + 80), v.y + sa * (v.def.length * 0.5 + 80), 40, 0.6);
    });
    w.fires.each(f => hole(f.x, f.y, 60, 1));
    w.explosions.each(e => hole(e.x, e.y, e.r * 3, 1));
    const p = w.player;
    hole(p.x, p.y, 46, 0.7);
    d.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.dark, 0, 0);
    // the lamps themselves
    ctx.fillStyle = '#ffe9a8';
    for (let k = 0; k < lamps.length; k += 2) {
      cam.worldToScreen(lamps[k], lamps[k + 1], this.tmp);
      ctx.fillRect(this.tmp.x - 1, this.tmp.y - 1, 2, 2);
    }
  }
}

/** A white disc that fades to transparent at its edge. */
function soft(size: number): Canvas {
  const c = makeCanvas(size, size), x = ctx2d(c), h = size / 2;
  const g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}
