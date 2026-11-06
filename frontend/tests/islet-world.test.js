import { describe, expect, it } from 'vitest';
import { builtFromIsletChanged, createIsletState, isletPlots } from '../src/world/islet/state.js';

describe('home-islet world state', () => {
  it('accepts only known built plot ids and a consistent station flag', () => {
    expect(builtFromIsletChanged({ type: 'islet_changed', built: ['plot_1', 'plot_2'], signalStationBuilt: false }))
      .toEqual(['plot_1', 'plot_2']);
    expect(builtFromIsletChanged({ type: 'islet_changed', built: ['plot_1', 'mystery'], signalStationBuilt: false })).toBeNull();
    expect(builtFromIsletChanged({ type: 'islet_changed', built: ['plot_1', 'plot_1'], signalStationBuilt: false })).toBeNull();
    expect(builtFromIsletChanged({ type: 'islet_changed', built: ['plot_1', 'islet_signal_station'], signalStationBuilt: false })).toBeNull();
    expect(builtFromIsletChanged({ type: 'islet_changed', built: ['plot_2'], signalStationBuilt: false })).toBeNull();
  });

  it('starts with cabin only, retains server changes while previewing, and restores the latest server state', () => {
    let listener;
    const store = createIsletState({ on: (type, fn) => { expect(type).toBe('islet_changed'); listener = fn; return () => { listener = null; }; } });
    expect(store.getBuilt()).toEqual(['plot_1']);
    store.previewBuilt(['plot_1', 'plot_3', 'islet_signal_station']);
    listener({ type: 'islet_changed', built: ['plot_1', 'plot_2'], signalStationBuilt: false });
    expect(store.getBuilt()).toEqual(['plot_1', 'plot_3', 'islet_signal_station']);
    expect(store.getLatestBuilt()).toEqual(['plot_1', 'plot_2']);
    store.clearPreview();
    expect(store.getBuilt()).toEqual(['plot_1', 'plot_2']);
    store.dispose(); expect(listener).toBeNull();
  });

  it('delivers cloned built lists with preview metadata and ignores writes after disposal', () => {
    let listener;
    const store = createIsletState({ on: (_type, fn) => { listener = fn; return () => { listener = null; }; } });
    const seen = [];
    store.subscribe((built, meta) => { seen.push({ built, meta }); if (seen.length === 1) built.push('corruption'); });
    expect(store.getBuilt()).toEqual(['plot_1']);
    store.previewBuilt(['plot_1', 'plot_3']);
    expect(seen.at(-1)).toEqual({ built: ['plot_1', 'plot_3'], meta: { preview: true } });
    seen.at(-1).built.push('corruption');
    expect(store.getBuilt()).toEqual(['plot_1', 'plot_3']);
    listener({ type: 'islet_changed', built: ['plot_1', 'plot_2'], signalStationBuilt: false });
    expect(seen.at(-1)).toEqual({ built: ['plot_1', 'plot_3'], meta: { preview: true } });
    store.clearPreview();
    expect(seen.at(-1)).toEqual({ built: ['plot_1', 'plot_2'], meta: { preview: false } });
    const beforeDispose = seen.length;
    store.dispose();
    expect(store.previewBuilt(['plot_1', 'plot_4'])).toBe(false);
    store.clearPreview();
    expect(seen).toHaveLength(beforeDispose);
    expect(store.getBuilt()).toEqual(['plot_1', 'plot_2']);
    let lateCalls = 0; store.subscribe(() => lateCalls++);
    expect(lateCalls).toBe(0);
  });

  it('keeps the catalogue-derived visual spots explicit', () => {
    expect(Object.keys(isletPlots)).toEqual(['plot_1', 'plot_2', 'plot_3', 'plot_4', 'islet_signal_station']);
    expect(isletPlots.plot_3.locked).toBe(true); expect(isletPlots.plot_4.locked).toBe(true);
  });
});
