// Keyboard and pointer state, consumed by the player, camera and debug controls.
export function createInput(canvas) {
  const held = new Set(), pressed = new Set();
  const pointer = { x: 0, y: 0, wheel: 0, dragging: false };
  const cleanups = [];
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    cleanups.push(() => target.removeEventListener(event, callback, options));
  };
  listen(window, 'keydown', event => {
    const editing = event.target instanceof HTMLElement && event.target.closest('input, select, button, textarea');
    if (editing && event.code !== 'Escape') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
  });
  listen(window, 'keyup', event => held.delete(event.code));
  listen(window, 'blur', () => { held.clear(); pressed.clear(); pointer.dragging = false; });
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0) return;
    pointer.dragging = true; canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, 'pointerup', () => { pointer.dragging = false; });
  listen(canvas, 'pointercancel', () => { pointer.dragging = false; });
  listen(canvas, 'lostpointercapture', () => { pointer.dragging = false; });
  listen(canvas, 'pointermove', event => {
    if (pointer.dragging) { pointer.x += event.movementX; pointer.y += event.movementY; }
  });
  listen(canvas, 'wheel', event => { event.preventDefault(); pointer.wheel += event.deltaY; }, { passive: false });
  return {
    held, pointer,
    axis(positive, negative) {
      return Number(positive.some(key => held.has(key))) - Number(negative.some(key => held.has(key)));
    },
    consume(key) { const value = pressed.has(key); pressed.delete(key); return value; },
    endFrame() { pressed.clear(); pointer.x = 0; pointer.y = 0; pointer.wheel = 0; },
    dispose() { cleanups.forEach(cleanup => cleanup()); },
  };
}
