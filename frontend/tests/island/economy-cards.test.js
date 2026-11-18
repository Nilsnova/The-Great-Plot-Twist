// A visitor's private funds cannot buy shared upgrades; held wagers are unavailable once, without rounding.
import {describe, expect, it} from 'vitest';
import {buildCardModel, captainModel, crewModel, skillsModel, techModel, wreckModel} from '../../src/island/card-model.js';
import {createIslandFunding} from '../../src/island/economy-funding.js';
import {preferPersonalSnapshot, readPersonalCaptain} from '../../src/island/economy-captain.js';
import {unlocksFor} from '../../src/island/td-rules.js';
import {campaignOf} from '../../src/campaign/index.js';
import {personalCaptain, sharedEconomy, sharedIsland} from './economy-fixture.js';

const funds = available => sharedEconomy({treasury: {balanceCoins: String(BigInt(available) + 25n), committedCoins: '25', availableCoins: available}});
const wall = {id: 'wall_1', kind: 'wall', built: false, level: 0, cost: 10};
const campaign = campaignOf({waveBest: 9});

describe('shared island purchase cards', () => {
  it('uses available island coins instead of a wealthy visitor wallet', () => {
    const card = buildCardModel({spotId: 'wall_1', spot: wall, coins: 9999, economy: funds('9'), unlocks: unlocksFor(9), visitor: true});
    expect(card).toMatchObject({disabled: true, owner: 'Paid from the island treasury', reason: 'Not enough 🪙: you need 🪙 1 more.'});
    expect(card.coins).toContain('🪙 9 available');
    expect(card.coins).toContain('🪙 25 committed');
    expect(card.coins).not.toContain('9,999');
  });

  it('keeps huge amounts exact and retains ordinary unlock and reservation guards', () => {
    const amount = '900719925474099312345';
    const card = buildCardModel({spotId: 'wall_1', spot: wall, economy: funds(amount), unlocks: unlocksFor(9)});
    expect(card.disabled).toBe(false);
    expect(card.coins).toContain('🪙 900,719,925,474,099,312,345 available');
    expect(buildCardModel({spotId: 'wall_1', spot: wall, economy: funds(amount), battle: true, unlocks: unlocksFor(9)}))
      .toMatchObject({disabled: true, reason: 'Between waves only.'});
    expect(buildCardModel({spotId: 'wall_1', spot: wall, economy: null, coins: 9999, unlocks: unlocksFor(9)}).disabled).toBe(true);
  });

  it('quotes crew and research against the same treasury and keeps reversal open to members', () => {
    const economy = funds('179');
    const crew = crewModel({crew: {gunner: 1}, economy, coins: 0, unlocks: unlocksFor(9)});
    expect(crew.rows.find(row => row.id === 'gunner')).toMatchObject({disabled: false});
    expect(crew.rows.find(row => row.id === 'carpenter')).toMatchObject({disabled: true, button: 'Unavailable', line: ''});
    expect(crew.lead).toBe('They help this island in every wave.');
    const tech = techModel({campaign, economy, coins: 9999});
    const cannon = tech.branches.find(branch => branch.branch === 'cannon');
    expect(cannon.tiers[0].nodes[0].button).toMatchObject({disabled: true, reason: 'Not enough 🪙: you need 🪙 1 more.'});
    expect(tech.coins).toBe(crew.coins);
    expect(crewModel({crew: {}, economy, unlocks: unlocksFor(9), battle: true}).rows.every(row => row.disabled)).toBe(true);
  });

  it('shows personal Captain points rather than a treasury-funded level purchase', () => {
    const captain = captainModel({captain: personalCaptain({level: 2}), economy: funds('999'), coins: 999, points: 3});
    expect(captain).toMatchObject({upgrade: null, button: '', disabled: true, coins: 'Skill points: 3'});
    expect(captain.reason).toContain('Personal progress');
    const skills = skillsModel({skills: {points: 2, known: ['steady_aim'], role: 'engineer'}, economy: funds('0'), coins: 0, captainLevel: 3,
      respecBlockedReason: 'Stay Engineer for your next wave.'});
    expect(skills.respec).toMatchObject({price: 0, button: 'Respec', disabled: true, reason: 'Stay Engineer for your next wave.'});
    expect(skills.respec.button).not.toContain('🪙');
  });

  it('retains the server Engineer binding while allowing idle skill-only respec', () => {
    const commitment = {id: '55555555-5555-4555-8555-555555555555', state: 'pending', waveId: null};
    const profile = personalCaptain({engineerCommitment: commitment, roleLockedReason: 'engineer_bound'});
    const model = skillsModel({skills: {points: 3, known: ['steady_aim'], role: 'gunner'}, personalCaptain: profile,
      economy: funds('0'), coins: 0, captainLevel: 3, battle: true});
    expect(model.role.current).toBe('engineer');
    expect(model.role.lead).toContain('Stay Engineer');
    expect(model.respec).toMatchObject({disabled: false, button: 'Respec', price: 0});
    expect(model.respec.line).toContain('keep Engineer');
    expect(model.role.detail.disabled).toBe(true);
    const withdrawn = personalCaptain({engineerCommitment: {...commitment, state: 'attached', waveId: '66666666-6666-4666-8666-666666666666'},
      assignmentWaveId: null, roleLockedReason: 'engineer_bound'});
    expect(readPersonalCaptain(withdrawn)).toBe(withdrawn);
    expect(skillsModel({skills: {points: 3, known: ['steady_aim']}, personalCaptain: withdrawn, captainLevel: 3}).respec.disabled).toBe(false);
    const assigned = skillsModel({skills: {points: 3, known: ['steady_aim']}, personalCaptain: personalCaptain({
      assignmentWaveId: '66666666-6666-4666-8666-666666666666', canRespec: false, respecBlockedReason: 'captain_assigned', roleLockedReason: 'captain_assigned'}),
      economy: funds('999'), captainLevel: 3});
    expect(assigned.respec).toMatchObject({disabled: true, reason: 'Your captain is assigned to a wave.'});
    expect(assigned.detail.disabled).toBe(true);
  });

  it('uses personal v1 progression on a legacy-economy island without showing coin upgrades or respec', () => {
    const profile = personalCaptain();
    const captain = captainModel({captain: profile, coins: 9000, points: 3});
    expect(captain).toMatchObject({upgrade: null, button: '', coins: 'Skill points: 3'});
    const skills = skillsModel({personalCaptain: profile, skills: {points: 3, known: ['steady_aim']}, coins: 0, captainLevel: 3});
    expect(skills.respec).toMatchObject({price: 0, button: 'Respec', disabled: false});
    expect(skills.respec.button).not.toContain('🪙');
    expect(captainModel({captain: {progressionVersion: 0, level: 1, nextPrice: 20}, coins: 9000}).upgrade.label).toContain('🪙 20');
  });

  it('uses the same available money for wreck contributions without changing ship gameplay', () => {
    const wreck = wreckModel({campaign, economy: funds('24'), coins: 9999});
    expect(wreck.gifts[0]).toMatchObject({disabled: true, reason: 'Not enough 🪙: you need 🪙 1 more.'});
    expect(wreck.coins).toContain('🪙 24 available');
    expect(wreckModel({campaign, economy: funds('100'), battle: true}).gifts.every(gift => gift.disabled)).toBe(true);
  });
});

