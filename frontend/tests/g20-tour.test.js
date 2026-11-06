// The real tour orchestrator with memory-only boundary doubles; G9 internals are not exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  story: { open: vi.fn(), perform: vi.fn(), close: vi.fn(), dispose: vi.fn() },
  screens: { open: vi.fn(async () => {}), close: vi.fn(), dispose: vi.fn() },
  adapter: { tick: vi.fn(), dispose: vi.fn(), dev: { rehearse: vi.fn() }, read: () => ({ effects: [{ name: 'three_lights', params: {} }] }) },
}));
vi.mock('../src/adapter/fake/index.js', () => ({ createFakeCaseAdapter: () => mocks.adapter }));
vi.mock('../src/screens/controller.js', () => ({ createCaseScreens: () => mocks.screens }));
vi.mock('../src/demo/story.js', () => ({ createDemoStory: () => mocks.story }));
import { createTour } from '../src/demo/tour.js';
import { tourSteps } from '../src/demo/logic.js';
import { getWeather, setWeather } from '../src/world/weather.js';
import { settings } from '../src/config.js';
let weather, hour, fetchSpy, storage, tours;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); weather = getWeather(); hour = settings.hour; tours = [];
  storage = { getItem: vi.fn(), setItem: vi.fn() }; fetchSpy = vi.fn(() => { throw new Error('Tour must stay offline'); });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: storage })); vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => { tours.forEach(tour => tour.dispose()); setWeather(weather); settings.hour = hour; vi.useRealTimers(); vi.unstubAllGlobals(); });
function position(x = 3, y = 1, z = 4) {
  return { x, y, z, clone() { return position(this.x, this.y, this.z); }, copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; }, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
}
function setup() {
  const ctx = { container: {}, world: { busy: false, current: { id: 'home_islet', zones: [] }, cinematic: vi.fn(async () => {}) },
    player: { position: position() }, chart: { close: vi.fn(), show: vi.fn() }, sailing: { skip: vi.fn() },
    hud: { start: vi.fn(), message: vi.fn() }, view: { setPlace: vi.fn() },
    begin: vi.fn(), announce: vi.fn(), progress: vi.fn(), caption: vi.fn(), cue: vi.fn(), skipCinematic: vi.fn(),
    resetInput: vi.fn(), focus: vi.fn(), captureCase: vi.fn(() => ({ marker: 'original presentation' })), restoreCase: vi.fn() };
  ctx.world.goTo = vi.fn(async id => { ctx.world.current = { id, zones: [{ id: 'cottage', x: 10, y: 1, z: 20 }] }; return true; });
  const tour = createTour(ctx); tours.push(tour); return { tour, ctx };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('G20 offline tour lifecycle', () => {
  it('refuses busy/reentrant/disposed starts without beginning a second rehearsal', async () => {
    const { tour, ctx } = setup(); ctx.world.busy = true; expect(tour.start()).toBe(false);
    ctx.world.busy = false; expect(tour.start()).toBe(true); expect(tour.start()).toBe(false);
    expect(ctx.begin).toHaveBeenCalledOnce(); await tour.stop(); tour.dispose(); expect(tour.start()).toBe(false);
  });
  it('advances through all nine timed beats offline and restores the original presentation', async () => {
    const { tour, ctx } = setup(), initial = getWeather(), initialHour = settings.hour;
    expect(tour.start()).toBe(true); const steps = [];
    for (const step of tourSteps) {
      expect(tour.step).toBe(step.id); steps.push(tour.step);
      await vi.advanceTimersByTimeAsync(step.seconds * 1000); tour.update(step.seconds); await flush();
    }
    expect(steps).toEqual(['intro', 'arrival', 'chart', 'harbor', 'board', 'fog', 'storm', 'finale', 'relighting']);
    expect(tour.active).toBe(false); expect(tour.step).toBeNull(); expect(getWeather()).toEqual(initial); expect(settings.hour).toBe(initialHour);
    expect(ctx.world.current.id).toBe('home_islet'); expect(ctx.player.position).toMatchObject({ x: 3, y: 1, z: 4 });
    expect(ctx.restoreCase).toHaveBeenCalledWith({ marker: 'original presentation' });
    expect(mocks.story.perform.mock.calls).toEqual([['to_desk'], ['read_log']]);
    expect(ctx.world.cinematic.mock.calls.map(call => call[0])).toEqual(['three_lights', 'relighting']);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('Space ignores repeats, cancels intro timers and restores the saved position on early stop', async () => {
    const { tour, ctx } = setup(); tour.start();
    window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space', repeat: true }));
    expect(tour.step).toBe('intro');
    const event = Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space', repeat: false });
    window.dispatchEvent(event); await flush(); expect(event.defaultPrevented).toBe(true); expect(tour.step).toBe('arrival');
    await tour.stop(); await vi.advanceTimersByTimeAsync(20000);
    expect(mocks.story.perform).not.toHaveBeenCalled(); expect(tour.active).toBe(false);
    expect(ctx.player.position).toMatchObject({ x: 3, y: 1, z: 4 }); expect(ctx.focus).toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('disposes pending waits and removes its Space handler without late work', async () => {
    const { tour, ctx } = setup(); tour.start(); tour.dispose(); const calls = ctx.announce.mock.calls.length;
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Space' }));
    await vi.advanceTimersByTimeAsync(20000);
    expect(mocks.story.perform).not.toHaveBeenCalled(); expect(ctx.announce).toHaveBeenCalledTimes(calls);
    expect(tour.active).toBe(false); expect(tour.step).toBeNull(); expect(mocks.screens.dispose).toHaveBeenCalled();
  });
});
