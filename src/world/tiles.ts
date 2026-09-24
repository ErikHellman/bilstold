export const T = { Water: 0, Road: 1, Sidewalk: 2, Building: 3, Grass: 4, Tree: 5, Plaza: 6, Parking: 7 } as const;
export type Tile = (typeof T)[keyof typeof T];

/** roadDir bit flags = allowed travel directions out of a tile. */
export const DIR = { N: 1, E: 2, S: 4, W: 8 } as const;
export const DIRS = [1, 2, 4, 8] as const;
export const DIR_VEC: Record<number, [number, number]> = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
export const OPPOSITE: Record<number, number> = { 1: 4, 2: 8, 4: 1, 8: 2 };
export const DIR_ANGLE: Record<number, number> = { 1: -Math.PI / 2, 2: 0, 4: Math.PI / 2, 8: Math.PI };

export const D = { Downtown: 0, Residential: 1, Industrial: 2, Park: 3, Waterfront: 4 } as const;

/** Blocks cars and peds. */
export const isSolid = (t: number) => t === T.Building || t === T.Tree;
export const isWalkable = (t: number) => !isSolid(t) && t !== T.Water;
/** Cars may use sidewalks, grass and plazas. */
export const isDrivable = isWalkable;
