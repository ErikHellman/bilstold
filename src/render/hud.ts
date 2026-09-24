import { TILE } from '../core/const';
import { WEAPONS } from '../game/data/weapons';
import type { World } from '../sim/world';
import type { Camera } from './camera';
import type { Ctx } from './canvas';
import { drawText, textWidth } from './font';
import type { Icons } from './sprites/icons';

interface Timed { text: string; t: number; color?: string }

/** Transient HUD state fed by bus events and the renderer. */
export class HudState {
  messages: Timed[] = [];
  big: Timed | null = null;
  target: { x: number; y: number } | null = null;
  timer: number | null = null;
  counter: string | null = null;
  vehicleName: Timed | null = null;
  zoneName: Timed | null = null;
  radio: Timed | null = null;
  private lastZone = -1;
  private unsub: (() => void)[] = [];

  attach(w: World) {
    for (const u of this.unsub) u();
    this.messages = []; this.big = null; this.target = null; this.timer = null; this.counter = null; this.lastZone = -1;
    this.unsub = [
      w.bus.on('message', e => {
        if (e.big) this.big = { text: e.text, t: e.seconds };
        else this.messages.push({ text: e.text, t: e.seconds || 4 });
        if (this.messages.length > 4) this.messages.shift();
      }),
      w.bus.on('enterCar', e => { this.vehicleName = { text: e.vehicle.def.name, t: 2 }; }),
      w.bus.on('wasted', () => { this.big = { text: 'WASTED', t: 3, color: '#e74c3c' }; }),
      w.bus.on('busted', () => { this.big = { text: 'BUSTED', t: 3, color: '#3498db' }; }),
    ];
  }

  update(w: World, dt: number) {
    const m = this.messages[0];
    if (m && (m.t -= dt) <= 0) this.messages.shift();
    for (const k of ['big', 'vehicleName', 'zoneName', 'radio'] as const) {
      const v = this[k];
      if (v && (v.t -= dt) <= 0) this[k] = null;
    }
    const c = w.city, p = w.player;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (tx >= 0 && ty >= 0 && tx < c.size && ty < c.size && c.gangs.length) {
      const z = c.gangZone[ty * c.size + tx];
      if (z !== this.lastZone) {
        if (this.lastZone >= 0) this.zoneName = { text: c.gangs[z].name, t: 2.5, color: c.gangs[z].color };
        this.lastZone = z;
      }
    }
  }
}

const pad = (n: number, len: number) => String(Math.max(0, Math.floor(n))).padStart(len, '0');

