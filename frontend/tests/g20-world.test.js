// Travel graph and failure recovery contracts; no rendering, assets or network.
import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '../src/world/places/manager.js';
import { canTravel, placeIds, places, routeTo } from '../src/world/places/registry.js';

function setup(extra = {}) {
  const loads = [], instances = [];
  const ctx = { emit: vi.fn(), finishTransition: vi.fn(), cancelTransition: vi.fn(),
    disposeVisuals: vi.fn(), attach: vi.fn(),
    createPlace: vi.fn(async id => {
      loads.push(id);
      const place = { id, zones: places[id].zones, dispose: vi.fn(), update: vi.fn() };
      instances.push(place); return place;
    }), ...extra };
  return { world: createWorld(ctx), ctx, loads, instances };
}

describe('G20 registry paths', () => {
  it.each(placeIds)('routes both ways between the harbor and %s', id => {
    const path = routeTo('saltreach_harbor', id, true);
    expect(path[0]).toBe('saltreach_harbor'); expect(path.at(-1)).toBe(id);
    expect(routeTo(id, 'saltreach_harbor', true)).toEqual([...path].reverse());
  });
  it('follows every marked leg without loading intermediate islands', () => {
    expect(routeTo('home_islet', 'the_teeth')).toEqual(['home_islet', 'saltreach_harbor', 'wreck_point', 'the_teeth']);
    expect(routeTo(null, 'home_islet')).toEqual(['home_islet']);
    expect(routeTo('home_islet', 'home_islet')).toEqual(['home_islet']);
  });
  it.each(['unknown', '__proto__', 'constructor', 'toString'])('rejects non-place %s at both ends', id => {
    expect(canTravel(id, true)).toBe(false);
    expect(routeTo('home_islet', id, true)).toBeNull();
    expect(routeTo(id, 'home_islet', true)).toBeNull();
  });
  it('has no route to the removed Gull’s Rest', () => {
    expect(routeTo('the_teeth', 'gulls_rest')).toBeNull();
    expect(routeTo('gulls_rest', 'the_teeth')).toBeNull();
  });
});

describe('G20 world lifecycle', () => {
  it('makes blocked/same-place travel and blocked interactions side-effect free', async () => {
    let blocked = false;
    const { world, ctx, instances } = setup({ isBlocked: () => blocked });
    await world.goTo('home_islet'); ctx.emit.mockClear();
    expect(await world.goTo('home_islet')).toBe(false);
    blocked = true;
    expect(world.busy).toBe(true); expect(world.interact('plot_1')).toBe(false);
    expect(await world.goTo('saltreach_harbor')).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalled(); expect(instances[0].dispose).not.toHaveBeenCalled();
    blocked = false; expect(world.interact('plot_1')).toBe(true); world.dispose();
  });
  it.each(['loader', 'transition'])('restores departure after %s rejection and allows retry', async failure => {
    const { world, ctx, instances } = setup();
    await world.goTo('lighthouse_isle');
    if (failure === 'loader') ctx.createPlace.mockRejectedValueOnce(new Error('asset unavailable'));
    else ctx.transition = vi.fn().mockRejectedValueOnce(new Error('passage unavailable'));
    await expect(world.goTo('home_islet')).rejects.toThrow('unavailable');
    expect(instances[0].dispose).toHaveBeenCalledOnce();
    expect(world.current.id).toBe('lighthouse_isle'); expect(world.busy).toBe(false);
    expect(ctx.emit.mock.calls.filter(([e]) => e.type === 'arrived').map(([e]) => e.place)).toEqual(['lighthouse_isle']);
    expect(ctx.finishTransition).toHaveBeenCalledTimes(2);
    expect(await world.goTo('home_islet')).toBe(true); world.dispose();
  });
  it('cancels a pending passage without loading its destination after disposal', async () => {
    let finish;
    const { world, ctx, loads } = setup({ transition: () => new Promise(resolve => { finish = resolve; }) });
    await world.goTo('lighthouse_isle');
    const pending = world.goTo('home_islet'); world.dispose(); world.dispose(); finish();
    expect(await pending).toBe(false); expect(loads).toEqual(['lighthouse_isle']);
    expect(world.current).toBeNull(); expect(world.name).toBe('At sea');
    expect(ctx.cancelTransition).toHaveBeenCalledOnce(); expect(ctx.disposeVisuals).toHaveBeenCalledOnce();
    expect(await world.goTo('home_islet')).toBe(false);
  });
  it('forwards frame state and never offers the removed Gull’s Rest', async () => {
    const { world, instances } = setup(); await world.goTo('lighthouse_isle');
    const state = { night: true }; world.update(.25, state);
    expect(instances[0].update).toHaveBeenCalledWith(.25, state);
    expect(world.canTravel('gulls_rest')).toBe(false); expect(world.canTravel('home_islet')).toBe(true); world.dispose();
  });
});
