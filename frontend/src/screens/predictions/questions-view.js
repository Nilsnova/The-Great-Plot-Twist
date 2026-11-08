// The question cards. DOM only: the words come from view-model.js, the next step after a click from
// flow.js, the form from stake-form.js, and every coin number from the server. No pool arithmetic here.
//
// Each card keeps its own form state (the side, the typed amount, the confirm step) while the desk
// refreshes, so a refresh never throws away what the player is doing.
//
//   const view = createQuestionsView({ flow, refresh });
//   view.update(deskState, Date.now());      // draw
//   view.cancelConfirm();                    // true when it closed an open confirm (Escape uses this)
//
// Used by: desk.js.

import { createCardList } from './card-list.js';
import { focusKey, node, setText } from './dom-helpers.js';
import { GENERIC_LINE } from './messages.js';
import { buildStakeForm } from './stake-form.js';
import { cardModel, checkStakeInput, coinsText, stakePlacedLine, todayLine } from './view-model.js';
import {createServerCallState} from '../../ui/kit/server-call-state.js';
import {predictionFailure} from './g9-policy.js';

function confirmedStake(reply, questionId) {
  const row = reply?.data;
  return row?.questionId === questionId && ['yes', 'no'].includes(row.side)
    && Number.isSafeInteger(row.amount) && row.amount > 0 ? {side: row.side, amount: row.amount} : null;
}

