import { TILE } from '../core/const';
import type { City, LandmarkKind } from '../world/citygen';
import { T, D } from '../world/tiles';
import type { Camera } from './camera';
import { hash01, shade, type Ctx } from './canvas';
import { drawText } from './font';

/** World-unit height of one floor and the virtual camera height (controls lean). */
const FLOOR = 14;
const EYE = 480;

const ROOF: Record<number, string[]> = {
  [D.Downtown]: ['#6b6f78', '#5d6470', '#777b82', '#6a6258'],
  [D.Residential]: ['#8b4a3c', '#7a5c48', '#9a5a44', '#6e4e3e'],
  [D.Industrial]: ['#6f7470', '#5f665f', '#7b7f75', '#646a6e'],
  [D.Park]: ['#7b6a55', '#6d6a60'],
  [D.Waterfront]: ['#5d6e7a', '#7a7466', '#66707a'],
};
const WALL: Record<number, string> = {
  [D.Downtown]: '#8a8f98', [D.Residential]: '#c9b48f', [D.Industrial]: '#8f8d84', [D.Park]: '#a89880', [D.Waterfront]: '#9aa2a8',
};
const SIGN: Partial<Record<LandmarkKind, [string, string]>> = {
  hospital: ['H', '#e74c3c'], police: ['P', '#3498db'], respray: ['$', '#e67e22'], bomb: ['*', '#ff4d4d'],
  crusher: ['#', '#bdc3c7'], garage: ['G', '#f1c40f'], gangHQ: ['!', '#fff'],
};

interface Item { i: number; d: number }
const items: Item[] = [];
const signAt = new Map<number, [string, string]>();
let signCity: City | null = null;

function buildSigns(city: City) {
  signAt.clear();
  const { size } = city;
  for (const l of city.landmarks) {
    const s = l.kind === 'gangHQ' ? ['!', city.gangs[l.gang]?.color ?? '#fff'] as [string, string] : SIGN[l.kind];
    if (!s) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const j = (l.ty + dy) * size + l.tx + dx;
      if (city.tiles[j] === T.Building) { signAt.set(j, s); break; }
    }
  }
  signCity = city;
}

