// The games card after Play (docs/GAME-V3.md §2): Continue (your games, newest first), Create a game and
// Join a game (a code ISLE-K7Q2M or its 5 symbols). A player without games sees Create and Join first.
// Loaded with the front door after Play. It talks to the island lane's client (src/island/api.js), which is
// the signed-in session's or, with ?islands=fake, the in-memory fake; a guest who joins signs in through the
// adapter with the code (anonymous sign-in, then POST /api/island/invite/join, an alias of games/join).
//
//   const choice = await chooseGame({container, lane, adapter, openAccount});
//   // -> {code: 'ISLE-K7Q2M', role: 'host' | 'member', joined: true} or null (closed: your own island)
import './games.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node, uniqueId} from '../ui/kit/dom.js';
import {gamesCopy, gameLine, readGameCode} from './logic.js';

const button = (label, onClick, quiet = false) => createButton({label, onClick, variant: quiet ? 'quiet' : 'primary'}).element;

export function chooseGame({container, lane, adapter = null, openAccount = null} = {}) {
  const api = lane?.api;
  if (!api) return {done: Promise.resolve(null), dispose() {}, close() {}};
  let finish = null, busy = false, disposed = false, games = [], signedOut = false;
  const done = new Promise(resolve => { finish = resolve; });
  const body = node('div', 'games-card-body');
  const status = node('p', 'games-status'); status.setAttribute('role', 'status');
  const modal = createModal({title: 'Play', body, onCancel: () => end(null)});
  modal.element.classList.add('games-card');
  function end(choice) {
    if (!finish) return;
    const resolve = finish; finish = null;
    modal.dispose(); resolve(choice);
  }
  const view = () => adapter?.read?.() ?? null;
  const online = () => lane.mode === 'live' && view()?.mode === 'online';
  const signedIn = () => view()?.account?.state === 'signed_in';
  function say(text) { status.textContent = text ?? ''; status.hidden = !text; }

  async function take(run, pending) {
    if (busy || disposed) return;
    busy = true; say(pending); draw();
    let choice = null;
    try { choice = await run(); } catch { choice = {problem: 'That did not work. Check your internet and try again.'}; }
    busy = false;
    if (disposed) return;
    if (choice && !choice.problem) { end(choice); return; }
    say(choice?.problem ?? 'That did not work. Try again.'); draw();
  }
  // Your own game: made on first use, or the one you host already.
  const create = () => take(async () => {
    if (online() && !signedIn()) return {problem: 'Sign in first to create a game: Menu › Settings › Account. You can join a friend as a guest.'};
    const answer = await api.createGame();
    return answer.ok ? {code: answer.data.game.code, role: 'host', joined: true} : {problem: answer.message};
  }, 'Opening your game…');
  // A game you are in: open it again (it moves to the top of Continue).
  const resume = game => take(async () => {
    const answer = game.role === 'host' ? await api.createGame() : await api.joinGame(game.code);
    if (!answer.ok) return {problem: answer.message};
    return {code: answer.data.game.code, role: answer.data.game.role, joined: true};
  }, `Opening ${game.code}…`);
  const join = typed => take(async () => {
    const code = readGameCode(typed);
    if (!code) return {problem: 'Game codes look like ISLE-K7Q2M or K7Q2M. Check the code and try again.'};
    // A guest signs in with the code; the server checks it and makes them a member in one step.
    if (online() && !signedIn()) {
      const result = await adapter.signIn({guest: true, island: code});
      if (!result?.accepted) return {problem: result?.message || 'Joining did not work. Check the code and try again.'};
      return {code, role: 'member', joined: true};
    }
    const answer = await api.joinGame(code);
    return answer.ok ? {code: answer.data.game.code, role: answer.data.game.role, joined: true} : {problem: answer.message};
  }, 'Joining the game…');

  let typed = '';
  function draw() {
    if (disposed) return;
    const copy = gamesCopy({games, signedOut, busy});
    const had = modal.element.contains(document.activeElement) ? document.activeElement?.dataset?.focus : null;
    const parts = [];
    let first = null;
    // Continue: your games, newest first.
    if (copy.continue) {
      const section = node('section', 'games-section games-continue'); section.setAttribute('aria-labelledby', uniqueId('games-continue'));
      const heading = node('h3', 'games-heading', copy.continue.title); heading.id = section.getAttribute('aria-labelledby');
      const list = node('ul', 'games-list');
      for (const game of copy.continue.games) {
        const item = node('li', 'games-item');
        const pick = node('button', 'games-pick'); pick.type = 'button'; pick.dataset.focus = `game-${game.code}`; pick.dataset.code = game.code;
        pick.disabled = busy;
        pick.append(node('strong', 'games-pick-title', game.title), node('span', 'games-pick-line', game.line));
        pick.addEventListener('click', () => void resume(game.raw));
        item.append(pick); list.append(item);
        first ??= pick;
      }
      section.append(heading, list); parts.push(section);
    }
    // Create a game.
    const create$ = node('section', 'games-section games-create');
    const createButton$ = button(copy.create.button, () => void create(), !!copy.continue);
    createButton$.dataset.focus = 'create'; createButton$.classList.add('games-create-button'); createButton$.disabled = busy;
    create$.append(node('h3', 'games-heading', copy.create.title), node('p', 'games-line', copy.create.line), createButton$);
    // Join a game: the code field.
    const join$ = node('form', 'games-section games-join');
    const label = node('label', 'games-label'), input = node('input', 'games-code'), id = uniqueId('games-code');
    input.id = id; label.htmlFor = id; input.autocomplete = 'off'; input.autocapitalize = 'characters'; input.spellcheck = false;
    input.maxLength = 24; input.name = 'code'; input.placeholder = 'ISLE-K7Q2M'; input.value = typed; input.dataset.focus = 'code';
    input.addEventListener('input', () => { typed = input.value; });
    label.append(node('span', '', copy.join.label), input);
    const go = button(copy.join.button, () => {}, true); go.type = 'submit'; go.dataset.focus = 'join'; go.disabled = busy;
    const row = node('div', 'games-join-row'); row.append(input, go);
    join$.append(node('h3', 'games-heading', copy.join.title), node('p', 'games-line', copy.join.line), label, row);
    join$.addEventListener('submit', event => { event.preventDefault(); void join(input.value); });
    // Brand new: Create and Join come first; with games, Continue comes first.
    parts.push(create$, join$);
    const extra = [];
    if (signedOut && openAccount) extra.push(button('Sign in', () => { end(null); openAccount(); }, true));
    body.replaceChildren(...parts, status, ...extra);
    first ??= createButton$;
    const again = had ? body.querySelector(`[data-focus="${had}"]`) : null;
    if (modal.element.open) (again ?? (busy ? null : first))?.focus?.({preventScroll: true});
    return first;
  }

  say('');
  const target = draw();
  modal.open(container, target);
  void api.games().then(answer => {
    if (disposed || !finish) return;
    if (answer.ok) games = answer.data.games;
    else if (answer.status === 401 || answer.code === 'not_ready') signedOut = true;
    else say(answer.message);
    const typing = document.activeElement?.matches?.('.games-code');
    draw();
    if (!busy && !typing) body.querySelector('.games-pick,.games-create-button')?.focus({preventScroll: true});
  });
  return {
    done,
    close() { end(null); },
    dispose() { disposed = true; end(null); },
    get active() { return !!finish; },
  };
}
