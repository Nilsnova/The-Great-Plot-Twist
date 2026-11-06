// Sports transport: fixed same-origin routes, public board, and verified own-account intents.
// A lost write answer is unknown. The caller retains its stakeId and retries the same intent.
const BASE = '/api/sports';
const id = value => typeof value === 'string' && /^(fd|bdl)-[1-9][0-9]{0,14}$/.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0;
const date = value => text(value) && Number.isFinite(Date.parse(value));
const picks = new Set(['home', 'draw', 'away']);
const rules = value => count(value?.minStake) && value.minStake > 0 && count(value.maxStake)
  && value.maxStake >= value.minStake && count(value.dailyCap) && count(value.poolCutPercent)
  && count(value.pickLeadMinutes);
const fixture = value => id(value?.id) && text(value.home) && text(value.away)
  && date(value.kickoff) && date(value.closesAt) && text(value.status)
  && ['live', 'recorded'].includes(value.source) && typeof value.canStake === 'boolean'
  && Array.isArray(value.picks) && value.picks.length >= 2 && value.picks.every(pick => picks.has(pick))
  && ['open', 'settled'].includes(value.pool?.status)
  && (value.pool.status === 'open' ? value.pool.outcome === null
    : (picks.has(value.pool.outcome) || value.pool.outcome === 'void') && count(value.pool.paidCoins) && count(value.pool.cutCoins))
  && count(value.pool.total) && value.pool.sides !== null && typeof value.pool.sides === 'object'
  && !Array.isArray(value.pool.sides) && Object.entries(value.pool.sides).every(([pick, side]) =>
    value.picks.includes(pick) && count(side?.coins) && count(side.players));
const stake = value => text(value?.id) && id(value.fixtureId) && picks.has(value.pick)
  && count(value.amount) && value.amount > 0 && (count(value.payout) || (value.payout === null && value.status === 'open'))
  && text(value.home) && text(value.away) && ['open', 'settled'].includes(value.status);
const SHAPES = {
  board: value => Array.isArray(value?.fixtures) && value.fixtures.every(fixture)
    && rules(value.rules) && date(value.fetchedAt) && text(value.provider) && text(value.source),
  mine: value => count(value?.coins) && count(value.stakedToday) && count(value.coinsLeftToday)
    && Array.isArray(value.stakes) && value.stakes.every(stake) && rules(value.rules)
    && typeof value.checksUnavailable === 'boolean',
  stake: value => value?.accepted === true && typeof value.repeat === 'boolean'
    && text(value.id) && id(value.fixtureId) && picks.has(value.pick) && count(value.amount)
    && count(value.coins),
  settle: value => value?.settled === true && typeof value.repeat === 'boolean'
    && id(value.fixtureId) && text(value.settlement) && count(value.paidCoins) && count(value.cutCoins),
};

export function createSportsHttp({ getToken = () => null, fetchImpl, timeoutMs = 10000 } = {}) {
  async function call(name, body) {
    const write = body !== undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (name !== 'board') {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      if (write) headers['Content-Type'] = 'application/json';
      const path = name === 'board' ? BASE : `${BASE}/${name}`;
      const response = await (fetchImpl ?? globalThis.fetch)(path, {
        method: write ? 'POST' : 'GET', headers, signal: controller.signal,
        ...(write ? { body: JSON.stringify(body) } : {}),
      });
      const value = await response.json().catch(() => null);
      if (response.ok && SHAPES[name](value)) return { ok: true, data: value };
      const code = value?.error?.code ?? 'bad_response';
      const message = typeof value?.error?.message === 'string' ? value.error.message : 'The sports pavilion could not read the server answer.';
      const retry = response.headers.get('Retry-After');
      return { ok: false, status: response.status, code, message,
        unknown: write && (response.ok || response.status >= 500),
        retryAfterSeconds: retry && /^\d+$/.test(retry) ? Number(retry) : null };
    } catch {
      return { ok: false, status: 0, code: 'connection_lost', unknown: write,
        message: 'The server did not answer. Check your connection and try again.' };
    } finally { clearTimeout(timer); }
  }
  return {
    board: () => call('board'), mine: () => call('mine'),
    stake: ({ fixtureId, pick, amount, stakeId }) => call('stake', { fixtureId, pick, amount, stakeId }),
    settle: ({ fixtureId }) => call('settle', { fixtureId }),
  };
}
