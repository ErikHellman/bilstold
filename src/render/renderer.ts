import { VIEW_W } from '../core/const';
import { clamp } from '../core/math';
import type { World } from '../sim/world';
import { speedOf } from '../sim/vehicle';
import { Camera } from './camera';
import { ctx2d, type Ctx } from './canvas';
import { drawPeds, drawVehicles } from './entities';
import { drawBuildings } from './buildings3d';
import { CarSprites } from './sprites/cars';
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
    cam.apply(ctx);
    drawBuildings(ctx, cam, w.city);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
