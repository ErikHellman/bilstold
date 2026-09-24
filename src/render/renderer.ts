import { VIEW_W } from '../core/const';
import { clamp } from '../core/math';
import type { World } from '../sim/world';
import { speedOf } from '../sim/vehicle';
import { Camera } from './camera';
import { ctx2d, type Ctx } from './canvas';
import { drawPeds, drawProjectiles, drawVehicles } from './entities';
import { drawBuildings } from './buildings3d';
import { CarSprites } from './sprites/cars';
import { Particles } from './particles';
import { GroundCache } from './groundcache';
import { makePedSprites, type PedSprites } from './sprites/peds';
import { makeTileTextures, type TileTextures } from './sprites/tiles';

export class Renderer {
  readonly ctx: Ctx;
  readonly cam = new Camera(VIEW_W, 360);
  world: World | null = null;
  ground: GroundCache | null = null;
  private tiles: TileTextures = makeTileTextures();
  private peds: PedSprites = makePedSprites();
  private cars = new CarSprites();
  readonly particles = new Particles();
  private last = performance.now();
  private unsub: (() => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = ctx2d(canvas);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const aspect = innerWidth / innerHeight;
    const w = VIEW_W, h = clamp(Math.round(VIEW_W / aspect), 300, 420);
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    const scale = Math.min(innerWidth / w, innerHeight / h);
    this.canvas.style.width = `${Math.floor(w * scale)}px`;
    this.canvas.style.height = `${Math.floor(h * scale)}px`;
    this.cam.viewW = w;
    this.cam.viewH = h;
  }

  setWorld(w: World): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.world = w;
    const g = new GroundCache(w.city, this.tiles);
    this.ground = g;
    this.cam.snap(w.player.x, w.player.y);
    this.unsub.push(
      w.bus.on('skid', e => g.paintDecal('skid', e.x, e.y, e.angle, 0)),
      w.bus.on('blood', e => g.paintDecal('blood', e.x, e.y, 0, 0)),
      w.bus.on('scorch', e => g.paintDecal('scorch', e.x, e.y, 0, e.r)),
      w.bus.on('explosion', e => {
        const P = this.particles;
        P.emit('flash', e.x, e.y, 0, 0, 0.25, e.r * 0.8);
        P.burst('fire', e.x, e.y, 14, e.r * 3, 0.6, 7);
        P.burst('debris', e.x, e.y, 10, e.r * 5, 0.8, 3);
        P.burst('smoke', e.x, e.y, 6, e.r, 1.6, 8);
        const d = Math.hypot(e.x - this.cam.x, e.y - this.cam.y);
        this.cam.addShake(Math.max(0, 7 * (1 - d / 600)));
      }),
      w.bus.on('shot', e => this.particles.emit('muzzle', e.x, e.y, 0, 0, 0.05, 4)),
      w.bus.on('blood', e => this.particles.burst('blood', e.x, e.y, 5, 60, 0.3, 2)),
      w.bus.on('crash', e => { if (e.force > 150) this.particles.burst('spark', e.x, e.y, 6, 120, 0.3, 2); }),
    );
  }

  render(_alpha: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const { ctx, cam, world: w } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!w || !this.ground) return;
    const p = w.player, v = p.vehicle;
    cam.follow(p.x, p.y, v ? v.vx : p.vx, v ? v.vy : p.vy, v ? speedOf(v) : 0, dt);
    cam.apply(ctx);
    this.ground.draw(ctx, cam);
    drawPeds(ctx, cam, w, this.peds, true);
    drawVehicles(ctx, cam, w, this.cars, this.peds);
    drawPeds(ctx, cam, w, this.peds, false);
    drawProjectiles(ctx, cam, w);
    this.emitAmbient(w, dt);
    this.particles.update(dt);
    this.particles.draw(ctx, cam);
    cam.apply(ctx);
    drawBuildings(ctx, cam, w.city);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Smoke from damaged cars, flames from anything burning. */
  private emitAmbient(w: World, dt: number) {
    const P = this.particles, r = this.cam.visibleRect();
    const vis = (x: number, y: number) => x > r.x0 - 40 && x < r.x1 + 40 && y > r.y0 - 40 && y < r.y1 + 40;
    const chance = dt / 0.08;
    w.vehicles.each(v => {
      if (!vis(v.x, v.y)) return;
      if (v.burning > 0 && Math.random() < chance * 2) P.emit('fire', v.x + (Math.random() - 0.5) * 16, v.y + (Math.random() - 0.5) * 10, 0, -10, 0.5, 5);
      if ((v.health < v.def.health * 0.4 || v.wreck) && Math.random() < chance * (v.wreck ? 0.3 : 1))
        P.emit('smoke', v.x + Math.cos(v.angle) * v.def.length * 0.35, v.y + Math.sin(v.angle) * v.def.length * 0.35, 5, -15, 1.4, 4);
      if (v.sinking > 0 && Math.random() < chance) P.burst('splash', v.x, v.y, 2, 60, 0.4, 2);
    });
    w.peds.each(p => { if (p.burning > 0 && !p.dead && vis(p.x, p.y) && Math.random() < chance) P.emit('fire', p.x, p.y, 0, -12, 0.4, 4); });
    w.fires.each(f => { if (vis(f.x, f.y) && Math.random() < chance * 1.5) P.emit('fire', f.x + (Math.random() - 0.5) * 12, f.y + (Math.random() - 0.5) * 12, 0, -14, 0.5, 5); });
  }
}
