// Your duels (tab 3): the challenges still waiting, each with your sealed signals, the time left
// and a Withdraw button that says which coins come back, then the results of finished duels,
// newest first, with Replay and Rematch. It shows exactly what the server's lists say; the
// server decided every point and every coin.
// Used by: panel.js.
import { SIGNAL_NAMES, otherCaptainName, timeLeftText } from './logic.js';
import { historyLine, termsText } from './steps.js';
import { signalGlyph } from './glyphs.js';
import { button, changed, node, redraw } from './dom.js';

const dateOf = iso => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// The player's own sealed signals as small chips: shape and name, never colour alone.
function signalChips(signals) {
  const row = node('p', 'duel-sealed', 'Your sealed signals: ');
  for (const signal of signals) {
    const chip = node('span', 'duel-chip');
    chip.append(signalGlyph(signal, 16), SIGNAL_NAMES[signal]);
    row.append(chip);
  }
  return row;
}

export function createHistory({ onWithdraw, onShowSignals, onReplay, onRematch }) {
  const element = node('div', 'duel-history'), memo = {};

  function waitingCard(duel, sealed, nowMs) {
    const card = node('article', 'duel-card');
    const title = duel.isOpen ? 'Open challenge: any captain can answer' : `Waiting for ${duel.opponentName ?? 'a captain'}`;
    card.append(node('h4', '', title), node('p', '', termsText(duel)), node('p', '', `Answer within ${timeLeftText(duel.expiresAt, nowMs)}`));
    card.append(sealed ? signalChips(sealed) : button('Show my sealed signals', () => onShowSignals(duel.id), { quiet: true, focus: `show-${duel.id}` }));
    const label = duel.stake > 0 ? `Withdraw: your ${duel.stake} coins come back` : 'Withdraw';
    if (duel.canWithdraw) card.append(button(label, () => onWithdraw(duel.id), { focus: `withdraw-${duel.id}` }));
    return card;
  }

  function resultCard(duel) {
    const card = node('article', 'duel-card'), actions = node('div', 'duel-actions');
    const other = otherCaptainName(duel), line = historyLine(duel);
    card.append(node('p', 'duel-result-line', line), node('p', 'duel-when', dateOf(duel.closedAt ?? duel.createdAt)), actions);
    if (duel.status === 'finished') {
      const replay = button('Replay', () => onReplay(duel.id), { quiet: true, focus: `replay-${duel.id}` });
      replay.setAttribute('aria-label', `Replay: ${line}`);
      actions.append(replay);
    }
    if (other) {
      const again = button(duel.status === 'finished' ? 'Rematch' : 'Challenge again', () => onRematch(other), { quiet: true, focus: `rematch-${duel.id}` });
      again.setAttribute('aria-label', `${again.textContent} with ${other}`);
      actions.append(again);
    }
    return card;
  }

  function update(view) {
    const nowMs = Date.now() + view.serverOffsetMs;
    if (!changed(memo, [view.yours, view.recent, view.sealed, Math.floor(nowMs / 60000)])) return;
    redraw(element, () => {
      const waiting = node('section', 'duel-section'), results = node('section', 'duel-section');
      waiting.append(node('h3', '', 'Waiting for an answer'));
      if (!view.yours.length) waiting.append(node('p', 'duel-empty', 'Nothing is waiting. Send a challenge from the New challenge tab.'));
      for (const duel of view.yours) waiting.append(waitingCard(duel, view.sealed[duel.id], nowMs));
      results.append(node('h3', '', 'Results'));
      if (!view.recent.length) results.append(node('p', 'duel-empty', 'No finished duels yet.'));
      for (const duel of view.recent) results.append(resultCard(duel));
      element.replaceChildren(waiting, results);
    });
  }

  return { element, update };
}
