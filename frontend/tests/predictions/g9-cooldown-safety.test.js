// Injected HTTP/flow and native Desk controls; no service, SDK, account or database is contacted.
import {randomUUID} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createHttpDeskAdapter, predictionRetryUntil} from '../../src/screens/predictions/adapter-http.js';
import {createDeskFlow} from '../../src/screens/predictions/flow.js';
import {sentenceFor} from '../../src/screens/predictions/messages.js';
import {browserHarness} from '../g20-browser.js';

const native = browserHarness();
const good = data => ({ok: true, status: 200, data});
const failure = (status, code, message, extra = {}) => ({ok: false, status, code, message, ...extra});
const ask = () => ({questionId: randomUUID(), side: 'yes', amount: 20});
afterEach(() => vi.restoreAllMocks());

describe('prediction transport copy and durable receipt-clock ownership', () => {
  it('removes private server prose for no-answer and every 5xx status before flow or read presentation', async () => {
    const canary = `private-${randomUUID()}`;
    for (const status of [0, ...Array.from({length: 100}, (_, index) => 500 + index)]) {
      const response = failure(status, 'database_error', canary);
      const request = {get: async () => response, publicGet: async () => response, post: async () => response};
      const adapter = createHttpDeskAdapter({request}), flow = createDeskFlow({adapter});
      const result = await flow.stake(ask());
      expect(result.reply).toMatchObject({kind: 'unknown', status, message: sentenceFor('database_error')});
      expect(JSON.stringify(result)).not.toContain(canary);
      expect(await adapter.mine()).toMatchObject({message: sentenceFor('database_error')});
      expect(await adapter.list()).toMatchObject({message: sentenceFor('database_error')});
      flow.dispose();
    }
  });

  it('keeps only documented 503 nothing-done exceptions and supplies their fixed safe sentences', async () => {
    const canary = `private-${randomUUID()}`;
    for (const code of ['predictions_unavailable', 'source_unavailable', 'database_not_configured']) {
      for (const status of [500, 502, 503, 504]) {
        const adapter = createHttpDeskAdapter({request: {post: async () => failure(status, code, canary)}});
        const reply = await adapter.stake({...ask(), stakeId: randomUUID()});
        expect(reply.kind).toBe(status === 503 ? 'refused' : 'unknown');
        expect(reply.message).toBe(sentenceFor(code)); expect(JSON.stringify(reply)).not.toContain(canary);
      }
    }
  });

  it('holds the original fractional deadline across pause, blocks forced sends, then reads before repeating the same UID', async () => {
    let now = 1000.25; vi.spyOn(Date, 'now').mockImplementation(() => now);
    const calls = [], attempt = ask(); let first = true;
    const request = {
      get: async path => { calls.push({method: 'GET', path}); return good({coins: 100, stakes: []}); },
      post: async (path, body) => {
        calls.push({method: 'POST', path, body: structuredClone(body)});
        if (first) { first = false; return failure(429, 'too_many_requests', `private-${randomUUID()}`, {retryAfterSeconds: 3}); }
        return good({...attempt});
      },
    };
    const adapter = createHttpDeskAdapter({request});
    const flow = createDeskFlow({adapter, readBeforeRetry: true, validateReceipt: true});
    try {
      const initial = await flow.stake(attempt), deadline = 4000.25;
      expect(initial).toMatchObject({done: false, keepId: true, refresh: false, reply: {kind: 'wait'}});
      expect(flow.retryUntil).toBe(deadline); expect(predictionRetryUntil(initial.reply)).toBe(deadline);
      expect(initial.reply).not.toHaveProperty('retryUntil');
      flow.pause(); now = 2500.5;
      expect(flow.holdRetry(initial.reply)).toBe(deadline);
      expect(await flow.stake(attempt)).toMatchObject({done: false, refresh: false, reply: {kind: 'wait'}});
      now = 4000; await flow.stake(attempt); expect(calls).toHaveLength(1);
      now = deadline; expect((await flow.stake(attempt)).done).toBe(true);
      expect(calls.map(call => call.method)).toEqual(['POST', 'GET', 'POST']);
      expect(calls[2].body).toEqual(calls[0].body); expect(flow.retryUntil).toBe(deadline);
    } finally { flow.dispose(); }
    expect(flow.retryUntil).toBe(0);
  });

  it('retains a late POST429 before cancelling its closed ticket, then reads before an explicit same-account repeat', async () => {
    let now = 1000.25, generation = 0, active = true, resolvePost, markStarted;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const posted = new Promise(resolve => { markStarted = resolve; });
    const held = new Promise(resolve => { resolvePost = resolve; });
    const calls = [], attempt = ask(); let first = true;
    const adapter = createHttpDeskAdapter({request: {
      get: async path => { calls.push({method: 'GET', path}); return good({coins: 100, stakes: []}); },
      post: async (path, body) => { calls.push({method: 'POST', path, body: structuredClone(body)});
        if (first) { first = false; markStarted(); return held; } return good({...attempt}); },
    }});
    const flow = createDeskFlow({adapter, readBeforeRetry: true, validateReceipt: true,
      capture: () => generation, isCurrent: ticket => active && ticket === generation});
    try {
      const pending = flow.stake(attempt); await posted;
      active = false; generation += 1; flow.pause();
      resolvePost(failure(429, 'too_many_requests', 'Recorded refusal.', {retryAfterSeconds: 3}));
      expect((await pending).cancelled).toBe(true); expect(flow.retryUntil).toBe(4000.25);
      active = true; generation += 1; now = 2500.5;
      expect(await flow.stake(attempt)).toMatchObject({refresh: false, reply: {kind: 'wait'}}); expect(calls).toHaveLength(1);
      now = 4000.25; expect((await flow.stake(attempt)).done).toBe(true);
      expect(calls.map(call => call.method)).toEqual(['POST', 'GET', 'POST']); expect(calls[2].body).toEqual(calls[0].body);
    } finally { flow.dispose(); }
  });
});

