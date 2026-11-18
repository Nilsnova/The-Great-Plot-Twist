// Contact sheets of the path plates and skill emblems (src/art/path-marks.js) over the real tower sprites, composed
// in a real browser with the game's own frames, paint() and placement numbers (buildingMarks offsets, pipRow): every
// tower kind at level 5 with no tree, a1, a2, a3, b1, b2, b3 and a1+b1, plus a sheet of skills and damage states.
//   node scripts/capture-path-visuals.js [output folder]     (default ../docs/evidence/path-visuals)
// Saves towers-desktop-1280x800.png (deviceScaleFactor 2), towers-phone-375x812.png (deviceScaleFactor 3, full
// page) and skills-states-1280x800.png. The live island and wave images come from capture-path-visuals-live.js.
import {mkdir} from 'node:fs/promises';
import {openWorldBrowser} from './world-browser-tools.js';

const out = process.argv[2] ?? new URL('../../docs/evidence/path-visuals/', import.meta.url).pathname;
await mkdir(out, {recursive: true});
const env = await openWorldBrowser();
const VARIANTS = [['no tree', null], ['a1', {a: 1, b: 0}], ['a2', {a: 2, b: 0}], ['a3', {a: 3, b: 0}],
  ['b1', {a: 0, b: 1}], ['b2', {a: 0, b: 2}], ['b3', {a: 0, b: 3}], ['a1+b1', {a: 1, b: 1}]];
const KINDS = ['cannon', 'mortar', 'harpoon', 'culverin', 'swivel'];

async function sheet({width, height, scale, dpr, columns, file, rows, fullPage = false, title}) {
  const context = await env.browser.newContext({viewport: {width, height}, deviceScaleFactor: dpr});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${env.url}/privacy.html`);
  await page.evaluate(async ({scale, dpr, columns, rows, title}) => {
    const {islandFrame} = await import('/src/art/registry.js'), {paint} = await import('/src/art/paint.js');
    const {buildingMarks} = await import('/src/art/path-marks.js'), {pipRow} = await import('/src/pixel/pirate-catalog.js');
    const {buildingArt} = await import('/src/island/world.js'), {towerStateFrame} = await import('/src/art/tower-states.js');
    const density = scale * dpr, U = 16, painted = new Map();
    const art = name => { if (!painted.has(name)) { const f = islandFrame(name); painted.set(name, {f, canvas: paint(f[3], [f[0], f[1]], density, {outline: f[4]?.outline ?? .9})}); } return painted.get(name); };
    // One building as the island draws it: sprite on its anchor, the level pips above, the marks at their offsets.
    function cell({kind, level, tree, spec, state = 'intact'}) {
      const id = state === 'intact' ? buildingArt(kind, level, spec) : towerStateFrame(kind, level, state);
      const W = 66, H = kind === 'watchtower' ? 140 : kind === 'wall' ? 66 : 54, ground = H - 7;
      const canvas = document.createElement('canvas'); canvas.width = W * density; canvas.height = H * density;
      canvas.style.cssText = `width:${W * scale}px;height:${H * scale}px`;
      const c = canvas.getContext('2d'), put = (name, cx, bottomY, k = 1) => {
        const {f, canvas: img} = art(name), w = f[0] * k, h = f[1] * k;
        c.drawImage(img, (cx - w / 2) * density, (bottomY - h) * density, w * density, h * density);
      };
      const [, h, anchor] = islandFrame(id);
      put(id, W / 2, ground + anchor);
      if (state !== 'broken') {
        const row = pipRow(level, {step: .6}), pip = islandFrame(row.art), top = ground - (h - anchor) - .15 * U;
        for (const offset of row.offsets) put(row.art, W / 2 + offset * pip[0], top + pip[2] * row.scale, row.scale);
        for (const mark of buildingMarks(kind, level, tree, spec)) put(mark.art, W / 2 + mark.dx * U, ground - mark.dy * U);
      }
      return canvas;
    }
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#7fb98f;color:#16241c;font:600 12px system-ui,sans-serif';
    const head = document.createElement('div'); head.textContent = title; head.style.cssText = 'padding:8px 10px 2px;font-size:14px'; document.body.append(head);
    const key = document.createElement('div'); key.style.cssText = 'padding:0 10px 6px;font-weight:500';
    key.textContent = 'Path a (fires faster): blue pill, left, 1-3 chevrons. Path b (hits harder): red shield, right, 1-3 gold studs. Skill: parchment disc (gold rim = capstone).';
    document.body.append(key);
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:${columns.label}px repeat(${columns.count},auto);gap:2px 4px;padding:0 8px 8px;align-items:end;justify-items:center`;
    for (const row of rows) {
      if (row.header) { grid.append(Object.assign(document.createElement('div'), {textContent: ''})); for (const text of row.header) grid.append(Object.assign(document.createElement('div'), {textContent: text})); continue; }
      const label = document.createElement('div'); label.textContent = row.label; label.style.cssText = 'justify-self:start;align-self:center'; grid.append(label);
      for (const item of row.cells) {
        const figure = document.createElement('figure'); figure.style.cssText = 'margin:0;display:grid;justify-items:center;background:#6aa87c;border-radius:6px;padding:2px';
        figure.append(cell(item));
        if (item.caption) figure.append(Object.assign(document.createElement('figcaption'), {textContent: item.caption, style: 'font-weight:500;font-size:11px'}));
        grid.append(figure);
      }
    }
    document.body.append(grid);
  }, {scale, dpr, columns, rows, title});
  await page.screenshot({path: `${out}${file}`, fullPage});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`${out}${file}`);
  await context.close();
}

