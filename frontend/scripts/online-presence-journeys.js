// Public-control production journeys. The fake server owns all HTTP and WebSocket answers.
import assert from 'node:assert/strict';
import {enterRecordedCrew} from './online-crew-journeys.js';
import {openSettingsAccount, openAccountControls, assertEngineReplay} from './online-browser-actions.js';
import {dismissIntro} from './intro-browser-fixture.js';
import {assertPresenceSendTiming} from './online-presence-send-observer.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!read()) { assert.ok(Date.now() < deadline, label); await wait(50); }
}
async function move(page, ms = 1400) {
  await page.locator('canvas[tabindex="0"]').focus();
  await page.keyboard.down('ArrowRight');
  try { await wait(ms); } finally { await page.keyboard.up('ArrowRight'); }
}
const positions = env => env.wire.records.filter(record => record.event === 'position');

// Run each case with its own newly opened fixture. Flags must include false, 'true', 1 and true/name:false.
// Auth's library request on a deliberate sign-in is allowed; the Realtime module remains absent.
export async function recordedPresenceGate(env, {flag = false, named = true, signedIn = true} = {}) {
  const {page} = env, realtimeRequests = [];
  env.setPresence(flag); env.setNamed(named);
  const listener = request => { if (/\/assets\/realtime-[^/]+\.js$/.test(new URL(request.url()).pathname)) realtimeRequests.push(true); };
  page.on('request', listener);
  try {
    await page.goto(env.url);
    const summary = await openSettingsAccount(page);
    if (signedIn) {
      await summary.getByRole('button', {name: /^Sign in(?: again)? with GitHub$/}).click();
      await until(() => env.checks.exchanged && env.crewRequests.some(request => request.path === '/api/me'),
        'The intercepted auth completes even while generated captain setup is pending');
    }
    // A4's initial boot can wait five seconds; a gate failure cannot hide behind that delay.
    await wait(5500);
    assert.equal(env.wire.connectionCount, 0, 'Unmet strict flag/name/account gates open no intercepted socket');
    assert.equal(env.wire.records.filter(record => record.event === 'join').length, 0, 'Unmet gates join no room');
    assert.equal(realtimeRequests.length, 0, 'Unmet gates do not import the Realtime module');
    assert.equal(env.wire.failures.length, 0, 'The gated path produces no protocol error');
    return {verified: true, strictFlag: flag === true, generatedName: named, signedIn};
  } finally { page.off('request', listener); }
}

// A headless browser may keep every tab visible. That is an explicit unverified result, never a pass.
export async function recordedNativeTabPause(env) {
  const {page} = env;
  env.wire.seed({shown: 2}); await wait(100);
  await page.locator('canvas[tabindex="0"]').focus();
  const start = positions(env).length;
  await page.keyboard.down('ArrowLeft');
  let other;
  try {
    await until(() => positions(env).length > start && positions(env).at(-1).moving,
      'A moving sample reaches the intercepted endpoint before the tab is hidden');
    other = await page.context().newPage(); await other.goto('about:blank'); await other.bringToFront();
    await wait(100);
    if (!await page.evaluate(() => document.hidden)) {
      return {verified: false, reason: 'Installed headless Chrome keeps this background tab visible; native tab-pause proof still required.'};
    }
    await wait(1000); // Permit the single final stationary/leave transition.
    const quiet = positions(env).length;
    await wait(1600);
    assert.equal(await page.evaluate(()=>document.hidden),true,'The measured page stays genuinely hidden');
    assert.equal(positions(env).length, quiet, 'A genuinely hidden tab stops recurring position broadcasts');
    return {verified: true};
  } finally {
    await page.keyboard.up('ArrowLeft'); await other?.close(); await page.bringToFront();
  }
}

