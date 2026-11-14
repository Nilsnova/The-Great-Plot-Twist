// "One island only" (docs/GAME-V3.md §2): while it is on, the sea chart and the travel to the Harbor and
// Pirate Point leave the Menu and the goals; the Harbor is a building on the island that opens after wave 4
// (src/island/spots.js CAMPAIGN_BUILDINGS, GAME-V3.md §4.1). The old travel code stays and still works with the
// flag off. Plain rules, no DOM.
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

// The chip at the top left while you are in somebody else's game. With travel (one_island off) it is the old
// visit: "Visiting Gull's island · ISLE-FR3ND" with Sail home. With one island a game is shared, so nobody is
// visiting and there is no home to sail to: "Gull's game · ISLE-FR3ND" with Players (the game's lobby).
export function visitChip({ownerName = '', code = '', travel = false} = {}) {
  const name = typeof ownerName === 'string' ? ownerName.trim() : '';
  if (travel) return {text: `Visiting ${name || 'a friend'}'s island · ${code}`, label: 'Sail home', action: 'home'};
  return {text: `${visitName({ownerName: name})} · ${code}`, label: 'Players', action: 'lobby'};
}

// The name of somebody else's game for the arrival banner, in the chip's own words without the code:
// "Gull's game" ("A friend's game" while the host's name is not known yet). With travel it stays a visit
// of their island: "Gull's island".
export function visitName({ownerName = '', travel = false} = {}) {
  const name = typeof ownerName === 'string' ? ownerName.trim() : '';
  return `${name || 'A friend'}'s ${travel ? 'island' : 'game'}`;
}
