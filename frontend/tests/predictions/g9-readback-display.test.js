// Actual Desk/Questions/flow with injected answers; no service, SDK, account or database.
import {expect, it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createDeskFlow} from '../../src/screens/predictions/flow.js';
import {browserHarness} from '../g20-browser.js';

const native = browserHarness();
const modal = page => page.locator('.desk-modal[open]');
const outerCall = page => modal(page).locator('.desk-body > .server-call');
const innerCall = page => modal(page).locator('.desk-questions > .server-call');

it('keeps an unreadable matching row unknown, then returns the actual confirmed row without another POST', async () => {
  const questionId = randomUUID(), sent = []; let reads = 0;
  const flow = createDeskFlow({readBeforeRetry: true, adapter: {makeStakeId: randomUUID,
    stake: async body => {sent.push(body); return {kind: 'unknown', status: 503};},
    mine: async () => ({kind: 'ok', data: {stakes: [{questionId, side: 'yes', amount: ++reads === 1 ? null : 20}]}}),
  }});
  try {
    await flow.stake({questionId, side: 'yes', amount: 20});
    const edited = {questionId, side: 'no', amount: 10};
    expect(await flow.stake(edited)).toMatchObject({done: false, keepId: true, reply: {kind: 'unknown'}});
    expect(await flow.stake(edited)).toMatchObject({done: true,
      reply: {kind: 'done', data: {questionId, side: 'yes', amount: 20}}});
    expect(sent).toHaveLength(1); expect(reads).toBe(2);
  } finally {flow.dispose();}
});

async function mount(page, {status = null, holdPost = false} = {}) {
  await page.evaluate(async ({status, holdPost}) => {
    await window.g20Import('/src/ui/base.css'); await window.g20Import('/src/ui/kit/kit.css');
    const {createDesk} = await window.g20Import('/src/screens/predictions/desk.js');
    const {createModal} = await window.g20Import('/src/ui/kit/modal.js');
    const {question, listAnswer, mineAnswer, stakeRow} = await window.g20Import('/tests/predictions/sample-answers.js');
    const q = question({id: crypto.randomUUID(), text: 'Recorded recovery question?', decidedBy: 'Recorded public resolution.',
      closesAt: new Date(Date.now() + 3600000).toISOString()});
    const okay = data => ({ok: true, status: 200, data});
    const unavailable = () => ({ok: false, status: 503, code: 'database_unavailable', message: 'Recorded read unavailable.'});
    const proof = {mineReads: 0, posts: [], status, holdPost};
    proof.postStarted = new Promise(resolve => {proof.markPosted = resolve;});
    const refusal = () => status === 429
      ? {ok: false, status: 429, code: 'too_many_requests', message: 'Recorded wait.', retryAfterSeconds: 3}
      : {ok: false, status: 404, code: 'feature_off', message: 'Recorded closed desk.'};
    const request = {
      publicGet: async () => okay(listAnswer([q])),
      get: async () => {
        proof.mineReads += 1;
        if (status !== null || proof.mineReads === 1) return okay(mineAnswer({coins: 100, stakes: []}));
        if (proof.mineReads === 3) return okay(mineAnswer({coins: 80,
          stakes: [stakeRow({questionId: q.id, text: q.text, side: 'yes', amount: 20})]}));
        return unavailable();
      },
      post: async (path, body) => {
        proof.posts.push({path, body: structuredClone(body)}); proof.markPosted();
        if (holdPost) return new Promise(resolve => {proof.releasePost = () => resolve(refusal());});
        return status === null ? unavailable() : refusal();
      },
    };
    const canvas = document.createElement('canvas'); canvas.tabIndex = 0; document.body.append(canvas); canvas.focus();
    const identity = crypto.randomUUID();
    const desk = createDesk({container: document.body, request, search: '', getFlags: () => ({predictions: true}),
      getIdentity: () => identity, onIdentityChange: () => () => {}, focus: () => canvas.focus()});
    Object.assign(proof, {desk, canvas,
      other() {
        const button = document.createElement('button'); button.textContent = 'Recorded other action';
        proof.otherButton = button; proof.otherModal = createModal({title: 'Recorded other panel', body: button});
        proof.otherModal.open(document.body, button);
      },
      cleanup() {proof.releasePost?.(); desk.dispose(); proof.otherModal?.dispose(); canvas.remove();},
    });
    window.predictionReadbackProof = proof; await desk.open();
  }, {status, holdPost});
}
async function prepare(page, amount = '20', side = 'Yes') {
  const card = modal(page).locator('.desk-card').first();
  await card.getByRole('radio', {name: side, exact: true}).check();
  await card.getByRole('spinbutton').fill(amount);
  await card.locator('[data-focus="stake"]').click();
  return card.getByRole('button', {name: 'Confirm', exact: true});
}
const settleNative = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

