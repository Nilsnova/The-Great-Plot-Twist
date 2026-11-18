// Immediate danger selection and once-per-episode audio for the wave controller, without a browser or clock.
import { describe, expect, it, vi } from 'vitest';
import { createDangerFeedback } from '../../src/pirates/danger-feedback.js';
import { createPirateSound } from '../../src/audio/pirates.js';

const captain = { id: 'participant-own', x: 8, z: 6, hp: 100, maxHp: 100, down: false, present: true };
const boarder = { id: 'boarder_1', x: 9, z: 6, hp: 20, state: 'fighting', foe: captain.id };
const heartBoarder = { ...boarder, id: 'boarder_heart', x: 1, z: 2, foe: null, state: 'walking' };
const state = changes => ({ phase: 'running', time: 10, party: [{ ...captain }], boarders: [], ships: [],
  heart: { x: 0, z: 2 }, islandHp: 100, maxIslandHp: 100, ...changes });
const input = (changes = {}) => ({ state: state(), player: captain, actorId: captain.id, nowMs: 0, active: true, ...changes });
const hit = { type: 'captain_hit', captainId: captain.id, boarderId: boarder.id, damage: 5, x: 8, z: 6 };

describe('immediate battle dangers', () => {
  it('warns for a boarder actually targeting this recovery participant', () => {
    const result = createDangerFeedback().update(input({ state: state({ boarders: [boarder] }) }));
    expect(result.warning).toMatchObject({ key: 'captain-threat', x: 9, z: 6, critical: false });
    expect(result.sound).toBe(true);
  });

  it('does not call nearby fights against a teammate or militia an attack on you', () => {
    const result = createDangerFeedback().update(input({ state: state({ boarders: [
      { ...boarder, foe: 'teammate' }, { ...boarder, id: 'boarder_2', foe: 'militia_1' },
    ] }) }));
    expect(result).toEqual({ warning: null, sound: false });
  });

  it('does not turn static low captain and heart HP into an acute threat', () => {
    const result = createDangerFeedback().update(input({ state: state({ party: [{ ...captain, hp: 20 }], islandHp: 20 }) }));
    expect(result.warning).toBeNull();
  });

  it('gives a critical threatened captain priority over recent heart damage', () => {
    const feedback = createDangerFeedback();
    feedback.note([{ type: 'island_damaged', damage: 5 }], captain.id, 0);
    const result = feedback.update(input({ state: state({ party: [{ ...captain, hp: 25 }], boarders: [boarder], islandHp: 20 }) }));
    expect(result.warning).toMatchObject({ key: 'captain-critical', critical: true });
  });

  it('prioritizes a critically threatened heart over a healthy captain fight', () => {
    const feedback = createDangerFeedback();
    feedback.note([{ type: 'island_damaged', damage: 5 }], captain.id, 0);
    const result = feedback.update(input({ state: state({ islandHp: 25, boarders: [boarder] }) }));
    expect(result.warning).toMatchObject({ key: 'heart-critical', x: 0, z: 2, critical: true });
  });

  it('keeps recent heart damage visible even after the boarder disappeared', () => {
    const feedback = createDangerFeedback();
    feedback.note([{ type: 'island_damaged', boarderId: 'gone', damage: 14, x: 0, z: 2 }], captain.id, 10);
    expect(feedback.update(input({ nowMs: 1010 })).warning).toMatchObject({ key: 'heart-hit', x: 0, z: 2 });
    expect(feedback.update(input({ nowMs: 3010 })).warning).toBeNull();
  });

  it('warns about nearby heart boarders without claiming they already deal damage', () => {
    const result = createDangerFeedback().update(input({ state: state({ boarders: [
      { ...boarder, x: 3, z: 2, foe: null, state: 'walking', wallId: null },
    ] }) }));
    expect(result.warning).toMatchObject({ key: 'heart-threat', title: 'Pirates near the heart', x: 0, z: 2 });
  });

  it('does not mistake a boarder hacking a wall or tower for a heart threat', () => {
    const result = createDangerFeedback().update(input({ state: state({ boarders: [
      { ...boarder, x: 1, z: 2, foe: null, state: 'hacking', wallId: 'wall_1' },
      { ...boarder, x: 1, z: 2, foe: null, state: 'fighting', towerId: 'tower_1' },
    ] }) }));
    expect(result.warning).toBeNull();
  });

  it('uses only this captain’s positive damage events and resolves the attacker position', () => {
    const feedback = createDangerFeedback();
    feedback.note([{ ...hit, captainId: 'other' }, { ...hit, damage: 0 }], captain.id, 0);
    expect(feedback.update(input()).warning).toBeNull();
    feedback.note([hit], captain.id, 1);
    expect(feedback.update(input({ state: state({ boarders: [{ ...boarder, foe: null }] }), nowMs: 1 })).warning)
      .toMatchObject({ key: 'captain-threat', x: 9, z: 6 });
    expect(feedback.update(input({ nowMs: 3001 })).warning).toBeNull();
  });

  it('warns of an actual incoming splash at your current position', () => {
    const result = createDangerFeedback().update(input({ state: state({ shipShots: [
      { shipId: 'ship_1', target: 'wall', toX: 8, toZ: 6, impactAt: 10.5 },
    ] }) }));
    expect(result.warning).toMatchObject({ key: 'captain-threat', title: 'Incoming fire, move!', x: 8, z: 6 });
  });

  it('does not warn about a splash outside its real radius or after its impact time', () => {
    const result = createDangerFeedback().update(input({ state: state({ shipShots: [
      { target: 'wall', toX: 9.51, toZ: 6, impactAt: 10.5 },
      { target: 'wall', toX: 8, toZ: 6, impactAt: 9.9 },
    ] }) }));
    expect(result.warning).toBeNull();
  });

  it('warns when a ship ball is actually on its way to the heart', () => {
    const result = createDangerFeedback().update(input({ state: state({ shipShots: [
      { target: 'heart', toX: 0, toZ: 2, impactAt: 10.8 },
    ] }) }));
    expect(result.warning).toMatchObject({ key: 'heart-threat', title: 'Heart under fire', x: 0, z: 2 });
  });

  it('sounds once for a sustained warning and keeps its visuals after six seconds', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder] });
    expect(feedback.update(input({ state: current })).sound).toBe(true);
    expect(feedback.update(input({ state: current, nowMs: 6000 })))
      .toMatchObject({ warning: { key: 'captain-threat' }, sound: false });
    expect(feedback.update(input({ state: current, nowMs: 60000 })))
      .toMatchObject({ warning: { key: 'captain-threat' }, sound: false });
  });

  it('does not sound again when an ongoing captain warning becomes critical or changes wording', () => {
    const feedback = createDangerFeedback();
    feedback.update(input({ state: state({ boarders: [boarder] }) }));
    expect(feedback.update(input({ state: state({ boarders: [boarder], party: [{ ...captain, hp: 20 }] }), nowMs: 6000 })))
      .toMatchObject({ warning: { key: 'captain-critical' }, sound: false });
    feedback.note([hit], captain.id, 7000);
    expect(feedback.update(input({ nowMs: 7000 })))
      .toMatchObject({ warning: { title: 'You are taking damage' }, sound: false });
  });

  it('does not replay a warning when captain and heart priority switches while both threats continue', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder, heartBoarder] });
    expect(feedback.update(input({ state: current })).sound).toBe(true);
    expect(feedback.update(input({ state: { ...current, islandHp: 20 }, nowMs: 7000 })))
      .toMatchObject({ warning: { key: 'heart-critical' }, sound: true });
    expect(feedback.update(input({ state: { ...current, islandHp: 20, party: [{ ...captain, hp: 20 }] }, nowMs: 8000 })))
      .toMatchObject({ warning: { key: 'captain-critical' }, sound: false });
    expect(feedback.update(input({ state: { ...current, islandHp: 20 }, nowMs: 15000 })))
      .toMatchObject({ warning: { key: 'heart-critical' }, sound: false });
  });

  it('starts a new warning after that threat has actually cleared during active play', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder] });
    feedback.update(input({ state: current }));
    expect(feedback.update(input({ nowMs: 1000 }))).toEqual({ warning: null, sound: false });
    expect(feedback.update(input({ state: current, nowMs: 7000 })).sound).toBe(true);
  });

  it('rearms a cleared captain threat independently while the heart remains threatened', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder, heartBoarder], party: [{ ...captain, hp: 20 }] });
    expect(feedback.update(input({ state: current })).sound).toBe(true);
    expect(feedback.update(input({ state: state({ boarders: [heartBoarder] }), nowMs: 7000 })).sound).toBe(true);
    expect(feedback.update(input({ state: current, nowMs: 14000 })).sound).toBe(true);
  });

  it('hides inactive feedback without replaying an ongoing warning when the menu closes', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder] });
    expect(feedback.update(input({ state: current })).sound).toBe(true);
    expect(feedback.update(input({ active: false, nowMs: 100 }))).toEqual({ warning: null, sound: false });
    expect(feedback.update(input({ state: current, nowMs: 10000 })))
      .toMatchObject({ warning: { key: 'captain-threat' }, sound: false });
  });

  it('never shows damage during countdown or when the own captain has fallen', () => {
    const feedback = createDangerFeedback();
    feedback.note([hit], captain.id, 0);
    expect(feedback.update(input({ state: state({ phase: 'countdown' }) })).warning).toBeNull();
    expect(feedback.update(input({ state: state({ party: [{ ...captain, down: true }], boarders: [boarder] }) })).warning).toBeNull();
  });

  it('reset starts a new wave without old damage or an old warning episode', () => {
    const feedback = createDangerFeedback();
    feedback.note([hit], captain.id, 0);
    feedback.update(input());
    feedback.reset();
    expect(feedback.update(input()).warning).toBeNull();
    expect(feedback.update(input({ state: state({ boarders: [boarder] }) })).sound).toBe(true);
  });
});