async function mountDesk(page) {
  await page.clock.install(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 20));
  await page.evaluate(async () => {
    await window.g20Import('/src/ui/base.css'); await window.g20Import('/src/ui/kit/kit.css');
    const {createDesk} = await window.g20Import('/src/screens/predictions/desk.js');
    const {question, listAnswer, mineAnswer} = await window.g20Import('/tests/predictions/sample-answers.js');
    const q = question({id: crypto.randomUUID(), text: 'Recorded public prediction?',
      decidedBy: 'Recorded public resolution.', closesAt: new Date(Date.now() + 3600000).toISOString()});
    const okay = data => ({ok: true, status: 200, data});
    const proof = {mode: 'ok', requests: [], canary: `private-${crypto.randomUUID()}`, stakes: []};
    const identity = crypto.randomUUID(), canvas = document.createElement('canvas');
    canvas.tabIndex = 0; document.body.append(canvas); canvas.focus();
    proof.public429Started = new Promise(resolve => { proof.markPublic429 = resolve; });
    const mine = () => okay(mineAnswer({coins: 100, stakedToday: 0, leftToday: 200, stakes: structuredClone(proof.stakes)}));
    const request = {
      publicGet: async path => {
        proof.requests.push({method: 'PUBLIC_GET', path});
        if (proof.mode === 'read429') { proof.markPublic429(); return {ok: false, status: 429,
          code: 'too_many_requests', message: proof.canary, retryAfterSeconds: 3}; }
        if (proof.mode === 'read503') return {ok: false, status: 503, code: 'database_unavailable', message: proof.canary};
        return okay(listAnswer([q]));
      },
      get: async path => {
        proof.requests.push({method: 'GET', path});
        if (proof.holdMine) { proof.holdMine = false; return new Promise(resolve => { proof.resolveMine = () => resolve(mine()); }); }
        return mine();
      },
      post: async (path, body) => {
        proof.requests.push({method: 'POST', path, body: structuredClone(body)});
        if (proof.mode === 'post429') return {ok: false, status: 429, code: 'too_many_requests', message: proof.canary, retryAfterSeconds: 3};
        if (proof.mode === 'post503') return {ok: false, status: 503, code: 'database_unavailable', message: proof.canary};
        proof.stakes = [{questionId: body.questionId, side: body.side, amount: body.amount}];
        return okay({...proof.stakes[0]});
      },
    };
    const desk = createDesk({container: document.body, request, search: '', getFlags: () => ({predictions: true}),
      getIdentity: () => identity, onIdentityChange: () => () => {}, focus: () => canvas.focus()});
    Object.assign(proof, {desk, canvas, cleanup() { proof.resolveMine?.(); desk.dispose(); canvas.remove(); }});
    window.predictionCooldownProof = proof; await desk.open();
  });
}
const modal = page => page.locator('.desk-modal[open]');
const outerCall = page => modal(page).locator('.desk-body > .server-call');
const requests = page => page.evaluate(() => window.predictionCooldownProof.requests.length);
async function prepareNativeStake(page) {
  const card = modal(page).locator('.desk-card').first();
  await card.getByRole('radio', {name: 'Yes', exact: true}).evaluate(input => {
    input.checked = true; input.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await card.getByRole('spinbutton').evaluate(input => { input.value = '20'; input.dispatchEvent(new Event('input', {bubbles: true})); });
  const stake = card.locator('[data-focus="stake"]'); expect(await stake.isEnabled()).toBe(true);
  await stake.dispatchEvent('click');
  const confirm = card.getByRole('button', {name: 'Confirm', exact: true}); expect(await confirm.isEnabled()).toBe(true);
  return {card, confirm};
}

it('keeps a GET429 deadline while another read is held, including close/reopen and forced refresh', async () => {
  await native.withPage(async page => {
    await mountDesk(page);
    try {
      await page.evaluate(() => { const p = window.predictionCooldownProof;
        p.mode = 'read429'; p.holdMine = true; p.pendingRead = p.desk.refresh(); });
      await page.evaluate(() => window.predictionCooldownProof.public429Started);
      const before = await requests(page); await page.clock.runFor(1500);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.desk.close(); await p.desk.open(); });
      expect(await requests(page)).toBe(before);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.resolveMine(); await p.pendingRead; });
      const retry = outerCall(page).locator('[data-focus="retry-server-call"]');
      expect(await outerCall(page).getAttribute('data-state')).toBe('rate_limited'); expect(await retry.isDisabled()).toBe(true);
      await retry.evaluate(button => button.onclick?.()); await page.evaluate(() => window.predictionCooldownProof.desk.refresh());
      expect(await requests(page)).toBe(before);
      await page.clock.runFor(1499); expect(await retry.isDisabled()).toBe(true);
      await page.clock.runFor(1); expect(await retry.isEnabled()).toBe(true); expect(await requests(page)).toBe(before);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.mode = 'ok'; await p.desk.refresh(); });
      expect(await requests(page)).toBe(before + 2); expect(await modal(page).locator('.desk-card').count()).toBe(1);
      const canary = await page.evaluate(() => window.predictionCooldownProof.canary);
      expect(await modal(page).textContent()).not.toContain(canary);
    } finally { await page.evaluate(() => window.predictionCooldownProof?.cleanup()); }
  });
});

