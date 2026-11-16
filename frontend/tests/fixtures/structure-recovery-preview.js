import { buildStructureRecoveryView } from '../../src/island/structure-recovery-model.js';
import { renderStructureRecoveryView } from '../../src/island/structure-recovery-view.js';

const state = {
  islandEpoch: 'preview-epoch',
  revision: 1,
  waveProtocol: 2,
  displayPhase: 'between_waves',
  repairWindow: 'between_waves',
  waveId: null,
  remainingPaidUses: null,
};

const samples = [
  {
    target: 'wall-recovery',
    state,
    structure: {
      instanceId: 'preview-wall', spot: 'wall_1', kind: 'wall', level: 1,
      hpUnits: 750_000, maxHP: 100, rateUnitsPerSecond: 1_666,
      estimatedFreeSeconds: 150, fixedPrice: 10, repairSeq: 0,
    },
  },
  {
    target: 'cannon-recovery',
    state: {
      ...state, displayPhase: 'preparing', repairWindow: 'reserved_wave',
      waveId: 'preview-wave', remainingPaidUses: 2,
    },
    structure: {
      instanceId: 'preview-cannon', spot: 'cannon_8', kind: 'cannon', level: 2,
      hpUnits: 0, maxHP: 250, rateUnitsPerSecond: 0,
      estimatedFreeSeconds: null, fixedPrice: 40, repairSeq: 3,
    },
  },
  {
    target: 'harpoon-recovery',
    state,
    structure: {
      instanceId: 'preview-harpoon', spot: 'cannon_9', kind: 'harpoon', level: 1,
      hpUnits: 1, maxHP: 100, rateUnitsPerSecond: 1_666,
      estimatedFreeSeconds: 600, fixedPrice: 25, repairSeq: 0,
    },
  },
];

for (const sample of samples) {
  const view = buildStructureRecoveryView(sample.state, sample.structure);
  const container = document.getElementById(sample.target);
  renderStructureRecoveryView(container, view, {
    onRepair: () => {
      document.getElementById('intent-note').textContent = 'Preview emitted an intent only; no API call was made.';
    },
  });
}
