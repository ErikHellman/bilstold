# Bilstöld: design and implementation plan

## Context

Build **Bilstöld**, a browser game in the style of GTA1/GTA2: a top-down camera, a city full of cars to steal, weapons, power-ups, police chases, gangs and general mayhem. The project directory `/Users/hellman/Sources/Hellsoft/bilstöld` is empty and not yet a git repo, so this is a new project.

**Requirements (from the user):**
- Runs in the browser and uses as few system resources as possible.
- The city is generated from a seed. The user can enter one; the default is random.
- When the player comes back in the same browser, the game resumes where they left off.
- Includes the details of the originals: several car models, weapons, police hunts, wanted levels, other criminals, and civilians and civilian cars that can be stolen.
- Tech stack is my choice.

**Answers to my questions:**
- Progression: payphone missions, points, a multiplier, gang respect, and a points target that unlocks the next city.
- Visuals: pseudo-3D buildings (extruded blocks that lean away from the screen center) and a camera that zooms out with speed.
- Input: keyboard and gamepad. No touch controls.
- Audio: sound effects and car radio stations, all generated in code.

**What I assumed (please correct):**
- No external art or audio files. All sprites and sounds are generated in code at startup.
- Single player, desktop browsers only (Chrome, Firefox, Safari).
- The game uses a lives system like the originals.
- The violence is cartoonish and pixel-art, with no gore beyond pixel blood splats.
- No building interiors, no multi-level roads or bridges, no multiplayer.

**Success criteria:**
- Entering the same seed always produces the same city.
- Reloading the page resumes the same city, stats, position and mission state.
- The game holds 60 fps on a mid-range laptop while using little CPU.
- It pauses completely when the tab is hidden.
- The shipped bundle is under 200 KB gzipped.

## Tech stack

- **TypeScript + Vite**, used for development and build only.
- **No runtime dependencies.** No game engine and no framework.
- **Canvas 2D** for rendering. This keeps the GPU and memory footprint small and makes pixel-art scaling trivial.
- **WebAudio** for all sound.
- **Vitest** for unit tests and headless simulation tests.
- The output is a static `dist/` folder that can be hosted anywhere.

**Alternatives I considered:**
- PixiJS or WebGL: faster sprite batching, but about 450 KB of extra runtime code and more GPU use. Not needed at this entity count.
- Phaser: too heavy.

## How the game stays light

- **Low-resolution render target.** The game draws to an internal buffer about 640 px wide (height follows the aspect ratio). That buffer is scaled up with `image-rendering: pixelated`, so pixel fill cost does not depend on the monitor's resolution.
- **Fixed-step simulation.** The simulation runs at 60 Hz with a cap on catch-up steps. Rendering uses `requestAnimationFrame`, which stops when the tab is hidden. On `visibilitychange` the game also pauses and suspends the AudioContext. A 30 fps "battery saver" option is available in the settings.
- **Only simulate what is near the player** (as the originals did). Peds and cars spawn in a ring just outside the view and despawn beyond a radius. Hard caps: about 70 peds, 45 moving vehicles and 30 parked cars.
- **Object pools and flat arrays** for entities, projectiles and particles, with no allocations per frame. A spatial hash grid handles proximity and collision queries.
- **Cached ground layer.** Ground tiles are drawn once into 16×16-tile chunk canvases, with at most 16 kept in memory. Decals such as skid marks, blood and scorch marks are painted into those same chunk canvases, so they cost nothing afterwards.
- **World data in typed arrays.** The city grid (192×192 tiles) is stored as `Uint8Array` layers for tile type, building height and road direction flags. The whole grid is under 200 KB.

## Architecture (`src/`)

Each module has one job and talks to the others through small typed interfaces. The simulation never imports rendering code, so it can run headless in tests.

