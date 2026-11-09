// The projector's "Join the harbor" panel, for the host only: a QR drawn on a canvas (the CSP forbids
// data: images), the code HARBOR in big letters, a live count of captains in the class harbor, and the
// demo window with "Open demo for 2 hours". The words come from harbor.js; the host calls go through
// api.js (GET and POST /api/host/demo). Toggle with J or the host's menu entry.
import {node} from '../ui/kit/dom.js';
import {drawQr} from '../lib/qr/index.js';
import {newActionUid} from '../screens/duels/logic.js';
import {projectorModel, openDemoBody, JOIN_URL} from './harbor.js';

// host: {read(), open(body)} -> {ok, status, data}; null in a rehearsal without a signed-in host.
export function createProjector({container, host, isHost = () => false, rehearsal = false, focus}) {
  const element = node('section', 'projector'), heading = node('h2', '', 'Join the harbor');
  heading.id = 'projector-heading';element.setAttribute('aria-labelledby', heading.id);element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');element.hidden = true;
  const canvas = node('canvas');canvas.setAttribute('role', 'img');canvas.setAttribute('aria-label', `QR code for ${JOIN_URL}`);
  const side = node('div'), code = node('p', 'projector-code'), count = node('p', 'projector-count'), steps = node('ol');
  const windowLine = node('p', 'projector-window'), error = node('p', 'projector-error'), url = node('p', 'projector-url', JOIN_URL);
  const actions = node('div', 'projector-actions');
  const openButton = node('button', 'kit-button');openButton.type = 'button';
  const closeButton = node('button', 'kit-button kit-quiet', 'Hide (J)');closeButton.type = 'button';
  count.setAttribute('role', 'status');count.setAttribute('aria-live', 'polite');error.setAttribute('role', 'alert');
  actions.append(openButton, closeButton);
  side.append(heading, code, count, steps, windowLine, error, actions, url);
  element.append(canvas, side);container.append(element);
  let demo = null, captains = 1, pending = false, failure = '', uid = null, disposed = false, refreshTimer = null, drawn = false;

  function render() {
    const model = projectorModel({demo, count: captains, host: isHost() && !!host, rehearsal, pending, error: failure});
    code.textContent = model.code;count.textContent = model.countText;windowLine.textContent = model.windowText;
    error.textContent = model.error;steps.replaceChildren(...model.steps.map(step => node('li', '', step)));
    openButton.textContent = model.buttonLabel;openButton.disabled = !model.canOpen;openButton.hidden = !host;
    element.dataset.open = String(model.open);
  }
  async function refresh() {
    clearTimeout(refreshTimer);
    if (disposed || element.hidden || !host) { render(); return; }
    const reply = await host.read();
    if (disposed) return;
    if (reply.ok) { demo = reply.data; failure = ''; }
    else failure = reply.status === 403 ? 'Only the host can open the demo.' : 'The demo window could not be read. Try again.';
    render();
    refreshTimer = setTimeout(refresh, 30000);
  }
  async function openDemo() {
    if (pending || !host) return;
    pending = true;uid ??= newActionUid();render();
    const reply = await host.open(openDemoBody(uid));
    pending = false;
    if (disposed) return;
    if (reply.ok) { demo = reply.data; uid = null; failure = ''; }
    else {
      failure = reply.status === 403 ? 'Only the host can open the demo.' : reply.status === 0 || reply.status >= 500
        ? 'No answer from the server. Press again: the same request is repeated safely.' : (reply.message || 'The demo could not be opened.');
      if (!(reply.status === 0 || reply.status >= 500)) uid = null;
    }
    render();
  }
  openButton.addEventListener('click', () => void openDemo());
  closeButton.addEventListener('click', () => hide());

  function show() {
    if (disposed) return;
    if (!drawn) { try { drawQr(canvas, JOIN_URL, {scale: 10, margin: 4, ecc: 'M'}); drawn = true; } catch { failure = 'The QR code could not be drawn. Use the code instead.'; } }
    element.hidden = false;render();void refresh();openButton.hidden ? closeButton.focus({preventScroll: true}) : openButton.focus({preventScroll: true});
  }
  function hide() { if (element.hidden) return; element.hidden = true;clearTimeout(refreshTimer);focus?.(); }

  return {
    toggle() { if (element.hidden) show(); else hide(); },
    show, hide,
    setCount(value) { captains = value; if (!element.hidden) render(); },
    get visible() { return !element.hidden; },
    dispose() { disposed = true; clearTimeout(refreshTimer); element.remove(); },
  };
}

// The host calls through api.js. GET answers 401 for a visitor and 403 for a player who is not a host.
export const createHostApi = api => ({read: () => api.get('/api/host/demo'), open: body => api.post('/api/host/demo', body)});
