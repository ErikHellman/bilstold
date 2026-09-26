import { VEHICLES } from '../game/data/vehicles';
import type { World } from '../sim/world';
import type { Ctx } from './canvas';
import { drawText } from './font';
import { CarSprites } from './sprites/cars';

const MODELS = Object.values(VEHICLES);
const COLS = 6;

export function drawRegistry(ctx: Ctx, w: World, cars: CarSprites, viewW: number, viewH: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0d10';
  ctx.fillRect(0, 0, viewW, viewH);
  drawText(ctx, 'VEHICLE REGISTRY', viewW / 2, 8, '#f1c40f', 2, 'center');

  const top = 26, bottom = 14;
  const rows = Math.ceil(MODELS.length / COLS);
  const cellW = Math.floor(viewW / COLS);
  const cellH = Math.floor((viewH - top - bottom) / rows);

  MODELS.forEach((d, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const cx = col * cellW + cellW / 2;
    const cy = top + row * cellH;
    const found = w.discovered.has(d.id);
    const sprite = cars.get(d.id, 0, 0);
    ctx.globalAlpha = found ? 1 : 0.25;
    ctx.drawImage(sprite, cx - sprite.width / 2, cy + 4, sprite.width, sprite.height);
    ctx.globalAlpha = 1;
    drawText(ctx, d.name, cx, cy + cellH - 30, found ? '#fff' : '#888', 1, 'center');
    if (found) {
      drawText(ctx, `SPD ${d.maxSpeed}`, cx, cy + cellH - 20, '#6fa8dc', 1, 'center');
      drawText(ctx, `DMG ${d.health}`, cx, cy + cellH - 11, '#e74c3c', 1, 'center');
    } else {
      drawText(ctx, '???', cx, cy + cellH - 20, '#555', 1, 'center');
    }
  });

  drawText(ctx, `${w.discovered.size}/${MODELS.length} DISCOVERED`, 10, viewH - 10, '#888');
  drawText(ctx, 'C / ESC: BACK', viewW - 10, viewH - 10, '#888', 1, 'right');
}
