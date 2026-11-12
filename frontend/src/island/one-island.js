// "One island only" (docs/GAME-V3.md §2): while it is on, the sea chart and the travel to the Harbor and
// Pirate Point leave the Menu and the goals; the Harbor comes back later as a building on the island
// (lane P). The old travel code stays and still works with the flag off. Plain rules, no DOM.
//
// ON by default in code. /api/config may send flags.one_island = false to bring travel back, and
// ?oneisland=0 does the same for one tab (checks of the old paths). It only matters while the island game
// is on: with the islands off (or for a player who came with the class code) travel is as before.
export const ONE_ISLAND_DEFAULT = true;
let readFlags = () => null;

// game.js hands in the flags of /api/config once the online services know them.
export function setOneIslandFlags(reader) {
  readFlags = typeof reader === 'function' ? reader : () => null;
}

export function oneIsland({search = globalThis.location?.search ?? '', flags} = {}) {
  try {
    const wanted = new URLSearchParams(search).get('oneisland');
    if (wanted === '0') return false;
    if (wanted === '1') return true;
  } catch { /* A bad address keeps the default. */ }
  let known = flags;
  if (known === undefined) { try { known = readFlags(); } catch { known = null; } }
  if (known && typeof known.one_island === 'boolean') return known.one_island;
  return ONE_ISLAND_DEFAULT;
}

// Whether the sea chart (Menu › Sea chart, the M key, the gamepad) may open: always with the islands off
// or for a class-code player; otherwise only while one_island is off.
export function travelAllowed({islandsMode = 'off', classHarbor = false, ...rest} = {}) {
  if (!islandsMode || islandsMode === 'off' || classHarbor) return true;
  return !oneIsland(rest);
}
