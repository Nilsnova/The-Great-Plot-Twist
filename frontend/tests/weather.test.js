// Live weather client: asks the server for the weather and passes it to setWeather. No network:
// a fake fetch stands in for the server, and fake timers stand in for ten minutes of waiting.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ATTRIBUTION, LICENCE_TEXT, LICENCE_URL, OPEN_METEO_URL, REFRESH_MS, REQUEST_TIMEOUT_MS, WEATHER_URL,
  pickWeatherValues, startLiveWeather, weatherAttribution,
} from '../src/net/weather.js';
import { getWeather, setWeather as gameSetWeather } from '../src/world/weather.js';

// What GET /api/weather answers (see backend/server/routes/weather.py).
const RAIN = {
  cloudCover: 1, rain: 0.6, fog: 0.22, wind: 0.52, isDay: true, summary: 'Rain, windy',
  place: 'Torshavn, Faroe Islands', source: 'live', fetchedAt: '2026-11-05T12:00:00Z',
  attribution: 'Weather data by Open-Meteo.com, adapted for the game',
};
const CLEAR = { ...RAIN, cloudCover: 0.04, rain: 0, fog: 0, wind: 0.16, summary: 'Clear sky', source: 'cache' };
const FOUR_RAIN_VALUES = { cloudCover: 1, rain: 0.6, fog: 0.22, wind: 0.52 };
const FOUR_CLEAR_VALUES = { cloudCover: 0.04, rain: 0, fog: 0, wind: 0.16 };

// A fake answer from fetch: a status and a json() that gives the data.
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const serverError = () => reply({ error: { code: 'source_unavailable', message: 'Not available.' } }, 503);
// Let the fake fetch and the code waiting on it finish, and move the fake clock forward.
const wait = ms => vi.advanceTimersByTimeAsync(ms);

let warn;
beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('asking the server', () => {
  it('asks at once and passes exactly the four weather values to setWeather', async () => {
    const setWeather = vi.fn(), fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(WEATHER_URL);
    expect(WEATHER_URL).toBe('/api/weather');
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(setWeather).toHaveBeenCalledWith(FOUR_RAIN_VALUES);
    stop();
  });

  it('asks again every 10 minutes by default', async () => {
    const setWeather = vi.fn(), fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(REFRESH_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await wait(REFRESH_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(REFRESH_MS).toBe(600000);
    stop();
  });

  it('uses the interval it is given', async () => {
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl, intervalMs: 5000 });
    await wait(15000);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    stop();
  });

  it.each([0, -5, NaN, 'soon', 50, undefined, null])('falls back to 10 minutes for the interval %s', async interval => {
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl, intervalMs: interval });
    await wait(REFRESH_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop();
  });

  it('passes each new answer on, so the weather follows the server', async () => {
    const setWeather = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(RAIN)).mockResolvedValueOnce(reply(CLEAR));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(REFRESH_MS);
    expect(setWeather.mock.calls).toEqual([[FOUR_RAIN_VALUES], [FOUR_CLEAR_VALUES]]);
    stop();
  });
});

