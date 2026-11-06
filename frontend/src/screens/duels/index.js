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

async function chooseAdapter(ctx) {
  const wantsPractice = import.meta.env.DEV && new URLSearchParams(location.search).get('arena') === 'local';
  if (wantsPractice) return (await import('./fake-adapter.js')).createFakeAdapter();
  return createHttpAdapter({ getToken: ctx.getToken });
}

async function ensureArena(ctx) {
  if (arena?.isGone()) arena = null;
  if (arena) return arena;
  if (!building) {
    const epoch = generation;
    const pending = chooseAdapter(ctx)
      .then(adapter => {
        if (epoch !== generation) { adapter.dispose(); return null; }
        arena = createPanel(ctx, adapter, () => { arena = null; });
        return arena;
      })
      .finally(() => { if (building === pending) building = null; });
    building = pending;
  }
  return building;
}

export async function openArena(ctx) {
  const panel = await ensureArena(ctx);
  panel?.open();
}

// True while the panel's dialog is open. False before the first opening, after it closed, and
// after the game shut it down.
export const isArenaOpen = () => Boolean(arena && !arena.isGone() && arena.element.open);

// Release the panel when its owning game is disposed.
export function disposeArena() {
  generation++;
  building = null;
  arena?.dispose();
  arena = null;
}
