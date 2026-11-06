// Lantern Duels, how often the screen asks the server (docs/INTERFACES.md, polling numbers):
// every 5 s for 2 minutes after an action, then every 30 s, and nothing after 10 quiet minutes.
// A fake clock stands in for time and a fake "ask" stands in for the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAST_MS, SLOW_MS, FAST_WINDOW_MS, QUIET_LIMIT_MS, MAX_WAIT_MS, pollMode, pollDelay, createPoller,
} from '../src/screens/duels/poll.js';

const SECOND = 1000, MINUTE = 60 * SECOND;

describe('the poll schedule', () => {
  it('keeps the agreed numbers', () => {
    expect([FAST_MS, SLOW_MS, FAST_WINDOW_MS, QUIET_LIMIT_MS, MAX_WAIT_MS]).toEqual([5 * SECOND, 30 * SECOND, 2 * MINUTE, 10 * MINUTE, MINUTE]);
  });

  it.each([[0, 'fast'], [2 * MINUTE - 1, 'fast'], [2 * MINUTE, 'slow'], [10 * MINUTE - 1, 'slow'], [10 * MINUTE, 'paused']])(
    'is %i ms after the last activity: %s', (quiet, mode) => { expect(pollMode(quiet)).toBe(mode); });

  it('waits 5 s in the fast window and 30 s after it', () => {
    expect([pollDelay('fast'), pollDelay('slow')]).toEqual([5 * SECOND, 30 * SECOND]);
  });

  it.each([[1, 10 * SECOND], [2, 20 * SECOND], [3, 40 * SECOND], [4, MINUTE], [9, MINUTE]])(
    'doubles the wait after %i failures, up to a minute', (failures, wait) => {
      expect(pollDelay('fast', { failures })).toBe(wait);
    });

  it('waits Retry-After seconds after a 429 and never less than the normal interval', () => {
    expect(pollDelay('fast', { retryAfterMs: 20 * SECOND })).toBe(20 * SECOND);
    expect(pollDelay('fast', { retryAfterMs: SECOND })).toBe(5 * SECOND);
  });
});

describe('the poller', () => {
  let ask, poller, modes;
  const nothingNew = async () => ({ changed: false });

  beforeEach(() => {
    vi.useFakeTimers();
    modes = [];
    ask = vi.fn(nothingNew);
    poller = createPoller({ ask, now: () => Date.now(), onMode: mode => modes.push(mode) });
  });
  afterEach(() => {
    poller.dispose();
    vi.useRealTimers();
  });
  const wait = ms => vi.advanceTimersByTimeAsync(ms);

  it('asks at once when it is shown', async () => {
    await poller.setVisible(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('asks 24 times in the first two minutes, one every 5 s', async () => {
    await poller.setVisible(true);
    await wait(2 * MINUTE - 1);
    expect(ask).toHaveBeenCalledTimes(24);
  });

  it('asks 40 times in ten quiet minutes and then stops', async () => {
    await poller.setVisible(true);
    await wait(10 * MINUTE - 1);
    expect(ask).toHaveBeenCalledTimes(40);
    await wait(30 * MINUTE);
    expect(ask).toHaveBeenCalledTimes(40);
  });

  it('reports fast, slow and then paused', async () => {
    await poller.setVisible(true);
    await wait(10 * MINUTE);
    expect([...new Set(modes)]).toEqual(['fast', 'slow', 'paused']);
  });

  it('never asks while the page is hidden', async () => {
    await poller.setVisible(true);
    await poller.setVisible(false);
    await wait(20 * MINUTE);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(poller.mode).toBe('off');
  });

  it('asks once and starts the fast window again when shown after a long pause', async () => {
    await poller.setVisible(true);
    await poller.setVisible(false);
    await wait(30 * MINUTE);
    await poller.setVisible(true);
    expect(ask).toHaveBeenCalledTimes(2);
    await wait(5 * SECOND);
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it('ignores a second "shown" while it is already shown', async () => {
    await poller.setVisible(true);
    await poller.setVisible(true);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('restarts the fast window when the player acts', async () => {
    await poller.setVisible(true);
    await wait(5 * MINUTE);
    const before = ask.mock.calls.length;
    await poller.kick();
    expect(ask).toHaveBeenCalledTimes(before + 1);
    await wait(5 * SECOND);
    expect(ask).toHaveBeenCalledTimes(before + 2);
  });

  it('counts a change in the list as activity', async () => {
    await poller.setVisible(true);
    await wait(5 * MINUTE);
    ask.mockImplementationOnce(async () => ({ changed: true }));
    await wait(SLOW_MS);
    const before = ask.mock.calls.length;
    await wait(5 * SECOND);
    expect(ask).toHaveBeenCalledTimes(before + 1);
  });

  it('waits for Retry-After after a 429', async () => {
    ask.mockImplementationOnce(async () => ({ changed: false, retryAfterMs: 20 * SECOND }));
    await poller.setVisible(true);
    await wait(19 * SECOND);
    expect(ask).toHaveBeenCalledTimes(1);
    await wait(SECOND);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('doubles the wait after a failure and goes back to normal after a good answer', async () => {
    ask.mockImplementationOnce(async () => ({ failed: true })).mockImplementationOnce(async () => ({ failed: true }));
    await poller.setVisible(true);
    await wait(10 * SECOND - 1);
    expect(ask).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(ask).toHaveBeenCalledTimes(2);
    await wait(20 * SECOND);
    expect(ask).toHaveBeenCalledTimes(3);
    await wait(5 * SECOND);
    expect(ask).toHaveBeenCalledTimes(4);
  });

  it('asks one request at a time, even when kicked while an answer is awaited', async () => {
    let inFlight = 0, mostAtOnce = 0, release;
    ask.mockImplementation(() => {
      inFlight += 1;
      mostAtOnce = Math.max(mostAtOnce, inFlight);
      return new Promise(resolve => { release = () => { inFlight -= 1; resolve({ changed: false }); }; });
    });
    const shown = poller.setVisible(true);
    poller.kick();
    poller.kick();
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await shown;
    expect(mostAtOnce).toBe(1);
  });

  it('stops for good when the answer says to halt, and asks again only when kicked', async () => {
    ask.mockImplementationOnce(async () => ({ halt: true }));
    await poller.setVisible(true);
    await wait(10 * MINUTE);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(poller.mode).toBe('off');
    await poller.kick();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('does nothing after it is disposed', async () => {
    await poller.setVisible(true);
    poller.dispose();
    await wait(MINUTE);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
