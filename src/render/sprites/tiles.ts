import { T } from '../../world/tiles';
import { makeCanvas, ctx2d, speckle, type Canvas, type Ctx } from '../canvas';

export type TileTextures = Record<number, Canvas[]>;
const S = 32;

function variants(n: number, draw: (x: Ctx, v: number) => void): Canvas[] {
  const out: Canvas[] = [];
  for (let v = 0; v < n; v++) {
    const c = makeCanvas(S, S);
    draw(ctx2d(c), v);
    out.push(c);
  }
  return out;
}

/** 32×32 ground textures, 3 variants per tile type. */
export function makeTileTextures(): TileTextures {
  const rnd = Math.random;
  return {
    [T.Road]: variants(3, x => {
      x.fillStyle = '#3b3d42'; x.fillRect(0, 0, S, S);
      speckle(x, S, S, ['#35373b', '#43464b', '#2f3134'], 0.25, rnd);
    }),
    [T.Sidewalk]: variants(3, x => {
      x.fillStyle = '#9b9a94'; x.fillRect(0, 0, S, S);
      x.fillStyle = '#8a8983';
      for (let i = 0; i < S; i += 8) { x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
      speckle(x, S, S, ['#a6a59f', '#8f8e88'], 0.1, rnd);
    }),
    [T.Grass]: variants(3, x => {
      x.fillStyle = '#4d7a35'; x.fillRect(0, 0, S, S);
      speckle(x, S, S, ['#5a8a3e', '#44702f', '#62943f', '#3f6a2b'], 0.35, rnd);
    }),
    [T.Tree]: variants(3, (x, v) => {
      x.fillStyle = '#4d7a35'; x.fillRect(0, 0, S, S);
      speckle(x, S, S, ['#5a8a3e', '#44702f'], 0.3, rnd);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.beginPath(); x.arc(19, 19, 12, 0, Math.PI * 2); x.fill();
      x.fillStyle = v === 1 ? '#2c5a22' : '#2f6526';
      x.beginPath(); x.arc(16, 16, 12 + v, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#3f7d31';
      for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(10 + rnd() * 12, 9 + rnd() * 12, 3 + rnd() * 3, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = '#58a042';
      for (let i = 0; i < 4; i++) x.fillRect(9 + Math.floor(rnd() * 12), 8 + Math.floor(rnd() * 10), 2, 2);
    }),
    [T.Water]: variants(3, x => {
      x.fillStyle = '#23577f'; x.fillRect(0, 0, S, S);
      x.fillStyle = '#2f6c98';
      for (let i = 0; i < 5; i++) x.fillRect(Math.floor(rnd() * 26), Math.floor(rnd() * 30), 4 + Math.floor(rnd() * 4), 1);
      speckle(x, S, S, ['#1f4f75'], 0.1, rnd);
    }),
    [T.Plaza]: variants(3, x => {
      x.fillStyle = '#b8a582'; x.fillRect(0, 0, S, S);
      x.fillStyle = '#a89573';
      for (let i = 0; i < S; i += 16) { x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
      speckle(x, S, S, ['#c2b08e', '#a99776'], 0.12, rnd);
    }),
    [T.Parking]: variants(3, x => {
      x.fillStyle = '#45474c'; x.fillRect(0, 0, S, S);
      speckle(x, S, S, ['#3e4045', '#4c4e53'], 0.2, rnd);
      x.fillStyle = '#d8d8d0'; x.fillRect(0, 0, 1, 12); x.fillRect(16, 0, 1, 12); x.fillRect(0, 20, 1, 12); x.fillRect(16, 20, 1, 12);
    }),
    [T.Building]: variants(1, x => { x.fillStyle = '#26272b'; x.fillRect(0, 0, S, S); }),
  };
}
