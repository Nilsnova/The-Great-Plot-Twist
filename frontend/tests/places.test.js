// Fixed team ids and travel ownership are independent of rendering and the network.
import { describe, expect, it } from 'vitest';
import { places, placeIds, hotspotIds, lightIds } from '../src/world/places/registry.js';
import { createWorld } from '../src/world/places/manager.js';

describe('place contracts', () => {
  it('contains all six places and exactly the agreed hotspot and light ids', () => {
    expect(placeIds).toEqual(['lighthouse_isle', 'saltreach_harbor', 'home_islet', 'smugglers_cove', 'wreck_point', 'the_teeth']);
    expect(new Set(hotspotIds).size).toBe(9);
    expect(hotspotIds.slice().sort()).toEqual('market_hall prediction_kiosk sports_pavilion plot_1 plot_2 plot_3 plot_4 islet_signal_station raid_arch'.split(' ').sort());
    expect(lightIds).toEqual(['keepers_lamp', 'harbor_light', 'islet_signal_station', 'ruin_light']);
    expect(Object.keys(places.lighthouse_isle.anchors)).toEqual(['stairwell', 'lamp_room']);
  });
  it('refuses an unknown or removed destination without events or disposal', async () => {
    const events = [], destroyed = [];
    const world = createWorld({ emit: e => events.push(e), createPlace: async id => fake(id, destroyed) });
    await world.goTo('lighthouse_isle'); events.length = 0;
    expect(await world.goTo('gulls_rest')).toBe(false);
    expect(await world.goTo('missing')).toBe(false);
    expect(events).toEqual([]); expect(destroyed).toEqual([]);
    expect(world.current.id).toBe('lighthouse_isle'); world.dispose();
  });
  it('holds one place and emits exact payloads', async () => {
    const events = [], destroyed = [];
    const world = createWorld({ emit: e => events.push(e), createPlace: async id => fake(id, destroyed) });
    await world.goTo('lighthouse_isle');
    await world.goTo('saltreach_harbor');
    expect(events.slice(-2)).toEqual([{ type: 'travel', to: 'saltreach_harbor' }, { type: 'arrived', place: 'saltreach_harbor' }]);
    expect(destroyed).toEqual(['lighthouse_isle']);
    expect(await world.goTo('home_islet')).toBe(true); world.dispose(); world.dispose();
    expect(destroyed).toEqual(['lighthouse_isle', 'saltreach_harbor', 'home_islet']);
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
  await world.goTo('home_islet');
  expect(world.interact('plot_1')).toBe(true);
  expect(events.at(-1)).toEqual({ type: 'interact', id: 'plot_1', place: 'home_islet' });
  expect(world.interact('market_hall')).toBe(false);
  await expect(world.goTo('saltreach_harbor')).rejects.toThrow('Test attach failure');
  expect(world.current.id).toBe('home_islet'); expect(world.busy).toBe(false);
  expect(destroyed).toEqual(['home_islet', 'saltreach_harbor']); world.dispose();
});

it('waits for an existing trip to finish before a caller starts the next passage',async()=>{let finish;const destroyed=[],world=createWorld({createPlace:id=>new Promise(resolve=>{finish=()=>resolve(fake(id,destroyed));}),emit(){}});const trip=world.goTo('lighthouse_isle');let idle=false;const wait=world.whenIdle().then(()=>{idle=true;});await Promise.resolve();expect(idle).toBe(false);finish();await trip;await wait;expect(idle).toBe(true);expect(world.current.id).toBe('lighthouse_isle');world.dispose();});
