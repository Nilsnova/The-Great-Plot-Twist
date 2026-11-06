import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHarborLife } from '../src/world/ambient/harbor-life.js';

function fakeIslet() {
  let listener;
  return {
    store: { getBuilt: () => ['plot_1'], subscribe(fn) { listener = fn; fn(['plot_1']); return () => { listener = null; }; } },
    set(ids) { listener?.(ids, { preview: true }); },
    get hasListener() { return !!listener; },
  };
}

describe('harbor ambient life', () => {
  it('shows smoke and night window for the cabin and only shows roof birds when the greenhouse exists', () => {
    const place = { id: 'home_islet', group: new THREE.Group() }, islet = fakeIslet();
    const life = createHarborLife({ place, ctx: { isletState: islet.store, reducedMotion: true } });
    const smoke = place.group.children.find(mesh => mesh.isPoints);
    const window = place.group.children.find(mesh => mesh.isMesh);
    const birds = place.group.children.find(mesh => mesh.isLineSegments);
    expect(smoke.visible).toBe(true); expect(birds.visible).toBe(false);
    life.update(1 / 60, { night: 1 }); expect(window.material.opacity).toBeCloseTo(.48);
    islet.set(['plot_1', 'plot_4']); life.update(1 / 60, { night: 1 }); expect(birds.visible).toBe(true);
    life.update(1, { night: 0 }); expect(window.material.opacity).toBe(0);
    life.dispose(); expect(islet.hasListener).toBe(false);
  });

  it('hides extra harbor gulls in fog and keeps their geometry pooled', () => {
    const place = { id: 'saltreach_harbor', group: new THREE.Group() };
    const life = createHarborLife({ place, ctx: { reducedMotion: true } });
    const gulls = place.group.children[0], geometry = gulls.geometry, position = gulls.position.clone();
    life.update(1, { weather: { fog: .7 } }); expect(gulls.visible).toBe(false);
    life.update(1, { weather: { fog: 0 } }); expect(gulls.visible).toBe(true);
    expect(gulls.geometry).toBe(geometry); expect(gulls.position.toArray()).toEqual(position.toArray());
    life.dispose();
  });
});