it('shows the confirmed server stake after edited retry readback even when both follow-up reads fail', async () => {
  await native.withPage(async page => {
    await mount(page);
    try {
      await (await prepare(page)).click();
      await page.waitForFunction(() => window.predictionReadbackProof.mineReads === 2
        && document.querySelector('.desk-body > .server-call')?.dataset.state === 'error');
      // The uncertain original was 20 YES; the player deliberately edits the next draft to 10 NO.
      await modal(page).getByRole('button', {name: 'Back', exact: true}).click();
      await (await prepare(page, '10', 'No')).click();
      await page.waitForFunction(() => window.predictionReadbackProof.mineReads === 4
        && document.querySelector('.desk-body > .server-call')?.dataset.state === 'error');
      expect(await modal(page).locator('.desk-your-stake').textContent()).toBe('Your stake: 20 coins on YES');
      expect(await modal(page).locator('.desk-your-stake').textContent()).not.toContain('10 coins');
      const writes = await page.evaluate(() => window.predictionReadbackProof.posts.map(row => ({path: row.path,
        side: row.body.side, amount: row.body.amount, exactKeys: Object.keys(row.body).sort().join(',')})));
      expect(writes).toEqual([{path: '/api/predictions/stake', side: 'yes', amount: 20,
        exactKeys: 'amount,questionId,side,stakeId'}]);
      expect(await modal(page).locator('[data-focus="stake"]').count()).toBe(0);
    } finally {await page.evaluate(() => window.predictionReadbackProof?.cleanup());}
  });
});

it.each([404, 429])('focuses the actual available Report link after a %i stake refusal', async status => {
  await native.withPage(async page => {
    await mount(page, {status});
    try {
      await (await prepare(page)).click();
      await page.waitForFunction(phase => document.querySelector('.desk-questions > .server-call')?.dataset.state === phase,
        status === 429 ? 'rate_limited' : 'error');
      if (status === 404) await page.waitForFunction(() => window.predictionReadbackProof.mineReads === 2
        && document.querySelector('.desk-body > .server-call')?.hidden === true);
      const report = innerCall(page).getByRole('link', {name: 'Report a problem', exact: true});
      expect(await report.isVisible()).toBe(true);
      expect(await report.evaluate(link => link === document.activeElement)).toBe(true);
      if (status === 429) expect(await modal(page).getByRole('button', {name: 'Confirm', exact: true}).isDisabled()).toBe(true);
      expect(await page.evaluate(() => window.predictionReadbackProof.posts.length)).toBe(1);
    } finally {await page.evaluate(() => window.predictionReadbackProof?.cleanup());}
  });
});

it.each([404, 429])('does not focus a late %i refusal after its owner closes and another native dialog opens', async status => {
  await native.withPage(async page => {
    await mount(page, {status, holdPost: true});
    try {
      await (await prepare(page)).click(); await page.evaluate(() => window.predictionReadbackProof.postStarted);
      await page.keyboard.press('Escape'); await modal(page).waitFor({state: 'hidden'});
      await page.evaluate(() => window.predictionReadbackProof.other());
      await page.evaluate(() => window.predictionReadbackProof.releasePost()); await settleNative(page);
      expect(await page.evaluate(() => {const p = window.predictionReadbackProof; return document.activeElement === p.otherButton;})).toBe(true);
      expect(await modal(page).count()).toBe(0);
      expect(await page.evaluate(() => window.predictionReadbackProof.posts.length)).toBe(1);
    } finally {await page.evaluate(() => window.predictionReadbackProof?.cleanup());}
  });
});
