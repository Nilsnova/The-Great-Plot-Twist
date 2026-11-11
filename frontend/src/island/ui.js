// The island's DOM: one small card at a time (a build spot, the harbor bell, the invite), the countdown
// banner, the visit banner and a toast. It shows models from card-model.js and calls back; it decides
// nothing. Built on the UI kit's modal and button.
import './island.css';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {drawQr} from '../lib/qr/index.js';

function button(label, onClick, quiet = false) {
  const element = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

export function createIslandUi({container, focus = () => {}, resetInput = () => {}} = {}) {
  let modal = null, kind = null, render = null, disposed = false, toastTimer = null;
  const banner = node('div', 'island-banner'); banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); banner.hidden = true;
  const visit = node('div', 'island-visit'); visit.hidden = true;
  const toast = node('div', 'kit-toast island-toast'); toast.setAttribute('role', 'status'); toast.hidden = true;
  container.append(banner, visit, toast);

  function close() {
    if (!modal) return false;
    const current = modal; modal = null; kind = null; render = null;
    current.dispose(); resetInput(); focus();
    return true;
  }
  // Opens (or re-renders) the card of one kind. draw(body) fills it and returns the element to focus.
  function open(nextKind, title, draw) {
    if (disposed) return;
    resetInput();
    if (modal && kind !== nextKind) close();
    if (!modal) {
      modal = createModal({title, onCancel: close});
      modal.element.classList.add('island-card', `island-card-${nextKind}`);
      kind = nextKind;
    }
    modal.setTitle(title);
    render = () => {
      const body = node('div', 'island-card-body');
      const target = draw(body);
      const had = modal.element.contains(document.activeElement) ? document.activeElement?.dataset?.focus : null;
      modal.setContent(body);
      return {target, had, body};
    };
    const {target, had, body} = render();
    if (!modal.element.open) modal.open(container, target);
    else (had ? body.querySelector(`[data-focus="${had}"]`) ?? target : target)?.focus?.({preventScroll: true});
  }

  function buildCard(model, onBuild) {
    open('build', model.title, body => {
      const cost = node('p', 'island-cost', model.cost), purpose = node('p', 'island-purpose', model.purpose);
      const act = button(model.button, () => onBuild(model.spotId)); act.dataset.focus = 'build';
      act.disabled = model.disabled; act.hidden = model.built;
      const reason = node('p', 'island-reason', model.reason); reason.hidden = !model.reason;
      if (model.reason) { reason.id = `island-reason-${model.spotId}`; act.setAttribute('aria-describedby', reason.id); }
      const message = node('p', 'island-message', model.message); message.hidden = !model.message; message.setAttribute('role', 'alert');
      const coins = node('p', 'island-coins', model.coins); coins.hidden = !model.coins;
      body.append(purpose, cost, act, reason, message, coins);
      return model.disabled || model.built ? null : act;
    });
  }
  function bellCard(model, onAction) {
    open('bell', model.title, body => {
      const line = node('p', 'island-purpose', model.line);
      const act = button(model.button, () => onAction(model.action)); act.dataset.focus = 'bell'; act.disabled = model.disabled;
      const message = node('p', 'island-message', model.message); message.hidden = !model.message; message.setAttribute('role', 'alert');
      body.append(line, act, message);
      return model.disabled ? null : act;
    });
  }
  function inviteCard(model) {
    open('invite', model.title, body => {
      const code = node('p', 'island-code', model.code), line = node('p', 'island-purpose', model.line);
      const canvas = node('canvas', 'island-qr'); canvas.hidden = !model.url;
      if (model.url) {
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `QR code for ${model.url}`);
        try { drawQr(canvas, model.url, {scale: 5, margin: 3, ecc: 'M'}); } catch { canvas.hidden = true; }
      }
      const url = node('p', 'island-url', model.url); url.hidden = !model.url;
      const done = button('Done', close, true); done.dataset.focus = 'done';
      body.append(line, code, canvas, url, done);
      return done;
    });
  }
  return {
    buildCard, bellCard, inviteCard, close,
    // Re-draw the open card from fresh models (the island controller calls this on every change).
    get open() { return kind; },
    get active() { return !!modal; },
    banner(text) { banner.textContent = text ?? ''; banner.hidden = !text; },
    visit(info, onHome) {
      visit.replaceChildren();
      visit.hidden = !info;
      if (!info) return;
      visit.append(node('span', '', `Visiting ${info.ownerName || 'a friend'}'s island · ${info.code}`), button('Sail home', onHome, true));
    },
    toast(text, ms = 4200) {
      clearTimeout(toastTimer); toast.textContent = text; toast.hidden = !text;
      toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
    },
    get toastText() { return toast.hidden ? '' : toast.textContent; },
    dispose() {
      if (disposed) return; disposed = true; clearTimeout(toastTimer);
      if (modal) { const current = modal; modal = null; current.dispose(); }
      banner.remove(); visit.remove(); toast.remove();
    },
  };
}
