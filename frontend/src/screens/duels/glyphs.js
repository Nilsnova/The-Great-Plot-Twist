// The three signal shapes, drawn in code (no outside asset). Colour is never the only clue:
// Flash is a sunburst, Shade a closed shutter and Mirror a diamond, and the name is always
// written next to it. Each shape is a few rectangles on a 12 by 12 grid, drawn with crisp edges
// to match the pixel art. Used by: picker.js, reveal.js, history.js and rules-card.js.
const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID = 12;

// Rows of the diamond: 2 wide at the top, 12 wide in the middle, 2 wide at the bottom.
const DIAMOND = Array.from({ length: GRID }, (_, row) => {
  const width = 2 + 2 * Math.min(row, GRID - 1 - row);
  return [(GRID - width) / 2, row, width, 1];
});

// [x, y, width, height] rectangles.
const SHAPES = {
  flash: [[4, 4, 4, 4], [5, 0, 2, 4], [5, 8, 2, 4], [0, 5, 4, 2], [8, 5, 4, 2], [1, 1, 2, 2], [9, 1, 2, 2], [1, 9, 2, 2], [9, 9, 2, 2]],
  shade: [[1, 1, 10, 1], [1, 10, 10, 1], [1, 1, 1, 10], [10, 1, 1, 10], [2, 3, 8, 1], [2, 5, 8, 1], [2, 7, 8, 1]],
  mirror: DIAMOND,
};

// An <svg> that screen readers skip, because the name of the signal is always written beside it.
export function signalGlyph(signal, size = 32) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GRID} ${GRID}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('fill', 'currentColor');
  svg.classList.add('duel-glyph');
  svg.dataset.signal = signal; // the CSS gives each shape its own tint, on top of its own form
  for (const [x, y, width, height] of SHAPES[signal] ?? []) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    svg.append(rect);
  }
  return svg;
}
