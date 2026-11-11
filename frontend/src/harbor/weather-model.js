// What the weather board says, from the answer of GET /api/weather (net/weather.js already fetches it).
// Pure: no DOM. The pirate line follows the wave weather of the server (backend/content/islands.json
// "weather", BUILD-PLAN 3.4): storm ships x1.5, fog sight 0.4, rain and calm change nothing.
import {weatherAttribution} from '../net/weather.js';

export const PIRATE_LINES = Object.freeze({
  storm: 'Storm: 50% more pirate ships',
  fog: 'Fog: pirates are seen later',
  rain: 'Rain: the pirates do not mind',
  calm: 'Calm: a quiet sea',
});
const ICONS = {storm: 'ϟ', fog: '≋', rain: '☂', calm: '☀'};
const OLD = new Set(['stale', 'fallback']);
export const WEATHER = {
  offline: 'The weather is not in yet. Until it is, the sea counts as calm.',
  now: (place, summary) => `Right now at ${place}: ${summary}`,
  old: 'This is the last weather we heard. A fresh reading comes soon.',
};

export function weatherView(answer) {
  const valid = answer && typeof answer === 'object' && typeof answer.summary === 'string';
  const state = valid && Object.hasOwn(PIRATE_LINES, answer.state) ? answer.state : 'calm';
  return {
    state, icon: ICONS[state], pirates: PIRATE_LINES[state],
    line: valid ? WEATHER.now(answer.place || 'the harbor', answer.summary) : WEATHER.offline,
    old: valid && OLD.has(answer.source) ? WEATHER.old : null,
    credit: weatherAttribution(valid ? answer : null),
  };
}
