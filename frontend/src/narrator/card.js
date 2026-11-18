// The narrator's caption card: bottom centre, above the HUD prompts, with a Skip button (×).
// The text is always plain text. Small and token-based CSS (narrator.css), so the art lane can restyle it.
import './narrator.css';

// The E prompt floating over a building (.interact.floating) moves with the world, so the card does not dodge it
// (the overlap audit: dodging it pushed the card into the wave bar).
const INSPECTION = '.pirate-hud:not([hidden]):has(.pirate-defense-inspector:not([hidden]))';
const TOUCH_ACTIONS = '.touch-controls:not([hidden]) .touch-actions button:not([hidden])';
const CONTROLS = `.bottom-bar,.interact:not([hidden]):not(.floating),.pirate-musket:not([hidden]),${TOUCH_ACTIONS}`;
const WAVE_BAR = '.pirate-hud:not([hidden]) .pirate-bar:not([hidden])';
const WARNING = `${WAVE_BAR} .pirate-danger:not([hidden])`;
const WAVE_BREAK = '.pirate-hud:not([hidden]) .pirate-break:not([hidden])';
const ACTIVE_COMBAT = '.pirate-hud:not([hidden]):has(.pirate-bar:not([hidden])):not(:has(.pirate-countdown:not([hidden]),.pirate-break:not([hidden])))';
const DOCK_CONTROLS = [CONTROLS, '.touch-stick-group',
  '.pirate-bar', '.pirate-prompt', '.pirate-point-prompt', '.pirate-boss'].join(',');

