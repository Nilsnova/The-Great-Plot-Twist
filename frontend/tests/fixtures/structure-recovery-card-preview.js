// Renders the production structure card with fixture data, without a server or repair request.
import {createIslandUi} from '../../src/island/ui.js';
import {buildCardModel} from '../../src/island/card-model.js';
import {BUILDINGS} from '../../src/island/td-rules.js';
import {towerMaxHp} from '../../src/pirates/tower-health.js';
import {campaignOf} from '../../src/campaign/index.js';
import {crewModel, techModel} from '../../src/island/card-model.js';
import {unlocksFor} from '../../src/island/td-rules.js';

const FULL = 1_000_000;
const BASE_RATE_UNITS_PER_SECOND = FULL / 600;
const epoch = '22345678-1234-4234-8234-123456789abc';
const base = {serverNow: '2026-11-17T12:00:00Z', islandEpoch: epoch, revision: 4, recoveryVersion: 1,
  waveProtocol: 2, displayPhase: 'between_waves', repairWindow: 'between_waves', waveId: null, remainingPaidUses: null};
const samples = {
  wall: {state: base, row: {spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc', kind: 'wall', level: 1,
    hpUnits: 750_000, maxHP: BUILDINGS.wall.stats[0].hp, rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
    estimatedFreeSeconds: 150, fixedPrice: BUILDINGS.wall.price[0], repairSeq: 0}},
  cannon: {state: {...base, displayPhase: 'preparing', repairWindow: 'reserved_wave', waveId: '12345678-1234-4234-8234-123456789abc', remainingPaidUses: 2},
    row: {spot: 'cannon_8', instanceId: '42345678-1234-4234-8234-123456789abc', kind: 'cannon', level: 1,
      hpUnits: 0, maxHP: towerMaxHp('cannon', 1), rateUnitsPerSecond: 0, estimatedFreeSeconds: null,
      fixedPrice: BUILDINGS.cannon.price[0], repairSeq: 3}},
  harpoon: {state: base, row: {spot: 'cannon_9', instanceId: '52345678-1234-4234-8234-123456789abc', kind: 'harpoon', level: 1,
    hpUnits: 1, maxHP: towerMaxHp('harpoon', 1), rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
    estimatedFreeSeconds: 600, fixedPrice: BUILDINGS.harpoon.price[0], repairSeq: 0}},
  loading: {state: base, status: 'loading', row: {spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc', kind: 'wall', level: 1,
    hpUnits: 750_000, maxHP: BUILDINGS.wall.stats[0].hp, rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
    estimatedFreeSeconds: 150, fixedPrice: BUILDINGS.wall.price[0], repairSeq: 0}},
  house: {state: base, row: {spot: 'house_1', instanceId: '62345678-1234-4234-8234-123456789abc', kind: 'house', level: 2, spec: 'workshop'}},
  walltech: {state: base, row: {spot: 'wall_1', instanceId: '32345678-1234-4234-8234-123456789abc', kind: 'wall', level: 1,
    spec: 'quick_mend', hpUnits: FULL, maxHP: BUILDINGS.wall.stats[0].hp, rateUnitsPerSecond: BASE_RATE_UNITS_PER_SECOND,
    estimatedFreeSeconds: 0, fixedPrice: BUILDINGS.wall.price[0], repairSeq: 0}},
};

const which = new URLSearchParams(location.search).get('case') ?? 'wall';
const sample = samples[which];
const ui = createIslandUi({container: document.getElementById('mount')});
if (which === 'crew') {
  ui.crewCard(crewModel({crew: {carpenter: 1}, coins: 100, unlocks: unlocksFor(8), recoveryVersion: 1}), () => {});
} else if (which === 'tech') {
  const campaign = campaignOf({waveBest: 15, campaign: {wave: 15, research: {done: ['wall'], tiers: {wall: {tier: 1}}}}});
  ui.techCard(techModel({campaign, coins: 2000, recoveryVersion: 1}));
} else if (sample) {
  const catalogue = BUILDINGS[sample.row.kind];
  const levelIndex = sample.row.level - 1;
  const spot = {id: sample.row.spot, kind: sample.row.kind, built: true, level: sample.row.level, spec: sample.row.spec,
    cost: catalogue.price[levelIndex], upgradeCost: catalogue.price[levelIndex + 1]};
  const campaign = which === 'house' ? campaignOf({waveBest: 8}) : which === 'walltech'
    ? campaignOf({waveBest: 25, campaign: {wave: 25, research: {done: ['wall'], tiers: {wall: {tier: 3, tier2: 'mason_drill', tier3: 'bastion'}}}}})
    : null;
  const model = buildCardModel({spotId: spot.id, slot: spot.kind === 'wall' ? 'wall' : spot.kind, spot, coins: 100,
    campaign, recoveryState: {...sample.state, structures: [sample.row]}, recoveryStatus: sample.status ?? 'ready', recoveryVersion: 1});
  ui.buildCard(model, {repairStructure: (_spot, intent) => {
    window.previewIntent = intent;
    document.querySelector('.preview-note').textContent = 'Fixture emitted a repair intent; no API call was made.';
  }});
} else throw new Error('Unknown structure card preview case.');