```
main.ts                 boot, screen state machine (title/playing/paused/map), main loop
core/     rng.ts (sfc32 + string→seed hash + sub-seed derivation), math.ts (vec, angles, OBB),
          loop.ts (fixed timestep), pool.ts, spatial.ts (hash grid), events.ts (typed event bus)
input/    input.ts: keyboard + Gamepad API → abstract actions (accel, brake, steer, fire, enter, weapon±, handbrake, radio, map, pause)
world/    citygen.ts, tiles.ts (tile enum + queries), roadgraph.ts (lane graph for AI), landmarks.ts, districts.ts
sim/      world.ts (entity store and tick order), vehicle.ts (car physics), ped.ts, collision.ts (tile + OBB/SAT),
          projectiles.ts, explosions.ts, fire.ts, spawner.ts (spawning and despawning near the player),
          ai/traffic.ts, ai/pedestrian.ts, ai/police.ts, ai/gang.ts, ai/criminal.ts, ai/emergency.ts
game/     data/vehicles.ts, data/weapons.ts, data/pickups.ts, player.ts, wanted.ts, pickups.ts, frenzy.ts,
          score.ts, gangs.ts (respect), payphones.ts, missions/{templates.ts, generator.ts, runner.ts}, progression.ts
render/   renderer.ts, camera.ts (follow + speed-zoom + shake), groundcache.ts, buildings3d.ts, entities.ts,
          particles.ts, decals.ts, hud.ts, minimap-screen.ts, font.ts (generated bitmap font),
          sprites/{cars.ts, peds.ts, icons.ts, tiles.ts}: procedural pixel-art drawn to atlas canvases at startup
audio/    audio.ts (context, mixer, lazy unlock), sfx.ts (synth recipes), radio.ts (procedural chiptune stations)
save/     save.ts (versioned serialize/deserialize, autosave)
ui/       title.ts (Continue / New Game + seed field + Random), pause.ts, settings.ts. Minimal DOM overlay for text input only
```

## City generation (`world/citygen.ts`)

- **Seeds.** The seed string is hashed to a 32-bit number. City *n* uses `derive(seed, "city", n)`. Every subsystem (roads, buildings, gangs, missions, parked cars per chunk) gets its own derived sub-seed, so changing one part does not shift the others.
- **Steps:**
  1. Place the coastline or river with bridges. Water sits along one or two edges and possibly a river crossing the city.
  2. Lay a grid of main roads with jittered spacing. Some are two lanes each way, and some are tagged as main avenues.
  3. Subdivide the blocks between them with minor streets and alleys.
  4. Trim dead ends, then run a flood fill to guarantee all roads are connected.
- **Districts.** A Voronoi split creates downtown (tall buildings), residential (low houses and gardens), industrial (warehouses and yards), parks and waterfront. Each district sets building height ranges, colors and what spawns there.
- **Tiles.** Road (with direction and marking flags), sidewalk, building (height 1–6), roof details, grass, tree, water, plaza and parking lot.
- **Landmarks** are placed on reachable road frontage: hospital, police stations (2–3), respray shops, bomb shop, car crusher, delivery garages, three gang headquarters, payphones (about 20, some tied to a gang) and the start point.
- **Gang territories.** Three gangs, each with a name generated from the seed plus a color and a preferred car model. Territories are a Voronoi split of the districts.
- **Lane graph.** Built from road tiles for traffic AI: a directed lane per road tile and turn options at intersections.
- **Invariants tested:** the same seed gives the same grid; every landmark is reachable by road from the start point; there are no isolated road islands.

## Rendering

- **Draw order:** ground chunk cache → entities at ground level (peds, cars, pickups) sorted by layer → pseudo-3D buildings → particles and explosions → HUD.
- **Pseudo-3D buildings** (`buildings3d.ts`). For each visible building tile, the roof is offset by `(tileCenter − cameraCenter) × height × k`. Only the wall faces that face the camera are drawn, as quads between the ground edge and the roof edge, with patterned window textures and darker shading on side walls. Drawing goes far to near, and walls between adjacent building tiles of the same block are skipped. Tall buildings hide what is behind them, as in GTA1.
- **Sprites** are generated at startup:
  - Cars: each model gets a top-down pixel sprite (body shape, windshield, lights), tinted into a small palette of colors.
  - Peds: 4-frame walk cycles plus dead, burning and shocked frames.
  - Other: pickups and weapon icons.
  - The whole atlas is under 2 MB.
- **Camera.** Follows the player with velocity look-ahead. Zoom is 1.0 on foot, easing out to about 0.55 at top speed. Explosions shake the screen.
- **HUD.** Score or money, multiplier, lives, wanted level (up to 6 cop heads, GTA2-style), health and armor, current weapon and ammo, pager text strip, and a direction arrow to the current mission target. The M key opens a full city map drawn from the tile arrays.

