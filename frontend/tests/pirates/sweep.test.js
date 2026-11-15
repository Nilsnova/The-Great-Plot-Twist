// The cutlass sweep (owner's playtest 15 Nov: "make melee always hit everyone in proximity, like swinging a sword
// around"): one captain_strike hits EVERY boarder within the swing's radius of the captain at full damage, none
// outside, and the same seed and inputs give the same fight on every screen.
import { describe, expect, it } from 'vitest';
import { CONFIG, createWave } from '../../src/pirates/sim.js';
import { captainStats } from '../../src/pirates/captain-stats.js';
import { bladeTarget } from '../../src/pirates/controller.js';

const EAST = [{ id: 'east', bearing: 0 }];
const blade = CONFIG.captain.cutlass;
// Boarders ashore: run the wave until at least `count` walk on land, then stand the captain among them.
function crowd(count = 4, seed = 4, wave = 6) {
  const sim = createWave({ seed, wave, lanes: EAST, island: { hp: 100000 } });
  for (let i = 0; i < 4000 && sim.state().boarders.length < count; i++) sim.step(.05);
  const boarders = sim.state().boarders, reach = blade.reach + blade.slack;
  expect(boarders.length).toBeGreaterThanOrEqual(count);
  // Stand a step beside the boarder with the most others in reach (the crowd's middle).
  const around = item => boarders.filter(other => Math.hypot(other.x - item.x - .5, other.z - item.z) <= reach).length;
  const best = boarders.reduce((a, b) => (around(b) > around(a) ? b : a));
  return { sim, at: { x: Math.round((best.x + .5) * 100) / 100, z: best.z } };
}
const strikeAt = (at, skills = []) => ({ type: 'captain_strike', by: 'anna', targetId: null, level: 1, skills, x: at.x, z: at.z });
const hitIds = events => events.filter(event => event.type === 'boarder_hit' && event.by === 'captain:anna').map(event => event.boarderId).sort();

describe('the cutlass sweep', () => {
  it('hits every boarder within the radius and none outside, all at full damage', () => {
    const { sim, at } = crowd();
    const before = sim.state().boarders, reach = blade.reach + blade.slack;
    const inside = before.filter(item => Math.hypot(item.x - at.x, item.z - at.z) <= reach + 1e-9).map(item => item.id).sort();
    const outside = before.filter(item => !inside.includes(item.id)).map(item => item.id);
    expect(inside.length).toBeGreaterThanOrEqual(2); // a crowd: more than one blow from one swing
    const events = sim.step(.05, [strikeAt(at)]);
    expect(hitIds(events)).toEqual(inside);
    for (const id of outside) expect(hitIds(events)).not.toContain(id);
    const damage = blade.levels[0].damage;
    for (const event of events.filter(item => item.type === 'boarder_hit' && item.by === 'captain:anna')) {
      expect(event.damage).toBe(Math.min(damage, before.find(item => item.id === event.boarderId).hp));
      expect(event.blade).toBe(true);
    }
    const [blow] = events.filter(event => event.type === 'captain_struck');
    expect(blow.radius).toBe(blade.reach);
    expect([blow.targetId, ...blow.swept].sort()).toEqual(inside);
  });
  it('does nothing with no boarder in the circle, and waits for its reload', () => {
    const { sim, at } = crowd();
    expect(sim.step(.05, [strikeAt({ x: at.x + 40, z: at.z })]).filter(event => event.type === 'captain_struck')).toEqual([]);
    expect(sim.step(.05, [strikeAt(at)]).filter(event => event.type === 'captain_struck')).toHaveLength(1);
    expect(sim.step(.05, [strikeAt(at)]).filter(event => event.type === 'captain_struck')).toHaveLength(0); // 0.5 s reload
  });
  it('plays the same fight for the same seed and inputs', () => {
    const play = () => {
      const { sim, at } = crowd();
      const lines = [];
      for (let i = 0; i < 200 && !sim.done; i++) lines.push(JSON.stringify(sim.step(.05, i % 10 === 0 ? [strikeAt(at, ['cutlass'])] : [])));
      lines.push(JSON.stringify(sim.state().boarders));
      return lines.join('\n');
    };
    expect(play()).toBe(play());
  });
  it('the controller swings when a boarder is inside the circle, wider with Sweep', () => {
    const state = { boarders: [{ id: 'boarder_1', x: 3, z: 0 }] };
    expect(bladeTarget({ x: 0, z: 0 }, state)).toBeNull(); // 3 > 2.2: the musket
    expect(bladeTarget({ x: 0, z: 0 }, state, captainStats(1, ['sweep']).sweepRadius)?.id).toBe('boarder_1');
  });
});
