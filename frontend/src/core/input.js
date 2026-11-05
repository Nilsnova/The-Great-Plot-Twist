// Keyboard and pointer state, consumed by the player, camera and debug controls.
import {combinedAxis} from '../controls/logic.js';
export function createInput(canvas) {
  const held = new Set(), pressed = new Set(),virtual=new Map();
  const pointer = { x: 0, y: 0, wheel: 0, dragging: false };
  const cleanups = [];
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    cleanups.push(() => target.removeEventListener(event, callback, options));
  };
  listen(window, 'keydown', event => {
    const editing = event.target instanceof HTMLElement && event.target.closest('input, select, button, textarea, [contenteditable=true]');
    if (editing && event.code !== 'Escape') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
  });
  listen(window, 'keyup', event => held.delete(event.code));
  function reset() { held.clear(); pressed.clear();virtual.clear(); pointer.dragging = false; pointer.x = 0; pointer.y = 0; pointer.wheel = 0; }
  listen(window, 'blur', reset);
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
    held, pointer, reset,
    setVirtual(source,value){virtual.set(source,value);},press(key){pressed.add(key);},
    axis(positive, negative) {
      const keyboard=Number(positive.some(key => held.has(key)))-Number(negative.some(key => held.has(key)));
      return combinedAxis(keyboard,[...virtual.values()],positive.includes('KeyD')?'x':'y');
    },
    consume(key) { const value = pressed.has(key); pressed.delete(key); return value; },
    endFrame() { pressed.clear(); pointer.x = 0; pointer.y = 0; pointer.wheel = 0; },
    dispose() { reset();cleanups.forEach(cleanup => cleanup()); },
  };
}
