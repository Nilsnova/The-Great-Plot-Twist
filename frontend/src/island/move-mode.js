// Move mode (T36, flexible placement): pick a building's new square on the build grid, see at once whether it
// fits (placement.js, the server's rules), then Place here. Clash-of-Clans style, but within our cards: the
// build card's Move button starts it, a tap on the island (world.js onGround) or the arrow buttons/keys move
// the building one square, Enter or Place here sends POST /api/island/move, Escape or Cancel ends it.
// The server decides; a refusal stays on the bar with its plain message. Used by index.js.
//   const mode = createMoveMode({api, render, preview, spots, code, onMoved});
//   mode.start(spotId) / tap(x, z) / nudge(dx, dz) / confirm() / cancel() / handleKey(event) / active
import {GRID, checkMove, footprintOf, freeWallCells, positionsOf, snap} from './placement.js';
import {spotById} from './spots.js';
import {BUILDINGS} from './td-rules.js';
import {WALL_PERIMETER_CELLS} from './wall-perimeter.js';

const KEYS = Object.freeze({ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]});
const SLOT_NAMES = Object.freeze({wall: 'wall spot', tower: 'tower spot', watchtower: 'watchtower spot', house: 'house spot'});
const WALL_TAP_REACH = .9;
const isWall = id => spotById(id)?.slot === 'wall';

// Match taps near a visible slot without pulling distant taps onto the perimeter.
function tappedWallCell(x, z) {
  let closest = null, distance = WALL_TAP_REACH ** 2;
  for (const cell of WALL_PERIMETER_CELLS) {
    const next = (cell.x - x) ** 2 + (cell.z - z) ** 2;
    if (next <= distance) { closest = cell; distance = next; }
  }
  return closest ?? snap(x, z);
}

// What a spot is called on the bar: the building on it, else the empty spot.
export function moveTitle(spotId, spots = []) {
  const answer = spots.find(item => item?.id === spotId);
  const name = answer?.built ? BUILDINGS[answer.kind]?.name : SLOT_NAMES[spotById(spotId)?.slot];
  return `Move ${answer?.built ? name ?? 'building' : `this ${name ?? 'spot'}`}`;
}

// The bar's copy/state plus a confirmed portrait identity for move-bar.js; no renderer or pixels here.
export function moveModel({spotId, spots, verdict, busy, message}) {
  const ok = verdict.ok && !busy;
  const actual = spots?.find(item => item?.id === spotId);
  const portrait = actual?.built === true && Object.hasOwn(BUILDINGS, actual.kind) && Number.isSafeInteger(actual.level) && actual.level >= 1 && actual.level <= 5
    ? {kind: actual.kind, level: actual.level, spec: actual.spec ?? null} : null;
  const line = isWall(spotId) ? 'Tap a highlighted spot on the grass edge, or use the arrows.' : 'Tap the island where it should stand, or use the arrows.';
  return {title: moveTitle(spotId, spots), line, portrait,
    status: message || (verdict.ok ? 'This square is free.' : verdict.message), ok, refused: !verdict.ok || !!message,
    busy, placeLabel: busy ? 'Placing…' : 'Place here'};
}

// api: island api.js; render(model | null): the bar; preview(cell | null): world.js; spots(): the island answer's
// spots; code(): the game's island code or null (your own); onMoved(answer): the island after the move.
export function createMoveMode({api, render = () => {}, preview = () => {}, spots = () => [], code = () => null, onMoved = () => {}} = {}) {
  let move = null; // {spotId, x, z, verdict, busy, message, start}
  const placed = () => positionsOf(spots());
  function show() {
    if (!move) { render(null); preview(null); return; }
    preview({spotId: move.spotId, x: move.x, z: move.z, size: footprintOf(move.spotId), ok: move.verdict.ok});
    render(moveModel({...move, spots: spots()}));
  }
  function goTo(x, z) {
    if (!move || move.busy) return;
    const cell = snap(x, z);
    move = {...move, ...cell, verdict: checkMove(move.spotId, cell.x, cell.z, placed()), message: ''};
    show();
  }
  function nudge(dx, dz) {
    if (!move || move.busy) return;
    if (!isWall(move.spotId)) return goTo(move.x + dx * GRID, move.z + dz * GRID);
    // Prefer the closest free spot in the pressed direction, weighting turns away from the arrow.
    let closest = null, score = Infinity;
    for (const cell of freeWallCells(move.spotId, placed())) {
      const x = cell.x - move.x, z = cell.z - move.z, forward = x * dx + z * dz;
      if (forward <= 0) continue;
      const next = forward + 2 * Math.abs(x * dz - z * dx);
      if (next < score) { closest = cell; score = next; }
    }
    if (closest) goTo(closest.x, closest.z);
  }
  function start(spotId) {
    const positions = placed(), where = positions[spotId];
    if (!where) return false;
    const verdict = isWall(spotId) ? checkMove(spotId, where.x, where.z, positions) : {ok: true};
    move = {spotId, x: where.x, z: where.z, start: {...where}, verdict, busy: false, message: ''};
    show();
    return true;
  }
  function end() { move = null; show(); }
  async function confirm() {
    if (!move || move.busy || !move.verdict.ok) return null;
    // Where it stands already: nothing to send.
    if (move.x === move.start.x && move.z === move.start.z) { end(); return null; }
    move = {...move, busy: true, message: ''}; show();
    const asked = move, answer = await api.move({spot: asked.spotId, x: asked.x, z: asked.z, code: code()});
    if (move !== asked) return answer; // cancelled meanwhile
    if (answer.ok) { end(); onMoved(answer, asked.spotId); return answer; }
    move = {...asked, busy: false, message: answer.message}; show();
    return answer;
  }
  // Arrows nudge a building or select the next wall slot. Enter places the preview.
  function handleKey(event) {
    if (!move) return false;
    const step = KEYS[event.key];
    if (step) nudge(...step);
    else if (event.key === 'Enter') void confirm();
    else return false;
    event.preventDefault?.(); event.stopPropagation?.();
    return true;
  }
  return {
    start, confirm, cancel: end, handleKey, nudge,
    tap(x, z) {
      if (!move) return;
      const cell = isWall(move.spotId) ? tappedWallCell(x, z) : {x, z};
      goTo(cell.x, cell.z);
    },
    refresh: show,
    get active() { return !!move; },
    get state() { return move ? {spotId: move.spotId, x: move.x, z: move.z, ok: move.verdict.ok, busy: move.busy, message: move.message} : null; },
  };
}
