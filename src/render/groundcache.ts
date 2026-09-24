import { TILE } from '../core/const';
import type { City } from '../world/citygen';
import { T, DIR } from '../world/tiles';
import type { Camera } from './camera';
import { makeCanvas, ctx2d, hash01, type Canvas, type Ctx } from './canvas';
import type { TileTextures } from './sprites/tiles';

const CHUNK = 16;
const PX = CHUNK * TILE;
const MAX_CHUNKS = 16;
const MAX_DECALS = 400;

export type DecalKind = 'blood' | 'skid' | 'scorch' | 'oil';
interface Decal { kind: DecalKind; x: number; y: number; angle: number; r: number; seed: number }

const H = DIR.E | DIR.W, V = DIR.N | DIR.S;
const LANDMARK_COLORS: Record<string, string> = {
  hospital: '#e8e8e8', police: '#2d4fa3', respray: '#d35400', bomb: '#8b0000', crusher: '#7f8c8d', garage: '#b8860b', gangHQ: '#000',
};

/** Ground layer rendered lazily into 16×16-tile chunk canvases (LRU), with decals painted in. */
export class GroundCache {
  private chunks = new Map<number, Canvas>();
  private decals: Decal[] = [];
  private decalHead = 0;
  private spare: Canvas[] = [];

  constructor(private city: City, private tex: TileTextures) {}

  get cachedCount() { return this.chunks.size; }

