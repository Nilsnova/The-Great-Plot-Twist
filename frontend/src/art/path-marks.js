// Path and skill marks: a small layer drawn ON TOP of a building's own sprite, so the island and the wave show which
// upgrade path (D055) and which skill (D051) a building took, whatever art sits underneath (a later art swap keeps
// them). Original drawings in the cartoon kit of ./paint.js, registered in ./registry.js; no image files.
//
// The visual language (the same for all five tower kinds, readable on a phone):
//   path a, "fires faster": a sky-blue pill on the LEFT of the tower's foot with 1 to 3 white chevrons (›, ››, ›››);
//   path b, "hits harder":  a vermilion shield on the RIGHT of the foot with 1 to 3 gold studs.
// The tier is the count (chevrons or studs) and the plate grows with it; tier 3 adds a light rim. A tower with
// tier 1 on both paths shows both small plates. Colour-blind safe without the setting: the two paths differ by
// shape (rounded pill with open arrows vs pointed shield with round dots), by side (left vs right) and by hue on the
// blue/orange axis every common colour-vision deficiency keeps apart.
//   skill (spec): a small parchment disc with an ink glyph per skill family (bolt, weight, chain, spread, flame,
//   eye, spikes), a gold rim for a tier-3 capstone. Towers wear it high on the back, walls on the face, the
//   watchtower on its deck. Houses already wear their role (Barracks, Tavern, Workshop) as their own drawing.
//
// buildingMarks() picks the marks of a building: pure, memoised per (kind, level, tree a, tree b, spec), so a
// renderer can call it every frame for free; every frame name is painted once (island: lazy materials, wave: the atlas).
import {INK, ellipse, line, part, poly, rect, stroke} from './paint.js';
import {readTree, TREE_LEVEL} from '../pirates/tower-trees.js';
import {SPECS} from '../campaign/tech.js';

const SKY = '#3aa0e8', SKY_DARK = '#1f64a8', SKY_LIGHT = '#d8f2ff';
const EMBER = '#d84a2c', EMBER_DARK = '#8f2a1c', GOLD = '#ffcf3f', GOLD_DARK = '#c98a2a';
const PARCHMENT = '#f3e3b5', RIM = '#7a4a2a';

export const MARK_TIERS = 3;
/** The frame name of a path plate: pathMark('a', 2) -> 'mark-path-a-2'. */
export const pathMark = (path, tier) => `mark-path-${path}-${tier}`;
// Skill families: one glyph each. Every skill of src/campaign/tech.js SPECS belongs to one (a test checks).
export const SPEC_FAMILY = Object.freeze({
  rapid: 'quick', quick_mend: 'quick', war_drums: 'quick',
  heavy: 'power', broadside: 'power', stone: 'power', bastion: 'power',
  chain: 'bind', shockwave: 'bind',
  cluster: 'spread', grapeshot: 'spread',
  fire_pot: 'fire', inferno: 'fire', signal_fire: 'fire',
  long_range: 'sight', spotter: 'sight', eagle_eye: 'sight',
  spiked: 'thorn', thorns: 'thorn',
});
export const SPEC_FAMILIES = Object.freeze([...new Set(Object.values(SPEC_FAMILY))]);
/** The frame name of a skill emblem: specMark('broadside') -> 'mark-spec-power-cap'; null for no tower skill. */
export function specMark(spec) {
  const family = SPEC_FAMILY[spec];
  return family ? `mark-spec-${family}${SPECS[spec]?.capstone ? '-cap' : ''}` : null;
}
export const PATH_MARK_IDS = Object.freeze(['a', 'b'].flatMap(path => [1, 2, 3].map(tier => pathMark(path, tier))));
export const SPEC_MARK_IDS = Object.freeze(SPEC_FAMILIES.flatMap(family => [`mark-spec-${family}`, `mark-spec-${family}-cap`]));
export const MARK_IDS = Object.freeze([...PATH_MARK_IDS, ...SPEC_MARK_IDS]);

