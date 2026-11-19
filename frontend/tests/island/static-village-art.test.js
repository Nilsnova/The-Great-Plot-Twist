import {afterEach, expect, it, vi} from 'vitest';
import * as THREE from 'three';
vi.mock('../../src/art/village-families.js', async () => ({villageFamilies: [await import('../../src/art/village/landmarks.js'), await import('../../src/art/village/services.js')]}));
vi.mock('../../src/art/textures.js', async () => { const T = await import('three'); return {frameCanvas: () => ({}), smoothTexture: () => new T.Texture(), spriteMaterial: map => new T.MeshBasicMaterial({map})}; });
vi.mock('../../src/island/decorations.js', () => ({decorateProgress: () => ({apply() {}, dispose() {}})}));
vi.mock('../../src/island/structure-recovery-indicators.js', () => ({createStructureRecoveryIndicators: () => ({setState() {}, update() {}, dispose() {}})}));
import {decorateIsland} from '../../src/island/world.js';
import {createArtworkTasks, createStaticVillageArt} from '../../src/island/static-village-art.js';
import {createVillageArtNotice} from '../../src/ui/village-art-notice.js';
import {campaignOf} from '../../src/campaign/index.js';
import {BELL, ARSENAL} from '../../src/island/spots.js';
const flush = () => new Promise(setImmediate);
const material = () => new THREE.MeshBasicMaterial({map: new THREE.Texture()});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const state = (arsenal = false, waveBest = 40) => ({spots: [{id: 'house_1', kind: 'house', built: true, level: 1}], arsenal, campaign: campaignOf({waveBest})});
const start = (loadArt, fields = {}) => { const place = {group: new THREE.Group(), colliders: [], zones: []}; return {place, drawing: decorateIsland(place, {loadArt, loadWallAtlas: async () => null, ...fields})}; };
afterEach(() => vi.unstubAllGlobals());

it('prepares static bell/tech art at the same ground foot and keeps authoritative campaign/service visibility', async () => {
  const requests = [], load = vi.fn(ids => { const work = deferred(); requests.push({ids, ...work}); return work.promise; }), {drawing} = start(load);
  drawing.apply(state()); await flush();
  const bell = drawing.root.getObjectByName('island-bell'), tech = drawing.root.getObjectByName('island-campaign:island_techhub:island-techhub');
  const original = bell.position.clone(), bellMap = material(), techMap = material();
  expect(requests.some(row => row.ids.includes(ARSENAL.art))).toBe(false); expect(drawing.root.getObjectByName('island-arsenal')).toBeUndefined();
  requests.find(row => row.ids.length === 1 && row.ids[0] === 'island-bell').resolve({'island-bell': bellMap});
  requests.find(row => row.ids.length === 1 && row.ids[0] === 'island-techhub').resolve({'island-techhub': techMap}); await flush();
  expect(bell.material).toBe(bellMap); expect(bell.position.equals(original)).toBe(true); expect(bell.userData.ground).toEqual({x: BELL.x, z: BELL.z});
  bell.geometry.computeBoundingBox(); expect(bell.geometry.parameters).toMatchObject({width: 3.5, height: 4.5});
  expect(bell.geometry.boundingBox.min.y).toBe(-.5); expect(bell.geometry.boundingBox.max.y).toBe(4); expect(tech.material).toBe(techMap); expect(tech.visible).toBe(true);
  drawing.ring(); drawing.update(.1); expect(bell.rotation.z).toBe(0);
  drawing.apply(state(true, 0)); await flush(); expect(tech.visible).toBe(false);
  const service = drawing.root.getObjectByName('island-arsenal'), wait = requests.find(row => row.ids.length === 1 && row.ids[0] === ARSENAL.art), arsenalMap = material();
  expect(service.visible).toBe(true); drawing.apply(state(false)); wait.resolve({[ARSENAL.art]: arsenalMap}); await flush();
  expect(service.visible).toBe(false); expect(service.material).toBe(arsenalMap); drawing.apply(state(true)); expect(service.visible).toBe(true);
  expect(drawing.root.children.filter(mesh => mesh.name === 'island-arsenal')).toHaveLength(1); expect(load.mock.calls.filter(([ids]) => ids.includes(ARSENAL.art))).toHaveLength(1); drawing.dispose();
});

it('reports main artwork failure, coalesces actual retries and clears the failure only after success', async () => {
  let fail = true; const errors = [], views = [], next = deferred();
  const load = vi.fn(async ids => {
    if (ids.length > 1) { if (fail) throw new Error('Private transport details'); await next.promise; }
    return Object.fromEntries(ids.map(id => [id, material()]));
  });
  const {drawing} = start(load, {onArtError: error => errors.push(error), onArtState: value => views.push(value)});
  drawing.apply(state()); await flush(); expect(errors).toHaveLength(1); expect(drawing.root.userData.artError).toBe('Island artwork unavailable');
  expect(views.at(-1).failed).toEqual(['buildings']); fail = false;
  const a = drawing.retryArt(), b = drawing.retryArt(); await flush();
  expect(load.mock.calls.filter(([ids]) => ids.length > 1)).toHaveLength(2); expect(views.at(-1).failed).toEqual(['buildings']);
  next.resolve(); await Promise.all([a, b]); expect(drawing.root.userData.artError).toBeNull(); expect(views.at(-1).failed).toEqual([]);
  expect(drawing.root.getObjectByName('island-house:house_1').userData.art).toBe('island-house'); drawing.dispose();
});

