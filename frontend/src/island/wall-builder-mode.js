// Wall drafting lifecycle for the real island controls. Quotes authorize the exact immutable purchase intent.
import {makeActionUid} from '../screens/islet/action-uid.js';
import {outcomeUnknown} from './api.js';
import {GRID, onGrid, snap} from './placement.js';
const copyCells = cells => cells.map(cell => ({...cell}));
const scopeKey = scope => `${scope?.code ?? ''}|${scope?.epoch ?? ''}|${scope?.generation ?? 0}`;
function extend(cells, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return {message: 'Pick a square of the build grid.'};
  const target = snap(x, z), last = cells.at(-1);
  if (!last) return onGrid(target.x) && onGrid(target.z) ? {cells: [target]} : {message: 'Pick a square of the build grid.'};
  const axis = Math.abs(target.x - last.x) >= Math.abs(target.z - last.z) ? 'x' : 'z';
  const steps = Math.round((target[axis] - last[axis]) / 2), length = Math.abs(steps);
  if (!length) return {message: 'Tap farther away to add another wall.'};
  if (cells.length + length > 32) return {message: 'Build up to 32 walls at a time.'};
  const added = Array.from({length}, (_, i) => ({...last, [axis]: last[axis] + Math.sign(steps) * (i + 1) * 2}));
  if (added.some(cell => !onGrid(cell.x) || !onGrid(cell.z))) return {message: 'Pick a square of the build grid.'};
  if (added.some(cell => cells.some(old => old.x === cell.x && old.z === cell.z))) return {message: 'This draft already has a wall there.'};
  return {cells: [...cells, ...added]};
}
export function createWallBuilder({api, context, render = () => {}, preview = () => {}, onIsland = () => {}, makeUid = makeActionUid}) {
  let view = null, serial = 0, disposed = false;
  const held = new Map();
  const allowed = () => !disposed && context()?.allowed === true && !!context()?.code;
  const current = (ticket, key) => view && serial === ticket && allowed() && scopeKey(context()) === key;
  const model = () => view ? {cells: copyCells(view.cells), phase: view.phase, busy: view.busy, status: view.status,
    quote: view.quote ? {...view.quote, placements: copyCells(view.quote.placements)} : null} : null;
  function show() {
    render(model());
    preview(view ? {cells: copyCells(view.cells), valid: view.phase === 'ready', refused: view.phase === 'refused'} : null);
  }
  function cancel() { serial++; view = null; show(); }
  function refresh() { if (view && (!allowed() || scopeKey(context()) !== view.key)) cancel(); }
  const editable = () => { refresh(); return view && !view.busy && !view.intent && view.enabled; };
  function edited(cells, status = 'Draft not checked. Get the price before building.') {
    serial++; view = {...view, cells, quote: null, phase: 'draft', status}; show();
  }
  async function start() {
    if (!allowed()) return false;
    const key = scopeKey(context()), intent = held.get(key), ticket = ++serial;
    view = {key, scope: {...context()}, cells: intent ? intent.body.placements.map(({x, z}) => ({x, z})) : [],
      quote: intent?.quote ?? null, intent, enabled: !!intent, busy: !!intent?.pending, phase: intent ? 'unknown' : 'enabling',
      status: intent ? 'Check the previous build before starting another.' : 'Opening wall controls…'};
    show(); if (intent) return true;
    view.busy = true; show(); const answer = await api.enableWalls({code: view.scope.code});
    if (!current(ticket, key)) { refresh(); return false; }
    view.busy = false;
    if (!answer.ok) { view.phase = 'enable_failed'; view.status = answer.message; show(); return false; }
    onIsland(answer.data); view.scope = {...context()}; view.key = scopeKey(view.scope); view.enabled = true;
    view.phase = 'draft'; view.status = 'Tap to start a wall, then tap to add walls or turn.'; show(); return true;
  }
  async function quote() {
    if (!editable() || !view.cells.length) return null;
    const ticket = ++serial, key = view.key;
    view.busy = true; view.phase = 'quoting'; view.status = 'Checking positions and price…'; show();
    let answer = await api.quoteWalls({cells: copyCells(view.cells), code: view.scope.code});
    if (!current(ticket, key)) { refresh(); return answer; }
    if (answer.ok && view.scope.epoch && answer.data.islandEpoch !== view.scope.epoch) {
      answer = {ok: false, status: 409, code: 'island_changed', message: 'Your island changed. Check the positions again.'};
    }
    view.busy = false; view.quote = answer.ok ? structuredClone(answer.data) : null;
    view.phase = answer.ok ? 'ready' : 'refused';
    view.status = answer.ok ? 'Positions checked. Confirm the total price to build.' : answer.message; show(); return answer;
  }
  async function confirm() {
    refresh(); if (!view || view.busy || !['ready', 'unknown'].includes(view.phase)) return null;
    if (!view.intent) {
      const body = {placements: copyCells(view.quote.placements), islandEpoch: view.quote.islandEpoch, quotedTotal: view.quote.totalCost, actionUid: makeUid(), code: view.scope.code};
      body.placements.forEach(Object.freeze); Object.freeze(body.placements); Object.freeze(body);
      view.intent = {body, quote: structuredClone(view.quote), pending: false}; held.set(view.key, view.intent);
    }
    const intent = view.intent, ticket = serial, key = view.key;
    if (intent.pending) return null;
    intent.pending = true; view.busy = true; view.phase = 'building'; view.status = 'Building walls…'; show();
    const answer = await api.buildWalls(intent.body); intent.pending = false;
    if (!current(ticket, key)) {
      refresh();
      if (!answer.ok && !outcomeUnknown(answer)) held.delete(key);
      if (view?.intent === intent) {
        view.busy = false;
        if (!answer.ok && !outcomeUnknown(answer)) { view.intent = null; view.quote = null; view.phase = 'draft'; view.status = answer.message; }
        else { view.phase = 'unknown'; view.status = 'Check the previous build before starting another.'; }
        show();
      }
      return answer;
    }
    view.busy = false;
    if (answer.ok) { held.delete(key); cancel(); onIsland(answer.data.island); return answer; }
    if (outcomeUnknown(answer)) { view.phase = 'unknown'; view.status = 'Build outcome unknown. Retry the same build to check it.'; }
    else { held.delete(key); view.intent = null; view.quote = null; view.phase = 'draft'; view.status = answer.message; }
    show(); return answer;
  }
  return {
    start, quote, confirm, cancel, refresh,
    tap(x, z) { if (!editable()) return false; const next = extend(view.cells, x, z);
      if (!next.cells) { view.status = next.message; show(); return false; } edited(next.cells); return true; },
    shift(dx, dz) {
      if (!editable() || !view.cells.length || !Number.isInteger(dx) || !Number.isInteger(dz) || Math.abs(dx) + Math.abs(dz) !== 1) return false;
      const cells = view.cells.map(cell => ({x: cell.x + dx * GRID, z: cell.z + dz * GRID}));
      if (cells.some(cell => !onGrid(cell.x) || !onGrid(cell.z))) { view.status = 'The draft would leave the build grid.'; show(); return false; }
      edited(cells, 'Draft moved. Get the price to check these positions.'); return true;
    },
    undo() { if (!editable()) return false; edited(view.cells.slice(0, -1)); return true; },
    clear() { if (!editable()) return false; edited([]); return true; },
    get state() { refresh(); return model(); }, get active() { refresh(); return !!view; },
    dispose() { cancel(); disposed = true; },
  };
}
