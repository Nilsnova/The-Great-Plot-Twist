// A read-only summary of accepted island buildings. Prices and locks use the
// existing detail-card model; this view never creates a purchase or wallet.
import {buildCardModel, coinText} from './card-model.js';
import {BUILDINGS, readUnlocks} from './td-rules.js';
import {campaignOf} from '../campaign/index.js';

export function upgradeOverviewModel({island = null, battle = false, message = ''} = {}) {
  const coins = Number.isSafeInteger(island?.coins) ? island.coins : null;
  const seen = new Set(), rows = [], campaign = campaignOf(island);
  for (const spot of island?.spots ?? []) {
    if (!spot?.built || typeof spot.id !== 'string' || seen.has(spot.id) || !BUILDINGS[spot.kind]) continue;
    seen.add(spot.id);
    const card = buildCardModel({spotId: spot.id, kind: spot.kind, spot, coins,
      unlocks: readUnlocks(island), prices: island.prices, campaign, battle});
    const next = card.upgrade?.label ?? card.soon;
    rows.push({id: spot.id, kind: spot.kind, name: card.title, level: card.level,
      place: spot.id.replace(/^cannon_/, 'tower ').replace(/_/g, ' '),
      next: next || 'Highest building level',
      reason: card.reason || (card.soon ? 'Win more waves to open this level.' : ''),
      state: !next ? 'top' : card.mode === 'upgrade' && !card.disabled ? 'ready' : 'blocked',
      skill: card.skills?.current ? card.skills.title : '',
      paths: card.tree ? `Tower paths: ${card.tree.flag} steps bought` : ''});
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.level - b.level || a.id.localeCompare(b.id, undefined, {numeric: true}));
  const kinds = [...new Set(rows.map(row => row.kind))].map(kind => ({id: kind, name: BUILDINGS[kind].name}));
  return {title: 'Base overview', coins: coinText(coins), rows, kinds,
    lead: island ? `${rows.length} built ${rows.length === 1 ? 'building' : 'buildings'} · ${coinText(coins)}` : 'Your island is still loading.',
    note: battle ? 'A wave is running. Plan building levels here.' : 'Plan building levels here, then approach a building to make changes.',
    message, empty: island ? 'No buildings yet. Build your first defense on the island.' : ''};
}

export function overviewRows(model, kind = 'all', state = 'all') {
  return model.rows.filter(row => (kind === 'all' || row.kind === kind) && (state === 'all' || row.state === state));
}
