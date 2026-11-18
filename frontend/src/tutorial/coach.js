// The guided start's overlay (T52): a small caption panel at the top of the screen (the step, its caption, the
// key to press, Skip step and Skip tutorial) and one highlight on the target: a ring around it on screen, or an
// arrow at the screen's edge pointing to it while it is off screen. It never takes the keyboard from the game:
// the panel is a labelled region whose buttons can be reached with Tab, the caption is a polite live region,
// and after a pointer click on a button the keyboard goes back to the game (focusGame).
// Reduced motion: no pulse. All words come from GUIDE_STEPS (src/ui/first-quests.js).
import './coach.css';
import {node, uniqueId} from '../ui/kit/dom.js';

const EDGE = 28;

// parent: where the panel goes (the HUD's right column, under the goals); without one it floats at the top.
export function createCoach(container = document.body, {parent = null, onSkipStep = () => {}, onSkipAll = () => {}, focusGame = () => {}} = {}) {
  const panel = node('section', 'coach-panel'), heading = node('h2', 'coach-title'), eyebrow = node('span', 'coach-step');
  const caption = node('p', 'coach-caption'), keys = node('kbd', 'coach-key'), actions = node('div', 'coach-actions');
  const scrollHint = node('span', 'coach-scroll-hint', 'Scroll instructions');
  scrollHint.hidden = true;
  scrollHint.setAttribute('aria-hidden', 'true');
  heading.id = uniqueId('coach');
  panel.id = uniqueId('coach-panel');
  panel.setAttribute('aria-labelledby', heading.id);
  const guide = node('button', 'coach-disclosure', 'Guide');
  guide.classList.add('coach-button');
  guide.type = 'button';
  guide.hidden = true;
  guide.setAttribute('aria-controls', panel.id);
  guide.setAttribute('aria-expanded', 'false');
  caption.setAttribute('role', 'status');caption.setAttribute('aria-live', 'polite');
  keys.hidden = true;
  const button = (label, run, quiet) => {
    const element = node('button', `coach-button${quiet ? ' is-quiet' : ''}`, label);element.type = 'button';
    element.addEventListener('click', event => { event.stopPropagation(); run(); if (event.detail > 0) focusGame(); });
    return element;
  };
  const skipStep = button('Skip step', () => onSkipStep()), skipAll = button('Skip tutorial', () => onSkipAll(), true);
  actions.append(skipStep, skipAll);
  const top = node('div', 'coach-top');top.append(eyebrow, keys);
  panel.append(top, heading, caption, scrollHint, actions);
  panel.hidden = true;
  const ring = node('div', 'coach-ring'), arrow = node('div', 'coach-arrow'), label = node('span', 'coach-ring-label');
  ring.setAttribute('aria-hidden', 'true');arrow.setAttribute('aria-hidden', 'true');ring.append(label);
  ring.hidden = true;arrow.hidden = true;
  if (!parent) panel.classList.add('is-floating');
  (parent ?? container).append(guide, panel);container.append(ring, arrow);
  let shown = '', inCombat = false, open = false, layoutFrame = null;
  const coarse = matchMedia('(pointer:coarse)');
  const watched = new Set();
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = null;
      placePanel();
    });
  }) : null;
  function stopWatching() {
    sizes?.disconnect();
    watched.clear();
    if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    layoutFrame = null;
  }
  function bounds(selector) {
    const element = container.querySelector(selector);
    if (!element) return null;
    if (!watched.has(element)) {
      watched.add(element);
      sizes?.observe(element);
    }
    const box = element.getBoundingClientRect();
    return box.width && box.height ? box : null;
  }
  function availableLane(left, right, top, bottom, blockers) {
    if (right - left < 120) return null;
    for (const box of blockers) {
      if (box.right <= left || box.left >= right || box.bottom + 8 <= top || box.top - 8 >= bottom) continue;
      if (box.top - top >= 52) { bottom = box.top - 8; break; }
      top = Math.max(top, Math.ceil(box.bottom) + 8);
    }
    return bottom - top >= 44 ? {left, right, top, bottom} : null;
  }
  function placePanel() {
    if (!shown) return;
    const portrait = coarse.matches && innerWidth <= innerHeight;
    const compact = inCombat && portrait && innerWidth <= 420;
    const preparation = !inCombat && !!parent && portrait && innerWidth <= 375 && innerHeight <= 640;
    const hadGuideFocus = document.activeElement === guide;
    const hadPanelFocus = panel.contains(document.activeElement);
    panel.classList.toggle('is-combat-guide', compact);
    panel.classList.toggle('is-preparation-guide', preparation);
    scrollHint.hidden = true;
    if (!compact) {
      guide.hidden = true;
      panel.hidden = false;
      panel.removeAttribute('tabindex');
      if (preparation) {
        bounds('.hud-coins');
        bounds('.quest-strip');
        const stick = bounds('.touch-stick-group');
        if (stick) panel.style.setProperty('--coach-preparation-height', `${Math.floor(stick.top - panel.getBoundingClientRect().top - 8)}px`);
        else panel.style.removeProperty('--coach-preparation-height');
      } else stopWatching();
      if (preparation && caption.scrollHeight > caption.clientHeight + 1) {
        caption.tabIndex = 0;
        scrollHint.hidden = false;
      } else caption.removeAttribute('tabindex');
      guide.setAttribute('aria-expanded', 'false');
      open = false;
      if (hadGuideFocus) focusGame();
      return;
    }

    caption.removeAttribute('tabindex');
    const purse = bounds('.hud-coins'), menu = bounds('.hud-menu');
    const bar = bounds('.pirate-hud:not([hidden]) .pirate-bar:not([hidden])'), weapon = bounds('.pirate-hud:not([hidden]) .pirate-musket:not([hidden])'), stick = bounds('.touch-stick-group');
    const left = 12, right = innerWidth - 12;
    const headerLeft = Math.ceil(purse?.right ?? left) + 4, headerRight = Math.floor(menu?.left ?? right) - 4;
    const width = Math.min(68, headerRight - headerLeft);
    const top = Math.ceil(bar?.bottom ?? Math.max(purse?.bottom ?? 60, menu?.bottom ?? 60)) + 8;

    // Keep the entry between the purse and Menu. When the purse needs that room, use the left rail.
    const headerFits = width >= 44;
    guide.hidden = false;
    guide.style.left = `${headerFits ? Math.floor((headerLeft + headerRight - width) / 2) : left}px`;
    guide.style.top = `${headerFits ? Math.round(menu?.top ?? 12) : top}px`;
    guide.style.width = `${headerFits ? width : 68}px`;

    const blockers = [
      bounds('.touch-context-action:not([hidden])'),
      bounds('.narrator-card:not([hidden],.is-danger-suppressed,.is-reader-dormant)'),
      bounds('.sound-caption:not([hidden],.in-dialog)'),
    ].filter(Boolean).sort((a, b) => a.top - b.top);
    const lane = availableLane(left, Math.floor(weapon?.left ?? right) - 8, top + (headerFits ? 0 : 50),
      Math.floor(stick?.top ?? innerHeight - 92) - 8, blockers)
      ?? availableLane(Math.ceil(stick?.right ?? left) + 8, right, Math.max(top, Math.ceil(weapon?.bottom ?? top) + 8),
        innerHeight - 12, blockers);
    const showPanel = open && !!lane;
    guide.setAttribute('aria-expanded', String(showPanel));
    panel.hidden = !showPanel;
    panel.tabIndex = 0;
    if (showPanel) {
      panel.style.setProperty('--coach-panel-left', `${lane.left}px`);
      panel.style.setProperty('--coach-panel-top', `${lane.top}px`);
      panel.style.setProperty('--coach-panel-width', `${lane.right - lane.left}px`);
      panel.style.setProperty('--coach-panel-height', `${Math.min(240, lane.bottom - lane.top)}px`);
    } else if (hadPanelFocus) {
      guide.focus({preventScroll: true});
    }
  }
  guide.addEventListener('click', event => {
    event.stopPropagation();
    open = !open;
    placePanel();
    if (open && !panel.hidden) panel.focus({preventScroll: true});
  });
  panel.addEventListener('keydown', event => {
    if ((panel.classList.contains('is-combat-guide') || event.target === caption)
      && event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
  });
  addEventListener('resize', placePanel);

  // view: {step: "Step 2 of 7", title, caption, keys?, skip: true}
  function show(view) {
    const key = JSON.stringify(view);
    if (key === shown) return;
    shown = key;
    inCombat = view.inCombat === true;
    eyebrow.textContent = view.step ?? '';heading.textContent = view.title ?? '';
    if (caption.textContent !== view.caption) caption.textContent = view.caption ?? '';
    keys.hidden = !view.keys;keys.textContent = view.keys ?? '';
    actions.hidden = view.skip === false;
    placePanel();
  }
  function hide() {
    const restore = panel.contains(document.activeElement) || document.activeElement === guide;
    shown = ''; open = false;
    panel.hidden = true; guide.hidden = true;
    stopWatching();
    point(null);
    if (restore) focusGame();
  }
  // where: {x, y, size, inside} in client pixels (src/tutorial/game-hooks.js), or null for no highlight.
  function point(where, {text = ''} = {}) {
    if (!where || !Number.isFinite(where.x) || !Number.isFinite(where.y)) { ring.hidden = true; arrow.hidden = true; return; }
    const width = globalThis.innerWidth || 1, height = globalThis.innerHeight || 1;
    if (where.inside !== false) {
      const size = Math.max(44, Math.min(160, where.size ?? 72));
      ring.hidden = false;arrow.hidden = true;
      ring.style.left = `${where.x}px`;ring.style.top = `${where.y}px`;ring.style.setProperty('--coach-size', `${size}px`);
      label.textContent = text;label.hidden = !text;
      return;
    }
    // Off screen: an arrow on the edge, on the line from the screen's middle to the target.
    const cx = width / 2, cy = height / 2, dx = where.x - cx, dy = where.y - cy;
    const scale = Math.min((cx - EDGE) / Math.max(1e-6, Math.abs(dx)), (cy - EDGE) / Math.max(1e-6, Math.abs(dy)));
    ring.hidden = true;arrow.hidden = false;
    arrow.style.left = `${cx + dx * scale}px`;arrow.style.top = `${cy + dy * scale}px`;
    arrow.style.setProperty('--coach-turn', `${Math.atan2(dy, dx)}rad`);
  }
  return {element: panel, show, hide, point,
    get visible() { return !panel.hidden || !guide.hidden; },
    get ring() { return ring; }, get arrow() { return arrow; },
    dispose() { removeEventListener('resize', placePanel); stopWatching(); guide.remove(); panel.remove(); ring.remove(); arrow.remove(); }};
}