try {
  const towerRows = [{header: VARIANTS.map(([name]) => name)}, ...KINDS.map(kind => ({label: `${kind} L5`, cells: VARIANTS.map(([, tree]) => ({kind, level: 5, tree}))}))];
  await sheet({width: 1280, height: 800, scale: 2.05, dpr: 2, columns: {label: 84, count: 8}, rows: towerRows, file: 'towers-desktop-1280x800.png',
    title: 'Tower upgrade paths (D055) at level 5'});
  // Phone: four variants a row, two rows a kind, at the scale a phone shows the island.
  const phoneRows = KINDS.flatMap(kind => [VARIANTS.slice(0, 4), VARIANTS.slice(4)].map((part, i) => ({label: i ? '' : kind,
    cells: part.map(([name, tree]) => ({kind, level: 5, tree, caption: name}))})));
  await sheet({width: 375, height: 812, scale: 1.0, dpr: 3, columns: {label: 46, count: 4}, rows: phoneRows, file: 'towers-phone-375x812.png', fullPage: true,
    title: 'Upgrade paths, level 5'});
  const skillRows = [
    {label: 'tower skills', cells: [['cannon', 'rapid'], ['cannon', 'heavy'], ['cannon', 'chain'], ['cannon', 'broadside'], ['mortar', 'cluster'], ['mortar', 'fire_pot'], ['mortar', 'long_range'], ['mortar', 'shockwave']]
      .map(([kind, spec]) => ({kind, level: 3, spec, caption: `${kind} ${spec}`}))},
    {label: 'skill + path', cells: [['cannon', 'grapeshot', {a: 3, b: 1}], ['mortar', 'inferno', {a: 1, b: 2}], ['harpoon', null, {a: 2, b: 1}], ['swivel', null, {a: 1, b: 3}]]
      .map(([kind, spec, tree]) => ({kind, level: 5, spec, tree, caption: `${spec ?? kind} ${tree.a ? `a${tree.a}` : ''}${tree.b ? `+b${tree.b}` : ''}`}))
      .concat([['damaged', 'damaged'], ['broken', 'broken']].map(([caption, state]) => ({kind: 'cannon', level: 5, tree: {a: 2, b: 1}, state, caption: `a2+b1 ${caption}`})))
      .concat([{kind: 'culverin', level: 5, tree: {a: 0, b: 2}, caption: 'culverin b2'}, {kind: 'mortar', level: 5, tree: {a: 3, b: 0}, caption: 'mortar a3'}])},
    {label: 'walls', cells: [null, 'stone', 'spiked', 'quick_mend', 'bastion', 'thorns'].map(spec => ({kind: 'wall', level: 3, spec, caption: spec ?? 'no skill'}))},
  ];
  await sheet({width: 1280, height: 800, scale: 1.95, dpr: 2, columns: {label: 96, count: 8}, rows: skillRows, file: 'skills-states-1280x800.png',
    title: 'Skill emblems (D051), skills with paths, ruin states and walls'});
  const towerHigh = [{label: 'watchtower', cells: [null, 'spotter', 'signal_fire', 'eagle_eye', 'war_drums'].map(spec => ({kind: 'watchtower', level: 5, spec, caption: spec ?? 'no skill'}))}];
  await sheet({width: 900, height: 420, scale: 1.4, dpr: 2, columns: {label: 84, count: 5}, rows: towerHigh, file: 'watchtower-skills.png', fullPage: true,
    title: 'Watchtower skills'});
} finally {
  await env.close();
}
