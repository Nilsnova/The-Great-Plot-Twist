// Sealed journal ordering for recovery-v1 waves. Used by durable wave transport before advancing a sim.

const MAX_SEQUENCE = 1_000_000_000;
const MAX_TICK = 18_000;
const MAX_PAGE_EVENTS = 256;

const validWatermark = value => Number.isInteger(value) && value >= 0 && value <= MAX_SEQUENCE;
const validTick = value => Number.isInteger(value) && value >= 0 && value <= MAX_TICK;
const validSeal = value => Number.isInteger(value) && value >= -1 && value <= MAX_TICK;

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function freezeTree(value) {
  if (!value || typeof value !== 'object') return value;
  for (const item of Object.values(value)) freezeTree(item);
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const fields = Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function validEvent(event, headSeq) {
  return !!event && typeof event === 'object' && !Array.isArray(event)
    && validWatermark(event.serverSeq) && event.serverSeq > 0 && event.serverSeq <= headSeq
    && validTick(event.effectiveTick) && typeof event.type === 'string'
    && !!event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload);
}

/** Collect complete pages at a fixed head and expose only whole sealed prefixes. */
export function createWaveReplay() {
  let headSeq = null, sealedThroughTick = null, previousHeadSeq = null, previousSeal = null, contiguousSeq = 0;
  const events = new Map();

  function complete() {
    return headSeq !== null && contiguousSeq === headSeq;
  }

  function addPage(page) {
    if (!Array.isArray(page?.events) || page.events.length > MAX_PAGE_EVENTS) return false;
    const firstPage = headSeq === null;
    const nextRound = !firstPage && complete();
    let nextHead = headSeq, nextSeal = sealedThroughTick, nextPreviousHead = previousHeadSeq, nextPreviousSeal = previousSeal;

    if (firstPage || nextRound) {
      if (!validWatermark(page.headSeq) || !validSeal(page.sealedThroughTick)) return false;
      if (nextRound && (page.headSeq < headSeq || page.sealedThroughTick < sealedThroughTick)) return false;
      if (nextRound) { nextPreviousHead = headSeq; nextPreviousSeal = sealedThroughTick; }
      nextHead = page.headSeq;
      nextSeal = page.sealedThroughTick;
    } else {
      if (page.headSeq !== undefined && page.headSeq !== headSeq) return false;
      if (page.sealedThroughTick !== undefined && page.sealedThroughTick !== sealedThroughTick) return false;
      if (page.through !== headSeq) return false;
    }

    const staged = new Map();
    for (const source of page.events) {
      if (!validEvent(source, nextHead)) return false;
      const copy = cloneJson(source);
      if (!copy) return false;
      if (nextPreviousHead !== null && copy.serverSeq > nextPreviousHead && copy.effectiveTick <= nextPreviousSeal) return false;
      const saved = staged.get(copy.serverSeq) ?? events.get(copy.serverSeq);
      if (saved && canonicalJson(saved) !== canonicalJson(copy)) return false;
      staged.set(copy.serverSeq, freezeTree(copy));
    }

    headSeq = nextHead;
    sealedThroughTick = nextSeal;
    previousHeadSeq = nextPreviousHead;
    previousSeal = nextPreviousSeal;
    for (const [sequence, event] of staged) if (!events.has(sequence)) events.set(sequence, event);
    while (events.has(contiguousSeq + 1)) contiguousSeq++;
    return true;
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
    addPage,
    complete,
    canAdvanceThrough,
    through,
    get headSeq() { return headSeq; },
    get sealedThroughTick() { return sealedThroughTick; },
    get contiguousSeq() { return contiguousSeq; },
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

/** Fetch every page through one fixed head; resume partial pages before opening a newer head. */
export async function fetchSealedEvents(replay, readPage, after) {
  if (typeof readPage !== 'function' || !replay || !Number.isInteger(replay.contiguousSeq)) return false;
  const alreadyComplete = replay.complete();
  const cursor = after ?? replay.contiguousSeq;
  if (!validWatermark(cursor) || cursor !== replay.contiguousSeq) return false;
  let page;
  let fixedHead, fixedSeal;

  if (replay.headSeq !== null && !alreadyComplete) {
    fixedHead = replay.headSeq;
    fixedSeal = replay.sealedThroughTick;
    if (!validWatermark(fixedHead) || !validSeal(fixedSeal)) return false;
    page = await readPage({ after: cursor, through: fixedHead, sealedThroughTick: fixedSeal });
    if (!page || page.through !== fixedHead || !Array.isArray(page.events) || !page.events.length
      || !advanceCursor(page.events, cursor, fixedHead) || !replay.addPage(page)) return false;
  } else {
    const requestAfter = replay.headSeq ?? 0;
    page = await readPage({ after: requestAfter });
    if (!page || !validWatermark(page.headSeq) || !validSeal(page.sealedThroughTick)
      || page.headSeq < requestAfter || !Array.isArray(page.events) || !advanceCursor(page.events, requestAfter, page.headSeq)
      || !replay.addPage(page)) return false;
    fixedHead = page.headSeq;
    fixedSeal = page.sealedThroughTick;
  }

  let next = page.events.at(-1)?.serverSeq ?? cursor;
  while (next < fixedHead) {
    page = await readPage({ after: next, through: fixedHead, sealedThroughTick: fixedSeal });
    if (!page || page.through !== fixedHead || !Array.isArray(page.events) || page.events.length === 0
      || !advanceCursor(page.events, next, fixedHead) || !replay.addPage(page)) return false;
    next = page.events.at(-1).serverSeq;
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
