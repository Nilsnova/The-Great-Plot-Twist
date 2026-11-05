// Tiny shared event bus. The story teammate subscribes to 'interact' events here.
const listeners = new Map();
export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(listener);
  return () => listeners.get(type)?.delete(listener);
}
export function emit(event) {
  for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
}
