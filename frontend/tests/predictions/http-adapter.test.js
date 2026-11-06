// The HTTP adapter: which route each call uses, what it sends, and how every answer is mapped.
import { describe, expect, it } from 'vitest';
import { createHttpDeskAdapter } from '../../src/screens/predictions/adapter-http.js';
import { createRequest } from '../../src/screens/predictions/request.js';
import { createDeskFlow } from '../../src/screens/predictions/flow.js';
import { failed, good, listAnswer, mineAnswer } from './sample-answers.js';

// A request stand-in that records calls and returns what the test queued up.
function fakeRequest(...answers) {
  const calls = [];
  const next = () => answers.shift() ?? good({});
  return {
    calls,
    get: (path, options) => (calls.push({ method: 'GET', path, options }), Promise.resolve(next())),
    post: (path, body) => (calls.push({ method: 'POST', path, body }), Promise.resolve(next())),
  };
}

// A fetch stand-in for the real request layer: it records calls and plays queued answers.
function scriptedFetch(...steps) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : undefined });
    const step = steps.shift();
    if (step instanceof Error) throw step;
    const { status = 200, body = {}, headers = {} } = step ?? {};
    return {
      ok: status < 300,
      status,
      headers: { get: name => headers[name] ?? null },
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

const STAKE = { questionId: 'avengers-opening-record', side: 'yes', amount: 20, stakeId: 'stake-aaaa-0001' };

describe('which route each call uses', () => {
  it('lists the questions without a token, and reads my stakes with one', async () => {
    const { fetchImpl, calls } = scriptedFetch({ body: listAnswer() }, { body: mineAnswer() });
    const adapter = createHttpDeskAdapter({ request: createRequest({ getToken: () => 'tok-1', fetchImpl }) });
    await adapter.list();
    await adapter.mine();
    expect(calls[0].url).toBe('/api/predictions');
    expect(calls[0].options.headers.Authorization).toBeUndefined();
    expect(calls[1].url).toBe('/api/predictions/mine');
    expect(calls[1].options.headers.Authorization).toBe('Bearer tok-1');
  });

  it('wraps a good answer as { kind: "ok", data }', async () => {
    const request = fakeRequest(good(listAnswer()));
    expect(await createHttpDeskAdapter({ request }).list()).toEqual({ kind: 'ok', data: listAnswer() });
  });
});

describe('an answer that is not what it should be', () => {
  it('counts a good status with no list as an answer that did not come through', async () => {
    for (const data of [null, {}, { questions: 'no' }, '<html></html>']) {
      const reply = await createHttpDeskAdapter({ request: fakeRequest(good(data)) }).list();
      expect(reply).toMatchObject({ kind: 'unknown', code: 'bad_answer', message: 'Something went wrong. Try again.' });
    }
  });

  it('counts a good status with nothing like "mine" as an answer that did not come through', async () => {
    for (const data of [null, {}, { coins: 5 }, { coins: 'many', stakes: [] }]) {
      const reply = await createHttpDeskAdapter({ request: fakeRequest(good(data)) }).mine();
      expect(reply).toMatchObject({ kind: 'unknown', code: 'bad_answer' });
    }
  });

  it('lets a real list and a real "mine" through', async () => {
    const adapter = createHttpDeskAdapter({ request: fakeRequest(good(listAnswer([])), good(mineAnswer())) });
    expect((await adapter.list()).kind).toBe('ok');
    expect((await adapter.mine()).kind).toBe('ok');
  });
});

describe('what a stake and a settlement send', () => {
  it('sends exactly { questionId, side, amount, stakeId } and never a player id', async () => {
    const request = fakeRequest(good({ questionId: STAKE.questionId }));
    await createHttpDeskAdapter({ request }).stake({ ...STAKE, playerId: 'someone-else', coins: 99999 });
    expect(request.calls[0].method).toBe('POST');
    expect(request.calls[0].path).toBe('/api/predictions/stake');
    expect(request.calls[0].body).toEqual(STAKE);
    expect(Object.keys(request.calls[0].body)).toEqual(['questionId', 'side', 'amount', 'stakeId']);
  });

  it('sends exactly { questionId, outcome } for a settlement', async () => {
    const request = fakeRequest(good({}));
    await createHttpDeskAdapter({ request }).settle({ questionId: 'q-1', outcome: 'void', playerId: 'x' });
    expect(request.calls[0].path).toBe('/api/predictions/settle');
    expect(request.calls[0].body).toEqual({ questionId: 'q-1', outcome: 'void' });
  });
});

describe('how answers are mapped', () => {
  const map = async (answer, call = 'stake') => {
    const adapter = createHttpDeskAdapter({ request: fakeRequest(answer) });
    return call === 'stake' ? adapter.stake(STAKE) : call === 'list' ? adapter.list() : adapter.mine();
  };

  it('treats 404 feature_off as the closed desk, on every call', async () => {
    const off = failed(404, 'feature_off', 'The prediction desk is closed for now.');
    for (const call of ['stake', 'list', 'mine']) {
      expect(await map(off, call)).toMatchObject({ kind: 'closed', message: 'The prediction desk is closed for now.' });
    }
  });

  it('treats a server without the routes (404 not_found) as the closed desk too', async () => {
    expect(await map(failed(404, 'not_found', 'Not Found'), 'list')).toMatchObject({ kind: 'closed' });
  });

  it('keeps 404 no_such_question as a plain refusal', async () => {
    const reply = await map(failed(404, 'no_such_question', 'That question is not on the prediction desk.'));
    expect(reply).toMatchObject({ kind: 'refused', code: 'no_such_question' });
  });

  it('asks the player to sign in after a 401', async () => {
    const reply = await map(failed(401, 'unauthorized', 'Please sign in again.'), 'mine');
    expect(reply).toEqual({ kind: 'signin', message: 'Sign in with GitHub to stake coins.' });
  });

  it('counts 409 already_applied as done', async () => {
    const reply = await map(failed(409, 'already_applied', 'This stake was already placed.'));
    expect(reply).toMatchObject({ kind: 'done', alreadyApplied: true, message: 'This stake was already placed.' });
  });

  it('says how long to wait after a 429', async () => {
    const reply = await map(failed(429, 'too_many_requests', 'Slow down.', { retryAfterSeconds: 7 }));
    expect(reply).toEqual({
      kind: 'wait',
      code: 'too_many_requests',
      seconds: 7,
      message: 'Too many tries. Wait 7 seconds, then try again.',
    });
  });

  it('still answers a 429 without Retry-After', async () => {
    const reply = await map(failed(429, 'too_many_requests', 'Slow down.'));
    expect(reply).toMatchObject({ kind: 'wait', seconds: null });
    expect(reply.message).toBe('Too many tries. Wait a few seconds, then try again.');
  });

  it('keeps clear refusals as refused, with the server message', async () => {
    const message = 'You already staked 20 coins on YES for this question. One stake per question.';
    expect(await map(failed(409, 'already_staked', message))).toEqual({
      kind: 'refused',
      status: 409,
      code: 'already_staked',
      message,
    });
    expect(await map(failed(422, 'stake_too_big', 'x'))).toMatchObject({ kind: 'refused', code: 'stake_too_big' });
    expect(await map(failed(403, 'forbidden', 'Only a host can do this.'))).toMatchObject({ kind: 'refused' });
  });

  it('keeps a 503 that changed nothing as refused', async () => {
    for (const code of ['predictions_unavailable', 'source_unavailable', 'database_not_configured']) {
      expect(await map(failed(503, code, 'Try later.'))).toMatchObject({ kind: 'refused', code });
    }
  });

  it('calls the outcome unknown after a network error, a timeout, database_unavailable and server errors', async () => {
    const unknowns = [
      failed(0, 'network_error', 'No connection to the server. Check your internet and try again.'),
      failed(0, 'timeout', 'The server took too long to answer. Try again.'),
      failed(503, 'database_unavailable', 'x'),
      failed(502, 'database_error', 'x'),
      failed(500, 'server_error', 'x'),
    ];
    for (const answer of unknowns) {
      expect(await map(answer)).toMatchObject({ kind: 'unknown', code: answer.code });
    }
  });
});

describe('the stake id', () => {
  it('has 8 to 64 characters from letters, digits, hyphen and underscore', () => {
    const adapter = createHttpDeskAdapter({ request: fakeRequest() });
    for (let i = 0; i < 20; i += 1) expect(adapter.makeStakeId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('is different every time', () => {
    const adapter = createHttpDeskAdapter({ request: fakeRequest() });
    const ids = new Set(Array.from({ length: 50 }, () => adapter.makeStakeId()));
    expect(ids.size).toBe(50);
  });

  it('is not marked as a practice desk', () => {
    expect(createHttpDeskAdapter({ request: fakeRequest() }).label).toBeNull();
  });
});

describe('a real stake through the whole chain', () => {
  const ask = { questionId: 'avengers-opening-record', side: 'yes', amount: 20 };

  it('retries after a network error with the same stake id, and a new click after a 200 gets a new one', async () => {
    const receipt = { ...ask, coins: 920, stakedToday: 20, leftToday: 180, sides: [], totalCoins: 20 };
    const { fetchImpl, calls } = scriptedFetch(new TypeError('Failed to fetch'), { body: receipt }, { body: receipt });
    const adapter = createHttpDeskAdapter({ request: createRequest({ getToken: () => 'tok', fetchImpl }) });
    const flow = createDeskFlow({ adapter });

    const first = await flow.stake(ask);
    expect(first.done).toBe(false);
    const second = await flow.stake(ask);
    expect(second.done).toBe(true);
    const third = await flow.stake(ask);

    expect(calls[1].body.stakeId).toBe(calls[0].body.stakeId);
    expect(calls[2].body.stakeId).not.toBe(calls[0].body.stakeId);
    expect(calls[0].body).toMatchObject(ask);
  });
});
