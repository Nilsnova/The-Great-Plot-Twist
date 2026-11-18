// A part loaded after the first frame hears the events it missed, in order, once; a failed load retries.
import {expect, it, vi} from 'vitest';
import {createLazyPart} from '../src/core/lazy-part.js';
import {emit, on} from '../src/core/events.js';

it('replays the kept events of the types the part subscribes to, in order and once, then hears them live', async () => {
  const heard = [];
  const part = createLazyPart({on, load: async () => ({}), build: (module, listen) => {
    listen('lazy_a', event => heard.push(`a${event.n}`));
    listen('lazy_b', event => heard.push(`b${event.n}`));
    return {};
  }});
  emit({type: 'lazy_a', n: 1}); emit({type: 'lazy_other', n: 2}); emit({type: 'lazy_b', n: 3}); emit({type: 'lazy_a', n: 4});
  expect(heard).toEqual([]);
  await part.start();
  expect(heard).toEqual(['a1', 'b3', 'a4']);
  emit({type: 'lazy_b', n: 5});
  expect(heard).toEqual(['a1', 'b3', 'a4', 'b5']);
  expect(await part.start()).toBe(part.part);
  part.dispose();
});

it('tries a failed load again and never builds after dispose', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  let tries = 0;
  const build = vi.fn(() => ({}));
  const part = createLazyPart({on, load: async () => { tries++; if (tries === 1) throw new Error('offline'); return {}; }, build});
  expect(await part.start()).toBeNull();
  expect(await part.start()).not.toBeNull();
  expect(tries).toBe(2);
  const late = createLazyPart({on, load: async () => ({}), build});
  late.dispose();
  expect(await late.start()).toBeNull();
  expect(build).toHaveBeenCalledTimes(1);
  part.dispose(); error.mockRestore();
});
