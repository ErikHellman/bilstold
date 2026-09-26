export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyParams {
  /** Multiplier on damage the player takes from others. */
  damageTaken: number;
  /** Extra NPC aim error (radians, ±). */
  npcSpread: number;
  /** NPC weapon cooldown multiplier. */
  npcRate: number;
  /** Seconds an NPC needs to aim before its first shot at a (re)acquired target. */
  npcFirstShot: number;
  /** Half-angle (radians) of the player's aim-assist cone. */
  aimAssist: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { damageTaken: 0.4, npcSpread: 0.22, npcRate: 3.0, npcFirstShot: 1.0, aimAssist: 0.45 },
  normal: { damageTaken: 0.6, npcSpread: 0.14, npcRate: 2.2, npcFirstShot: 0.6, aimAssist: 0.35 },
  hard: { damageTaken: 1.0, npcSpread: 0.06, npcRate: 1.6, npcFirstShot: 0.3, aimAssist: 0.2 },
};
