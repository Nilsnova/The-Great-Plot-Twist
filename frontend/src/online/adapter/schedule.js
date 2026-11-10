// Polling is a clock-driven model. The adapter owns requests and calls mark when each read completes.
// Only /api/config is polled; the case, world and crew reads left with the mystery on 10 Nov (D031).
const backoff = [5000, 15000, 30000];
const resources = ['config'];

export function createRefreshSchedule({now = Date.now} = {}) {
  const started = now();
  const reads = Object.fromEntries(resources.map(kind => [kind, {at: null, failures: 0}]));
  let hidden = false;

  function remaining(kind) {
    if (hidden || !Object.hasOwn(reads, kind)) return Infinity;
    const read = reads[kind];
    if (read.failures >= 4) return Infinity;
    const delay = read.failures ? backoff[Math.min(read.failures, 3) - 1] : 300000;
    const next = read.at === null ? started : read.at + delay;
    return Math.max(0, next - now());
  }

  function mark(kind, {ok = true} = {}) {
    if (!Object.hasOwn(reads, kind)) return;
    const read = reads[kind];
    read.at = now();
    read.failures = ok ? 0 : Math.min(4, read.failures + 1);
  }

  return {
    due: kind => remaining(kind) === 0,
    mark,
    remaining,
    reset(kind) { if (Object.hasOwn(reads, kind)) reads[kind] = {at: null, failures: 0}; },
    setHidden: value => { hidden = Boolean(value); },
  };
}
