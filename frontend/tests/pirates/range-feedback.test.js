// Contextual range lifetime and firing direction; used by the captain feedback review.
import { describe, expect, it } from 'vitest';
import { captainStats } from '../../src/pirates/captain-stats.js';
import { createRangeFeedback } from '../../src/pirates/range-feedback.js';

const view = (feedback, overrides = {}) => feedback.update({ active: true, nowMs: 1000,
  stats: captainStats(), player: { x: 2, z: 3 }, ready: false, ...overrides });

describe('contextual captain range', () => {
  it('stays hidden until intent and follows current equipment, skills and position', () => {
    const feedback = createRangeFeedback();
    expect(view(feedback)).toBeNull();
    const stats = captainStats(3, ['long_barrel'], 'long_rifle');
    expect(view(feedback, { preview: true, stats, player: { x: 8, z: -4 } }))
      .toMatchObject({ x: 8, z: -4, radius: stats.range, label: 'Long rifle range' });
    expect(view(feedback, { held: true, stats: captainStats(1, [], 'pistols') }).radius).toBe(10);
  });

  it('reveals a refused attempt then fades and disappears', () => {
    const feedback = createRangeFeedback();
    feedback.attempt({ nowMs: 1000, message: 'Out of range · move closer', point: { x: 40, z: 0 } });
    expect(view(feedback)).toMatchObject({ status: 'Out of range · move closer', alpha: 1 });
    expect(view(feedback, { nowMs: 2400 }).alpha).toBeCloseTo(.5);
    expect(view(feedback, { nowMs: 2600 })).toBeNull();
  });

  it('uses current melee reach after a manual slash and labels bomb throw distance', () => {
    const feedback = createRangeFeedback();
    feedback.attempt({ nowMs: 1000, message: 'Slash', blade: true });
    const stats = captainStats(1, ['sweep'], 'fire_bombs');
    expect(view(feedback, { stats })).toMatchObject({ radius: stats.sweepRadius, label: 'Cutlass reach' });
    expect(view(feedback, { stats, nowMs: 2700, preview: true })).toMatchObject({ radius: stats.range, label: 'Fire bombs throw range' });
  });

  it('forgets the firing direction after the attempt expires, even while preview remains visible', () => {
    const feedback = createRangeFeedback();
    feedback.attempt({ nowMs: 1000, message: 'Shot fired', point: { x: 40, z: 0 } });
    expect(view(feedback).point).toEqual({ x: 40, z: 0 });
    expect(view(feedback, { nowMs: 2700, preview: true }).point).toBeNull();
  });

  it('does not invent a firing direction during hover or a targetless attempt', () => {
    const feedback = createRangeFeedback();
    expect(view(feedback, { preview: true }).point).toBeNull();
    feedback.attempt({ nowMs: 1000, message: 'No enemy in range' });
    expect(view(feedback).point).toBeNull();
  });

  it('clears intent when combat is inactive', () => {
    const feedback = createRangeFeedback();
    feedback.attempt({ nowMs: 1000, message: 'Reloading' });
    expect(view(feedback, { active: false, preview: true })).toBeNull();
    expect(view(feedback)).toBeNull();
  });
});
