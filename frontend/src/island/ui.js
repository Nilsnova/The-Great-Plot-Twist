// The island's DOM: one small card at a time (a build spot, the crew, the captain, the harbor bell, Play
// with a friend, the captains here), the countdown
// banner and the visit banner. It shows models from card-model.js and calls back; it decides nothing.
// Built on the UI kit's modal and button (the one brass panel); toasts go through the game's one toast
// queue (src/ui/toasts.js).
import './island.css';
import {createModal} from '../ui/kit/modal.js';
import {node} from '../ui/kit/dom.js';
import {drawQr} from '../lib/qr/index.js';
import {toasts as gameToasts} from '../ui/toasts.js';

function button(label, onClick, quiet = false) {
  const element = node('button', `kit-button${quiet ? ' kit-quiet' : ''}`, label); element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

export function createIslandUi({container, focus = () => {}, resetInput = () => {}, toasts = gameToasts} = {}) {
  let modal = null, kind = null, render = null, disposed = false, lastToast = null;
  const banner = node('div', 'island-banner'); banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); banner.hidden = true;
  const bannerEyebrow = node('span', 'island-banner-eyebrow', 'Harbor bell'), bannerText = node('strong', 'island-banner-text');
  bannerEyebrow.setAttribute('aria-hidden', 'true');
  banner.append(bannerEyebrow, bannerText);
  const visit = node('div', 'island-visit'); visit.hidden = true;
  container.append(banner, visit);

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

  // Level pips: ■■□ (filled up to the level), read out as "Level 2 of 3".
  function pips(list) {
    const row = node('p', 'island-pips');
    row.setAttribute('aria-label', `Level ${list.filter(Boolean).length} of ${list.length}`);
    for (const on of list) { const pip = node('span', `island-pip${on ? ' is-on' : ''}`); pip.setAttribute('aria-hidden', 'true'); row.append(pip); }
    return row;
  }
  const line = (className, text, role) => { const element = node('p', className, text ?? ''); element.hidden = !text; if (role) element.setAttribute('role', role); return element; };
  // The parts every card shares: the reason a button is off, the small "Coming soon" line, the server's
  // plain message and the balance.
  function footer(body, model, act) {
    const reason = line('island-reason', model.reason);
    if (model.reason && act) { reason.id = `island-reason-${model.spotId ?? model.title.replace(/\W+/g, '-').toLowerCase()}`; act.setAttribute('aria-describedby', reason.id); }
    body.append(reason, line('island-soon', model.soon), line('island-message', model.message, 'alert'), line('island-coins', model.coins));
  }

  // handlers: {build(spotId, kind), upgrade(spotId), hire()}
  function buildCard(model, handlers) {
    const on = typeof handlers === 'function' ? {build: handlers} : handlers ?? {};
    open('build', model.title, body => {
      let focusable = null;
      body.append(line('island-purpose', model.purpose));
      if (model.pips.length) { const row = node('div', 'island-level'); row.append(pips(model.pips), line('island-stats', model.stats)); body.append(row); }
      if (model.owner) body.append(line('island-owner', model.owner));
      let act = null;
      if (model.mode === 'choose') {
        const list = node('div', 'island-choices');
        for (const choice of model.choices) {
          const option = node('button', 'island-choice'); option.type = 'button'; option.dataset.focus = `choice-${choice.kind}`; option.dataset.kind = choice.kind;
          option.disabled = choice.disabled;
          const head = node('span', 'island-choice-head'); head.append(node('strong', '', choice.busy ? 'Building…' : choice.name), node('span', 'island-choice-price', choice.price));
          option.append(head, node('span', 'island-choice-line', choice.line));
          if (choice.reason) option.append(node('span', 'island-choice-reason', choice.reason));
          option.addEventListener('click', () => on.build?.(model.spotId, choice.kind));
          list.append(option); focusable ??= choice.disabled ? null : option;
        }
        body.append(list);
      } else if (model.mode === 'build') {
        body.append(line('island-cost', model.cost));
        act = button(model.button, () => on.build?.(model.spotId, model.kind)); act.dataset.focus = 'build'; act.disabled = model.disabled;
        body.append(act);
      } else if (model.mode === 'upgrade') {
        const next = node('div', 'island-next');
        next.append(node('strong', 'island-next-label', model.upgrade.label), node('span', 'island-next-stats', model.upgrade.stats));
        act = button(model.button, () => on.upgrade?.(model.spotId)); act.dataset.focus = 'upgrade'; act.disabled = model.disabled;
        body.append(next, act);
      }
      if (act && !act.disabled) focusable = act;
      footer(body, model, act);
      if (model.hire && on.hire) {
        const hire = button('Hire crew', () => on.hire(), true); hire.classList.add('island-hire'); hire.dataset.focus = 'hire';
        body.append(hire); focusable ??= hire;
      }
      return focusable;
    });
  }
  function crewCard(model, onHire) {
    open('crew', model.title, body => {
      let focusable = null;
      body.append(line('island-purpose', model.lead));
      const list = node('ul', 'island-crew');
      for (const row of model.rows) {
        const item = node('li', 'island-crew-row'); item.dataset.crew = row.id;
        const text = node('div', 'island-crew-text');
        const head = node('p', 'island-crew-head'); head.append(node('strong', '', row.name), node('span', 'island-crew-owned', row.owned));
        text.append(head, node('p', 'island-crew-line', row.line));
        if (row.reason) text.append(node('p', 'island-crew-reason', row.reason));
        const hire = button(`${row.button}${row.button === 'Hire' ? ` · ${row.price}` : ''}`, () => onHire(row.id)); hire.dataset.focus = `hire-${row.id}`;
        hire.disabled = row.disabled; hire.setAttribute('aria-label', `${row.button} ${row.name}, ${row.price}`);
        item.append(text, hire); list.append(item);
        focusable ??= row.disabled ? null : hire;
      }
      body.append(list);
      body.append(line('island-soon', model.soon), line('island-message', model.message, 'alert'), line('island-coins', model.coins));
      const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
      return focusable ?? done;
    });
  }
  function captainCard(model, onUpgrade) {
    open('captain', model.title, body => {
      const row = node('div', 'island-level'); row.append(pips(model.pips), line('island-stats', `Musket · ${model.stats}`));
      body.append(row, line('island-hint', model.hint));
      let act = null;
      if (model.upgrade) {
        const next = node('div', 'island-next');
        next.append(node('strong', 'island-next-label', model.upgrade.label), node('span', 'island-next-stats', model.upgrade.stats));
        act = button(model.button, () => onUpgrade()); act.dataset.focus = 'upgrade'; act.disabled = model.disabled;
        body.append(next, act);
      }
      footer(body, model, act);
      const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
      return act && !act.disabled ? act : done;
    });
  }
  function captainsCard(model) {
    open('captains', model.title, body => {
      const list = node('ul', 'island-tags');
      for (const name of model.names) list.append(node('li', 'island-tag', name));
      list.hidden = !model.names.length;
      body.append(list, line('island-purpose', model.line));
      const done = button('Done', close, true); done.dataset.focus = 'done'; body.append(done);
      return done;
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
  // Copy the link: the clipboard when allowed, otherwise the link is selected for the player to copy.
  async function copyLink(field, status) {
    let copied = false;
    try { await globalThis.navigator?.clipboard?.writeText(field.value); copied = !!globalThis.navigator?.clipboard; } catch { copied = false; }
    if (!copied) { field.focus(); field.select(); try { copied = document.execCommand?.('copy') === true; } catch { copied = false; } }
    status.textContent = copied ? 'Link copied. Send it to your friend in a message.' : 'The link is selected. Copy it and send it to your friend.';
    status.hidden = false;
    return copied;
  }
  function inviteCard(model) {
    open('invite', model.title, body => {
      const lead = node('p', 'island-lead', model.lead);
      const field = node('input', 'island-link'); field.type = 'text'; field.readOnly = true; field.value = model.url; field.hidden = !model.url;
      field.setAttribute('aria-label', 'Invite link'); field.addEventListener('focus', () => field.select());
      const status = line('island-copied', ''); status.setAttribute('role', 'status');
      const copy = button(model.copy, () => void copyLink(field, status)); copy.dataset.focus = 'copy'; copy.hidden = !model.url;
      const canvas = node('canvas', 'island-qr'); canvas.hidden = !model.url;
      if (model.url) {
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `QR code for ${model.url}`);
        try { drawQr(canvas, model.url, {scale: 5, margin: 3, ecc: 'M'}); } catch { canvas.hidden = true; }
      }
      const share = node('div', 'island-share'); share.append(field, copy);
      const code = node('p', 'island-code-small', model.url ? `Island code ${model.code}` : model.code);
      const done = button('Done', close, true); done.dataset.focus = 'done';
      body.append(lead, share, status, canvas, line('island-purpose', model.line), code, done);
      return model.url ? copy : done;
    });
  }
  return {
    buildCard, bellCard, inviteCard, crewCard, captainCard, captainsCard, close, copyLink,
    // Re-draw the open card from fresh models (the island controller calls this on every change).
    get open() { return kind; },
    get active() { return !!modal; },
    banner(text) { bannerText.textContent = text ?? ''; banner.hidden = !text; },
    visit(info, onHome) {
      visit.replaceChildren();
      visit.hidden = !info;
      if (!info) return;
      visit.append(node('span', '', `Visiting ${info.ownerName || 'a friend'}'s island · ${info.code}`), button('Sail home', onHome, true));
    },
    // tone: 'info', 'success' (a building, loot) or 'error' (the server's plain message).
    toast(text, tone = 'info', next = '') {
      if (disposed || !text) return;
      const id = toasts().show(next ? {text, tone, next} : {text, tone});
      lastToast = id === null ? null : {id, text};
    },
    get toastText() { return lastToast && toasts().shown.some(item => item.id === lastToast.id) ? lastToast.text : ''; },
    dispose() {
      if (disposed) return; disposed = true;
      if (modal) { const current = modal; modal = null; current.dispose(); }
      banner.remove(); visit.remove();
    },
  };
}
