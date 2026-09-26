# Bilstöld

A top-down car-theft sandbox in the spirit of the original GTA and GTA 2. It runs in the browser.

You steal cars, pick up weapons and power-ups, answer ringing payphones for jobs, and play the three gangs off against each other. Along the way you try to outrun police who escalate from beat cops to army tanks. Each city is generated from a seed, and the game saves in your browser so you can pick up where you left off.

**Play it:** https://erikhellman.github.io/bilstold/

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (~52 KB gzipped JS)
npm test         # vitest: unit, simulation and a 20-minute soak test
```

The game has no runtime dependencies, and there are no image, audio or font files. All sprites, tiles, the bitmap font, the sound effects and the radio music are generated in code at startup.

## Controls

| Keyboard | Gamepad | Action |
|---|---|---|
| W / ↑ | RT | Accelerate / walk |
| S / ↓ | LT | Brake / reverse |
| A D / ← → | Left stick | Steer / turn |
| Space | B | Handbrake |
| Ctrl / J | X or RB | Fire |
| Enter / F | A | Enter or exit a car (carjacks the driver) |
| Q / E | LB / Y | Change weapon |
| R | — | Change radio station (in a car) |
| M | Back | City map |
| Esc / P | Start | Pause and settings |

## Seeds and saving

- On the title screen you can type a seed (any text, including Swedish letters) or roll a random one. The same seed always builds the same city. `?seed=…` in the URL pre-fills the field.
- Reaching a city's points target (1,000,000 × the city number) unlocks the next city, generated from the same seed.
- The game autosaves every 10 seconds, after each mission, and when the tab is hidden or closed. The save lives in `localStorage` under the key `bilstold.save`. It holds your seed, city, score, lives, weapons, car, wanted level, gang respect, active mission and settings.
- The city itself is not saved; it is rebuilt from the seed. A corrupt save is discarded with a notice.

## What's in the city

- **Cars:** 17 vehicle types. Among them are taxis, buses, an ice-cream van, police, SWAT (*Insats*), secret police (*SÄPO*), ambulances, fire trucks, a moped and an army tank.
- **Weapons:** pistol, SMG, shotgun, electro-gun, flamethrower, molotovs, grenades and a rocket launcher. Crates on the road give car weapons: machine guns, oil slicks and mines. The bomb shop fits car bombs.
- **Power-ups:** health, armor, cop bribes, Get Outta Jail Free cards, extra lives, multiplier bonuses, double damage, fast reload, invulnerability, electro-fingers and kill frenzies.
- **Police:** six wanted levels, from cops on foot to car chases, roadblocks, SWAT, SÄPO and finally tanks.
  - You lose the police by staying out of sight, using a respray shop ($5000) or picking up a bribe.
  - Getting busted costs you your weapons and your multiplier.
  - Getting wasted costs you a life.
- **Gangs:** three gangs with territories. Each tracks its respect for you, which changes as you kill their members or take jobs from them.
- **Street life:** criminals mug people and steal cars. Ambulances revive the dead, and fire trucks put out fires.
- **Missions:** jobs from ringing payphones. They include delivering cars, assassinations, car bombs, checkpoint races, destroying vehicles, taxi rides, the crusher and rampages.
- **Radio:** four procedural stations play while you drive: *Radio Bilstöld*, *Hårdrock FM*, *Dansbandet* and *Lugna Favoriter*.

## Health, aiming and difficulty

- You have 200 HP (five hearts of 40). After 6 seconds without taking damage, health slowly regenerates up to half. Health crates restore it fully.
- After a respawn you get 3 seconds of protection. Your own explosions hurt you only half as much.
- Your shots on foot get aim assist: they curve towards a target near where you're facing, preferring whoever is shooting at you.
- Enemies need a moment to aim when they first see you, miss more often at range and don't lead a moving target. When you're hit, the screen edges flash red and an arrow points towards the shooter.
- **Difficulty** (pause menu, saved): *Easy* (enemies hit rarely and softly, wide aim assist), *Normal* (default) or *Hard* (accurate enemies, full damage, narrow aim assist).

## Keeping it light

- **Rendering:** the game draws at 640 px wide and scales up with pixelated filtering. The ground is drawn once into cached 512 px chunks.
- **Simulation:** a fixed 60 Hz step that only covers the area around the player, with hard caps on the number of pedestrians and cars.
- **Background tabs:** the loop and the audio stop completely when the tab is hidden.
- **Battery saver:** a pause-menu option that caps the game at 30 fps.

In dev builds, F3 shows a performance overlay. On a laptop the simulation takes about 0.1 ms per tick and rendering about 1–2 ms per frame.

## Known limits

- Desktop only: keyboard or gamepad, no touch controls.
- No building interiors, bridges over roads, or multiplayer.
- Traffic AI is deliberately simple and can jam.

## License

[MIT](LICENSE) © 2026 Erik Hellman
