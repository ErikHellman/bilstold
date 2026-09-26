import { MAX_SUBSTEP } from '../core/const';
import type { KillWeapon } from '../core/events';
import { WEAPONS, type WeaponId, type WeaponDef } from '../game/data/weapons';
import { DIFFICULTY } from '../game/difficulty';
import { isSolidWorld } from '../world/query';
import { hasLineOfSight } from '../world/los';
import { killPed } from './ped';
import type { Ped, Projectile, Vehicle } from './types';
import { damageVehicle } from './vehicle';
import type { World } from './world';

const CALM_KINDS = new Set(['civ', 'businessman', 'elder', 'passenger', 'target']);

/** Optional hooks installed by the effects module (explosions, fire). */
export const effects = {
  explode: (_w: World, _x: number, _y: number, _r: number, _owner: Ped | null) => {},
  fire: (_w: World, _x: number, _y: number) => {},
};

export function damagePed(w: World, p: Ped, amount: number, by: Ped | null, weapon: KillWeapon): void {
  if (p.dead || amount <= 0) return;
  const ps = w.ps;
  if (p === w.player) {
    if (ps.powerups.invuln > 0) return;
    if (weapon !== 'water') amount *= DIFFICULTY[w.difficulty].damageTaken;
    if (by === w.player) amount *= 0.5; // own explosions and fire hurt less
    w.playerHurtAt = w.time;
    const src = by ?? p;
    w.bus.emit('playerHurt', { amount, x: src.x, y: src.y });
  } else if (by === w.player && ps.powerups.doubleDamage > 0) amount *= 2;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, amount);
    p.armor -= absorbed;
    amount -= absorbed;
  }
  p.health -= amount;
  if (p.health <= 0) {
    if (weapon !== 'water' && weapon !== 'fire') w.bus.emit('blood', { x: p.x, y: p.y });
    killPed(w, p, by, weapon);
    return;
  }
  if (p === w.player || !by || by === p) return;
  if (CALM_KINDS.has(p.kind)) Object.assign(p.ai, { mode: 'flee', tx: by.x, ty: by.y, timer: 6 });
  else if (p.kind === 'gang' || p.kind === 'criminal') {
    if (p.ai.mode !== 'attack') Object.assign(p.ai, { mode: 'attack', target: by, timer: 20 });
    if (p.weapon === 'fists' && p.kind === 'gang') armNpc(w, p, 'pistol');
  }
}

export function damageVehicleBy(w: World, v: Vehicle, amount: number, by: Ped | null): void {
  if (by === w.player && w.ps.powerups.doubleDamage > 0) amount *= 2;
  damageVehicle(v, amount, by);
  if (by) v.lastHitBy = by;
}

/** Gives an NPC a weapon with unlimited ammo; it needs a moment to aim before its first shot. */
export function armNpc(w: World, p: Ped, weapon: WeaponId): void {
  p.weapon = weapon;
  p.ammo = -1;
  p.cooldown = Math.max(p.cooldown, DIFFICULTY[w.difficulty].npcFirstShot);
}

/** An NPC that (re)acquires a target must aim again before firing. */
export function npcAcquire(w: World, p: Ped): void {
  p.cooldown = Math.max(p.cooldown, DIFFICULTY[w.difficulty].npcFirstShot);
}

const THREAT_KINDS = new Set(['cop', 'swat', 'fbi', 'soldier']);

/** Player aim assist: the best target inside the difficulty's cone, preferring those who threaten the player. */
function assistAngle(w: World, shooter: Ped, def: WeaponDef, angle: number): number {
  const cone = DIFFICULTY[w.difficulty].aimAssist;
  let best: Ped | null = null, bestScore = Infinity;
  for (const p of w.nearbyPeds(shooter.x, shooter.y, def.range)) {
    if (p === shooter || p.dead || p.vehicle) continue;
    const dx = p.x - shooter.x, dy = p.y - shooter.y;
    const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle)));
    if (off > cone || !hasLineOfSight(w.city, shooter.x, shooter.y, p.x, p.y)) continue;
    const threat = ((p.ai.mode === 'attack' || p.ai.mode === 'chase') && (p.ai.target === shooter || p.ai.target === null))
      || (THREAT_KINDS.has(p.kind) && w.ps.wanted.level > 0);
    const score = off + (threat ? 0 : 1);
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best ? Math.atan2(best.y - shooter.y, best.x - shooter.x) : angle;
}

/** Ammo the player holds for a weapon; -1 means infinite. */
export function playerAmmo(w: World, weapon: WeaponId = w.ps.current): number {
  const a = w.ps.weapons[weapon] ?? 0;
  return a === Infinity ? -1 : a;
}

