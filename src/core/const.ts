export const TILE = 32;
export const MAP_SIZE = 192;
export const DT = 1 / 60;
export const MAX_STEPS = 5;
export const MAX_FRAME_MS = 250;
export const VIEW_W = 640;
export const CAP_PEDS = 70;
export const CAP_VEHICLES = 45;
export const CAP_PARKED = 30;
/** World units: non-persistent entities beyond this distance from the player are despawned. */
export const SIM_RADIUS = 900;
/** Spawn ring inner radius (just off-screen). */
export const SPAWN_MIN = 420;
export const SPAWN_MAX = 700;
/** Max movement per physics substep (anti-tunneling). */
export const MAX_SUBSTEP = 8;
/** Tiles: radius around the player revealed on the map screen's fog of war. */
export const FOG_REVEAL_RADIUS = 11;

export const PLAYER_MAX_HEALTH = 200;
/** Seconds without taking damage before health starts regenerating. */
export const REGEN_DELAY = 6;
/** Regeneration in HP per second. */
export const REGEN_RATE = 8;
/** Regeneration stops at this much health (half of max). */
export const REGEN_CAP = 100;
