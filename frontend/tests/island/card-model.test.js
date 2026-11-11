// What the build and upgrade card, the crew and captain panels, the bell and Play with a friend say in each state.
import {describe, expect, it} from 'vitest';
import {buildCardModel, bellModel, inviteModel, crewModel, captainModel, captainsModel, lootText, countdownText, secondsUntil, coinText} from '../../src/island/card-model.js';
import {unlocksFor, readUnlocks, newUnlocks, lockedWave} from '../../src/island/td-rules.js';

const tower = (built = false, kind = 'cannon', level = built ? 1 : 0) => ({id: 'cannon_1', kind, built, level, cost: 30});
const wall = (built = false, level = built ? 1 : 0) => ({id: 'wall_1', kind: 'wall', built, level, cost: 10});
const fresh = unlocksFor(0), wave3 = unlocksFor(3), wave5 = unlocksFor(5);

describe('build card (TOWER-DEFENSE.md §2, §9)', () => {
  it('an empty tower spot offers the unlocked kinds, one line and price each', () => {
    const start = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(), coins: 100, unlocks: fresh});
    expect(start).toMatchObject({mode: 'choose', title: 'Tower spot', soon: 'Coming soon: Mortar · after wave 3', coins: 'You have 🪙 100'});
    expect(start.choices).toEqual([{kind: 'cannon', name: 'Cannon', line: 'Fires at one ship at a time.', price: '🪙 30', disabled: false, reason: '', busy: false}]);
    const later = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(), coins: 40, unlocks: wave3});
    expect(later.choices.map(choice => [choice.kind, choice.price, choice.disabled, choice.reason])).toEqual([
      ['cannon', '🪙 30', false, ''], ['mortar', '🪙 60', true, 'Not enough 🪙: you need 🪙 20 more.']]);
    expect(later.soon).toBe('');
  });
  it('an empty wall spot builds with one button; short of coins says why', () => {
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wall(), coins: 100, unlocks: fresh}))
      .toMatchObject({mode: 'build', title: 'Wall', cost: '🪙 10', button: 'Build · 🪙 10', disabled: false, reason: ''});
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wall(), coins: 4, unlocks: fresh}))
      .toMatchObject({disabled: true, reason: 'Not enough 🪙: you need 🪙 6 more.'});
    expect(buildCardModel({spotId: 'house_1', slot: 'house', spot: {id: 'house_1', kind: 'house', built: false, level: 0, cost: 50}, coins: 100, unlocks: fresh}))
      .toMatchObject({mode: 'info', button: '', soon: 'Coming soon · after wave 2'});
  });
  it('a building shows its level pips and the upgrade with the new numbers', () => {
    const model = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true), coins: 100, unlocks: wave3});
    expect(model).toMatchObject({mode: 'upgrade', title: 'Cannon', pips: [true, false, false], stats: 'Damage 10 · Range 28',
      upgrade: {label: 'Level 2 · 🪙 60', stats: 'Damage 10 → 16 · Range 28 → 31'}, button: 'Upgrade', disabled: false, hire: true});
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wall(true, 2), coins: 100, unlocks: wave5}).upgrade)
      .toEqual({label: 'Level 3 · 🪙 40', stats: 'Strength 120 → 200'});
  });
  it('the upgrade is off with the reason: not enough coins, highest level, or locked until a wave', () => {
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true, 'mortar'), coins: 50, unlocks: wave5}))
      .toMatchObject({title: 'Mortar', upgrade: {label: 'Level 2 · 🪙 120'}, disabled: true, reason: 'Not enough 🪙: you need 🪙 70 more.'});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true, 'cannon', 3), coins: 999, unlocks: wave5}))
      .toMatchObject({mode: 'info', pips: [true, true, true], upgrade: null, button: '', reason: 'Highest level reached.'});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true), coins: 999, unlocks: fresh}))
      .toMatchObject({mode: 'info', upgrade: null, soon: 'Coming soon: Level 2 · after wave 2'});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: {...tower(true), upgradeCost: 55}, coins: 999, unlocks: wave3}).upgrade.label).toBe('Level 2 · 🪙 55');
  });
  it('says while it builds or upgrades, and while loading', () => {
    expect(buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wall(), coins: 100, busy: 'wall'})).toMatchObject({button: 'Building…', disabled: true});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true), coins: 100, busy: 'upgrade'})).toMatchObject({button: 'Upgrading…', disabled: true});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower'})).toMatchObject({disabled: true, reason: 'Your island is still loading.'});
  });
  it("shows the server's plain message on a refusal", () => {
    const model = buildCardModel({spotId: 'wall_1', slot: 'wall', spot: wall(), coins: 100, message: 'A wall costs 10 coins. You need more coins.'});
    expect(model.message).toBe('A wall costs 10 coins. You need more coins.');
    expect(buildCardModel({spotId: 'cannon_1', kind: 'cannon', message: 'Sign in to build on your island.'}).reason).toBe('');
  });
  it("on a friend's island: the same card, you pay, it stays theirs, no crew", () => {
    const empty = buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(), coins: 100, unlocks: fresh, visitor: true, ownerName: 'Captain Gull'});
    expect(empty).toMatchObject({mode: 'choose', owner: "You pay · it stays on Captain Gull's island", coins: 'You have 🪙 100'});
    expect(empty.choices.map(choice => choice.kind)).toEqual(['cannon']);
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(true), coins: 100, unlocks: wave3, visitor: true, ownerName: 'Captain Gull'}))
      .toMatchObject({mode: 'upgrade', upgrade: {label: 'Level 2 · 🪙 60'}, hire: false, owner: "You pay · it stays on Captain Gull's island"});
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', visitor: true}).reason).toBe('The island is still loading.');
  });
  it('on Pirate Point: the same card, paid by you, nothing locked, no crew', () => {
    const model = buildCardModel({spotId: 'pp_tower_1', slot: 'tower', spot: {id: 'pp_tower_1', kind: 'cannon', built: false, level: 0, cost: 30}, coins: 100, point: true});
    expect(model).toMatchObject({mode: 'choose', owner: 'Paid by you · belongs to Pirate Point', soon: '', hire: false});
    expect(model.choices.map(choice => choice.kind)).toEqual(['cannon', 'mortar']);
  });
});

