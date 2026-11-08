// Observe the browser's actual send clock; automation IPC arrival times can bunch valid frames.
// Only numeric cosmetic timing leaves the page. Tokens, topics, IDs and raw frames are discarded.
import assert from 'node:assert/strict';

export function assertPresenceSendTiming(timing, delivered) {
  assert.ok(timing && !timing.overflow, 'The actual browser send observation is complete');
  const samples = timing.records, bySequence = new Map(samples.map(sample => [sample.seq, sample]));
  assert.equal(bySequence.size, samples.length, 'Each browser emission has a distinct cosmetic sequence');
  for (const sample of samples) {
    assert.deepEqual(Object.keys(sample).sort(), ['at', 'everyMs', 'monotonicAt', 'moving', 'seq'],
      'Only numeric send timing and a movement flag leave the page');
    assert.ok(Number.isFinite(sample.at) && Number.isFinite(sample.monotonicAt), 'Send clocks are finite');
  }
  for (const sample of delivered) {
    const observed = bySequence.get(sample.seq);
    assert.ok(observed && observed.everyMs === sample.everyMs && observed.moving === sample.moving,
      'Every intercepted cosmetic position matches an observed browser emission');
  }
  const gaps = [], monotonicGaps = [];
  for (let index = 1; index < samples.length; index++) {
    const gap = samples[index].at - samples[index - 1].at;
    assert.ok(gap >= 500, 'Actual browser sends respect the unchanged 500 ms allowance');
    assert.ok(samples[index].seq > samples[index - 1].seq, 'Outbound cosmetic sequence increases');
    gaps.push(gap); monotonicGaps.push(samples[index].monotonicAt - samples[index - 1].monotonicAt);
  }
  const minimum = values => values.length ? Math.min(...values) : null;
  return {browserEmissions: samples.length, minimumBrowserSendGapMs: minimum(gaps),
    minimumBrowserMonotonicGapMs: minimum(monotonicGaps),
    minimumEndpointArrivalGapMs: minimum(delivered.slice(1).map((sample, index) => sample.at - delivered[index].at))};
}

export async function observePresenceSends(page) {
  await page.addInitScript(() => {
    const records = [], wrapped = new WeakSet();
    let overflow = false;
    const decoder = new TextDecoder();
    function cosmetic(data) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
        : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
      if (!bytes || bytes.length < 7 || bytes[0] !== 3 || bytes[6] !== 1) return null;
      let offset = 7, event = null;
      for (let index = 1; index <= 5; index++) {
        const size = bytes[index];
        if (offset + size > bytes.length) return null;
        if (index === 4) event = decoder.decode(bytes.subarray(offset, offset + size));
        offset += size;
      }
      if (event !== 'position' || bytes.length - offset > 8192) return null;
      const body = JSON.parse(decoder.decode(bytes.subarray(offset)));
      if (body?.v !== 1 || !Number.isSafeInteger(body.seq) || !Number.isFinite(body.everyMs)
        || typeof body.moving !== 'boolean') return null;
      return {seq: body.seq, everyMs: body.everyMs, moving: body.moving};
    }
    function wrap(Socket) {
      const prototype = Socket?.prototype;
      if (!prototype || wrapped.has(prototype) || typeof prototype.send !== 'function') return;
      wrapped.add(prototype);
      const original = prototype.send;
      prototype.send = function(data) {
        let sample = null;
        try { sample = cosmetic(data); } catch { /* Noncosmetic frames are never retained. */ }
        const at = Date.now(), monotonicAt = performance.now();
        const result = original.apply(this, arguments);
        if (sample) {
          if (records.length >= 512) overflow = true;
          else records.push({...sample, at, monotonicAt});
        }
        return result;
      };
    }
    // Either init-script order is safe: keep observing when Playwright installs its routed socket.
    let Socket = globalThis.WebSocket;
    wrap(Socket);
    Object.defineProperty(globalThis, 'WebSocket', {configurable: true,
      get: () => Socket, set: next => { Socket = next; wrap(next); }});
    Object.defineProperty(globalThis, '__g9PresenceSendTiming', {configurable: true,
      value: () => ({overflow, records: records.map(record => ({...record}))})});
  });
}

export async function readPresenceSendTiming(page) {
  return page.evaluate(() => globalThis.__g9PresenceSendTiming?.() ?? null);
}
