// QA finding 04: during a boss finisher or rescue the minigame owns the keys; the captain stands still.
import { describe, expect, it } from 'vitest';
import { createFinisherWatch, finisherOwnsKeys } from '../../src/pirates/finisher/captain-lock.js';
import { createWave } from '../../src/pirates/sim.js';

const controller = finisher => ({ state: { finisher } });

describe('the captain stands still while a finisher runs', () => {
  it('is on for an active finisher or rescue on the island or at Pirate Point, and off otherwise', () => {
    expect(finisherOwnsKeys(null)).toBe(false);
    expect(finisherOwnsKeys({ island: { state: null } })).toBe(false);
    expect(finisherOwnsKeys({ island: controller(null) })).toBe(false);
    expect(finisherOwnsKeys({ island: controller({ active: false }) })).toBe(false);
    expect(finisherOwnsKeys({ island: controller({ active: true, kind: 'boss' }) })).toBe(true);
    expect(finisherOwnsKeys({ island: controller({ active: true, kind: 'rescue' }) })).toBe(true);
    expect(finisherOwnsKeys({ island: controller(null), point: { controller: controller({ active: true }) } })).toBe(true);
    expect(finisherOwnsKeys({ island: controller({ active: 'yes' }) })).toBe(false); // only a real true counts
  });

  it('reports the start and the end once each, so held keys are let go exactly then', () => {
    const changed = createFinisherWatch();
    expect([false, false, true, true, true, false, false, true].map(changed)).toEqual([false, false, true, false, false, true, false, true]);
  });

  it('reads the field the wave simulation really sets: no finisher at the start of a wave', () => {
    const state = createWave({ seed: 5, wave: 1 }).state();
    expect(Object.hasOwn(state, 'finisher')).toBe(true);
    expect(finisherOwnsKeys({ island: { state } })).toBe(false);
  });
});