describe('crew and captain panels (§3, §10)', () => {
  it('hides locked crew in one Coming soon line', () => {
    expect(crewModel({crew: {}, coins: 100, unlocks: fresh})).toMatchObject({rows: [], lead: 'Crew members join after you win wave 5.',
      soon: 'Coming soon: Gunner · after wave 5, Carpenter · after wave 5, Lookout · after wave 8'});
  });
  it('hires, is full at the maximum and says when coins are short', () => {
    const model = crewModel({crew: {gunner: 2, carpenter: 0}, coins: 25, unlocks: unlocksFor(8)});
    expect(model.rows.map(row => [row.id, row.owned, row.button, row.disabled, row.reason])).toEqual([
      ['gunner', '2 of 2', 'Full', true, 'You have 2, the most you can hire.'],
      ['carpenter', '0 of 2', 'Hire', true, 'Not enough 🪙: you need 🪙 5 more.'],
      ['lookout', '0 of 1', 'Hire', false, '']]);
    expect(model.rows[2]).toMatchObject({price: '🪙 25', line: 'Sees further in fog; ships show 3 s earlier.'});
    expect(crewModel({crew: {}, coins: 100, unlocks: wave5, busy: 'gunner'}).rows[0]).toMatchObject({button: 'Hiring…', disabled: true});
  });
  it('the captain: musket numbers, the next level, locked and max', () => {
    expect(captainModel({captain: {level: 1, nextPrice: 20}, coins: 100, unlocks: unlocksFor(1)}))
      .toMatchObject({badge: '⚔️ 1', stats: 'Damage 6 · Range 14', upgrade: {label: 'Level 2 · 🪙 20', stats: 'Damage 6 → 9 · Range 14 → 15'}, disabled: false,
        hint: 'Tap a ship to fire your musket (F).'});
    expect(captainModel({captain: {level: 1, nextPrice: 20}, coins: 100, unlocks: fresh})).toMatchObject({upgrade: null, soon: 'Coming soon: Level 2 · after wave 1'});
    expect(captainModel({captain: {level: 3, nextPrice: 80}, coins: 100, unlocks: unlocksFor(5)})).toMatchObject({upgrade: null, soon: 'Coming soon: Level 4 · after wave 8'});
    expect(captainModel({captain: {level: 2, nextPrice: 40}, coins: 10, unlocks: unlocksFor(2)})).toMatchObject({disabled: true, reason: 'Not enough 🪙: you need 🪙 30 more.'});
    expect(captainModel({captain: {level: 5, nextPrice: null}, coins: 999, unlocks: unlocksFor(8)})).toMatchObject({upgrade: null, reason: 'Highest level reached.'});
  });
});

