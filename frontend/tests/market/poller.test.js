// The panel's refresh timer: board every 30 s, portfolio every 15 s while its tab is shown, quiet while hidden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller } from '../../src/screens/market/poller.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup({ boardTime = 0 } = {}) {
  const state = { hidden: false, positionsShown: true, listeners: new Set(), board: 0, portfolio: 0, running: 0, maxRunning: 0 };
  const track = name => async () => {
    state[name] += 1; state.running += 1; state.maxRunning = Math.max(state.maxRunning, state.running);
    if (name === 'board' && boardTime) await new Promise(resolve => setTimeout(resolve, boardTime));
    state.running -= 1;
  };
  const poller = createPoller({
    tasks: [
      { name: 'board', everyMs: 30000, run: track('board') },
      { name: 'portfolio', everyMs: 15000, run: track('portfolio'), enabled: () => state.positionsShown },
    ],
    isHidden: () => state.hidden,
    watchVisibility: listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
  });
  return { state, poller, show: () => { state.hidden = false; for (const listener of [...state.listeners]) listener(); }, hide: () => { state.hidden = true; for (const listener of [...state.listeners]) listener(); } };
}

describe('polling', () => {
  it('runs every enabled task at once when it starts', async () => {
    const { state, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect([state.board, state.portfolio]).toEqual([1, 1]);
    poller.stop();
  });

  it('asks for the board every 30 seconds and the portfolio every 15', async () => {
    const { state, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(14999);
    expect([state.board, state.portfolio]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(1);
    expect([state.board, state.portfolio]).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(15000);
    expect([state.board, state.portfolio]).toEqual([2, 3]);
    await vi.advanceTimersByTimeAsync(30000);
    expect([state.board, state.portfolio]).toEqual([3, 5]);
    poller.stop();
  });

  it('skips the portfolio while its tab is not shown, and runs it again as soon as asked', async () => {
    const { state, poller } = setup();
    state.positionsShown = false;
    poller.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect([state.board, state.portfolio]).toEqual([3, 0]);
    state.positionsShown = true;
    poller.runNow('portfolio');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.portfolio).toBe(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(state.portfolio).toBe(2);
    poller.stop();
  });

  it('runs nothing while the page is hidden, and everything at once when it is shown again', async () => {
    const { state, poller, hide, show } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    hide();
    await vi.advanceTimersByTimeAsync(120000);
    expect([state.board, state.portfolio]).toEqual([1, 1]);
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect([state.board, state.portfolio]).toEqual([2, 2]);
    await vi.advanceTimersByTimeAsync(15000);
    expect([state.board, state.portfolio]).toEqual([2, 3]);
    poller.stop();
  });

  it('runs a task at once on request, for the refresh after an action', async () => {
    const { state, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.runNow();
    await vi.advanceTimersByTimeAsync(0);
    expect([state.board, state.portfolio]).toEqual([2, 2]);
    poller.stop();
  });

  it('never runs the same task twice at the same time', async () => {
    const { state, poller } = setup({ boardTime: 45000 });
    poller.start();
    await vi.advanceTimersByTimeAsync(100000);
    expect(state.maxRunning).toBeLessThanOrEqual(2);
    expect(state.board).toBeLessThanOrEqual(2);
    poller.stop();
  });

  it('refreshes at once when started again while it is already running, without doubling its timers', async () => {
    const { state, poller } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect([state.board, state.portfolio]).toEqual([2, 2]);
    expect(vi.getTimerCount()).toBe(2);
    poller.stop();
  });

  it('stops for good, can start again and does not run twice for a second start in the same moment', async () => {
    const { state, poller, show } = setup();
    poller.start(); poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.board).toBe(1);
    poller.stop();
    await vi.advanceTimersByTimeAsync(120000);
    show();
    expect(state.listeners.size).toBe(0);
    expect([state.board, state.portfolio]).toEqual([1, 1]);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect([state.board, state.portfolio]).toEqual([2, 2]);
    poller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps going when a task throws', async () => {
    const calls = [];
    const poller = createPoller({
      tasks: [{ name: 'board', everyMs: 1000, run: async () => { calls.push('x'); throw new Error('network'); } }],
      isHidden: () => false, watchVisibility: () => () => {},
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(calls.length).toBe(4);
    poller.stop();
  });
});
