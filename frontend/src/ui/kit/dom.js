// Small safe DOM helpers; supplied strings are always text, never HTML.
let nextId = 0;
export const uniqueId = prefix => `${prefix}-${++nextId}`;
export function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text ?? '');
  return element;
}
export function content(element, value) {
  element.replaceChildren();
  if (value instanceof Node) element.append(value);
  else if (value !== undefined) element.textContent = String(value ?? '');
}
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
