import type { World } from '../sim/world';
import type { Ped } from '../sim/types';
import type { Camera } from './camera';
import type { Canvas, Ctx } from './canvas';
import { PED_FRAME, type PedSprites } from './sprites/peds';

const tmp = { x: 0, y: 0 };

/** Draws a sprite centred at a world position, rotated. Uses setTransform to avoid save/restore. */
export function drawRotated(ctx: Ctx, cam: Camera, img: Canvas, x: number, y: number, angle: number, scale = 1) {
  cam.worldToScreen(x, y, tmp);
  const z = cam.zoom * scale, c = Math.cos(angle) * z, s = Math.sin(angle) * z;
  ctx.setTransform(c, s, -s, c, tmp.x, tmp.y);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
}

function pedFrame(p: Ped): number {
  if (p.dead) return PED_FRAME.dead;
  if (p.burning > 0) return PED_FRAME.burning;
  if (p.shocked > 0) return PED_FRAME.shocked;
  const moving = p.vx * p.vx + p.vy * p.vy > 4;
  return moving ? Math.floor(p.anim / 7) % 4 : 0;
}

export function inView(cam: Camera, x: number, y: number, margin: number) {
  const r = cam.visibleRect();
  return x > r.x0 - margin && x < r.x1 + margin && y > r.y0 - margin && y < r.y1 + margin;
}

export function drawPeds(ctx: Ctx, cam: Camera, w: World, sprites: PedSprites, dead: boolean) {
  const items = w.peds.items;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (!p.active || p.vehicle || p.dead !== dead || !inView(cam, p.x, p.y, 16)) continue;
    const frames = sprites[p.skin] ?? sprites[1];
    drawRotated(ctx, cam, frames[pedFrame(p)], p.x, p.y, p.angle);
  }
}