export async function recordedPresenceReconnect(env) {
  const {page, wire} = env, requestStart = env.requests.length;
  const announced = wire.records.filter(record => record.event === 'track').length;
  await wire.disconnect();
  await page.waitForFunction(() => /Offline|Reconnecting/.test(document.querySelector('.presence-connection')?.textContent ?? ''));
  const quiet = positions(env).length;
  await wait(400); // A4 has at least a one-second reconnect gap.
  assert.equal(positions(env).length, quiet, 'A disconnected socket sends no old moving sample');
  await page.waitForFunction(() => /^Live/.test(document.querySelector('.presence-connection')?.textContent ?? ''), null, {timeout: 45000});
  await until(() => wire.activeRoomKinds.includes('place'), 'The intercepted connection rejoins its current place after interruption', 45000);
  // The world announcement has up to ten seconds of jitter; walking before it can reach a map edge.
  await until(() => wire.records.filter(record => record.event === 'track').length > announced,
    'The reconnected captain announces its current place before the next movement proof', 45000);
  assert.ok(!env.requests.slice(requestStart).some(request => /\/realtime\/v1\/api\/broadcast/.test(request.path)),
    'A4 never replaces a disconnected socket broadcast with an HTTPS write');
  assert.equal(wire.failures.length, 0, 'Reconnect preserves the intercepted Phoenix v2 protocol');
}

