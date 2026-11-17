import { buildStructureRecoveryView } from '../../src/island/structure-recovery-model.js';
import { renderStructureRecoveryView } from '../../src/island/structure-recovery-view.js';
import { BUILDINGS } from '../../src/island/td-rules.js';
import { towerMaxHp } from '../../src/pirates/tower-health.js';

const FULL = 1_000_000;
const BASE_RATE_UNITS_PER_SECOND = FULL / 600;

function etaAtBaseRate(hpUnits) {
  return Math.ceil((FULL - hpUnits) / BASE_RATE_UNITS_PER_SECOND);
}

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
      hpUnits: 750_000, maxHP: BUILDINGS.wall.stats[0].hp, rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
      estimatedFreeSeconds: etaAtBaseRate(750_000), fixedPrice: BUILDINGS.wall.price[0], repairSeq: 0,
    },
  },
  {
    target: 'cannon-recovery',
    state: {
      ...state, displayPhase: 'preparing', repairWindow: 'reserved_wave',
      waveId: 'preview-wave', remainingPaidUses: 2,
    },
    structure: {
      instanceId: 'preview-cannon', spot: 'cannon_8', kind: 'cannon', level: 1,
      hpUnits: 0, maxHP: towerMaxHp('cannon', 1), rateUnitsPerSecond: 0,
      estimatedFreeSeconds: null, fixedPrice: BUILDINGS.cannon.price[0], repairSeq: 3,
    },
  },
  {
    target: 'harpoon-recovery',
    state,
    structure: {
      instanceId: 'preview-harpoon', spot: 'cannon_9', kind: 'harpoon', level: 1,
      hpUnits: 1, maxHP: towerMaxHp('harpoon', 1), rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
      estimatedFreeSeconds: etaAtBaseRate(1), fixedPrice: BUILDINGS.harpoon.price[0], repairSeq: 0,
    },
  },
];

for (const sample of samples) {
  const view = buildStructureRecoveryView(sample.state, sample.structure, {coins: 100});
  const container = document.getElementById(sample.target);
  renderStructureRecoveryView(container, view, {
    onRepair: () => {
      document.getElementById('intent-note').textContent = 'Preview emitted an intent only; no API call was made.';
    },
  });
}
