import { makeCanvas, ctx2d, shade, type Canvas, type Ctx } from '../canvas';

/** [shirt, pants, skin, hair] per skin index; see sim/ped skinFor. */
export const PED_SKINS: [string, string, string, string][] = [
  ['#f2c230', '#2b3a67', '#e0b089', '#3b2a1a'], // 0 player: yellow jacket
  ['#c0392b', '#34495e', '#f1c7a1', '#5a3b22'], ['#2980b9', '#2c3e50', '#d9a67e', '#1b1b1b'],
  ['#27ae60', '#6d4c41', '#8d5a3b', '#111111'], ['#8e44ad', '#212121', '#f3d2b3', '#d8b25a'],
  ['#e67e22', '#3e2723', '#c68a5f', '#2b1a10'], ['#ecf0f1', '#546e7a', '#e8bc95', '#7b4a24'],
  ['#16a085', '#37474f', '#6b4430', '#0e0e0e'], ['#d35400', '#263238', '#f0c9a4', '#a0522d'],
  ['#34495e', '#1c1c1c', '#e3b58f', '#2a2a2a'], // 9 businessman
  ['#9e9e9e', '#5d4037', '#e6c3a3', '#e0e0e0'], // 10 elder
  ['#2d2d2d', '#1a1a1a', '#c99a74', '#111111'], // 11 criminal
  ['#e8c547', '#222222', '#d9a67e', '#111111'], ['#4fb3e8', '#222222', '#b07a52', '#111111'],
  ['#d9534f', '#222222', '#f0c9a4', '#111111'], // 12–14 gangs
  ['#1f3a93', '#14264f', '#e0b089', '#1f3a93'], // 15 cop (cap)
  ['#2d3436', '#1e272e', '#c68a5f', '#2d3436'], // 16 swat (helmet)
  ['#1e272e', '#1e272e', '#e3b58f', '#111111'], // 17 fbi
  ['#556b2f', '#3d4f22', '#c68a5f', '#556b2f'], // 18 soldier
  ['#ffffff', '#e0e0e0', '#e3b58f', '#5a3b22'], // 19 medic
  ['#c0392b', '#2d2d2d', '#e0b089', '#f1c40f'], // 20 fireman
];

export const PED_FRAME = { walk0: 0, dead: 4, burning: 5, shocked: 6 } as const;
export type PedSprites = Canvas[][];
const S = 16;

/** Draws a top-down ped facing +x. */
function drawPed(x: Ctx, skin: [string, string, string, string], frame: number) {
  const [shirt, pants, face, hair] = skin;
  const cx = 8, cy = 8;
  if (frame === PED_FRAME.dead) {
    x.fillStyle = pants; x.fillRect(1, 6, 5, 2); x.fillRect(1, 9, 5, 2);
    x.fillStyle = shirt; x.fillRect(5, 5, 6, 7);
    x.fillStyle = shade(shirt, 0.7); x.fillRect(6, 2, 2, 4); x.fillRect(8, 11, 3, 3);
    x.fillStyle = face; x.fillRect(11, 7, 3, 3);
    x.fillStyle = hair; x.fillRect(13, 7, 1, 3);
    return;
  }
  const step = frame < 4 ? [0, 2, 0, -2][frame] : 0;
  // legs
  x.fillStyle = pants;
  x.fillRect(cx - 2 + step, cy - 3, 3, 2);
  x.fillRect(cx - 2 - step, cy + 1, 3, 2);
  // arms
  x.fillStyle = shade(shirt, 0.8);
  x.fillRect(cx - 1 - step, cy - 5, 3, 2);
  x.fillRect(cx - 1 + step, cy + 3, 3, 2);
  // torso (shoulders)
  x.fillStyle = shirt;
  x.fillRect(cx - 2, cy - 4, 4, 8);
  x.fillStyle = shade(shirt, 1.15);
  x.fillRect(cx - 1, cy - 3, 2, 6);
  // head
  x.fillStyle = face;
  x.fillRect(cx - 1, cy - 2, 4, 4);
  x.fillStyle = hair;
  x.fillRect(cx - 2, cy - 2, 2, 4);
  if (frame === PED_FRAME.burning) {
    x.fillStyle = 'rgba(255,120,0,0.75)'; x.fillRect(3, 3, 10, 10);
    x.fillStyle = 'rgba(255,230,80,0.9)'; x.fillRect(6, 5, 4, 6);
  } else if (frame === PED_FRAME.shocked) {
    x.strokeStyle = '#bfefff'; x.lineWidth = 1; x.strokeRect(2.5, 2.5, 11, 11);
  }
}

export function makePedSprites(): PedSprites {
  return PED_SKINS.map(skin =>
    Array.from({ length: 7 }, (_, f) => {
      const c = makeCanvas(S, S);
      drawPed(ctx2d(c), skin, f);
      return c;
    }),
  );
}
