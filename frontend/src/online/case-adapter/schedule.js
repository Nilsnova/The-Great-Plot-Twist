// Polling is a clock-driven model. The adapter owns requests and calls mark when each read completes.
const backoff = [5000, 15000, 30000];
const resources = ['config', 'world', 'case', 'crew'];

export function createRefreshSchedule({now = Date.now, random = Math.random} = {}) {
  const started = now();
  const reads = Object.fromEntries(resources.map(kind => [kind, {at: null, failures: 0}]));
  let hidden = false;
  let realtime = false;
  let crewFormingOpen = false;
  let caseRequestedAt = Infinity;

  function interval(kind) {
    if (kind === 'config') return 300000;
    if (kind === 'world') return 60000;
    if (kind === 'case') return realtime ? 30000 : 5000;
    return 5000;
  }

  function remaining(kind) {
    if (hidden || !Object.hasOwn(reads, kind) || (kind === 'crew' && !crewFormingOpen)) return Infinity;
    const read = reads[kind];
    const delay = read.failures ? backoff[Math.min(read.failures, 3) - 1] : interval(kind);
    let next = read.at === null ? started : read.at + delay;
    if (kind === 'case' && !read.failures) next = Math.min(next, caseRequestedAt);
    if (kind === 'case' && read.at !== null) next = Math.max(next, read.at + 5000);
    return Math.max(0, next - now());
  }

  function mark(kind, {ok = true} = {}) {
    if (!Object.hasOwn(reads, kind)) return;
    const read = reads[kind];
    read.at = now();
    read.failures = ok ? 0 : Math.min(3, read.failures + 1);
    if (kind === 'case') caseRequestedAt = Infinity;
  }

  function configure(options = {}) {
    if (typeof options.realtime === 'boolean') realtime = options.realtime;
    if (typeof options.crewFormingOpen === 'boolean') crewFormingOpen = options.crewFormingOpen;
  }

  function requestCase({version, writeRevision, remainingSeconds} = {}) {
    if (Number.isFinite(version) && Number.isFinite(writeRevision) && version > writeRevision) {
      caseRequestedAt = Math.min(caseRequestedAt, now());
    }
    if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) return;
    const sample = random();
    const jitter = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) * 2000 : 0;
    caseRequestedAt = Math.min(caseRequestedAt, now() + remainingSeconds * 1000 + jitter);
  }

  return {
    due: kind => remaining(kind) === 0,
    mark,
    remaining,
    configure,
    requestCase,
    setHidden: value => { hidden = Boolean(value); },
  };
}
