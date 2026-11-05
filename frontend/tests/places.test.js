// Fixed team ids and travel ownership are independent of rendering and the network.
import { describe, expect, it } from 'vitest';
import { places, placeIds, hotspotIds, lightIds } from '../src/world/places/registry.js';
import { createWorld } from '../src/world/places/manager.js';

describe('place contracts', () => {
  it('contains all seven places and exactly the agreed hotspot and light ids', () => {
    expect(placeIds).toEqual(['lighthouse_isle', 'saltreach_harbor', 'home_islet', 'smugglers_cove', 'wreck_point', 'the_teeth', 'gulls_rest']);
    expect(new Set(hotspotIds).size).toBe(29);
    expect(hotspotIds).toHaveLength(29);
    expect(lightIds).toEqual(['keepers_lamp', 'harbor_light', 'islet_signal_station', 'ruin_light']);
    expect(Object.keys(places.lighthouse_isle.anchors)).toEqual(['stairwell', 'lamp_room']);
  });
  it('refuses a locked or unknown destination without events or disposal', async () => {
    const events = [], destroyed = [];
    const world = createWorld({ emit: e => events.push(e), createPlace: async id => fake(id, destroyed) });
    await world.goTo('lighthouse_isle'); events.length = 0;
    expect(await world.goTo('gulls_rest')).toBe(false);
    expect(await world.goTo('missing')).toBe(false);
    expect(events).toEqual([]); expect(destroyed).toEqual([]);
    expect(world.current.id).toBe('lighthouse_isle'); world.dispose();
  });
  it('holds one place, emits exact payloads, and unlocks only through the integration gate', async () => {
    const events = [], destroyed = [];
    const world = createWorld({ emit: e => events.push(e), createPlace: async id => fake(id, destroyed) });
    await world.goTo('lighthouse_isle');
    await world.goTo('saltreach_harbor');
    expect(events.slice(-2)).toEqual([{ type: 'travel', to: 'saltreach_harbor' }, { type: 'arrived', place: 'saltreach_harbor' }]);
    expect(destroyed).toEqual(['lighthouse_isle']);
    world.setRelightingComplete(true); await world.goTo('gulls_rest');
    expect(world.current.id).toBe('gulls_rest'); world.dispose(); world.dispose();
    expect(destroyed).toEqual(['lighthouse_isle', 'saltreach_harbor', 'gulls_rest']);
  });
  it('rejects overlapping trips and disposes a late load after shutdown', async () => {
    let finish; const destroyed = [], events = [];
    const world = createWorld({ emit: e => events.push(e), createPlace: id => new Promise(resolve => { finish = () => resolve(fake(id, destroyed)); }) });
    const pending = world.goTo('lighthouse_isle');
    expect(await world.goTo('saltreach_harbor')).toBe(false);
    world.dispose(); finish(); await pending;
    expect(world.current).toBe(null); expect(destroyed).toEqual(['lighthouse_isle']);
    expect(events.some(e => e.type === 'arrived')).toBe(false);
  });
});
function fake(id, destroyed) { return { id, dispose() { destroyed.push(id); } }; }
