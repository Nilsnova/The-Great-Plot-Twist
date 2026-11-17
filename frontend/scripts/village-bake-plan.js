// Build-time inputs only. Generated baked.js is deliberately never discovered as a raw family.
export const RAW_FAMILIES = Object.freeze(['buildings', 'houses', 'landmarks', 'services', 'nature', 'cannons', 'walls', 'core', 'progress', 'mortars', 'harpoons', 'culverins', 'swivels']);
export const BAKE_DENSITY = 4, GUTTER = 4, MAX_WIDTH = 1024, MAX_HEIGHT = 2048;
export const PROOF_DENSITIES = Object.freeze([4, 2.5, 2, 1.5]);
export function validateBakedPng(bytes, sheet) {
  if (bytes.length < 24 || bytes.length > 8 * 2 ** 20) throw new Error('Compiled PNG exceeds encoded decoder limits.');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(16) !== sheet.width || header.getUint32(20) !== sheet.height) throw new Error('Compiled PNG header/dimensions differ.');
}
export function rawFamilyNames(value = RAW_FAMILIES) {
  const names = typeof value === 'string' ? value.split(',') : [...value];
  if (!names.length || new Set(names).size !== names.length || names.some(name => !/^[a-z][a-z0-9-]*$/.test(name) || /baked|compiled/.test(name))) throw new Error('Use unique explicit raw family names, never generated output.');
  return names;
}
export function appendFamilyNames(previous, names) {
  const old = rawFamilyNames(previous.families), added = rawFamilyNames(names);
  if (added.some(name => old.includes(name))) throw new Error('A family is already compiled; use a full rebake to replace it.');
  if (JSON.stringify(previous.proofDensities) !== JSON.stringify(PROOF_DENSITIES) || previous.errors?.length !== 0 || previous.externalRequests?.length !== 0) throw new Error('Previous proof is incompatible or failed; use a full rebake.');
  return [...old, ...added];
}
export function planFamily(name, frames) {
  rawFamilyNames([name]);
  const unique = new Map(), aliases = new Map();
  for (const [id, frame] of Object.entries(frames)) {
    const key = JSON.stringify([frame.sheet, frame.rect, frame.logical, frame.sourceFoot, frame.fitBounds]);
    if (!unique.has(key)) unique.set(key, {id, frame}); aliases.set(id, unique.get(key).id);
  }
  if (!unique.size) throw new Error('A raw family must contain frames.');
  const cells = [...unique.values()].sort((a, b) => b.frame.logical[1] - a.frame.logical[1] || a.id.localeCompare(b.id));
  const pages = [], locations = new Map(); let page, x, y, rowHeight;
  const start = () => { page = {file: `village/compiled/${name}-4x-${pages.length + 1}.png`, width: 0, height: 0, items: []}; pages.push(page); x = y = GUTTER; rowHeight = 0; };
  start();
  for (const {id, frame} of cells) {
    const [lw, lh, anchor] = frame.logical, w = lw * BAKE_DENSITY, h = lh * BAKE_DENSITY;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0 || w + GUTTER * 2 > MAX_WIDTH || h + GUTTER * 2 > MAX_HEIGHT) throw new Error(`Frame does not fit a bounded baked page: ${id}`);
    if (x + w + GUTTER > MAX_WIDTH) { x = GUTTER; y += rowHeight + GUTTER * 2; rowHeight = 0; }
    if (y + h + GUTTER > MAX_HEIGHT) start();
    const rect = [x, y, w, h]; page.items.push({id, rect}); locations.set(id, {sheet: `${name}Baked${pages.length}`, rect, logical: [...frame.logical], sourceFoot: [w / 2, (lh - anchor) * BAKE_DENSITY]});
    page.width = Math.max(page.width, x + w + GUTTER); page.height = Math.max(page.height, y + h + GUTTER);
    x += w + GUTTER * 2; rowHeight = Math.max(rowHeight, h);
  }
  return {name, pages, sheets: Object.fromEntries(pages.map((p, i) => [`${name}Baked${i + 1}`, {file: p.file, width: p.width, height: p.height}])),
    frames: Object.fromEntries([...aliases].map(([id, source]) => [id, structuredClone(locations.get(source))]))};
}
export function pixelDifference(a, b) {
  if (a.length !== b.length || a.length % 4) throw new Error('Pixel comparison dimensions differ.');
  let maxVisibleDelta = 0, maxAlphaDelta = 0, differingPixels = 0, visiblePixels = 0, weighted = 0, weight = 0;
  for (let i = 0; i < a.length; i += 4) {
    const alpha = Math.max(a[i + 3], b[i + 3]) / 255; let changed = a[i + 3] !== b[i + 3];
    maxAlphaDelta = Math.max(maxAlphaDelta, Math.abs(a[i + 3] - b[i + 3]));
    if (alpha) for (let c = 0; c < 3; c++) { const delta = Math.abs(a[i + c] - b[i + c]); maxVisibleDelta = Math.max(maxVisibleDelta, delta); weighted += delta * alpha; changed ||= delta > 0; }
    weight += alpha * 3; if (alpha) visiblePixels++; if (changed) differingPixels++;
  }
  return {pixels: a.length / 4, visiblePixels, differingPixels, maxVisibleDelta, maxAlphaDelta, alphaWeightedMeanRgbDelta: weight ? weighted / weight : 0};
}
