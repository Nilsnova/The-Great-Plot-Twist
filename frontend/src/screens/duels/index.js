// The lazy entry of the Lantern Duels screen. game.js loads this file only when the player first
// presses E at the arena gate, so the title and game chunks do not grow. openArena() picks the
// adapter (the local practice ring with ?arena=local in development only, otherwise the HTTP
// adapter), builds the panel once and opens it, or focuses it if it is already open.
// While the server flag `arena` is off, the panel just says the ring is closed.
// isArenaOpen() tells the game whether the panel is on screen, so that Escape, the gamepad and the
// hotkeys leave the game alone while the player is in the ring (as they do for the case board).
// ctx: { container, resetInput, focus, getToken? }. getToken is the sign-in hook for package A2.
// Used by: src/game.js. See README.md in this folder.
import './duels.css';
import { createHttpAdapter } from './http-adapter.js';
import { createPanel } from './panel.js';

let arena = null; // the one panel
let generation = 0;
let building = null; // set while the adapter is being chosen, so two quick presses build one panel
let arenaOwner = null, buildingOwner = null, openRequest = 0;

function captureOwner(ctx) {
  const search = new URLSearchParams(location.search);
  const practice = import.meta.env.DEV && search.get('arena') === 'local';
  const capability = {request:ctx.request, getIdentity:ctx.getIdentity, onIdentityChange:ctx.onIdentityChange};
  if (practice) return {practice, identity: null, ...capability};
  try {
    if (search.get('demo') === '1' || ctx.getFlags?.()?.arena !== true
      || !['get','post','publicGet'].every(key => typeof ctx.request?.[key] === 'function')
      || typeof ctx.getIdentity !== 'function' || typeof ctx.onIdentityChange !== 'function') return null;
    return {practice, identity: ctx.getIdentity(), ...capability};
  } catch { return null; }
}
const sameOwner = (left, right) => left && right && left.practice === right.practice
  && Object.is(left.identity, right.identity) && left.request === right.request
  && left.getIdentity === right.getIdentity && left.onIdentityChange === right.onIdentityChange;

async function chooseAdapter(ctx) {
  const wantsPractice = import.meta.env.DEV && new URLSearchParams(location.search).get('arena') === 'local';
  if (wantsPractice) return (await import('./fake-adapter.js')).createFakeAdapter();
  return createHttpAdapter({ getToken:ctx.getToken,request:ctx.request,getFlags:ctx.getFlags,
    getIdentity:ctx.getIdentity,onIdentityChange:ctx.onIdentityChange });
}

async function ensureArena(ctx, owner) {
  if (arena?.isGone()) arena = null;
  if (arena && !sameOwner(arenaOwner, owner)) {
    generation++; arena.dispose(); arena = null; arenaOwner = null;
  }
  if (arena) return arena;
  if (building && !sameOwner(buildingOwner, owner)) { generation++; building = null; }
  if (!building) {
    const epoch = generation;
    buildingOwner = owner;
    const pending = chooseAdapter(ctx)
      .then(adapter => {
        if (epoch !== generation || !sameOwner(owner, captureOwner(ctx))) { adapter.dispose(); return null; }
        let next;
        next = createPanel(ctx, adapter, () => { if (arena === next) { arena = null; arenaOwner = null; } });
        arena = next; arenaOwner = owner;
        return arena;
      })
      .finally(() => { if (building === pending) { building = null; buildingOwner = null; } });
    building = pending;
  }
  return building;
}

export async function openArena(ctx={}) {
  const owner = captureOwner(ctx), request = ++openRequest, duelId = ctx.duelId;
  if (!owner) return;
  const panel = await ensureArena(ctx, owner);
  if (request !== openRequest || panel !== arena || !sameOwner(owner, captureOwner(ctx))) return;
  const result = await panel?.open(duelId);
  if (request === openRequest && panel === arena && sameOwner(owner, captureOwner(ctx))) return result;
}

// True while the panel's dialog is open. False before the first opening, after it closed, and
// after the game shut it down.
export const isArenaOpen = () => Boolean(arena && !arena.isGone() && arena.element.open);

// Ordinary close cancels late openings while retaining the adapter's unfinished action UID.
export function closeArena() {
  generation++; openRequest++; building = null; buildingOwner = null;
  arena?.close();
}

// Release the panel when its owning game is disposed.
export function disposeArena() {
  generation++; openRequest++;
  building = null; buildingOwner = null;
  arena?.dispose();
  arena = null; arenaOwner = null;
}