  draw(ctx: Ctx, cam: Camera): void {
    const r = cam.visibleRect();
    const n = Math.ceil(this.city.size / CHUNK);
    const cx0 = Math.max(0, Math.floor(r.x0 / PX)), cx1 = Math.min(n - 1, Math.floor(r.x1 / PX));
    const cy0 = Math.max(0, Math.floor(r.y0 / PX)), cy1 = Math.min(n - 1, Math.floor(r.y1 / PX));
    // Draw in screen space with shared rounded edges so zoomed chunks never leave seams.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        cam.worldToScreen(cx * PX, cy * PX, a);
        cam.worldToScreen((cx + 1) * PX, (cy + 1) * PX, b);
        const x0 = Math.round(a.x), y0 = Math.round(a.y);
        ctx.drawImage(this.chunk(cx, cy), x0, y0, Math.round(b.x) - x0, Math.round(b.y) - y0);
      }
  }

  paintDecal(kind: DecalKind, x: number, y: number, angle: number, r: number): void {
    const d: Decal = { kind, x, y, angle, r, seed: (x * 7 + y * 13) | 0 };
    if (this.decals.length < MAX_DECALS) this.decals.push(d);
    else { this.decals[this.decalHead] = d; this.decalHead = (this.decalHead + 1) % MAX_DECALS; }
    const key = this.key(Math.floor(x / PX), Math.floor(y / PX));
    const c = this.chunks.get(key);
    if (c) this.drawDecal(ctx2d(c), d, Math.floor(x / PX) * PX, Math.floor(y / PX) * PX);
  }

  private key(cx: number, cy: number) { return cy * 1000 + cx; }

  private chunk(cx: number, cy: number): Canvas {
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    if (c) { this.chunks.delete(k); this.chunks.set(k, c); return c; }
    if (this.chunks.size >= MAX_CHUNKS) {
      const oldest = this.chunks.keys().next().value!;
      this.spare.push(this.chunks.get(oldest)!);
      this.chunks.delete(oldest);
    }
    c = this.spare.pop() ?? makeCanvas(PX, PX);
    this.renderChunk(ctx2d(c), cx, cy);
    this.chunks.set(k, c);
    return c;
  }

  private renderChunk(x: Ctx, cx: number, cy: number) {
    const { city } = this;
    x.clearRect(0, 0, PX, PX);
    for (let ty = 0; ty < CHUNK; ty++)
      for (let tx = 0; tx < CHUNK; tx++) {
        const gx = cx * CHUNK + tx, gy = cy * CHUNK + ty;
        if (gx >= city.size || gy >= city.size) continue;
        const t = city.tiles[gy * city.size + gx];
        const vs = this.tex[t] ?? this.tex[T.Grass];
        x.drawImage(vs[Math.floor(hash01(gx, gy) * vs.length)], tx * TILE, ty * TILE);
        this.details(x, gx, gy, tx * TILE, ty * TILE, t);
      }
    for (const l of city.landmarks) {
      if (Math.floor(l.tx / CHUNK) !== cx || Math.floor(l.ty / CHUNK) !== cy) continue;
      const col = LANDMARK_COLORS[l.kind];
      if (!col) continue;
      const px = (l.tx % CHUNK) * TILE, py = (l.ty % CHUNK) * TILE;
      x.fillStyle = col; x.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 4; i < TILE - 4; i += 6) x.fillRect(px + 4, py + i, TILE - 8, 2);
    }
    const x0 = cx * PX, y0 = cy * PX;
    for (const d of this.decals)
      if (d.x >= x0 - 20 && d.x < x0 + PX + 20 && d.y >= y0 - 20 && d.y < y0 + PX + 20) this.drawDecal(x, d, x0, y0);
  }

  private at(gx: number, gy: number) {
    const c = this.city;
    return gx < 0 || gy < 0 || gx >= c.size || gy >= c.size ? T.Water : c.tiles[gy * c.size + gx];
  }
  private dir(gx: number, gy: number) {
    const c = this.city;
    return gx < 0 || gy < 0 || gx >= c.size || gy >= c.size ? 0 : c.roadDir[gy * c.size + gx];
  }

  /** Lane markings, crossings, curbs, bridge rails and shorelines. */
  private details(x: Ctx, gx: number, gy: number, px: number, py: number, t: number) {
    if (t === T.Road) {
      const f = this.dir(gx, gy);
      const isX = (f & H) && (f & V);
      if (!isX) {
        if (f & H) {
          const s = this.dir(gx, gy + 1);
          if (this.at(gx, gy + 1) === T.Road && (s & H) && !((s & V) && (s & H))) {
            const opposite = (f & H) !== (s & H);
            x.fillStyle = opposite ? '#e3c04a' : '#d8d8d0';
            for (let i = 2; i < TILE; i += 12) x.fillRect(px + i, py + TILE - 1, 6, opposite ? 2 : 1);
          }
          for (const dx of [-1, 1]) {
            const n = this.dir(gx + dx, gy);
            if ((n & H) && (n & V)) {
              x.fillStyle = 'rgba(235,235,225,0.85)';
              const sx = dx < 0 ? px + 2 : px + TILE - 12;
              for (let i = 3; i < TILE; i += 6) x.fillRect(sx, py + i, 10, 3);
            }
          }
        } else if (f & V) {
          const e = this.dir(gx + 1, gy);
          if (this.at(gx + 1, gy) === T.Road && (e & V) && !((e & V) && (e & H))) {
            const opposite = (f & V) !== (e & V);
            x.fillStyle = opposite ? '#e3c04a' : '#d8d8d0';
            for (let i = 2; i < TILE; i += 12) x.fillRect(px + TILE - 1, py + i, opposite ? 2 : 1, 6);
          }
          for (const dy of [-1, 1]) {
            const n = this.dir(gx, gy + dy);
            if ((n & H) && (n & V)) {
              x.fillStyle = 'rgba(235,235,225,0.85)';
              const sy = dy < 0 ? py + 2 : py + TILE - 12;
              for (let i = 3; i < TILE; i += 6) x.fillRect(px + i, sy, 3, 10);
            }
          }
        }
      }
      x.fillStyle = '#8c8c8c';
      if (this.at(gx, gy - 1) === T.Water) x.fillRect(px, py, TILE, 3);
      if (this.at(gx, gy + 1) === T.Water) x.fillRect(px, py + TILE - 3, TILE, 3);
      if (this.at(gx - 1, gy) === T.Water) x.fillRect(px, py, 3, TILE);
      if (this.at(gx + 1, gy) === T.Water) x.fillRect(px + TILE - 3, py, 3, TILE);
    } else if (t === T.Sidewalk) {
      x.fillStyle = '#6f6e69';
      if (this.at(gx, gy - 1) === T.Road) x.fillRect(px, py, TILE, 2);
      if (this.at(gx, gy + 1) === T.Road) x.fillRect(px, py + TILE - 2, TILE, 2);
      if (this.at(gx - 1, gy) === T.Road) x.fillRect(px, py, 2, TILE);
      if (this.at(gx + 1, gy) === T.Road) x.fillRect(px + TILE - 2, py, 2, TILE);
    } else if (t === T.Water) {
      x.fillStyle = 'rgba(160,210,240,0.35)';
      if (this.at(gx, gy - 1) !== T.Water) x.fillRect(px, py, TILE, 2);
      if (this.at(gx, gy + 1) !== T.Water) x.fillRect(px, py + TILE - 2, TILE, 2);
      if (this.at(gx - 1, gy) !== T.Water) x.fillRect(px, py, 2, TILE);
      if (this.at(gx + 1, gy) !== T.Water) x.fillRect(px + TILE - 2, py, 2, TILE);
    }
  }

  private drawDecal(x: Ctx, d: Decal, x0: number, y0: number) {
    const px = d.x - x0, py = d.y - y0;
    switch (d.kind) {
      case 'skid':
        x.save(); x.translate(px, py); x.rotate(d.angle);
        x.fillStyle = 'rgba(15,15,15,0.35)'; x.fillRect(-12, -9, 6, 2); x.fillRect(-12, 7, 6, 2);
        x.restore();
        break;
      case 'blood':
        x.fillStyle = 'rgba(150,0,0,0.85)';
        x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fill();
        for (let i = 0; i < 12; i++) {
          const a = hash01(d.seed, i) * Math.PI * 2, r = 3 + hash01(d.seed, i + 9) * 9;
          const sz = 2 + Math.floor(hash01(d.seed, i + 31) * 3);
          x.fillRect(Math.round(px + Math.cos(a) * r) - 1, Math.round(py + Math.sin(a) * r) - 1, sz, sz);
        }
        break;
      case 'scorch':
        x.fillStyle = 'rgba(10,10,10,0.45)';
        x.beginPath(); x.arc(px, py, d.r, 0, Math.PI * 2); x.fill();
        break;
      case 'oil':
        x.fillStyle = 'rgba(5,5,10,0.7)';
        x.beginPath(); x.ellipse(px, py, 14, 10, d.angle, 0, Math.PI * 2); x.fill();
        break;
    }
  }
}
