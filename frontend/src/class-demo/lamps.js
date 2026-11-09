// "Light the three lamps" on screen and on the wire. Standing at a lamp, press and hold the button
// (or E) for 2 s to light it. Lamp states travel only through the class harbor's broadcast room as the
// extra "lamp" (see lamp-sync.js for the rules, the clocks and the ticks). The host can fill missing
// lamps with NPC partners after 20 s, for a rehearsal.
import {node} from '../ui/kit/dom.js';
import {HOLD_MS, TICK_JITTER_MS, canNpcFill, createLamps, encodeLamps, holdProgress, isLampLit, isRelit, lampStatusText, lightLamp, mergeLamps, npcFill, shouldTick, expire} from './lamp-sync.js';

// send(event, data) -> true if sent; onRelit({celebrate}) once per relight; onChange(state) after changes.
export function createLampFinale({container, send = () => false, myName = () => 'Captain', canFill = () => false,
  helpers = null, now = () => Date.now(), random = Math.random, onRelit, onChange, onLit}) {
  let state = createLamps(), spot = null, holdStart = null, keyHeld = false, pointerHeld = false, lastHeardAt = -Infinity, lastSentAt = -Infinity;
  let jitter = random() * TICK_JITTER_MS, disposed = false, visible = false, statusKey = '';
  const status = node('p', 'lamp-status');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');status.hidden = true;
  const fill = node('button', 'kit-button kit-quiet lamp-host', 'Fill missing lamps (NPC partners)');fill.type = 'button';fill.hidden = true;
  fill.addEventListener('click', () => apply(npcFill(state, now()), true));
  container.append(status, fill);
  fill.classList.add('lamp-fill');

  function apply(result, broadcast) {
    if (disposed || !result.changed) return;
    state = result.state;
    if (broadcast) share();
    if (result.relitNow) onRelit?.({celebrate: true});
    onChange?.(state);render();
  }
  function share() {
    if (send('lamp', encodeLamps(state, now()))) lastSentAt = now();
    jitter = random() * TICK_JITTER_MS;
  }
  function light(index) {
    const result = lightLamp(state, index, myName(), now());
    apply(result, true);
    if (result.changed) {
      onLit?.(index);
      helpers?.(index, helperIndex => apply(lightLamp(state, helperIndex, 'Simulated captain', now()), true));
    }
  }
  function render() {
    const t = now(), relit = isRelit(state, t), text = lampStatusText(state, t);
    const key = `${visible}|${text}|${canFill() && canNpcFill(state, t)}`;
    if (key === statusKey) return;
    statusKey = key;
    status.hidden = !visible;status.textContent = text;status.dataset.relit = String(relit);
    fill.hidden = !(visible && canFill() && canNpcFill(state, t));
  }

  // A hold button for the demo prompt: pointer or Space/Enter down starts, release cancels.
  function holdButton(index) {
    const button = node('button', 'kit-button lamp-hold'), label = node('span', '', 'Hold to light this lamp'), bar = node('progress');
    button.type = 'button';bar.max = 1;bar.value = 0;bar.setAttribute('aria-hidden', 'true');button.append(label, bar);
    button.dataset.lamp = String(index);
    const start = event => { event.preventDefault(); pointerHeld = true; holdStart ??= now(); };
    const stop = () => { pointerHeld = false; if (!keyHeld) holdStart = null; };
    button.addEventListener('pointerdown', start);
    for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) button.addEventListener(type, stop);
    button.addEventListener('keydown', event => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) start(event); });
    button.addEventListener('keyup', event => { if (event.code === 'Space' || event.code === 'Enter') stop(); });
    button.addEventListener('contextmenu', event => event.preventDefault());
    return {button, bar, label};
  }

  return {
    get state() { return state; },
    holdButton,
    // spot: the lamp spot the player stands at, or null. heldE: the E key is down.
    update({lampSpot = null, heldE = false, shown = false} = {}) {
      if (disposed) return {progress: 0};
      const t = now();
      visible = shown;
      const expired = expire(state, t);
      if (expired !== state) { state = expired; onChange?.(state); }
      if (spot?.index !== lampSpot?.index) { holdStart = null; pointerHeld = false; }
      spot = lampSpot;keyHeld = heldE && !!spot;
      if (keyHeld) holdStart ??= t;
      if (!keyHeld && !pointerHeld) holdStart = null;
      const lit = spot ? isLampLit(state.lamps[spot.index], t) : false;
      const progress = spot && !lit && !isRelit(state, t) ? holdProgress(holdStart, t) : 0;
      if (spot && progress >= 1) { holdStart = null; pointerHeld = false; light(spot.index); }
      if (shouldTick({state, now: t, lastHeardAt, lastSentAt, jitter})) share();
      render();
      return {progress, lit, relit: isRelit(state, t), holdMs: HOLD_MS};
    },
    receive(data) {
      lastHeardAt = now();
      jitter = random() * TICK_JITTER_MS;
      apply(mergeLamps(state, data, now()), false);
    },
    lit: index => isLampLit(state.lamps[index], now()),
    dispose() { disposed = true; status.remove(); fill.remove(); },
  };
}
