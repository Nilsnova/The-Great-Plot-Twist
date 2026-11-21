// Playtest 20 Nov: Menu > Return to title during a wave left the wave bar, the musket button and later the
// rescue minigame on top of the title screen. With isShown() false the wave still runs (every crew
// member's screen must agree), but it counts as "not here": nothing of it is drawn and no input reaches it.
import {expect, it} from 'vitest';
import {mountPirates} from '../../src/pirates/index.js';

function bus() {
  const handlers = new Map();
  return {on: (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); },
    emit: event => { for (const fn of [...(handlers.get(event.type) ?? [])]) fn(event); }};
}

it('keeps a running wave going but hidden while the title screen is up, and shows it again on return', () => {
  const {on, emit} = bus();
  let shown = true;
  const pirates = mountPirates({on, emit, loop: false, world: {current: {id: 'home_islet'}}, isShown: () => shown});
  try {
    emit({type: 'wave_started_server', waveId: 'title-wave', wave: 1, seed: 77, startsAt: new Date(Date.now() - 2000).toISOString()});
    pirates.update(.1);
    const wave = pirates.island.wave;
    expect(wave).toBeTruthy();
    expect(wave.shown).toBe(true);
    const before = wave.ticks;

    shown = false; // Menu > Return to title
    pirates.update(.1); pirates.update(.1);
    expect(pirates.island.wave.shown).toBe(false);
    expect(pirates.island.wave.ticks).toBeGreaterThanOrEqual(before); // the battle is not paused
    expect(pirates.island.tap?.({x: 0, z: 0}) ?? false).toBe(false); // a tap on the title fires no musket

    shown = true; // Play again
    pirates.update(.1);
    expect(pirates.island.wave.shown).toBe(true);
  } finally { pirates.dispose(); }
});

it('without isShown (older callers) the wave is shown as before', () => {
  const {on, emit} = bus();
  const pirates = mountPirates({on, emit, loop: false, world: {current: {id: 'home_islet'}}});
  try {
    emit({type: 'wave_started_server', waveId: 'plain-wave', wave: 1, seed: 77, startsAt: new Date(Date.now() - 2000).toISOString()});
    pirates.update(.1);
    expect(pirates.island.wave.shown).toBe(true);
  } finally { pirates.dispose(); }
});