/** Pseudo-3D pass: roofs lean away from the camera centre in proportion to height. */
export function drawBuildings(ctx: Ctx, cam: Camera, city: City): void {
  if (signCity !== city) buildSigns(city);
  const r = cam.visibleRect();
  const { size, tiles, height } = city;
  const pad = 6 * TILE;
  const tx0 = Math.max(0, Math.floor((r.x0 - pad) / TILE)), tx1 = Math.min(size - 1, Math.floor((r.x1 + pad) / TILE));
  const ty0 = Math.max(0, Math.floor((r.y0 - pad) / TILE)), ty1 = Math.min(size - 1, Math.floor((r.y1 + pad) / TILE));
  const cx = cam.x, cy = cam.y;
  items.length = 0;
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * size + tx;
      if (tiles[i] !== T.Building) continue;
      const dx = tx * TILE + TILE / 2 - cx, dy = ty * TILE + TILE / 2 - cy;
      items.push({ i, d: dx * dx + dy * dy });
    }
  items.sort((a, b) => b.d - a.d);

  const hAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= size || y >= size || tiles[y * size + x] !== T.Building ? 0 : height[y * size + x];

  for (const { i } of items) {
    const tx = i % size, ty = (i / size) | 0;
    const h = height[i] * FLOOR;
    if (h <= 0) continue;
    const district = city.district[i];
    const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
    const lift = (px: number, py: number, hh: number) => [px + ((px - cx) * hh) / EYE, py + ((py - cy) * hh) / EYE];
    const wall = WALL[district] ?? '#999';
    // [neighbour dx, dy, edge corners, visible when camera beyond edge, shade]
    const edges: [number, number, number, number, number, number, boolean, number][] = [
      [0, -1, x0, y0, x1, y0, cy < y0, 0.55],
      [0, 1, x0, y1, x1, y1, cy > y1, 0.85],
      [-1, 0, x0, y0, x0, y1, cx < x0, 0.68],
      [1, 0, x1, y0, x1, y1, cx > x1, 0.72],
    ];
    for (const [ndx, ndy, ax, ay, bx, by, visible, f] of edges) {
      if (!visible) continue;
      const nh = hAt(tx + ndx, ty + ndy) * FLOOR;
      if (nh >= h) continue;
      const [a0x, a0y] = lift(ax, ay, nh), [b0x, b0y] = lift(bx, by, nh);
      const [a1x, a1y] = lift(ax, ay, h), [b1x, b1y] = lift(bx, by, h);
      ctx.fillStyle = shade(wall, f);
      ctx.beginPath();
      ctx.moveTo(a0x, a0y); ctx.lineTo(b0x, b0y); ctx.lineTo(b1x, b1y); ctx.lineTo(a1x, a1y);
      ctx.closePath();
      ctx.fill();
      // window rows
      const floors = Math.round((h - nh) / FLOOR);
      ctx.fillStyle = district === D.Residential ? 'rgba(40,50,70,0.55)' : 'rgba(30,45,70,0.6)';
      for (let k = 0; k < floors; k++) {
        const t0 = (nh + (k + 0.35) * FLOOR) / 1, t1 = (nh + (k + 0.7) * FLOOR) / 1;
        const [p0x, p0y] = lift(ax, ay, t0), [q0x, q0y] = lift(bx, by, t0);
        const [p1x, p1y] = lift(ax, ay, t1), [q1x, q1y] = lift(bx, by, t1);
        for (let s = 0; s < 3; s++) {
          const u0 = 0.12 + s * 0.3, u1 = u0 + 0.18;
          ctx.beginPath();
          ctx.moveTo(p0x + (q0x - p0x) * u0, p0y + (q0y - p0y) * u0);
          ctx.lineTo(p0x + (q0x - p0x) * u1, p0y + (q0y - p0y) * u1);
          ctx.lineTo(p1x + (q1x - p1x) * u1, p1y + (q1y - p1y) * u1);
          ctx.lineTo(p1x + (q1x - p1x) * u0, p1y + (q1y - p1y) * u0);
          ctx.fill();
        }
      }
    }
    // roof
    const [rx0, ry0] = lift(x0, y0, h), [rx1, ry1] = lift(x1, y1, h);
    const palette = ROOF[district] ?? ROOF[D.Downtown];
    const block = (Math.floor(tx / 3) * 7 + Math.floor(ty / 3) * 13 + height[i]) | 0;
    const roof = palette[Math.floor(hash01(block, district) * palette.length)];
    ctx.fillStyle = roof;
    ctx.fillRect(rx0, ry0, rx1 - rx0 + 0.5, ry1 - ry0 + 0.5);
    ctx.fillStyle = shade(roof, 0.75);
    const lw = 1.5;
    if (hAt(tx, ty - 1) * FLOOR !== h) ctx.fillRect(rx0, ry0, rx1 - rx0, lw);
    if (hAt(tx, ty + 1) * FLOOR !== h) ctx.fillRect(rx0, ry1 - lw, rx1 - rx0, lw);
    if (hAt(tx - 1, ty) * FLOOR !== h) ctx.fillRect(rx0, ry0, lw, ry1 - ry0);
    if (hAt(tx + 1, ty) * FLOOR !== h) ctx.fillRect(rx1 - lw, ry0, lw, ry1 - ry0);
    const hv = hash01(tx, ty);
    if (district === D.Downtown && hv < 0.18) {
      ctx.fillStyle = shade(roof, 1.25);
      ctx.fillRect(rx0 + 8, ry0 + 8, (rx1 - rx0) * 0.35, (ry1 - ry0) * 0.3);
    } else if (district === D.Industrial && hv < 0.25) {
      ctx.fillStyle = '#4a4f55';
      ctx.fillRect(rx0 + 10, ry0 + 10, 8, 8);
    }
    const sign = signAt.get(i);
    if (sign) {
      ctx.fillStyle = '#111';
      ctx.fillRect((rx0 + rx1) / 2 - 8, (ry0 + ry1) / 2 - 8, 16, 16);
      drawText(ctx, sign[0], (rx0 + rx1) / 2, (ry0 + ry1) / 2 - 7, sign[1], 2, 'center', false);
    }
  }
}