describe('when something goes wrong', () => {
  it('keeps the last good weather when the network fails, and recovers later', async () => {
    const setWeather = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(RAIN))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(reply(CLEAR));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(0);
    await wait(REFRESH_MS);
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Failed to fetch');
    await wait(REFRESH_MS);
    expect(setWeather).toHaveBeenCalledTimes(2);
    expect(setWeather).toHaveBeenLastCalledWith(FOUR_CLEAR_VALUES);
    stop();
  });

  it('keeps the last good weather when the server answers with an error', async () => {
    const setWeather = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(RAIN)).mockResolvedValueOnce(serverError());
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(REFRESH_MS);
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('503');
    stop();
  });

  it('changes nothing when the very first answer is an error', async () => {
    const setWeather = vi.fn();
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => serverError() });
    await wait(0);
    expect(setWeather).not.toHaveBeenCalled();
    stop();
  });

  it('changes nothing when the answer is not JSON', async () => {
    const setWeather = vi.fn();
    const notJson = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => notJson });
    await wait(0);
    expect(setWeather).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    stop();
  });

  it.each([
    ['an empty object', {}],
    ['null', null],
    ['text', 'rain'],
    ['a missing value', { cloudCover: 1, rain: 0.6, fog: 0.2 }],
    ['a value that is text', { ...RAIN, wind: '0.5' }],
    ['a value that is not a number', { ...RAIN, fog: NaN }],
    ['a value that is null', { ...RAIN, rain: null }],
  ])('changes nothing for an answer with %s', async (_name, answer) => {
    const setWeather = vi.fn();
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => reply(answer) });
    await wait(0);
    expect(setWeather).not.toHaveBeenCalled();
    stop();
  });

  it('keeps asking after a failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl });
    await wait(REFRESH_MS * 3);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    stop();
  });

  it('does not stop when setWeather itself throws', async () => {
    const setWeather = vi.fn(() => { throw new Error('boom'); });
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(REFRESH_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(setWeather).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('stopping', () => {
  it('stop() ends the repeating', async () => {
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl });
    await wait(0);
    stop();
    await wait(REFRESH_MS * 3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer that arrives after stop()', async () => {
    const setWeather = vi.fn();
    let finish;
    const slowFetch = () => new Promise(resolve => { finish = resolve; });
    const stop = startLiveWeather({ setWeather, fetchImpl: slowFetch });
    stop();
    finish(reply(RAIN));
    await wait(0);
    expect(setWeather).not.toHaveBeenCalled();
  });

  it('stays quiet about a failure that happens after stop()', async () => {
    let fail;
    const slowFetch = () => new Promise((_resolve, reject) => { fail = reject; });
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl: slowFetch });
    stop();
    fail(new TypeError('Failed to fetch'));
    await wait(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('can be stopped twice', () => {
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl: async () => reply(RAIN) });
    stop();
    expect(() => stop()).not.toThrow();
  });
});

describe('the onUpdate hook', () => {
  it('gets the whole answer after every good update', async () => {
    const onUpdate = vi.fn();
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl: async () => reply(RAIN), onUpdate });
    await wait(0);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(RAIN);
    stop();
  });

  it('is not called when nothing was updated', async () => {
    const onUpdate = vi.fn();
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl: async () => serverError(), onUpdate });
    await wait(0);
    expect(onUpdate).not.toHaveBeenCalled();
    stop();
  });

  it('can be used to emit the weather_updated event', async () => {
    const emitted = [];
    const emit = event => emitted.push(event);
    const stop = startLiveWeather({
      setWeather: vi.fn(),
      fetchImpl: async () => reply(RAIN),
      onUpdate: ({ source, fetchedAt }) => emit({ type: 'weather_updated', source, fetchedAt }),
    });
    await wait(0);
    expect(emitted).toEqual([{ type: 'weather_updated', source: 'live', fetchedAt: '2026-11-05T12:00:00Z' }]);
    stop();
  });

  it('does not stop the weather when the hook throws', async () => {
    const setWeather = vi.fn(), onUpdate = vi.fn(() => { throw new Error('hook bug'); });
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => reply(RAIN), onUpdate });
    await wait(REFRESH_MS);
    expect(setWeather).toHaveBeenCalledTimes(2);
    stop();
  });

  it('warns that the hook failed, and does not claim the weather was not updated', async () => {
    const setWeather = vi.fn(), onUpdate = vi.fn(() => { throw new Error('hook bug'); });
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => reply(RAIN), onUpdate });
    await wait(0);
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('onUpdate failed');
    expect(warn.mock.calls[0][0]).toContain('hook bug');
    expect(warn.mock.calls[0][0]).not.toContain('not updated');
    stop();
  });

  it('is not called when setWeather itself fails, and then the warning says the weather was not updated', async () => {
    const setWeather = vi.fn(() => { throw new Error('boom'); }), onUpdate = vi.fn();
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => reply(RAIN), onUpdate });
    await wait(0);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toContain('not updated');
    stop();
  });

  it.each(['soon', 42, {}, true])('refuses to start with an onUpdate that is %j', hook => {
    const start = () => startLiveWeather({ setWeather: vi.fn(), fetchImpl: async () => reply(RAIN), onUpdate: hook });
    expect(start).toThrow(/onUpdate/);
  });

  it.each([undefined, null])('starts without a hook when onUpdate is %s', async hook => {
    const setWeather = vi.fn();
    const stop = startLiveWeather({ setWeather, fetchImpl: async () => reply(RAIN), onUpdate: hook });
    await wait(0);
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    stop();
  });
});

describe('the time limit for one call', () => {
  it('gives fetch a signal that cancels the call after 10 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl });
    await wait(0);
    expect(REQUEST_TIMEOUT_MS).toBe(10000);
    expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    stop();
  });

  it('gives every refresh its own fresh signal', async () => {
    const fetchImpl = vi.fn(async () => reply(RAIN));
    const stop = startLiveWeather({ setWeather: vi.fn(), fetchImpl });
    await wait(REFRESH_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].signal).not.toBe(fetchImpl.mock.calls[0][1].signal);
    stop();
  });

  it('keeps the last good weather and warns when the call is cancelled for taking too long', async () => {
    const setWeather = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(RAIN))
      .mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const stop = startLiveWeather({ setWeather, fetchImpl });
    await wait(REFRESH_MS);
    expect(setWeather).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('timeout');
    stop();
  });

  it('still works in a browser without AbortSignal.timeout', async () => {
    const original = AbortSignal.timeout;
    AbortSignal.timeout = undefined;
    const setWeather = vi.fn(), fetchImpl = vi.fn(async () => reply(RAIN));
    try {
      const stop = startLiveWeather({ setWeather, fetchImpl });
      await wait(0);
      stop();
    } finally {
      AbortSignal.timeout = original;
    }
    expect(fetchImpl.mock.calls[0][1]).toEqual({});
    expect(setWeather).toHaveBeenCalledWith(FOUR_RAIN_VALUES);
  });
});