export function drawHud(ctx: Ctx, w: World, hud: HudState, icons: Icons, cam: Camera, time: number): void {
  const W = cam.viewW, H = cam.viewH, ps = w.ps, p = w.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // score + multiplier
  drawText(ctx, pad(ps.score, 7), 8, 6, '#f1c40f', 2);
  drawText(ctx, `X${ps.multiplier}`, 8 + textWidth('0000000', 2) + 6, 13, '#fff', 1);
  // hearts
  const hp = Math.max(0, p.health);
  for (let i = 0; i < 5; i++) {
    const v = hp - i * 20;
    ctx.drawImage(icons.heart[v >= 20 ? 0 : v >= 10 ? 1 : 2], 8 + i * 10, 24);
  }
  if (p.armor > 0) { ctx.fillStyle = '#123'; ctx.fillRect(8, 35, 50, 3); ctx.fillStyle = '#3498db'; ctx.fillRect(8, 35, p.armor / 2, 3); }
  ctx.drawImage(icons.person, 62, 24);
  drawText(ctx, `${ps.lives}`, 71, 25, '#fff');

  // wanted heads
  for (let i = 0; i < 6; i++) {
    const lit = i < ps.wanted.level;
    const img = !lit ? icons.copHead[0] : Math.floor(time * 4 + i) % 2 ? icons.copHead[1] : icons.copHead[2];
    ctx.globalAlpha = lit ? 1 : 0.35;
    ctx.drawImage(img, W - 14 - (5 - i) * 13, 6);
  }
  ctx.globalAlpha = 1;

  // weapon
  const v = p.vehicle;
  const wid = v ? v.carWeapon : ps.current;
  if (wid) {
    const ammo = v ? (wid === 'tankGun' ? -1 : v.carAmmo) : ps.weapons[wid] ?? 0;
    const cx = W / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx - 34, 4, 68, 20);
    ctx.drawImage(icons.weapon[wid], cx - 30, 6);
    drawText(ctx, ammo === Infinity || ammo < 0 ? '∞' : String(ammo), cx - 10, 11, '#fff');
    if (!v && wid !== 'fists') drawText(ctx, WEAPONS[wid].name, cx, 27, '#bbb', 1, 'center');
  }
  // power-ups
  let px = 8;
  for (const k of ['doubleDamage', 'fastReload', 'invuln', 'electroFingers'] as const) {
    const s = ps.powerups[k];
    if (s <= 0) continue;
    ctx.drawImage(icons.pickup[k], px, 42);
    drawText(ctx, String(Math.ceil(s)), px + 18, 46, '#fff');
    px += 36;
  }
  if (ps.jailFree) { ctx.drawImage(icons.pickup.jailFree, px, 42); px += 20; }

  // timer / counter (missions, frenzies)
  if (hud.timer !== null) {
    const t = Math.max(0, hud.timer);
    drawText(ctx, `${Math.floor(t / 60)}:${pad(t % 60, 2)}`, W - 10, 24, t < 10 ? '#e74c3c' : '#fff', 2, 'right');
  }
  if (hud.counter) drawText(ctx, hud.counter, W - 10, 42, '#f1c40f', 1, 'right');

  // target arrow
  if (hud.target) drawArrow(ctx, cam, p.x, p.y, hud.target.x, hud.target.y, time);

  // transient labels
  if (hud.vehicleName) drawText(ctx, hud.vehicleName.text, W / 2, H - 46, '#fff', 1, 'center');
  if (hud.zoneName) drawText(ctx, hud.zoneName.text, W / 2, 52, hud.zoneName.color ?? '#fff', 2, 'center');
  if (hud.radio) drawText(ctx, hud.radio.text, W - 10, H - 36, '#9ef', 1, 'right');

  // pager
  const m = hud.messages[0];
  if (m) {
    const tw = Math.min(W - 20, textWidth(m.text) + 16);
    ctx.fillStyle = 'rgba(10,20,10,0.8)'; ctx.fillRect(W / 2 - tw / 2, H - 22, tw, 16);
    ctx.fillStyle = '#6f6'; ctx.fillRect(W / 2 - tw / 2, H - 22, tw, 1);
    drawText(ctx, m.text, W / 2, H - 18, '#b6ffb6', 1, 'center');
  }
  // big centre message
  if (hud.big) {
    const pulse = Math.sin(time * 8) > -0.6 ? 3 : 0;
    if (pulse) drawText(ctx, hud.big.text, W / 2, H / 2 - 30, hud.big.color ?? '#f1c40f', pulse, 'center');
  }
}

function drawArrow(ctx: Ctx, cam: Camera, px: number, py: number, tx: number, ty: number, time: number) {
  const o = { x: 0, y: 0 };
  cam.worldToScreen(tx, ty, o);
  const onScreen = o.x > 10 && o.x < cam.viewW - 10 && o.y > 10 && o.y < cam.viewH - 10;
  if (onScreen) {
    const b = Math.abs(Math.sin(time * 5)) * 6;
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.moveTo(o.x, o.y - 4 - b); ctx.lineTo(o.x - 6, o.y - 14 - b); ctx.lineTo(o.x + 6, o.y - 14 - b); ctx.fill();
    return;
  }
  const s = { x: 0, y: 0 };
  cam.worldToScreen(px, py, s);
  const a = Math.atan2(ty - py, tx - px);
  const cx = s.x + Math.cos(a) * 36, cy = s.y + Math.sin(a) * 36;
  ctx.setTransform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), cx, cy);
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill();
  ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
