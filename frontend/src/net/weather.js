// Live weather in the browser: asks the server for the real weather every 10 minutes and hands
// the four values to setWeather. No Three.js here, so Vitest can test it without a browser.
//
// How to start it (the steps for src/main.js are in docs/INTERFACES.md, section 3, "Weather"):
//   const stopLiveWeather = startLiveWeather({ setWeather, onUpdate });
// Call stopLiveWeather() when the game shuts down (dispose() in main.js).
//
// What it does:
//   1. asks GET /api/weather at once, then again every 10 minutes (intervalMs);
//   2. takes cloudCover, rain, fog and wind from the answer and calls setWeather with them;
//   3. when anything goes wrong (no network, an error from the server, an answer that is not
//      weather, a call that takes longer than 10 seconds) it changes nothing, so the game keeps
//      the last good weather;
//   4. returns a function that stops the repeating.
//
// The server's answer is described in backend/server/routes/weather.py:
//   { cloudCover, rain, fog, wind, isDay, summary, place, source, fetchedAt, attribution }
// `onUpdate(answer)` is an optional hook that gets the whole answer after every good update. Use
// it to show the place or the summary, to show the credit (weatherAttribution below), or to emit
// the event `weather_updated` on the event bus. If the hook throws, the weather stays updated and
// a separate warning says that the hook failed.
//
// Used by: src/main.js (once it is wired in) and tests/weather.test.js.

export const WEATHER_URL = '/api/weather';
export const REFRESH_MS = 10 * 60 * 1000; // 10 minutes, the same as the server's cache time
export const REQUEST_TIMEOUT_MS = 10 * 1000; // a call that takes longer is cancelled
const MIN_INTERVAL_MS = 1000; // a smaller interval would only keep the browser busy
const WEATHER_KEYS = ['cloudCover', 'rain', 'fog', 'wind'];

// The credit that Open-Meteo's licence (CC BY 4.0, https://open-meteo.com/en/licence) asks for.
// The licence has three conditions, and the game must meet all of them next to the weather:
//   1. give credit, with a link to Open-Meteo   -> `text`, shown as a link to `href`
//   2. give a link to the licence               -> `licenceText`, shown as a link to `licenceHref`
//   3. say that the data was changed            -> the words "adapted for the game" in `text`
// Show them like this: <a href="{href}">{text}</a> (<a href="{licenceHref}">{licenceText}</a>)
export const OPEN_METEO_URL = 'https://open-meteo.com/';
export const LICENCE_TEXT = 'CC BY 4.0';
export const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
// The same words as ATTRIBUTION in backend/server/weather/source.py. Used if the answer has none.
export const DEFAULT_ATTRIBUTION = 'Weather data by Open-Meteo.com, adapted for the game';

// The four numbers from the server's answer, or null if one is missing or not a finite number.
export function pickWeatherValues(answer) {
  if (!answer || typeof answer !== 'object') return null;
  const values = {};
  for (const key of WEATHER_KEYS) {
    if (!Number.isFinite(answer[key])) return null;
    values[key] = answer[key];
  }
  return values;
}

// The credit to show next to the weather: the words from the server, the licence name and the
// two addresses the links point to.
export function weatherAttribution(answer) {
  const text = typeof answer?.attribution === 'string' ? answer.attribution.trim() : '';
  return {
    text: text || DEFAULT_ATTRIBUTION,
    href: OPEN_METEO_URL,
    licenceText: LICENCE_TEXT,
    licenceHref: LICENCE_URL,
  };
}

function chooseInterval(intervalMs) {
  return Number.isFinite(intervalMs) && intervalMs >= MIN_INTERVAL_MS ? intervalMs : REFRESH_MS;
}

// The options for fetch. The signal cancels a call that hangs, so one stuck call can never run on
// into the next refresh. A browser without AbortSignal.timeout just waits, as it did before.
function requestOptions() {
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return {};
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function startLiveWeather({ setWeather, fetchImpl = globalThis.fetch, intervalMs = REFRESH_MS, onUpdate } = {}) {
  if (typeof setWeather !== 'function') throw new TypeError('startLiveWeather needs a setWeather function.');
  if (typeof fetchImpl !== 'function') throw new TypeError('startLiveWeather needs a fetch function.');
  const hasHook = onUpdate !== undefined && onUpdate !== null;
  if (hasHook && typeof onUpdate !== 'function') throw new TypeError('startLiveWeather: onUpdate must be a function.');
  let stopped = false, startedRequest = 0, appliedRequest = 0;

  // The weather is already updated when this runs, so a broken hook must not look like a weather
  // failure. It gets its own warning.
  function callHook(answer) {
    if (!hasHook) return;
    try {
      onUpdate(answer);
    } catch (error) {
      console.warn(`Live weather updated, but onUpdate failed: ${describeError(error)}`);
    }
  }

  async function refresh() {
    const request = ++startedRequest;
    try {
      const response = await fetchImpl(WEATHER_URL, requestOptions());
      if (!response.ok) throw new Error(`the server answered ${response.status}`);
      const answer = await response.json();
      const values = pickWeatherValues(answer);
      if (!values) throw new Error('the answer was not weather');
      // Only advance the last good reading; an older request may finish after a newer one.
      if (stopped || request < appliedRequest) return;
      setWeather(values);
      appliedRequest = request;
      callHook(answer);
    } catch (error) {
      // Change nothing: the game keeps the last good weather.
      if (!stopped) console.warn(`Live weather not updated: ${describeError(error)}`);
    }
  }

  refresh();
  const timer = setInterval(refresh, chooseInterval(intervalMs));
  return function stop() {
    stopped = true;
    clearInterval(timer);
  };
}
