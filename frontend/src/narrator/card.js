// The narrator's caption card: bottom centre, above the HUD prompts, with a Skip button (×).
// The text is always plain text. Small and token-based CSS (narrator.css), so the art lane can restyle it.
import './narrator.css';

const CONTROLS = '.bottom-bar,.interact:not([hidden]),.pirate-musket:not([hidden])';

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

  // Sit above the bottom bar and any prompt; the sound captions move up while the card shows.
  function position() {
    if (card.hidden) return;
    const own = card.getBoundingClientRect();
    // Only controls under the card count (on a phone the musket button sits below it).
    const controls = [...container.querySelectorAll(CONTROLS)].map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.left < own.right && rect.right > own.left);
    const top = Math.min(innerHeight, ...controls.map(rect => rect.top));
    card.style.bottom = `${Math.max(16, innerHeight - top + 12)}px`;
    document.documentElement.style.setProperty('--narrator-card-height', `${Math.round(card.getBoundingClientRect().height)}px`);
  }
  addEventListener('resize', position);
  return {
    element: card,
    show(line) {
      if (!card.isConnected) container.append(card);
      card.classList.toggle('is-large', !!large());
      card.dataset.line = line.id;
      card.hidden = false;
      text.textContent = line.text;
      position();
    },
    hide() {
      card.hidden = true;
      delete card.dataset.line;
      text.textContent = '';
      document.documentElement.style.removeProperty('--narrator-card-height');
    },
    get visible() { return !card.hidden; },
    dispose() { removeEventListener('resize', position); this.hide(); card.remove(); },
  };
}
