// Readonly combat snapshots drive the existing core landmark; this never changes sim HP.
const key = value => typeof value === 'string' && value.length > 0;
const validEpoch = value => value === null || key(value);

export function createCoreState() {
  let context = null, current = null;

  function reset(contextKey) {
    context = key(contextKey) ? contextKey : null;
    current = null;
  }

  function accept(snapshot, expected) {
    if (!snapshot || !expected || !context || expected.contextKey !== context
        || snapshot.contextKey !== context || !key(expected.waveId)
        || snapshot.waveId !== expected.waveId || !validEpoch(expected.epoch)
        || snapshot.epoch !== expected.epoch || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0
        || !Number.isFinite(snapshot.hp) || !Number.isFinite(snapshot.max)
        || snapshot.max <= 0 || snapshot.hp < 0 || snapshot.hp > snapshot.max) return false;
    const sameWave = current?.waveId === snapshot.waveId;
    if (sameWave && (snapshot.tick < current.tick || (current.hp === 0 && snapshot.hp > 0))) return false;
    const {waveId, contextKey, epoch, tick, hp, max} = snapshot;
    current = Object.freeze({waveId, contextKey, epoch, tick, hp, max,
      frame: hp === 0 ? 'island_core_broken' : hp / max < .5 ? 'island_core_damaged' : 'island_core'});
    return true;
  }

  return {reset, accept, get current() { return current; }};
}
