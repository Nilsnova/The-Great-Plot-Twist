// Retry/session races exercise the real intent coordinator, without DOM or network.
import { describe, expect, it, vi } from 'vitest';
import { createSportsActions } from '../../src/screens/sports/actions.js';
import { SAVED } from './sample-answers.js';
const draft = { fixtureId: 'fd-123', pick: 'home', amount: 10 };
const later = () => { let finish; const promise = new Promise(resolve => { finish = resolve; }); return { promise, finish }; };

describe('one sports stake reference per confirmed intent', () => {
  it('retains the exact stake body after unknown answers even if a caller changes the draft', async () => {
    const adapter = { stake: vi.fn().mockResolvedValueOnce({ ok: false, unknown: true }).mockResolvedValueOnce({ ok: true, data: { ...SAVED, repeat: true } }) };
    const makeUid = vi.fn(() => 'kept-stake-123');
    const actions = createSportsActions({ adapter, makeUid, getToken: () => 'account' });
    await actions.stake(draft);
    expect(actions.pending).toEqual({ ...draft, stakeId: 'kept-stake-123' });
    await actions.stake({ fixtureId: 'fd-999', pick: 'away', amount: 50 });
    expect(adapter.stake.mock.calls[1][0]).toEqual(adapter.stake.mock.calls[0][0]);
    expect(makeUid).toHaveBeenCalledOnce(); expect(actions.pending).toBeNull();
  });
  it('prevents double confirmation and settlement while a stake is pending', async () => {
    const gate = later(), adapter = { stake: vi.fn(() => gate.promise), settle: vi.fn() };
    const actions = createSportsActions({ adapter, getToken: () => 'account' });
    const first = actions.stake(draft);
    expect((await actions.stake(draft)).code).toBe('busy');
    gate.finish({ ok: false, unknown: true }); await first;
    expect((await actions.settle('fd-123')).code).toBe('pending');
    expect(adapter.stake).toHaveBeenCalledOnce(); expect(adapter.settle).not.toHaveBeenCalled();
  });
  it('a definite refusal clears the attempt, but rate limiting keeps the same safe reference', async () => {
    const adapter = { stake: vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce({ ok: false, status: 409, code: 'pool_closed' }) };
    const actions = createSportsActions({ adapter, getToken: () => 'account' });
    await actions.stake(draft); expect(actions.pending).not.toBeNull();
    await actions.stake(draft); expect(actions.pending).toBeNull();
  });
  it('unknown then rate-limited retry retains the original reference until confirmed', async () => {
    const adapter = { stake: vi.fn()
      .mockResolvedValueOnce({ ok: false, unknown: true, status: 0 })
      .mockResolvedValueOnce({ ok: false, unknown: false, status: 429, retryAfterSeconds: 5 })
      .mockResolvedValueOnce({ ok: true, data: { ...SAVED, repeat: true } }) };
    const makeUid = vi.fn(() => 'first-unknown-reference');
    const actions = createSportsActions({ adapter, getToken: () => 'account', makeUid });
    await actions.stake(draft); await actions.stake(draft);
    expect(actions.pending.stakeId).toBe('first-unknown-reference');
    await actions.stake(draft);
    expect(adapter.stake.mock.calls.map(([body]) => body)).toEqual(Array(3).fill({ ...draft, stakeId: 'first-unknown-reference' }));
    expect(makeUid).toHaveBeenCalledOnce(); expect(actions.pending).toBeNull();
  });
  it('never replays a prior account’s pending stake after sign-out/sign-in', async () => {
    let token = 'first';
    const adapter = { stake: vi.fn(async () => ({ ok: false, unknown: true })) };
    const actions = createSportsActions({ adapter, getToken: () => token });
    await actions.stake(draft); const previous = actions.pending.stakeId;
    token = null; expect(actions.pending).toBeNull();
    expect((await actions.stake(draft)).status).toBe(401);
    token = 'second'; await actions.stake(draft); expect(actions.pending.stakeId).not.toBe(previous);
  });
  it('ignores a late reply from an earlier session while a new account request is busy', async () => {
    let token = 'first'; const old = later(), next = later();
    const adapter = { stake: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise) };
    const actions = createSportsActions({ adapter, getToken: () => token });
    const first = actions.stake(draft); token = 'second'; actions.sync(); const second = actions.stake(draft);
    old.finish({ ok: true, data: SAVED }); expect((await first).code).toBe('session_changed');
    expect(actions.busy).toBe(true); next.finish({ ok: false, unknown: true }); await second;
    expect(actions.pending).not.toBeNull(); expect(actions.busy).toBe(false);
  });
  it('keeps an accepted answer for a different stake unknown instead of clearing the retry', async () => {
    const actions = createSportsActions({ adapter: { stake: async () => ({ ok: true, data: { ...SAVED, amount: 50 } }) }, getToken: () => 'account' });
    expect((await actions.stake(draft)).unknown).toBe(true); expect(actions.pending.amount).toBe(10);
  });
});
