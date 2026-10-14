import { VEHICLES, type VehicleModelId } from '../data/vehicles';
import type { Vehicle } from '../../sim/types';
import { speedOf } from '../../sim/vehicle';
import type { World } from '../../sim/world';
import { addPoints } from '../score';

interface StuntState { lastWanted: number; drift: number; crashAt: number; hp: number; near: Map<Vehicle, { t: number; done: boolean }>; peakWanted: number }
const state = new WeakMap<World, StuntState>();
const st = (w: World) => {
  let s = state.get(w);
  if (!s) { s = { lastWanted: 0, drift: 0, crashAt: -9, hp: 0, near: new Map(), peakWanted: 0 }; state.set(w, s); }
  return s;
};

function award(w: World, text: string, base: number) {
  w.ps.stunts++;
  w.bus.emit('message', { text: `${text} +$${addPoints(w, base)}`, seconds: 2 });
}

/** Small instant bonuses for driving with style: drifts, near misses and clean getaways. */
export function registerStunts(w: World): void {
  w.bus.on('respawn', () => { const s = st(w); s.peakWanted = 0; s.drift = 0; s.near.clear(); });
  // first time behind the wheel of each model
  w.bus.on('enterCar', e => {
    const v = e.vehicle, ps = w.ps;
    if (v.driver !== w.player || ps.driven.includes(v.model)) return;
    ps.driven.push(v.model);
    const all = Object.keys(VEHICLES) as VehicleModelId[];
    w.bus.emit('message', { text: `New ride: ${v.def.name} (${ps.driven.length}/${all.length}) +$${addPoints(w, 2000)}`, seconds: 3 });
    if (all.every(m => ps.driven.includes(m))) w.bus.emit('message', { text: `You have driven every car in the city! +$${addPoints(w, 100_000)}`, seconds: 5 });
  });
}

export function stuntsSystem(w: World, dt: number): void {
  const s = st(w), v = w.player.vehicle, lvl = w.ps.wanted.level;
  // clean getaway: from three stars or more, the heat dies down star by star (a respray wipes it all at once)
  s.peakWanted = Math.max(s.peakWanted, lvl);
  if (lvl === 0) {
    if (s.peakWanted >= 3 && s.lastWanted === 1 && w.ps.deathState === 'alive') award(w, `Clean getaway from ${s.peakWanted} stars!`, 2000 * s.peakWanted);
    s.peakWanted = 0;
  }
  s.lastWanted = lvl;
  if (!v || w.player.dead) { s.drift = 0; s.near.clear(); s.hp = 0; return; }
  // any damage to the car counts as touching something
  if (v.health < s.hp) s.crashAt = w.time;
  s.hp = v.health;
  const speed = speedOf(v);
  // drift: sliding sideways at speed
  const side = Math.abs(-Math.sin(v.angle) * v.vx + Math.cos(v.angle) * v.vy);
  if (side > 110 && speed > 160) s.drift += dt;
  else {
    if (s.drift >= 1.5 && w.time - s.crashAt > 0.5) award(w, `Drift ${s.drift.toFixed(1)}s`, Math.round(s.drift * 300));
    s.drift = 0;
  }
  // near miss: brushing past another car at speed without touching it
  if (w.tick % 3 !== 0) return;
  for (const o of w.nearbyVehicles(v.x, v.y, 70)) {
    if (o === v || o.wreck || s.near.has(o)) continue;
    const gap = Math.hypot(o.x - v.x, o.y - v.y) - (v.def.width + o.def.width) / 2;
    if (gap < 14 && speed > 260) s.near.set(o, { t: w.time, done: false });
  }
  for (const [o, n] of s.near) {
    if (n.done) { if (w.time - n.t > 3) s.near.delete(o); continue; }
    if (w.time - n.t < 0.4) continue;
    n.done = true;
    if (s.crashAt < n.t - 0.1) award(w, 'Near miss!', 300);
  }
}
