import { TILE } from '../../core/const';
import { isFriendly, isHostile, RIVAL } from '../../game/gangs';
import { hasLineOfSight } from '../../world/los';
import { tileAtWorld } from '../../world/query';
import { T } from '../../world/tiles';
import { armNpc, fireWeapon, npcAcquire } from '../combat';
import type { Ped } from '../types';
import type { World } from '../world';
import { PED_AI } from './pedestrian';

const passable = (w: World, x: number, y: number) => {
  const t = tileAtWorld(w.city, x, y);
  return t !== T.Building && t !== T.Tree && t !== T.Water;
};

function move(w: World, p: Ped, angle: number, speed: number, dt: number) {
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const a = angle + off;
    if (passable(w, p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12)) {
      p.vx = Math.cos(a) * speed; p.vy = Math.sin(a) * speed; p.anim += speed * dt;
      return;
    }
  }
  p.vx = 0; p.vy = 0;
}

/** Shared by gangs, angry drivers and anyone else in a fight: keep range, strafe, shoot or punch. */
PED_AI.attack = (w, p, dt) => {
  const t = p.ai.target;
  p.ai.timer -= dt;
  if (!t || !t.active || t.dead || p.ai.timer <= 0 || (t === w.player && w.ps.deathState !== 'alive')) {
    Object.assign(p.ai, { mode: 'wander', target: null, timer: 2 });
    return;
  }
  const src = t.vehicle ?? t;
  const dx = src.x - p.x, dy = src.y - p.y, d = Math.hypot(dx, dy);
  if (d > 500) { Object.assign(p.ai, { mode: 'wander', target: null, timer: 2 }); return; }
  const base = Math.atan2(dy, dx);
  const armed = p.weapon !== 'fists';
  if (!armed) {
    p.angle = base;
    if (d < 14) { p.vx = 0; p.vy = 0; fireWeapon(w, p, 'fists'); }
    else move(w, p, base, 90, dt);
    return;
  }
  const see = hasLineOfSight(w.city, p.x, p.y, src.x, src.y);
  p.angle = base;
  const inRange = see && d < 220;
  if (inRange && !sawTarget.get(p)) npcAcquire(w, p);
  sawTarget.set(p, inRange);
  if (inRange) fireWeapon(w, p, p.weapon);
  if (d > 180 || !see) move(w, p, base, 80, dt);
  else if (d < 60) move(w, p, base + Math.PI, 60, dt);
  else move(w, p, base + (p.id % 2 ? 1.5 : -1.5), 40, dt);
};

function armGang(w: World, p: Ped) {
  if (p.weapon !== 'fists') return;
  const r = w.ps.respect[p.gang] ?? 0;
  armNpc(w, p, r < -60 && w.rng() < 0.3 ? 'molotov' : w.rng() < 0.6 ? 'pistol' : 'smg');
}

/** Whether each attacker could see its target last tick; regaining sight means aiming again. */
const sawTarget = new WeakMap<Ped, boolean>();

export function gangSystem(w: World): void {
  if (w.tick % 30 !== 0) return;
  const c = w.city, pl = w.player;
  for (const p of w.nearbyPeds(pl.x, pl.y, 400)) {
    if (p.kind !== 'gang' || p.dead || p.vehicle || p.gang < 0) continue;
    const m = p.ai.mode;
    if (m === 'attack') continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    const inTurf = c.gangZone[ty * c.size + tx] === p.gang;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (isHostile(w, p.gang) && inTurf && d < 250 && w.ps.deathState === 'alive') {
      armGang(w, p);
      Object.assign(p.ai, { mode: 'attack', target: pl, timer: 20 });
      continue;
    }
    if (isFriendly(w, p.gang) || w.rng() < 0.05) {
      for (const o of w.nearbyPeds(p.x, p.y, 150)) {
        if (o.kind !== 'gang' || o.dead || o.vehicle || o.gang !== RIVAL(p.gang) && p.gang !== RIVAL(o.gang)) continue;
        if (w.rng() < 0.05) { armGang(w, p); Object.assign(p.ai, { mode: 'attack', target: o, timer: 15 }); break; }
      }
    }
  }
}