## Simulation and gameplay

- **Vehicles.** An arcade top-down model: heading, speed, lateral grip, handbrake drift, per-model mass, acceleration, top speed and handling.
  - Collisions use OBB against building tiles and OBB against OBB (SAT) with impulses.
  - Damage leads to smoke, then fire, then an explosion that can set off nearby cars.
  - Catalogue of about 14 models: compact, sedan, sports, muscle, taxi, pickup, van, box truck, bus, ice cream van, police car, SWAT van, ambulance, fire truck, army tank (cannon), plus a motorbike.
  - Parked cars are placed deterministically per chunk from the seed.
- **On foot.** Tank-style controls as in the originals. The player can run and shoot.
- **Entering cars.** The player walks to a door, pulls the driver out and gets in. Some drivers fight back, and gang members always do.
- **Weapons.** Fists, pistol, SMG, shotgun, electro-gun, flamethrower, molotov, grenade and rocket launcher. Car weapons: machine guns, oil slick, mines and car bomb (from the bomb shop). Each has damage, rate, ammo and projectile type defined in `data/weapons.ts`.
- **Pickups** come in crates:
  - Weapons, health and armor.
  - Cop bribe (−1 wanted level) and Get Outta Jail Free.
  - Extra life and a multiplier bonus.
  - Double damage, fast reload, invulnerability and electro-fingers, each for a limited time.
  - Kill-frenzy skulls: kill N targets in T seconds with a given weapon.
- **Pedestrians.** Walk the sidewalks and cross at intersections. They panic and flee from gunfire and speeding cars. Running them over leaves blood decals. Some are special: businessmen, old people, and criminals who mug civilians or steal cars.
- **Traffic.** Follows the lane graph, stops for obstacles, honks, swerves or flees when shot at, and slows at intersections. Emergency services respond: an ambulance comes for dead peds and a medic revives them, and a fire truck comes to fires.
- **Wanted level** (0–6):
  - 1: cops on foot.
  - 2: police cars chase and ram.
  - 3: more units and roadblocks.
  - 4: SWAT vans.
  - 5: FBI.
  - 6: army with tanks.
  - Heat comes from crimes witnessed by cops (and some by civilians). It cools down over time when no cop can see the player.
  - A respray shop visit costs $5k and clears it, and a cop bribe removes one level.
- **Arrest.** The player is **busted** when a cop reaches them while on foot, or when their car is stopped and a cop reaches the door. Consequences: lose weapons and armor, the multiplier drops, and the player respawns at a police station. A Get Outta Jail Free card prevents this.
- **Death.** When **wasted**, the player loses a life and respawns at the hospital. At 0 lives it is game over, and the current city restarts from its starting score.
- **Gangs** (GTA2-style). Respect runs from −100 to 100 per gang. Killing a gang's members lowers their respect. Missions for a gang raise its respect and lower that of its rival. Hostile gangs shoot on sight inside their territory. Gang payphones only work above a respect threshold.
- **Missions.** Ringing payphones give jobs built by the generator from templates:
  - Steal a specific car and deliver it to a garage.
  - Kill a target (on foot or in a car).
  - Plant a car bomb near a target.
  - Timed checkpoint race.
  - Destroy N vehicles of a given type.
  - Taxi a passenger.
  - Crush a car.
  - Rampage.

  Missions are chained, with difficulty scaling as the city advances. `runner.ts` is a small state machine with objectives, a timer, a target marker and fail conditions. Rewards are points and respect.
- **Scoring and progression.** Points equal money. The multiplier goes up by 1 for every few missions completed, and a kill frenzy adds bonus points. Each city has a target: 1,000,000 × city number. Reaching it shows "City complete" and opens the next city, generated from the same seed with the next index.

## Audio (`audio/`)

- The AudioContext is created lazily on the first key press or gamepad input. There is a master volume and separate music and SFX volumes.
- **Engine sound** (player car only): a filtered sawtooth whose pitch follows speed and model.
- **Gunshots, explosions and tire squeal:** filtered noise bursts with envelopes.
- **Siren:** a two-tone oscillator while cops are chasing nearby.
- **Other effects:** horn, crash and pickup.
- **Radio:** 4 procedural chiptune stations with seeded patterns and different tempo, scale and instruments per genre. They use a lookahead scheduler, so there is no audio-thread work beyond oscillators. A station plays only while in a car, and the R key switches station.

