// One non-secret UID per player action; callers retain that UID across uncertain retries.
export function createUidFactory({random = Math.random, now = Date.now} = {}) {
  let sequence = 0;
  return () => {
    sequence += 1;
    const clock = now();
    const timestamp = Number.isFinite(clock) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(clock))) : 0;
    const sample = random();
    const bounded = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
    const entropy = Math.floor(bounded * Number.MAX_SAFE_INTEGER).toString(36);
    return `action-${timestamp.toString(36)}-${sequence.toString(36)}-${entropy}`;
  };
}
