// Recorded L4-v2 journeys use public controls and intercepted endpoints, never game hooks.
import assert from 'node:assert/strict';
import {signInFromTitle} from './online-chaos-signin.js';
import {openAccountControls,openCrewFromHud} from './online-browser-actions.js';

const market = page => page.locator('.market-modal[open]');
const writes = env => env.marketRequests.filter(request => request.method === 'POST');
const reads = env => env.marketRequests.filter(request => request.method === 'GET'
  && request.path === '/api/market/portfolio').length;
const journal = page => page.evaluate(() => localStorage.getItem('plot_twist_intro_moves_v1'));
async function savedCaptain(page) {
  await page.locator('.captain-status > [role="status"][data-state="saved"]').waitFor({state: 'visible'});
  const saved = await page.locator('.captain-status > [role="status"][data-state]').evaluate(element => ({
    ready: element.dataset.state === 'saved', healthy: !/(?:offline|conflict|saving)/i.test(element.textContent ?? '')}));
  assert.ok(saved.ready && saved.healthy, 'The unique native captain save status confirms cloud readiness');
}

async function sharedWallet(page,expected){
  await page.waitForFunction(expected=>document.querySelector('.captain-status .coin-counter')?.getAttribute('aria-label')===expected,expected);
  return true;
}
async function recordedStockStates(page){
  const expected=[
    ['Recorded Closed Stock','25.50 USD','Closed for the weekend, opens Monday 14:30 Lisbon time'],
    ['Recorded Stale Stock','42.25 USD','Price source not answering. Trading paused.'],
    ['Recorded Unavailable Stock','Not available','No price yet.'],
  ];
  for(const [name,price,status] of expected){
    const card=market(page).locator('.market-card').filter({hasText:name});
    assert.equal(await card.count(),1,'Each recorded US stock has one actual price card.');
    await card.scrollIntoViewIfNeeded();assert.ok(await card.isVisible(),'The representative US stock card is actually rendered in the public panel.');
    const facts=await card.locator('dd').allTextContents();
    assert.deepEqual(facts,[price,status],'The US stock prints its supplied price and plain closed/stale/unavailable caption.');
    assert.equal(await card.getByRole('button',{name:/^Open a position in /}).count(),0,'A paused US stock exposes no position opener.');
    assert.equal(await card.getByRole('radio').count(),0,'A closed, stale or unavailable stock exposes no stake choices.');
    assert.equal(await card.locator('.market-form').isVisible(),false,'A paused stock keeps its stake form closed.');
  }
  assert.equal(await market(page).locator('.market-card').count(),4,'REC remains first beside three representative closed US stock cards.');
  assert.ok((await market(page).locator('.market-card').first().locator('h3').textContent()).startsWith('Recorded Company'),
    'The recorded tradable company remains the first fixture card.');
  assert.equal(await market(page).getByRole('button',{name:/^Open a position in /}).count(),1,'REC is the only tradable recorded company.');
  await market(page).locator('.market-card').first().scrollIntoViewIfNeeded();
  return true;
}
async function recordedRewards(env,balance,rows){
  const {page}=env;await page.keyboard.press('Escape');await market(page).waitFor({state:'hidden'});
  await openCrewFromHud(page);
  const modal=page.locator('.case-modal[open]'),picker=modal.getByRole('combobox',{name:'Case page'});
  if(await picker.isVisible())await picker.selectOption('rewards');
  else await modal.getByRole('button',{name:'Rewards',exact:true}).click();
  await modal.locator('.rewards-ledger').waitFor();
  await page.waitForFunction(({balance,rows})=>{
    const screen=document.querySelector('.case-modal[open] .rewards-screen');
    const actual=[...(screen?.querySelectorAll('.rewards-ledger > li')??[])].map(row=>({
      amount:row.querySelector('strong')?.textContent,reason:row.querySelector('span')?.textContent}));
    return screen?.querySelector('.rewards-balance')?.textContent===balance&&JSON.stringify(actual)===JSON.stringify(rows);
  },{balance,rows});
  const proof=env.marketLedgerProof();
  assert.ok(proof.reads>0&&proof.lastRows===rows.length&&proof.allGet&&proof.allAuthorized&&proof.allOwnUser&&proof.allExpectedQuery,
    'The real Rewards balance and fixed rows arrived through authorized own-player SDK ledger reads.');
  await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
  assert.ok(await page.locator('canvas[tabindex="0"]').first().evaluate(element=>document.activeElement===element),
    'Rewards Escape returns focus to the public canvas.');
  assert.equal(await page.locator('.shell-screen[open][data-mode="pause"]').count(),0,'Closing Rewards does not open Pause.');
  return true;
}
async function recordedMarketCredits(page){
  await page.getByRole('button',{name:'Open visual settings',exact:true}).click();
  await page.locator('.shell-screen[open][data-mode="settings"]').waitFor();
  await page.getByRole('button',{name:'Credits',exact:true}).click();
  const credits=page.locator('.shell-credits'),link=credits.getByRole('link',{name:'Recorded market price source',exact:true});
  await link.waitFor({state:'visible'});
  assert.equal(await link.getAttribute('href'),'https://example.invalid/recorded-market-source',
    'Settings Credits prints the exact recorded server credit and HTTPS link without navigating away.');
  await page.keyboard.press('Escape');await page.locator('.shell-screen[open][data-mode="settings"]').waitFor();
  await page.keyboard.press('Escape');await page.locator('.shell-screen[open][data-mode="pause"]').waitFor();
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.matches('canvas[tabindex="0"]'));
  return true;
}

