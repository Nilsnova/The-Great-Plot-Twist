// The paged "How to play" card in the shared kit panel: Back / Next, page dots, arrow keys, Escape
// and a swipe on phones. mode 'menu' (Menu › How to play) closes with Close or Done; mode 'first'
// (after the intro on a first Play) has Skip and ends with Start playing. All words: ./pages.js.
import './tutorial.css';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import {node, uniqueId} from '../ui/kit/dom.js';
import {TUTORIAL_PAGES, TUTORIAL_TITLE, pageView} from './pages.js';
import {framesFor, hasCartoon} from '../art/registry.js';
import {paint} from '../art/paint.js';

const SWIPE_PX = 50;
const spriteUrl = file => `${import.meta.env.BASE_URL}pixel/${file}`;
// The clean cartoon drawing of a sprite (GAME-V3.md §7, src/art/) when one exists: a canvas in the sprite's
// box, painted at the screen's density once the drawing is loaded; else null (the pixel PNG stays).
const canPaint = () => typeof document !== 'undefined' && !/jsdom/i.test(globalThis.navigator?.userAgent ?? '');
function cartoonSprite(sprite) {
  const name = sprite.file.replace(/\.png$/, '');
  if (!canPaint() || !hasCartoon(name)) return null;
  const w = sprite.w * sprite.scale, h = sprite.h * sprite.scale, ratio = Math.min(3, globalThis.devicePixelRatio || 1);
  const element = node('canvas', 'tutorial-sprite'); element.classList.add('is-cartoon');
  element.width = Math.ceil(w * ratio); element.height = Math.ceil(h * ratio); element.dataset.art = name;
  element.style.setProperty('--w', String(w)); element.style.setProperty('--h', String(h)); element.setAttribute('aria-hidden', 'true');
  void framesFor([name]).then(frames => {
    const frame = frames[name], context = element.getContext('2d');
    if (!frame || !context) return;
    // Fit the drawing's own box into the sprite's box, feet on the bottom edge.
    const fit = Math.min(w / frame[0], h / frame[1]), density = fit * ratio;
    const image = paint(frame[3], [frame[0], frame[1]], density, {outline: frame[4]?.outline ?? .9});
    context.drawImage(image, Math.round((element.width - image.width) / 2), element.height - image.height);
  }).catch(() => {});
  return element;
}

// done resolves once: 'finished' (the last page's button), 'skipped' (Skip, or Escape in mode
// 'first'), 'closed' (Close, Escape or the close button in mode 'menu') or 'disposed'.
export function createTutorialCard({pages = TUTORIAL_PAGES, mode = 'menu', start = 0} = {}) {
  let index = 0, settled = false, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const body = node('div', 'tutorial-body'), sheet = node('section', 'tutorial-page');
  const art = node('div', 'tutorial-art'), heading = node('h3', 'tutorial-title'), text = node('p', 'tutorial-text');
  const keys = node('dl', 'tutorial-keys');
  art.setAttribute('role', 'img');heading.id = uniqueId('tutorial');sheet.setAttribute('aria-labelledby', heading.id);
  sheet.append(art, heading, text, keys);
  const dots = node('div', 'tutorial-dots'), status = node('p', 'kit-sr-only');
  dots.setAttribute('aria-hidden', 'true');status.setAttribute('role', 'status');
  for (let i = 0; i < pages.length; i++) dots.append(node('span', 'tutorial-dot'));
  const leave = createButton({label: 'Close', variant: 'quiet', onClick: () => finish(mode === 'first' ? 'skipped' : 'closed')});
  const back = createButton({label: 'Back', variant: 'quiet', onClick: () => go(index - 1)});
  const next = createButton({label: 'Next', onClick: () => (view().last ? finish('finished') : go(index + 1))});
  leave.element.classList.add('tutorial-leave');back.element.classList.add('tutorial-back');next.element.classList.add('tutorial-next');
  const nav = node('div', 'tutorial-nav');nav.append(leave.element, back.element, next.element);
  body.append(sheet, dots, status, nav);
  const modal = createModal({title: TUTORIAL_TITLE, body, onCancel: () => finish(mode === 'first' ? 'skipped' : 'closed')});
  modal.element.classList.add('tutorial-card');modal.element.dataset.mode = mode;

  const view = () => pageView(pages, index, mode);
  function draw() {
    const current = view(), {page} = current;
    art.replaceChildren(...page.art.map(sprite => {
      const cartoon = cartoonSprite(sprite);
      if (cartoon) return cartoon;
      const image = node('img', 'tutorial-sprite'); image.classList.add('is-pixel');
      image.src = spriteUrl(sprite.file);image.alt = '';image.decoding = 'async';image.draggable = false;
      image.width = sprite.w * sprite.scale;image.height = sprite.h * sprite.scale;
      image.style.setProperty('--w', String(sprite.w * sprite.scale));image.style.setProperty('--h', String(sprite.h * sprite.scale));
      return image;
    }));
    art.setAttribute('aria-label', page.alt);
    heading.textContent = page.title;text.textContent = page.text.join(' ');
    keys.replaceChildren();keys.hidden = !page.keys;
    for (const [key, what] of page.keys ?? []) { const row = node('div', 'tutorial-key'); row.append(node('dt', '', key), node('dd', '', what)); keys.append(row); }
    [...dots.children].forEach((dot, i) => dot.classList.toggle('is-current', i === current.index));
    status.textContent = `${current.status}: ${page.title}`;
    modal.element.dataset.page = page.id;
    leave.update({label: current.leave});back.update({disabled: current.first});next.update({label: current.next});
  }
  function go(target) {
    const before = index;index = pageView(pages, target, mode).index;
    if (index === before) return;
    const backFocused = document.activeElement === back.element;
    draw();
    if (backFocused && back.element.disabled) next.element.focus({preventScroll: true});
  }
  function finish(reason) {
    if (settled) return;
    settled = true;modal.close(reason);resolveDone(reason);
  }
  // Arrow keys page through; Escape and Tab stay with the kit modal. Keys never reach the game.
  const key = event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();event.stopPropagation();
    go(index + (event.key === 'ArrowRight' ? 1 : -1));
  };
  // A horizontal swipe over the page turns it, as on a phone's photo viewer.
  let pointer = null;
  const down = event => { pointer = {id: event.pointerId, x: event.clientX, y: event.clientY}; };
  const up = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;pointer = null;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };
  modal.element.addEventListener('keydown', key);
  sheet.addEventListener('pointerdown', down);sheet.addEventListener('pointerup', up);
  sheet.addEventListener('pointercancel', () => { pointer = null; });
  modal.element.addEventListener('close', () => finish('closed'));
  index = pageView(pages, start, mode).index;
  draw();

  return {element: modal.element, done,
    get page() { return view().index; },
    get isOpen() { return modal.element.open; },
    open(parent = document.body) { modal.open(parent, next.element); },
    next() { go(index + 1); }, back() { go(index - 1); },
    close(reason = 'closed') { finish(reason); },
    dispose() {
      modal.element.removeEventListener('keydown', key);
      if (!settled) { settled = true;resolveDone('disposed'); }
      modal.dispose();
    },
  };
}
