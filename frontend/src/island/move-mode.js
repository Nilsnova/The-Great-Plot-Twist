// Move mode (T36, flexible placement): pick a building's new square on the build grid, see at once whether it
// fits (placement.js, the server's rules), then Place here, within the existing cards: the
// build card's Move button starts it, a tap on the island (world.js onGround) or the arrow buttons/keys move
// the building one square, Enter or Place here sends POST /api/island/move, Escape or Cancel ends it.
// The server decides; a refusal stays on the bar with its plain message. Used by index.js.
//   const mode = createMoveMode({api, render, preview, spots, code, onMoved});
//   mode.start(spotId) / tap(x, z) / nudge(dx, dz) / confirm() / cancel() / handleKey(event) / active
import {GRID, checkMove, footprintOf, positionsOf, snap} from './placement.js';
import {spotById} from './spots.js';
import {BUILDINGS} from './td-rules.js';
import {wallPolicy} from './wall-policy.js';
import {isInventoryWallId} from './wall-cohort.js';

const KEYS = Object.freeze({ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]});
const SLOT_NAMES = Object.freeze({wall: 'wall spot', tower: 'tower spot', watchtower: 'watchtower spot', house: 'house spot'});

// What a spot is called on the bar: the building on it, else the empty spot.
export function moveTitle(spotId, spots = []) {
  const answer = spots.find(item => item?.id === spotId);
  const name = answer?.built ? BUILDINGS[answer.kind]?.name : SLOT_NAMES[spotById(spotId)?.slot];
  return `Move ${answer?.built ? name ?? 'building' : `this ${name ?? 'spot'}`}`;
}

// The bar's copy/state plus a confirmed portrait identity for move-bar.js; no renderer or pixels here.
export function moveModel({spotId, spots, verdict, busy, message, layout}) {
  const ok = verdict.ok && !busy;
  const actual = spots?.find(item => item?.id === spotId);
  const portrait = actual?.built === true && Object.hasOwn(BUILDINGS, actual.kind) && Number.isSafeInteger(actual.level) && actual.level >= 1 && actual.level <= 5
    ? {kind: actual.kind, level: actual.level, spec: actual.spec ?? null} : null;
  const line = spotById(spotId)?.slot === 'wall' && wallPolicy(layout)?.wallRuleVersion === 0 ? 'Walls go on a pirate path: tap a glowing square.' : 'Tap the island where it should stand, or use the arrows.';
  return {title: moveTitle(spotId, spots), line, portrait,
    status: message || (verdict.ok ? 'This square is free.' : verdict.message), ok, refused: !verdict.ok || !!message,
    busy, placeLabel: busy ? 'Placing…' : 'Place here'};
}

// api: island api.js; render(model | null): the bar; preview(cell | null): world.js; spots(): the island answer's
// spots; code(): the game's island code or null (your own); onMoved(answer): the island after the move.
export function createMoveMode({api, render = () => {}, preview = () => {}, spots = () => [], code = () => null, layout = () => ({}), onMoved = () => {}} = {}) {
  let move = null; // {spotId, x, z, verdict, busy, message, start}
  const placed = () => positionsOf(spots());
  const scope = () => JSON.stringify([code(), wallPolicy(layout())]);
  function show() {
    if (!move) { render(null); preview(null); return; }
    preview({spotId: move.spotId, x: move.x, z: move.z, size: footprintOf(move.spotId), ok: move.verdict.ok, ...(wallPolicy(layout())?.wallRuleVersion === 1 ? {wallRuleVersion: 1} : {})});
    render(moveModel({...move, spots: spots(), layout: layout()}));
  }
  function goTo(x, z) {
    if (!move || move.busy) return;
    if (scope() !== move.scope) { end(); return; }
    const cell = snap(x, z);
    move = {...move, ...cell, verdict: checkMove(move.spotId, cell.x, cell.z, placed(), layout()), message: ''};
    show();
  }
  function start(spotId) {
    const where = placed()[spotId];
    const policy = wallPolicy(layout());
    if (!where || !policy || (isInventoryWallId(spotId) && policy.wallCapacity === 12)) return false;
    move = {spotId, x: where.x, z: where.z, start: {...where}, scope: scope(), code: code(), verdict: {ok: true}, busy: false, message: ''};
    show();
    return true;
  }
  function end() { move = null; show(); }
  async function confirm() {
    if (!move || move.busy || !move.verdict.ok) return null;
    if (scope() !== move.scope) { end(); return null; }
    // Where it stands already: nothing to send.
    if (move.x === move.start.x && move.z === move.start.z) { end(); return null; }
    move = {...move, busy: true, message: ''}; show();
    const asked = move, answer = await api.move({spot: asked.spotId, x: asked.x, z: asked.z, code: asked.code});
    if (move !== asked || scope() !== asked.scope) { if (move === asked) end(); return answer; } // cancelled meanwhile
    if (answer.ok) { end(); onMoved(answer, asked.spotId); return answer; }
    move = {...asked, busy: false, message: answer.message}; show();
    return answer;
  }
  // Arrow keys move one square, Enter places; the game's own keys are left alone otherwise.
  function handleKey(event) {
    if (!move) return false;
    const step = KEYS[event.key];
    if (step) goTo(move.x + step[0] * GRID, move.z + step[1] * GRID);
    else if (event.key === 'Enter') void confirm();
    else return false;
    event.preventDefault?.(); event.stopPropagation?.();
    return true;
  }
  return {
    start, confirm, cancel: end, handleKey,
    tap: (x, z) => goTo(x, z),
    nudge: (dx, dz) => move && goTo(move.x + dx * GRID, move.z + dz * GRID),
    refresh() { if (move && scope() !== move.scope) end(); else show(); },
    get active() { return !!move; },
    get state() { return move ? {spotId: move.spotId, x: move.x, z: move.z, ok: move.verdict.ok, busy: move.busy, message: move.message} : null; },
  };
}
