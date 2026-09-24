import { hashString, normalizeSeed } from '../core/rng';
import { stepPedMovement, killPed } from '../sim/ped';
import { resolveVehiclePair, stepVehicle } from '../sim/vehicle';
import { World } from '../sim/world';
import { ParkedCars, Population } from '../sim/spawner';
import { driveAI } from '../sim/ai/traffic';
import { pedAI, panic } from '../sim/ai/pedestrian';
import { generateCity } from '../world/citygen';
import { controlPlayer } from './player';

export interface Session { world: World; seedString: string }

export function createSession(seed: string, cityIndex: number): Session {
  const seedString = normalizeSeed(seed);
  const cityNum = hashString(seedString);
  const city = generateCity(cityNum, cityIndex);
  const world = new World(city, cityNum ^ Math.imul(cityIndex, 0x9e3779b1));
  registerCoreSystems(world);
  return { world, seedString };
}

/** Registers every simulation system in canonical order. Exported so tests can use synthetic cities. */
export function registerCoreSystems(w: World): void {
  w.addSystem('player', controlPlayer);
  w.addSystem('ai', aiSystem);
  w.addSystem('vehicles', vehiclesSystem);
  w.addSystem('peds', pedsSystem);
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

function pedsSystem(w: World, dt: number) {
  w.peds.each(p => {
    if (p.dead) { p.deadTime += dt; return; }
    stepPedMovement(w, p, dt);
  });
}