## Save and resume (`save/save.ts`)

- **Storage.** Saves go to `localStorage` under the key `bilstold.save`, as versioned JSON with migration hooks.
- **What is saved:**
  - Seed and city index.
  - Score, multiplier and lives.
  - Health, armor, weapons and ammo.
  - Player position and heading, and the current vehicle's model, color and damage.
  - Wanted level and gang respect.
  - Completed and active mission state, and payphone cooldowns.
  - Active power-up timers, play time and settings (volumes, radio station, battery saver).
- **Not saved:** the city itself (it is regenerated from the seed) and the transient traffic and peds (they respawn around the player).
- **When it saves:** every 10 s, on mission complete, and on `visibilitychange`/`pagehide`. Reads validate the data, and a corrupt save falls back to the title screen with a notice.
- **Title screen.** "Continue" appears if a save exists. "New Game" has a seed field, pre-filled with a random word-and-number seed, plus a 🎲 button to reroll. An optional `?seed=` URL parameter pre-fills the field. Starting a new game asks for confirmation before overwriting a save.

## Controls

**Keyboard:**
- ↑/W: accelerate or walk
- ↓/S: brake, reverse or walk back
- ←→/A D: steer or turn
- Space: handbrake
- Ctrl or J: fire
- Enter or F: enter or exit a car
- Q/E: change weapon
- R: radio station
- M: map
- Esc or P: pause

**Gamepad:** uses the standard mapping.
- Left stick: steer
- RT: accelerate
- LT: brake
- A: enter or exit
- X or RB: fire
- LB and Y: change weapon
- B: handbrake
- Start: pause
- Back: map

## Implementation phases (each ends playable)

1. **Setup and walking around.** `git init`, Vite + TS + Vitest setup. Build rng, the loop, input, city generation and ground rendering with the chunk cache, the camera, and a player walking on foot. Tests: seed determinism and city invariants.
2. **Driving.** Vehicle physics, collision, generated car sprites, parked cars, entering and exiting cars, pseudo-3D buildings and speed zoom.
3. **A living city.** Spawner, traffic AI on the lane graph, pedestrian AI, carjacking, running people over, and decals.
4. **Combat.** Weapons, projectiles, damage, explosions and chain reactions, fire, particles, pickups and power-ups, and the HUD.
5. **Police.** Wanted system and police AI, busted and wasted handling, hospital and police-station respawn, and respray shops.
6. **Gangs and other characters.** Gangs, territories and respect, criminal NPCs, and emergency services.
7. **Missions and progression.** Payphones and the mission generator and runner, scoring and multiplier, kill frenzies, and moving to the next city.
8. **Audio.** Sound effects and radio.
9. **Saving and menus.** Save and resume, the title and seed screen, pause and settings, and the map screen.
10. **Performance and polish.** Profiling pass (CPU per frame, memory, bundle size), tuning, and a README.

Before phase 1 starts, this design is saved to `docs/superpowers/specs/2026-09-24-bilstold-design.md` and committed. A detailed task-level plan is then written (writing-plans).

## Verification

- **Unit tests (Vitest):**
  - rng determinism.
  - City generation: the same seed gives a byte-identical grid, all roads are connected, and every landmark can be reached.
  - Lane graph validity.
  - Vehicle physics sanity: it stops under braking and does not pass through walls.
  - Wanted level going up and down.
  - The mission generator always produces solvable missions (targets are reachable).
  - Save round-trip and migration.
- **Headless soak test:** run the full simulation without a renderer for 20 simulated minutes with a scripted "chaos" player (driving, shooting, gaining wanted levels). It must not crash, entity counts must stay within caps, and the average tick must be under 2 ms.
- **In-browser check:** use `npm run dev` with the built-in browser preview.
  - Start a game with a fixed seed and screenshot the city.
  - Steal a car, reach a wanted level, and complete a mission.
  - Reload the page and confirm Continue resumes the same state.
  - Enter the same seed again and confirm the layout is identical.
  - Check the console for errors, and check frame time and CPU in the Performance panel.
- **Build check:** `npm run build` succeeds and the gzipped bundle is under 200 KB.
