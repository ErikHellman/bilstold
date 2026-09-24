import { VEHICLES, type VehicleModel, type VehicleModelId } from '../../game/data/vehicles';
import { makeCanvas, ctx2d, shade, hash01, type Canvas, type Ctx } from '../canvas';

export type CarState = 0 | 1 | 2; // normal, damaged, wreck

function roundRect(x: Ctx, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

const GLASS = '#1d2a3a', GLASS_HI = '#3e5a78';

/** Draws a vehicle facing +x into a canvas of length × width (plus 2px margin). */
function drawCar(x: Ctx, d: VehicleModel, body: string, state: CarState) {
  const L = d.length, W = d.width, m = 2;
  const col = state === 2 ? '#2b2522' : state === 1 ? shade(body, 0.78) : body;
  x.translate(m, m);
  if (d.kind === 'tank') {
    x.fillStyle = '#2a2a24'; x.fillRect(0, 0, L, 7); x.fillRect(0, W - 7, L, 7);
    x.fillStyle = '#44443a'; for (let i = 1; i < L; i += 4) { x.fillRect(i, 0, 2, 7); x.fillRect(i, W - 7, 2, 7); }
    x.fillStyle = col; x.fillRect(3, 6, L - 6, W - 12);
    x.fillStyle = shade(col.startsWith('#') ? col : '#556b2f', 1.15); x.fillRect(6, 9, L - 14, W - 18);
    return;
  }
  if (d.kind === 'bike') {
    x.fillStyle = '#222'; x.fillRect(0, W / 2 - 2, 7, 4); x.fillRect(L - 7, W / 2 - 2, 7, 4);
    x.fillStyle = col; roundRect(x, 5, W / 2 - 3, L - 10, 6, 2); x.fill();
    x.fillStyle = '#888'; x.fillRect(L - 9, 0, 2, W);
    return;
  }
  // shadow outline + body
  x.fillStyle = shade(col.startsWith('#') ? col : '#333333', 0.55);
  roundRect(x, 0, 0, L, W, 4); x.fill();
  x.fillStyle = col;
  roundRect(x, 1, 1, L - 2, W - 2, 3); x.fill();

  const role = d.role;
  if (d.id === 'truck' || d.id === 'firetruck') {
    const cab = Math.round(L * 0.28);
    x.fillStyle = d.id === 'truck' ? '#cfcfc8' : shade(body, 0.9);
    x.fillRect(1, 1, L - cab - 3, W - 2);
    if (d.id === 'firetruck') {
      x.fillStyle = '#bdc3c7';
      x.fillRect(4, W / 2 - 4, L - cab - 8, 2); x.fillRect(4, W / 2 + 2, L - cab - 8, 2);
      for (let i = 6; i < L - cab - 4; i += 5) x.fillRect(i, W / 2 - 4, 1, 8);
    } else {
      x.fillStyle = '#b5b5ae'; for (let i = 5; i < L - cab - 3; i += 8) x.fillRect(i, 2, 1, W - 4);
    }
    x.fillStyle = GLASS; x.fillRect(L - 8, 3, 4, W - 6);
  } else if (d.id === 'bus') {
    x.fillStyle = GLASS;
    for (let i = 6; i < L - 12; i += 9) { x.fillRect(i, 2, 6, 3); x.fillRect(i, W - 5, 6, 3); }
    x.fillStyle = GLASS; x.fillRect(L - 6, 3, 3, W - 6);
    x.fillStyle = shade(body, 1.2); x.fillRect(8, W / 2 - 2, L - 20, 4);
  } else if (d.id === 'pickup') {
    const bed = Math.round(L * 0.42);
    x.fillStyle = shade(body, 0.6); x.fillRect(3, 3, bed, W - 6);
    x.fillStyle = GLASS; x.fillRect(bed + 6, 3, 4, W - 6); x.fillRect(L - 14, 3, 5, W - 6);
  } else {
    const long = d.id === 'van' || d.id === 'icecream' || d.id === 'swat' || d.id === 'ambulance';
    const rear = long ? 3 : Math.round(L * 0.18), front = Math.round(L * (long ? 0.72 : 0.62));
    x.fillStyle = GLASS; x.fillRect(front, 3, 6, W - 6);
    x.fillStyle = GLASS_HI; x.fillRect(front + 1, 4, 1, W - 8);
    if (!long) { x.fillStyle = GLASS; x.fillRect(rear, 4, 4, W - 8); }
    x.fillStyle = shade(body, 1.12); x.fillRect(rear + 5, 4, front - rear - 6, W - 8);
    if (d.id === 'sports' || d.id === 'muscle') { x.fillStyle = shade(body, 0.7); x.fillRect(front + 8, W / 2 - 1, L - front - 10, 2); }
  }
  if (role === 'police' || role === 'fbi' || role === 'swat') {
    const cx = Math.round(L * 0.45);
    x.fillStyle = '#e74c3c'; x.fillRect(cx, 3, 3, W / 2 - 3);
    x.fillStyle = '#3498db'; x.fillRect(cx, W / 2, 3, W / 2 - 3);
    if (role === 'police') { x.fillStyle = '#1f3a93'; x.fillRect(4, 1, L - 8, 2); x.fillRect(4, W - 3, L - 8, 2); }
  }
  if (role === 'taxi') { x.fillStyle = '#222'; x.fillRect(Math.round(L * 0.42), W / 2 - 3, 5, 6); x.fillStyle = '#fff'; x.fillRect(Math.round(L * 0.42) + 1, W / 2 - 2, 3, 4); }
  if (role === 'ambulance') {
    x.fillStyle = '#e74c3c'; x.fillRect(L * 0.35, W / 2 - 1.5, 10, 3); x.fillRect(L * 0.35 + 3.5, W / 2 - 5, 3, 10);
    x.fillRect(1, 1, L - 2, 2); x.fillRect(1, W - 3, L - 2, 2);
  }
  if (role === 'icecream') {
    x.fillStyle = '#f5deb3'; x.beginPath(); x.moveTo(L * 0.3, W / 2 + 4); x.lineTo(L * 0.3 + 8, W / 2 + 4); x.lineTo(L * 0.3 + 4, W / 2 - 6); x.fill();
    x.fillStyle = '#ff9ff3'; x.beginPath(); x.arc(L * 0.3 + 4, W / 2 - 5, 3, 0, Math.PI * 2); x.fill();
  }
  // lights
  x.fillStyle = state === 2 ? '#333' : '#fff6c8'; x.fillRect(L - 2, 2, 1, 3); x.fillRect(L - 2, W - 5, 1, 3);
  x.fillStyle = state === 2 ? '#333' : '#c0392b'; x.fillRect(1, 2, 1, 3); x.fillRect(1, W - 5, 1, 3);
  if (state > 0) {
    const seed = L * 31 + W;
    x.fillStyle = state === 2 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 8; i++) x.fillRect(Math.floor(hash01(seed, i) * (L - 4)) + 2, Math.floor(hash01(seed, i + 20) * (W - 4)) + 2, 3, 2);
    if (state === 2) { x.fillStyle = 'rgba(80,40,20,0.6)'; x.fillRect(4, 4, L - 8, W - 8); }
  }
}

function drawTurret(x: Ctx) {
  x.fillStyle = '#3f5222'; x.beginPath(); x.arc(12, 12, 10, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#556b2f'; x.beginPath(); x.arc(11, 11, 7, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#2d3a18'; x.fillRect(18, 10, 22, 4);
}

export class CarSprites {
  private cache = new Map<string, Canvas>();
  readonly turret: Canvas;

  constructor() {
    this.turret = makeCanvas(42, 24);
    drawTurret(ctx2d(this.turret));
  }

  get(model: VehicleModelId, color: number, state: CarState): Canvas {
    const key = `${model}:${color}:${state}`;
    let c = this.cache.get(key);
    if (c) return c;
    const d = VEHICLES[model];
    c = makeCanvas(d.length + 4, d.width + 4);
    drawCar(ctx2d(c), d, d.colors[color % d.colors.length], state);
    this.cache.set(key, c);
    return c;
  }
}
