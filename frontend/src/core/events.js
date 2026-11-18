// Tiny shared event bus. The story teammate subscribes to 'interact' events here. on('*', listener) hears
// every event, after its own listeners (core/lazy-part.js keeps them for a part that is still loading).
const listeners = new Map();
export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(listener);
  return () => listeners.get(type)?.delete(listener);
}
export function emit(event) {
  for (const listener of [...(listeners.get(event.type) ?? []), ...(listeners.get('*') ?? [])]) listener(event);
}
