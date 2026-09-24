import { newPlayerState, type World } from '../sim/world';

/** Out of lives: restart the current city from the score it started with. */
export function gameOver(w: World): void {
  const start = w.ps.cityStartScore;
  w.ps = Object.assign(newPlayerState(), { score: start, cityStartScore: start, lives: 4 });
  w.player.x = w.city.startX;
  w.player.y = w.city.startY;
  w.bus.emit('message', { text: 'GAME OVER', seconds: 3, big: true });
  w.bus.emit('respawn', { kind: 'gameover' });
}
