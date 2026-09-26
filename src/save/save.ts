import { VEHICLES, type VehicleModelId } from '../game/data/vehicles';
import { DIFFICULTIES, type Difficulty } from '../game/difficulty';
import { WEAPONS, type WeaponId } from '../game/data/weapons';
import type { FrenzyState } from '../game/frenzy';
import { MissionRunner } from '../game/missions/runner';
import { PLAYER_MAX_HEALTH } from '../core/const';
import type { MissionSave } from '../game/missions/templates';
import { createSession, type Session } from '../game/session';
import type { PlayerState } from '../sim/types';
import { findWalkableNear } from '../world/query';

export const SAVE_KEY = 'bilstold.save';
export interface Settings { master: number; music: number; sfx: number; station: number; batterySaver: boolean; difficulty: Difficulty }
export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, sfx: 0.8, station: 0, batterySaver: false, difficulty: 'normal' };

export interface SaveV1 {
  version: 1; seed: string; cityIndex: number; savedAt: number;
  ps: Omit<PlayerState, 'weapons'> & { weapons: Record<string, number> };
  player: { x: number; y: number; angle: number; health: number; armor: number };
  vehicle: { model: VehicleModelId; color: number; health: number; angle: number; carWeapon: WeaponId | null; carAmmo: number } | null;
  mission: MissionSave | null; frenzy: FrenzyState | null; phoneCounts: Record<number, number>; takenSpots: string[];
  discovered: VehicleModelId[];
  settings: Settings;
}

export interface Store { get(k: string): string | null; set(k: string, v: string): boolean; remove(k: string): void }

/** localStorage when usable, otherwise an in-memory map (private mode, blocked storage, tests). */
export function safeStorage(): Store {
  let ls: Storage | null = null;
  try {
    ls = (globalThis as { localStorage?: Storage }).localStorage ?? null;
    ls?.getItem('__probe__');
  } catch { ls = null; }
  const mem = new Map<string, string>();
  return {
    get: k => { try { return ls ? ls.getItem(k) : mem.get(k) ?? null; } catch { return null; } },
    set: (k, v) => { try { if (ls) ls.setItem(k, v); else mem.set(k, v); return true; } catch { return false; } },
    remove: k => { try { if (ls) ls.removeItem(k); else mem.delete(k); } catch { /* ignore */ } },
  };
}

export function serialize(s: Session, settings: Settings): SaveV1 {
  const w = s.world, ps = w.ps, p = w.player, v = p.vehicle;
  const weapons: Record<string, number> = {};
  for (const [k, a] of Object.entries(ps.weapons)) if (a !== undefined) weapons[k] = a === Infinity ? -1 : a;
  return {
    version: 1, seed: s.seedString, cityIndex: w.city.index, savedAt: Date.now(),
    ps: {
      ...ps, weapons, wanted: { ...ps.wanted }, respect: [...ps.respect], powerups: { ...ps.powerups }, collected: [...ps.collected],
    },
    player: { x: p.x, y: p.y, angle: p.angle, health: p.health, armor: p.armor },
    vehicle: v ? { model: v.model, color: v.color, health: v.health, angle: v.angle, carWeapon: v.carWeapon, carAmmo: v.carAmmo } : null,
    mission: w.mission ? w.mission.toJSON() : null,
    frenzy: w.frenzy ? { ...w.frenzy } : null,
    phoneCounts: { ...w.phoneCounts },
    takenSpots: [...w.takenSpots],
    discovered: [...w.discovered],
    settings: { ...settings },
  };
}

/** Never throws; returns false when storage refuses the write. */
export function writeSave(store: Store, s: Session, settings: Settings): boolean {
  try { return store.set(SAVE_KEY, JSON.stringify(serialize(s, settings))); } catch { return false; }
}

export type LoadResult = { ok: true; save: SaveV1 } | { ok: false; reason: 'none' | 'corrupt' };

export function readSave(store: Store): LoadResult {
  let raw: string | null;
  try { raw = store.get(SAVE_KEY); } catch { return { ok: false, reason: 'none' }; }
  if (raw === null) return { ok: false, reason: 'none' };
  let parsed: unknown = null;
  try { parsed = migrate(JSON.parse(raw)); } catch { parsed = null; }
  if (parsed && validate(parsed)) return { ok: true, save: parsed };
  try { store.remove(SAVE_KEY); } catch { /* ignore */ }
  return { ok: false, reason: 'corrupt' };
}

