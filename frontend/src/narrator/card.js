// The narrator's caption card: bottom centre, above the HUD prompts, with a Skip button (×).
// The text is always plain text. Small and token-based CSS (narrator.css), so the art lane can restyle it.
import './narrator.css';

// The E prompt floating over a building (.interact.floating) moves with the world, so the card does not dodge it
// (the overlap audit: dodging it pushed the card into the wave bar).
const INSPECTION = '.pirate-hud:not([hidden]):has(.pirate-defense-inspector:not([hidden]))';
const CONTROLS = '.bottom-bar,.interact:not([hidden]):not(.floating),.pirate-musket:not([hidden])';
const WARNING = '.pirate-hud:not([hidden]) .pirate-bar:not([hidden]) .pirate-danger:not([hidden])';

export function createNarratorCard(container = document.body, {onSkip = () => {}, large = () => false} = {}) {
  const card = document.createElement('div');
  card.className = 'narrator-card';
  card.hidden = true;
  const text = document.createElement('p');
  text.className = 'narrator-text';
  text.setAttribute('role', 'status');
  text.setAttribute('aria-live', 'polite');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'narrator-skip';
  skip.textContent = '×';
  skip.setAttribute('aria-label', 'Skip the narrator');
  skip.title = 'Skip';
  skip.addEventListener('click', event => { event.stopPropagation(); onSkip(); });
  card.append(text, skip);
  let warningBar = null, warningFrame = null;
  const warningSize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (warningFrame !== null) return;
    warningFrame = requestAnimationFrame(() => { warningFrame = null; position(); });
  }) : null;

  function protectWarning() {
    const bar = container.querySelector('.pirate-hud:not([hidden]) .pirate-bar:not([hidden])');
    if (bar !== warningBar) {
      if (warningBar) warningSize?.unobserve(warningBar);
      warningBar = bar;
      if (bar) warningSize?.observe(bar);
    }
    const own = card.getBoundingClientRect();
    const protectedHud = `${WARNING},${INSPECTION} .pirate-defense-inspector,${INSPECTION} > .pirate-prompt:not([hidden])`;
    const suppressed = [...container.querySelectorAll(protectedHud)].some(warning => {
      const bounds = warning.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && own.left < bounds.right && own.right > bounds.left
        && own.top < bounds.bottom && own.bottom > bounds.top;
    });
    // Even large captions yield to an acute instruction. Keep the current line and Skip unchanged.
    card.classList.toggle('is-danger-suppressed', suppressed);
    card.inert = suppressed;
    if (suppressed) card.setAttribute('aria-hidden', 'true'); else card.removeAttribute('aria-hidden');
    return suppressed;
  }

  // Sit above the bottom bar and any prompt; the sound captions move up while the card shows.
  function position() {
    if (card.hidden) return;
    const own = card.getBoundingClientRect();
    // Only controls under the card count (on a phone the musket button sits below it).
    const controls = [...container.querySelectorAll(CONTROLS)].map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.left < own.right && rect.right > own.left);
    const top = Math.min(innerHeight, ...controls.map(rect => rect.top));
    card.style.bottom = `${Math.max(16, innerHeight - top + 12)}px`;
    const suppressed = protectWarning();
    document.documentElement.style.setProperty('--narrator-card-height', `${suppressed ? 0 : Math.round(card.getBoundingClientRect().height)}px`);
  }
  addEventListener('resize', position);
  // A control that appears or goes while the card shows (the Musket button at the start of a wave) moves it too
  // (playtest 16 Nov: the card covered the Musket button). Only the hidden attribute is watched.
  // The HUD sets some hidden flags every frame to the same value: only a real show or hide measures again.
  const flipped = record => (record.oldValue === null) === record.target.hasAttribute('hidden');
  const controlsChange = typeof MutationObserver === 'function' ? new MutationObserver(records => { if (records.some(flipped)) position(); }) : null;
  const watch = on => { controlsChange?.disconnect(); if (on) controlsChange?.observe(container, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden']}); };
  return {
    element: card,
    show(line) {
      if (!card.isConnected) container.append(card);
      card.classList.toggle('is-large', !!large());
      card.dataset.line = line.id;
      card.hidden = false;
      text.textContent = line.text;
      warningSize?.observe(card);
      position(); watch(true);
    },
    hide() {
      watch(false);
      warningSize?.disconnect(); warningBar = null;
      if (warningFrame !== null) cancelAnimationFrame(warningFrame);
      warningFrame = null;
      card.hidden = true;
      card.classList.remove('is-danger-suppressed'); card.inert = false; card.removeAttribute('aria-hidden');
      delete card.dataset.line;
      text.textContent = '';
      document.documentElement.style.removeProperty('--narrator-card-height');
    },
    get visible() { return !card.hidden; },
    dispose() { removeEventListener('resize', position); this.hide(); card.remove(); },
  };
}
