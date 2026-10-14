import { TILE } from '../../core/const';
import { derive, makeRng } from '../../core/rng';
import type { World } from '../../sim/world';
import type { City, Landmark } from '../../world/citygen';
import { VEHICLES, type VehicleModelId } from '../data/vehicles';
import { RIVAL, isHostile } from '../gangs';
import { buildMission, missionReward } from '../missions/generator';
import type { MissionSpec } from '../missions/templates';
import { TUNING, missionDifficulty } from '../tuning';
import { ARCS, FINALE, FINALE_CALLER, type StoryStep } from './arcs';
import { bossFor } from './characters';

export const STORY_STEPS = 5;
/** Storylines that must be finished before the finale opens. */
export const FINALE_AFTER = 2;
/** Story jobs pay this much more than a random job of the same kind. */
const STORY_PAY = 1.5;
/** The finale also pays this share of the city goal, on top of normal pay. */
const FINALE_BONUS = 0.25;

const phoneCache = new WeakMap<City, { gang: Landmark[]; finale: Landmark | null }>();

/** Each gang's storyline phone (its first payphone) and the neutral phone nearest the centre for the finale. */
export function storyPhones(c: City): { gang: Landmark[]; finale: Landmark | null } {
  let p = phoneCache.get(c);
  if (p) return p;
  const phones = c.landmarks.filter(l => l.kind === 'payphone');
  const gang = [0, 1, 2].map(g => phones.find(l => l.gang === g)).filter((l): l is Landmark => !!l);
  const mid = (c.size * TILE) / 2;
  const neutral = phones.filter(l => l.gang < 0).sort((a, b) =>
    Math.hypot(a.tx * TILE - mid, a.ty * TILE - mid) - Math.hypot(b.tx * TILE - mid, b.ty * TILE - mid));
  p = { gang, finale: neutral[0] ?? null };
  phoneCache.set(c, p);
  return p;
}

export const chainsDone = (w: World) => w.ps.story.filter(s => s >= STORY_STEPS).length;
export const finaleOpen = (w: World) => !w.ps.finaleDone && chainsDone(w) >= FINALE_AFTER;

/** Story phones that have a job waiting right now. */
export function liveStoryPhones(w: World): Landmark[] {
  const { gang, finale } = storyPhones(w.city);
  const out = gang.filter(l => (w.ps.story[l.gang] ?? 0) < STORY_STEPS && !isHostile(w, l.gang));
  if (finale && finaleOpen(w)) out.push(finale);
  return out;
}

export const isStoryPhone = (c: City, id: number) => {
  const p = storyPhones(c);
  return p.gang.some(l => l.id === id) || p.finale?.id === id;
};

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function stepModel(step: StoryStep, c: City, gang: number): VehicleModelId | undefined {
  switch (step.car) {
    case 'gang': return c.gangs[gang]?.carModel;
    case 'rival': return c.gangs[RIVAL(gang)]?.carModel;
    case undefined: return undefined;
    default: return step.car;
  }
}

/** The next storyline job behind a story phone. */
export function storyMission(w: World, phone: Landmark): MissionSpec {
  const c = w.city, ps = w.ps;
  const finale = phone.gang < 0;
  const gang = finale ? -1 : phone.gang;
  const stepNo = finale ? 0 : ps.story[gang] ?? 0;
  const step = finale ? FINALE : ARCS[gang % ARCS.length][stepNo];
  const r = makeRng(derive(c.seed, 'story', c.index, gang + 1, stepNo));
  const d = Math.min(TUNING.maxDifficulty, missionDifficulty(c.index, ps.cityMissions) + (finale ? 1 : 0));
  const rival = finale ? -1 : RIVAL(gang);
  const model = stepModel(step, c, gang);
  const b = buildMission(step.kind, r, c, phone, d, { model, enemy: rival >= 0 ? rival : undefined, gangPhone: !finale });
  if (b.params.kind === 'defend' && finale) Object.assign(b.params, { gang: -1, waves: 5, perWave: 4, duration: 90 });
  const p = b.params as { model?: VehicleModelId; count?: number };
  const vars: Record<string, string> = {
    gang: finale ? '' : c.gangs[gang].name,
    rival: rival >= 0 ? c.gangs[rival].name : 'the gangs',
    rivalBoss: rival >= 0 ? bossFor(c.gangs[rival].name).name : '',
    car: p.model ? VEHICLES[p.model].name : '',
    count: p.count !== undefined ? String(p.count) : '',
  };
  const boss = finale ? null : bossFor(c.gangs[gang].name);
  const lines = step.brief.map(t => fill(t, vars));
  if (boss) lines.unshift(boss.hello);
  let reward = Math.round((missionReward(step.kind, d) * STORY_PAY) / 100) * 100;
  if (finale) reward += Math.round((TUNING.cityGoal * c.index * FINALE_BONUS) / 100) * 100;
  return {
    id: `story-${gang}-${stepNo}`, kind: step.kind, title: fill(step.title, vars), giver: gang, reward,
    respect: finale ? 0 : 20, timeLimit: b.timeLimit, params: b.params,
    story: { gang, step: stepNo },
    brief: { speaker: boss ? boss.name : FINALE_CALLER, gang, lines },
    outro: boss ? `${fill(step.outro, vars)} ${boss.thanks}` : step.outro,
  };
}

/** Records a finished storyline job. */
export function completeStoryStep(w: World, spec: MissionSpec): void {
  if (!spec.story) return;
  const { gang, step } = spec.story;
  if (gang < 0) { w.ps.finaleDone = true; return; }
  w.ps.story[gang] = Math.max(w.ps.story[gang] ?? 0, step + 1);
  if (w.ps.story[gang] >= STORY_STEPS) w.bus.emit('message', { text: `${w.city.gangs[gang].name} storyline complete!`, seconds: 4 });
  if (finaleOpen(w)) w.bus.emit('message', { text: 'A phone is ringing downtown. The finale is open.', seconds: 5 });
}
