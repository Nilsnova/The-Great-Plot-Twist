// A fake clock proves config polling, failure backoff and hidden-tab behavior without timers.
import {beforeEach, describe, expect, it} from 'vitest';
import {createRefreshSchedule} from '../src/online/adapter/schedule.js';

let time;
let schedule;
beforeEach(() => {
  time = 0;
  schedule = createRefreshSchedule({now: () => time});
});

describe('refresh schedule', () => {
  it('reads config at once and then every five minutes', () => {
    expect(schedule.due('config')).toBe(true);
    schedule.mark('config');
    expect(schedule.remaining('config')).toBe(300000);
    time = 300000;
    expect(schedule.due('config')).toBe(true);
  });

  it('pauses polling while hidden and resumes a due read', () => {
    schedule.setHidden(true);
    expect(schedule.due('config')).toBe(false);
    time = 120000;
    schedule.setHidden(false);
    expect(schedule.due('config')).toBe(true);
  });

  it('backs off failed reads by five, fifteen and thirty seconds, stops after four and resets on success', () => {
    for (const expected of [5000, 15000, 30000]) {
      schedule.mark('config', {ok: false});
      expect(schedule.remaining('config')).toBe(expected);
      time += expected;
    }
    schedule.mark('config', {ok: false});
    expect(schedule.remaining('config')).toBe(Infinity);
    schedule.reset('config');
    schedule.mark('config');
    expect(schedule.remaining('config')).toBe(300000);
  });

  it('ignores unknown resource names, including the removed case, world and crew reads', () => {
    for (const kind of ['other', '__proto__', 'case', 'world', 'crew']) expect(schedule.remaining(kind)).toBe(Infinity);
    schedule.mark('case');
    expect(schedule.due('case')).toBe(false);
  });
});
