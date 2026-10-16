import type { World } from '../sim/world';
import { landmarkCenter } from '../world/query';
import { changeRespect, isHostile, RIVAL } from './gangs';
import { generateMission } from './missions/generator';
import { MissionRunner } from './missions/runner';
import type { MissionSpec } from './missions/templates';
import { completeStoryStep, isStoryPhone, liveStoryPhones, storyMission } from './story/story';
import { addPoints } from './score';
import { TUNING } from './tuning';

/** Ringing phones hand out missions; finished missions pay out here. */
export function payphoneSystem(w: World, dt: number): void {
  const pl = w.player, ps = w.ps;
  if (w.mission) {
    let res: ReturnType<MissionRunner['update']>;
    try { res = w.mission.update(dt); } catch { w.mission.fail('Mission cancelled'); res = 'fail'; }
    if (res === 'running') return;
    const m = w.mission;
    m.cleanup();
    w.mission = null;
    let paid = 0;
    if (res === 'success') {
      const mult = ps.multiplier;
      paid = addPoints(w, m.spec.reward);
      ps.missionsDone++;
      ps.cityMissions++;
      if (ps.missionsDone % TUNING.missionsPerMultiplier === 0 && ps.multiplier < TUNING.multiplierCap) {
        ps.multiplier++;
        w.bus.emit('message', { text: `Multiplier x${ps.multiplier}!`, seconds: 3 });
      }
      completeStoryStep(w, m.spec);
      if (m.spec.giver >= 0) { changeRespect(w, m.spec.giver, m.spec.respect); changeRespect(w, RIVAL(m.spec.giver), -m.spec.respect / 2); }
      w.bus.emit('message', { text: 'MISSION COMPLETE!', seconds: 3, big: true });
      if (m.spec.outro) w.bus.emit('message', { text: m.spec.outro, seconds: 5 });
      w.bus.emit('message', { text: mult > 1 ? `+$${paid} (x${mult})` : `+$${paid}`, seconds: 3 });
    } else w.bus.emit('message', { text: 'MISSION FAILED!', seconds: 3, big: true });
    w.bus.emit('missionEnd', { success: res === 'success', reward: paid });
    return;
  }
  if (w.tick % 60 === 0) {
    w.ringing.clear();
    const story = liveStoryPhones(w);
    for (const l of story) w.ringing.add(l.id);
    const phones = w.city.landmarks
      .filter(l => l.kind === 'payphone' && (l.gang < 0 || !isHostile(w, l.gang)) && !story.includes(l))
      .map(l => ({ l, d: Math.hypot(landmarkCenter(l).x - pl.x, landmarkCenter(l).y - pl.y) }))
      .filter(e => e.d < 900)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    for (const { l, d } of phones) {
      w.ringing.add(l.id);
      if (d < 500 && w.tick % 120 === 0) w.bus.emit('phoneRing', landmarkCenter(l));
    }
  }
  if (pl.vehicle || pl.dead || ps.deathState !== 'alive' || w.frenzy) return;
  for (const id of w.ringing) {
    const l = w.city.landmarks[id];
    const c = landmarkCenter(l);
    if (Math.hypot(c.x - pl.x, c.y - pl.y) > 14) continue;
    let spec: MissionSpec;
    if (isStoryPhone(w.city, id) && liveStoryPhones(w).includes(l)) spec = storyMission(w, l);
    else {
      const n = w.phoneCounts[id] ?? 0;
      w.phoneCounts[id] = n + 1;
      spec = generateMission(w.city, l, n, ps);
    }
    w.mission = new MissionRunner(w, spec);
    w.ringing.clear();
    w.bus.emit('missionStart', { title: spec.title, brief: spec.brief });
    w.bus.emit('message', { text: spec.title, seconds: 6 });
    return;
  }
}
