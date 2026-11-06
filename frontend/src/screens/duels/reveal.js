// The reveal: two lanterns face each other and, round by round, both shutters open at once and
// show the two signals. The round strip marks each point, a line says why, and the score ticks,
// about 0.9 s per round, then a result banner. A hidden live region speaks the same words, and
// with reduced motion nothing moves: the whole result appears at once as a table.
// The points were decided by the server; this file only plays them (steps.js has the words).
// Focus starts on "Skip" and ends on "Back to the ring".
// Used by: panel.js.
import { createTable } from '../../ui/kit/table.js';
import { reducedMotion } from '../../settings/preferences.js';
import { SIGNAL_NAMES, otherCaptainName } from './logic.js';
import { revealSteps } from './steps.js';
import { signalGlyph } from './glyphs.js';
import { button, node } from './dom.js';

const STEP_MS = 900;

// A lantern: a name above a shutter that holds the signal shape, with the signal's name below.
function lantern(side) {
  const box = node('div', 'duel-lantern'), name = node('p', 'duel-lantern-name');
  const shutter = node('div', 'duel-shutter'), signalName = node('p', 'duel-lantern-signal');
  box.dataset.side = side;
  shutter.dataset.open = 'false';
  box.append(name, shutter, signalName);
  return { box, name, shutter, signalName };
}

export function createReveal({ onLeave } = {}) {
  const element = node('section', 'duel-reveal'), heading = node('h3', 'duel-reveal-title');
  const scene = node('div', 'duel-scene'), strip = node('ol', 'duel-strip'), score = node('p', 'duel-score');
  const line = node('p', 'duel-line'), banner = node('p', 'duel-banner'), tableBox = node('div', 'duel-reveal-table');
  const speech = node('p', 'kit-sr-only'), actions = node('div', 'duel-actions');
  const left = lantern('you'), right = lantern('them');
  let steps = [], timer = null, duel = null;
  element.hidden = true;
  speech.setAttribute('aria-live', 'polite');
  scene.setAttribute('aria-hidden', 'true');
  scene.append(left.box, score, right.box);

  const skipButton = button('Skip', () => show(steps.length - 1), { quiet: true });
  const backButton = button('Back to the ring', leave);
  actions.append(skipButton, backButton);
  element.append(heading, scene, strip, line, banner, tableBox, speech, actions);

  function showSignal(side, signal) {
    side.shutter.replaceChildren(signalGlyph(signal, 48));
    side.signalName.textContent = SIGNAL_NAMES[signal] ?? 'Unknown';
    side.shutter.dataset.open = 'false';
    side.shutter.getBoundingClientRect(); // let the closed state paint first, so opening can animate
    side.shutter.dataset.open = 'true';
  }

  // The first `count` rounds are marked with who took the point; the others wait.
  function markStrip(count) {
    [...strip.children].forEach((cell, index) => {
      const marked = index < count;
      cell.dataset.point = marked ? duel.reveal[index].point : 'pending';
      cell.textContent = marked ? `${index + 1} ${duel.reveal[index].point}` : String(index + 1);
    });
  }

  function drawRound(step) {
    showSignal(left, step.yours);
    showSignal(right, step.theirs);
    markStrip(step.round);
    score.textContent = `${step.score.you} : ${step.score.them}`;
    line.textContent = step.line;
  }

  function drawResult(step) {
    const otherName = otherCaptainName(duel) ?? 'Other captain';
    const columns = [{ key: 'round', label: 'Round' }, { key: 'yours', label: 'You' }, { key: 'theirs', label: otherName }, { key: 'point', label: 'Point' }];
    const showTable = reducedMotion();
    tableBox.replaceChildren(createTable({ caption: 'Every round', columns, rows: step.rows }).element);
    tableBox.hidden = !showTable;
    scene.hidden = showTable;
    strip.hidden = showTable;
    line.hidden = true;
    banner.textContent = step.banner;
    skipButton.hidden = true;
    markStrip(duel.reveal.length);
    backButton.focus();
  }

  function show(index) {
    clearTimeout(timer);
    const step = steps[index];
    speech.textContent = step.speech;
    if (step.kind === 'result') return drawResult(step);
    drawRound(step);
    timer = setTimeout(() => show(index + 1), STEP_MS);
  }

  function leave() {
    clearTimeout(timer);
    element.hidden = true;
    onLeave?.();
  }

  function play(finishedDuel) {
    clearTimeout(timer);
    duel = finishedDuel;
    steps = revealSteps(duel, { reducedMotion: reducedMotion() });
    const otherName = otherCaptainName(duel) ?? 'The other captain';
    heading.textContent = `Reveal: you against ${otherName}`;
    left.name.textContent = 'You';
    right.name.textContent = otherName;
    left.shutter.replaceChildren();
    right.shutter.replaceChildren();
    left.signalName.textContent = '';
    right.signalName.textContent = '';
    strip.replaceChildren(...duel.reveal.map(() => node('li')));
    markStrip(0);
    score.textContent = '0 : 0';
    line.textContent = '';
    banner.textContent = '';
    for (const part of [scene, strip, line]) part.hidden = false;
    tableBox.hidden = true;
    skipButton.hidden = false;
    element.hidden = false;
    show(0);
    if (steps[0].kind === 'round') skipButton.focus();
  }

  return {
    element, play, leave,
    get active() { return !element.hidden; },
    dispose() {
      clearTimeout(timer);
      element.remove();
    },
  };
}
