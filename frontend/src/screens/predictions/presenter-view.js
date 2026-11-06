// The presenter tab, for hosts: for every question, what Manifold says, how our pool stands, and the
// buttons Settle YES, Settle NO and Void. Each button first asks "are you sure?" and says what will happen.
// DOM only. The words and the choice of buttons come from presenter-model.js; the server decides the rest.
//
// Used by: desk.js (only when "mine" says the player is a host).

import { createCardList } from './card-list.js';
import { confirmGroup } from './confirm-group.js';
import { button, focusKey, node } from './dom-helpers.js';
import { GENERIC_LINE } from './messages.js';
import { manifoldLine, poolLine, settleConfirmText, settleLabel, settleOptions } from './presenter-model.js';
import { poolLines } from './view-model.js';

const OUTCOMES = ['yes', 'no', 'void'];
const INTRO = 'Presenter tools. A settlement is final: a pool pays out once and it cannot be undone.';

export function createPresenterView({ flow, refresh, timeZone }) {
  const element = node('div', 'desk-presenter');
  const list = createCardList('desk-cards');
  element.append(node('p', 'desk-account', INTRO), list.element);

  const steps = new Map(); // question id -> { pending (the outcome to confirm), busy, notice }
  let latest = null;
  let disposed = false;
  const options = { timeZone };

  function stepFor(id) {
    if (!steps.has(id)) steps.set(id, { pending: null, busy: false, notice: '' });
    return steps.get(id);
  }

  function focusOn(id, key) {
    const card = list.card(id);
    if (card) focusKey(card.article, key);
  }

  function choose(id, outcome) {
    Object.assign(stepFor(id), { pending: outcome, notice: '' });
    draw();
    focusOn(id, 'confirm-text');
  }

  function goBack(id) {
    const step = stepFor(id);
    const outcome = step.pending;
    Object.assign(step, { pending: null, notice: '' });
    draw();
    focusOn(id, `settle-${outcome}`);
  }

  // Confirm: send the settlement. flow.js decides what comes next (done, back to the buttons, or try again).
  async function confirm(id) {
    const step = stepFor(id);
    if (step.busy) return;
    const outcome = step.pending;
    Object.assign(step, { busy: true, notice: '' });
    draw();
    focusOn(id, 'confirm-text'); // the Confirm button is disabled while the request is in flight
    let result;
    try {
      result = await flow.settle({ questionId: id, outcome });
    } catch (error) {
      console.error(error);
      result = { done: false, step: 'edit', notice: GENERIC_LINE };
    }
    Object.assign(step, { busy: false, notice: result.notice, pending: result.step === 'confirm' ? outcome : null });
    if (disposed) return;
    draw();
    if (!result.done) focusOn(id, step.pending ? 'confirm' : `settle-${outcome}`);
    await refresh();
  }

  function renderButtons(body, question, choices) {
    const actions = node('div', 'desk-actions');
    for (const outcome of OUTCOMES) {
      actions.append(button(settleLabel(outcome), () => choose(question.id, outcome), {
        disabled: !choices[outcome],
        quiet: outcome === 'void',
        focus: `settle-${outcome}`,
      }));
    }
    body.append(actions);
  }

  function renderCard(body, article, question, step) {
    const title = node('h3', '', question.text);
    title.id = `desk-presenter-${question.id}`;
    title.tabIndex = -1;
    title.dataset.focus = 'title';
    article.setAttribute('aria-labelledby', title.id);
    const pool = node('ul', 'desk-pool');
    pool.append(...poolLines(question).map(line => node('li', '', line)));
    body.replaceChildren(
      title,
      node('p', 'desk-manifold', manifoldLine(question.manifold, options)),
      node('p', 'desk-poolline', poolLine(question, options)),
      pool,
    );
    const choices = settleOptions(question, options);
    if (choices.hint) body.append(node('p', 'desk-hint', choices.hint));
    if (!step.pending) return renderButtons(body, question, choices);
    body.append(confirmGroup({
      text: settleConfirmText(step.pending),
      busy: step.busy,
      onConfirm: () => confirm(question.id),
      onBack: () => goBack(question.id),
    }));
  }

  function draw() {
    if (!latest) return;
    const questions = latest.list?.questions ?? [];
    list.sync(questions.map(question => {
      const step = stepFor(question.id);
      // Somebody settled it already, so there is nothing left to confirm.
      if (question.status === 'settled' && step.pending && !step.busy) step.pending = null;
      const signature = JSON.stringify([question, step.pending, step.busy]);
      return { id: question.id, signature, notice: step.notice, render: (body, article) => renderCard(body, article, question, step) };
    }));
  }

  return {
    element,
    update(state) {
      latest = state;
      draw();
    },
    cancelConfirm() {
      const entry = [...steps].find(([, step]) => step.pending && !step.busy);
      if (!entry) return false;
      goBack(entry[0]);
      return true;
    },
    dispose() {
      disposed = true;
      element.remove();
    },
  };
}
