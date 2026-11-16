// Sealed journal ordering for recovery-v1 waves. Used by durable wave transport before advancing a sim.

const MAX_SEQUENCE = 1_000_000_000;
const MAX_TICK = 18_000;
const MAX_PAGE_EVENTS = 256;

const validWatermark = value => Number.isInteger(value) && value >= 0 && value <= MAX_SEQUENCE;
const validTick = value => Number.isInteger(value) && value >= 0 && value <= MAX_TICK;

/** Collect pages for one fixed journal head and expose only complete, sealed replay prefixes. */
export function createWaveReplay() {
  let headSeq = null, sealedThroughTick = null;
  let previousHeadSeq = null, previousSeal = null;
  const events = new Map();

  function openPage(page) {
    if (!page || !validWatermark(page.headSeq) || !validTick(page.sealedThroughTick)) return false;
    if (headSeq === null) {
      headSeq = page.headSeq;
      sealedThroughTick = page.sealedThroughTick;
      return true;
    }
    if (page.headSeq === headSeq && page.sealedThroughTick === sealedThroughTick) return true;
    if (!complete() || page.headSeq < headSeq || page.sealedThroughTick < sealedThroughTick) return false;
    previousHeadSeq = headSeq;
    previousSeal = sealedThroughTick;
    headSeq = page.headSeq;
    sealedThroughTick = page.sealedThroughTick;
    return true;
  }

  function add(event) {
    if (headSeq === null || !event || !validWatermark(event.serverSeq) || event.serverSeq === 0
      || event.serverSeq > headSeq || !validTick(event.effectiveTick) || typeof event.type !== 'string'
      || !event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return false;
    if (previousHeadSeq !== null && event.serverSeq > previousHeadSeq && event.effectiveTick <= previousSeal) return false;
    const saved = events.get(event.serverSeq);
    if (saved) return JSON.stringify(saved) === JSON.stringify(event);
    events.set(event.serverSeq, Object.freeze({ ...event }));
    return true;
  }

  function addPage(page) {
    if (!Array.isArray(page?.events) || page.events.length > MAX_PAGE_EVENTS) return false;
    if (page.headSeq !== undefined) {
      if (!openPage(page)) return false;
    } else if (page.through !== headSeq
      || (page.headSeq !== undefined && page.headSeq !== headSeq)
      || (page.sealedThroughTick !== undefined && page.sealedThroughTick !== sealedThroughTick)) return false;
    return page.events.every(add);
  }

  function complete() {
    return headSeq !== null && events.size === headSeq;
  }

  function canAdvanceThrough(tick) {
    return complete() && validTick(tick) && tick <= sealedThroughTick;
  }

  function through(tick) {
    if (!canAdvanceThrough(tick)) return null;
    return [...events.values()]
      .filter(event => event.effectiveTick <= tick)
      .sort((a, b) => a.effectiveTick - b.effectiveTick || a.serverSeq - b.serverSeq);
  }

  return {
    openPage,
    add,
    addPage,
    complete,
    canAdvanceThrough,
    through,
    get headSeq() { return headSeq; },
    get sealedThroughTick() { return sealedThroughTick; },
    get size() { return events.size; },
  };
}

/** Advance a deterministic simulation callback only across a complete sealed replay prefix. */
export function createReplayDriver(replay) {
  let nextTick = 0;
  const applied = new Set();
  return {
    get nextTick() { return nextTick; },
    advanceThrough(tick, runTick) {
      if (typeof runTick !== 'function' || !replay?.canAdvanceThrough?.(tick) || tick < nextTick) return false;
      const queued = replay.through(tick).filter(event => !applied.has(event.serverSeq));
      const byTick = new Map();
      for (const event of queued) {
        if (event.effectiveTick < nextTick) return false;
        if (!byTick.has(event.effectiveTick)) byTick.set(event.effectiveTick, []);
        byTick.get(event.effectiveTick).push(event);
      }
      for (let current = nextTick; current <= tick; current++) {
        const events = byTick.get(current) ?? [];
        runTick(current, events);
        for (const event of events) applied.add(event.serverSeq);
      }
      nextTick = tick + 1;
      return true;
    },
  };
}

/** Fetch every page through the first page's fixed head before declaring the replay prefix usable. */
export async function fetchSealedEvents(replay, readPage, after = replay?.headSeq ?? 0) {
  if (typeof readPage !== 'function' || !validWatermark(after)) return false;
  const first = await readPage({ after });
  if (!first || !validWatermark(first.headSeq) || !validTick(first.sealedThroughTick)
    || first.headSeq < after || !Array.isArray(first.events)) return false;
  const fixedHead = first.headSeq;
  if (!replay.addPage(first)) return false;
  let cursor = after;
  if (!advanceCursor(first.events, cursor, fixedHead)) return false;
  cursor = first.events.at(-1)?.serverSeq ?? cursor;
  while (cursor < fixedHead) {
    const page = await readPage({ after: cursor, through: fixedHead });
    if (!page || page.through !== fixedHead || !Array.isArray(page.events)
      || !advanceCursor(page.events, cursor, fixedHead) || page.events.length === 0 || !replay.addPage(page)) return false;
    cursor = page.events.at(-1).serverSeq;
  }
  return replay.headSeq === fixedHead && replay.complete();
}

function advanceCursor(events, cursor, head) {
  if (events.length > MAX_PAGE_EVENTS) return false;
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.serverSeq !== cursor + i + 1 || events[i].serverSeq > head) return false;
  }
  return true;
}
