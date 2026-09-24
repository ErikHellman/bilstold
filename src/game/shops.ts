import type { World } from '../sim/world';
import { speedOf } from '../sim/vehicle';
import { landmarkCenter } from '../world/query';
import { clearWanted } from './wanted';
import { playerExit } from './player';

const PRICE = 5000;

export function shopsSystem(w: World): void {
  const v = w.player.vehicle;
  if (!v || w.ps.deathState !== 'alive') return;
  for (const l of w.city.landmarks) {
    if (l.kind !== 'respray' && l.kind !== 'bomb' && l.kind !== 'crusher' && l.kind !== 'garage') continue;
    const c = landmarkCenter(l);
    if (Math.hypot(v.x - c.x, v.y - c.y) > 20 || speedOf(v) > 150) continue;
    if ((w.shopCooldowns.get(l.id) ?? -1) > w.time) continue;
    w.shopCooldowns.set(l.id, w.time + 5);
    const ps = w.ps;
    const say = (text: string) => w.bus.emit('message', { text, seconds: 3 });
    switch (l.kind) {
      case 'respray':
        if (ps.wanted.level > 0) {
          if (ps.score < PRICE) { say(`Respray costs $${PRICE}`); break; }
          ps.score -= PRICE;
          clearWanted(w);
          v.color = (v.color + 1) % v.def.colors.length;
          v.health = v.def.health; v.burning = 0;
          say('Respray! Wanted level cleared');
        } else if (v.health < v.def.health && ps.score >= 500) {
          ps.score -= 500;
          v.health = v.def.health; v.burning = 0;
          say('Car repaired: $500');
        }
        break;
      case 'bomb':
        if (ps.score < PRICE) { say(`Car bomb costs $${PRICE}`); break; }
        ps.score -= PRICE;
        v.carWeapon = 'carBomb'; v.carAmmo = 1;
        say('Car bomb fitted. Fire to arm!');
        break;
      case 'crusher': {
        const value = v.def.value;
        playerExit(w);
        w.bus.emit('crushed', { vehicle: v });
        w.removeVehicle(v);
        ps.score += value;
        say(`Crushed: +$${value}`);
        break;
      }
      case 'garage':
        w.bus.emit('garage', { landmark: l, vehicle: v });
        break;
    }
    return;
  }
}
