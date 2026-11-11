// The projector's "Join the harbor" panel, for the host only: a QR drawn on a canvas (the CSP forbids
// data: images) for the current class code, the code in big letters (HARBOR-K7QXM), a live count of
// captains in the class harbor, how many guests joined with a code, and "New class code" with a
// confirm step. The words come from harbor.js; the host calls go through api.js (GET /api/host/demo
// and POST /api/host/demo/code). Toggle with J or the host's menu entry. The code is shown here and
// on the host console only; it is never stored by this page.
import {node} from '../ui/kit/dom.js';
import {drawQr} from '../lib/qr/index.js';
import {newActionUid} from '../screens/duels/logic.js';
import {projectorModel, newCodeBody} from './harbor.js';

// host: {read(), renew(body)} -> {ok, status, data}; null in a rehearsal without a signed-in host.
// ringBell(): the host's "Ring the Pirate Point bell" (src/pirates/pirate-point.js), when the waves are on.
export function createProjector({container, host, isHost = () => false, rehearsal = false, focus, ringBell = null}) {
  const element = node('section', 'projector'), heading = node('h2', '', 'Join the harbor');
  heading.id = 'projector-heading';element.setAttribute('aria-labelledby', heading.id);element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');element.hidden = true;
  const canvas = node('canvas');canvas.setAttribute('role', 'img');
  const side = node('div'), code = node('p', 'projector-code'), count = node('p', 'projector-count'), steps = node('ol');
  const status = node('p', 'projector-window'), error = node('p', 'projector-error'), url = node('p', 'projector-url');
  const actions = node('div', 'projector-actions');
  const renewButton = node('button', 'kit-button');renewButton.type = 'button';
  const closeButton = node('button', 'kit-button kit-quiet', 'Hide (J)');closeButton.type = 'button';
  const confirm = node('div', 'projector-confirm');confirm.hidden = true;confirm.setAttribute('role', 'group');
  const confirmText = node('p', 'projector-confirm-text');
  const confirmYes = node('button', 'kit-button', 'Yes, make a new code');confirmYes.type = 'button';
  const confirmNo = node('button', 'kit-button kit-quiet', 'Keep this code');confirmNo.type = 'button';
  confirm.setAttribute('aria-label', 'Confirm a new class code');
  confirm.append(confirmText, confirmYes, confirmNo);
  count.setAttribute('role', 'status');count.setAttribute('aria-live', 'polite');error.setAttribute('role', 'alert');
  const bellButton = node('button', 'kit-button', 'Ring the Pirate Point bell');bellButton.type = 'button';
  bellButton.hidden = typeof ringBell !== 'function';
  bellButton.addEventListener('click', async () => {
    if (bellButton.disabled) return;
    bellButton.disabled = true;
    try { await ringBell(); } catch { /* The Pirate Point toast says what went wrong. */ }
    setTimeout(() => { bellButton.disabled = false; }, 3000);
  });
  actions.append(bellButton, renewButton, closeButton);
  side.append(heading, code, count, steps, status, error, actions, confirm, url);
  element.append(canvas, side);container.append(element);
  let demo = null, captains = 1, pending = false, failure = '', uid = null, disposed = false, refreshTimer = null, drawnUrl = '';

  function draw(address) {
    canvas.hidden = !address;canvas.setAttribute('aria-label', address ? `QR code for ${address}` : 'No QR code yet');
    if (address === drawnUrl) return;
    if (!address) { drawnUrl = ''; return; }
    try { drawQr(canvas, address, {scale: 10, margin: 4, ecc: 'M'}); drawnUrl = address; } catch { failure = 'The QR code could not be drawn. Use the code instead.'; }
  }
  function render() {
    const model = projectorModel({demo, count: captains, host: isHost() && !!host, rehearsal, pending, error: failure});
    if (!element.hidden) draw(model.url);
    code.textContent = model.code;count.textContent = model.countText;status.textContent = model.statusText;
    error.textContent = failure || model.error;url.textContent = model.url;url.hidden = !model.url;
    steps.replaceChildren(...model.steps.map(step => node('li', '', step)));
    renewButton.textContent = model.buttonLabel;renewButton.disabled = !model.canRenew;renewButton.hidden = !host;
    confirmText.textContent = model.confirmText;confirmYes.disabled = !model.canRenew;
    element.dataset.code = String(model.hasCode);
  }
  async function refresh() {
    clearTimeout(refreshTimer);
    if (disposed || element.hidden || !host) { render(); return; }
    const reply = await host.read();
    if (disposed) return;
    if (reply.ok) { demo = reply.data; failure = ''; }
    else failure = reply.status === 403 ? 'Only the host can see the class code.' : 'The class code could not be read. Try again.';
    render();
    // The button is usable only once the code is known: move the focus there from "Hide".
    if (document.activeElement === closeButton && !renewButton.hidden && !renewButton.disabled) renewButton.focus({preventScroll: true});
    refreshTimer = setTimeout(refresh, 30000);
  }
  function askRenew() {
    if (pending || !host || renewButton.disabled) return;
    confirm.hidden = false;confirmNo.focus({preventScroll: true});
  }
  function closeConfirm() { confirm.hidden = true; renewButton.focus({preventScroll: true}); }
  async function renew() {
    if (pending || !host) return;
    confirm.hidden = true;pending = true;uid ??= newActionUid();render();
    const reply = await host.renew(newCodeBody(uid));
    pending = false;
    if (disposed) return;
    const unknown = reply.status === 0 || reply.status >= 500;
    if (reply.ok && typeof reply.data?.code === 'string') { demo = reply.data; uid = null; failure = ''; }
    else if (reply.ok) failure = 'The new code could not be read. Press again: the same request is repeated safely.';
    else {
      failure = reply.status === 403 ? 'Only the host can make a class code.' : unknown
        ? 'No answer from the server. Press again: the same request is repeated safely.' : (reply.message || 'No new code was made.');
      if (!unknown) uid = null;
    }
    render();renewButton.focus({preventScroll: true});
  }
  renewButton.addEventListener('click', askRenew);
  confirmYes.addEventListener('click', () => void renew());
  confirmNo.addEventListener('click', closeConfirm);
  closeButton.addEventListener('click', () => hide());
  // J and Escape also work while a button of the panel has the focus (the game ignores keys there).
  element.addEventListener('keydown', event => {
    if (event.repeat) return;
    if (event.key === 'Escape' && !confirm.hidden) { event.preventDefault(); event.stopPropagation(); closeConfirm(); return; }
    if (event.code === 'KeyJ' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); }
  });

  function show() {
    if (disposed) return;
    element.hidden = false;render();
    (renewButton.hidden || renewButton.disabled ? closeButton : renewButton).focus({preventScroll: true});void refresh();
  }
  function hide() { if (element.hidden) return; element.hidden = true;confirm.hidden = true;clearTimeout(refreshTimer);focus?.(); }

  return {
    toggle() { if (element.hidden) show(); else hide(); },
    show, hide,
    setCount(value) { captains = value; if (!element.hidden) render(); },
    get visible() { return !element.hidden; },
    dispose() { disposed = true; clearTimeout(refreshTimer); element.remove(); },
  };
}

// The host calls through api.js. GET answers 401 for a visitor and 403 for a player who is not a host.
export const createHostApi = api => ({read: () => api.get('/api/host/demo'), renew: body => api.post('/api/host/demo/code', body)});
