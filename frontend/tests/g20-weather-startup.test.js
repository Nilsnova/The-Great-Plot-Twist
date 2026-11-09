// Real game weather startup/event/credit wiring; local HTTP is deterministically intercepted.
import { expect, it } from 'vitest';
import { browserHarness } from './g20-browser.js';
import { stubIntro } from '../scripts/intro-browser-fixture.js';
const evaluate = browserHarness();

it('startup forwards API weather metadata and keeps attribution in Settings credits', async () => {
  await evaluate.withPage(async (page, base) => {
    const answer = { wind: .73, rain: .44, fog: .35, cloudCover: .7, source: 'cache', fetchedAt: '2026-11-06T10:00:00Z', attribution: 'Weather data by Open-Meteo.com, adapted for the game' };
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/weather', route => route.fulfill({ json: answer }));
    await stubIntro(page);
    await page.goto(base);
    await page.addScriptTag({ type: 'module', content: 'window.g20Import = path => import(path);' });
    await page.waitForFunction(() => typeof window.g20Import === 'function');
    // Subscribe before Play loads game.js and begins the initial weather refresh.
    await page.evaluate(async () => {
      const { on } = await window.g20Import('/src/core/events.js'); window.g20WeatherEvents = [];
      window.g20StopWeather = on('weather_updated', event => window.g20WeatherEvents.push(event));
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.g20WeatherEvents.length > 0);
    const state = await page.evaluate(async () => {
      const { getWeather } = await window.g20Import('/src/world/weather.js');
      const { credits } = await window.g20Import('/src/shell/credits.js');
      const section = credits();
      return { weather: getWeather(), events: window.g20WeatherEvents,
        inlineCredit: document.querySelectorAll('.weather-credit').length,
        text: section.textContent,
        links: [...section.querySelectorAll('a')].filter(a => a.href === 'https://open-meteo.com/' || a.href === 'https://creativecommons.org/licenses/by/4.0/').map(a => ({ text: a.textContent, href: a.href })) };
    });
    expect(state.weather).toEqual({ wind: .73, rain: .44, fog: .35, cloudCover: .7 });
    expect(state.events).toEqual([{ type: 'weather_updated', source: 'cache', fetchedAt: answer.fetchedAt }]);
    expect(state.inlineCredit).toBe(0);
    expect(state.text).toContain(answer.attribution);
    expect(state.links).toEqual([{ text: 'Open-Meteo', href: 'https://open-meteo.com/' }, { text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' }]);
    expect(errors).toEqual([]);
  });
}, 30000);