it('keeps a failed registered static frame actionable and swaps it exactly once on a successful retry', async () => {
  const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material()); root.add(mesh);
  const views = [], onError = vi.fn(), tasks = createArtworkTasks(value => views.push(value), onError), next = deferred(), loaded = material();
  const load = vi.fn().mockRejectedValueOnce(new Error('Unavailable image')).mockImplementation(() => next.promise);
  const art = createStaticVillageArt({root, tasks, load, registered: id => id === 'bell', sizes: {bell: [3.5, 4.5, 8 / 72]}});
  art.track(mesh, 'bell'); await flush(); expect(onError).toHaveBeenCalledOnce(); expect(views.at(-1).failed).toEqual(['static:bell']); expect(mesh.userData.art).toBeUndefined();
  const a = art.retry(), b = art.retry(); await flush(); expect(load).toHaveBeenCalledTimes(2); next.resolve({bell: loaded}); await Promise.all([a, b]);
  expect(mesh.material).toBe(loaded); expect(mesh.userData.art).toBe('bell'); expect(root.children).toEqual([mesh]); expect(views.at(-1).failed).toEqual([]);
  art.dispose(); tasks.dispose();
});

it('disposes late static completion once and cannot swap, reattach, report or retry after disposal', async () => {
  const pending = deferred(), root = new THREE.Group(), old = material(), mesh = new THREE.Mesh(new THREE.PlaneGeometry(), old); root.add(mesh);
  const onChange = vi.fn(), tasks = createArtworkTasks(onChange), load = vi.fn(() => pending.promise), art = createStaticVillageArt({root, tasks, load, registered: () => true, sizes: {bell: [3.5, 4.5, 8 / 72]}});
  art.track(mesh, 'bell'); await flush(); tasks.dispose(); art.dispose(); const calls = onChange.mock.calls.length, loaded = material();
  const mapDispose = vi.spyOn(loaded.map, 'dispose'), materialDispose = vi.spyOn(loaded, 'dispose'); pending.resolve({bell: loaded}); await flush();
  await art.retry(); art.dispose(); expect(load).toHaveBeenCalledOnce(); expect(mesh.material).toBe(old); expect(root.children).toEqual([mesh]);
  expect(mapDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(onChange).toHaveBeenCalledTimes(calls);
});

it('keeps a borrowed placeholder map alive and removes only prepared owned resources before place traversal', async () => {
  const root = new THREE.Group(), shared = new THREE.Texture(), old = new THREE.MeshBasicMaterial({map: shared}), other = new THREE.MeshBasicMaterial({map: shared});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), old), neighbor = new THREE.Mesh(new THREE.PlaneGeometry(), other); root.add(mesh, neighbor);
  const loaded = material(), tasks = createArtworkTasks(), art = createStaticVillageArt({root, tasks, load: async () => ({bell: loaded}), registered: () => true, sizes: {bell: [3.5, 4.5, 8 / 72]}});
  const borrowedDispose = vi.spyOn(shared, 'dispose'), oldDispose = vi.spyOn(old, 'dispose'), mapDispose = vi.spyOn(loaded.map, 'dispose'), materialDispose = vi.spyOn(loaded, 'dispose');
  art.track(mesh, 'bell'); await flush(); expect(borrowedDispose).not.toHaveBeenCalled(); expect(oldDispose).toHaveBeenCalledOnce();
  const geometryDispose = vi.spyOn(mesh.geometry, 'dispose'); art.dispose(); art.dispose(); tasks.dispose();
  expect(root.children).toEqual([neighbor]); expect(geometryDispose).toHaveBeenCalledOnce(); expect(mapDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce(); expect(borrowedDispose).not.toHaveBeenCalled();
});

it('wires visible actionable failure/loading/clear states without exposing raw errors or reviving disposed UI', () => {
  const element = () => ({children: [], textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
    append(...nodes) { this.children.push(...nodes); for (const node of nodes) node.parent = this; },
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }, remove() { this.parent.children = this.parent.children.filter(node => node !== this); }});
  const container = element(), retry = vi.fn(), focus = vi.fn(); let active = true; vi.stubGlobal('document', {createElement: element, activeElement: null});
  const notice = createVillageArtNotice({container, retry, focus, isActive: () => active}), [aside] = container.children, [message, button] = aside.children;
  notice.set({failed: ['buildings'], pending: []}); expect(aside.hidden).toBe(false); expect(message.attributes.role).toBe('status'); expect(button.textContent).toBe('Retry artwork');
  button.onclick(); expect(retry).toHaveBeenCalledOnce(); notice.set({failed: ['buildings'], pending: ['buildings']}); expect(button.disabled).toBe(true); button.onclick(); expect(retry).toHaveBeenCalledOnce();
  document.activeElement = button; active = false; notice.update(); expect(aside.hidden).toBe(true); expect(focus).toHaveBeenCalledOnce(); active = true;
  notice.set({failed: [], pending: []}); expect(aside.hidden).toBe(true); notice.dispose(); notice.dispose(); notice.set({failed: ['buildings'], pending: []}); expect(container.children).toEqual([]); expect(button.onclick).toBeNull();
});
