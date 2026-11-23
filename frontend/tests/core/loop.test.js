// The frame loop must survive a frame that throws: before, one error in update() or render() meant the
// next frame was never asked for and the game stood still for good, with no message.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLoop, TROUBLE_FRAMES } from '../../src/core/loop.js';

function harness({ hidden = false } = {}) {
  let next = null, id = 0, time = 0;
  const doc = { hidden };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { now: () => time });
  vi.stubGlobal('requestAnimationFrame', run => { next = run; return ++id; });
  vi.stubGlobal('cancelAnimationFrame', () => { next = null; });
  return { doc, frame(ms = 16) { time += ms; const run = next; next = null; run?.(time); return next !== null; } };
}
afterEach(() => vi.unstubAllGlobals());

describe('the frame loop', () => {
  it('updates, then draws, with the time since the last frame (capped at 0.1 s)', () => {
    const h = harness(), calls = [];
    startLoop((delta, time) => calls.push(['update', Math.round(delta * 1000), Math.round(time * 1000)]), frameTime => calls.push(['render', frameTime]));
    h.frame(16); h.frame(500);
    expect(calls).toEqual([['update', 16, 16], ['render', 16], ['update', 100, 116], ['render', 516]]);
  });

  it('keeps running after a frame that throws, and reports the error once per run of bad frames', () => {
    const h = harness(), report = vi.fn();
    let frames = 0, bad = true;
    startLoop(() => { frames++; if (bad) throw new Error('boom'); }, () => {}, { report });
    for (let i = 0; i < 5; i++) expect(h.frame()).toBe(true); // the next frame is always asked for
    expect(frames).toBe(5);
    expect(report).toHaveBeenCalledTimes(1);
    bad = false; h.frame(); bad = true; h.frame();
    expect(report).toHaveBeenCalledTimes(2); // a new run of bad frames is reported again
  });

  it('still draws when the update throws, and survives a throwing draw too', () => {
    const h = harness(), render = vi.fn();
    startLoop(() => { throw new Error('update'); }, render, { report() {} });
    h.frame(); h.frame();
    expect(render).toHaveBeenCalledTimes(2);
    const h2 = harness(), update = vi.fn();
    startLoop(update, () => { throw new Error('render'); }, { report() {} });
    expect(h2.frame()).toBe(true); expect(h2.frame()).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('tells the game once after many bad frames in a row, and again says when it recovered', () => {
    const h = harness(), onTrouble = vi.fn(), onRecover = vi.fn();
    let bad = true;
    startLoop(() => { if (bad) throw new Error('boom'); }, () => {}, { onTrouble, onRecover, report() {} });
    for (let i = 0; i < TROUBLE_FRAMES - 1; i++) h.frame();
    expect(onTrouble).not.toHaveBeenCalled(); // a short hiccup is not worth a message
    h.frame();
    for (let i = 0; i < 100; i++) h.frame();
    expect(onTrouble).toHaveBeenCalledTimes(1);
    expect(onRecover).not.toHaveBeenCalled();
    bad = false; h.frame(); h.frame();
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it('a handler that throws does not stop the loop either', () => {
    const h = harness();
    startLoop(() => { throw new Error('boom'); }, () => {}, { report() { throw new Error('report'); }, onTrouble() { throw new Error('trouble'); } });
    for (let i = 0; i < TROUBLE_FRAMES + 2; i++) expect(h.frame()).toBe(true);
  });

  it('runs no frame work in a hidden tab, but keeps asking for frames; stop cancels', () => {
    const h = harness({ hidden: true }), update = vi.fn();
    const stop = startLoop(update, () => {});
    expect(h.frame()).toBe(true);
    expect(update).not.toHaveBeenCalled();
    h.doc.hidden = false; h.frame();
    expect(update).toHaveBeenCalledTimes(1);
    stop();
    expect(h.frame()).toBe(false);
  });
});
