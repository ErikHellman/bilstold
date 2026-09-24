import type { Camera } from './camera';
import type { Ctx } from './canvas';

export type ParticleKind = 'smoke' | 'fire' | 'spark' | 'flash' | 'blood' | 'splash' | 'muzzle' | 'debris';
interface P { kind: ParticleKind; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; alive: boolean }

const CAP = 400;

/** Render-only particle pool; never affects the simulation. */
export class Particles {
  private items: P[] = Array.from({ length: CAP }, () => ({ kind: 'smoke', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, alive: false }));
  private next = 0;

  emit(kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const p = this.items[this.next];
    this.next = (this.next + 1) % CAP;
    Object.assign(p, { kind, x, y, vx, vy, life, max: life, size, alive: true });
  }

  burst(kind: ParticleKind, x: number, y: number, n: number, speed: number, life: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.emit(kind, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size);
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = p.kind === 'smoke' ? 1.5 : p.kind === 'debris' ? 3 : 2;
      p.vx *= Math.max(0, 1 - drag * dt);
      p.vy *= Math.max(0, 1 - drag * dt);
      if (p.kind === 'smoke') p.size += dt * 8;
    }
  }

  draw(ctx: Ctx, cam: Camera): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = cam.visibleRect(), z = cam.zoom;
    const o = { x: 0, y: 0 };
    for (const p of this.items) {
      if (!p.alive || p.x < r.x0 - 20 || p.x > r.x1 + 20 || p.y < r.y0 - 20 || p.y > r.y1 + 20) continue;
      const t = p.life / p.max;
      cam.worldToScreen(p.x, p.y, o);
      const s = p.size * z;
      switch (p.kind) {
        case 'smoke': ctx.fillStyle = `rgba(60,60,60,${0.45 * t})`; break;
        case 'fire': ctx.fillStyle = t > 0.6 ? `rgba(255,230,90,${t})` : `rgba(255,${Math.floor(90 + 120 * t)},20,${t})`; break;
        case 'spark': ctx.fillStyle = `rgba(255,220,120,${t})`; break;
        case 'flash': ctx.fillStyle = `rgba(255,250,210,${t * 0.9})`; break;
        case 'blood': ctx.fillStyle = `rgba(150,0,0,${t})`; break;
        case 'splash': ctx.fillStyle = `rgba(200,230,255,${t})`; break;
        case 'muzzle': ctx.fillStyle = `rgba(255,240,150,${t})`; break;
        case 'debris': ctx.fillStyle = `rgba(40,35,30,${Math.min(1, t * 2)})`; break;
      }
      if (p.kind === 'flash' || p.kind === 'smoke' || p.kind === 'fire') {
        ctx.beginPath(); ctx.arc(o.x, o.y, s, 0, Math.PI * 2); ctx.fill();
      } else ctx.fillRect(o.x - s / 2, o.y - s / 2, s, s);
    }
  }
}
