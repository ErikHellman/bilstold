import type { VehicleModelId } from '../game/data/vehicles';

export type ThemeId = 'harbour' | 'winter' | 'night';

/** What makes one city look and play differently from the next. */
export interface Theme {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Gang name prefixes (they also pick each gang's boss), colours and cars. */
  gangPrefixes: [string, string, string];
  gangColors: [string, string, string];
  gangCars: [VehicleModelId, VehicleModelId, VehicleModelId];
  /** District mix: how many seed points become downtown, and the odds for the rest. */
  downtown: number;
  districtOdds: { residential: number; industrial: number; park: number };
  /** Number of coastlines (min, max) and the chance of a river. */
  coasts: [number, number];
  riverChance: number;
  /** Extra weight for civilian models in traffic and on the kerb. */
  traffic: Partial<Record<VehicleModelId, number>>;
  /** Tyre grip multiplier: below 1 is slippery. */
  grip: number;
  /** Extra police units, as if the wanted level were this much higher. */
  policeBoost: number;
  night: boolean;
  snow: boolean;
}

export const THEMES: Theme[] = [
  {
    id: 'harbour', name: 'Hamnstaden', tagline: 'A harbour town in high summer. Everybody is on the take.',
    gangPrefixes: ['Hamn', 'Söder', 'Neon'], gangColors: ['#e8c547', '#4fb3e8', '#ff5fb7'], gangCars: ['van', 'muscle', 'sports'],
    downtown: 3, districtOdds: { residential: 0.55, industrial: 0.2, park: 0.25 }, coasts: [2, 2], riverChance: 0.5,
    traffic: { compact: 1.6, van: 1.6, icecream: 3, bike: 2 }, grip: 1, policeBoost: 0, night: false, snow: false,
  },
  {
    id: 'winter', name: 'Bruksorten', tagline: 'A mill town in deep winter. The roads are ice and so are the people.',
    gangPrefixes: ['Järn', 'Rost', 'Norr'], gangColors: ['#c0c6cc', '#d9773b', '#5fd1c1'], gangCars: ['pickup', 'truck', 'van'],
    downtown: 2, districtOdds: { residential: 0.35, industrial: 0.5, park: 0.15 }, coasts: [1, 1], riverChance: 0.9,
    traffic: { pickup: 3, truck: 3, van: 1.5, sports: 0.3, bike: 0 }, grip: 0.62, policeBoost: 0, night: false, snow: true,
  },
  {
    id: 'night', name: 'Huvudstaden', tagline: 'The capital after dark. Money, neon and a lot of police.',
    gangPrefixes: ['Guld', 'Svart', 'Krom'], gangColors: ['#f1c40f', '#8e7cc3', '#e74c3c'], gangCars: ['sports', 'sedan', 'muscle'],
    downtown: 5, districtOdds: { residential: 0.45, industrial: 0.2, park: 0.35 }, coasts: [1, 2], riverChance: 0.7,
    traffic: { sports: 3, muscle: 2, taxi: 2.5, compact: 0.6 }, grip: 1, policeBoost: 1, night: true, snow: false,
  },
];

/** The theme of city N. After the third city the cycle repeats with more police each round. */
export function themeFor(index: number): Theme {
  const base = THEMES[(index - 1) % THEMES.length];
  const round = Math.floor((index - 1) / THEMES.length);
  return round ? { ...base, policeBoost: base.policeBoost + round } : base;
}
