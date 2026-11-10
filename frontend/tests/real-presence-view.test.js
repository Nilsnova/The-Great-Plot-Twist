// Pure projection keeps cosmetic wire data separate from the schema-1 display shape.
import {describe, expect, it} from 'vitest';
import {peerFacing, wireFacing, projectOnlinePresence} from '../src/online/adapter/presence-view.js';
import {playerId} from './realtime-fakes.js';

describe('online presence projection', () => {
  it.each([['front', 'down'], ['back', 'up'], ['left', 'left'], ['right', 'right']])(
    'translates %s and %s in both directions', (view, wire) => {
      expect(peerFacing(wire)).toBe(view);
      expect(wireFacing(view)).toBe(wire);
    });

  it('gives callers independent view data and never exposes a wire identity', () => {
    const shown = [{id: playerId(2), name: 'Captain Two', kit: 'witness', crewmate: true}];
    const positions = new Map([[playerId(2), {x: 1, y: 2, facing: 'down', moving: false, at: 100}]]);
    const args = {status: 'live', place: 'saltreach_harbor', shown, positions,
      localEmote: {id: 'wave', until: 900}, cooldownUntil: 1000, now: 100, opaqueId: () => 'captain-a'};
    const first = projectOnlinePresence(args);
    first.others[0].kit.name = 'Changed'; first.localEmote.id = 'cheer'; first.emotes[0].label = 'Changed';
    const next = projectOnlinePresence(args);
    expect(next.others[0].kit.name).toBe('Witness');
    expect(next.localEmote.id).toBe('wave');
    expect(next.emotes[0].label).toBe('Wave');
    expect(JSON.stringify(next)).not.toContain(playerId(2));
  });

  it('keeps an off view empty even when private peer data was held', () => {
    const view = projectOnlinePresence({status: 'off', shown: [{id: playerId(2)}],
      crew: {seats: [{seatNo: 1, holder: 'player', name: 'Captain Two'}]}, now: 100});
    expect(view).toEqual({status: 'off', place: null, others: [], hiddenCount: 0, crew: [], sampledAt: 100,
      localEmote: null, canEmote: false, cooldown: 0, emotes: []});
  });
});