describe('selected island funding', () => {
  it('pins shared mode and ignores a private-wallet fallback or an older monetary revision', () => {
    const funding = createIslandFunding();
    expect(funding.view(sharedIsland({economy: funds('75')}), 9000).coins).toBe('75');
    expect(funding.view(sharedIsland({economy: {...funds('40'), revision: '2'}}), 9000).coins).toBe('40');
    expect(funding.view(sharedIsland({economy: funds('75')}), 9000).coins).toBe('40');
    expect(funding.view({code: 'ISLE-K7Q2M', coins: 9000}, 9000)).toMatchObject({shared: true, coins: null});
    expect(funding.view({code: 'ISLE-FR3ND', coins: 400}, 400)).toMatchObject({shared: false, coins: 400});
  });

  it('requires an explicit scope replacement after an epoch change', () => {
    const funding = createIslandFunding(), first = sharedIsland();
    funding.view(first);
    const changed = sharedIsland({economy: sharedEconomy({runEpoch: '44444444-4444-4444-8444-444444444444'})});
    expect(funding.view(changed)).toMatchObject({shared: true, coins: null});
    funding.forget(changed.code);
    expect(funding.view(changed).coins).toBe('75');
  });

  it('orders personal progress independently of a newer or equal treasury snapshot', () => {
    const before = sharedIsland({captain: personalCaptain({revision: '9007199254740993'}), skills: {points: 4, known: ['steady_aim']}});
    const incoming = sharedIsland({economy: sharedEconomy({revision: '9999999999999999'}),
      captain: personalCaptain({revision: '9007199254740992'}), skills: {points: 0, known: []}});
    const merged = preferPersonalSnapshot(before, incoming);
    expect(merged.economy).toBe(incoming.economy);
    expect(merged.captain).toBe(before.captain); expect(merged.skills).toBe(before.skills);
    expect(readPersonalCaptain(personalCaptain({assignmentWaveId: '66666666-6666-4666-8666-666666666666', canRespec: true}))).toBe(null);
    const missing = preferPersonalSnapshot(before, sharedIsland({captain: {level: 3, nextPrice: 80}, coins: 9000}));
    expect(missing.captain).toEqual({progressionVersion: 1});
    expect(captainModel({captain: missing.captain, coins: 9000})).toMatchObject({upgrade: null, button: ''});
    const other = sharedIsland({code: 'ISLE-FR3ND', captain: {progressionVersion: 0, level: 1}, coins: 200});
    expect(preferPersonalSnapshot(before, other)).toBe(other);
  });
});
