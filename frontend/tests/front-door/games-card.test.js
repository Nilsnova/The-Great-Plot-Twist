// The Play card for a signed-out player (found in a first play on 15 Nov): Create cannot work without an
// account, so its button must lead to sign-in instead of a small line of text. Real DOM, stand-in server.
import {expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {gamesCopy} from '../../src/front-door/logic.js';
const browser = browserHarness();

it('names the Create button after what it can do', () => {
  expect(gamesCopy({}).create.button).toBe('Create a game');
  expect(gamesCopy({signInFirst: true}).create).toMatchObject({title: 'Create a game', button: 'Sign in to create a game'});
  expect(gamesCopy({signInFirst: true}).create.line).toContain('Sign in first');
  expect(gamesCopy({signInFirst: true}).join.button).toBe('Join'); // joining as a guest stays as it was
});

// One card per case: who the player is, and what a click on the first button of "Create a game" does.
async function playCard(page, state) {
  return page(async state => {
    const {chooseGame} = await window.g20Import('/src/front-door/games.js');
    const calls = {create: 0, account: 0};
    const api = {
      games: async () => (state === 'signed_in' ? {ok: true, data: {games: []}} : {ok: false, status: 401, code: 'not_signed_in', message: 'Sign in first.'}),
      createGame: async () => { calls.create++; return {ok: true, data: {game: {code: 'ISLE-K7Q2M', role: 'host'}}}; },
    };
    const adapter = {read: () => ({mode: 'online', account: {state}})};
    const card = chooseGame({container: document.body, lane: {mode: 'live', api}, adapter, openAccount: () => { calls.account++; }});
    await new Promise(resolve => setTimeout(resolve, 0)); // the games list has answered
    const buttons = [...document.querySelectorAll('.games-card button')].map(button => button.textContent).filter(text => text !== '×');
    const create = document.querySelector('.games-create-button');
    const label = create.textContent, line = document.querySelector('.games-create .games-line').textContent;
    create.click();
    const choice = await card.done;
    card.dispose();
    return {label, line, buttons, calls, choice, cardOpen: !!document.querySelector('.games-card[open]')};
  }, state);
}

it('signed out: the Create button opens sign-in, asks the server for nothing and shows one sign-in button', async () => {
  const result = await playCard(browser, 'signed_out');
  expect(result.label).toBe('Sign in to create a game');
  expect(result.line).toBe('Your own game needs an account. Sign in first, then press Play again.');
  expect(result.buttons.filter(text => /sign in/i.test(text))).toEqual(['Sign in to create a game']);
  expect(result.calls).toEqual({create: 0, account: 1});
  expect(result.choice).toBe(null);
  expect(result.cardOpen).toBe(false);
});

it('signed in: Create a game works as before', async () => {
  const result = await playCard(browser, 'signed_in');
  expect(result.label).toBe('Create a game');
  expect(result.buttons.some(text => /sign in/i.test(text))).toBe(false);
  expect(result.calls).toEqual({create: 1, account: 0});
  expect(result.choice).toEqual({code: 'ISLE-K7Q2M', role: 'host', joined: true});
});
