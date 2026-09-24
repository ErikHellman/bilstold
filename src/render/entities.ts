import type { World } from '../sim/world';
import type { Ped } from '../sim/types';
import type { Camera } from './camera';
import type { Canvas, Ctx } from './canvas';
import { PED_FRAME, type PedSprites } from './sprites/peds';
import type { CarSprites } from './sprites/cars';

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

export function drawVehicles(ctx: Ctx, cam: Camera, w: World, cars: CarSprites, peds: PedSprites) {
  const items = w.vehicles.items;
  // shadows first so no car's shadow lands on another car
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    if (!v.active || !inView(cam, v.x, v.y, 60)) continue;
    cam.worldToScreen(v.x + 3, v.y + 4, tmp);
    const z = cam.zoom, c = Math.cos(v.angle) * z, s = Math.sin(v.angle) * z;
    ctx.setTransform(c, s, -s, c, tmp.x, tmp.y);
    ctx.fillRect(-v.def.length / 2, -v.def.width / 2, v.def.length, v.def.width);
  }
  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    if (!v.active || !inView(cam, v.x, v.y, 60)) continue;
    const state = v.wreck ? 2 : v.health < v.def.health * 0.4 ? 1 : 0;
    const sink = v.sinking > 0 ? Math.max(0.3, 1 - v.sinking / 2) : 1;
    drawRotated(ctx, cam, cars.get(v.model, v.color, state), v.x, v.y, v.angle, sink);
    if (v.def.kind === 'tank') drawRotated(ctx, cam, cars.turret, v.x, v.y, v.angle, sink);
    if (v.def.kind === 'bike' && v.driver) drawRotated(ctx, cam, (peds[v.driver.skin] ?? peds[1])[0], v.x, v.y, v.angle);
    if (v.siren && !v.wreck && Math.floor(w.time * 6) % 2 === 0) {
      cam.worldToScreen(v.x, v.y, tmp);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = Math.floor(w.time * 3) % 2 ? 'rgba(255,60,60,0.35)' : 'rgba(60,120,255,0.35)';
      ctx.fillRect(tmp.x - 12 * cam.zoom, tmp.y - 12 * cam.zoom, 24 * cam.zoom, 24 * cam.zoom);
    }
  }
}