// ---- the drawings -------------------------------------------------------------------------------------------------
const PLATE_H = 10;
const plateWidth = tier => 6 + 5 * tier; // 11, 16, 21 logical px: the plate grows with the tier
function chevrons(tier) {
  return (c, {w, h}) => {
    const top = 1, bottom = h - 1, mid = (top + bottom) / 2;
    part(c, rect(1, top, w - 2, bottom - top, 4), SKY, {shade: SKY_DARK, depth: 1.1, width: 1, light: SKY_LIGHT,
      gloss: rect(3, top + 1.2, w - 6, 1, .5)});
    if (tier >= 3) stroke(c, rect(2.3, top + 1.3, w - 4.6, bottom - top - 2.6, 3), SKY_LIGHT, .6);
    const span = 5, from = w / 2 - (tier * span) / 2 + 1.2;
    for (let i = 0; i < tier; i++) {
      const x = from + i * span, arm = [[x, mid - 2.6], [x + 2.6, mid], [x, mid + 2.6]];
      stroke(c, line(arm), INK, 2.6); stroke(c, line(arm), '#ffffff', 1.4);
    }
  };
}
function shield(tier) {
  return (c, {w, h}) => {
    const top = 1, side = h - 5, bottom = h - 1;
    part(c, poly([[1, top], [w - 1, top], [w - 1, side], [w / 2, bottom], [1, side]], [1.2, 1.2, 2, 1, 2]), EMBER,
      {shade: EMBER_DARK, depth: 1.1, width: 1, light: '#ffb08a', gloss: rect(3, top + 1, w - 6, .9, .4)});
    if (tier >= 3) part(c, rect(1.4, top + .4, w - 2.8, 2, .6), GOLD, {width: .6, shade: GOLD_DARK});
    const span = 5, from = w / 2 - ((tier - 1) * span) / 2, y = tier >= 3 ? top + 5.2 : top + 4.4;
    for (let i = 0; i < tier; i++) part(c, ellipse(from + i * span, y, 1.7), GOLD, {width: .7, shade: GOLD_DARK, depth: .6});
  };
}
const GLYPHS = {
  quick: c => part(c, poly([[6.9, 1.8], [3.4, 6.8], [5.7, 6.8], [4.9, 10.3], [8.6, 5.1], [6.3, 5.1]], .3), INK, {line: false, shade: false}),
  power: c => { // a heavy weight: a round iron body with a handle
    stroke(c, ellipse(6, 4.4, 2.2, 2, 0), INK, 1.3);
    part(c, poly([[2.6, 9.8], [3.2, 5.6], [8.8, 5.6], [9.4, 9.8]], 1.2), INK, {line: false, shade: false});
  },
  bind: c => { stroke(c, ellipse(4.6, 6.6, 2.4, 1.6, -.6), INK, 1.3); stroke(c, ellipse(7.4, 5.4, 2.4, 1.6, -.6), INK, 1.3); },
  spread: c => { for (const [x, y] of [[6, 3.6], [3.8, 7.6], [8.2, 7.6]]) part(c, ellipse(x, y, 1.6), INK, {line: false, shade: false}); },
  fire: c => {
    const p = new Path2D(); p.moveTo(6, 1.8); p.bezierCurveTo(9.6, 5, 9.4, 9.6, 6, 10.2); p.bezierCurveTo(2.6, 9.6, 2.6, 6.6, 4.4, 5.2);
    p.bezierCurveTo(4.6, 6.6, 5.4, 7, 5.8, 6.6); p.bezierCurveTo(5, 5, 5.2, 3.4, 6, 1.8); p.closePath();
    part(c, p, INK, {line: false, shade: false});
  },
  sight: c => {
    const p = new Path2D(); p.moveTo(1.8, 6); p.quadraticCurveTo(6, 1.6, 10.2, 6); p.quadraticCurveTo(6, 10.4, 1.8, 6); p.closePath();
    stroke(c, p, INK, 1.2); part(c, ellipse(6, 6, 1.7), INK, {line: false, shade: false});
  },
  thorn: c => part(c, poly([[2, 9.2], [3.4, 3.4], [4.8, 7.4], [6, 2.4], [7.2, 7.4], [8.6, 3.4], [10, 9.2]], .3), INK, {line: false, shade: false}),
};
function emblem(family, capstone) {
  return c => {
    part(c, ellipse(6, 6, 5.2), PARCHMENT, {shade: '#d9c18a', depth: .9, width: capstone ? 1.6 : 1, line: capstone ? GOLD_DARK : RIM});
    if (capstone) stroke(c, ellipse(6, 6, 4.3), GOLD, .9);
    GLYPHS[family](c);
  };
}
/** Every mark frame: name -> [width, height, anchor (px from the bottom), draw]. */
export function pathMarkFrames() {
  const frames = {};
  for (let tier = 1; tier <= MARK_TIERS; tier++) {
    frames[pathMark('a', tier)] = [plateWidth(tier), PLATE_H, 0, chevrons(tier)];
    frames[pathMark('b', tier)] = [plateWidth(tier), PLATE_H + 2, 0, shield(tier)];
  }
  for (const family of SPEC_FAMILIES) {
    frames[`mark-spec-${family}`] = [12, 12, 0, emblem(family, false)];
    frames[`mark-spec-${family}-cap`] = [12, 12, 0, emblem(family, true)];
  }
  return frames;
}

