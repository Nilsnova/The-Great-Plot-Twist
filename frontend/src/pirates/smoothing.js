// Drawing only (fix/playtest-1117): ships and boarders glide to each new sim position over `seconds` instead
// of stepping every 50 ms tick, or jumping several ticks at once when a slow frame or a journal read catches
// the sim up. A jump longer than `snap` units (a tab that caught up a long stretch) is drawn at once.
//   const smooth = createSmoother(() => clock);  smooth(item) -> item, or a copy at the drawn {x, z}
//   smooth.prune(aliveIds)                       forgets the ids no longer in the wave
export function createSmoother(clock, { seconds = .06, snap = 4 } = {}) {
  const entries = new Map(); // id -> {fx, fz, tx, tz, at}
  const glide = entry => {
    const k = Math.min(1, Math.max(0, (clock() - entry.at) / seconds));
    return { x: entry.fx + (entry.tx - entry.fx) * k, z: entry.fz + (entry.tz - entry.fz) * k };
  };
  function smooth(item) {
    if (!item || typeof item.id !== 'string' || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return item;
    let entry = entries.get(item.id);
    if (!entry) { entries.set(item.id, { fx: item.x, fz: item.z, tx: item.x, tz: item.z, at: clock() }); return item; }
    if (entry.tx !== item.x || entry.tz !== item.z) {
      const from = glide(entry), far = Math.hypot(item.x - from.x, item.z - from.z) > snap;
      entry.fx = far ? item.x : from.x; entry.fz = far ? item.z : from.z; entry.tx = item.x; entry.tz = item.z; entry.at = clock();
    }
    const at = glide(entry);
    return at.x === item.x && at.z === item.z ? item : { ...item, x: at.x, z: at.z };
  }
  smooth.prune = alive => { for (const id of entries.keys()) if (!alive.has(id)) entries.delete(id); };
  return smooth;
}
