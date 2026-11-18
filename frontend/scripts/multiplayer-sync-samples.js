// Pure multiplayer QA metrics: every collected tick is distinct proof, never a reused frame.
function distinctSamples(rows, side) {
  if (!Array.isArray(rows)) throw new TypeError(`${side} samples must be an array.`);
  const distinct = new Map();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.ticks) || row.ticks < 0) throw new TypeError(`${side} sample has an invalid tick.`);
    for (const field of ['ships', 'boarders']) {
      const value = row[field];
      if (typeof value !== 'string') throw new TypeError(`${side} sample ${row.ticks} has invalid ${field}.`);
      const ids = value ? value.split(',') : [];
      if (ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length
          || [...ids].sort().join(',') !== value) throw new TypeError(`${side} sample ${row.ticks} has noncanonical ${field}.`);
    }
    const previous = distinct.get(row.ticks);
    if (previous && (previous.ships !== row.ships || previous.boarders !== row.boarders)) {
      throw new TypeError(`${side} has conflicting duplicate tick ${row.ticks}.`);
    }
    if (!previous) distinct.set(row.ticks, {ticks: row.ticks, ships: row.ships, boarders: row.boarders});
  }
  return distinct;
}

export function compareSyncSamples(left, right) {
  const source = [...distinctSamples(left, 'left').values()].sort((a, b) => a.ticks - b.ticks);
  const available = distinctSamples(right, 'right'), matched = [], nearby = [];
  const pair = (sample, other) => { matched.push([sample, other]); available.delete(other.ticks); };
  // Reserve exact matches globally before a neighboring tick can consume one.
  for (const sample of source) {
    const exact = available.get(sample.ticks);
    if (exact) pair(sample, exact); else nearby.push(sample);
  }
  for (const sample of nearby) {
    const other = available.get(sample.ticks - 1) ?? available.get(sample.ticks + 1);
    if (other) pair(sample, other);
  }
  matched.sort(([a], [b]) => a.ticks - b.ticks);
  const size = list => list.split(',').filter(Boolean).length;
  let checked = 0, same = 0, worst = 0, sameBoarders = 0, worstBoarders = 0, withBoarders = 0;
  const pairs = [];
  for (const [sample, other] of matched) {
    checked++;
    pairs.push({left: sample.ticks, right: other.ticks});
    if (other.ships === sample.ships) same++;
    if (other.boarders === sample.boarders) sameBoarders++;
    if (sample.boarders) withBoarders++;
    worst = Math.max(worst, Math.abs(size(other.ships) - size(sample.ships)));
    worstBoarders = Math.max(worstBoarders, Math.abs(size(other.boarders) - size(sample.boarders)));
  }
  return {checked, same, worst, sameBoarders, worstBoarders, withBoarders, pairs};
}