// ---- which marks a building wears ---------------------------------------------------------------------------------
// Where they sit, in world units from the building's ground point (dx right, dy up; 16 logical px per unit; a mark's
// anchor is its bottom centre). Towers are 48 x 32 frames anchored 5 px up (about 3 units wide, 1.7 tall above the
// ground), walls 48 x 48, the watchtower 64 x 128.
const TOWER_KINDS = new Set(['cannon', 'mortar', 'harpoon', 'culverin', 'swivel']);
export const MARK_PLACES = Object.freeze({
  pathA: Object.freeze({dx: -.62, dy: -.02}), pathB: Object.freeze({dx: .62, dy: -.06}),
  spec: Object.freeze({tower: Object.freeze({dx: -1.22, dy: .8}), wall: Object.freeze({dx: 0, dy: .95}),
    watchtower: Object.freeze({dx: -.95, dy: 3.1})}),
});

/** A tree's tiers {a, b} from either shape the game carries: the island read's {a, b} or the recovery snapshot's
 *  [a, b] (backend wave_recovery.py sends a list). Anything else, or a broken tree, is null. */
export function treeTiers(kind, tree) {
  const value = Array.isArray(tree) ? {a: tree[0], b: tree[1]} : tree;
  return readTree(kind, value);
}

const cache = new Map();
const NONE = Object.freeze([]);
/**
 * The marks a building wears: a frozen list of {art, dx, dy, part: 'a' | 'b' | 'spec'}. Path plates only on a
 * level-5 tower with a tree (as the sim reads it); the skill emblem on a tower, wall or watchtower with a tower
 * skill. Nothing for a house (its role is its own drawing) or a kind without either. Memoised per
 * (kind, level, tree a, tree b, spec), so the same frozen list comes back every frame.
 */
export function buildingMarks(kind, level = 1, tree = null, spec = null) {
  const n = Number.isSafeInteger(level) && level > 0 ? Math.min(5, level) : 1;
  const tiers = TOWER_KINDS.has(kind) && n >= TREE_LEVEL ? treeTiers(kind, tree) : null;
  const skill = typeof spec === 'string' && SPECS[spec]?.branch === kind ? spec : null;
  const key = `${kind}:${n}:${tiers?.a ?? 0}:${tiers?.b ?? 0}:${skill ?? ''}`;
  const known = cache.get(key);
  if (known) return known;
  const marks = [];
  if (tiers?.a) marks.push(Object.freeze({art: pathMark('a', tiers.a), ...MARK_PLACES.pathA, part: 'a'}));
  if (tiers?.b) marks.push(Object.freeze({art: pathMark('b', tiers.b), ...MARK_PLACES.pathB, part: 'b'}));
  const place = TOWER_KINDS.has(kind) ? MARK_PLACES.spec.tower : MARK_PLACES.spec[kind];
  if (skill && place && specMark(skill)) marks.push(Object.freeze({art: specMark(skill), ...place, part: 'spec'}));
  const out = marks.length ? Object.freeze(marks) : NONE;
  cache.set(key, out);
  return out;
}
/** The cache key of a building's look (kind, level, tiers, skill), for a renderer that keys its meshes. */
export function marksKey(kind, level, tree, spec) {
  return buildingMarks(kind, level, tree, spec).map(mark => mark.art).join('+');
}
