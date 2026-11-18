import { describe, expect, it } from 'vitest';
import {
  buildStructureRecoveryView,
  isCurrentStructureRecoveryResponse,
} from '../../src/island/structure-recovery-model.js';

const FULL = 1_000_000;

function structure(overrides = {}) {
  return {
    instanceId: 'instance-1',
    spot: 'cannon_8',
    kind: 'cannon',
    level: 1,
    hpUnits: 500_000,
    maxHP: 200,
    rateUnitsPerSecond: 1_666.67,
    estimatedFreeSeconds: 300,
    fixedPrice: 40,
    repairSeq: 2,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    islandEpoch: 'epoch-1',
    revision: 9,
    displayPhase: 'between_waves',
    repairWindow: 'between_waves',
    waveId: null,
    remainingPaidUses: null,
    structures: [structure()],
    ...overrides,
  };
}

describe('structure recovery presentation', () => {
  it('shows actual HP and a fixed price for a damaged cannon, including extra spots', () => {
    const view = buildStructureRecoveryView(state(), structure());

    expect(view).toMatchObject({
      visible: true,
      actualHp: 100,
      maxHP: 200,
      hpLabel: '100 / 200 HP',
      repairLabel: 'Repair now: pay 40 coins',
      helperLabel: 'All buildings are fully repaired when a wave ends.',
      remainingPaidUses: null,
    });
    expect(view.healthBar).toMatchObject({ visible: true, fill: 0.5, border: 'dark', color: 'gold', destroyed: false });
  });

  it.each(['wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel'])(
    'supports damaged %s structures',
    (kind) => {
      const view = buildStructureRecoveryView(state(), structure({ kind }));
      expect(view.visible).toBe(true);
    },
  );

  it('hides all offers and bars at full health', () => {
    const full = structure({ hpUnits: FULL, estimatedFreeSeconds: 0 });
    const view = buildStructureRecoveryView(state({ structures: [full] }), full);

    expect(view.visible).toBe(false);
    expect(view.repairLabel).toBeNull();
    expect(view.healthBar.visible).toBe(false);
  });

  it('keeps destroyed structures visible with an empty bar and marker', () => {
    const destroyed = structure({ hpUnits: 0, estimatedFreeSeconds: 600 });
    const view = buildStructureRecoveryView(state({ structures: [destroyed] }), destroyed);

    expect(view).toMatchObject({ visible: true, actualHp: 0, repairLabel: 'Repair now: pay 40 coins' });
    expect(view.healthBar).toMatchObject({ visible: true, fill: 0, destroyed: true, marker: '!' });
  });

  it('does not display tiny positive health as zero', () => {
    const fragile = structure({ hpUnits: 1, maxHP: 100 });
    const view = buildStructureRecoveryView(state({ structures: [fragile] }), fragile);

    expect(view.actualHp).toBeGreaterThan(0);
    expect(view.hpLabel).not.toContain('0 /');
    expect(view.healthBar.fill).toBeGreaterThan(0);
    expect(view.healthBar.destroyed).toBe(false);
  });

  it('keeps exact tiny fill and tells a future renderer the minimum positive width', () => {
    const fragile = structure({ hpUnits: 1, maxHP: 0.1 });
    const view = buildStructureRecoveryView(state({ structures: [fragile] }), fragile);

    expect(view.hpLabel).toMatch(/^0\.0000001 \/ 0\.1 HP$/);
    expect(view.healthBar.fill).toBe(0.000001);
    expect(view.healthBar.minimumVisibleWidthPx).toBe(1);
  });

  it('shows paused automatic repair and shared remaining uses during preparation', () => {
    const damaged = structure();
    const view = buildStructureRecoveryView(
      state({
        displayPhase: 'preparing',
        repairWindow: 'reserved_wave',
        waveId: 'wave-uuid',
        remainingPaidUses: 2,
        structures: [damaged],
      }),
      damaged,
    );

    expect(view).toMatchObject({
      statusLabel: 'No free repair during this wave. Full HP is restored when it ends.',
      helperLabel: null,
      remainingUsesLabel: '2 shared Repair now uses left this wave',
    });
  });

  it('does not invent an ETA if a reserved response incorrectly carries one', () => {
    const damaged = structure({ estimatedFreeSeconds: 120 });
    const view = buildStructureRecoveryView(
      state({ repairWindow: 'reserved_wave', remainingPaidUses: 0, structures: [damaged] }),
      damaged,
    );

    expect(view.statusLabel).toBe('No free repair during this wave. Full HP is restored when it ends.');
    expect(view.remainingUsesLabel).toBe('No shared Repair now uses left this wave');
  });

  it('ignores legacy free-repair rate and ETA fields while keeping valid prices', () => {
    const damaged = structure({ estimatedFreeSeconds: -10, fixedPrice: 1.5 });
    const view = buildStructureRecoveryView(state({ structures: [damaged] }), damaged);

    expect(view.repairLabel).toBeNull();
    expect(view.quotedPrice).toBeNull();
    expect(view.repairDisabled).toBe(true);
  });

  it('clears repair actions while loading or when the read failed', () => {
    expect(buildStructureRecoveryView(state(), structure(), { status: 'loading' })).toMatchObject({
      visible: false,
      status: 'loading',
    });
    expect(buildStructureRecoveryView(state(), structure(), { status: 'error' })).toMatchObject({
      visible: false,
      status: 'error',
    });
  });

  it('shows clear failed-funds and exhausted-quota feedback without changing HP', () => {
    const damaged = structure();
    const noCoins = buildStructureRecoveryView(state({ structures: [damaged] }), damaged, {
      errorCode: 'insufficient_funds',
    });
    const exhausted = buildStructureRecoveryView(
      state({ repairWindow: 'reserved_wave', remainingPaidUses: 0, structures: [damaged] }),
      damaged,
    );

    expect(noCoins.errorMessage).toBe('Not enough coins for this repair.');
    expect(noCoins.hpUnits).toBe(500_000);
    expect(exhausted.repairDisabled).toBe(true);
    expect(exhausted.remainingUsesLabel).toBe('No shared Repair now uses left this wave');
  });

  it('disables a paid action while the caller balance is unknown or too low', () => {
    const damaged = structure();
    const unknown = buildStructureRecoveryView(state(), damaged);
    const short = buildStructureRecoveryView(state(), damaged, {coins: 10});
    const ready = buildStructureRecoveryView(state(), damaged, {coins: 100});
    expect(unknown).toMatchObject({repairDisabled: true, repairReasonLabel: 'Coins are still loading.'});
    expect(short).toMatchObject({repairDisabled: true, repairReasonLabel: 'Need 30 more coins.'});
    expect(ready).toMatchObject({repairDisabled: false, repairReasonLabel: null});
  });

  it('fails closed if reserved-wave quota state is missing', () => {
    const damaged = structure();
    const view = buildStructureRecoveryView(
      state({ repairWindow: 'reserved_wave', remainingPaidUses: null, structures: [damaged] }),
      damaged,
    );

    expect(view.repairLabel).toBe('Repair now: pay 40 coins');
    expect(view.repairDisabled).toBe(true);
  });

  it('fails closed if reserved-wave quota is outside its server bound', () => {
    const damaged = structure();
    const view = buildStructureRecoveryView(
      state({ repairWindow: 'reserved_wave', remainingPaidUses: 4, structures: [damaged] }),
      damaged,
    );

    expect(view.remainingPaidUses).toBeNull();
    expect(view.remainingUsesLabel).toBeNull();
    expect(view.repairDisabled).toBe(true);
  });

  it('disables repeated local submits while an action is pending', () => {
    const view = buildStructureRecoveryView(state(), structure(), { status: 'submitting' });
    expect(view.actionPending).toBe(true);
    expect(view.repairDisabled).toBe(true);
  });

  it('hides houses and watchtowers, which have no supported HP contract', () => {
    for (const kind of ['house', 'watchtower']) {
      const view = buildStructureRecoveryView(state(), structure({ kind }));
      expect(view.visible).toBe(false);
    }
  });

  it('rejects stale island epochs, reset epochs, and replacement instances', () => {
    const requested = {
      islandEpoch: 'epoch-1', instanceId: 'instance-1', revision: 9,
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    };
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-1', instanceId: 'instance-1', revision: 10,
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    })).toBe(true);
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-2', instanceId: 'instance-1', revision: 10,
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    })).toBe(false);
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-1', instanceId: 'replacement', revision: 10,
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    })).toBe(false);
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-1', instanceId: 'instance-1', revision: 8,
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    })).toBe(false);
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-1', instanceId: 'instance-1',
      waveId: null, repairWindow: 'between_waves', displayPhase: 'between_waves',
    })).toBe(false);
    expect(isCurrentStructureRecoveryResponse(requested, {
      islandEpoch: 'epoch-1', instanceId: 'instance-1', revision: 10,
      waveId: 'wave-uuid', repairWindow: 'reserved_wave', displayPhase: 'preparing',
    })).toBe(false);
  });
});
