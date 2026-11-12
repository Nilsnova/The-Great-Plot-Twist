// The friend's landing (TOWER-DEFENSE.md §6): a ?visit= link while signed out shows one screen; Join
// as guest signs in, presents the island code (POST /api/island/invite/join on the fake) and sails
// to the friend's island. No class code anywhere.
import {describe, expect, it} from 'vitest';
import {browserHarness} from '../g20-browser.js';
import {inviteLanding} from '../../src/shell/invite.js';
import {shellTransition} from '../../src/shell/logic.js';
import {createFakeIslandApi} from './fake.js';
const evaluate = browserHarness();

describe('invite landing words', () => {
  it('names the owner, offers Join as guest first and GitHub second', () => {
    expect(inviteLanding({code: 'FR3ND', ownerName: 'Captain Gull'})).toMatchObject({title: 'Captain Gull invites you to defend their island',
      code: 'ISLE-FR3ND', join: 'Join as guest', github: 'Sign in with GitHub'});
    expect(inviteLanding({code: 'FR3ND'}).title).toBe('Your friend invites you to defend their island');
    expect(inviteLanding({code: 'FR3ND', signedIn: true})).toMatchObject({join: 'Join', github: '', note: ''});
    expect(shellTransition('title', 'invite')).toBe('invite');
  });
  it('the fake admits a guest with a valid island code and refuses an unknown one', async () => {
    const api = createFakeIslandApi();
    // The invite is an alias of POST /api/games/join (GAME-V3.md §2): it also answers the game.
    expect((await api.joinInvite('isle-fr3nd')).data).toMatchObject({admitted: true, island: {code: 'ISLE-FR3ND', ownerName: 'Captain Gull'},
      game: {code: 'ISLE-FR3ND', role: 'member'}});
    expect(await api.joinInvite('ISLE-ZZZZZ')).toMatchObject({ok: false, status: 404, code: 'no_such_island'});
    expect(await api.joinInvite('HARBOR-K7QXM')).toMatchObject({ok: false, code: 'validation_error'});
  });
});

it('a signed-out friend taps Join as guest and lands on the island', async () => {
  const result = await evaluate(async () => {
    const {fillInvitePage} = await window.g20Import('/src/shell/invite.js');
    const {rememberVisit, readVisit} = await window.g20Import('/src/island/codes.js');
    const {createFakeIslandTransport} = await window.g20Import('/src/pirates/fake-api.js');
    const {createIslandApi} = await window.g20Import('/src/island/api.js');
    const {createIsland} = await window.g20Import('/src/island/index.js');
    const {on, emit} = await window.g20Import('/src/core/events.js');
    sessionStorage.clear();
    rememberVisit('?visit=ISLE-FR3ND');
    const transport = createFakeIslandTransport(), client = createIslandApi({transport});
    const calls = [];
    let account = 'signed_out';
    // The online adapter's guest path, over the fake: anonymous sign-in, then the invite route.
    const adapter = {read: () => ({mode: 'online', account: {state: account}}),
      async signIn(options) {
        calls.push(options);
        const answer = await client.joinInvite(options.island);
        if (!answer.ok) return {accepted: false, reason: answer.code, message: answer.message};
        account = 'signed_in';
        return {accepted: true, island: answer.data.island};
      }};
    const body = document.createElement('div'), nav = document.createElement('nav');
    document.body.append(body);
    let played = 0, started = 0;
    fillInvitePage({body, nav, ctx: {adapter, onStart: () => started++}, isCurrent: () => true, play: () => played++, back: () => {}, ownerName: 'Captain Gull'});
    const screen = {title: body.querySelector('.invite-title').textContent, code: body.querySelector('.invite-code').textContent,
      buttons: [...body.querySelectorAll('button')].map(item => item.textContent), focused: document.activeElement?.textContent,
      inputs: body.querySelectorAll('input').length};
    body.querySelector('.invite-join').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    const joined = {played, started, visit: readVisit(), calls};
    // Play then lands on the friend's island (index.js reads the remembered code).
    const island = createIsland({container: document.body, emit, on, mode: 'fake', transport, storage: null, menu: () => () => {}});
    await island.load();
    const landed = {visiting: island.visiting?.ownerName, banner: document.querySelector('.island-visit').textContent};
    island.dispose(); body.remove();
    return {screen, joined, landed};
  });
  expect(result.screen).toEqual({title: 'Captain Gull invites you to defend their island', code: 'ISLE-FR3ND',
    buttons: ['Join as guest', 'Sign in with GitHub', 'Not now'], focused: 'Join as guest', inputs: 0});
  expect(result.joined).toEqual({played: 1, started: 1, visit: 'FR3ND', calls: [{guest: true, island: 'ISLE-FR3ND'}]});
  expect(result.landed.visiting).toBe('Captain Gull');
  // One island (GAME-V3.md §2): the friend's game, not a visit.
  expect(result.landed.banner).toContain("Captain Gull's game · ISLE-FR3ND");
});
