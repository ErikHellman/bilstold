import { createSession } from '../src/game/session';
import { makeRng } from '../src/core/rng';
import { DT, CAP_PEDS, CAP_VEHICLES, CAP_PARKED } from '../src/core/const';

test('20 simulated minutes of chaos: no crash, caps held, fast ticks', () => {
  const { world: w } = createSession('soak', 1);
  const r = makeRng(99);
  const inp = { accel: 0, brake: 0, steer: 0, fire: false, handbrake: false, pressed: new Set<any>() };
  let total = 0;
  const N = 20 * 60 * 60;
  for (let i = 0; i < N; i++) {
    inp.pressed.clear();
    if (i % 120 === 0) {
      w.ps.weapons.smg = 999; w.ps.weapons.rocket = 999; w.ps.weapons.flamer = 999;
      inp.accel = r() < 0.8 ? 1 : 0; inp.steer = r() * 2 - 1; inp.fire = r() < 0.4; inp.handbrake = r() < 0.1;
      if (r() < 0.25) inp.pressed.add('enter');
      if (r() < 0.1) inp.pressed.add('weaponNext');
    }
    if (i % 7200 === 0) { w.ps.wanted.level = 1 + (i / 7200) % 6; w.ps.wanted.heat = [50, 300, 800, 1600, 2800, 4500][w.ps.wanted.level - 1]; }
    const t = performance.now();
    w.step(inp, DT);
    total += performance.now() - t;
    if (i % 600 === 0) {
      expect(w.peds.count).toBeLessThanOrEqual(CAP_PEDS);
      expect(w.vehicles.items.filter(v => v.active && !v.parked).length).toBeLessThanOrEqual(CAP_VEHICLES);
      expect(w.vehicles.items.filter(v => v.active && v.parked).length).toBeLessThanOrEqual(CAP_PARKED);
      w.peds.each(p => { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true); });
      w.vehicles.each(v => { expect(Number.isFinite(v.x) && Number.isFinite(v.vx)).toBe(true); });
      expect(Number.isFinite(w.player.x)).toBe(true);
    }
  }
  console.log(`avg tick ${(total / N).toFixed(3)} ms, score ${w.ps.score}, kills ${w.ps.kills}, lives ${w.ps.lives}`);
  expect(total / N).toBeLessThan(2);
}, 300_000);
