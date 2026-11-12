// Captain health and the presence figures (GAME-V3.md §3): a teammate down in the sim is drawn once, lying
// in the wave's ring, not also standing as their presence figure; a standing teammate's hp bar sits over
// their figure. The ?islands=fake game draws no other figures, so the matching is checked here.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FIGURE_REACH, figurePositions, hiddenFigures, matchFigures } from '../../src/pirates/figures.js';
import { createOtherCaptains } from '../../src/world/others/index.js';

const hero = (id, colour, x, z, extra = {}) => ({ id, colour, x, z, hp: 100, maxHp: 100, down: false, present: true, ...extra });
const figure = (id, colour, x, z) => ({ id, colour, x, z });

describe('matching the sim captains to the presence figures', () => {
  it('pairs each captain with the figure in its lobby colour near where the sim has it', () => {
    const party = [hero('p-me', 0, 0, 0), hero('p-ben', 1, 10, 4), hero('p-ana', 2, -6, 3, { down: true, hp: 0 })];
    const figures = [figure('live-captain-1', 1, 10.6, 4.2), figure('live-captain-2', 2, -6, 3), figure('live-captain-3', 3, 0, 0)];
    const matches = matchFigures({ party, figures, mine: 'p-me' });
    expect([...matches].map(([id, item]) => [id, item.id])).toEqual([['p-ana', 'live-captain-2'], ['p-ben', 'live-captain-1']]);
    // Only the fallen one hides; the standing one's hp bar goes over the figure.
    expect([...hiddenFigures(matches, party)]).toEqual(['live-captain-2']);
    expect(figurePositions(matches).get('p-ben')).toEqual({ x: 10.6, z: 4.2 });
  });

  it('never matches your own captain, a captain who is away, another colour or a figure out of reach', () => {
    const party = [hero('p-me', 1, 0, 0, { down: true }), hero('p-gone', 2, 5, 5, { present: false, down: true }),
      hero('p-far', 3, 0, 0, { down: true })];
    const figures = [figure('a', 1, 0, 0), figure('b', 2, 5, 5), figure('c', 3, FIGURE_REACH + .5, 0), figure('d', 4, 0, 0)];
    const matches = matchFigures({ party, figures, mine: 'p-me' });
    expect(matches.size).toBe(0);
    expect(hiddenFigures(matches, party).size).toBe(0);
    // A figure whose colour is not known yet (null) stays drawn.
    expect(matchFigures({ party: [hero('p-x', 0, 0, 0, { down: true })], figures: [figure('e', null, 0, 0)] }).size).toBe(0);
  });

  it('two captains in one colour (the colour not known yet): the nearest pairs win, one figure each', () => {
    const party = [hero('p-a', 0, 0, 0, { down: true }), hero('p-b', 0, 4, 0)];
    const figures = [figure('f1', 0, 3.8, 0), figure('f2', 0, .3, 0)];
    const matches = matchFigures({ party, figures });
    expect(matches.get('p-a').id).toBe('f2');
    expect(matches.get('p-b').id).toBe('f1');
    expect([...hiddenFigures(matches, party)]).toEqual(['f2']);
  });

  it('takes bad input without throwing', () => {
    expect(matchFigures().size).toBe(0);
    expect(matchFigures({ party: null, figures: null }).size).toBe(0);
    expect(matchFigures({ party: [hero('p', 0, Number.NaN, 0)], figures: [figure('f', 0, 0, 0)] }).size).toBe(0);
    expect(hiddenFigures(null, null).size).toBe(0);
    expect(figurePositions(null).size).toBe(0);
  });
});

