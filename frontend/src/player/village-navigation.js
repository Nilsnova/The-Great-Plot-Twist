// Local management gestures only; canvas picking honors a canceled drag's pointerup.
export function createVillageNavigation({canvas, view, enabled, events = globalThis}) {
  let gesture = null;
  const listeners = [];
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener(type, fn, options));
  };
  const cancel = () => { if (gesture) gesture.canceled = true; };
  listen(canvas, 'pointerdown', event => {
    if (gesture || event.isPrimary === false) { cancel(); return; }
    if (!enabled() || event.button !== 0) return;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, dragged: false};
  }, {capture: true});
  listen(canvas, 'pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!enabled()) cancel();
    if (gesture.canceled) return;
    if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 6) return;
    gesture.dragged = true;
    const rect = canvas.getBoundingClientRect();
    view.panVillage(event.clientX - gesture.lastX, event.clientY - gesture.lastY, rect.width, rect.height);
    gesture.lastX = event.clientX; gesture.lastY = event.clientY;
  }, {capture: true});
  listen(canvas, 'pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.dragged || gesture.canceled) event.preventDefault();
    gesture = null;
  }, {capture: true});
  for (const type of ['pointercancel', 'lostpointercapture']) listen(canvas, type, () => { gesture = null; });
  listen(events, 'blur', cancel);
  listen(canvas, 'wheel', event => {
    if (!enabled() || !Number.isFinite(event.deltaY) || !event.deltaY) return;
    event.preventDefault(); view.villageControl(event.deltaY < 0 ? 'in' : 'out');
  }, {passive: false});
  return {refresh() { if (!enabled()) cancel(); }, dispose() { gesture = null; listeners.forEach(stop => stop()); }};
}
