// A boss finisher's input on this screen (docs/GAME-V3.md §4.3), as plain rules: no DOM, no timers.
// The scene (scene.js) says what the player does now; the recorder keeps one value per sample (100 ms of
// the finisher's own clock) and hands out windows ({from, marks}) for finisher_input messages:
//   - a sample keeps the first press made in it (a crosshair shot, an arrow); a continuous task (the haul's
//     needle) fills every sample that passed with the needle's place;
//   - a window goes out once `windowMs` passed since the last (max(500 ms, 2 × the room's wave gap), so ten
//     players stay in the room's budget) or when the task's samples are all past, at most 24 samples each;
//   - a window of a press task with nothing pressed in it is not sent (it would change nothing).
import { FINISHER, holdsNeedle, windowMsFor } from './rules.js';

export function createFinisherRecorder({ players = 1, gapMs = 200 } = {}) {
  const values = new Map();
  let sent = 0, sentAt = -Infinity, filled = 0;
  const windowMs = windowMsFor(players, gapMs);
  return {
    get windowMs() { return windowMs; },
    get sent() { return sent; },
    /** A press in `sample` (the first one in a sample counts). */
    press(sample, value) { if (Number.isInteger(sample) && sample >= sent && !values.has(sample)) values.set(sample, value); },
    /** A continuous value (the needle) for every sample before `upTo` not yet filled. */
    fill(upTo, value) { for (let s = Math.max(filled, sent); s < upTo; s++) if (!values.has(s)) values.set(s, value); filled = Math.max(filled, upTo); },
    /**
     * The windows due now: samples before `sample` (the current one is still open), in tasks
     * ([{from, to, task}]). force: send what is left (the tasks are over).
     */
    take(nowMs, sample, tasks = [], { force = false } = {}) {
      if (!force && nowMs - sentAt < windowMs) return [];
      const inTask = s => tasks.some(item => s >= item.from && s < item.to);
      const out = [];
      // Skip the samples before the first task (the title card): nothing to say for them.
      const first = tasks.length ? Math.min(...tasks.map(item => item.from)) : 0;
      if (sent < first) sent = first;
      while (sent < sample) {
        const from = sent, to = Math.min(sample, from + FINISHER.marks), marks = [];
        for (let s = from; s < to; s++) marks.push(inTask(s) ? values.get(s) ?? -1 : -1);
        sent = to;
        for (let s = from; s < to; s++) values.delete(s);
        const task = tasks.find(item => from >= item.from && from < item.to)?.task ?? null;
        if (marks.some(value => value >= 0) || holdsNeedle(task)) out.push({ from, marks }); // the needle (haul, rescue) counts every sample
      }
      if (out.length) sentAt = nowMs;
      return out;
    },
  };
}
