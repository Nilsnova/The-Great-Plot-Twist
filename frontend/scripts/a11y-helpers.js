// Colour, geometry, text and rendered visibility checks shared by accessibility audits.
// Colour channels use 0–255; alpha uses 0–1. DOM checks accept an injected style reader.
function validColour(colour) {
  return colour && ['r', 'g', 'b'].every((key) =>
    Number.isFinite(colour[key]) && colour[key] >= 0 && colour[key] <= 255)
    && Number.isFinite(colour.a) && colour.a >= 0 && colour.a <= 1;
}

function requireColour(colour) {
  if (!validColour(colour)) throw new TypeError('Expected a parsed RGBA colour');
}

function cssNumber(value, maximum) {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(value)) return NaN;
  return value.endsWith('%') ? Number(value.slice(0, -1)) * maximum / 100 : Number(value);
}

// Unsupported CSS colour spaces return null so the audit can report them.
export function parseColour(css) {
  if (typeof css !== 'string') return null;
  const text = css.trim().toLowerCase();
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) {
    let hex = text.slice(1);
    if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join('');
    const channels = hex.match(/../g).map((pair) => parseInt(pair, 16));
    return { r: channels[0], g: channels[1], b: channels[2], a: (channels[3] ?? 255) / 255 };
  }
  const match = text.match(/^rgba?\(([^()]+)\)$/);
  if (!match) return null;
  const body = match[1].trim();
  if (body.includes(',') && body.includes('/')) return null;
  const parts = body.includes(',') ? body.split(',').map((part) => part.trim())
    : body.replace(/\s*\/\s*/, ' / ').split(/\s+/);
  if (parts.includes('/')) {
    if (parts.length !== 5 || parts[3] !== '/') return null;
    parts.splice(3, 1);
  } else if (!body.includes(',') && parts.length !== 3) return null;
  if (parts.length !== 3 && parts.length !== 4) return null;
  const colour = { r: cssNumber(parts[0], 255), g: cssNumber(parts[1], 255),
    b: cssNumber(parts[2], 255), a: parts.length === 4 ? cssNumber(parts[3], 1) : 1 };
  return validColour(colour) ? colour : null;
}

// Source-over blending also works when the background is translucent.
export function compositeColour(foreground, background) {
  requireColour(foreground);
  requireColour(background);
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const result = { a: alpha };
  for (const channel of ['r', 'g', 'b']) {
    result[channel] = (foreground[channel] * foreground.a
      + background[channel] * background.a * (1 - foreground.a)) / alpha;
  }
  return result;
}

// WCAG relative luminance converts each sRGB channel to linear light.
export function luminance(colour) {
  requireColour(colour);
  const linear = ['r', 'g', 'b'].map((key) => {
    const value = colour[key] / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

// White is the document canvas when callers supply a translucent background.
// Callers should first composite all known ancestor backgrounds themselves.
export function contrastRatio(foreground, background) {
  const backdrop = compositeColour(background, { r: 255, g: 255, b: 255, a: 1 });
  const text = compositeColour(foreground, backdrop);
  const light = luminance(text);
  const dark = luminance(backdrop);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

function nonnegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function withinViewport(rect, viewport, tolerance = 1) {
  if (!rect || !viewport || !nonnegative(tolerance)) return false;
  if (![viewport.width, viewport.height].every(nonnegative)) return false;
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return false;
  return rect.right >= rect.left && rect.bottom >= rect.top
    && rect.left >= -tolerance && rect.top >= -tolerance
    && rect.right <= viewport.width + tolerance && rect.bottom <= viewport.height + tolerance;
}

// Invalid measurements must not silently pass the overflow audit.
export function hasHorizontalOverflow(dimensions, tolerance = 1) {
  if (!dimensions || !nonnegative(tolerance)) return true;
  const { scrollWidth, clientWidth } = dimensions;
  if (![scrollWidth, clientWidth].every(nonnegative)) return true;
  return scrollWidth > clientWidth + tolerance;
}

export function touchTargetMeetsMinimum(rect, min = 44) {
  return Boolean(rect && nonnegative(min) && min > 0
    && nonnegative(rect.width) && nonnegative(rect.height)
    && rect.width >= min && rect.height >= min);
}

export function minimumTextSize(context) {
  const sizes = { gameplay: 16, case: 18, story: 19, metadata: 16 };
  if (!Object.hasOwn(sizes, context)) throw new RangeError(`Unknown text context: ${context}`);
  return sizes[context];
}

// Missing names are checked separately; return normalized duplicate names once.
export function duplicateNames(names) {
  if (!Array.isArray(names)) throw new TypeError('Expected an array of accessible names');
  const seen = new Set();
  const duplicates = new Set();
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

// Closed native details may still expose descendant boxes. Only their first direct
// summary (and its contents) participates in rendered content and keyboard order.
export function insideClosedDetails(element) {
  for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName?.toLowerCase() !== 'details' || ancestor.open) continue;
    const summary = [...ancestor.children].find(child => child.tagName?.toLowerCase() === 'summary');
    if (!summary || !(summary === element || summary.contains(element))) return true;
  }
  return false;
}

export function renderedForAudit(element, styleOf = el => globalThis.getComputedStyle(el)) {
  if (!element?.getClientRects().length || element.closest('[hidden],[inert],[aria-hidden="true"]')
    || insideClosedDetails(element)) return false;
  const rect = element.getBoundingClientRect(), style = styleOf(element);
  return rect.width > 1 && rect.height > 1 && !['hidden', 'collapse'].includes(style.visibility);
}
