import { hashString, normalizeSeed } from '../core/rng';
import { stepPedMovement, killPed } from '../sim/ped';
import { resolveVehiclePair, stepVehicle } from '../sim/vehicle';
import { World } from '../sim/world';
import { ParkedCars } from '../sim/spawner';
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
  w.addSystem('vehicles', vehiclesSystem);
  w.addSystem('peds', pedsSystem);
  const parked = new ParkedCars(w);
  w.addSystem('spawner', (_w, dt) => parked.update(dt));
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
