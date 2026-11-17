import { describe, expect, it } from 'vitest';
import { createReplayDriver, createWaveReplay, fetchSealedEvents } from '../../src/pirates/wave-replay.js';

describe('sealed recovery wave replay', () => {
  it('waits for every page through the fixed head before exposing a sealed prefix', () => {
    const replay = createWaveReplay();
    expect(replay.addPage({ headSeq: 3, sealedThroughTick: 10,
      events: [{ serverSeq: 2, effectiveTick: 4, type: 'damage', payload: {} }] })).toBe(true);
    expect(replay.canAdvanceThrough(10)).toBe(false);
    expect(replay.addPage({ through: 4, events: [] })).toBe(false);
    expect(replay.addPage({ through: 3, events: [
      { serverSeq: 1, effectiveTick: 2, type: 'move', payload: {} },
      { serverSeq: 3, effectiveTick: 12, type: 'shot', payload: {} },
    ] })).toBe(true);
    expect(replay.complete()).toBe(true);
    expect(replay.canAdvanceThrough(10)).toBe(true);
    expect(replay.canAdvanceThrough(11)).toBe(false);
    expect(replay.through(10).map(event => event.type)).toEqual(['move', 'damage']);
  });

  it('reorders events by effective tick then server sequence, regardless of delivery order', () => {
    const replay = createWaveReplay();
    replay.addPage({ headSeq: 3, sealedThroughTick: 20, events: [
      { serverSeq: 3, effectiveTick: 5, type: 'damage', payload: {} },
      { serverSeq: 2, effectiveTick: 5, type: 'repair', payload: {} },
      { serverSeq: 1, effectiveTick: 3, type: 'move', payload: {} },
    ] });
    expect(replay.through(20).map(event => [event.effectiveTick, event.serverSeq]))
      .toEqual([[3, 1], [5, 2], [5, 3]]);
  });

  it('deduplicates an identical sequence and rejects conflicting or out-of-range events', () => {
    const replay = createWaveReplay();
    const event = { serverSeq: 1, effectiveTick: 5, type: 'paid_repair', payload: { spot: 'cannon_8' } };
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 20, events: [event] })).toBe(true);
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 20, events: [{
      payload: { spot: 'cannon_8' }, type: 'paid_repair', effectiveTick: 5, serverSeq: 1,
    }] })).toBe(true);
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 20, events: [{ ...event, payload: { spot: 'cannon_1' } }] })).toBe(false);
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 20, events: [{ ...event, serverSeq: 2 }] })).toBe(false);
    expect(replay.size).toBe(1);
    expect(replay.through(10)[0].payload.spot).toBe('cannon_8');
  });

  it('accepts a higher watermark only after completing the previous fixed-head pages', () => {
    const replay = createWaveReplay();
    replay.addPage({ headSeq: 1, sealedThroughTick: 4,
      events: [{ serverSeq: 1, effectiveTick: 2, type: 'captain_move', payload: {} }] });
    expect(replay.addPage({ headSeq: 2, sealedThroughTick: 5,
      events: [{ serverSeq: 2, effectiveTick: 5, type: 'captain_shot', payload: {} }] })).toBe(true);
    expect(replay.canAdvanceThrough(5)).toBe(true);
    expect(replay.through(5).map(event => event.serverSeq)).toEqual([1, 2]);
  });

  it('never advances beyond the sealed tick and applies same-tick events once in server order', () => {
    const replay = createWaveReplay();
    replay.addPage({ headSeq: 2, sealedThroughTick: 2, events: [
      { serverSeq: 2, effectiveTick: 1, type: 'structure_repaired', payload: {} },
      { serverSeq: 1, effectiveTick: 1, type: 'captain_move', payload: {} },
    ] });
    const driver = createReplayDriver(replay), seen = [];
    expect(driver.advanceThrough(3, () => {})).toBe(false);
    expect(driver.nextTick).toBe(0);
    expect(driver.advanceThrough(2, (tick, events) => seen.push([tick, events.map(event => event.serverSeq)]))).toBe(true);
    expect(seen).toEqual([[0, []], [1, [1, 2]], [2, []]]);
    expect(driver.advanceThrough(2, () => {})).toBe(false);
    expect(driver.nextTick).toBe(3);
  });

  it('rejects a newly committed event scheduled at or behind an already sealed tick', () => {
    const replay = createWaveReplay();
    replay.addPage({ headSeq: 1, sealedThroughTick: 4,
      events: [{ serverSeq: 1, effectiveTick: 2, type: 'captain_move', payload: {} }] });
    expect(replay.addPage({ headSeq: 2, sealedThroughTick: 5,
      events: [{ serverSeq: 2, effectiveTick: 4, type: 'structure_repaired', payload: {} }] })).toBe(false);
  });

  it('fetches every page through a fixed head before allowing replay', async () => {
    const replay = createWaveReplay(), calls = [];
    const pages = [
      { headSeq: 3, sealedThroughTick: 8, events: [
        { serverSeq: 1, effectiveTick: 1, type: 'captain_input', payload: {}, participantToken: 'participant-a' },
        { serverSeq: 2, effectiveTick: 2, type: 'structure_repaired', payload: {} },
      ] },
      { through: 3, events: [
        { serverSeq: 3, effectiveTick: 4, type: 'captain_input', payload: {}, participantToken: 'participant-a' },
      ] },
    ];
    const ready = await fetchSealedEvents(replay, async cursor => { calls.push(cursor); return pages[calls.length - 1]; });
    expect(ready).toBe(true);
    expect(calls).toEqual([{ after: 0 }, { after: 2, through: 3 }]);
    expect(replay.canAdvanceThrough(8)).toBe(true);
  });

  it('keeps a preparation seal at -1 queued until tick 0 is sealed', () => {
    const replay = createWaveReplay();
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: -1,
      events: [{ serverSeq: 1, effectiveTick: 0, type: 'structure_repaired', payload: {} }] })).toBe(true);
    expect(replay.complete()).toBe(true);
    expect(replay.canAdvanceThrough(0)).toBe(false);
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 0, events: [] })).toBe(true);
    expect(replay.canAdvanceThrough(0)).toBe(true);
  });

  it('resumes an interrupted fixed-head fetch, then opens a later growing head', async () => {
    const replay = createWaveReplay(), requests = [];
    const firstPages = [
      { headSeq: 3, sealedThroughTick: 5, events: [
        { serverSeq: 1, effectiveTick: 1, type: 'captain_move', payload: {} },
        { serverSeq: 2, effectiveTick: 2, type: 'captain_move', payload: {} },
      ] },
      null,
    ];
    expect(await fetchSealedEvents(replay, async request => { requests.push(request); return firstPages.shift(); })).toBe(false);
    expect(replay.contiguousSeq).toBe(2);
    expect(await fetchSealedEvents(replay, async request => {
      requests.push(request);
      if (request.through === 3) return { through: 3, events: [{ serverSeq: 3, effectiveTick: 4, type: 'captain_move', payload: {} }] };
      return { headSeq: 4, sealedThroughTick: 6, events: [{ serverSeq: 4, effectiveTick: 6, type: 'captain_move', payload: {} }] };
    })).toBe(true);
    expect(await fetchSealedEvents(replay, async request => {
      requests.push(request);
      return { headSeq: 4, sealedThroughTick: 6, events: [{ serverSeq: 4, effectiveTick: 6, type: 'captain_move', payload: {} }] };
    })).toBe(true);
    expect(requests).toEqual([{ after: 0 }, { after: 2, through: 3 }, { after: 2, through: 3 }, { after: 3 }]);
    expect(replay.headSeq).toBe(4);
    expect(replay.contiguousSeq).toBe(4);
  });

  it('owns a deeply frozen JSON copy and rejects a malformed page without partial ingestion', () => {
    const replay = createWaveReplay();
    const source = { serverSeq: 1, effectiveTick: 2, type: 'captain_move', payload: { path: [{ x: 1 }] } };
    expect(replay.addPage({ headSeq: 2, sealedThroughTick: 4, events: [source, { ...source, serverSeq: 3 }] })).toBe(false);
    expect(replay.headSeq).toBeNull();
    expect(replay.size).toBe(0);
    expect(replay.addPage({ headSeq: 1, sealedThroughTick: 4, events: [source] })).toBe(true);
    source.payload.path[0].x = 99;
    expect(replay.through(4)[0].payload.path[0].x).toBe(1);
    expect(Object.isFrozen(replay.through(4)[0].payload.path[0])).toBe(true);
  });

  it('reconstructs identical commands from the stable participant token after private account deletion', () => {
    const token = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
    const journal = [
      { serverSeq: 1, effectiveTick: 1, type: 'captain_input', participantToken: token,
        payload: { command: { type: 'captain_move', x: 2, z: 3 }, captain: { level: 2, skills: [], weapon: 'musket' } } },
      { serverSeq: 2, effectiveTick: 5, type: 'captain_input', participantToken: token,
        payload: { command: { type: 'captain_shot', targetId: 'ship_1' }, captain: { level: 2, skills: [], weapon: 'musket' } } },
    ];
    const reconstruct = events => {
      const replay = createWaveReplay(), seen = [];
      replay.addPage({ headSeq: events.length, sealedThroughTick: 5, events });
      createReplayDriver(replay).advanceThrough(5, (_tick, tickEvents) => seen.push(...tickEvents.map(event => ({
        actor: event.participantToken, command: event.payload.command,
      }))));
      return seen;
    };
    const beforeDeletion = reconstruct(journal);
    const afterDeletion = reconstruct(journal.map(event => ({ ...event })));
    expect(afterDeletion).toEqual(beforeDeletion);
    expect(afterDeletion.every(event => event.actor === token)).toBe(true);
  });
});