export function createNarratorCard(container = document.body, {onSkip = () => {}, large = () => false} = {}) {
  const card = document.createElement('div');
  card.className = 'narrator-card';
  card.hidden = true;
  const reader = document.createElement('div');
  reader.className = 'narrator-reader';
  const history = document.createElement('div');
  history.className = 'narrator-history';
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
  skip.addEventListener('click', event => { event.stopPropagation(); if (retained) hide(); else onSkip(); });
  reader.append(history, text);
  card.append(reader, skip);
  let reading = false, retained = false, savedScroll = 0, focusOwner = null;
  card.addEventListener('focusin', event => {
    if (event.relatedTarget instanceof HTMLElement && !card.contains(event.relatedTarget)) focusOwner = event.relatedTarget;
  });
  function restoreFocus() {
    const usable = node => node?.isConnected && !node.closest('[hidden],[inert]') && node.getClientRects().length > 0;
    const target = usable(focusOwner) ? focusOwner : container.querySelector('canvas[tabindex="0"]');
    if (usable(target)) target.focus({preventScroll: true});
    focusOwner = null;
  }
  const beginReading = () => {
    if (card.classList.contains('is-large-touch-reader') && reader.scrollHeight > reader.clientHeight + 1) reading = true;
  };
  for (const event of ['pointerdown', 'wheel', 'focus']) reader.addEventListener(event, beginReading);
  reader.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  const markUnread = () => card.classList.toggle('has-unread-subtitles', reader.scrollTop + reader.clientHeight + 2 < reader.scrollHeight);
  reader.addEventListener('scroll', () => {
    if (reader.clientHeight) savedScroll = reader.scrollTop;
    markUnread();
  });
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
    const protectedHud = `${WARNING},${INSPECTION} .pirate-defense-inspector,${INSPECTION} > .pirate-prompt:not([hidden])`;
    const suppressed = [...container.querySelectorAll(protectedHud)].some(warning => {
      const bounds = warning.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && own.left < bounds.right && own.right > bounds.left
        && own.top < bounds.bottom && own.bottom > bounds.top;
    });
    // Measure the final dock or fallback position. Even large captions yield to an acute instruction.
    const focused = card.classList.contains('is-large-touch-reader') && card.contains(document.activeElement);
    card.classList.toggle('is-danger-suppressed', suppressed);
    card.inert = suppressed;
    if (suppressed) card.setAttribute('aria-hidden', 'true'); else card.removeAttribute('aria-hidden');
    if (suppressed && focused) restoreFocus();
    return suppressed;
  }

  function dockBesideControls() {
    const stick = container.querySelector('.touch-stick-group')?.getBoundingClientRect();
    const left = stick?.width > 0 ? Math.ceil(stick.right) + 8 : 12;
    card.style.setProperty('--narrator-dock-left', `${left}px`);
    card.style.removeProperty('bottom');
    const own = card.getBoundingClientRect();
    const obstacles = [...container.querySelectorAll(DOCK_CONTROLS)].map(node => node.getBoundingClientRect())
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
    const touchAction = container.querySelector(TOUCH_ACTIONS);
    const style = getComputedStyle(card);
    const enlarged = card.classList.contains('is-large');
    const wasReader = card.classList.contains('is-large-touch-reader');
    const largeReader = enlarged && style.getPropertyValue('--narrator-reader-enabled').trim() === '1'
      && dockLargeReader(touchAction);
    const focused = wasReader && card.contains(document.activeElement);
    const wasDormant = card.classList.contains('is-reader-dormant');
    const dormant = retained && !largeReader;
    card.classList.toggle('is-large-touch-reader', !!largeReader);
    card.classList.toggle('is-reader-dormant', dormant);
    if (largeReader) {
      reader.tabIndex = 0;
      reader.setAttribute('role', 'region');
      reader.setAttribute('aria-label', 'Narrator subtitles');
      if (wasDormant || (!wasReader && reading)) reader.scrollTop = savedScroll;
      markUnread();
    } else {
      reader.removeAttribute('tabindex');
      reader.removeAttribute('role');
      reader.removeAttribute('aria-label');
      if (dormant) {
        card.inert = true;
        card.setAttribute('aria-hidden', 'true');
        if (focused) restoreFocus();
        document.documentElement.style.setProperty('--narrator-card-height', '0px');
        document.documentElement.style.removeProperty('--narrator-sound-bottom');
        document.documentElement.style.removeProperty('--narrator-sound-left');
        return;
      }
      card.classList.remove('has-unread-subtitles');
    }
    const dock = !enlarged && !!(combatHud || touchAction)
      && style.getPropertyValue('--narrator-dock-enabled').trim() === '1';
    const waveBreak = dock && !!touchAction && !!container.querySelector(WAVE_BREAK);
    // The wave event details can resize the bar without changing any control's hidden flag.
    watchWaveBar(container.querySelector(WAVE_BAR));
    card.classList.toggle('is-combat-docked', dock);
    card.classList.remove('is-combat-fallback');
    const footer = waveBreak && style.getPropertyValue('--narrator-footer-enabled').trim() === '1' && fitFooter(touchAction);
    card.classList.toggle('is-wave-footer', footer);
    const placed = largeReader || footer || (dock && dockBesideControls());
    card.classList.toggle('is-wave-touch-docked', waveBreak && placed);
    if (!footer && !largeReader) document.documentElement.style.removeProperty('--narrator-sound-bottom');
    if (!largeReader) document.documentElement.style.removeProperty('--narrator-sound-left');
    if (!placed) {
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

  function dockLargeReader(action) {
    const stick = container.querySelector('.touch-stick-group')?.getBoundingClientRect();
    if (!stick?.height) return false;
    const target = action?.getBoundingClientRect();
    card.classList.add('is-large-touch-reader');
    card.style.removeProperty('bottom');
    const inset = Number.parseFloat(getComputedStyle(card).bottom);
    const obstacles = [...container.querySelectorAll(DOCK_CONTROLS)].map(node => node.getBoundingClientRect());
    const reserved = Math.max(stick.bottom, ...obstacles.filter(box => box.width > 0 && box.height > 0).map(box => box.bottom));
    const height = Math.floor(innerHeight - reserved - inset - 4);
    if (height < 54) return false;
    card.style.setProperty('--narrator-reader-height', `${height}px`);
    const leading = Number.parseFloat(getComputedStyle(text).lineHeight);
    card.style.setProperty('--narrator-reader-lines', `${Math.floor((height - 12) / leading) * leading}px`);
    document.documentElement.style.setProperty('--narrator-sound-bottom', `${innerHeight - (target?.top ?? stick.bottom) + 4}px`);
    document.documentElement.style.setProperty('--narrator-sound-left', `${Math.ceil(stick.right) + 8}px`);
    return true;
  }

  // The shortest portrait screens can use the footer without crossing the wave result or the touch controls.
  function fitFooter(action) {
    card.classList.add('is-wave-footer');
    card.style.removeProperty('bottom');
    const bounds = action.getBoundingClientRect();
    const stick = container.querySelector('.touch-stick-group')?.getBoundingClientRect();
    const fits = card.getBoundingClientRect().top >= Math.max(bounds.bottom, stick?.bottom ?? 0) + 3;
    if (fits) document.documentElement.style.setProperty('--narrator-sound-bottom', `${innerHeight - bounds.top + 4}px`);
    return fits;
  }
  addEventListener('resize', position);
  // A control that appears or goes while the card shows (the Musket button at the start of a wave) moves it too
  // (playtest 16 Nov: the card covered the Musket button). Only the hidden attribute is watched.
  // The HUD sets some hidden flags every frame to the same value: only a real show or hide measures again.
  const flipped = record => (record.oldValue === null) === record.target.hasAttribute('hidden');
  const controlsChange = typeof MutationObserver === 'function' ? new MutationObserver(records => { if (records.some(flipped)) position(); }) : null;
  const watch = on => { controlsChange?.disconnect(); if (on) controlsChange?.observe(container, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden']}); };
  function hide({keepReading = false} = {}) {
    if (keepReading && reading && card.classList.contains('is-large') && !card.hidden) {
      retained = true;
      skip.setAttribute('aria-label', 'Close narrator subtitles');
      skip.title = 'Close';
      position();
      return;
    }
    const focused = card.classList.contains('is-large-touch-reader') && card.contains(document.activeElement);
    watch(false);
    barSize?.disconnect();
    observedBar = null;
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
    card.hidden = true;
    card.classList.remove('is-danger-suppressed', 'is-reader-dormant', 'is-large-touch-reader');
    card.inert = false; card.removeAttribute('aria-hidden');
    delete card.dataset.line;
    reading = retained = false;
    savedScroll = 0;
    reader.scrollTop = 0;
    history.replaceChildren();
    text.textContent = '';
    document.documentElement.style.removeProperty('--narrator-card-height');
    document.documentElement.style.removeProperty('--narrator-sound-bottom');
    document.documentElement.style.removeProperty('--narrator-sound-left');
    if (focused) restoreFocus();
    else focusOwner = null;
  }
  return {
    element: card,
    show(line) {
      if (!card.isConnected) container.append(card);
      const enlarged = !!large();
      let scrollTop = 0;
      if (reading && text.textContent && enlarged) {
        scrollTop = savedScroll;
        const previous = document.createElement('p');
        previous.className = 'narrator-text';
        previous.textContent = text.textContent;
        history.append(previous);
        if (history.children.length > 4) {
          const oldest = history.firstElementChild;
          const height = oldest.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(oldest).marginBottom);
          oldest.remove();
          scrollTop = Math.max(0, scrollTop - height);
        }
      } else {
        history.replaceChildren();
      }
      retained = false;
      skip.setAttribute('aria-label', 'Skip the narrator');
      skip.title = 'Skip';
      card.classList.toggle('is-large', enlarged);
      card.dataset.line = line.id;
      card.hidden = false;
      text.textContent = line.text;
      barSize?.observe(card);
      position();
      reader.scrollTop = scrollTop;
      watch(true);
    },
    hide,
    get visible() { return !card.hidden; },
    dispose() { removeEventListener('resize', position); this.hide(); card.remove(); },
  };
}
