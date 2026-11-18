import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({paint: vi.fn()}));
vi.mock('../../src/art/textures.js', async original => ({...await original(), paintIds: mocks.paint}));
import {createBuildingPortrait} from '../../src/island/building-portrait.js';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.draws = []; this.width = 64; this.height = 64; }
  setAttribute() {}
  replaceChildren(...children) { this.children = children; }
  getContext() { return {scale() {}, save() {}, restore() {}, transform() {}, drawImage: (...args) => this.draws.push(args)}; }
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const value = level => ({kind: 'wall', level});
beforeEach(() => {
  vi.stubGlobal('document', {createElement: tag => new Element(tag)}); mocks.paint.mockReset();
  mocks.paint.mockImplementation(async (ids, density, visit) => {
    for (const id of ids) { const canvas = new Element('canvas'); canvas.villageArt = {id, file: 'village/actual-source.png', source: 'png'}; visit(id, canvas); }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared wall segment portrait', () => {
  it.each([1, 2, 3, 4, 5])('uses actual normalized tier %i post and material patches with all provenance receipts', async level => {
    const portrait = createBuildingPortrait(); portrait.render(value(level)); await settle();
    const id = `island-wall${level > 1 ? `-l${level}` : ''}`, expected = [id, ...['front', 'top', 'side'].map(face => `village-wall-${face}-l${level}`)];
    expect(mocks.paint.mock.calls[0].slice(0, 2)).toEqual([expected, 2]);
    const canvas = portrait.element.children[0]; expect(canvas.tagName).toBe('canvas');
    expect(canvas.villageArt).toMatchObject({id, source: 'png', composition: 'wall-segment'});
    expect(canvas.villageArt.components.map(source => source.id)).toEqual(expected);
    expect(canvas.draws).toHaveLength(5); expect(canvas.draws.slice(-2).map(draw => draw[0].villageArt.id)).toEqual([id, id]);
    portrait.render(value(level)); await settle(); expect(mocks.paint).toHaveBeenCalledOnce(); portrait.dispose();
  });
  it('keeps other buildings as their original frame without material composition', async () => {
    const portrait = createBuildingPortrait(); portrait.render({kind: 'cannon', level: 1}); await settle();
    expect(mocks.paint.mock.calls[0][0]).toEqual(['island-cannon']);
    expect(portrait.element.children[0].villageArt).toMatchObject({id: 'island-cannon', source: 'png'}); portrait.dispose();
  });
  it('stays neutral on a source failure and retries the same selection on an explicit render', async () => {
    mocks.paint.mockRejectedValueOnce(new Error('decode failed'));
    const portrait = createBuildingPortrait(); portrait.render(value(3)); await settle();
    expect(portrait.element.children[0].tagName).toBe('span');
    portrait.render(value(3)); await settle(); expect(portrait.element.children[0].villageArt.composition).toBe('wall-segment');
    expect(mocks.paint).toHaveBeenCalledTimes(2); portrait.dispose();
  });
  it('never revives after disposal or accepts an old selection completion', async () => {
    const pending = [], loadPortrait = vi.fn(() => new Promise(resolve => pending.push(resolve)));
    const portrait = createBuildingPortrait({loadPortrait}); portrait.render(value(1)); await settle(); portrait.render(value(3)); await settle();
    pending[0](new Element('old')); await settle(); expect(portrait.element.children[0].tagName).toBe('span');
    portrait.dispose(); pending[1](new Element('late')); await settle(); portrait.render(value(5)); await settle();
    expect(portrait.element.children[0].tagName).toBe('span'); expect(loadPortrait).toHaveBeenCalledTimes(2);
  });
});
