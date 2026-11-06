// The rules card (tab 4), always one click away: the three signals with their shapes, what beats
// what, the oil each one burns, and the money rules. The numbers of stakes, the cut and the
// answer window come from the server's rules block, so the card never says anything the server
// does not do. Used by: panel.js.
import { BEATS, OIL_COST, SIGNALS, SIGNAL_NAMES } from './logic.js';
import { signalGlyph } from './glyphs.js';
import { changed, node } from './dom.js';

const BEAT_WORDS = { flash: 'outshines Shade', shade: 'leaves Mirror nothing to throw back', mirror: 'throws Flash back' };

export function createRulesCard() {
  const element = node('div', 'duel-rules'), memo = {};

  function signalRow(signal) {
    const row = node('li', 'duel-signal-row'), text = node('span');
    text.textContent = `${SIGNAL_NAMES[signal]} ${BEAT_WORDS[signal]}. It burns ${OIL_COST[signal]} oil.`;
    row.append(signalGlyph(signal, 32), text);
    return row;
  }

  function update(view) {
    const rules = view.rules;
    if (!changed(memo, rules)) return;
    const stakes = rules.stakeChoices.filter(amount => amount > 0).join(', ');
    const list = node('ul', 'duel-signal-list');
    list.append(...SIGNALS.map(signalRow));
    element.replaceChildren(
      node('h3', '', 'How a duel works'),
      node('p', '', 'Two captains, one ring. In each round both lanterns show one signal at the same moment.'),
      list,
      node('p', '', `${SIGNAL_NAMES.flash} beats ${SIGNAL_NAMES[BEATS.flash]}, ${SIGNAL_NAMES.shade} beats ${SIGNAL_NAMES[BEATS.shade]}, ${SIGNAL_NAMES.mirror} beats ${SIGNAL_NAMES[BEATS.mirror]}. The same signal on both sides scores for nobody.`),
      node('p', '', 'Lantern oil equals the number of rounds. A sequence that burns more oil than that is not allowed.'),
      node('p', '', 'You seal a signal for every round. The ring keeper opens both envelopes only when both are in. More rounds won wins the duel; equal is a draw.'),
      node('p', '', `A duel is friendly, or each captain stakes ${stakes} coins. The winner takes the pot minus ${rules.cutPercent} %. A draw, a withdrawal, a decline or no answer within ${rules.answerHours} h gives every stake back.`),
      node('p', '', `You can have ${rules.maxWaiting} challenges waiting, and play ${rules.pairDailyLimit} staked duels a day with the same captain. Simulation, play money.`),
    );
  }

  return { element, update };
}
