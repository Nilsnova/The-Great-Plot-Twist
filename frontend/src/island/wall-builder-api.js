// Dedicated wall construction transport. The server owns admission, inventory, placement and payment.
import {isIsland, MESSAGES, readFailure} from './api.js';
import {displayIslandCode} from './codes.js';
import {onGrid} from './placement.js';
const isEpoch = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const cellsOk = cells => Array.isArray(cells) && cells.length > 0 && cells.length <= 32
  && cells.every(cell => onGrid(cell?.x) && onGrid(cell?.z))
  && new Set(cells.map(cell => `${cell.x},${cell.z}`)).size === cells.length;
const placementsOk = rows => cellsOk(rows) && rows.every(row => /^wall_[1-9][0-9]{0,2}$/.test(row?.spot) && Number(row.spot.slice(5)) <= 128)
  && new Set(rows.map(row => row.spot)).size === rows.length;
const sameCells = (rows, cells) => rows.length === cells.length && rows.every((row, i) => row.x === cells[i].x && row.z === cells[i].z);
const samePlacements = (rows, asked) => sameCells(rows, asked) && rows.every((row, i) => row.spot === asked[i].spot);
const currentIsland = data => isIsland(data) && data.layout?.wallRuleVersion === 1 && data.layout?.wallCapacity === 128;
const bad = () => ({ok: false, status: 422, code: 'validation_error', message: 'Check the wall positions and try again.'});
const unreadable = () => ({ok: false, status: 502, code: 'unreadable', message: MESSAGES.unreadable});
export function createWallBuilderApi({transport}) {
  async function ask(action, body, accept) {
    const code = body.code ? displayIslandCode(body.code) : null;
    if (body.code && !code) return bad();
    const sent = {...body}; if (code) sent.code = code; else delete sent.code;
    try {
      const answer = await transport.post(`/api/island/walls/${action}`, structuredClone(sent));
      if (!answer?.ok) return readFailure(answer);
      return accept(answer.data) ? {ok: true, status: answer.status ?? 200, data: answer.data} : unreadable();
    } catch { return readFailure(null); }
  }
  return {
    enableWalls: ({code} = {}) => ask('enable', {code}, data => currentIsland(data) && (!code || data.code === displayIslandCode(code))),
    quoteWalls({cells: askedCells, code} = {}) {
      if (!cellsOk(askedCells)) return Promise.resolve(bad());
      const cells = structuredClone(askedCells);
      return ask('quote', {cells, code}, data => placementsOk(data?.placements) && sameCells(data.placements, cells) && isEpoch(data.islandEpoch)
        && count(data.unitCost) && data.unitCost > 0 && count(data.totalCost) && data.totalCost === data.unitCost * cells.length
        && count(data.remaining) && data.remaining <= 128 - cells.length && data.wallRuleVersion === 1 && data.wallCapacity === 128);
    },
    buildWalls({placements: askedPlacements, actionUid, quotedTotal, islandEpoch, code} = {}) {
      if (!isEpoch(islandEpoch) || !placementsOk(askedPlacements) || !/^[A-Za-z0-9_-]{8,64}$/.test(actionUid ?? '') || !count(quotedTotal) || quotedTotal === 0) return Promise.resolve(bad());
      const placements = structuredClone(askedPlacements);
      return ask('build', {placements, actionUid, quotedTotal, islandEpoch, code}, data => currentIsland(data?.island)
        && (!code || data.island.code === displayIslandCode(code))
        && data.receipt?.actionUid === actionUid && data.receipt.islandEpoch === islandEpoch && data.receipt.totalCost === quotedTotal && typeof data.receipt.repeat === 'boolean'
        && placementsOk(data.receipt.placements) && samePlacements(data.receipt.placements, placements));
    },
  };
}
