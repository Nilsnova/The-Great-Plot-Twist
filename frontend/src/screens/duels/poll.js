// How often the screen asks the server, and the timer that does it. The schedule is the one in
// docs/INTERFACES.md (polling numbers): every 5 s for 2 minutes after the panel opens, a click
// or a change, then every 30 s, and nothing after 10 quiet minutes. That is at most 40 calls for
// one open, quiet panel. It never asks while the page is hidden, and never two at once.
// `ask()` does the real request and answers { changed, failed, retryAfterMs, halt }.
// Used by: http-adapter.js and the tests (tests/duels-poll.test.js). No DOM, no network.

const SECOND = 1000;
export const FAST_MS = 5 * SECOND;
export const SLOW_MS = 30 * SECOND;
export const FAST_WINDOW_MS = 120 * SECOND;
export const QUIET_LIMIT_MS = 600 * SECOND;
export const MAX_WAIT_MS = 60 * SECOND;

// 'fast', 'slow' or 'paused', from how long nothing has happened.
export function pollMode(quietMs) {
  if (quietMs < FAST_WINDOW_MS) return 'fast';
  return quietMs < QUIET_LIMIT_MS ? 'slow' : 'paused';
}

// The wait before the next ask: doubled for every failure in a row (at most a minute), and at
// least Retry-After after a 429.
export function pollDelay(mode, { failures = 0, retryAfterMs = 0 } = {}) {
  const interval = mode === 'fast' ? FAST_MS : SLOW_MS;
  const afterFailures = Math.min(MAX_WAIT_MS, interval * 2 ** failures);
  return Math.max(afterFailures, retryAfterMs);
}

export function createPoller({ ask, now = Date.now, onMode }) {
  let timer = null, running = null, askAgain = false, visible = false, disposed = false;
  let lastActivity = 0, failures = 0, retryAfterMs = 0, mode = 'off';

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    onMode?.(next);
  }

  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  function scheduleNext() {
    stopTimer();
    if (disposed || !visible) return setMode('off');
    const next = pollMode(now() - lastActivity);
    setMode(next);
    if (next !== 'paused') timer = setTimeout(tick, pollDelay(next, { failures, retryAfterMs }));
  }

  // The timer fired. If ten quiet minutes have passed since the last activity, stop here.
  function tick() {
    timer = null;
    if (pollMode(now() - lastActivity) === 'paused') return setMode('paused');
    return run();
  }

  // Asks once, or again right away if someone asked for a fresh answer while we waited.
  function run() {
    stopTimer();
    if (running) {
      askAgain = true;
      return running;
    }
    running = (async () => {
      let halted = false;
      do {
        askAgain = false;
        let result;
        try { result = (await ask()) ?? {}; } catch { result = { failed: true }; }
        if (result.changed) lastActivity = now();
        failures = result.failed ? failures + 1 : 0;
        retryAfterMs = result.retryAfterMs ?? 0;
        halted = Boolean(result.halt);
      } while (askAgain && visible && !disposed);
      running = null;
      if (halted) setMode('off');
      else scheduleNext();
    })();
    return running;
  }

  // Something happened (the panel opened, a click, "Check now"): ask at once and start the fast window.
  function kick() {
    if (disposed || !visible) return Promise.resolve();
    lastActivity = now();
    failures = 0;
    retryAfterMs = 0;
    setMode('fast');
    return run();
  }

  function setVisible(value) {
    if (value === visible) return Promise.resolve();
    visible = value;
    if (value) return kick();
    stopTimer();
    setMode('off');
    return Promise.resolve();
  }

  function dispose() {
    disposed = true;
    stopTimer();
    setMode('off');
  }

  return { kick, setVisible, dispose, get mode() { return mode; } };
}
