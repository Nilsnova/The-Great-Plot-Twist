// These exports extend test:online/check-online-chaos; they never inspect production internals.
import assert from 'node:assert/strict';
import {signInFromTitle} from './online-chaos-signin.js';
import {openAccountControls, openCrewFromHud, assertEngineReplay} from './online-browser-actions.js';
import {dismissIntro} from './intro-browser-fixture.js';

const crewScreen = page => page.locator('.case-modal[open] .case-crew');
const writeCount = env => env.crewRequests.filter(request => request.method === 'POST' && request.path.startsWith('/api/crews')).length;
const waitPlayers = (page, count) => page.waitForFunction(count =>
  document.querySelectorAll('.case-modal[open] .crew-seat[data-kind="player"]').length === count, count);

export async function enterRecordedCrew(env, scenario = 'none') {
  env.resetCrew(scenario);
  await signInFromTitle(env);
  await openAccountControls(env.page);
  await env.page.getByRole('button', {name: 'Change captain name once', exact: true}).waitFor();
  await env.page.keyboard.press('Escape');
  await env.page.locator('.account-modal').waitFor({state: 'hidden'});
  await env.page.locator('.shell-menu').getByRole('button', {name: 'Continue', exact: true}).click();
  await env.page.locator('.hud.exploring').waitFor();
  await dismissIntro(env.page);
  await openCrewFromHud(env.page);
  await crewScreen(env.page).waitFor();
}

async function preview(env, code) {
  const before = writeCount(env), screen = crewScreen(env.page);
  await screen.getByRole('textbox', {name: 'Crew code', exact: true}).fill(code);
  await screen.getByRole('button', {name: 'Check crew code', exact: true}).click();
  await screen.getByRole('button', {name: 'Confirm join', exact: true}).waitFor();
  assert.equal(writeCount(env), before, 'Preview spends no guess and sends no crew write');
  assert.match(await screen.locator('.case-notice').textContent(), /confirm|check/i);
}

async function confirm(env) {
  await crewScreen(env.page).getByRole('button', {name: 'Confirm join', exact: true}).click();
}

