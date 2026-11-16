// New recovery policy rules stay separate from the legacy Captain loadout.
import { describe, expect, it } from 'vitest';
import { captainStats, ENGINEER_DISCOUNT, pointsSpent, readSkills } from '../../src/pirates/captain-stats.js';
import { REACH } from '../../src/pirates/interact.js';
import {
  isRetiredCaptainSkill,
  isAllowedWallRecoveryChoice,
  recoveryRateFactor,
  captainBranchesForPolicy,
  recoveryTechLine,
} from '../../src/campaign/captain-repair-policy.js';

const retired = ['quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer'];

describe('Captain repair policy versions', () => {
  it('keeps retired ids known for legacy saves and normal skill point accounting', () => {
    expect(retired.every(id => isRetiredCaptainSkill(id))).toBe(true);
    expect(retired.every(id => isRetiredCaptainSkill(id, 0))).toBe(false);
    expect(readSkills(retired)).toEqual(retired);
    expect(pointsSpent(retired)).toBe(18);
  });

  it('keeps legacy repair stats but removes repair-only effects under recovery v1', () => {
    const skills = ['quick_fix', 'long_reach', 'master_shipwright', 'grand_engineer', 'engineer'];
    expect(captainStats(1, skills).repairMultiplier).toBe(2);
    expect(captainStats(1, skills).repairReach).toBeGreaterThan(3);
    expect(captainStats(1, skills).rebuildShare).toBe(.8);
    expect(captainStats(1, skills).wallHpMultiplier).toBe(1.25);

    expect(captainStats(1, skills, 'musket', {recoveryVersion: 1})).toMatchObject({
      repairMultiplier: 1,
      repairReach: REACH,
      rebuildShare: .4,
      wallHpMultiplier: 1,
    });
    expect(captainStats(1, ['engineer'], 'musket', {recoveryVersion: 1}).role).toBe('engineer');
    expect(ENGINEER_DISCOUNT).toBe(10);
  });

  it('hides the now-retired Shipwright path only for recovery-v1 views', () => {
    const branches = [
      {id: 'marksman', start: 'steady_aim', nodes: [{id: 'steady_aim'}], tiers: [{tier: 1, nodes: [{id: 'steady_aim'}]}]},
      {id: 'shipwright', start: 'quick_fix', nodes: retired.map(id => ({id})), tiers: [{tier: 1, nodes: [{id: 'quick_fix'}]}]},
    ];
    expect(captainBranchesForPolicy(branches)).toBe(branches);
    expect(captainBranchesForPolicy(branches, 1).map(branch => branch.id)).toEqual(['marksman']);
  });

  it('keeps legacy repair text but describes recovery-v1 Tech effects clearly', () => {
    expect(recoveryTechLine('bastion', 'Old repair text')).toBe('Old repair text');
    expect(recoveryTechLine('quick_mend', 'Old repair text', 1)).toBe('This wall recovers twice as fast between waves.');
    expect(recoveryTechLine('mason_drill', 'Old repair text', 1)).toBe('Automatic wall recovery for this island runs 50% faster.');
    expect(recoveryTechLine('bastion', 'Old repair text', 1)).toBe('Unlocks the Bastion wall skill: +50% max HP and 3× between-wave recovery when equipped.');
  });
});

describe('new recovery wall research', () => {
  it.each([
    [{}, true],
    [{wallSpec: 'quick_mend'}, true],
    [{wallSpec: 'bastion'}, true],
    [{wallSpec: 'stone'}, true],
    [{wallSpec: 'spiked'}, true],
    [{wallSpec: 'thorns'}, true],
    [{wallResearch: 'thick_walls'}, true],
    [{wallSpec: 'quick_mend', wallResearch: 'mason_drill'}, true],
    [{wallSpec: 'bastion', wallResearch: 'mason_drill'}, true],
    [{wallSpec: 'quick_mend', wallResearch: 'bastion'}, false],
    [{wallSpec: 'quick_mend', wallResearch: 'unknown'}, false],
  ])('checks approved wall choice %j', (choice, allowed) => {
    expect(isAllowedWallRecoveryChoice(choice)).toBe(allowed);
  });

  it.each([
    [0, 0, 'wall', null, null, true, 1],
    [2, 10, 'wall', null, null, true, 4.5],
    // Bastion unlocked on the island does not matter unless this wall equips it.
    [2, 10, 'wall', 'quick_mend', null, true, 9],
    [2, 10, 'wall', null, 'mason_drill', true, 6.75],
    [2, 10, 'wall', 'quick_mend', 'mason_drill', true, 13.5],
    [2, 10, 'wall', 'bastion', 'mason_drill', true, 20.25],
    [2, 10, 'wall', 'stone', 'thick_walls', true, 4.5],
    [2, 10, 'cannon', 'bastion', 'mason_drill', true, 4.5],
    [2, 10, 'wall', 'bastion', 'mason_drill', false, 0],
    [50, 2, 'wall', null, null, true, 4.5],
  ])('calculates a between-wave rate factor', (carpenters, workshops, structureKind, wallSpec, wallResearch, betweenWaves, factor) => {
    expect(recoveryRateFactor({
      ownerCarpenters: carpenters,
      nearbyWorkshops: workshops,
      structureKind,
      wallSpec,
      wallResearch,
      isBetweenWaves: betweenWaves,
    })).toBe(factor);
  });

  it('rejects invalid counts and unsupported wall choices', () => {
    expect(() => recoveryRateFactor({ownerCarpenters: -4, structureKind: 'wall', isBetweenWaves: true})).toThrow();
    expect(() => recoveryRateFactor({nearbyWorkshops: -1, structureKind: 'wall', isBetweenWaves: true})).toThrow();
    expect(() => recoveryRateFactor({wallSpec: 'unknown', structureKind: 'wall', isBetweenWaves: true})).toThrow();
    expect(() => recoveryRateFactor({ownerCarpenters: 0, nearbyWorkshops: 0, isBetweenWaves: true})).toThrow();
    expect(() => recoveryRateFactor({structureKind: 'house', isBetweenWaves: true})).toThrow();
  });
});