/** Upgrades older save versions; unknown versions are rejected. */
export function migrate(o: unknown): unknown {
  if (!o || typeof o !== 'object') return null;
  const v = (o as { version?: unknown }).version;
  if (v !== 1) return null;
  const rec = o as Record<string, unknown>;
  if (!Array.isArray(rec.discovered)) rec.discovered = []; // pre-registry saves had no discovery log
  return o;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function validate(o: unknown): o is SaveV1 {
  if (!obj(o) || o.version !== 1 || typeof o.seed !== 'string' || !num(o.cityIndex) || o.cityIndex < 1) return false;
  const ps = o.ps, pl = o.player, st = o.settings;
  if (!obj(ps) || !obj(pl) || !obj(st)) return false;
  for (const k of ['score', 'multiplier', 'lives', 'cityStartScore', 'missionsDone', 'kills', 'playTime', 'deathTimer']) if (!num(ps[k])) return false;
  if (!obj(ps.weapons) || !Object.entries(ps.weapons).every(([k, v]) => k in WEAPONS && num(v))) return false;
  if (typeof ps.current !== 'string' || !(ps.current in WEAPONS)) return false;
  if (!obj(ps.wanted) || !num(ps.wanted.level) || !num(ps.wanted.heat) || !num(ps.wanted.unseen)) return false;
  if (!Array.isArray(ps.respect) || ps.respect.length !== 3 || !ps.respect.every(num)) return false;
  if (!obj(ps.powerups) || !['doubleDamage', 'fastReload', 'invuln', 'electroFingers'].every(k => num((ps.powerups as Record<string, unknown>)[k]))) return false;
  if (typeof ps.jailFree !== 'boolean' || !Array.isArray(ps.collected) || !ps.collected.every(num)) return false;
  if (!['alive', 'wasted', 'busted'].includes(ps.deathState as string)) return false;
  for (const k of ['x', 'y', 'angle', 'health', 'armor']) if (!num(pl[k])) return false;
  const v = o.vehicle;
  if (v !== null && (!obj(v) || typeof v.model !== 'string' || !(v.model in VEHICLES) || !num(v.color) || !num(v.health) || !num(v.angle) || !num(v.carAmmo)
    || (v.carWeapon !== null && !(typeof v.carWeapon === 'string' && v.carWeapon in WEAPONS)))) return false;
  const m = o.mission;
  if (m !== null && (!obj(m) || !obj(m.spec) || typeof m.spec.kind !== 'string' || !obj(m.spec.params) || !num(m.stage) || !num(m.timer) || !num(m.progress))) return false;
  const f = o.frenzy;
  if (f !== null && (!obj(f) || typeof f.weapon !== 'string' || !(f.weapon in WEAPONS) || !num(f.need) || !num(f.kills) || !num(f.timer)
    || !(f.savedAmmo === null || f.savedAmmo === undefined || num(f.savedAmmo)))) return false;
  if (!obj(o.phoneCounts) || !Object.values(o.phoneCounts).every(num)) return false;
  if (!Array.isArray(o.takenSpots) || !o.takenSpots.every(s => typeof s === 'string')) return false;
  if (!Array.isArray(o.discovered) || !o.discovered.every(m => typeof m === 'string' && m in VEHICLES)) return false;
  if (!num(st.master) || !num(st.music) || !num(st.sfx) || !num(st.station) || typeof st.batterySaver !== 'boolean') return false;
  if (st.difficulty !== undefined && !DIFFICULTIES.includes(st.difficulty as Difficulty)) return false;
  return true;
}

/** Per-kind shape check for a saved mission; a bad mission is dropped rather than failing the whole save. */
export function validMission(m: MissionSave): boolean {
  const sp = m.spec as unknown as Record<string, unknown>;
  if (!obj(sp) || typeof sp.title !== 'string' || !num(sp.reward) || !num(sp.timeLimit) || !num(sp.giver) || !num(sp.respect)) return false;
  const p = sp.params as Record<string, unknown>;
  if (!obj(p) || p.kind !== sp.kind) return false;
  const model = (v: unknown) => typeof v === 'string' && v in VEHICLES;
  switch (p.kind) {
    case 'checkpoint': return Array.isArray(p.points) && p.points.length > 0 && p.points.every(q => obj(q) && num(q.tx) && num(q.ty));
    case 'deliverCar': return model(p.model) && num(p.garage) && num(p.sx) && num(p.sy);
    case 'assassinate': return num(p.tx) && num(p.ty) && typeof p.inCar === 'boolean' && num(p.guards) && num(p.gang);
    case 'carBomb': return num(p.tx) && num(p.ty) && model(p.model) && num(p.gang);
    case 'destroyVehicles': return model(p.model) && num(p.count);
    case 'taxi': return num(p.fromPhone) && num(p.tx) && num(p.ty);
    case 'crush': return model(p.model);
    case 'rampage': return typeof p.weapon === 'string' && p.weapon in WEAPONS && num(p.kills) && ['any', 'gang', 'cop'].includes(p.target as string);
    default: return false;
  }
}

/** Rebuilds the city from the seed and puts the saved state back on top. */
export function restoreSession(save: SaveV1): Session {
  const s = createSession(save.seed, save.cityIndex);
  const w = s.world;
  const weapons: PlayerState['weapons'] = {};
  for (const [k, a] of Object.entries(save.ps.weapons)) weapons[k as WeaponId] = a === -1 ? Infinity : a;
  if (weapons.fists === undefined) weapons.fists = Infinity;
  w.ps = {
    ...save.ps, weapons, wanted: { ...save.ps.wanted }, respect: [...save.ps.respect], powerups: { ...save.ps.powerups },
    collected: [...save.ps.collected], deathState: 'alive', deathTimer: 0,
  };
  const p = w.player;
  const at = findWalkableNear(w.city, save.player.x, save.player.y);
  Object.assign(p, { x: at.x, y: at.y, angle: save.player.angle, health: save.player.health > 0 ? Math.min(save.player.health, PLAYER_MAX_HEALTH) : PLAYER_MAX_HEALTH, armor: save.player.armor });
  if (save.vehicle) {
    const sv = save.vehicle;
    const v = w.spawnVehicle(sv.model, at.x, at.y, sv.angle, sv.color, false);
    if (v) {
      Object.assign(v, { health: sv.health, carWeapon: sv.carWeapon, carAmmo: sv.carAmmo });
      if (v.health <= 0) v.health = 1;
      p.vehicle = v; v.driver = p;
    }
  }
  for (const [k, n] of Object.entries(save.phoneCounts)) w.phoneCounts[Number(k)] = n;
  for (const t of save.takenSpots) w.takenSpots.add(t);
  for (const m of save.discovered) w.discovered.add(m);
  if (save.frenzy) w.frenzy = { ...save.frenzy, savedAmmo: save.frenzy.savedAmmo ?? null };
  if (save.mission && validMission(save.mission)) {
    try { w.mission = MissionRunner.fromJSON(w, save.mission); } catch { w.mission = null; }
  }
  return s;
}