export async function recordedCrewGolden(env, {width = 375, capture, musterOnly = false} = {}) {
  const {page} = env, checks = [];
  const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
  await page.setViewportSize({width, height: 812});
  await enterRecordedCrew(env);
  const beforeCreate = writeCount(env);
  await crewScreen(page).getByRole('button', {name: 'Start a crew', exact: true}).click();
  await waitPlayers(page, 1);
  check(writeCount(env) === beforeCreate + 1, 'Create uses exactly one body-free POST');
  env.secondCaptainJoins();
  await waitPlayers(page, 2); // Public forming-crew polling, no injected adapter event.
  await crewScreen(page).getByRole('button', {name: 'Muster with NPC partners', exact: true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.case-modal[open] .crew-seat[data-kind="npc"]').length === 2);
  check(true, 'The authoritative muster shows two captains and two partner seats');
  await capture?.('crew-muster', page);
  await dismissIntro(page);
  await crewScreen(page).waitFor({state:'hidden'});
  check(await page.locator('.shell-screen[open]').count()===0
    &&await page.locator('canvas[tabindex="0"]').first().isVisible(), 'The world is unobstructed after the server-confirmed muster');
  await page.waitForTimeout(500); // Let the already-requested crew art finish before visual review.
  await capture?.('crew-world-partners', page);
  if(musterOnly)return {checks};

  // Any occupied forming seat may muster; the second seat is deliberately not the creator.
  await enterRecordedCrew(env, 'nonhost');
  await waitPlayers(page, 2);
  await crewScreen(page).getByRole('button', {name: 'Muster with NPC partners', exact: true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.case-modal[open] .crew-seat[data-kind="npc"]').length === 2);
  check(true, 'A forming captain in seat two can ask the server to muster');

  // A forming owned one-player draft permits joining another crew.
  await enterRecordedCrew(env, 'solo');
  env.setJoinCode('K7QF2M');
  await preview(env, ' k7q - f2m ');
  await confirm(env); await waitPlayers(page, 2);
  check(env.crewRequests.filter(request => request.path === '/api/crews/join' && request.method === 'POST').at(-1)?.codeNormalized,
    'Joining a solo draft uses the normalized code only after confirmation');

  for (const code of ['A', 'ABCDEFGHIJKLMNOPQRST']) {
    await enterRecordedCrew(env, 'finished'); env.setJoinCode(code);
    const field = crewScreen(page).getByRole('textbox', {name: 'Crew code', exact: true});
    check(await field.getAttribute('maxlength') === null || Number(await field.getAttribute('maxlength')) >= 20,
      'The code field accepts the approved twenty-character limit');
    await preview(env, code.toLowerCase()); await confirm(env); await waitPlayers(page, 2);
    const last = env.crewRequests.filter(request => request.path === '/api/crews/join' && request.method === 'POST').at(-1);
    check(last.codeLength === code.length && last.codeNormalized, `The ${code.length}-character normalized boundary reaches the server`);
  }
  await enterRecordedCrew(env, 'finished');
  await crewScreen(page).getByRole('button', {name: 'Start a crew', exact: true}).click(); await waitPlayers(page, 1);
  check(true, 'A former finished crew allows a new create request');

  await enterRecordedCrew(env); env.setJoinCode('VALID20');
  for (const wrong of ['WRONG1', 'WRONG2', 'WRONG3']) {
    await preview(env, wrong); await confirm(env);
    await page.locator('.case-modal[open] .server-call').getByText('No crew has that code.', {exact: true}).first().waitFor();
  }
  check(env.controlledCrewResponses.filter(response => response.status === 404).length === 3,
    'Three confirmed wrong guesses are visible refusals');
  env.faultCrew('/api/crews/join', {status: 429, code: 'too_many_requests'});
  await preview(env, 'VALID20'); await confirm(env);
  const retry = page.locator('.case-modal[open] .server-call').getByRole('button', {name: /^Retry/});
  await retry.waitFor(); check(await retry.isDisabled(), 'The server wait disables retry');
  const duringWait = writeCount(env);
  await crewScreen(page).getByRole('button', {name: 'Confirm join', exact: true}).dispatchEvent('click');
  check(writeCount(env) === duringWait, 'Forced join activation cannot bypass the server countdown');
  await capture?.('crew-countdown', page);
  await page.waitForFunction(() => {
    const button = document.querySelector('.case-modal[open] [data-focus="retry-server-call"]');
    return button && !button.disabled;
  });
  check(writeCount(env) === duringWait, 'The countdown itself sends no write');

  await enterRecordedCrew(env);
  await page.setViewportSize({width: 375, height: 400});
  const input = crewScreen(page).getByRole('textbox', {name: 'Crew code', exact: true}); await input.focus();
  check(['characters', 'on'].includes(await input.getAttribute('autocapitalize')), 'Phone code entry keeps automatic capitalization');
  check(['text', 'latin'].includes(await input.getAttribute('inputmode')), 'Phone code entry requests a fitting keyboard');
  const box = await input.boundingBox(); check(box && box.y >= 0 && box.y + box.height <= 400, 'The focused code field stays in the short viewport');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The crew screen fits the short phone viewport');
  await assertEngineReplay(page); check(true, 'Crew controls never add presentation actions to engine replay');
  return {checks};
}

export function createRecordedCrewChaosJourney(action = 'join') {
  assert.ok(['join', 'muster'].includes(action));
  return {
    group: 'crew', paths: [action === 'join' ? '/api/crews/join' : '/api/crews/me/start'], method: 'POST',
    call: '.case-modal[open] .server-call', focus: action === 'join' ? 'confirm-join' : 'muster',
    async setup(env) { await enterRecordedCrew(env, action === 'join' ? 'solo' : 'nonhost');
      if (action === 'join') { env.setJoinCode('K7QF2M'); await preview(env, 'k7q-f2m'); } },
    async trigger({page}) { await page.locator(`[data-focus="${this.focus}"]`).focus();
      await page.locator(`[data-focus="${this.focus}"]`).click(); },
    async snapshot({page}) { return page.evaluate(() => ({
      players: document.querySelectorAll('.crew-seat[data-kind="player"]').length,
      partners: document.querySelectorAll('.crew-seat[data-kind="npc"]').length,
      replay: localStorage.getItem('plot_twist_intro_moves_v1'),
    })); },
    async unchanged(env, before, fault) {
      const after = await this.snapshot(env);
      assert.equal(after.partners, before.partners, 'A refused crew change grants no partner');
      assert.ok(fault.status === 401 ? after.players <= before.players : after.players === before.players,
        'A refused crew change grants no captain seat');
      assert.equal(after.replay, before.replay, 'Crew refusal preserves the local replay');
    },
  };
}

export async function recordedUnknownCrewWrites(env) {
  for (const action of ['join', 'muster']) for (const status of [0, 503]) {
    await enterRecordedCrew(env, action === 'join' ? 'solo' : 'nonhost');
    const path = action === 'join' ? '/api/crews/join' : '/api/crews/me/start';
    if (action === 'join') { env.setJoinCode('K7QF2M'); await preview(env, 'k7q-f2m'); }
    const start = env.crewRequests.length;
    env.faultCrew(path, {status, code: 'database_unavailable', apply: true});
    if (action === 'join') await confirm(env);
    else await crewScreen(env.page).getByRole('button', {name: 'Muster with NPC partners', exact: true}).click();
    await env.page.waitForFunction(() => {
      const call = document.querySelector('.case-modal[open] .server-call');
      return call?.dataset.state === 'ready';
    });
    const requests = env.crewRequests.slice(start).filter(request => request.path.startsWith('/api/crews'));
    const writes = requests.map((request,index) => request.path===path&&request.method==='POST'?index:-1)
      .filter(index => index>=0);
    assert.equal(writes.length,2,'The uncertain operation and its one repeat are both observed');
    assert.ok(requests.slice(writes[0]+1,writes[1]).some(request =>
      request.path==='/api/crews/me'&&request.method==='GET'),
    'Unknown crew writes reread after the write and before one plain repeat');
    assert.equal(requests.filter(request => request.method === 'POST').length, 2, 'Unknown crew outcomes send at most one repeat');
    if (action === 'join') assert.ok(requests.filter(request => request.method === 'POST').every(request => request.codeLength === 6 && request.codeNormalized),
      'The repeated join retains its normalized payload');
  }
}

export async function recordedLateCrewReplyAfterSignOut(env) {
  await enterRecordedCrew(env, 'nonhost');
  const hold = env.holdCrew('/api/crews/me/start');
  await crewScreen(env.page).getByRole('button', {name: 'Muster with NPC partners', exact: true}).click();
  await hold.started;
  await openAccountControls(env.page);
  await env.page.getByRole('button', {name: 'Sign out', exact: true}).click();
  await env.page.getByRole('button', {name: /^Sign in(?: again)? with GitHub$/}).first().waitFor();
  const afterSignOut = env.crewRequests.length;
  const response = env.page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/crews/me/start');
  hold.release(); await response;
  await env.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await env.page.locator('.crew-seat[data-kind="npc"]').count(), 0, 'A late old-account muster cannot republish partners');
  assert.ok(env.crewRequests.slice(afterSignOut).every(request => request.path === '/api/config'),
    'A late old-account write triggers no follow-up private read or repeat');
  assert.ok(!env.wire.activeRoomKinds.length, 'A late old-account response cannot restart live rooms');
  await assertEngineReplay(env.page);
}
