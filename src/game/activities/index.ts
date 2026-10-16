import type { World } from '../../sim/world';
import { packagesSystem, registerPackageRewards } from './packages';
import { racesSystem } from './races';
import { registerStunts, stuntsSystem } from './stunts';
import { hasPerk, registerVehicleJobs, vehicleJobsSystem } from './vehiclejobs';

/** Things to do between missions: hidden packages, vehicle jobs, street races, stunts and the car collection. */
export function registerActivities(w: World): void {
  registerPackageRewards(w);
  registerVehicleJobs(w);
  registerStunts(w);
  w.bus.on('respawn', e => { if (e.kind !== 'gameover' && hasPerk(w, 'vigilante')) w.player.armor = 100; });
  w.addSystem('packages', packagesSystem);
  w.addSystem('vehicleJobs', vehicleJobsSystem);
  w.addSystem('races', racesSystem);
  w.addSystem('stunts', stuntsSystem);
}