describe('the presence figures hide a fallen captain and say where they stand', () => {
  const labelElement = () => ({ style: {}, dataset: {}, hidden: false, setAttribute() {}, remove() { this.parentElement?.removeChild(this); } });
  const element = () => ({ children: [], append(child) { this.children.push(child); child.parentElement = this; },
    removeChild(child) { this.children = this.children.filter(item => item !== child); }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) });
  const art = () => Object.fromEntries(['explorer', 'explorer-back', 'explorer-side'].map(id => [id, new THREE.MeshBasicMaterial({ map: new THREE.Texture() })]));
  const peer = (id, x, y) => ({ id, name: id, kit: { id: 'witness', name: 'Witness' }, place: 'home_islet', x, y, facing: 'front', moving: false, emote: null, at: 1000 });

  it('figures() gives the lobby colour and position; hide keeps the record but draws nothing', () => {
    const previous = globalThis.document; globalThis.document = { createElement: () => labelElement() };
    try {
      const scene = new THREE.Scene(), colours = { 'live-captain-1': 1, 'live-captain-2': 2 };
      const layer = createOtherCaptains(scene, element(), art(), true, { colourOf: id => colours[id] ?? null });
      layer.ingest({ sampledAt: 1000, others: [peer('live-captain-1', 10, 4), peer('live-captain-2', -6, 3), peer('live-captain-9', 1, 1)] });
      layer.update(0, { place: 'home_islet', player: { x: 0, y: 0 }, now: 1000 });
      const list = layer.figures();
      expect(list).toEqual(expect.arrayContaining([{ id: 'live-captain-1', x: 10, z: 4, colour: 1 }, { id: 'live-captain-2', x: -6, z: 3, colour: 2 },
        { id: 'live-captain-9', x: 1, z: 1, colour: null }]));
      const party = [hero('p-ben', 1, 10, 4), hero('p-ana', 2, -6, 3, { down: true })];
      const hide = hiddenFigures(matchFigures({ party, figures: list }), party);
      layer.update(0, { place: 'home_islet', player: { x: 0, y: 0 }, now: 1100, hide });
      const shown = {};
      scene.traverse(item => { if (item.userData.peerId) shown[item.userData.peerId] = item.parent.visible; });
      expect(shown).toEqual({ 'live-captain-1': true, 'live-captain-2': false, 'live-captain-9': true });
      expect(layer.figures().map(item => item.id)).toContain('live-captain-2');
      // Helped up: drawn again.
      layer.update(0, { place: 'home_islet', player: { x: 0, y: 0 }, now: 1200, hide: new Set() });
      scene.traverse(item => { if (item.userData.peerId === 'live-captain-2') expect(item.parent.visible).toBe(true); });
      layer.dispose();
    } finally { globalThis.document = previous; }
  });
});

describe('the hp bar of a teammate sits over their presence figure', () => {
  it('draws the bar at the figure when one is drawn, else where the sim has the captain', async () => {
    const { createWave } = await import('../../src/pirates/sim.js');
    const { createWaveRenderer, packAtlas } = await import('../../src/pirates/render.js');
    const scene = new THREE.Scene();
    const renderer = createWaveRenderer({ scene, atlas: { texture: new THREE.Texture(), ...packAtlas() }, defenses: [], fx: () => null });
    const state = { ...createWave({ seed: 1, wave: 1, weather: { ships: 1, fog: 0 }, defenses: [] }).state(),
      party: [hero('p-ben', 1, 5, 0)] };
    // The bar's dark back is 1.3 + 0.125 wide and starts 0.7125 left of the captain's x.
    const barStarts = () => {
      const air = renderer.root.children.find(item => item.name === 'pirates:air').geometry;
      const pos = air.getAttribute('iPos').array, size = air.getAttribute('iSize').array, starts = [];
      for (let i = 0; i < air.instanceCount; i++) if (Math.abs(size[i * 4] - 1.425) < 1e-6) starts.push(Math.round((pos[i * 4] + .7125) * 100) / 100);
      return starts;
    };
    renderer.update({ state, simTime: 0, dt: 0 });
    expect(barStarts()).toEqual([5]);
    renderer.update({ state, simTime: 0, dt: 0, figures: new Map([['p-ben', { x: 7.5, z: 0 }]]) });
    expect(barStarts()).toEqual([7.5]);
    renderer.dispose();
  });
});
