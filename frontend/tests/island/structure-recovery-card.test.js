// Built structure cards include recovery feedback without changing their build or upgrade authority.
import {describe, expect, it} from 'vitest';
import {buildCardModel} from '../../src/island/card-model.js';

const instanceId = '32345678-1234-4234-8234-123456789abc';
const recoveryState = (row, overrides = {}) => ({islandEpoch: '22345678-1234-4234-8234-123456789abc', revision: 4,
  recoveryVersion: 1, waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null,
  remainingPaidUses: null, structures: [row], ...overrides});
const wall = {spot: 'wall_1', instanceId, kind: 'wall', level: 1, hpUnits: 750_000, maxHP: 60,
  rateUnitsPerSecond: 1_666.67, estimatedFreeSeconds: 150, fixedPrice: 10, repairSeq: 0};

describe('structure recovery card model', () => {
  it('shows server HP, wave-end full repair and fixed price for a damaged built structure', () => {
    const model = buildCardModel({spotId: 'wall_1', slot: 'wall', spot: {id: 'wall_1', kind: 'wall', built: true, level: 1},
      recoveryState: recoveryState(wall), recoveryStatus: 'ready'});
    expect(model.recovery).toMatchObject({visible: true, hpLabel: '45 / 60 HP',
      repairLabel: 'Repair now: pay 10 coins', helperLabel: 'All buildings are fully repaired when a wave ends.'});
    expect(model.mode).toBe('upgrade');
  });

  it('keeps the shared quota and paused state during preparation', () => {
    const model = buildCardModel({spotId: 'wall_1', slot: 'wall', spot: {id: 'wall_1', kind: 'wall', built: true, level: 1},
      recoveryState: recoveryState({...wall, hpUnits: 0}, {displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId: '12345678-1234-4234-8234-123456789abc', remainingPaidUses: 2}),
      recoveryStatus: 'ready'});
    expect(model.recovery).toMatchObject({statusLabel: 'No free repair during this wave. Full HP is restored when it ends.', remainingUsesLabel: '2 shared Repair now uses left this wave'});
    expect(model.recovery.repairIntent.expectedWaveId).toBe('12345678-1234-4234-8234-123456789abc');
  });

  it('does not put recovery actions on houses or Pirate Point cards', () => {
    const house = buildCardModel({spotId: 'house_1', slot: 'house', spot: {id: 'house_1', kind: 'house', built: true, level: 1},
      recoveryState: recoveryState(wall), recoveryStatus: 'ready'});
    const point = buildCardModel({spotId: 'pp_wall_1', slot: 'wall', spot: {id: 'pp_wall_1', kind: 'wall', built: true, level: 1},
      point: true, recoveryState: recoveryState(wall), recoveryStatus: 'ready'});
    expect(house.recovery).toBeUndefined();
    expect(point.recovery).toBeUndefined();
  });

  it('hides retired Quick Mend as a new choice while keeping saved choices legible', () => {
    const campaign = {wave: 8, open: new Set(['tech_hub']), research: {done: new Set(['wall']), tiers: {}}};
    const model = buildCardModel({spotId: 'wall_1', slot: 'wall', spot: {id: 'wall_1', kind: 'wall', built: true, level: 1},
      campaign, coins: 500, recoveryVersion: 1});
    expect(model.skills.choices.map(item => item.id)).not.toContain('quick_mend');
    const saved = buildCardModel({spotId: 'wall_1', slot: 'wall', spot: {id: 'wall_1', kind: 'wall', built: true, level: 1, spec: 'quick_mend'},
      campaign, coins: 500, recoveryVersion: 1});
    expect(saved.skills).toMatchObject({title: 'Stored skill: Quick mend', line: 'This saved choice remains recorded but no longer affects repair.'});
    expect(saved.skills.choices.map(item => item.id)).not.toContain('quick_mend');
  });
});
