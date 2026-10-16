/**
 * Progression and economy numbers in one place. A player who only takes payphone jobs should finish
 * a city in about 20 missions (tests/progression.test.ts checks 15–25).
 */
export const TUNING = {
  /** Points needed to finish city N, on top of the score you arrived with: cityGoal × N. */
  cityGoal: 1_000_000,
  /** Mission pay before the job's own factor and the multiplier: base + perDifficulty × difficulty. */
  missionBase: 8_000,
  missionPerDifficulty: 5_000,
  /** Mission difficulty is the city number, plus one for every this many jobs done in the city (max 6). */
  missionsPerDifficulty: 5,
  maxDifficulty: 6,
  /** Every this many completed jobs raises the multiplier by one, up to multiplierCap. */
  missionsPerMultiplier: 4,
  multiplierCap: 4,
  /** Base points for mayhem, scaled by the multiplier. */
  points: { civKill: 100, gangKill: 250, copKill: 500, vehicleDestroyed: 1_000, copCarDestroyed: 2_500 },
  /** Kill-frenzy bonus per required kill, scaled by the multiplier. */
  frenzyPerKill: 2_000,
};

/** Difficulty (1–6) of the next job in a city. */
export const missionDifficulty = (cityIndex: number, cityMissions: number) =>
  Math.min(TUNING.maxDifficulty, cityIndex + Math.floor(cityMissions / TUNING.missionsPerDifficulty));
