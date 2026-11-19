import {describe, expect, it, vi} from 'vitest';
import {createVillagePlacementFocus} from '../../src/player/village-placement-focus.js';

describe('placement camera intent', () => {
  it('focuses a Move anchor once, then preserves explicit Fit and manual panning until a new intent', () => {
    const view = {focusVillage: vi.fn()}, focus = createVillagePlacementFocus(view);
    const state = {spotId: 'cannon_1', x: -12.5, z: -14.5, message: ''};
    focus(state); focus({...state, busy: true}); focus({...state, ok: false});
    expect(view.focusVillage.mock.calls).toEqual([[{x: -12.5, z: -14.5, lift: 1}]]);
    focus({...state, x: -12}); focus({...state, x: -12, message: 'A wave is under way.'});
    expect(view.focusVillage).toHaveBeenCalledTimes(3);
    focus(null); focus(state); expect(view.focusVillage).toHaveBeenCalledTimes(4);
  });
  it('focuses the last wall draft cell but ignores quote/busy repaint and malformed/empty anchors', () => {
    const view = {focusVillage: vi.fn()}, focus = createVillagePlacementFocus(view);
    const cells = [{x: 1, z: 2}, {x: 2, z: 2}];
    focus({cells}); focus({cells, busy: true, phase: 'quoted', quote: {totalCost: 20}});
    expect(view.focusVillage.mock.calls).toEqual([[{x: 2, z: 2, lift: 1}]]);
    focus({cells: [...cells, {x: 2.5, z: 2}]});
    for (const invalid of [{cells: []}, {spotId: 'wall_1', x: NaN, z: 1}, {}]) focus(invalid);
    expect(view.focusVillage).toHaveBeenCalledTimes(2);
  });
  it('focuses a historical battle position without a building selection', () => {
    const view = {focusVillage: vi.fn()}, focus = createVillagePlacementFocus(view);
    const location = {x: -18.5, z: -1, positionOnly: true};
    focus(location); focus({...location});
    expect(view.focusVillage.mock.calls).toEqual([[{x: -18.5, z: -1, lift: 1}]]);
    focus({...location, positionOnly: false});
    expect(view.focusVillage).toHaveBeenCalledTimes(1);
  });
});
