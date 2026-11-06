// A fake clock proves polling, push reads, completion jitter and hidden-tab behavior without timers.
import {beforeEach, describe, expect, it} from 'vitest';
import {createRefreshSchedule} from '../src/online/case-adapter/schedule.js';

let time;
let schedule;
beforeEach(() => {
  time = 0;
  schedule = createRefreshSchedule({now: () => time, random: () => 0.5});
});

describe('refresh schedule', () => {
  it('uses independent config, world and realtime case intervals', () => {
    schedule.configure({realtime: true});
    for (const kind of ['config', 'world', 'case']) {
      expect(schedule.due(kind)).toBe(true);
      schedule.mark(kind);
    }
    expect(schedule.remaining('config')).toBe(300000);
    expect(schedule.remaining('world')).toBe(60000);
    expect(schedule.remaining('case')).toBe(30000);
    time = 30000;
    expect(schedule.due('case')).toBe(true);
    expect(schedule.due('world')).toBe(false);
  });

  it('falls back to five seconds when realtime is off', () => {
    schedule.mark('case');
    expect(schedule.remaining('case')).toBe(5000);
    schedule.configure({realtime: true});
    expect(schedule.remaining('case')).toBe(30000);
    schedule.configure({realtime: false});
    time = 5000;
    expect(schedule.due('case')).toBe(true);
  });

  it('polls a forming crew only while its screen is open', () => {
    expect(schedule.due('crew')).toBe(false);
    schedule.configure({crewFormingOpen: true});
    expect(schedule.due('crew')).toBe(true);
    schedule.mark('crew');
    expect(schedule.remaining('crew')).toBe(5000);
    schedule.configure({crewFormingOpen: false});
    expect(schedule.remaining('crew')).toBe(Infinity);
  });

  it('pauses all polling while hidden and resumes due reads', () => {
    schedule.setHidden(true);
    for (const kind of ['config', 'world', 'case', 'crew']) expect(schedule.due(kind)).toBe(false);
    time = 120000;
    schedule.setHidden(false);
    expect(schedule.due('world')).toBe(true);
  });

  it('uses bounded completion jitter and never reads a case more often than five seconds', () => {
    schedule.configure({realtime: true});
    schedule.mark('case');
    schedule.requestCase({remainingSeconds: 0});
    expect(schedule.remaining('case')).toBe(5000);
    time = 5000;
    schedule.mark('case');
    time = 15000;
    schedule.requestCase({remainingSeconds: 0});
    expect(schedule.remaining('case')).toBe(1000);
    time = 16000;
    expect(schedule.due('case')).toBe(true);
  });

  it('reads a newer pushed revision but ignores an old push', () => {
    schedule.configure({realtime: true});
    schedule.mark('case');
    time = 10000;
    schedule.requestCase({version: 2, writeRevision: 2});
    expect(schedule.due('case')).toBe(false);
    schedule.requestCase({version: 3, writeRevision: 2});
    expect(schedule.due('case')).toBe(true);
  });

  it('does not postpone the earliest completion when a later one arrives', () => {
    schedule.configure({realtime: true});
    schedule.mark('case');
    schedule.requestCase({remainingSeconds: 10});
    schedule.requestCase({remainingSeconds: 20});
    expect(schedule.remaining('case')).toBe(11000);
  });

  it('backs off failed reads by five, fifteen and thirty seconds and resets on success', () => {
    for (const expected of [5000, 15000, 30000, 30000]) {
      schedule.mark('world', {ok: false});
      expect(schedule.remaining('world')).toBe(expected);
      time += expected;
    }
    schedule.mark('world');
    expect(schedule.remaining('world')).toBe(60000);
  });

  it.each([0, 1])('keeps completion jitter within bounds with random %s', sample => {
    time = 10000;
    const clock = createRefreshSchedule({now: () => time, random: () => sample});
    clock.configure({realtime: true});
    clock.mark('case');
    time += 10000;
    clock.requestCase({remainingSeconds: 0});
    expect(clock.remaining('case')).toBe(sample * 2000);
  });

  it('preserves failure backoff even when another case push arrives', () => {
    schedule.mark('case', {ok: false});
    time = 5000;
    schedule.mark('case', {ok: false});
    schedule.requestCase({version: 2, writeRevision: 1});
    expect(schedule.remaining('case')).toBe(15000);
  });

  it('ignores unknown resource names and malformed completion values', () => {
    expect(schedule.remaining('other')).toBe(Infinity);
    expect(schedule.remaining('__proto__')).toBe(Infinity);
    schedule.mark('other');
    schedule.configure({realtime: true});
    schedule.mark('case');
    schedule.requestCase({remainingSeconds: NaN});
    expect(schedule.remaining('case')).toBe(30000);
  });
});