function spawnProjectile(w: World, owner: Ped, def: WeaponDef, x: number, y: number, angle: number, speed: number, life: number) {
  const pr = w.projectiles.spawn();
  if (!pr) return;
  const kind = def.kind === 'bullet' ? 'bullet' : def.kind === 'flame' ? 'flame' : def.kind === 'thrown' ? 'thrown' : def.kind === 'rocket' ? 'rocket' : 'shell';
  Object.assign(pr, { kind, weapon: def.id, owner, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, damage: def.damage });
}

function coneTarget(w: World, shooter: Ped, range: number, exclude: Ped | null): Ped | null {
  const c = Math.cos(shooter.angle), s = Math.sin(shooter.angle);
  let best: Ped | null = null, bd = Infinity;
  for (const p of w.nearbyPeds(shooter.x, shooter.y, range)) {
    if (p === shooter || p === exclude || p.dead || p.vehicle) continue;
    const dx = p.x - shooter.x, dy = p.y - shooter.y, d = Math.hypot(dx, dy);
    if (d < 1 || (dx * c + dy * s) / d < 0.5) continue;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function arcHit(w: World, shooter: Ped, def: WeaponDef) {
  const t = coneTarget(w, shooter, def.range, null);
  if (!t) return;
  damagePed(w, t, def.damage, shooter, 'electro');
  t.shocked = 1;
  for (const o of w.nearbyPeds(t.x, t.y, 40)) {
    if (o === t || o === shooter || o.dead || o.vehicle) continue;
    damagePed(w, o, def.damage, shooter, 'electro');
    o.shocked = 1;
    break;
  }
}

function meleeHit(w: World, shooter: Ped, def: WeaponDef) {
  if (shooter === w.player && w.ps.powerups.electroFingers > 0) { arcHit(w, shooter, WEAPONS.electro); return; }
  const t = coneTarget(w, shooter, def.range + 6, null);
  if (!t) return;
  damagePed(w, t, def.damage, shooter, 'fists');
  if (shooter === w.player) w.bus.emit('crime', { x: t.x, y: t.y, severity: 1, victim: t });
  if (!t.dead) {
    t.knocked = 0.4;
    t.vx = Math.cos(shooter.angle) * 80;
    t.vy = Math.sin(shooter.angle) * 80;
  }
}

/** Fires a weapon; returns false when on cooldown or out of ammo. */
export function fireWeapon(w: World, shooter: Ped, weapon: WeaponId, vehicle?: Vehicle): boolean {
  const def = WEAPONS[weapon];
  if (shooter.cooldown > 0) return false;
  const isPlayer = shooter === w.player;
  if (vehicle && def.vehicle) {
    if (weapon !== 'tankGun') { if (vehicle.carAmmo <= 0) return false; vehicle.carAmmo--; }
  } else if (isPlayer) {
    const a = w.ps.weapons[weapon] ?? 0;
    if (a <= 0) return false;
    if (a !== Infinity) w.ps.weapons[weapon] = a - 1;
  } else if (shooter.ammo === 0) return false;
  else if (shooter.ammo > 0) shooter.ammo--;
  const diff = DIFFICULTY[w.difficulty];
  if (isPlayer) shooter.cooldown = def.cooldown * (w.ps.powerups.fastReload > 0 ? 0.5 : 1);
  else {
    shooter.cooldown = def.cooldown * diff.npcRate;
    if (def.kind === 'bullet') shooter.cooldown = Math.max(0.3, shooter.cooldown);
  }

  let angle = vehicle ? vehicle.angle : shooter.angle;
  if (isPlayer && !vehicle && (def.kind === 'bullet' || def.kind === 'rocket' || def.kind === 'flame')) angle = assistAngle(w, shooter, def, angle);
  else if (!isPlayer) angle += ((w.rng() + w.rng()) - 1) * diff.npcSpread;
  const c = Math.cos(angle), s = Math.sin(angle);
  const reach = vehicle ? vehicle.def.length / 2 + 6 : 8;
  const ox = (vehicle ?? shooter).x + c * reach, oy = (vehicle ?? shooter).y + s * reach;
  switch (def.kind) {
    case 'melee': meleeHit(w, shooter, def); return true;
    case 'arc': arcHit(w, shooter, def); break;
    case 'bullet':
      for (let i = 0; i < def.pellets; i++) {
        const a = angle + (w.rng() * 2 - 1) * def.spread;
        spawnProjectile(w, shooter, def, ox, oy, a, def.speed * (0.9 + w.rng() * 0.2), def.range / def.speed);
      }
      break;
    case 'flame':
      spawnProjectile(w, shooter, def, ox, oy, angle + (w.rng() * 2 - 1) * def.spread, def.speed, def.range / def.speed);
      break;
    case 'thrown':
      spawnProjectile(w, shooter, def, ox, oy, angle, def.speed, 0.9);
      break;
    case 'rocket': case 'shell':
      spawnProjectile(w, shooter, def, ox, oy, angle, def.speed, def.range / def.speed);
      break;
    case 'drop': {
      if (!vehicle) return true;
      const h = w.hazards.spawn();
      if (h) Object.assign(h, { kind: weapon === 'oil' ? 'oil' : 'mine', x: vehicle.x - c * (vehicle.def.length / 2 + 10), y: vehicle.y - s * (vehicle.def.length / 2 + 10), life: weapon === 'oil' ? 30 : 60, owner: shooter });
      return true;
    }
    case 'bomb':
      if (vehicle) {
        vehicle.bomb = 'timed';
        vehicle.bombTimer = 4;
        vehicle.carWeapon = null;
        if (isPlayer) w.bus.emit('message', { text: 'Car bomb armed! Get out!', seconds: 3 });
      }
      return true;
  }
  w.bus.emit('shot', { x: ox, y: oy, weapon, byPlayer: isPlayer });
  if (isPlayer && w.time - (lastShotCrime.get(w) ?? -9) > 1) {
    lastShotCrime.set(w, w.time);
    w.bus.emit('crime', { x: ox, y: oy, severity: def.severity, victim: null });
  }
  return true;
}

const lastShotCrime = new WeakMap<World, number>();

function pointInVehicle(v: Vehicle, x: number, y: number, pad = 0): boolean {
  const c = Math.cos(v.angle), s = Math.sin(v.angle);
  const dx = x - v.x, dy = y - v.y;
  return Math.abs(dx * c + dy * s) < v.def.length / 2 + pad && Math.abs(-dx * s + dy * c) < v.def.width / 2 + pad;
}

function detonate(w: World, pr: Projectile) {
  if (pr.kind === 'rocket' || pr.kind === 'shell') effects.explode(w, pr.x, pr.y, 70, pr.owner);
  else if (pr.kind === 'thrown') {
    if (pr.weapon === 'grenade') effects.explode(w, pr.x, pr.y, 60, pr.owner);
    else for (let i = 0; i < 5; i++) effects.fire(w, pr.x + (w.rng() * 2 - 1) * 24, pr.y + (w.rng() * 2 - 1) * 24);
  }
  w.projectiles.release(pr);
}

function stepProjectile(w: World, pr: Projectile, dt: number) {
  const n = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * dt) / MAX_SUBSTEP));
  const ownerCar = pr.owner?.vehicle ?? null;
  for (let k = 0; k < n; k++) {
    const nx = pr.x + (pr.vx * dt) / n, ny = pr.y + (pr.vy * dt) / n;
    if (isSolidWorld(w.city, nx, ny)) {
      if (pr.kind === 'thrown') {
        if (isSolidWorld(w.city, nx, pr.y)) pr.vx = -pr.vx * 0.5;
        if (isSolidWorld(w.city, pr.x, ny)) pr.vy = -pr.vy * 0.5;
        continue;
      }
      if (pr.kind === 'rocket' || pr.kind === 'shell') { detonate(w, pr); return; }
      w.projectiles.release(pr);
      return;
    }
    pr.x = nx; pr.y = ny;
    if (pr.kind === 'thrown') continue;
    const hitR = pr.kind === 'flame' ? 10 : pr.owner === w.player ? 11 : 8;
    for (const p of w.nearbyPeds(pr.x, pr.y, hitR)) {
      if (p === pr.owner || p.dead || p.vehicle) continue;
      if (pr.kind === 'flame') { damagePed(w, p, pr.damage, pr.owner, 'flamer'); p.burning = Math.max(p.burning, 3); continue; }
      if (pr.kind === 'bullet') { damagePed(w, p, pr.damage, pr.owner, pr.weapon); w.projectiles.release(pr); return; }
      detonate(w, pr);
      return;
    }
    for (const v of w.nearbyVehicles(pr.x, pr.y, 50)) {
      if (v === ownerCar || !pointInVehicle(v, pr.x, pr.y)) continue;
      if (pr.kind === 'rocket' || pr.kind === 'shell') { damageVehicleBy(w, v, pr.damage * 0.5, pr.owner); detonate(w, pr); return; }
      damageVehicleBy(w, v, pr.damage, pr.owner);
      w.projectiles.release(pr);
      return;
    }
  }
  if (pr.kind === 'thrown') { const k = Math.max(0, 1 - 1.5 * dt); pr.vx *= k; pr.vy *= k; }
  pr.life -= dt;
  if (pr.life <= 0) {
    if (pr.kind === 'bullet' || pr.kind === 'flame') w.projectiles.release(pr);
    else detonate(w, pr);
  }
}

export function combatSystem(w: World, dt: number): void {
  w.peds.each(p => { if (p.cooldown > 0) p.cooldown -= dt; });
  w.projectiles.each(pr => stepProjectile(w, pr, dt));
}
