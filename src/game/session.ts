import { hashString, normalizeSeed } from '../core/rng';

/** A player-entered seed, trimmed and normalised; empty means random. */
export function resolveSeed(input: string, fallback: () => string): string {
  return normalizeSeed(input) || fallback();
}
import { stepPedMovement, killPed } from '../sim/ped';
import { resolveVehiclePair, stepVehicle } from '../sim/vehicle';
import { pedVsVehicle } from '../sim/collision';
import { combatSystem } from '../sim/combat';
import { effectsSystem } from '../sim/explosions';
import { World } from '../sim/world';
import { ParkedCars, Population } from '../sim/spawner';
import { driveAI } from '../sim/ai/traffic';
import { pedAI, panic } from '../sim/ai/pedestrian';
import { generateCity } from '../world/citygen';
import { controlPlayer, deathSystem, regenSystem } from './player';
import { shopsSystem } from './shops';
import { Pickups } from './pickups';
import { registerScoring } from './score';
import { registerCrimes, wantedSystem } from './wanted';
import { policeSystem } from '../sim/ai/police';
import { gangSystem } from '../sim/ai/gang';
import { criminalSystem } from '../sim/ai/criminal';
import { emergencySystem } from '../sim/ai/emergency';
import { registerGangs } from './gangs';
import { payphoneSystem } from './payphones';
import { frenzySystem, registerFrenzy } from './frenzy';
import { progressionSystem } from './progression';
import { fogSystem } from './fog';

export interface Session { world: World; seedString: string }

export function createSession(seed: string, cityIndex: number): Session {
  const seedString = normalizeSeed(seed);
  const cityNum = hashString(seedString);
  const city = generateCity(cityNum, cityIndex);
  const world = new World(city, cityNum ^ Math.imul(cityIndex, 0x9e3779b1));
  registerCoreSystems(world);
  return { world, seedString };
}

/** Moves on to the next city from the same seed, carrying score, lives, multiplier and weapons. */
export function nextCity(s: Session): Session {
  const old = s.world.ps;
  const n = createSession(s.seedString, s.world.city.index + 1);
  Object.assign(n.world.ps, {
    score: old.score, cityStartScore: old.score, lives: old.lives, multiplier: old.multiplier,
    weapons: { ...old.weapons }, current: old.current, missionsDone: old.missionsDone, kills: old.kills, playTime: old.playTime,
  });
  for (const m of s.world.discovered) n.world.discovered.add(m);
  return n;
}

/** Registers every simulation system in canonical order. Exported so tests can use synthetic cities. */
export function registerCoreSystems(w: World): void {
  w.addSystem('player', controlPlayer);
  w.addSystem('fog', fogSystem);
  w.addSystem('ai', aiSystem);
  w.addSystem('vehicles', vehiclesSystem);
  w.addSystem('contacts', contactsSystem);
  w.addSystem('peds', pedsSystem);
  w.addSystem('combat', combatSystem);
  w.addSystem('effects', effectsSystem);
  const pickups = new Pickups(w);
  w.addSystem('pickups', (_w, dt) => pickups.update(dt));
  w.addSystem('wanted', wantedSystem);
  w.addSystem('police', policeSystem);
  w.addSystem('gangs', gangSystem);
  w.addSystem('criminals', criminalSystem);
  w.addSystem('emergency', emergencySystem);
  w.addSystem('shops', shopsSystem);
  w.addSystem('death', deathSystem);
  w.addSystem('regen', regenSystem);
  w.addSystem('payphones', payphoneSystem);
  w.addSystem('frenzy', frenzySystem);
  w.addSystem('progression', progressionSystem);
  registerScoring(w);
  registerCrimes(w);
  registerGangs(w);
  registerFrenzy(w);
  const parked = new ParkedCars(w), population = new Population(w);
  w.addSystem('spawner', (_w, dt) => { parked.update(dt); population.update(dt); });
  w.bus.on('shot', e => panic(w, e.x, e.y, 220));
  w.bus.on('explosion', e => panic(w, e.x, e.y, 320));
}

function aiSystem(w: World, dt: number) {
  w.vehicles.each(v => {
    const d = v.driver;
    if (d === w.player) return;
    if (!d || d.dead) { v.throttle = 0; v.brake = 0; v.steer = 0; v.handbrake = false; return; }
    driveAI(w, v, dt);
  });
  w.peds.each(p => pedAI(w, p, dt));
}

function vehiclesSystem(w: World, dt: number) {
  w.vehicles.each(v => {
    stepVehicle(v, dt, w.city, w.bus);
    if (v.sinking > 1.5 && v.driver) killPed(w, v.driver, null, 'water');
  });
  const items = w.vehicles.items;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a.active) continue;
    for (const b of w.nearbyVehicles(a.x, a.y, 90)) {
      if (b.id <= a.id) continue;
      const reach = (a.def.length + b.def.length) / 2;
      if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > reach * reach) continue;
      resolveVehiclePair(a, b, w.bus);
    }
  }
  w.vehicles.each(v => {
    const d = v.driver;
    if (d) { d.x = v.x; d.y = v.y; d.angle = v.angle; }
    if (v.sinking > 3 && v !== w.player.vehicle) w.removeVehicle(v);
  });
}

/** Cars against pedestrians, and NPC drivers reacting to being rammed by the player. */
function contactsSystem(w: World) {
  w.vehicles.each(v => {
    for (const p of w.nearbyPeds(v.x, v.y, v.def.length / 2 + 8)) if (p !== v.driver) pedVsVehicle(w, p, v);
    const d = v.driver;
    if (v.lastHitBy === w.player && d && d !== w.player && !v.reacted) {
      v.reacted = true;
      const angry = d.kind === 'gang' || w.rng() < 0.3;
      if (angry) {
        d.vehicle = null; v.driver = null;
        d.x = v.x - Math.sin(v.angle) * (v.def.width / 2 + 8);
        d.y = v.y + Math.cos(v.angle) * (v.def.width / 2 + 8);
        Object.assign(d.ai, { mode: 'attack', target: w.player, timer: 20 });
      } else {
        v.ai.mode = 'flee';
        Object.assign(d.ai, { mode: 'flee', tx: w.player.x, ty: w.player.y, timer: 8 });
      }
    }
  });
}

function pedsSystem(w: World, dt: number) {
  w.peds.each(p => {
    if (p.dead) { p.deadTime += dt; return; }
    stepPedMovement(w, p, dt);
  });
}