async function holdKey(page, key, work) {
  await page.keyboard.down(key);
  try { await work(); } finally { await page.keyboard.up(key); }
}

async function walkFrames(page, seconds) {
  // Match the published loop's capped native frame time, including a cold software renderer.
  await page.evaluate(seconds => new Promise((resolve, reject) => {
    let previous = performance.now(), elapsed = 0, frame;
    const timeout = setTimeout(() => { cancelAnimationFrame(frame); reject(new Error('Native walking frames timed out')); }, 12000);
    function tick(now) {
      elapsed += Math.min((now - previous) / 1000, .1); previous = now;
      if (elapsed >= seconds) { clearTimeout(timeout); resolve(); }
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }), seconds);
}

async function walkToExchange(page, open) {
  await page.locator('canvas[tabindex="0"]').first().focus();
  const prompt = label => page.locator('.interact strong').filter({hasText: label});
  // Harbor spawn and stand points are public layout; the actual hall prompt still ends the walk.
  await holdKey(page, 'KeyW', () => prompt('Captain’s Table').waitFor({timeout: 12000}));
  await holdKey(page, 'KeyA', () => walkFrames(page, 2.8));
  await holdKey(page, 'KeyW', () => prompt('Island Exchange').waitFor({timeout: 12000}));
  if (open) {
    await page.keyboard.press('KeyE');
    await market(page).waitFor();
  }
}

export async function enterRecordedMarket(env, {open = true} = {}) {
  await signInFromTitle(env);
  await openAccountControls(env.page);
  await env.page.getByRole('button', {name: 'Change captain name once', exact: true}).waitFor();
  await env.page.keyboard.press('Escape');
  await env.page.locator('.account-modal').waitFor({state: 'hidden'});
  await env.page.locator('.shell-menu').getByRole('button', {name: 'Continue', exact: true}).click();
  await env.page.locator('.hud.exploring').waitFor();
  await savedCaptain(env.page);
  await walkToExchange(env.page, open);
  if (open) await market(env.page).locator('.market-card').first().waitFor();
}

async function preparePosition(env, side) {
  const screen = market(env.page);
  await screen.getByRole('tab', {name: 'Prices', exact: true}).click();
  await screen.getByRole('button', {name: 'Open a position in Recorded Company', exact: true}).click();
  const form = screen.getByRole('group', {name: 'Open a position', exact: true});
  await form.waitFor();
  await form.getByRole('radio', {name: side === 'rising'
    ? 'Rising: you gain when the price goes up' : 'Falling: you gain when the price goes down', exact: true}).check();
  const stake = form.getByRole('group', {name: 'Stake', exact: true}).getByRole('radio').first();
  assert.ok(await stake.getAttribute('value') === '10', 'The recorded first stake choice is the approved small stake');
  await stake.check();
  return form;
}

async function waitStatus(page, kind) {
  await page.waitForFunction(kind => {
    const text = document.querySelector('.market-modal[open] .market-status')?.textContent ?? '';
    if (kind === 'unknown') {
      const retry = document.querySelector('.market-modal[open] .market-retry:not([hidden])');
      return !!retry && /^We could not confirm this\. Check your positions before you try again\./.test(retry.textContent.trim());
    }
    const patterns = {rising: /^Opened your rising position/, closed: /^Closed your position/,
      falling: /^Opened your falling position/, unknown: /^We could not confirm this\./, checked: /^Updated your positions\./,
      repeated: /^This was already done\./};
    return patterns[kind].test(text);
  }, kind);
}

async function waitPositions(page, open, closed) {
  await page.waitForFunction(({open, closed}) => {
    const screen = document.querySelector('.market-modal[open]');
    return screen?.querySelectorAll('.market-position').length === open
      && screen.querySelectorAll('.market-closed').length === closed;
  }, {open, closed});
}

function checkTransport(env, check) {
  const proof = env.marketProof();
  check(proof.allBodiesExpected === true, 'Market changes send only the published intent fields');
  check(proof.allPublicAnonymous === true, 'Recorded prices use anonymous public reads');
  check(proof.allPrivateAuthorized === true, 'Own positions and changes use the intercepted signed-in session');
}

async function sendAgainAfterHeldPortfolio(page, button) {
  let release; const held = new Promise(done => { release = done; });
  const pattern = '**/api/market/portfolio'; let posts = 0;
  const observe = request => { if (request.method() === 'POST'
    && ['/api/market/open', '/api/market/close'].includes(new URL(request.url()).pathname)) posts += 1; };
  const handler = async route => { await held; return route.fallback(); };
  page.on('request', observe); await page.route(pattern, handler);
  try {
    const read = page.waitForRequest(request => request.method() === 'GET'
      && new URL(request.url()).pathname === '/api/market/portfolio', {timeout: 10000});
    await button.click(); const request = await read;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(posts, 0, 'Send again cannot write while the authoritative own-portfolio answer is held');
    const answered = page.waitForResponse(response => response.request() === request, {timeout: 10000});
    release(); const response = await answered; assert.ok(response.ok(), 'The explicit retry receives a successful authoritative portfolio answer');
    assert.ok(await response.finished() === null, 'The authoritative portfolio response finishes without a transport failure');
  } finally { release(); await page.unroute(pattern, handler); page.off('request', observe); }
}

async function assertMarketReadable(page) {
  const metrics = await market(page).evaluate(root => {
    const visible = element => {
      const style = getComputedStyle(element);
      return !element.closest('[hidden],[inert],[aria-hidden=true]') && element.getClientRects().length > 0
        && style.display !== 'none' && style.visibility === 'visible';
    };
    const controls = [...root.querySelectorAll('button,a[href],.market-choice')].filter(visible);
    const text = [...root.querySelectorAll('p,small,figcaption,h2,h3,h4,dt,dd')].filter(element => visible(element)
      && element.textContent.trim() && !element.closest('.kit-sr-only,.server-call-announcement'));
    return {fits: document.documentElement.scrollWidth <= innerWidth && root.scrollWidth <= root.clientWidth,
      controls: controls.length > 0 && controls.every(element => parseFloat(getComputedStyle(element).fontSize) >= 16),
      targets: controls.every(element => { const box = element.getBoundingClientRect(); return box.width >= 44 && box.height >= 44; }),
      text: text.length > 0 && text.every(element => parseFloat(getComputedStyle(element).fontSize) >= 18)};
  });
  assert.ok(metrics.fits, 'The market panel and page fit without horizontal overflow');
  assert.ok(metrics.controls, 'Visible market controls use at least sixteen-pixel text');
  assert.ok(metrics.targets, 'Visible market controls and choices have forty-four-pixel targets');
  assert.ok(metrics.text, 'Visible market body and caption text use at least eighteen-pixel text');
}
async function assertMarketLimits(page, {open, staked}) {
  const account = market(page).locator('.market-account');
  await account.getByText(`Open positions: ${open} of 20`, {exact: true}).waitFor({state: 'visible'});
  await account.getByText(`Staked today: ${staked} of 2,000 coins`, {exact: true}).waitFor({state: 'visible'});
}

export async function recordedMarketGolden(env, {width = 375, capture} = {}) {
  const {page} = env, checks = [];
  const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
  await page.setViewportSize({width, height: 812});
  env.resetMarket({flag: true, tradingEnabled: false});
  await enterRecordedMarket(env);
  const later=market(page).locator('.market-prices .market-soon');await later.waitFor({state:'visible'});
  check(await later.textContent()==='Trading opens later.','The trading pause uses the approved caption');
  check(await market(page).getByRole('button', {name: /^Open a position in /}).count() === 0
    && writes(env).length === 0, 'A server trading pause shows its plain closed line and offers no open intent');
  check(env.marketSaveProof().acceptedPuts > 0 && env.marketSaveProof().version > 1,
    'The recorded harbor receives an incrementing save acknowledgement before market captures');
  await savedCaptain(page);
  await assertMarketReadable(page); await capture?.('market-trading-paused', page);
  env.resetMarket({flag: true, tradingEnabled: true});
  await enterRecordedMarket(env);
  const keptJournal = await journal(page), screen = market(page);
  check(typeof env.marketSimulationNote === 'string'
    && await screen.locator('.market-prices .market-simulation').textContent() === env.marketSimulationNote,
  'Prices show the recorded play-money simulation note');
  check(await env.marketChunkCount() > 0, 'The allowed market opening loads its manifest-owned resources');
  check(await recordedStockStates(page),'Recorded US stocks show closed Lisbon reopening, stale last price and unavailable/no-price states without stake controls.');
  check(!(await screen.textContent()).includes('Recorded market price source'),'Market source credits stay out of the gameplay panel.');

  const beforeCancel = writes(env).length, cancelled = await preparePosition(env, 'rising');
  await cancelled.getByRole('button', {name: 'Cancel', exact: true}).click();
  await cancelled.waitFor({state: 'hidden'});
  check(writes(env).length === beforeCancel, 'Cancelling the position form sends no change');

  const rising = await preparePosition(env, 'rising'); await assertMarketReadable(page);
  await rising.getByRole('button', {name: /^Open rising position for /}).click();
  await waitStatus(page, 'rising');
  await screen.getByRole('tab', {name: 'Your positions', exact: true}).click();
  await waitPositions(page, 1, 0);
  check(await env.assertMarketBalance() === true, 'The rising position shows the authoritative account balance');
  check(await screen.locator('.market-positions .market-simulation').textContent() === env.marketSimulationNote,
    'Your positions show the same play-money simulation note');
  await assertMarketLimits(page, {open: 1, staked: 10}); await assertMarketReadable(page);
  check(env.marketProof().opens === 1, 'One confirmed rising intent creates one server position');
  await savedCaptain(page);
  check(await sharedWallet(page,'989 coins'),'The shared captain wallet adopts 989 coins after the accepted rising position.');
  await capture?.('market-rising', page);

  const beforeAsk = writes(env).length;
  await screen.getByRole('button', {name: 'Close your rising position in Recorded Company', exact: true}).click();
  const yes = screen.getByRole('button', {name: 'Yes, close it', exact: true});
  await yes.waitFor();
  check(writes(env).length === beforeAsk, 'Asking to close does not send a change before confirmation');
  await yes.click();
  await waitStatus(page, 'closed');
  await waitPositions(page, 0, 1);
  check(await env.assertMarketBalance() === true, 'The confirmed close shows the server account balance');
  check(env.marketProof().closes === 1, 'The explicit close confirmation closes one server position');
  await savedCaptain(page);
  check(await sharedWallet(page,'998 coins'),'The shared captain wallet adopts 998 coins after the accepted close.');
  await capture?.('market-closed', page);

  const falling = await preparePosition(env, 'falling');
  env.faultMarket('/api/market/open', {status: 503, code: 'unavailable', apply: true});
  const unknownStart = env.marketRequests.length;
  await falling.getByRole('button', {name: /^Open falling position for /}).click();
  await waitStatus(page, 'unknown');
  await screen.getByRole('tab', {name: 'Your positions', exact: true}).click();
  await waitPositions(page, 1, 1);
  check(await env.assertMarketBalance() === true, 'An applied unknown falling trade displays only the server account balance');
  check(env.marketProof().unknownApplied === true && env.marketProof().opens === 2,
    'The intercepted unknown answer represents one applied falling trade');
  await savedCaptain(page);
  check(await sharedWallet(page,'987 coins'),'The shared captain wallet reads 987 coins after the server-applied unknown trade.');
  await capture?.('market-unknown', page);

  const beforeCheck = writes(env).length, readsBefore = reads(env), grantsBefore = [...env.marketProof().ledgerReasons];
  await screen.getByRole('button', {name: 'Check again', exact: true}).click();
  await waitStatus(page, 'checked');
  check(reads(env) > readsBefore && writes(env).length === beforeCheck,
    'Check again reads own positions without sending another change');
  check(JSON.stringify(env.marketProof().ledgerReasons) === JSON.stringify(grantsBefore),
    'Reading the unknown outcome adds no ledger grant');
  const repeatStart = env.marketRequests.length;
  await sendAgainAfterHeldPortfolio(page, screen.getByRole('button', {name: 'Send again', exact: true}));
  await waitStatus(page, 'repeated');
  await waitPositions(page, 1, 1);
  check(await env.assertMarketBalance() === true, 'The idempotent repeat keeps the authoritative balance');
  const repeatTraffic = env.marketRequests.slice(repeatStart);
  const freshRead = repeatTraffic.findIndex(request => request.method === 'GET' && request.path === '/api/market/portfolio');
  const repeatedWrite = repeatTraffic.findIndex(request => request.method === 'POST');
  check(freshRead >= 0 && repeatedWrite > freshRead, 'Send again first obtains a new own-portfolio answer before its same-UID write');
  const proof = env.marketProof(), last = writes(env).at(-1);
  check(proof.opens === 2 && proof.closes === 1 && proof.repeats === 1 && proof.sameUidRepeat === true
    && last?.path === '/api/market/open' && last.uidMatchesPrior === true && writes(env).length === 4,
  'Send again reuses the original action UID and receives already-applied without another position');
  const recovery = env.marketRequests.slice(unknownStart).filter(request =>
    request.method === 'POST' && request.path === '/api/market/open'
    || request.method === 'GET' && request.path === '/api/market/portfolio');
  const attempts = recovery.map((request, index) => ({request, index})).filter(({request}) => request.method === 'POST');
  check(attempts.length === 2 && attempts[1].request.uidMatchesPrior === true
    && recovery.slice(attempts[0].index + 1, attempts[1].index).some(request => request.method === 'GET'),
  'Own positions are read between the unknown open and its same-UID repeat, allowing ordinary read polls');
  check(JSON.stringify(proof.ledgerReasons) === JSON.stringify(['market_stake', 'market_fee',
    'market_payout', 'market_fee', 'market_stake', 'market_fee']), 'Only the three accepted market changes add their server ledger reasons');
  check(await journal(page) === keptJournal, 'Market intents preserve this device’s accepted intro replay');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The recorded market fits the requested viewport');
  checkTransport(env, check);
  await assertMarketLimits(page, {open: 1, staked: 20}); await assertMarketReadable(page);
  await savedCaptain(page);
  check(await sharedWallet(page,'987 coins'),'The shared captain wallet retains 987 coins after the idempotent unknown repeat.');
  await capture?.('market-falling-repeat', page);
  await page.setViewportSize({width: 320, height: 667}); await assertMarketReadable(page);
  const narrow = await preparePosition(env, 'rising'); await assertMarketReadable(page);
  await narrow.getByRole('button', {name: 'Cancel', exact: true}).click(); await narrow.waitFor({state: 'hidden'});
  await page.setViewportSize({width, height: 812});
  checks.push('Server limits show 20 open positions and 2,000 daily stake; body18, controls16, targets44 and320px fit remain readable.');
  check(await recordedRewards(env,'987 coins',[{amount:'-1 coins',reason:'market fee'},{amount:'-10 coins',reason:'market stake'},{amount:'-1 coins',reason:'market fee'},{amount:'+10 coins',reason:'market payout'},{amount:'-1 coins',reason:'market fee'},{amount:'-10 coins',reason:'market stake'}]),'Actual Rewards shows 987 coins and exactly six fixed own-market ledger rows after the final accepted changes.');
  check(await recordedMarketCredits(page),'Only Settings → Credits displays the exact recorded server price-source link.');
  return {checks};
}

export async function recordedMarketUnapplied(env, {width = 375, capture} = {}) {
  const {page} = env, checks = [], check = (value, label) => { assert.ok(value, label); checks.push(label); };
  env.resetMarket({flag: true, tradingEnabled: true}); await page.setViewportSize({width, height: 812});
  await enterRecordedMarket(env); const kept = await journal(page), form = await preparePosition(env, 'falling');
  env.faultMarket('/api/market/open', {status: 503, code: 'unavailable', apply: false});
  const start = env.marketRequests.length; await form.getByRole('button', {name: /^Open falling position for /}).click();
  await waitStatus(page, 'unknown'); await market(page).getByRole('tab', {name: 'Your positions', exact: true}).click();
  await waitPositions(page, 0, 0); check(await env.assertMarketBalance(), 'An unapplied unknown trade keeps the authoritative server balance');
  check(env.marketProof().opens === 0 && env.marketProof().ledgerReasons.length === 0,
    'An unapplied unknown trade grants no position or ledger entry');
  check(env.marketRequests.slice(start).filter(request => request.method === 'POST').length === 1,
    'An uncertain unapplied trade is not automatically repeated');
  await savedCaptain(page);
  await capture?.('market-unapplied-unknown', page);
  const beforeCheck = writes(env).length; await market(page).getByRole('button', {name: 'Check again', exact: true}).click();
  await waitStatus(page, 'checked'); check(writes(env).length === beforeCheck, 'Check again for an unapplied trade sends no write');
  await page.keyboard.press('Escape'); await market(page).waitFor({state: 'hidden'});
  check(await page.locator('canvas[tabindex="0"]').first().evaluate(element => document.activeElement === element),
    'Closing an unknown market trade returns focus to the public canvas');
  await page.keyboard.press('KeyE'); await market(page).waitFor(); await waitStatus(page, 'unknown');
  await market(page).getByRole('tab', {name: 'Your positions', exact: true}).click(); await waitPositions(page, 0, 0);
  check(writes(env).length === beforeCheck, 'Ordinary close and public reopening preserve the unknown trade without resending it');
  const retryStart = env.marketRequests.length; await sendAgainAfterHeldPortfolio(page, market(page).getByRole('button', {name: 'Send again', exact: true}));
  await waitStatus(page, 'falling'); await waitPositions(page, 1, 0);
  const attempts = env.marketRequests.slice(start).filter(request => request.method === 'POST'), retry = env.marketRequests.slice(retryStart);
  const read = retry.findIndex(request => request.method === 'GET' && request.path === '/api/market/portfolio');
  const write = retry.findIndex(request => request.method === 'POST');
  check(attempts.length === 2 && attempts[1].uidMatchesPrior === true && read >= 0 && write > read,
    'Only explicit Send again reads fresh own positions and repeats the exact original UID for an unapplied trade');
  check(env.marketProof().opens === 1 && env.marketProof().repeats === 0
    && JSON.stringify(env.marketProof().ledgerReasons) === JSON.stringify(['market_stake', 'market_fee']),
    'The server accepts the unapplied same-UID repeat once and charges only its published stake and fee');
  check(await env.assertMarketBalance(), 'The once-accepted repeat displays the server balance');
  check(await journal(page) === kept, 'An unapplied unknown retry preserves accepted device replay');
  await assertMarketLimits(page, {open: 1, staked: 10}); await assertMarketReadable(page); checkTransport(env, check);
  await savedCaptain(page);
  check(await sharedWallet(page,'989 coins'),'The shared captain wallet adopts 989 coins after the once-accepted unapplied repeat.');
  await capture?.('market-unapplied-repeat', page);
  check(await recordedRewards(env,'989 coins',[{amount:'-1 coins',reason:'market fee'},{amount:'-10 coins',reason:'market stake'}]),
    'Actual Rewards shows 989 coins and only the two rows from the once-accepted retry.');
  return {checks};
}

// Every fault observes the real common call/status controls; no product selectors or state are injected.
export function createRecordedMarketChaosJourney() {
  const call = '.market-modal[open] .server-call';
  const control = '.market-modal[open] .market-card[data-open="true"] .market-form[role="group"] .market-form-actions > button:first-child';
  const privateJournals = new WeakMap(), traffic = new WeakMap();
  function install(page) {
    if (traffic.has(page)) return traffic.get(page);
    const state = {records: [], previous: null};
    state.observe = request => {
      const path = new URL(request.url()).pathname, method = request.method();
      if (!['/api/market', '/api/market/portfolio', '/api/market/open', '/api/market/close'].includes(path)) return;
      let body; try { body = request.postDataJSON(); } catch { body = null; }
      const keys = Object.keys(body ?? {}).sort(), uid = body?.actionUid, signature = request.postData();
      const uidValid = typeof uid === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(uid);
      const expected = method !== 'POST' ? [] : path === '/api/market/open'
        ? ['actionUid', 'companyId', 'side', 'stake'] : ['actionUid', 'positionId'];
      const shape = JSON.stringify(keys) === JSON.stringify(expected);
      const bodyValid = method === 'GET' && ['/api/market', '/api/market/portfolio'].includes(path) && keys.length === 0
        || method === 'POST' && path === '/api/market/open' && shape && uidValid
          && body.companyId === 'recorded-market' && body.side === 'rising' && body.stake === 10
        || method === 'POST' && path === '/api/market/close' && shape && uidValid
          && typeof body.positionId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.positionId);
      state.records.push({path, method, authorized: Boolean(request.headers().authorization),
        bodyValid,
        sameUidAndBody: method === 'POST' && uidValid && state.previous?.uid === uid && state.previous?.signature === signature});
      if (method === 'POST') state.previous = {uid, signature}; // Runtime values stay in Node memory, never reports.
    };
    page.on('request', state.observe); traffic.set(page, state); return state;
  }
  async function snapshot(env) {
    const dom = await env.page.evaluate(() => ({positions: document.querySelectorAll('.market-position').length,
      closed: document.querySelectorAll('.market-closed').length, kits: document.querySelectorAll('.case-kit-name').length,
      crewCodes: document.querySelectorAll('.crew-code').length,
      journal: localStorage.getItem('plot_twist_intro_moves_v1')}));
    const {journal: kept, ...counts} = dom, proof = env.marketProof();
    const result = {...counts, proof: {...proof, ledgerReasons: [...proof.ledgerReasons]},
      requestIndex: traffic.get(env.page).records.length,
      authTokenCalls: env.requests.filter(request => request.path === '/auth/v1/token').length};
    privateJournals.set(result, kept); return result;
  }
  return {group: 'market', paths: ['/api/market/open'], method: 'POST', call, control,
    faultExpectation(fault) {
      if (fault.status === 401) return {phase: 'expired', words: /session expired.*sign in again/i,
        call: '.account-modal[open] .server-call:not([hidden])'};
      if (fault.status === 0) return {phase: 'offline', words: /^You are offline\./i};
      if (fault.status === 404) return {phase: 'error', words: /^This feature is unavailable\./i};
      if (fault.status === 409) return {phase: 'error', words: /^The service could not complete this request\./i};
      if (fault.status === 429) return {phase: 'rate_limited', words: /try again in \d+ s/i};
      if (fault.status === 503) return {phase: 'error', words: /^Service unavailable\./i};
      return {phase: 'error', words: /^The service could not complete this request\./i};
    },
    async setup(env) {
      install(env.page); env.resetMarket({flag: true, tradingEnabled: true}); await enterRecordedMarket(env);
      assert.equal(await env.page.locator(call).count(), 1,
        'Seven-fault coverage requires one actual mounted market shared-call component');
      await preparePosition(env, 'rising');
      assert.equal(await env.page.locator(control).count(), 1, 'The actual market confirm action is unambiguous');
      assert.ok(await env.page.locator(control).evaluate(element => element.tagName === 'BUTTON'
        && /^Open rising position for /.test(element.textContent) && !element.disabled),
      'Market chaos starts on the real enabled position confirm button');
    },
    async trigger({page}) { const confirm = page.locator(control); await confirm.focus(); await confirm.click(); },
    async afterTrigger(env, fault) {
      if (fault.status !== 401) return;
      await env.page.locator('.market-modal[open]').waitFor({state: 'hidden'});
      if (!await env.page.locator('.account-modal[open]').isVisible()) await openAccountControls(env.page);
      await env.page.locator('.account-modal[open] [data-focus="account-sign-in"]').waitFor({state: 'visible'});
    },
    snapshot,
    async unchanged(env, before, fault) {
      const after = await snapshot(env), expired = fault.status === 401;
      for (const key of ['positions', 'closed', 'kits', 'crewCodes']) assert.ok(expired ? after[key] <= before[key] : after[key] === before[key],
        'A refused market change adds no position, closed receipt, kit or crew');
      for (const key of ['opens', 'closes', 'repeats', 'unknownApplied']) assert.equal(after.proof[key], before.proof[key],
        'A refused market change adds no accepted server action');
      assert.deepEqual(after.proof.ledgerReasons, before.proof.ledgerReasons, 'A refused market change adds no server ledger grant');
      assert.ok(privateJournals.get(after) === privateJournals.get(before), 'Market refusals preserve accepted device replay');
      if ([0, 502, 503].includes(fault.status)) {
        await env.page.waitForFunction(() => !!document.querySelector('.market-modal[open] .market-status')?.textContent.trim());
        await env.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      const observed = traffic.get(env.page).records.slice(before.requestIndex), posts = observed.filter(request => request.method === 'POST');
      assert.equal(posts.length, expired ? 2 : 1, 'Only the explicit trade and one allowed A2 expiry renewal may write');
      assert.ok(observed.every(request => request.bodyValid && (request.path === '/api/market' ? !request.authorized : request.authorized)),
        'Faulted market requests preserve exact body fields, anonymous public reads and authorized private requests');
      if (expired) {
        assert.equal(posts[1].sameUidAndBody, true, 'The one A2 renewal preserves the original trade UID and body');
        assert.equal(after.authTokenCalls, before.authTokenCalls + 1, 'A2 renews once before final market expiry');
        assert.ok(env.checks.refreshed, 'The recorded final expiry uses the actual A2 renewal path');
      }
      if ([0, 502, 503].includes(fault.status)) {
        const write = observed.findIndex(request => request.method === 'POST');
        assert.ok(observed.some((request, index) => index > write && request.method === 'GET'
          && request.path === '/api/market/portfolio'), 'An uncertain/refused trade reads authoritative positions without an automatic repeat');
      }
      if (fault.status === 409) {
        assert.equal(await env.page.getByRole('button', {name: 'Keep this device', exact: true}).count(), 0,
          'A market stale_save refusal never opens SaveConflict choices');
        assert.equal(await env.page.getByRole('button', {name: 'Use the cloud save', exact: true}).count(), 0,
          'A market stale_save refusal never invents a cloud-save recovery action');
        assert.ok(!/save changed|which copy|save conflict/i.test(await env.page.locator(call).textContent()),
          'The market 409 uses its actual safe generic refusal words');
      }
      checkTransport(env, (value, label) => assert.ok(value, label));
    },
    async checkFocus({page}, fault, check) {
      await page.waitForFunction(status => {
        if (status === 401) {
          const button = document.querySelector('.account-modal[open] [data-focus="account-sign-in"]');
          return !!button && button.tagName === 'BUTTON' && !button.disabled && !button.closest('[hidden],[inert]')
            && button.getClientRects().length > 0 && document.activeElement === button;
        }
        const statusLine = document.querySelector('.market-modal[open] .server-call p.market-status');
        const announcement = statusLine?.parentElement.querySelector('.server-call-announcement[role="status"][aria-live="polite"]');
        return !!statusLine && statusLine.tagName === 'P' && statusLine.getAttribute('role') === null
          && statusLine.getAttribute('aria-live') === 'off' && !!announcement && statusLine.tabIndex === -1 && statusLine.textContent.trim().length > 0 && !statusLine.closest('[hidden],[inert]')
          && statusLine.getClientRects().length > 0 && document.activeElement === statusLine;
      }, fault.status);
      check(true, fault.status === 401 ? 'Market expiry gives the actual Account sign-in button focus'
        : 'Market refusal focuses its actual visible status paragraph without a test focus action');
    },
    async dispose({page}) {
      const state = traffic.get(page); if (state) page.off('request', state.observe); traffic.delete(page);
      if (await market(page).isVisible()) {
        await market(page).getByRole('button', {name: 'Close dialog', exact: true}).click();
        await market(page).waitFor({state: 'hidden'});
      }
    },
  };
}
