// Input edge cases that prevent repeated interactions and stuck movement keys.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInput } from '../src/core/input.js';

afterEach(() => vi.unstubAllGlobals());
describe('keyboard input', () => {
  it('emits one E edge while held and clears movement on window blur', () => {
    const window = new EventTarget(), canvas = new EventTarget();
    vi.stubGlobal('window', window); vi.stubGlobal('HTMLElement', class {});
    const input = createInput(canvas);
    const key = (type, code) => window.dispatchEvent(Object.assign(new Event(type), { code }));
    key('keydown', 'KeyE'); expect(input.consume('KeyE')).toBe(true);
    key('keydown', 'KeyE'); expect(input.consume('KeyE')).toBe(false);
    key('keyup', 'KeyE'); key('keydown', 'KeyE'); expect(input.consume('KeyE')).toBe(true);
    key('keydown', 'KeyW'); expect(input.axis(['KeyW'], ['KeyS'])).toBe(1);
    key('keydown', 'KeyS'); expect(input.axis(['KeyW'], ['KeyS'])).toBe(0);
    window.dispatchEvent(new Event('blur')); expect(input.held.size).toBe(0);
    expect(input.consume('KeyW')).toBe(false); input.dispose();
    key('keydown', 'KeyW'); expect(input.held.size).toBe(0);
  });
});
