// What the build card, the bell and the invite card say in each state.
import {describe, expect, it} from 'vitest';
import {buildCardModel, bellModel, inviteModel, lootText, countdownText, secondsUntil, coinText} from '../../src/island/card-model.js';

const cannon = (built = false) => ({id: 'cannon_1', kind: 'cannon', built, cost: 30});

describe('build card', () => {
  it('can build when the coins are enough', () => {
    const model = buildCardModel({spotId: 'cannon_1', spot: cannon(), coins: 100});
    expect(model).toMatchObject({title: 'Cannon', purpose: 'Fires at pirate ships on its own.', cost: '🪙 30',
      button: 'Build', disabled: false, reason: '', coins: 'You have 🪙 100'});
  });
  it('is disabled with the reason when short of coins', () => {
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(), coins: 10})).toMatchObject({disabled: true, reason: 'You need 🪙 20 more.'});
  });
  it('says while it builds, when it stands, and while loading', () => {
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(), coins: 100, busy: true})).toMatchObject({button: 'Building…', disabled: true});
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(true), coins: 70})).toMatchObject({built: true, disabled: true, reason: 'Your cannon stands here.'});
    expect(buildCardModel({spotId: 'cannon_1', kind: 'cannon'})).toMatchObject({title: 'Cannon', cost: '🪙 30', disabled: true, reason: 'Your island is still loading.'});
  });
  it("shows the server's plain message on a refusal", () => {
    const model = buildCardModel({spotId: 'cannon_1', spot: cannon(), coins: 100, message: 'A cannon costs 30 coins. You need more coins.'});
    expect(model.message).toBe('A cannon costs 30 coins. You need more coins.');
    expect(buildCardModel({spotId: 'cannon_1', kind: 'cannon', message: 'Sign in to build on your island.'}).reason).toBe('');
  });
  it('never lets a visitor build', () => {
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(), visitor: true, ownerName: 'Captain Gull'}))
      .toMatchObject({disabled: true, reason: 'Only Captain Gull can build here.', coins: ''});
    expect(buildCardModel({spotId: 'cannon_1', spot: cannon(true), visitor: true, ownerName: 'Captain Gull'}).reason).toBe('Captain Gull built this cannon.');
  });
});

describe('bell, invite and toasts', () => {
  it('rings, joins a running wave, and waits while one is under way', () => {
    expect(bellModel({waveBest: 2})).toMatchObject({button: 'Ring the bell', action: 'ring', disabled: false, line: 'Ring it and wave 3 sails in after a 10 second countdown.'});
    expect(bellModel({busy: true})).toMatchObject({button: 'Ringing…', disabled: true});
    expect(bellModel({wave: {wave: 2}, visitor: true, ownerName: 'Captain Gull'})).toMatchObject({action: 'join', button: 'Join the defense', line: "Wave 2 is under way on Captain Gull's island."});
    expect(bellModel({wave: {wave: 1}, joined: true, countdown: 7})).toMatchObject({action: 'none', disabled: true, line: 'Wave 1 arrives in 7 s.'});
  });
  it('invites with ISLE-code and a visit link', () => {
    expect(inviteModel('K7Q2M')).toMatchObject({code: 'ISLE-K7Q2M', url: 'https://the-great-plot-twist.vercel.app/?visit=ISLE-K7Q2M'});
    expect(inviteModel(null)).toMatchObject({code: 'Loading…', url: ''});
  });
  it('writes coins, loot and the countdown', () => {
    expect(coinText(120)).toBe('🪙 120');
    expect(lootText({loot: 25, coins: 125})).toBe('🪙 +25 loot · you have 🪙 125');
    expect(countdownText(7, 1)).toBe('Pirates in 7 s! Wave 1');
    expect(countdownText(0, 1)).toBe('Wave 1: the pirates are here!');
  });
  it('counts down to startsAt, and survives a wrong clock', () => {
    const now = Date.parse('2026-11-11T10:00:00Z');
    expect(secondsUntil('2026-11-11T10:00:10Z', now, {fresh: true})).toBe(10);
    expect(secondsUntil('2026-11-11T10:00:06.5Z', now)).toBe(7);
    expect(secondsUntil('2026-11-11T09:00:10Z', now, {fresh: true})).toBe(10); // a clock an hour fast
    expect(secondsUntil('2026-11-11T09:59:00Z', now)).toBe(0);
  });
});
