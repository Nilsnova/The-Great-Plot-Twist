// Between-wave scene art uses canonical identity/phase and existing damaged or broken frames.
import {describe, expect, it} from 'vitest';
import {structureRecoveryAppearance} from '../../src/island/world.js';

const state = (displayPhase = 'between_waves') => ({recoveryVersion: 1, islandEpoch: '22345678-1234-4234-8234-123456789abc', displayPhase});
const answer = (spot, kind, level = 1) => ({id: spot, kind, level, built: true});
const recoveryRow = (spot, kind, hpUnits, level = 1) => ({spot, kind, level, instanceId: `${spot}-instance`, hpUnits, maxHP: 60, repairSeq: 0});

describe('structure recovery world appearance', () => {
  it('shows existing rubble at zero and keeps wall level pips', () => {
    expect(structureRecoveryAppearance(answer('wall_1', 'wall', 3), recoveryRow('wall_1', 'wall', 0, 3), state()))
      .toEqual({look: 'broken', frame: 'island-wall-broken', suppressPips: false});
    expect(structureRecoveryAppearance(answer('cannon_8', 'cannon', 2), recoveryRow('cannon_8', 'cannon', 0, 2), state('preparing')))
      .toEqual({look: 'broken', frame: 'island-cannon-l2-broken', suppressPips: true});
  });

  it('uses the matching damaged frame below half and restores intact art above half or at full HP', () => {
    expect(structureRecoveryAppearance(answer('cannon_1', 'cannon'), recoveryRow('cannon_1', 'cannon', 499_999), state()))
      .toEqual({look: 'damaged', frame: 'island-cannon-damaged', suppressPips: false});
    expect(structureRecoveryAppearance(answer('cannon_1', 'cannon'), recoveryRow('cannon_1', 'cannon', 500_000), state())).toBeNull();
    expect(structureRecoveryAppearance(answer('cannon_1', 'cannon'), recoveryRow('cannon_1', 'cannon', 1_000_000), state())).toBeNull();
  });

  it('ignores legacy, combat and mismatched structure identity or level', () => {
    const built = answer('cannon_1', 'cannon', 2), damaged = recoveryRow('cannon_1', 'cannon', 0, 2);
    expect(structureRecoveryAppearance(built, damaged, {...state(), recoveryVersion: 0})).toBeNull();
    expect(structureRecoveryAppearance(built, damaged, state('combat'))).toBeNull();
    expect(structureRecoveryAppearance(built, {...damaged, kind: 'mortar'}, state())).toBeNull();
    expect(structureRecoveryAppearance(built, {...damaged, level: 1}, state())).toBeNull();
    expect(structureRecoveryAppearance({...built, built: false}, damaged, state())).toBeNull();
  });
});