describe('starting', () => {
  it('refuses to start without a setWeather function', () => {
    expect(() => startLiveWeather({ fetchImpl: async () => reply(RAIN) })).toThrow(/setWeather/);
    expect(() => startLiveWeather()).toThrow(/setWeather/);
  });

  it('refuses to start without a fetch function', () => {
    expect(() => startLiveWeather({ setWeather: vi.fn(), fetchImpl: null })).toThrow(/fetch/);
  });

  it('uses the global fetch when none is given', async () => {
    const globalFetch = vi.fn(async () => reply(RAIN));
    vi.stubGlobal('fetch', globalFetch);
    const stop = startLiveWeather({ setWeather: vi.fn() });
    await wait(0);
    expect(globalFetch.mock.calls[0][0]).toBe(WEATHER_URL);
    stop();
  });
});

describe('with the real setWeather of the game', () => {
  it('moves the game weather to what the server says, with the game clamping the values', async () => {
    gameSetWeather({ cloudCover: 0, rain: 0, fog: 0, wind: 0 });
    const answer = { ...RAIN, rain: 7 };
    const stop = startLiveWeather({ setWeather: gameSetWeather, fetchImpl: async () => reply(answer) });
    await wait(0);
    expect(getWeather()).toEqual({ cloudCover: 1, rain: 1, fog: 0.22, wind: 0.52 });
    stop();
  });

  it('leaves the game weather alone when the server fails', async () => {
    gameSetWeather({ cloudCover: 0.3, rain: 0.1, fog: 0.2, wind: 0.4 });
    const stop = startLiveWeather({ setWeather: gameSetWeather, fetchImpl: async () => serverError() });
    await wait(0);
    expect(getWeather()).toEqual({ cloudCover: 0.3, rain: 0.1, fog: 0.2, wind: 0.4 });
    stop();
  });
});

describe('picking the values', () => {
  it('takes exactly the four weather values', () => {
    expect(pickWeatherValues(RAIN)).toEqual(FOUR_RAIN_VALUES);
  });

  it('gives null when a value is missing, not finite, or the answer is not an object', () => {
    expect(pickWeatherValues({ ...RAIN, wind: undefined })).toBeNull();
    expect(pickWeatherValues({ ...RAIN, wind: Infinity })).toBeNull();
    expect(pickWeatherValues(undefined)).toBeNull();
    expect(pickWeatherValues(42)).toBeNull();
  });

  it('accepts zero as a value', () => {
    expect(pickWeatherValues({ cloudCover: 0, rain: 0, fog: 0, wind: 0 })).toEqual({ cloudCover: 0, rain: 0, fog: 0, wind: 0 });
  });
});

describe('the credit line', () => {
  it('gives the words from the server, the link to Open-Meteo and the licence with its link', () => {
    expect(weatherAttribution(RAIN)).toEqual({
      text: 'Weather data by Open-Meteo.com, adapted for the game',
      href: 'https://open-meteo.com/',
      licenceText: 'CC BY 4.0',
      licenceHref: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('points the links at Open-Meteo and at the CC BY 4.0 licence text', () => {
    expect(OPEN_METEO_URL).toBe('https://open-meteo.com/');
    expect(LICENCE_URL).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(LICENCE_TEXT).toBe('CC BY 4.0');
  });

  it('trims the words from the server', () => {
    expect(weatherAttribution({ attribution: '  Weather data by Open-Meteo.com, adapted for the game  ' }).text)
      .toBe('Weather data by Open-Meteo.com, adapted for the game');
  });

  it.each([undefined, null, {}, { attribution: '' }, { attribution: '   ' }, { attribution: 42 }])(
    'falls back to the standard words for %j', answer => {
      expect(weatherAttribution(answer)).toEqual({
        text: DEFAULT_ATTRIBUTION, href: OPEN_METEO_URL, licenceText: LICENCE_TEXT, licenceHref: LICENCE_URL,
      });
    },
  );

  it('always gives both links and the licence name, whatever the server sends', () => {
    const credit = weatherAttribution({ attribution: 'Something else' });
    expect(credit.href).toBe(OPEN_METEO_URL);
    expect(credit.licenceHref).toBe(LICENCE_URL);
    expect(credit.licenceText).toBe(LICENCE_TEXT);
  });

  it('has standard words that give credit to Open-Meteo and say the data was changed', () => {
    expect(DEFAULT_ATTRIBUTION).toBe('Weather data by Open-Meteo.com, adapted for the game');
    expect(DEFAULT_ATTRIBUTION).toContain('Open-Meteo.com');
    expect(DEFAULT_ATTRIBUTION).toContain('adapted');
  });
});