export async function recordedPresenceGolden(env, {width = 375, capture, nativePause = true, reconnect = true} = {}) {
  const {page, wire} = env, checks = [];
  const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
  env.setPresence(true); env.setNamed(true);
  await page.setViewportSize({width, height: 812});
  await enterRecordedCrew(env, 'two'); await dismissIntro(page);
  // Normal world reports supply coordinates; physical keys drive this movement proof.
  await move(page);
  await until(() => wire.activeRoomKinds.includes('place'), 'A4 joins its private place after physical movement');
  await until(() => wire.records.some(record => record.event === 'track' && record.place), 'A4 announces place without coordinates');
  wire.seed({shown: 2});
  await move(page, 2200);
  await until(() => !!wire.lastPosition && !wire.lastPosition.moving, 'A4 sends the final stationary sample');
  const origin = wire.lastPosition;
  for (let index = 0; index < 2; index += 1) wire.move(index, {x: origin.x + index + .5, z: origin.z + .5, moving: false});
  await page.waitForFunction(() => /2 shown/.test(document.querySelector('.presence-count')?.textContent ?? ''));
  // The polite status names drawn captains once their profiles arrive; give it the HUD's own update time.
  await page.waitForFunction(() => document.querySelector('.presence-hud .presence-sr-only')?.textContent.includes('Captain'),
    null, {timeout: 10000}).catch(() => {});
  check(await page.locator('.presence-hud .presence-sr-only').textContent().then(text => text.includes('Captain')),
    'A null server profile name is displayed as Captain');
  const captain = page.locator('.other-captain-label').filter({hasText: /^Captain$/});
  await captain.waitFor({state: 'visible'});
  await wait(450);
  const beforeMove = await captain.boundingBox(); assert.ok(beforeMove);
  await wait(100);
  const still = await captain.boundingBox(); assert.ok(still);
  assert.ok(Math.hypot(still.x-beforeMove.x,still.y-beforeMove.y)<2,
    'The peer label is stationary before its new remote coordinates');
  wire.move(0, {x: origin.x + 2, z: origin.z + .5, facing: 'right'});
  await page.waitForFunction(before => {
    const label=[...document.querySelectorAll('.other-captain-label')].find(label=>label.textContent==='Captain');
    if(!label)return false;const rect=label.getBoundingClientRect();
    return Math.hypot(rect.x-before.x,rect.y-before.y)>=8;
  }, still);
  wire.emote(0, 'wave'); await wait(100);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await capture?.('presence-two-captains-wave', page);
  check(true, 'Two intercepted captains appear and a valid movement changes the public label position');

  const samples = positions(env);
  check(samples.some(sample => sample.moving) && samples.some(sample => !sample.moving),
    'Physical movement sends both moving and stopped updates');
  check(samples.every(sample => sample.everyMs >= 500), 'Every emitted position declares a gap of at least 500 ms');
  // The routed endpoint is delivered through asynchronous automation IPC. Gate the real client
  // send clock at 500 ms; keep endpoint arrival gaps separately as delivery diagnostics.
  assertPresenceSendTiming(await wire.readSendTiming(), samples);
  const idleStart = positions(env).length; await wait(1200);
  check(positions(env).length === idleStart, 'A stopped captain does not send recurring stationary updates');

  const hud = page.locator('.presence-hud');
  await hud.getByRole('button', {name: 'Emotes', exact: true}).click();
  const wave = hud.getByRole('button', {name: 'Emote wave', exact: true}); await wave.click();
  await until(() => wire.records.some(record => record.event === 'emote' && record.emote === 'wave'), 'The public emote control reaches A4');
  await hud.getByRole('button', {name: 'Emotes', exact: true}).click();
  check(await wave.isDisabled(), 'The accepted local wave disables emotes for the three-second cooldown');
  const emotes = wire.records.filter(record => record.event === 'emote').length;
  await wave.dispatchEvent('click');
  check(wire.records.filter(record => record.event === 'emote').length === emotes, 'A forced emote cannot bypass the cooldown');
  await capture?.('presence-local-wave', page);
  await page.waitForFunction(() => {
    const wave = document.querySelector('[data-focus="presence-wave"]'); return wave && !wave.disabled;
  });

  wire.seed({shown: 8, hidden: 2});
  await wait(100); // The SDK presence sync first selects eight; coordinates arrive separately.
  for (let index = 0; index < 8; index += 1) wire.move(index, {
    x: origin.x + ((index % 4) - 1.5) * .9, z: origin.z + (Math.floor(index / 4) - .5) * .8, moving: false,
  });
  await page.waitForFunction(() => /8 shown · 2 hidden/.test(document.querySelector('.presence-count')?.textContent ?? ''));
  check(await hud.locator('.presence-more').textContent().then(text => /^\+2 more/.test(text)), 'Eight displayed captains retain the +2 more summary');
  check(await page.locator('.other-captain-label').count() <= 8, 'The production renderer has at most eight peer labels');
  await capture?.('presence-eight-plus-more', page);

  const beforePush = env.crewRequests.filter(request => request.path === '/api/crews/me' && request.method === 'GET').length;
  const beforeWrites = env.crewRequests.filter(request => request.method !== 'GET').length;
  wire.crewEvent('crew_changed');
  await until(() => env.crewRequests.filter(request => request.path === '/api/crews/me' && request.method === 'GET').length > beforePush,
    'A valid crew_changed nudge rereads the authoritative crew');
  check(env.crewRequests.filter(request => request.method !== 'GET').length === beforeWrites, 'A crew event nudge never fabricates a server change');
  const body = await page.locator('body').innerHTML();
  check([env.fixtureUserId, ...wire.peerIds, env.crewSnapshot().id].every(id => !body.includes(id)), 'Private player and crew IDs never become DOM view fields');
  check(wire.failures.length === 0, 'Production A4 uses the intercepted v2 protocol without fixture errors');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Presence controls fit the phone viewport');
  await assertEngineReplay(page);

  if (reconnect) await recordedPresenceReconnect(env);
  const pause = nativePause ? await recordedNativeTabPause(env) : {verified: false, reason: 'Native pause check not requested.'};
  await openAccountControls(page);
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await page.getByRole('button', {name: /^Sign in(?: again)? with GitHub$/}).first().waitFor();
  await until(() => wire.activeRoomKinds.length === 0, 'Sign-out leaves every private Realtime room');
  check(await page.locator('.presence-hud:visible,.other-captain-label:visible').count() === 0, 'Sign-out removes peer UI and local emote controls');
  return {checks, nativeTabPause: pause};
}

export async function recordedPresenceDeleteCleanup(env) {
  env.setPresence(true); await enterRecordedCrew(env, 'two'); await dismissIntro(env.page);
  await move(env.page); await until(() => env.wire.activeRoomKinds.includes('world'), 'Delete journey starts a real intercepted A4 connection');
  await openAccountControls(env.page);
  await env.page.getByRole('button', {name: 'Delete my data', exact: true}).click();
  await env.page.getByRole('button', {name: 'Confirm deletion', exact: true}).click();
  await until(() => env.wire.activeRoomKinds.length === 0, 'Confirmed data deletion closes every private Realtime room');
  assert.equal(await env.page.locator('.presence-hud:visible,.other-captain-label:visible').count(), 0,
    'Confirmed deletion clears public peer UI');
}
