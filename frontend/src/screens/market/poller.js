// Runs the panel's refreshes on a timer: the board every 30 seconds, the portfolio every 15 while its tab is shown.
// It waits for a run to finish before it waits for the next one, stays quiet while the page is hidden
// and runs everything at once when the page is shown again. No DOM: the panel passes in what it needs.
// Used by: panel.js.
//
//   createPoller({ tasks: [{ name, everyMs, run, enabled }], isHidden, watchVisibility })
//   start() runs every enabled task now and keeps going (calling it again just refreshes); runNow(name) runs one (or all) now; stop() ends it.

export function createPoller({ tasks, isHidden = () => false, watchVisibility = () => () => {} }) {
  const timers = new Map();
  const running = new Set();
  let started = false;
  let stopWatching = null;

  const isEnabled = task => !task.enabled || task.enabled();

  async function run(task) {
    if (running.has(task.name)) return;
    running.add(task.name);
    try { await task.run(); } catch { /* A failed refresh is the session's business. Polling carries on. */ } finally { running.delete(task.name); }
  }

  function schedule(task) {
    clearTimeout(timers.get(task.name));
    timers.set(task.name, setTimeout(async () => {
      if (!isHidden() && isEnabled(task)) await run(task);
      if (started) schedule(task);
    }, task.everyMs));
  }

  function runNow(name) {
    if (!started || isHidden()) return;
    for (const task of tasks) {
      if ((name && task.name !== name) || !isEnabled(task)) continue;
      run(task);
      schedule(task);
    }
  }

  return {
    // Safe to call again: it only refreshes at once. The panel does so when it is opened again
    // before the close of the last visit has finished.
    start() {
      if (!started) {
        started = true;
        stopWatching = watchVisibility(() => runNow());
        tasks.forEach(schedule);
      }
      runNow();
    },
    runNow,
    stop() {
      started = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      stopWatching?.();
      stopWatching = null;
    },
  };
}
