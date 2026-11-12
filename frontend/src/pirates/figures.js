// Captain health and the presence figures (GAME-V3.md §3). Other players' figures are drawn by the presence
// system (src/world/others/), keyed by its opaque ids; the wave's sim keeps its own captains (the `by` of
// their room messages), with hp, the fall and the lobby colour their captain_move carries. The two meet the
// way lane H draws a fallen captain: by the lobby colour (unique in a game, 0-9), close to where the sim has
// that captain. Plain rules, no DOM or Three.js.
//
//   matchFigures({party, figures, mine})  -> Map(sim captain id -> figure {id, x, z, colour})
//   hiddenFigures(matches, party)         -> Set of figure ids to hide: the captain is down, and the wave
//                                            draws them lying in their ring
//   figurePositions(matches)              -> Map(sim captain id -> {x, z}): the hp bar sits over the figure

// A figure farther than this from its captain's sim position is somebody else (the sim hears a position
// every 0.5 s or so and the figure is interpolated, so a running captain can be a few units apart).
export const FIGURE_REACH = 6;

const isColour = value => Number.isInteger(value) && value >= 0 && value <= 9;
const isPoint = item => Number.isFinite(item?.x) && Number.isFinite(item?.z);

// Each present sim captain (not your own: you have no presence figure) is matched to at most one figure in
// its lobby colour within reach, the nearest first; each figure to at most one captain.
export function matchFigures({party = [], figures = [], mine = null, reach = FIGURE_REACH} = {}) {
  const pairs = [];
  for (const hero of Array.isArray(party) ? party : []) {
    if (!hero?.present || hero.id === mine || !isColour(hero.colour) || !isPoint(hero)) continue;
    for (const figure of Array.isArray(figures) ? figures : []) {
      if (!figure?.id || figure.colour !== hero.colour || !isPoint(figure)) continue;
      const distance = Math.hypot(figure.x - hero.x, figure.z - hero.z);
      if (distance <= reach) pairs.push({hero, figure, distance});
    }
  }
  pairs.sort((a, b) => a.distance - b.distance || String(a.hero.id).localeCompare(String(b.hero.id)) || String(a.figure.id).localeCompare(String(b.figure.id)));
  const matches = new Map(), used = new Set();
  for (const {hero, figure} of pairs) {
    if (matches.has(hero.id) || used.has(figure.id)) continue;
    matches.set(hero.id, figure); used.add(figure.id);
  }
  return matches;
}

export function hiddenFigures(matches, party = []) {
  const hidden = new Set();
  for (const hero of Array.isArray(party) ? party : []) {
    if (hero?.present && hero.down && matches?.has(hero.id)) hidden.add(matches.get(hero.id).id);
  }
  return hidden;
}

export function figurePositions(matches) {
  const at = new Map();
  for (const [id, figure] of matches ?? []) at.set(id, {x: figure.x, z: figure.z});
  return at;
}
