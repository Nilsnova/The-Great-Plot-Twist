// Sets the text of an element only when it changed, so a screen reader is not told the same words again.
export function setText(element, text) {
  const next = text ?? '';
  if (element.textContent !== next) element.textContent = next;
}

// Same, and the element is hidden while it has no text.
export function showText(element, text) {
  setText(element, text);
  element.hidden = !text;
}
