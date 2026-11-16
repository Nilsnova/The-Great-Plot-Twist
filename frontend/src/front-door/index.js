// The demo front door after Play. With the island game on (docs/GAME-V3.md §2): the games card (Continue,
// Create a game, Join a game; games.js) first, and only once the player stands on an island they own or
// joined, the lore cutscene, one goal-and-controls card and the island arrival (T52; then the guided start
// of src/tutorial/tutorials.js); after Create, Join or Continue the game's lobby opens over it. A ?game= link
// (or the friend's landing) goes straight into that game. Without it (the class harbor): the lore, the first
// How to play pages (once per device, src/tutorial/) and the goal card, as before.
// Loaded only after Play, so the cold title stays within its budget.
// Guest sign-in starts here too, silently, and only for a player who brought a class code (?join= or
// the Join page) while /api/config says demo.guestsByCode. A refused code is forgotten.
import './front-door.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node} from '../ui/kit/dom.js';
import {getPreferences, reducedMotion as defaultReducedMotion} from '../settings/preferences.js';
import {TUTORIAL_KEY, firstRunPages, wantsFirstRun} from '../tutorial/pages.js';
import {FRONT_DOOR_KEY, HARBOR_START, readFlag, writeFlag, goalCopy, readJoinCode, forgetJoinCode, joinedHarbor, signedOutPlayer} from './logic.js';
import {readVisit} from '../island/codes.js';

