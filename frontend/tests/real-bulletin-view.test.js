// Placeholder bulletin envelopes validate optional weather and observation mapping without story data.
import {describe, expect, it} from 'vitest';
import {validBulletinReply, onlineBulletinView, bulletinObservations} from '../src/online/case-adapter/bulletin-view.js';

import {recordedBulletin} from './fixtures/server/bulletin.js';

describe('real bulletin projection', () => {
  it('keeps absent weather sources and attribution null instead of inventing a forecast', () => {
    const body = recordedBulletin();
    expect(validBulletinReply(body)).toBe(true);
    expect(onlineBulletinView(body).weather).toEqual(body.weather);
  });
  it('accepts every supplied weather value and validates the tonight envelope', () => {
    const body = recordedBulletin();
    body.weather.tonight = {date: '2026-11-07', startsAt: body.day.publishedAt,
      endsAt: body.day.nextDayAt, state: 'fog', isNow: false, isFogNight: true, fogNightKind: 'almanac'};
    expect(validBulletinReply(body)).toBe(true);
    body.weather.tonight.isNow = 'yes';
    expect(validBulletinReply(body)).toBe(false);
  });
  it('maps a supplied public hook to a log observation and gives callers owned clones', () => {
    const body = recordedBulletin({hook: true}), view = onlineBulletinView(body);
    expect(bulletinObservations(view)).toEqual([{id: 'recorded_hook', text: 'A light flashing far out at sea'}]);
    view.chapterTwoHook.notice.text = 'Caller mutation';
    expect(onlineBulletinView(body).chapterTwoHook.notice.text).toBe('Recorded notice text.');
    expect(bulletinObservations({...view, status: 'off'})).toEqual([]);
  });
  it('accepts route-shaped larger envelopes without invented item or timing bounds', () => {
    const body = recordedBulletin({hook: true});
    body.lines = Array.from({length: 33}, (_, index) => ({kind: 'recorded', text: `Recorded line ${index}`}));
    body.day.resets = Array.from({length: 33}, (_, index) => ({when: `Recorded ${index}`, what: 'Recorded reset'}));
    body.exchange = {feed: 'cache', pausedCompanies: Array.from({length: 33}, (_, index) => ({id: `recorded_${index}`, name: 'Recorded company'}))};
    body.chapterTwoHook.id = ''; body.chapterTwoHook.beam.pattern = Array.from({length: 13}, () => 'short');
    body.chapterTwoHook.beam.flash = {shortSeconds: 0, longSeconds: -1, gapSeconds: -2, pauseSeconds: 0};
    expect(validBulletinReply(body)).toBe(true);
    expect(onlineBulletinView(body)).toEqual({status: 'ready', ...body, stale: false, message: ''});
    body.chapterTwoHook.beam.pattern = []; expect(validBulletinReply(body)).toBe(true);
  });
  it.each(['source', 'fetchedAt', 'tonight', 'tomorrow'])('preserves omitted optional weather field %s without inventing it', key => {
    const body = recordedBulletin(); delete body.weather[key];
    expect(validBulletinReply(body)).toBe(true);
    expect(Object.hasOwn(onlineBulletinView(body).weather, key)).toBe(false);
  });
  it.each([['source', 1], ['fetchedAt', {}], ['tonight', {}], ['tomorrow', {state: 'fog'}]])(
    'rejects malformed supplied weather field %s', (key, value) => {
      const body = recordedBulletin(); body.weather[key] = value; expect(validBulletinReply(body)).toBe(false);
    });
  it('deep-clones each published route field without dropping server display values', () => {
    const body = recordedBulletin({hook: true}); body.exchange = {feed: 'stale', pausedCompanies: [{id: 'recorded', name: 'Recorded company'}]};
    const view = onlineBulletinView(body);
    for (const key of ['day', 'lines', 'weather', 'exchange', 'chapterTwoHook']) { expect(view[key]).toEqual(body[key]); expect(view[key]).not.toBe(body[key]); }
    view.day.resets[0].what = 'Caller mutation'; view.lines[0].text = 'Caller mutation'; view.weather.tomorrow.state = 'storm';
    view.exchange.pausedCompanies[0].name = 'Caller mutation'; view.chapterTwoHook.beam.pattern.push('long');
    expect(body.day.resets[0].what).toBe('Recorded reset description'); expect(body.lines[0].text).toBe('Recorded public bulletin.');
    expect(body.weather.tomorrow.state).toBeNull(); expect(body.exchange.pausedCompanies[0].name).toBe('Recorded company');
    expect(body.chapterTwoHook.beam.pattern).toEqual(['short']);
  });
  it.each([null, {}, {day: {}, lines: []}, {...recordedBulletin(), weather: {}},
    {...recordedBulletin(), chapterTwoHook: {id: 'recorded_hook'}}])('rejects malformed successful data %j', body => {
    expect(validBulletinReply(body)).toBe(false);
  });
});
