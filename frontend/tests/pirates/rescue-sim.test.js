// T38 sim hook (specs/T38-T39-minigames-rescue.md "Sim hook"): with the wave option rescue (the server's rule
// "rescue") a lost wave from wave 4 waits for the last-chance rescue, the battle stands still meanwhile, and
// result().rescued follows its outcome. Without the option a lost wave ends at once, exactly as before.
import { describe, expect, it } from 'vitest';
import { createWave } from '../../src/pirates/sim.js';
import { RESCUE } from '../../src/pirates/finisher/rescue.js';
import { zoneAt } from '../../src/pirates/finisher/rules.js';

// No defenses and a weak heart: wave 6 is lost soon. One captain stands on the island the whole time.
const lostWave = options => createWave({ seed: 3, wave: 6, island: { hp: 5 }, defenses: [], ...options });
const here = { type: 'captain_move', by: 'cap', x: 15, z: -15 };

// Run the wave to its end. haul(f) gives the captain's finisher_input for the rescue state f, or null.
function play(wave, haul = () => null) {
  const events = [];
  let sent = 0;
  for (let i = 0; i < 40000 && !wave.done; i++) {
    const f = wave.state().finisher, inputs = i % 20 === 0 ? [here] : [];
    if (f?.kind === 'rescue' && f.phase === 'prepare') inputs.push({ type: 'finisher_ready', by: 'cap', shipId: RESCUE.shipId });
    if (f?.kind === 'rescue' && f.phase !== 'prepare') {
      const input = haul(f, sent);
      if (input) { inputs.push(input); sent = input.from + input.marks.length; }
    }
    events.push(...wave.step(.05, inputs));
  }
  return events;
}
// A captain who keeps the needle in the zone, ten samples per message.
const goodHaul = (f, sent) => {
  if (sent + 10 > f.sample) return null;
  const task = f.tasks[0], marks = [];
  for (let s = sent; s < sent + 10; s++) marks.push(s >= task.from && s < task.to ? Math.round(zoneAt(s - task.from, f.salt, f.difficulty.rescue.speed)) : -1);
  return { type: 'finisher_input', by: 'cap', from: sent, marks };
};

describe('the rescue in the wave', () => {
  it('without the option a lost wave ends at once, as before', () => {
    const events = play(lostWave({}));
    expect(events.some(event => event.type.startsWith('rescue_'))).toBe(false);
    expect(events.find(event => event.type === 'wave_ended')?.reason).toBe('island_lost');
  });

  it('with the option a lost wave waits for the rescue; a failed one ends the wave lost, not rescued', () => {
    const wave = lostWave({ rescue: true });
    const events = play(wave);
    const started = events.findIndex(event => event.type === 'rescue_started');
    const ended = events.findIndex(event => event.type === 'wave_ended');
    expect(started).toBeGreaterThan(-1);
    expect(ended).toBeGreaterThan(events.findIndex(event => event.type === 'rescue_failed'));
    expect(events[ended]).toMatchObject({ reason: 'island_lost', survived: false });
    expect(wave.result().rescued).toBeUndefined();
    // The battle stood still while the rescue ran: no boarder or ship moved the heart meanwhile.
    expect(events.slice(started, ended).some(event => event.type === 'island_damaged')).toBe(false);
  });

  it('a won rescue sets result().rescued, the wave stays lost', () => {
    const wave = lostWave({ rescue: true });
    const events = play(wave, goodHaul);
    expect(events.some(event => event.type === 'rescue_won')).toBe(true);
    expect(wave.result()).toMatchObject({ survived: false, rescued: true });
  });

  it('is never offered on Pirate Point (the flagship wave) or below wave 4', () => {
    expect(play(lostWave({ rescue: true, flagship: true })).some(event => event.type === 'rescue_started')).toBe(false);
    expect(play(lostWave({ rescue: true, wave: 3 })).some(event => event.type === 'rescue_started')).toBe(false);
  });
});
