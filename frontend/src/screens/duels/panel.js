// The Lantern Duels panel: one modal dialog from the UI kit with four tabs (Challenges, New
// challenge, Your duels, Rules), the status lines and the reveal. It turns clicks into intents
// for the adapter and draws what the adapter's view says; the server decides every duel (D003).
// Keys are stopped at the dialog so the explorer never moves behind it, and polling stops when the
// panel closes, when the page is hidden, or when the game removes the panel. Used by: index.js.
import { createModal } from '../../ui/kit/modal.js';
import { createTabs } from '../../ui/kit/tabs.js';
import { createChallenges } from './challenges.js';
import { createNewChallenge } from './new-challenge.js';
import { createHistory } from './history.js';
import { createRulesCard } from './rules-card.js';
import { createReveal } from './reveal.js';
import { createStatus, isReady } from './panel-status.js';
import { node, whenRemoved } from './dom.js';

const TAB_IDS = ['challenges', 'new', 'yours', 'rules'];

export function createPanel(ctx, adapter, onGone) {
  const played = new Set(); // reveals the player has watched, so their reminder disappears
  let tabId = TAB_IDS[0], tabIndex = 0, view = adapter.read(), busy = false, disposed = false, seenNotice = 0, stopWatching = null, openGeneration = 0;

  // One click at a time: a second click while an intent is in flight is ignored.
  async function guard(task) {
    if (busy) return undefined;
    busy = true;
    status.say('');
    try { return await task(); } finally { busy = false; }
  }

  function play(duel) {
    if(disposed||!modal.element.open)return;
    played.add(duel.id);
    tabs.element.hidden = true;
    reveal.play(duel);
    status.say('');
    status.update(view, played, reveal.active);
  }

  async function watch(id,generation=openGeneration) {
    if(disposed||!modal.element.open||generation!==openGeneration)return;
    if (view.selected?.id === id) return play(view.selected);
    const result = await guard(() => adapter.select(id));
    if(disposed||!modal.element.open||generation!==openGeneration)return;
    if (result?.ok) play(result.view.selected);
  }

  const status = createStatus({
    onRefresh: () => guard(() => adapter.refresh()),
    onRetry: () => guard(() => adapter.retry()),
    onWatch: watch,
  });
  const challenges = createChallenges({
    onAnswer: async (id, signals) => {
      const result = await guard(() => adapter.answer(id, signals));
      const duel = result?.view.selected;
      if (result?.ok && duel?.id === id && duel.status === 'finished') play(duel);
    },
    onDecline: id => guard(() => adapter.cancel(id)),
  });
  const form = createNewChallenge({
    onSend: async args => {
      const result = await guard(() => adapter.challenge(args));
      if (result?.ok) {
        status.say('Challenge sent. Your signals are sealed.');
        tabs.select(TAB_IDS.indexOf('yours'), true);
      }
      return result;
    },
  });
  const history = createHistory({
    onWithdraw: async id => {
      const stake = view.yours.find(duel => duel.id === id)?.stake ?? 0;
      const result = await guard(() => adapter.cancel(id));
      if (result?.ok) status.say(stake > 0 ? 'Challenge withdrawn. Your stake came back.' : 'Challenge withdrawn.');
    },
    onShowSignals: id => guard(() => adapter.select(id)),
    onReplay: watch,
    onRematch: name => {
      tabs.select(TAB_IDS.indexOf('new'), true);
      form.prefill(name);
    },
  });
  const rules = createRulesCard();
  const reveal = createReveal({ onLeave: () => { tabs.element.hidden = false; status.update(view, played); tabs.select(tabIndex, true); } });
  const tabs = createTabs({
    items: [
      { id: 'challenges', label: 'Challenges', body: challenges.element },
      { id: 'new', label: 'New challenge', body: form.element },
      { id: 'yours', label: 'Your duels', body: history.element },
      { id: 'rules', label: 'Rules', body: rules.element },
    ],
    onChange: (id, index) => { tabId = id; tabIndex = index; },
  });

  const body = node('div', 'duel-body');
  body.append(node('p', 'duel-intro', 'The ring at Smugglers’ Cove. Simulation, play money.'), ...status.elements, tabs.element, reveal.element);
  const modal = createModal({ title: 'Lantern Duels', body, onCancel: () => (reveal.active ? reveal.leave() : modal.close()), onClose });
  const heading = modal.element.querySelector('h2');
  heading.tabIndex = -1;
  modal.element.classList.add('duel-modal');
  modal.element.addEventListener('keydown', event => event.stopPropagation()); // the explorer never hears these keys

  function render(next) {
    view = next;
    status.update(view, played, reveal.active);
    tabs.element.hidden = !isReady(view) || reveal.active;
    for (const part of [challenges, form, history, rules]) part.update(view);
    const decided = view.notice?.code === 'decided' && view.notice.id !== seenNotice;
    if (!decided) return;
    seenNotice = view.notice.id;
    if (tabId === 'yours' && view.selected?.id === view.notice.duelId) play(view.selected); // they are watching: show it
  }

  function onClose() {
    openGeneration++;
    adapter.setVisible(false);
    ctx.resetInput?.();
    ctx.focus?.();
  }

  const onVisibility = () => adapter.setVisible(modal.element.open && !document.hidden);
  const stopListening = adapter.subscribe(render);
  document.addEventListener('visibilitychange', onVisibility);
  render(view);

  function dispose() {
    if (disposed) return;
    disposed = true;openGeneration++;
    stopWatching?.();
    document.removeEventListener('visibilitychange', onVisibility);
    stopListening();
    adapter.dispose();
    for (const part of [reveal, tabs, modal]) part.dispose();
    onGone?.();
  }

  return {
    element: modal.element,
    isGone: () => disposed,
    open(duelId) {
      const generation=++openGeneration;
      if (modal.element.open) return heading.focus();
      ctx.resetInput?.();
      modal.open(ctx.container, heading);
      stopWatching ??= whenRemoved(ctx.container, modal.element, dispose); // the game shut down: stop all work
      adapter.setVisible(!document.hidden);
      if(duelId)return adapter.refresh().then(()=>{if(!disposed&&modal.element.open&&generation===openGeneration)return watch(duelId,generation);});
    },
    close: () => {openGeneration++;modal.close();},
    dispose,
  };
}
