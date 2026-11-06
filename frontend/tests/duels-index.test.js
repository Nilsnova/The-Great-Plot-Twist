// Lantern Duels, the lazy entry (src/screens/duels/index.js): openArena() builds one panel and opens
// it, and isArenaOpen() tells the game whether the panel is on screen. The game uses that answer to
// treat the open panel as an overlay, so Escape closes the panel instead of opening the pause menu
// and the gamepad and hotkeys leave the explorer alone. The real panel needs a DOM, which Vitest
// does not have here, so a small stand-in panel replaces it. The real dialog is checked by hand
// (src/screens/duels/README.md, "Manual checks").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const panels = vi.hoisted(() => []);

vi.mock('../src/screens/duels/panel.js', () => ({
  createPanel: (ctx, adapter, onGone) => {
    const panel = {
      element: { open: false },
      gone: false,
      isGone: () => panel.gone,
      open() { panel.element.open = true; },
      // What the real panel does when the game removes it: it tells index.js through onGone.
      shutDown() { panel.gone = true; onGone(); },
    };
    panels.push(panel);
    return panel;
  },
}));
vi.mock('../src/screens/duels/http-adapter.js', () => ({ createHttpAdapter: () => ({ stand: 'in' }) }));

const CTX = { container: {}, resetInput() {}, focus() {} };

// A fresh copy of index.js for every test, because the panel lives in module state.
async function freshEntry() {
  vi.resetModules();
  return import('../src/screens/duels/index.js');
}

beforeEach(() => {
  panels.length = 0;
  vi.stubGlobal('location', { search: '' }); // development mode reads ?arena=local from the address
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isArenaOpen', () => {
  it('is false before the player has ever opened the ring', async () => {
    const { isArenaOpen } = await freshEntry();

    expect(isArenaOpen()).toBe(false);
  });

  it('is true while the panel is open', async () => {
    const { openArena, isArenaOpen } = await freshEntry();

    await openArena(CTX);

    expect(isArenaOpen()).toBe(true);
  });

  it('is false again once the player closes the dialog', async () => {
    const { openArena, isArenaOpen } = await freshEntry();
    await openArena(CTX);

    panels[0].element.open = false;

    expect(isArenaOpen()).toBe(false);
  });

  it('is false after the game shut the panel down', async () => {
    const { openArena, isArenaOpen } = await freshEntry();
    await openArena(CTX);

    panels[0].shutDown();

    expect(isArenaOpen()).toBe(false);
  });

  it('is false for a panel that says it is gone, even if its dialog still says open', async () => {
    const { openArena, isArenaOpen } = await freshEntry();
    await openArena(CTX);

    panels[0].gone = true; // gone, and index.js has not heard about it yet

    expect(isArenaOpen()).toBe(false);
  });
});

describe('openArena', () => {
  it('builds one panel for two quick presses', async () => {
    const { openArena } = await freshEntry();

    await Promise.all([openArena(CTX), openArena(CTX)]);

    expect(panels).toHaveLength(1);
  });

  it('opens the same panel again after it was closed', async () => {
    const { openArena, isArenaOpen } = await freshEntry();
    await openArena(CTX);
    panels[0].element.open = false;

    await openArena(CTX);

    expect(panels).toHaveLength(1);
    expect(isArenaOpen()).toBe(true);
  });

  it('builds a fresh panel after the game shut the old one down', async () => {
    const { openArena, isArenaOpen } = await freshEntry();
    await openArena(CTX);
    panels[0].shutDown();

    await openArena(CTX);

    expect(panels).toHaveLength(2);
    expect(isArenaOpen()).toBe(true);
  });
});
