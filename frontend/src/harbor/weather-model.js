// What the weather board says, from the answer of GET /api/weather (net/weather.js already fetches it).
// Pure: no DOM. The pirate line follows the wave weather of the server (backend/content/islands.json
// "weather", BUILD-PLAN 3.4): storm ships x1.5, fog sight 0.4, rain and calm change nothing.
//
// T46 (specs/T46-harbor-weather.md) adds three plain lines:
//   old      for "stale" and "fallback" answers: when the reading was taken. A "fallback" is a reading
//            recorded earlier (and the only one in demo mode), so it never promises a fresh one soon.
//   waves    a wave takes the weather where its bell is rung when the server can tell
//            (backend/server/island/wave_weather.py), so the board's place is not always the wave's.
//   tonight  the forecast for tonight from the answer's `tonight.state`, as words only (D045). No coins
//            are at stake: the game has no prediction market (D035).
import {weatherAttribution} from '../net/weather.js';

export const PIRATE_LINES = Object.freeze({
  storm: 'Storm: 50% more pirate ships',
  fog: 'Fog: pirates are seen later',
  rain: 'Rain: the pirates do not mind',
  calm: 'Calm: a quiet sea',
});
const ICONS = {storm: 'ϟ', fog: '≋', rain: '☂', calm: '☀'};
// The state of tonight in a short sentence: "Forecast for tonight here: fog."
const FORECAST = {storm: 'a storm', fog: 'fog', rain: 'rain', calm: 'a calm sea'};
export const WEATHER = {
  offline: 'The weather is not in yet. Until it is, the sea counts as calm.',
  now: (place, summary) => `Right now at ${place}: ${summary}`,
  stale: when => `This is the last weather we heard${when ? `, from ${when}` : ''}. A fresh reading comes soon.`,
  recorded: when => `This is a recorded reading${when ? ` from ${when}` : ''}, not today's weather. It counts until a live one comes in.`,
  waves: 'A wave uses the weather where its bell is rung when the server can tell, otherwise this one.',
  tonight: state => `Forecast for tonight here: ${FORECAST[state]}. Only to read: no coins are at stake.`,
};

// "2026-11-11 11:50 UTC" from the answer's fetchedAt, or '' when it is not a time. UTC and numbers on
// purpose: the same words on every machine, and the server sends UTC.
export function readingTime(iso) {
  const at = typeof iso === 'string' ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const two = number => String(number).padStart(2, '0');
  return `${at.getUTCFullYear()}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())} ${two(at.getUTCHours())}:${two(at.getUTCMinutes())} UTC`;
}

function oldLine(answer) {
  if (answer.source === 'stale') return WEATHER.stale(readingTime(answer.fetchedAt));
  if (answer.source === 'fallback') return WEATHER.recorded(readingTime(answer.fetchedAt));
  return null;
}

// The forecast for tonight, only when the server knows the state of tonight's hours (the recorded fallback
// and demo mode have no hours, so their `tonight.state` is null and the line stays away).
function tonightLine(answer) {
  const state = answer?.tonight?.state;
  return typeof state === 'string' && Object.hasOwn(FORECAST, state) ? WEATHER.tonight(state) : null;
}

export function weatherView(answer) {
  const valid = answer && typeof answer === 'object' && typeof answer.summary === 'string';
  const state = valid && Object.hasOwn(PIRATE_LINES, answer.state) ? answer.state : 'calm';
  return {
    state, icon: ICONS[state], pirates: PIRATE_LINES[state],
    line: valid ? WEATHER.now(answer.place || 'the harbor', answer.summary) : WEATHER.offline,
    old: valid ? oldLine(answer) : null,
    waves: WEATHER.waves,
    tonight: valid ? tonightLine(answer) : null,
    credit: weatherAttribution(valid ? answer : null),
  };
}
