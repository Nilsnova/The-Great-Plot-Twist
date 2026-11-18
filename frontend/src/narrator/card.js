// The narrator's caption card: bottom centre, above the HUD prompts, with a Skip button (×).
// The text is always plain text. Small and token-based CSS (narrator.css), so the art lane can restyle it.
import './narrator.css';

// The E prompt floating over a building (.interact.floating) moves with the world, so the card does not dodge it
// (the overlap audit: dodging it pushed the card into the wave bar).
const CONTROLS = '.bottom-bar,.interact:not([hidden]):not(.floating),.pirate-musket:not([hidden])';
const WAVE_BAR = '.pirate-hud:not([hidden]) .pirate-bar:not([hidden])';
const WARNING = `${WAVE_BAR} .pirate-danger:not([hidden])`;
const ACTIVE_COMBAT = '.pirate-hud:not([hidden]):has(.pirate-bar:not([hidden])):not(:has(.pirate-countdown:not([hidden]),.pirate-break:not([hidden])))';
const COMBAT_CONTROLS = [CONTROLS, '.touch-stick-group', '.touch-actions button',
  '.pirate-bar', '.pirate-prompt', '.pirate-point-prompt', '.pirate-boss'].join(',');

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
  let observedBar = null, layoutFrame = null;
  const barSize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    // Position after the HUD has published the new wave bar bottom.
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      position();
    });
  }) : null;

  function watchWaveBar(bar) {
    if (!barSize || observedBar === bar) return;
    if (observedBar) barSize.unobserve(observedBar);
    observedBar = bar;
    if (bar) barSize.observe(bar);
  }

  function protectWarning() {
    const own = card.getBoundingClientRect();
    const suppressed = [...container.querySelectorAll(WARNING)].some(warning => {
      const bounds = warning.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && own.left < bounds.right && own.right > bounds.left
        && own.top < bounds.bottom && own.bottom > bounds.top;
    });
    // Measure the final dock or fallback position. Even large captions yield to an acute instruction.
    card.classList.toggle('is-danger-suppressed', suppressed);
    card.inert = suppressed;
    if (suppressed) card.setAttribute('aria-hidden', 'true'); else card.removeAttribute('aria-hidden');
    return suppressed;
  }

  function dockInCombat() {
    const stick = container.querySelector('.touch-stick-group')?.getBoundingClientRect();
    const left = stick?.width > 0 ? Math.ceil(stick.right) + 8 : 12;
    card.style.setProperty('--narrator-dock-left', `${left}px`);
    card.style.removeProperty('bottom');
    const own = card.getBoundingClientRect();
    const obstacles = [...container.querySelectorAll(COMBAT_CONTROLS)].map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0 && rect.left < own.right && rect.right > own.left)
      .sort((a, b) => b.bottom - a.bottom);
    let bottom = own.bottom;
    // Take the lowest space with room for every line, passing above controls only when they intersect.
    for (const rect of obstacles) if (rect.top < bottom + 4 && rect.bottom > bottom - own.height - 4) bottom = rect.top - 4;
    if (bottom - own.height < 8 || own.width < skip.offsetWidth + 4) return false;
    card.style.bottom = `${innerHeight - bottom}px`;
    return true;
  }

  function position() {
    if (card.hidden) return;
    const combatHud = container.querySelector(ACTIVE_COMBAT);
    const dock = !card.classList.contains('is-large') && !!combatHud
      && getComputedStyle(card).getPropertyValue('--narrator-dock-enabled').trim() === '1';
    // The wave event details can resize the bar without changing any control's hidden flag.
    watchWaveBar(container.querySelector(WAVE_BAR));
    card.classList.toggle('is-combat-docked', dock);
    card.classList.remove('is-combat-fallback');
    if (!dock || !dockInCombat()) {
      card.classList.remove('is-combat-docked');
      card.classList.toggle('is-combat-fallback', dock);
      const own = card.getBoundingClientRect();
      const controls = [...container.querySelectorAll(CONTROLS)].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.left < own.right && rect.right > own.left);
      const top = Math.min(innerHeight, ...controls.map(rect => rect.top));
      const bottom = Math.max(16, innerHeight - top + 12);
      card.style.bottom = `${dock ? Math.min(bottom, Math.max(8, innerHeight - own.height - 8)) : bottom}px`;
    }
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
      barSize?.observe(card);
      position(); watch(true);
    },
    hide() {
      watch(false);
      barSize?.disconnect();
      observedBar = null;
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
      layoutFrame = null;
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
