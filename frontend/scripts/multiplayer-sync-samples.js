// Pure multiplayer QA metrics. Initial extraction retains the old sampling policy for the red proof.
export function compareSyncSamples(left, right) {
  const byTick = new Map(right.map(item => [item.ticks, item]));
  const size = list => list.split(',').filter(Boolean).length;
  let checked = 0, same = 0, worst = 0, sameBoarders = 0, worstBoarders = 0, withBoarders = 0;
  const pairs = [];
  for (const sample of left.filter((_, index) => index % 10 === 0)) {
    const other = byTick.get(sample.ticks) ?? byTick.get(sample.ticks - 1) ?? byTick.get(sample.ticks + 1);
    if (!other) continue;
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
