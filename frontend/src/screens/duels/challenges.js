// Challenges (tab 1): named challenges to you (Answer, Decline) and open challenges from other
// captains (Answer). Answering opens the sealed picker for that challenge's rounds and stake, and
// the button seals and answers in one step: answering is accepting. The challenger's signals are
// never here; the server shows them only in the reveal, after you have sealed yours.
// Used by: panel.js.
import { timeLeftText } from './logic.js';
import { termsText } from './steps.js';
import { createPicker } from './picker.js';
import { button, changed, node, redraw } from './dom.js';

export function createChallenges({ onAnswer, onDecline }) {
  const element = node('div', 'duel-challenges'), listBox = node('div'), answerBox = node('section', 'duel-answer');
  const heading = node('h3'), terms = node('p'), hint = node('p', 'duel-hint');
  const memo = {};
  const numbers = new Map();let nextNumber = 0;
  let current = null, coins = 0, busy = false, disposed = false;
  answerBox.hidden = true;
  heading.tabIndex = -1;
  hint.setAttribute('aria-live', 'polite');

  const picker = createPicker({ onChange: refreshSeal });
  const sealButton = button('Seal and answer', seal, { disabled: true });
  const backButton = button('Back to the challenges', leaveAnswer, { quiet: true });
  const row = node('div', 'duel-actions');
  row.append(sealButton, backButton);
  answerBox.append(heading, terms, hint, picker.element, row);
  element.append(listBox, answerBox);

  // The seal button waits for a signal in every round, and for coins that can pay the stake.
  function refreshSeal() {
    if (!current) return;
    const poor = current.stake > coins;
    sealButton.textContent = current.stake > 0 ? `Seal, stake ${current.stake} and answer` : 'Seal and answer';
    sealButton.disabled = busy || poor || !picker.isComplete();
    hint.textContent = poor ? `You have ${coins} coins; this duel needs ${current.stake}.` : '';
  }

  async function seal() {
    if(disposed||busy||!current)return;
    busy = true;
    refreshSeal();
    await onAnswer(current.id, picker.getSignals());
    if(disposed)return;
    busy = false;
    leaveAnswer();
  }

  function startAnswer(duel) {
    if(disposed)return;
    current = duel;
    heading.textContent = `Answer ${duel.challengerName}`;
    terms.textContent = `${termsText(duel)}. Answer within ${timeLeftText(duel.expiresAt, Date.now())}.`;
    picker.setRounds(duel.rounds);
    refreshSeal();
    listBox.hidden = true;
    answerBox.hidden = false;
    heading.focus();
  }

  function leaveAnswer() {
    if(disposed)return;
    const id = current?.id;
    current = null;
    answerBox.hidden = true;
    listBox.hidden = false;
    memo.last = null; // the list is drawn again with the newest data
    element.querySelector(`[data-focus="answer-${id}"]`)?.focus();
  }

  function card(duel, nowMs) {
    if(!numbers.has(duel.id))numbers.set(duel.id,++nextNumber);
    const context=`challenge ${numbers.get(duel.id)} from ${duel.challengerName}`;
    const box = node('article', 'duel-card');
    box.append(node('h4', '', duel.challengerName), node('p', '', termsText(duel)), node('p', '', `Answer within ${timeLeftText(duel.expiresAt, nowMs)}`));
    const actions = node('div', 'duel-actions');
    if (duel.canAnswer) {
      const answer=button('Answer', () => startAnswer(duel), { focus: `answer-${duel.id}` });
      answer.setAttribute('aria-label',`Answer ${context}`);actions.append(answer);
    }
    if (duel.canDecline) {
      const decline=button('Decline', () => onDecline(duel.id), { quiet: true, focus: `decline-${duel.id}` });
      decline.setAttribute('aria-label',`Decline ${context}`);actions.append(decline);
    }
    box.append(actions);
    return box;
  }

  function drawList(view, nowMs) {
    const sections = [['Named challenges to you', view.incoming], ['Open challenges', view.openChallenges]];
    const parts = sections.filter(([, duels]) => duels.length).map(([title, duels]) => {
      const section = node('section', 'duel-section');
      section.append(node('h3', '', title), ...duels.map(duel => card(duel, nowMs)));
      return section;
    });
    const empty = node('p', 'duel-empty', 'No challenges yet. Send an open challenge and any captain can answer.');
    listBox.replaceChildren(...(parts.length ? parts : [empty]));
  }

  function update(view) {
    if(disposed)return;
    coins = view.coins ?? 0;
    const nowMs = Date.now() + view.serverOffsetMs;
    const stillThere = [...view.incoming, ...view.openChallenges].some(duel => duel.id === current?.id);
    if (current && !stillThere && !busy) leaveAnswer();
    refreshSeal();
    if (changed(memo, [view.incoming, view.openChallenges, Math.floor(nowMs / 60000)])) redraw(listBox, () => drawList(view, nowMs));
  }

  return { element, update,dispose(){disposed=true;current=null;coins=0;memo.last=null;numbers.clear();picker.dispose();element.replaceChildren();element.remove();} };
}
