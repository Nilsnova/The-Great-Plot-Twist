// The demo front door after Play: lore cutscene, the first How to play pages (once per device,
// src/tutorial/), one goal-and-controls card, then the player stands outside in Saltreach Harbor.
// Loaded only after Play, so the cold title stays within its budget.
// Guest sign-in starts here too, silently, and only for a player who brought a class code (?join= or
// the Join page) while /api/config says demo.guestsByCode. A refused code is forgotten.
import './front-door.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node} from '../ui/kit/dom.js';
import {getPreferences, reducedMotion as defaultReducedMotion} from '../settings/preferences.js';
import {TUTORIAL_KEY, firstRunPages, wantsFirstRun} from '../tutorial/pages.js';
import {FRONT_DOOR_KEY, HARBOR_START, readFlag, writeFlag, goalCopy, readJoinCode, forgetJoinCode, joinedHarbor} from './logic.js';

export function createFrontDoor({container, focus, storage = safeStorage(), session = safeSession(),
  preferences = getPreferences, reducedMotion = defaultReducedMotion,
  loadPlayer = () => import('../cutscenes/player.js'), loadTutorial = () => import('../tutorial/card.js')} = {}) {
  let player = null, card = null, finishCard = null, tutorial = null, disposed = false, request = 0;

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

  return {
    get active() { return !!player || !!tutorial || !!card; },
    // run() resolves when the player stands in the harbor (or the request was replaced).
    async run({loadGame, isCurrent = () => true, adapter, replay = false} = {}) {
      const token = ++request;
      const current = () => !disposed && token === request && isCurrent();
      const seen = !replay && readFlag(storage, FRONT_DOOR_KEY);
      const pages = !seen && wantsFirstRun({seen: readFlag(storage, TUTORIAL_KEY), classHarbor: joinedHarbor(session)});
      startGuest(adapter);
      const game = loadGame();
      if (!seen) {
        try { await playLore(token); } catch { /* No player: go straight to the card. */ }
        if (!current()) return false;
        if (pages) {
          try { await showTutorial(token); } catch { /* No pages: the goal card still explains the start. */ }
          if (!current()) return false;
        }
      }
      const runtime = await game;
      if (!runtime || !current()) return false;
      // First Play: lore, then the goal card over your island, then the island arrival cutscene
      // (docs/PITCH.md, the first 3 minutes). game.js plays the arrival itself on a later Play.
      await runtime.begin(false, seen ? HARBOR_START : {...HARBOR_START, arrival: 'later'});
      if (!current()) return false;
      if (!seen) {
        await showCard();
        writeFlag(storage, FRONT_DOOR_KEY);
        if (current()) { try { await runtime.playArrival?.(); } catch { /* The island is there without it. */ } }
      }
      if (current()) focus?.();
      return true;
    },
    handleEscape() {
      if (player) { player.skip(); return true; }
      if (tutorial) { tutorial.close('skipped'); return true; }
      if (finishCard) { finishCard(); return true; }
      return false;
    },
    cancel() { request++; player?.dispose(); player = null; tutorial?.dispose(); tutorial = null; finishCard?.(); },
    dispose() { disposed = true; this.cancel(); },
  };
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
function safeSession() {
  try { return window.sessionStorage; } catch { return null; }
}
