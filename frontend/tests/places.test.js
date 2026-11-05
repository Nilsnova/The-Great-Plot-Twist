// Fixed team ids and travel ownership are independent of rendering and the network.
import { describe, expect, it } from 'vitest';
import { places, placeIds, hotspotIds, lightIds } from '../src/world/places/registry.js';
import { createWorld } from '../src/world/places/manager.js';

describe('place contracts', () => {
  it('contains all seven places and exactly the agreed hotspot and light ids', () => {
    expect(placeIds).toEqual(['lighthouse_isle', 'saltreach_harbor', 'home_islet', 'smugglers_cove', 'wreck_point', 'the_teeth', 'gulls_rest']);
    expect(new Set(hotspotIds).size).toBe(34);
    expect(hotspotIds.slice().sort()).toEqual('cottage desk shore tower_door harbor_office harbor_office_window harbor_light ferry_pier jail market_hall prediction_kiosk sports_pavilion signal_station notice_board captains_table plot_1 plot_2 plot_3 plot_4 islet_signal_station back_room low_tide_cave arena_gate salvage_yard beach reef watchtower_ruin raid_arch fog_bank keepers_lamp keepers_post_room wall_of_lights home_driftline yard_gate'.split(' ').sort());
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
    expect(world.current.id).toBe('gulls_rest'); world.setRelightingComplete(false);
    expect(await world.goTo('home_islet')).toBe(true); world.dispose(); world.dispose();
    expect(destroyed).toEqual(['lighthouse_isle', 'saltreach_harbor', 'gulls_rest', 'home_islet']);
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

it('emits only valid current-place interactions and recovers an attachment failure without leaks', async () => {
  const events = [], destroyed = [];
  const world = createWorld({ emit: e => events.push(e), createPlace: async id => ({ ...fake(id, destroyed), zones: places[id].zones }),
    attach(place) { if (place.id === 'saltreach_harbor') throw new Error('Test attach failure'); } });
  await world.goTo('lighthouse_isle');
  expect(world.interact('desk')).toBe(true);
  expect(events.at(-1)).toEqual({ type: 'interact', id: 'desk', place: 'lighthouse_isle' });
  expect(world.interact('jail')).toBe(false);
  await expect(world.goTo('saltreach_harbor')).rejects.toThrow('Test attach failure');
  expect(world.current.id).toBe('lighthouse_isle'); expect(world.busy).toBe(false);
  expect(destroyed).toEqual(['lighthouse_isle', 'saltreach_harbor']); world.dispose();
});
