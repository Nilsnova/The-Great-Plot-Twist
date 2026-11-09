// The demo front door after Play: lore cutscene, one goal-and-controls card, then the player stands
// outside in Saltreach Harbor. Loaded only after Play, so the cold title stays within its budget.
// Guest sign-in starts here too, silently, and only for a player who brought a class code (?join= or
// the Join page) while /api/config says demo.guestsByCode. A refused code is forgotten.
import './front-door.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node} from '../ui/kit/dom.js';
import {getPreferences, reducedMotion as defaultReducedMotion} from '../settings/preferences.js';
import {FRONT_DOOR_KEY, HARBOR_START, readFlag, writeFlag, goalCopy, readJoinCode, forgetJoinCode} from './logic.js';

export function createFrontDoor({container, focus, storage = safeStorage(), session = safeSession(),
  preferences = getPreferences, reducedMotion = defaultReducedMotion,
  loadPlayer = () => import('../cutscenes/player.js')} = {}) {
  let player = null, card = null, finishCard = null, disposed = false, request = 0;

  function showCard() {
    return new Promise(resolve => {
      const copy = goalCopy();
      const body = node('div', 'goal-card-body'), list = node('dl');
      for (const [term, text] of copy.controls) list.append(node('dt', '', term), node('dd', '', text));
      let done = false;
      const finish = () => {
        if (done) return; done = true; finishCard = null;
        const current = card; card = null; current?.dispose(); resolve();
      };
      finishCard = finish;
      const ok = createButton({label: copy.button, onClick: finish});
      body.append(node('p', 'goal-lead', copy.goal), list, ok.element);
      card = createModal({title: copy.title, body, onCancel: finish});
      card.element.classList.add('goal-card');
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
    get active() { return !!player || !!card; },
    // run() resolves when the player stands in the harbor (or the request was replaced).
    async run({loadGame, isCurrent = () => true, adapter, replay = false} = {}) {
      const token = ++request;
      const current = () => !disposed && token === request && isCurrent();
      const seen = !replay && readFlag(storage, FRONT_DOOR_KEY);
      startGuest(adapter);
      const game = loadGame();
      if (!seen) {
        try { await playLore(token); } catch { /* No player: go straight to the card. */ }
        if (!current()) return false;
      }
      const runtime = await game;
      if (!runtime || !current()) return false;
      await runtime.begin(false, HARBOR_START);
      if (!current()) return false;
      if (!seen) {
        await showCard();
        writeFlag(storage, FRONT_DOOR_KEY);
      }
      if (current()) focus?.();
      return true;
    },
    handleEscape() {
      if (player) { player.skip(); return true; }
      if (finishCard) { finishCard(); return true; }
      return false;
    },
    cancel() { request++; player?.dispose(); player = null; finishCard?.(); },
    dispose() { disposed = true; this.cancel(); },
  };
}

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}
function safeSession() {
  try { return window.sessionStorage; } catch { return null; }
}
