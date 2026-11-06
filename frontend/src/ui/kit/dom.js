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

// Portraits may reference only this build's local pixel-art directory.
export function portraitSource(src) {
  try {
    const base = new URL(`${import.meta.env.BASE_URL}pixel/`,document.baseURI), source = new URL(src,document.baseURI);
    return source.origin === location.origin && source.pathname.startsWith(base.pathname) && source.pathname.endsWith('.png') ? source.href : null;
  } catch { return null; }
}
