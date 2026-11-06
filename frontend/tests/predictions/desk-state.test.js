// How the answers of the list and of "mine" turn into the one state the desk shows.
import { describe, expect, it } from 'vitest';
import { deskStateFrom, initialDeskState } from '../../src/screens/predictions/desk-state.js';
import { listAnswer, mineAnswer } from './sample-answers.js';

const ok = data => ({ kind: 'ok', data });
const signin = { kind: 'signin', message: 'Sign in with GitHub to stake coins.' };
const closed = { kind: 'closed', message: 'The prediction desk is closed for now.' };
const unknown = { kind: 'unknown', status: 0, code: 'network_error', message: 'No connection to the server. Check your internet and try again.' };

describe('the first look', () => {
  it('starts loading, signed-in state not known', () => {
    expect(initialDeskState()).toMatchObject({ phase: 'loading', list: null, mine: null, signedIn: null, host: false });
  });

  it('shows the desk when both answers are good', () => {
    const state = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer()));
    expect(state).toMatchObject({ phase: 'ready', signedIn: true, host: false, notice: null });
    expect(state.list.questions).toHaveLength(1);
    expect(state.mine.coins).toBe(940);
  });

  it('knows a host from the mine answer', () => {
    const state = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer({ host: true })));
    expect(state.host).toBe(true);
  });

  it('only trusts host: true, not a truthy word', () => {
    const state = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer({ host: 'yes' })));
    expect(state.host).toBe(false);
  });

  it('shows the questions to a player who is not signed in', () => {
    const state = deskStateFrom(initialDeskState(), ok(listAnswer()), signin);
    expect(state).toMatchObject({ phase: 'ready', signedIn: false, host: false, mine: null });
  });
});

describe('the closed desk', () => {
  it('closes when the list says the flag is off', () => {
    const state = deskStateFrom(initialDeskState(), closed, closed);
    expect(state).toMatchObject({ phase: 'closed', list: null, mine: null });
    expect(state.notice).toBe('The prediction desk is closed for now.');
  });

  it('closes when only the mine answer says so', () => {
    expect(deskStateFrom(initialDeskState(), ok(listAnswer()), closed).phase).toBe('closed');
  });

  it('opens again when a later look finds the flag on', () => {
    const shut = deskStateFrom(initialDeskState(), closed, closed);
    const open = deskStateFrom(shut, ok(listAnswer()), ok(mineAnswer()));
    expect(open).toMatchObject({ phase: 'ready', notice: null });
  });
});

describe('when the server cannot be reached', () => {
  it('is unavailable on the first look, with a plain sentence', () => {
    const state = deskStateFrom(initialDeskState(), unknown, unknown);
    expect(state.phase).toBe('unavailable');
    expect(state.notice).toBe('No connection to the server. Check your internet and try again.');
  });

  it('keeps the last good list and says the refresh failed', () => {
    const before = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer()));
    const after = deskStateFrom(before, unknown, unknown);
    expect(after.phase).toBe('ready');
    expect(after.list).toEqual(before.list);
    expect(after.mine).toEqual(before.mine);
    expect(after.signedIn).toBe(true);
    expect(after.notice).toContain('No connection');
  });

  it('keeps what it knew about the player when only mine fails', () => {
    const before = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer({ host: true })));
    const after = deskStateFrom(before, ok(listAnswer()), unknown);
    expect(after).toMatchObject({ signedIn: true, host: true });
    expect(after.mine).toEqual(before.mine);
  });

  it('does not know whether the player is signed in when mine fails on the first look', () => {
    const state = deskStateFrom(initialDeskState(), ok(listAnswer()), unknown);
    expect(state).toMatchObject({ phase: 'ready', signedIn: null, mine: null });
    expect(state.notice).toContain('No connection');
  });

  it('forgets the player after a 401', () => {
    const before = deskStateFrom(initialDeskState(), ok(listAnswer()), ok(mineAnswer({ host: true })));
    const after = deskStateFrom(before, ok(listAnswer()), signin);
    expect(after).toMatchObject({ signedIn: false, host: false, mine: null });
  });
});
