// The build panel: a kit modal with the wallet line, a status line and one card per spot. DOM only; the adapter holds the data.
import './islet.css';
import {createModal} from '../../ui/kit/modal.js';
import {createButton} from '../../ui/kit/button.js';
import {node} from '../../ui/kit/dom.js';
import {cardLabels, walletLine} from './labels.js';
import {createSpotCard} from './spot-card.js';
import {setText, showText} from './set-text.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {createIsletRequests, createIsletRequestClock} from './request-state.js';

const LOCAL_NOTE = 'Local rehearsal: nothing here is saved.';
const UP_TO_DATE = 'Your islet is up to date.';

export function createIsletPanel({container, adapter, resetInput, focus}) {
  const cards = new Map(); // plot -> spot card
  let order = []; // the plots in the order the list shows them
  let lastPlot = null; // the card that last had focus
  let disposed = false, requests;

  const wallet = node('p', 'islet-wallet');
  const refresh = createButton({label: 'Refresh', variant: 'quiet', onClick: refreshIslet});
  const top = node('div', 'islet-top');
  const note = node('p', 'islet-note');
  const status = node('p', 'islet-status');
  const list = node('ul', 'islet-spots');
  const root = node('div', 'islet-panel');
  const clock = createIsletRequestClock();
  const call = createServerCallState({label: 'islet request', onRetry: () => requests?.retry(),
    now: clock.now, onChange: () => syncRequestControls()});
  refresh.element.dataset.focus = 'islet-refresh';
  status.setAttribute('role', 'status');
  list.setAttribute('aria-label', 'Plots on your islet');
  top.append(wallet, refresh.element);
  root.append(top, note, call.element, status, list);

  function onClose(reason) {
    requests?.cancel();
    resetInput?.();
    if (reason !== 'dispose') focus?.();
  }
  const modal = createModal({title: 'Your islet', body: root, onClose});
  // The dialog itself says whether the panel is open. A flag set by its close event could be late.
  const isOpen = () => modal.element.open;
  const title = modal.element.querySelector('h2');
  modal.element.classList.add('islet-modal');
  title.tabIndex = -1;

  // The explorer must not walk behind the dialog: every key stays inside except Escape and Tab.
  const keepKeys = event => { if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation(); };
  modal.element.addEventListener('keydown', keepKeys);
  root.addEventListener('focusin', event => {
    const plot = event.target.closest('[data-plot]')?.dataset.plot;
    if (plot) lastPlot = plot;
  });

  // The status line says when a manual refresh worked, so a screen reader hears an answer.
  async function refreshIslet() {
    const result = await requests.refresh();
    if (!disposed && result.accepted && isOpen()) setText(status, UP_TO_DATE);
  }

  function onBuild(plot) {
    lastPlot = plot;
    void requests.build(plot);
  }

  function rebuildList(plots) {
    for (const [plot, card] of cards) {
      if (!plots.includes(plot)) { card.dispose(); cards.delete(plot); }
    }
    for (const plot of plots) {
      if (!cards.has(plot)) cards.set(plot, createSpotCard({onBuild}));
    }
    list.replaceChildren(...plots.map(plot => cards.get(plot).element));
    order = plots;
  }

  function showCards(view) {
    const plots = view.spots.map(spot => spot.plot);
    if (plots.join() !== order.join()) rebuildList(plots);
    for (const spot of view.spots) {
      const labels = cardLabels(spot, view);
      if (labels.button && requests?.blocked) labels.button = {...labels.button, disabled: true};
      cards.get(spot.plot).update(spot, labels);
    }
  }

  function focusCard(plot) {
    (cards.get(plot)?.focusTarget() ?? title).focus();
  }

  // A focused button that was removed or turned off drops focus to the page. Put it back on its card.
  function keepFocus() {
    if (isOpen() && !modal.element.contains(document.activeElement)) focusCard(lastPlot);
  }

  function render(view) {
    showText(wallet, walletLine(view));
    setText(note, view.mode === 'local' ? `${view.playMoneyNote} ${LOCAL_NOTE}` : view.playMoneyNote);
    setText(status, view.notice?.message ?? (view.status === 'loading' ? 'Loading your islet...' : ''));
    status.dataset.tone = view.notice?.tone ?? 'info';
    refresh.element.hidden = view.mode === 'unavailable';
    refresh.update({disabled: view.busyPlot !== null || requests?.blocked === true});
    showCards(view);
    keepFocus();
  }
  function syncRequestControls() {
    if (disposed) return;
    render(adapter.read());
    const retry = call.element.querySelector('[data-focus="retry-server-call"]');
    if (retry) retry.disabled = requests?.busy === true || !call.read().canRetry;
  }

  requests = createIsletRequests({adapter, call, presentFailure: failure => clock.fail(call, failure), onChange: syncRequestControls,
    onSettled: intent => {
      if (intent.kind === 'build' && isOpen() && document.activeElement === cards.get(intent.plot)?.heading) focusCard(intent.plot);
    }});

  const stopWatching = adapter.subscribe(event => { if (isOpen()) render(event.view); });

  // Shows what the adapter has now, asks for fresh data, and puts focus on the card of the clicked plot.
  function open(plot) {
    if (disposed) return;
    resetInput?.();
    lastPlot = plot;
    render(adapter.read());
    if (isOpen()) focusCard(plot);
    else modal.open(container, cards.get(plot)?.focusTarget() ?? title);
    requests.refresh().then(() => {
      if (!disposed && isOpen() && document.activeElement === title) focusCard(plot);
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    requests.dispose();
    stopWatching();
    modal.element.removeEventListener('keydown', keepKeys);
    for (const card of cards.values()) card.dispose();
    cards.clear();
    refresh.dispose();
    modal.dispose();
  }

  return {open, close() { requests.cancel(); modal.close(); }, dispose, get active() { return isOpen(); }};
}