it('disables native Confirm and Stake with programmatic guards, then reopens against the original POST429 deadline', async () => {
  await native.withPage(async page => {
    await mountDesk(page);
    try {
      const {card, confirm} = await prepareNativeStake(page);
      await page.evaluate(() => { window.predictionCooldownProof.mode = 'post429'; });
      await confirm.dispatchEvent('click'); const before = await requests(page);
      expect(await modal(page).locator('.desk-questions > .server-call').getAttribute('data-state')).toBe('rate_limited');
      expect(await confirm.isDisabled()).toBe(true);
      const canary = await page.evaluate(() => window.predictionCooldownProof.canary);
      expect(await modal(page).textContent()).not.toContain(canary);
      await confirm.dispatchEvent('click');
      expect(await modal(page).locator('.desk-questions > .server-call').getAttribute('data-state')).toBe('rate_limited');
      expect(await requests(page)).toBe(before);
      await card.getByRole('button', {name: 'Back', exact: true}).dispatchEvent('click');
      expect(await card.locator('[data-focus="stake"]').isDisabled()).toBe(true);
      await card.locator('form').dispatchEvent('submit'); expect(await requests(page)).toBe(before);
      await page.clock.runFor(1500);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.desk.close(); await p.desk.open(); });
      expect(await requests(page)).toBe(before);
      const retry = outerCall(page).locator('[data-focus="retry-server-call"]'); expect(await retry.isDisabled()).toBe(true);
      await page.clock.runFor(1499); expect(await retry.isDisabled()).toBe(true);
      await page.clock.runFor(1); expect(await retry.isEnabled()).toBe(true); expect(await requests(page)).toBe(before);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.mode = 'ok'; await p.desk.refresh(); });
      expect(await modal(page).locator('[data-focus="stake"]').isEnabled()).toBe(true);
      expect(await page.evaluate(() => window.predictionCooldownProof.requests.filter(r => r.method === 'POST').length)).toBe(1);
    } finally { await page.evaluate(() => window.predictionCooldownProof?.cleanup()); }
  });
});

it('expires a still-mounted native confirmation once without recursively restoring its old deadline', async () => {
  await native.withPage(async page => {
    await mountDesk(page);
    try {
      const {confirm} = await prepareNativeStake(page);
      await page.evaluate(() => { window.predictionCooldownProof.mode = 'post429'; });
      await confirm.dispatchEvent('click'); const before = await requests(page);
      expect(await modal(page).locator('.desk-questions > .server-call').getAttribute('data-state')).toBe('rate_limited');
      expect(await confirm.isDisabled()).toBe(true);
      await page.clock.runFor(2999); expect(await confirm.isDisabled()).toBe(true);
      await page.clock.runFor(1); expect(await confirm.isEnabled()).toBe(true);
      expect(await requests(page)).toBe(before); expect(await modal(page).locator('.desk-card').count()).toBe(1);
    } finally { await page.evaluate(() => window.predictionCooldownProof?.cleanup()); }
  });
});

it('keeps private503 prose out of actual initial-read and uncertain-stake DOM', async () => {
  await native.withPage(async page => {
    await mountDesk(page);
    try {
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.mode = 'read503'; await p.desk.refresh(); });
      const canary = await page.evaluate(() => window.predictionCooldownProof.canary);
      expect(await outerCall(page).getAttribute('data-state')).toBe('error');
      expect(await modal(page).textContent()).not.toContain(canary);
      await page.evaluate(async () => { const p = window.predictionCooldownProof; p.mode = 'ok'; await p.desk.refresh(); });
      const {confirm} = await prepareNativeStake(page);
      await page.evaluate(() => { window.predictionCooldownProof.mode = 'post503'; }); await confirm.dispatchEvent('click');
      expect(await modal(page).locator('.desk-questions > .server-call').getAttribute('data-state')).toBe('error');
      expect(await modal(page).textContent()).not.toContain(canary);
      expect(await page.evaluate(() => window.predictionCooldownProof.requests.filter(r => r.method === 'POST').length)).toBe(1);
    } finally { await page.evaluate(() => window.predictionCooldownProof?.cleanup()); }
  });
});
