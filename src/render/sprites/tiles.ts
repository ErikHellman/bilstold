import { T } from '../../world/tiles';
import type { ThemeId } from '../../world/themes';
import { makeCanvas, ctx2d, speckle, type Canvas, type Ctx } from '../canvas';

export type TileTextures = Record<number, Canvas[]>;
const S = 32;

/** Ground colours per city theme: [base, ...details]. */
interface GroundPalette {
  road: string[]; sidewalk: string[]; grass: string[]; canopy: string[]; water: string[]; plaza: string[]; parking: string[];
  /** Snow caps on tree tops. */
  snowy: boolean;
}

const SUMMER: GroundPalette = {
  road: ['#3b3d42', '#35373b', '#43464b', '#2f3134'],
  sidewalk: ['#9b9a94', '#8a8983', '#a6a59f', '#8f8e88'],
  grass: ['#4d7a35', '#5a8a3e', '#44702f', '#62943f', '#3f6a2b'],
  canopy: ['#2c5a22', '#2f6526', '#3f7d31', '#58a042'],
  water: ['#23577f', '#2f6c98', '#1f4f75'],
  plaza: ['#b8a582', '#a89573', '#c2b08e', '#a99776'],
  parking: ['#45474c', '#3e4045', '#4c4e53'],
  snowy: false,
};

const PALETTES: Record<ThemeId, GroundPalette> = {
  harbour: SUMMER,
  winter: {
    road: ['#4a4d53', '#d8dee3', '#40434a', '#575a60'],
    sidewalk: ['#c9ced2', '#b3b9be', '#dfe4e8', '#bfc5ca'],
    grass: ['#e6ecf0', '#f4f7f9', '#d5dde3', '#ffffff', '#cdd6dd'],
    canopy: ['#1f3a2d', '#24412f', '#2d4a3a', '#f4f7f9'],
    water: ['#2b4659', '#6f8fa6', '#22394a'],
    plaza: ['#cfc8bb', '#bdb6a8', '#e1dbd0', '#c5bfb2'],
    parking: ['#55585e', '#4c4f55', '#d8dee3'],
    snowy: true,
  },
  night: {
    ...SUMMER,
    sidewalk: ['#8e8a96', '#7c7886', '#9a96a2', '#85818f'],
    plaza: ['#9f8fa8', '#8f7f98', '#ab9bb4', '#93839c'],
  },
};

function variants(n: number, draw: (x: Ctx, v: number) => void): Canvas[] {
  const out: Canvas[] = [];
  for (let v = 0; v < n; v++) {
    const c = makeCanvas(S, S);
    draw(ctx2d(c), v);
    out.push(c);
  }
  return out;
}

/** 32×32 ground textures in a city theme's colours, 3 variants per tile type. */
export function makeTileTextures(theme: ThemeId = 'harbour'): TileTextures {
  const rnd = Math.random, P = PALETTES[theme];
  const [road, ...roadDots] = P.road, [walk, walkLines, ...walkDots] = P.sidewalk, [grass, ...grassDots] = P.grass;
  const [water, ripple, deep] = P.water, [plaza, plazaLines, ...plazaDots] = P.plaza, [park, ...parkDots] = P.parking;
  return {
    [T.Road]: variants(3, x => {
      x.fillStyle = road; x.fillRect(0, 0, S, S);
      speckle(x, S, S, roadDots, P.snowy ? 0.12 : 0.25, rnd);
    }),
    [T.Sidewalk]: variants(3, x => {
      x.fillStyle = walk; x.fillRect(0, 0, S, S);
      x.fillStyle = walkLines;
      for (let i = 0; i < S; i += 8) { x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
      speckle(x, S, S, walkDots, 0.1, rnd);
    }),
    [T.Grass]: variants(3, x => {
      x.fillStyle = grass; x.fillRect(0, 0, S, S);
      speckle(x, S, S, grassDots, 0.35, rnd);
    }),
    [T.Tree]: variants(3, (x, v) => {
      const [dark, dark2, mid, light] = P.canopy;
      x.fillStyle = grass; x.fillRect(0, 0, S, S);
      speckle(x, S, S, grassDots.slice(0, 2), 0.3, rnd);
      x.fillStyle = 'rgba(0,0,0,0.3)';
      x.beginPath(); x.arc(19, 19, 12, 0, Math.PI * 2); x.fill();
      x.fillStyle = v === 1 ? dark : dark2;
      x.beginPath(); x.arc(16, 16, 12 + v, 0, Math.PI * 2); x.fill();
      x.fillStyle = mid;
      for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(10 + rnd() * 12, 9 + rnd() * 12, 3 + rnd() * 3, 0, Math.PI * 2); x.fill(); }
      x.fillStyle = light;
      for (let i = 0; i < (P.snowy ? 9 : 4); i++) x.fillRect(9 + Math.floor(rnd() * 12), 8 + Math.floor(rnd() * 10), 2, 2);
    }),
    [T.Water]: variants(3, x => {
      x.fillStyle = water; x.fillRect(0, 0, S, S);
      x.fillStyle = ripple;
      for (let i = 0; i < 5; i++) x.fillRect(Math.floor(rnd() * 26), Math.floor(rnd() * 30), 4 + Math.floor(rnd() * 4), 1);
      speckle(x, S, S, [deep], 0.1, rnd);
    }),
    [T.Plaza]: variants(3, x => {
      x.fillStyle = plaza; x.fillRect(0, 0, S, S);
      x.fillStyle = plazaLines;
      for (let i = 0; i < S; i += 16) { x.fillRect(0, i, S, 1); x.fillRect(i, 0, 1, S); }
      speckle(x, S, S, plazaDots, 0.12, rnd);
    }),
    [T.Parking]: variants(3, x => {
      x.fillStyle = park; x.fillRect(0, 0, S, S);
      speckle(x, S, S, parkDots, 0.2, rnd);
      x.fillStyle = '#d8d8d0'; x.fillRect(0, 0, 1, 12); x.fillRect(16, 0, 1, 12); x.fillRect(0, 20, 1, 12); x.fillRect(16, 20, 1, 12);
    }),
    [T.Building]: variants(1, x => { x.fillStyle = '#26272b'; x.fillRect(0, 0, S, S); }),
  };
}
