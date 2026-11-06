// Frame-driven sailing lifecycle on real dialog/canvas elements; no game or API.
import { expect, it } from 'vitest';
import { browserHarness } from './g20-browser.js';
const evaluate = browserHarness();

it.each([0, 1])('wind %s controls natural passage completion', async wind => {
  const result = await evaluate(async wind => {
    const { createSailing } = await window.g20Import('/src/ui/sailing.js');
    const { setWeather } = await window.g20Import('/src/world/weather.js'); setWeather({ wind });
    const sailing = createSailing(document.body, () => false, () => false);
    let finished = false; const trip = sailing.start('saltreach_harbor').then(() => { finished = true; });
    sailing.update(4); await Promise.resolve(); const early = finished;
    sailing.update(wind === 1 ? .2 : 2.3); await trip;
    const result = { early, finished, activeUntilEnd: sailing.active, title: document.querySelector('h2').textContent };
    sailing.end(); result.closed = !sailing.active; sailing.dispose(); return result;
  }, wind);
  expect(result).toEqual({ early: false, finished: true, activeUntilEnd: true, title: 'To Saltreach Harbor', closed: true });
});

it.each(['skip', 'cancel', 'dispose'])('%s settles a pending passage exactly once', async mode => {
  const result = await evaluate(async mode => {
    const { createSailing } = await window.g20Import('/src/ui/sailing.js');
    const sailing = createSailing(document.body, () => false, () => false); let count = 0;
    const trip = sailing.start('home_islet').then(() => count++);
    if (mode === 'cancel') document.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    else sailing[mode]();
    await trip; sailing.skip(); sailing.end(); sailing.dispose();
    return { count, dialogs: document.querySelectorAll('dialog').length };
  }, mode);
  expect(result).toEqual({ count: 1, dialogs: 0 });
});

it.each(['reduced', 'fast', 'low'])('%s mode avoids the animated passage and clears the arrival fade', async mode => {
  const result = await evaluate(async mode => {
    const { createSailing } = await window.g20Import('/src/ui/sailing.js');
    const sailing = createSailing(document.body, () => mode === 'reduced', () => mode === 'low');
    const trip = sailing.start('home_islet', { fast: mode === 'fast' });
    if (mode === 'low') sailing.update(.31); await trip; sailing.end();
    const fadeVisible = !document.querySelector('.arrival-fade').hidden;
    sailing.update(.2); const cleared = document.querySelector('.arrival-fade').hidden;
    sailing.dispose(); return { fadeVisible, cleared };
  }, mode);
  expect(result).toEqual({ fadeVisible: mode === 'low', cleared: true });
});