export function createQuestionsView({flow, refresh, timeZone, onSignIn,
  capture = () => null, isCurrent = () => true}) {
  const element = node('div', 'desk-questions');
  const account = node('p', 'desk-account');
  const empty = node('p', 'desk-empty', 'There are no questions on the desk right now. Check back soon.');
  const list = createCardList('desk-cards');
  let retryQuestion = null;
  const call = createServerCallState({label: 'prediction stake', onRetry: () => retryQuestion && confirm(retryQuestion),
    onSignIn, onChange: () => syncCooldown()});
  element.append(account, empty, call.element, list.element);

  const forms = new Map(); // question id -> what the player is doing on that card
  let latest = null; // { state, now } from the last update
  let focusStakeOf = null; // the question whose "Your stake" line gets the focus after the next draw
  let disposed = false, cooldownTimer = null;
  const canAct = () => !disposed && isCurrent(capture());

  function syncCooldown() {
    if (disposed) return;
    clearTimeout(cooldownTimer); cooldownTimer = null;
    const now = Date.now(); let next = Infinity, changed = false;
    for (const [id, form] of forms) {
      const held = flow.retryUntil ?? 0;
      if (held > now) form.retryUntil = Math.max(form.retryUntil, held);
      const waiting = form.retryUntil > now;
      const controls = list.card(id)?.article.querySelectorAll('[data-focus="confirm"],[data-focus="stake"]') ?? [];
      for (const control of controls) control.disabled = form.busy || waiting;
      if (waiting) next = Math.min(next, form.retryUntil - now);
      else if (form.retryUntil) {
        form.retryUntil = 0; form.notice = 'You can try again now.'; changed = true;
      }
    }
    if (Number.isFinite(next)) cooldownTimer = setTimeout(syncCooldown, Math.max(1, next));
    if (changed) { if (retryQuestion === null) call.clear(); draw(); }
  }

  function formFor(id) {
    if (!forms.has(id)) forms.set(id, {side: null, amount: '', step: 'edit', busy: false,
      notice: '', placed: null, retryUntil: flow.retryUntil ?? 0});
    return forms.get(id);
  }

  function focusOn(id, key) {
    if (!canAct()) return;
    const card = list.card(id);
    if (card) focusKey(card.article, key);
  }

  // Stake: check what the player typed, then show the confirm step.
  function submit(id) {
    if (!canAct() || !latest) return;
    const form = formFor(id);
    if (form.busy || form.retryUntil > Date.now()) return;
    const { state } = latest;
    const rules = state.list?.rules;
    const check = checkStakeInput({ side: form.side, amountText: form.amount, rules, leftToday: state.mine?.leftToday });
    if (!check.ok) {
      form.notice = check.message;
      draw();
      focusOn(id, check.field === 'side' ? 'side-yes' : 'amount');
      return;
    }
    Object.assign(form, { side: check.side, amount: String(check.amount), step: 'confirm', notice: '' });
    draw();
    focusOn(id, 'confirm-text');
  }

  function goBack(id) {
    if (!canAct()) return;
    const form = formFor(id);
    retryQuestion = null;
    Object.assign(form, {step: 'edit', notice: form.retryUntil > Date.now() ? form.notice : ''});
    draw();
    focusOn(id, 'stake');
  }

  // Confirm: send the stake. flow.js decides what comes next (done, back to the form, or try again).
  async function confirm(id) {
    if (!canAct() || formFor(id).step !== 'confirm' || formFor(id).retryUntil > Date.now()) return;
    const ticket = capture();
    const form = formFor(id);
    if (form.busy) return;
    const ask = { questionId: id, side: form.side, amount: Number(form.amount) };
    retryQuestion = id; call.loading();
    Object.assign(form, { busy: true, notice: '', retryUntil: 0 });
    draw();
    focusOn(id, 'confirm-text'); // the Confirm button is disabled while the request is in flight
    let result;
    try {
      result = await flow.stake(ask);
    } catch {
      result = { done: false, step: 'edit', notice: GENERIC_LINE };
    }
    if (disposed || !isCurrent(ticket) || result.cancelled) return;
    Object.assign(form, { busy: false, step: result.step, notice: result.notice });
    if (result.reply?.kind === 'wait' && Number.isFinite(result.reply.seconds)) {
      form.retryUntil = flow.retryUntil ?? 0;
    }
    if (result.done) {
      Object.assign(form, { placed: confirmedStake(result.reply, id), side: null, amount: '', step: 'edit' });
      focusStakeOf = id;
    }
    if (result.done) call.succeed();
    else call.fail(predictionFailure(result.reply), result.reply?.kind === 'wait'
      ? {retryAfterMs: Math.min(86400000, Math.max(0, form.retryUntil - Date.now()))} : undefined);
    draw();
    if (!result.done && !disposed && isCurrent(ticket)) {
      if (['closed', 'wait'].includes(result.reply?.kind)) {
        const report = call.element.querySelector('[data-focus="report-server-call"]');
        if (canAct() && report?.isConnected && !report.hidden && !call.element.hidden) report.focus({preventScroll: false});
      } else focusOn(id, form.step === 'confirm' ? 'confirm' : 'stake');
    }
    if (result.refresh !== false && isCurrent(ticket)) await refresh();
  }

  function renderCard(body, article, model, form) {
    const title = node('h3', '', model.title);
    title.id = `desk-title-${model.id}`;
    title.tabIndex = -1;
    title.dataset.focus = 'title';
    article.setAttribute('aria-labelledby', title.id);
    const meta = node('p', 'desk-meta');
    meta.append(node('span', 'kit-badge', model.topic), ' ', model.decidedBy);
    const pool = node('ul', 'desk-pool');
    pool.append(...model.poolLines.map(line => node('li', '', line)));
    body.replaceChildren(title, meta);
    if (model.closing) body.append(node('p', 'desk-closing', model.closing));
    body.append(pool, node('p', 'desk-rule', model.rule));
    if (model.yourStake) {
      const yours = node('p', 'desk-your-stake', model.yourStake);
      yours.tabIndex = -1;
      yours.dataset.focus = 'your-stake';
      body.append(yours);
    }
    if (model.blocked) body.append(node('p', 'desk-blocked', model.blocked));
    if (model.form) {
      const actions = { submit: () => submit(model.id), confirm: () => confirm(model.id), back: () => goBack(model.id) };
      body.append(buildStakeForm({ id: model.id, model: model.form, form, actions }));
    }
  }

  function cardItem(question, state, now) {
    const form = formFor(question.id);
    const context = { rules: state.list.rules, mine: state.mine, signedIn: state.signedIn, now, timeZone, placed: form.placed };
    const model = cardModel(question, context);
    // The form is gone (the stake turned up in "mine", or staking closed), so there is nothing left to confirm.
    if (!model.form && form.step === 'confirm' && !form.busy) {
      form.step = 'edit';
      form.notice = model.own ? stakePlacedLine(model.own) : '';
    }
    const typed = form.step === 'confirm' ? [form.side, form.amount] : null;
    const signature = JSON.stringify([model, form.step, form.busy, typed]);
    return { id: question.id, signature, notice: form.notice, render: (body, article) => renderCard(body, article, model, form) };
  }

  function draw() {
    if (!latest) return;
    const { state, now } = latest;
    const questions = state.list?.questions ?? [];
    setText(account, state.mine ? `You have ${coinsText(state.mine.coins)}. ${todayLine(state.mine)}` : '');
    empty.hidden = questions.length > 0;
    list.sync(questions.map(question => cardItem(question, state, now)));
    if (focusStakeOf) {
      focusOn(focusStakeOf, 'your-stake');
      focusStakeOf = null;
    }
    syncCooldown();
  }

  return {
    element,
    update(state, now = Date.now()) {
      if (disposed) return;
      latest = { state, now };
      draw();
    },
    cancelConfirm() {
      if (!canAct()) return false;
      const entry = [...forms].find(([, form]) => form.step === 'confirm' && !form.busy);
      if (!entry) return false;
      goBack(entry[0]);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(cooldownTimer); cooldownTimer = null;
      forms.clear(); latest = null; retryQuestion = null; call.dispose();
      element.remove();
    },
  };
}
