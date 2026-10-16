import { PLAYER_MAX_HEALTH } from '../core/const';
import { newPlayerState, type World } from '../sim/world';
import { TUNING } from './tuning';

/** Out of lives: restart the current city from the score it started with. */
export function gameOver(w: World): void {
  const start = w.ps.cityStartScore;
  const multiplier = Math.max(1, Math.floor(w.ps.multiplier / 2));
  w.ps = Object.assign(newPlayerState(), { score: start, cityStartScore: start, lives: 4, multiplier });
  w.player.x = w.city.startX;
  w.player.y = w.city.startY;
  w.player.angle = w.city.startAngle;
  w.player.health = PLAYER_MAX_HEALTH;
  w.bus.emit('message', { text: 'GAME OVER', seconds: 3, big: true });
  w.bus.emit('respawn', { kind: 'gameover' });
}

/** Points still to earn in city N are TUNING.cityGoal × N on top of the score you arrived with. */
export const cityGoal = (index: number) => TUNING.cityGoal * index;
export const cityTarget = (w: World) => w.ps.cityStartScore + cityGoal(w.city.index);

export function progressionSystem(w: World): void {
  if (w.cityDone || w.mission || w.ps.score < cityTarget(w)) return;
  w.cityDone = true;
  w.bus.emit('message', { text: 'CITY COMPLETE!', seconds: 4, big: true });
  w.bus.emit('cityComplete', { index: w.city.index });
}
