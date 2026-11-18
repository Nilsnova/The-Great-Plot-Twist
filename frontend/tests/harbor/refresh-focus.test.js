// A production timer redraw must keep the semantic route despite replacing the original buttons.
import {it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {probeMarketRefresh} from '../../scripts/market-refresh-probe.js';
const browser = browserHarness();

it('preserves real Tab identity through the actual 15-second market refresh and readable stake limit', async () => {
  await browser.withPage((page, url) => probeMarketRefresh(page, {url}));
});