describe('brief danger sound', () => {
  it('does not defer an ongoing warning until effects are unmuted', () => {
    const feedback = createDangerFeedback(), current = state({ boarders: [boarder] });
    const synth = { tone: vi.fn() };
    let muted = true;
    const cue = createPirateSound({ synth, isMuted: () => muted });
    const first = feedback.update(input({ state: current }));
    expect(first.sound).toBe(true);
    cue('pirate-danger');
    expect(synth.tone).not.toHaveBeenCalled();
    muted = false;
    const later = feedback.update(input({ state: current, nowMs: 10000 }));
    expect(later.warning).not.toBeNull();
    expect(later.sound).toBe(false);
    expect(synth.tone).not.toHaveBeenCalled();
  });
  it('plays two brief tones and suppresses rapid independent cue requests', () => {
    const synth = { tone: vi.fn(), noise: vi.fn() }, effects = {}, caption = vi.fn();
    let time = 0;
    const cue = createPirateSound({ synth, effects, caption, now: () => time });
    expect(cue('pirate-danger')).toBe(true);
    expect(synth.tone).toHaveBeenCalledTimes(2);
    expect(synth.tone.mock.calls.every(call => call[0] === effects && call[2] < .3)).toBe(true);
    expect(caption).not.toHaveBeenCalled(); // CF1's persistent warning already supplies accessible words
    expect(cue('pirate-danger')).toBe(false);
    time = 6;
    expect(cue('pirate-danger')).toBe(true);
  });

  it('builds no sound or caption when effects are muted', () => {
    const synth = { tone: vi.fn(), noise: vi.fn() }, caption = vi.fn();
    const cue = createPirateSound({ synth, caption, isMuted: bus => bus === 'effects' });
    expect(cue('pirate-danger')).toBe(true);
    expect(synth.tone).not.toHaveBeenCalled();
    expect(caption).not.toHaveBeenCalled();
  });
});
