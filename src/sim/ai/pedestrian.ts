import { TILE } from '../../core/const';
import { T, DIRS, DIR_VEC, OPPOSITE } from '../../world/tiles';
import { tileAtWorld } from '../../world/query';
import type { Ped, PedMode } from '../types';
import { speedOf } from '../vehicle';
import type { World } from '../world';

type PedFn = (w: World, p: Ped, dt: number) => void;
/** Behaviour per mode; later modules register more (attack, chase, mug, ...). */
export const PED_AI: Partial<Record<PedMode, PedFn>> = {};

const WALK = 35, RUN = 90;
const PANICKY = new Set(['civ', 'businessman', 'elder', 'criminal', 'passenger', 'target']);

const walkable = (t: number) => t === T.Sidewalk || t === T.Plaza || t === T.Grass || t === T.Parking;
const passable = (t: number) => t !== T.Building && t !== T.Tree && t !== T.Water;

function setVel(p: Ped, angle: number, speed: number) {
  p.angle = angle;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
}

PED_AI.idle = (_w, p) => { p.vx = 0; p.vy = 0; };

PED_AI.wander = (w, p, dt) => {
  const ai = p.ai;
  if (ai.timer < 0) {
    ai.timer += dt;
    p.vx = 0; p.vy = 0;
    if (ai.timer >= 0) ai.timer = 2 + w.rng() * 6;
    return;
  }
  ai.timer -= dt;
  if (ai.timer <= 0) { ai.timer = w.rng() < 0.2 ? -1 : 2 + w.rng() * 6; }

  // dodge speeding cars on the sidewalk
  if ((w.tick + p.id) % 10 === 0) {
    for (const v of w.nearbyVehicles(p.x, p.y, 70)) {
      if (speedOf(v) < 120) continue;
      const dx = p.x - v.x, dy = p.y - v.y;
      if (dx * v.vx + dy * v.vy <= 0) continue;
      if (w.rng() < 0.7) {
        const side = -v.vx * dy + v.vy * dx > 0 ? 1 : -1;
        const a = Math.atan2(v.vy, v.vx) + (side * Math.PI) / 2;
        Object.assign(ai, { mode: 'flee', tx: v.x, ty: v.y, timer: 0.4 });
        setVel(p, a, RUN);
        return;
      }
    }
  }

  let crossing = ai.tx === 1;
  if (!crossing && tileAtWorld(w.city, p.x, p.y) === T.Road) {
    // Stranded on the road: head for the nearest pavement and treat it as a crossing.
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    for (let k = 1; k <= 3 && !crossing; k++)
      for (const d of DIRS) {
        if (walkable(tileAtWorld(w.city, (tx + DIR_VEC[d][0] * k + 0.5) * TILE, (ty + DIR_VEC[d][1] * k + 0.5) * TILE))) {
          ai.dir = d; ai.tx = 1; crossing = true; break;
        }
      }
  }
  const [dx, dy] = DIR_VEC[ai.dir] ?? [1, 0];
  const ahead = tileAtWorld(w.city, p.x + dx * 10, p.y + dy * 10);
  const here = tileAtWorld(w.city, p.x, p.y);
  if (crossing && here !== T.Road && walkable(ahead)) ai.tx = 0;
  const ok = walkable(ahead) || (crossing && passable(ahead)) || (here === T.Road && passable(ahead));
  if (!ok) {
    if (ahead === T.Road && !crossing && w.rng() < 0.15) ai.tx = 1;
    else {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      const opts = DIRS.filter(d => d !== ai.dir && walkable(tileAtWorld(w.city, (tx + DIR_VEC[d][0] + 0.5) * TILE, (ty + DIR_VEC[d][1] + 0.5) * TILE)));
      const pref = opts.filter(d => d !== OPPOSITE[ai.dir]);
      const list = pref.length ? pref : opts;
      ai.dir = list.length ? list[Math.floor(w.rng() * list.length)] : OPPOSITE[ai.dir];
      // re-centre on the tile so turns do not clip walls
      p.x += ((tx + 0.5) * TILE - p.x) * 0.5;
      p.y += ((ty + 0.5) * TILE - p.y) * 0.5;
    }
  }
  const [ndx, ndy] = DIR_VEC[ai.dir] ?? [1, 0];
  setVel(p, Math.atan2(ndy, ndx), WALK);
  p.anim += WALK * dt;
};

PED_AI.flee = (w, p, dt) => {
  const ai = p.ai;
  ai.timer -= dt;
  if (ai.timer <= 0) { Object.assign(ai, { mode: 'wander', timer: 2, tx: 0 }); return; }
  const base = Math.atan2(p.y - ai.ty, p.x - ai.tx);
  for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
    const a = base + off;
    if (passable(tileAtWorld(w.city, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14))) { setVel(p, a, RUN); p.anim += RUN * dt; return; }
  }
  p.vx = 0; p.vy = 0;
};

export function pedAI(w: World, p: Ped, dt: number): void {
  if (p === w.player || p.dead || p.vehicle || p.knocked > 0 || p.shocked > 0) return;
  const fn = PED_AI[p.ai.mode];
  if (fn) fn(w, p, dt);
  else { p.vx = 0; p.vy = 0; }
}

/** Civilians within r run away from (x, y). */
export function panic(w: World, x: number, y: number, r: number): void {
  for (const p of w.nearbyPeds(x, y, r)) {
    if (p === w.player || p.dead || p.vehicle || !PANICKY.has(p.kind)) continue;
    const m = p.ai.mode;
    if (m !== 'wander' && m !== 'idle' && m !== 'flee') continue;
    Object.assign(p.ai, { mode: 'flee', tx: x, ty: y, timer: 4 + w.rng() * 4 });
  }
}