describe('unlocks (§9)', () => {
  it('opens wall and cannon at the start, more after waves 1, 2, 3, 5 and 8', () => {
    expect(fresh).toMatchObject({levels: {wall: 1, cannon: 1, mortar: 0, watchtower: 0, house: 0}, captain: 1, next: {wave: 1}});
    expect(unlocksFor(2)).toMatchObject({levels: {wall: 2, cannon: 2, house: 1, mortar: 0}, captain: 3});
    expect(wave3.levels).toMatchObject({mortar: 1, watchtower: 1});
    expect(wave5).toMatchObject({levels: {wall: 3, cannon: 3, mortar: 3, watchtower: 2, house: 2}, crew: {gunner: true, carpenter: true, lookout: false}, next: {wave: 8}});
    expect(unlocksFor(8)).toMatchObject({captain: 5, crew: {lookout: true}, next: null});
  });
  it('reads the server unlocks first and names what a won wave brings', () => {
    // The backend's shape: ids "<kind>:<level>", "crew:<crew>", "captain:<level>" with the wave the rest needs.
    const sent = readUnlocks({waveBest: 9, unlocks: {wave: 3, unlocked: ['wall:1', 'wall:2', 'cannon:1', 'cannon:2', 'house:1', 'watchtower:1', 'captain:1', 'captain:3'],
      locked: {'mortar:1': 4, 'crew:gunner': 5, 'captain:4': 8}}});
    expect(sent).toMatchObject({wonWave: 3, levels: {wall: 2, cannon: 2, mortar: 0, watchtower: 1, house: 1}, captain: 3, crew: {gunner: false}, next: {wave: 4}});
    expect(lockedWave(sent, {kind: 'mortar'})).toBe(4);
    expect(lockedWave(sent, {crew: 'gunner'})).toBe(5);
    expect(lockedWave(sent, {kind: 'house', level: 2})).toBe(5); // not sent: the table
    expect(buildCardModel({spotId: 'cannon_1', slot: 'tower', spot: tower(), coins: 100, unlocks: sent}).soon).toBe('Coming soon: Mortar · after wave 4');
    expect(readUnlocks({waveBest: 2}).levels.house).toBe(1);
    expect(newUnlocks({waveBest: 2}, {waveBest: 3})).toEqual([{wave: 3, title: 'New: Mortar unlocked!',
      line: 'A mortar hits every ship near the impact. Build one on a tower spot.'}]);
    expect(newUnlocks(null, {waveBest: 3})).toEqual([]);
    expect(newUnlocks({waveBest: 3}, {waveBest: 3})).toEqual([]);
  });
});

describe('bell, invite and toasts', () => {
  it('rings, joins a running wave, and waits while one is under way', () => {
    expect(bellModel({waveBest: 2})).toMatchObject({button: 'Ring the bell', action: 'ring', disabled: false, line: 'Ring it and wave 3 sails in after a 10 second countdown.'});
    expect(bellModel({busy: true})).toMatchObject({button: 'Ringing…', disabled: true});
    expect(bellModel({wave: {wave: 2}, visitor: true, ownerName: 'Captain Gull'})).toMatchObject({action: 'join', button: 'Join the defense', line: "Wave 2 is under way on Captain Gull's island."});
    expect(bellModel({wave: {wave: 1}, joined: true, countdown: 7})).toMatchObject({action: 'none', disabled: true, line: 'Wave 1 arrives in 7 s.'});
  });
  it('invites with ISLE-code and a visit link, for up to 3 friends', () => {
    expect(inviteModel('K7Q2M')).toMatchObject({title: 'Play with a friend', lead: 'Send this link to up to 3 friends', code: 'ISLE-K7Q2M',
      url: 'https://the-great-plot-twist.vercel.app/?visit=ISLE-K7Q2M', line: 'They tap Join, and you defend your island together.'});
    expect(captainsModel(['Captain Brine', 'Captain Brine', '', 'Captain Tern'])).toMatchObject({names: ['Captain Brine', 'Captain Tern'], line: '2 of 3 friends here.'});
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
