// Public fake identities, in memory only. This panel is injected solely by the dev launcher.
import {session} from '/src/online/session.js';
if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
  throw new Error('Scratch sign-in is available only on the local development server.');
}
const panel = document.createElement('aside');
panel.setAttribute('aria-label', 'Local development sign-in');
panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:10000;padding:8px;background:#17252f;color:white;font:14px sans-serif';
const label = document.createElement('label');
label.textContent = 'Scratch demo player: ';
const select = document.createElement('select');
select.setAttribute('aria-label', 'Scratch demo player');
label.append(select);
const button = document.createElement('button');
button.textContent = 'Test sign in';
const status = document.createElement('output');
status.setAttribute('aria-live', 'polite');
panel.append(label, button, status);
document.body.append(panel);
// Modal dialogs make the rest of the document inert, regardless of z-index.
// Keep the dev controls inside the active dialog, then return them to the page.
function placePanel() {
  const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  if (panel.parentElement !== host) host.append(panel);
}
const observer = new MutationObserver(placePanel);
observer.observe(document.body, {
  subtree: true, childList: true, attributes: true, attributeFilter: ['open'],
});
placePanel();
try {
  const response = await fetch('/api/dev/players');
  if (!response.ok) throw new Error('API unavailable');
  for (const player of await response.json()) {
    const option = document.createElement('option');
    option.value = player.code; option.textContent = player.name; select.append(option);
  }
} catch { status.textContent = ' Local API unavailable. See dev.log.'; }
button.addEventListener('click', async () => {
  try {
    const exchange = await fetch('/api/auth/exchange', {method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({code: select.value, codeVerifier: 'g22-local-demo-verifier-'.padEnd(43, 'x')})});
    if (!exchange.ok) throw new Error('Sign-in failed');
    const {accessToken} = await exchange.json();
    session.setToken(accessToken);
    const response = await fetch('/api/me', {headers: {Authorization: `Bearer ${accessToken}`}});
    if (!response.ok) throw new Error('Profile unavailable');
    const me = await response.json();
    status.textContent = ` ${me.displayName}: ${me.coins} demo coins`;
  } catch { session.clearToken(); status.textContent = ' Test sign-in failed. See dev.log.'; }
});
if (import.meta.hot) import.meta.hot.dispose(() => { observer.disconnect(); panel.remove(); });
