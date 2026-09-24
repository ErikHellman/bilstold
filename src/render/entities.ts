import type { World } from '../sim/world';
import type { Ped } from '../sim/types';
import type { Camera } from './camera';
import type { Canvas, Ctx } from './canvas';
import { PED_FRAME, type PedSprites } from './sprites/peds';
import type { CarSprites } from './sprites/cars';
import type { Icons } from './sprites/icons';

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

export function drawProjectiles(ctx: Ctx, cam: Camera, w: World) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const z = cam.zoom;
  const items = w.projectiles.items;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (!p.active || !inView(cam, p.x, p.y, 10)) continue;
    cam.worldToScreen(p.x, p.y, tmp);
    const sp = Math.hypot(p.vx, p.vy) || 1;
    switch (p.kind) {
      case 'bullet': {
        ctx.strokeStyle = 'rgba(255,240,170,0.9)';
        ctx.lineWidth = Math.max(1, z);
        ctx.beginPath();
        ctx.moveTo(tmp.x, tmp.y);
        ctx.lineTo(tmp.x - (p.vx / sp) * 8 * z, tmp.y - (p.vy / sp) * 8 * z);
        ctx.stroke();
        break;
      }
      case 'flame':
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,140,0,0.8)' : 'rgba(255,220,60,0.8)';
        ctx.fillRect(tmp.x - 3 * z, tmp.y - 3 * z, 6 * z, 6 * z);
        break;
      case 'thrown':
        ctx.fillStyle = p.weapon === 'grenade' ? '#3d5a2a' : '#a0522d';
        ctx.fillRect(tmp.x - 2 * z, tmp.y - 2 * z, 4 * z, 4 * z);
        break;
      default:
        ctx.fillStyle = '#ddd';
        ctx.fillRect(tmp.x - 3 * z, tmp.y - 2 * z, 6 * z, 4 * z);
        ctx.fillStyle = 'rgba(255,160,40,0.9)';
        ctx.fillRect(tmp.x - (p.vx / sp) * 6 * z - 2, tmp.y - (p.vy / sp) * 6 * z - 2, 4, 4);
    }
  }
  const hz = w.hazards.items;
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i];
    if (!h.active || !inView(cam, h.x, h.y, 20)) continue;
    cam.worldToScreen(h.x, h.y, tmp);
    if (h.kind === 'oil') {
      ctx.fillStyle = 'rgba(10,10,20,0.75)';
      ctx.beginPath(); ctx.ellipse(tmp.x, tmp.y, 14 * z, 10 * z, 0, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.fillStyle = '#222'; ctx.fillRect(tmp.x - 4 * z, tmp.y - 4 * z, 8 * z, 8 * z);
    ctx.fillStyle = Math.floor(w.time * 4) % 2 ? '#f33' : '#600'; ctx.fillRect(tmp.x - 1, tmp.y - 1, 2, 2);
  }
}

export function drawPickups(ctx: Ctx, cam: Camera, w: World, icons: Icons) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const items = w.pickups.items, z = cam.zoom;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (!p.active || !inView(cam, p.x, p.y, 16)) continue;
    cam.worldToScreen(p.x, p.y, tmp);
    const bob = Math.sin(w.time * 4 + p.id) * 1.5;
    const s = 16 * z;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(tmp.x - s / 2 + 2, tmp.y - s / 2 + 3, s, s);
    ctx.drawImage(icons.pickup[p.kind], Math.round(tmp.x - s / 2), Math.round(tmp.y - s / 2 + bob), s, s);
  }
}

export function drawPhones(ctx: Ctx, cam: Camera, w: World) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const z = cam.zoom;
  for (const l of w.city.landmarks) {
    if (l.kind !== 'payphone') continue;
    const x = l.tx * 32 + 16, y = l.ty * 32 + 16;
    if (!inView(cam, x, y, 20)) continue;
    cam.worldToScreen(x, y, tmp);
    const col = l.gang >= 0 ? w.city.gangs[l.gang]?.color ?? '#3498db' : '#3498db';
    ctx.fillStyle = '#111'; ctx.fillRect(tmp.x - 5 * z, tmp.y - 5 * z, 10 * z, 10 * z);
    ctx.fillStyle = col; ctx.fillRect(tmp.x - 4 * z, tmp.y - 4 * z, 8 * z, 8 * z);
    ctx.fillStyle = '#ddd'; ctx.fillRect(tmp.x - 2 * z, tmp.y - 2 * z, 4 * z, 3 * z);
    if (w.ringing.has(l.id) && !w.mission) {
      const r = (6 + ((w.time * 20) % 10)) * z;
      ctx.strokeStyle = `rgba(255,230,80,${Math.floor(w.time * 4) % 2 ? 0.9 : 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tmp.x, tmp.y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
