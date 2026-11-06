// "My stakes": the player's stakes and how each one ended, newest first, and the total staked today.
// DOM only. It is a list, not a table, so it reads well on a phone. The words come from view-model.js.
//
// Used by: desk.js.

import { coinsText, sideName, stakeResultLine, todayLine } from './view-model.js';
import { node } from './dom-helpers.js';

export function createStakesView({ timeZone }) {
  const element = node('div', 'desk-stakes');
  const header = node('p', 'desk-account');
  const note = node('p', 'desk-empty');
  const list = node('ul', 'desk-stake-list');
  element.append(header, note, list);
  let drawn = null;

  // The line under the header when there is nothing to list.
  function emptyText(state) {
    if (state.signedIn === false) return 'Sign in with GitHub to see your stakes.';
    if (!state.mine) return 'Your stakes could not be loaded right now. Try again in a moment.';
    return 'You have not staked yet. Pick a question on the Questions tab.';
  }

  function item(stake, closesAt) {
    const row = node('li', 'desk-stake');
    row.append(
      node('h3', '', stake.text),
      node('p', 'desk-stake-main', `${coinsText(stake.amount)} on ${sideName(stake.side)}`),
      node('p', 'desk-stake-result', stakeResultLine(stake, { closesAt, timeZone })),
    );
    return row;
  }

  return {
    element,
    update(state) {
      const stakes = state.mine?.stakes ?? [];
      const closes = new Map((state.list?.questions ?? []).map(question => [question.id, question.closesAt]));
      const key = JSON.stringify([state.signedIn, state.mine, [...closes]]);
      if (key === drawn) return;
      drawn = key;
      header.textContent = state.mine ? todayLine(state.mine) : '';
      note.textContent = stakes.length ? '' : emptyText(state);
      list.replaceChildren(...stakes.map(stake => item(stake, closes.get(stake.questionId))));
    },
    dispose() {
      element.remove();
    },
  };
}