export function createFrontDoor({container, focus, storage = safeStorage(), session = safeSession(),
  preferences = getPreferences, reducedMotion = defaultReducedMotion,
  loadPlayer = () => import('../cutscenes/player.js'), loadTutorial = () => import('../tutorial/card.js'),
  loadGames = () => import('./games.js'), openAccount = null} = {}) {
  let player = null, card = null, finishCard = null, tutorial = null, games = null, disposed = false, request = 0;

  function showCard() {
    return new Promise(resolve => {
      const copy = goalCopy({classHarbor: joinedHarbor(session)});
      const body = node('div', 'goal-card-body'), list = node('dl', 'goal-controls');
      for (const [term, text] of copy.controls) { const item = node('div', 'goal-control'); item.append(node('dt', '', term), node('dd', '', text)); list.append(item); }
      let done = false;
      const finish = () => {
        if (done) return; done = true; finishCard = null;
        const current = card; card = null; current?.dispose(); resolve();
      };
      finishCard = finish;
      const ok = createButton({label: copy.button, onClick: finish});
      body.append(node('p', 'goal-lead', copy.goal), list, ok.element);
      card = createModal({title: copy.title, body, onCancel: finish});
      card.element.classList.add('goal-card');card.element.dataset.path = joinedHarbor(session) ? 'class' : 'island';
      card.open(container, ok.element);
    });
  }

  async function playLore(token) {
    const {playCutscene} = await loadPlayer();
    if (disposed || token !== request) return;
    player = playCutscene({container, id: 'lore_intro', preferences, reducedMotion});
    await player.done;
    player = null;
  }

  // The first How to play pages after the lore (island, build, bell, captain), with Skip and Start
  // playing. Remembered once seen, so a returning player goes straight on (Menu › How to play has all).
  async function showTutorial(token) {
    const {createTutorialCard} = await loadTutorial();
    if (disposed || token !== request) return;
    const current = tutorial = createTutorialCard({mode: 'first', pages: firstRunPages()});
    current.open(container);
    const reason = await current.done;
    if (tutorial === current) tutorial = null;
    current.dispose();
    if (reason !== 'disposed') writeFlag(storage, TUTORIAL_KEY);
  }

  // Ask once for a guest session with the remembered class code; no code, guests off or an offline
  // server leave local play unchanged. A code the server refuses is forgotten (Join asks again).
  function startGuest(adapter) {
    const code = readJoinCode(session);
    if (!code || adapter?.read?.().mode !== 'online' || adapter.read().account?.state === 'signed_in') return;
    void Promise.resolve(adapter.signIn({guest: true, code})).then(result => {
      if (result?.reason === 'class_code_invalid') forgetJoinCode(session);
    }).catch(() => {});
  }

  // The games card (GAME-V3.md §2): which game Play opens. A pending ?game= code goes straight in (the
  // island lane joins it on landing); null keeps your own island without a lobby; undefined: no games lane
  // (islands off, or the class harbor), so the old start.
  async function pickGame(runtime, adapter, token) {
    const lane = await runtime.gameLane?.();
    if (!lane || disposed || token !== request) return undefined;
    const pending = readVisit(session);
    if (pending) return {code: pending, role: 'member', joined: false};
    const {chooseGame} = await loadGames();
    if (disposed || token !== request) return null;
    const current = games = chooseGame({container, lane, adapter, openAccount});
    const choice = await current.done;
    if (games === current) games = null;
    if (choice) lane.enterGame(choice);
    return choice;
  }

  return {
    get active() { return !!player || !!tutorial || !!card || !!games; },
    // run() resolves when the player stands in the harbor (or the request was replaced).
    async run({loadGame, isCurrent = () => true, adapter, replay = false, leave = null} = {}) {
      const token = ++request;
      const current = () => !disposed && token === request && isCurrent();
      const seen = !replay && readFlag(storage, FRONT_DOOR_KEY);
      const pages = !seen && wantsFirstRun({seen: readFlag(storage, TUTORIAL_KEY), classHarbor: joinedHarbor(session)});
      startGuest(adapter);
      const runtime = await loadGame();
      if (!runtime || !current()) return false;
      // T52: with the island game on, the intro and the goal card wait for an island the player owns or joined
      // (runtime.islandReady(): the island on screen has its code), never the front door or a signed-out player;
      // the guided start then teaches the first steps (src/tutorial/), so the first How to play pages are left
      // out there (Menu › How to play keeps them). Without the island game (the class harbor) nothing changes.
      let lane = null;
      try { lane = (await runtime.gameLane?.()) ?? null; } catch { lane = null; }
      if (!current()) return false;
      // T51 (found by Nicolas Radomski): the Play card comes first, over open water. Signed out, it is all the
      // player sees (sign in, or join a friend as a guest): closing it goes back to the title, never to an island
      // they cannot build on. A class harbor player has no games card and starts as before.
      let chosen = null;
      if (lane && !joinedHarbor(session)) {
        try { chosen = await pickGame(runtime, adapter, token); } catch { chosen = null; /* Your own island, as before. */ }
        if (!current()) return false;
        if (chosen === null && signedOutPlayer(adapter?.read?.())) { leave?.(); return false; }
      }
      if (!seen && !lane) {
        try { await playLore(token); } catch { /* No player: go straight to the card. */ }
        if (!current()) return false;
        if (pages) {
          try { await showTutorial(token); } catch { /* No pages: the goal card still explains the start. */ }
          if (!current()) return false;
        }
      }
      // First Play: lore, then the goal card over your island, then the island arrival cutscene
      // (docs/PITCH.md, the first 3 minutes). game.js plays the arrival itself on a later Play.
      // lobby: the game's lobby opens after this, and its Start tells the narrator (game_started), so
      // game.js does not start the narrator itself.
      const start = seen ? HARBOR_START : {...HARBOR_START, arrival: 'later'};
      await runtime.begin(false, chosen ? {...start, lobby: true} : start);
      if (!current()) return false;
      if (!seen) {
        let island = !lane;
        if (lane) { try { island = (await runtime.islandReady?.()) === true; } catch { island = false; } }
        if (!current()) return false;
        if (island) {
          if (lane) { try { await playLore(token); } catch { /* No player: the card still explains the start. */ } }
          if (!current()) return false;
          await showCard();
          writeFlag(storage, FRONT_DOOR_KEY);
          if (current()) { try { await runtime.playArrival?.(); } catch { /* The island is there without it. */ } }
        }
      }
      // After Create, Join or Continue: the game's lobby over the island (code, link, players, Start).
      if (chosen && current()) runtime.openLobby?.();
      if (current() && !chosen) focus?.();
      return true;
    },
    handleEscape() {
      if (player) { player.skip(); return true; }
      if (tutorial) { tutorial.close('skipped'); return true; }
      if (finishCard) { finishCard(); return true; }
      if (games) { games.close(); return true; }
      return false;
    },
    cancel() { request++; player?.dispose(); player = null; tutorial?.dispose(); tutorial = null; games?.dispose(); games = null; finishCard?.(); },
    dispose() { disposed = true; this.cancel(); },
  };
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
function safeSession() {
  try { return window.sessionStorage; } catch { return null; }
}
