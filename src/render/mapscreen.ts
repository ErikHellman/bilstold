import type { World } from '../sim/world';
import type { City } from '../world/citygen';
import { T } from '../world/tiles';
import { makeCanvas, ctx2d, type Canvas, type Ctx } from './canvas';
import { drawText } from './font';

const COLORS: Record<number, [number, number, number]> = {
  [T.Water]: [35, 87, 127], [T.Road]: [70, 72, 78], [T.Sidewalk]: [150, 149, 143], [T.Building]: [95, 98, 108],
  [T.Grass]: [77, 122, 53], [T.Tree]: [44, 90, 34], [T.Plaza]: [184, 165, 130], [T.Parking]: [90, 92, 96],
};
const cache = new WeakMap<City, Canvas>();

function cityImage(c: City): Canvas {
  let img = cache.get(c);
  if (img) return img;
  img = makeCanvas(c.size, c.size);
  const x = ctx2d(img);
  const data = x.createImageData(c.size, c.size);
  const tints = c.gangs.map(g => [parseInt(g.color.slice(1, 3), 16), parseInt(g.color.slice(3, 5), 16), parseInt(g.color.slice(5, 7), 16)]);
  for (let i = 0; i < c.size * c.size; i++) {
    const [r, g, b] = COLORS[c.tiles[i]] ?? [0, 0, 0];
    const t = c.tiles[i] === T.Water || !tints.length ? null : tints[c.gangZone[i]];
    const k = 0.15;
    data.data[i * 4] = t ? r * (1 - k) + t[0] * k : r;
    data.data[i * 4 + 1] = t ? g * (1 - k) + t[1] * k : g;
    data.data[i * 4 + 2] = t ? b * (1 - k) + t[2] * k : b;
    data.data[i * 4 + 3] = 255;
  }
  x.putImageData(data, 0, 0);
  cache.set(c, img);
  return img;
}

const MARK: Record<string, [string, string]> = {
  hospital: ['H', '#e74c3c'], police: ['P', '#3498db'], respray: ['$', '#e67e22'], bomb: ['*', '#ff4d4d'],
  crusher: ['#', '#bdc3c7'], garage: ['G', '#f1c40f'],
};

export function drawMap(ctx: Ctx, w: World, viewW: number, viewH: number, time: number): void {
  const c = w.city;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, viewW, viewH);
  const size = Math.min(viewW - 150, viewH - 20);
  const ox = 10, oy = (viewH - size) / 2, k = size / c.size;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cityImage(c), ox, oy, size, size);
  const at = (tx: number, ty: number) => ({ x: ox + (tx + 0.5) * k, y: oy + (ty + 0.5) * k });
  for (const l of c.landmarks) {
    const p = at(l.tx, l.ty);
    if (l.kind === 'payphone') {
      const ringing = w.ringing.has(l.id) && Math.floor(time * 3) % 2 === 0;
      ctx.fillStyle = ringing ? '#ffe14d' : l.gang >= 0 ? c.gangs[l.gang].color : '#6fa8dc';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      continue;
    }
    if (l.kind === 'gangHQ') {
      ctx.fillStyle = c.gangs[l.gang]?.color ?? '#fff';
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      drawText(ctx, '!', p.x, p.y - 3, '#000', 1, 'center', false);
      continue;
    }
    const m = MARK[l.kind];
    if (!m) continue;
    ctx.fillStyle = '#000'; ctx.fillRect(p.x - 4, p.y - 5, 9, 10);
    drawText(ctx, m[0], p.x + 1, p.y - 3, m[1], 1, 'center', false);
  }
  const tgt = w.mission?.target;
  if (tgt) {
    const p = at(tgt.x / 32 - 0.5, tgt.y / 32 - 0.5);
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 + Math.sin(time * 6) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  if (Math.floor(time * 4) % 2 === 0) {
    const p = at(w.player.x / 32 - 0.5, w.player.y / 32 - 0.5);
    ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  // legend
  let ly = oy + 4;
  const lx = ox + size + 12;
  drawText(ctx, 'MAP', lx, ly, '#f1c40f', 2); ly += 22;
  for (const [k2, [g, col]] of Object.entries(MARK)) { drawText(ctx, `${g} ${k2}`, lx, ly, col); ly += 11; }
  drawText(ctx, '* phone', lx, ly, '#6fa8dc'); ly += 11;
  ly += 6;
  for (const g of c.gangs) { drawText(ctx, g.name, lx, ly, g.color); ly += 11; }
  drawText(ctx, 'M / ESC: BACK', lx, oy + size - 8, '#888');
}
