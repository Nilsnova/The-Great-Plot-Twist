// A fake standard gamepad for real-browser checks. The game reads navigator.getGamepads() on every frame, so a check can tilt the stick and press buttons with no hardware.
// Standard mapping: 0 is A, 1 is B, 3 is Y, 9 is Start, 12 to 15 are the D-pad (up, down, left, right).
export const PAD = {A: 0, B: 1, Y: 3, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15};

// Call this before page.goto, so the fake is there when the game starts.
export async function installGamepad(page) {
  await page.addInitScript(() => {
    const pad = {
      id: 'browser-check-pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({length: 17}, () => ({pressed: false, touched: false, value: 0})),
    };
    window.__fakePad = pad;
    Object.defineProperty(navigator, 'getGamepads', {configurable: true, value: () => [pad]});
  });
}

const frames = (page, count) => page.evaluate(async count => {
  for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
}, count);

// Tilts the left stick. x is right and y is down, both from -1 to 1. Pass 0 and 0 to let go.
export async function tiltStick(page, x, y) {
  await page.evaluate(([x, y]) => { window.__fakePad.axes[0] = x; window.__fakePad.axes[1] = y; }, [x, y]);
}

// Holds one button for a few frames, so the game sees it go down, then lets go.
export async function pressPad(page, index) {
  await page.evaluate(index => { window.__fakePad.buttons[index].pressed = true; }, index);
  await frames(page, 3);
  await page.evaluate(index => { window.__fakePad.buttons[index].pressed = false; }, index);
  await frames(page, 3);
}
