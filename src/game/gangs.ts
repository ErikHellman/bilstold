import type { World } from '../sim/world';

export const RIVAL = (g: number) => (g + 1) % 3;
export const isHostile = (w: World, gang: number) => (w.ps.respect[gang] ?? 0) < -20;
export const isFriendly = (w: World, gang: number) => (w.ps.respect[gang] ?? 0) >= 20;

export function changeRespect(w: World, gang: number, delta: number): void {
  if (gang < 0 || gang > 2) return;
  const r = w.ps.respect;
  const before = r[gang];
  r[gang] = Math.max(-100, Math.min(100, before + delta));
  const name = w.city.gangs[gang]?.name ?? 'The gang';
  if (before >= 20 && r[gang] < 20 || before > -20 && r[gang] <= -20) {
    if (r[gang] <= -20) w.bus.emit('message', { text: `${name} want you dead`, seconds: 3 });
  } else if (before < 20 && r[gang] >= 20) w.bus.emit('message', { text: `${name} respect you`, seconds: 3 });
}

export function registerGangs(w: World): void {
  w.bus.on('pedKilled', e => {
    if (e.by !== w.player || e.ped.kind !== 'gang' || e.ped.gang < 0) return;
    changeRespect(w, e.ped.gang, -8);
    changeRespect(w, RIVAL(e.ped.gang), 3);
  });
}
