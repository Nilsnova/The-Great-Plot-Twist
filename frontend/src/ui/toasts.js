// One toast style for the whole game: top-center, hides itself, at most two at once (the oldest goes).
// Any lane can use it:
//   import {showToast, showError} from '../ui/toasts.js';
//   showToast('Cannon built.');                       // info
//   showToast({text: 'Wave survived!', tone: 'success'});
//   showError(reply);                                 // reply from src/online/api.js: its message + a next step
// Errors always say what happened (the server's plain message) and what to do next.
import {node} from './kit/dom.js';
import './toasts.css';

export const TOAST_LIMIT = 2;
export const TOAST_MS = 3600;
export const ERROR_MS = 6000;

// Pure stacking rule: a repeat of a shown text replaces it; beyond the limit the oldest leaves.
export function stackToasts(stack, toast, limit = TOAST_LIMIT) {
  return [...stack.filter(item => item.text !== toast.text), toast].slice(-limit);
}

const NEXT_STEP = /\b(try again|wait|sign in|reload|check|tap|press|open|choose|walk)\b/i;
// The next step for a failed call, chosen by its status or code. null when the message already says it.
export function nextStep({status, code} = {}, message = '') {
  if (NEXT_STEP.test(message)) return null;
  if (status === 401 || ['unauthorized', 'session_expired', 'sign_in_required'].includes(code)) return 'Sign in again from Menu › Settings.';
  if (status === 429 || ['too_many_requests', 'rate_limited', 'too_many_tries'].includes(code)) return 'Wait a few seconds, then try again.';
  if (code === 'no_coins') return 'Earn 🪙 at the Harbor, then try again.';
  if (status === 0 || status === 503 || ['network_error', 'timeout', 'unavailable', 'offline', 'not_connected'].includes(code)) return 'Check your connection, then try again.';
  return 'Try again in a moment.';
}
// A failed reply ({ok:false,status,code,message}) or a plain message -> one error toast.
export function errorToast(reply, fallback = 'That did not work.') {
  const message = typeof reply === 'string' ? reply : typeof reply?.message === 'string' && reply.message.trim() ? reply.message.trim() : fallback;
  return {text: message, next: nextStep(typeof reply === 'object' && reply ? reply : {}, message), tone: 'error'};
}

// With a card open, the toasts go just under its header and inside its sides (toasts.css), off its title and ×.
// Answers the card (or null).
function placeOverCard(element) {
  let card = null;
  try { card = typeof document === 'undefined' ? null : document.querySelector('dialog[open]:modal'); } catch { /* no :modal (test DOMs) */ }
  const head = card?.querySelector(':scope > .kit-modal-header')?.getBoundingClientRect(), box = card?.getBoundingClientRect();
  if (!head || !box || typeof innerWidth !== 'number') { for (const name of ['--toast-card-top', '--toast-card-left', '--toast-card-right']) element.style.removeProperty(name); return null; }
  element.style.setProperty('--toast-card-top', `${Math.round(head.bottom) + 8}px`);
  element.style.setProperty('--toast-card-left', `${Math.max(12, Math.round(box.left) + 12)}px`);
  element.style.setProperty('--toast-card-right', `${Math.max(12, Math.round(innerWidth - box.right) + 12)}px`);
  return card;
}
// While toasts show: a card that opens, closes, changes size or moves with the window (it is centred) moves them too.
// Only the dialogs' open attribute and the open card's size are watched.
function watchCards(element) {
  if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return null;
  let watched = null;
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeOverCard(element)) : null;
  const place = () => { const card = placeOverCard(element); if (card !== watched) { sizes?.disconnect(); watched = card; if (card) sizes?.observe(card); } };
  const opens = new MutationObserver(place);
  opens.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']});
  globalThis.addEventListener?.('resize', place); // a centred card moves with the window
  place();
  return {disconnect() { opens.disconnect(); sizes?.disconnect(); globalThis.removeEventListener?.('resize', place); }};
}

export function createToasts({parent = document.body, limit = TOAST_LIMIT} = {}) {
  const element = node('div', 'u-toasts');element.setAttribute('role', 'status');element.setAttribute('aria-live', 'polite');
  if (typeof element.showPopover === 'function') element.popover = 'manual';
  let stack = [], next = 0, watching = null;
  function render() {
    // Keep the toasts already shown in place (re-inserting them would restart their slide-in).
    const nodes = stack.map(item => {
      if (item.node) return item.node;
      const box = item.node = node('div', 'u-toast');box.dataset.tone = item.tone;
      box.append(node('span', 'u-toast-icon', item.tone === 'error' ? '!' : item.tone === 'success' ? '✓' : '✦'));
      const copy = node('p', 'u-toast-text', item.text);
      if (item.next) copy.append(node('span', 'u-toast-next', item.next));
      box.append(copy);
      return box;
    });
    for (const child of [...element.children]) if (!nodes.includes(child)) child.remove();
    nodes.forEach((box, index) => { if (element.children[index] !== box) element.insertBefore(box, element.children[index] ?? null); });
    element.hidden = stack.length === 0;
    placeOverCard(element);
    if (stack.length && !watching) watching = watchCards(element);
    else if (!stack.length && watching) { watching.disconnect(); watching = null; }
    // In the top layer (popover) a toast stays readable above an open panel's backdrop.
    if (!element.isConnected || typeof element.showPopover !== 'function') return;
    try { if (element.matches(':popover-open')) element.hidePopover(); if (stack.length) element.showPopover(); } catch { /* plain fixed toast */ }
  }
  function remove(id) { const before = stack.length; stack = stack.filter(item => item.id !== id); if (stack.length !== before) render(); }
  function show(input) {
    const data = typeof input === 'string' ? {text: input} : input ?? {};
    const text = String(data.text ?? '').trim();
    if (!text) return null;
    const tone = ['error', 'success'].includes(data.tone) ? data.tone : 'info';
    const toast = {id: ++next, text, next: data.next ? String(data.next) : null, tone};
    for (const item of stack) if (item.text === text) clearTimeout(item.timer);
    const kept = stackToasts(stack, toast, limit);
    for (const item of stack) if (!kept.includes(item)) clearTimeout(item.timer);
    toast.timer = setTimeout(() => remove(toast.id), Number(data.ms) > 0 ? Number(data.ms) : tone === 'error' ? ERROR_MS : TOAST_MS);
    stack = kept;
    if (!element.isConnected) (typeof parent === 'function' ? parent() : parent).append(element);
    render();
    return toast.id;
  }
  render();
  return {element, show, error: (reply, fallback) => show(errorToast(reply, fallback)),
    hide(id) { const item = stack.find(entry => entry.id === id); if (item) clearTimeout(item.timer); remove(id); },
    clear() { for (const item of stack) clearTimeout(item.timer); stack = []; render(); },
    get shown() { return stack.map(({id, text, next: step, tone}) => ({id, text, next: step, tone})); },
    dispose() { for (const item of stack) clearTimeout(item.timer); stack = []; watching?.disconnect(); watching = null; element.remove(); }};
}

// The game's one queue, created on first use inside #game (or the page body).
let shared = null;
export function toasts() {
  shared ??= createToasts({parent: () => document.querySelector('#game') ?? document.body});
  return shared;
}
export const showToast = input => toasts().show(input);
export const showError = (reply, fallback) => toasts().error(reply, fallback);
