# G explain-back cards

Used with the [G lane page](../lanes/G.md) for Thu 19 and Sat 21 November 2026. Open source locally; find the named function/test in the current revision before opening the back. The original authored line ranges are historical orientation aids, not stable API references. Do not project server-only case data.

## 1. Load the world once — Easy

Open [frontend/src/main.js](../../frontend/src/main.js), lines 18–27 (`async function loadGame`).

**Front:** Explain these lines. Why keep both the loaded runtime and a pending promise?

<details>
<summary>Back — check your explanation</summary>

The runtime is reused after loading; the pending promise coalesces concurrent requests. A failed load clears the pending state so a later attempt can retry.

</details>

## 2. Keep diagonal speed bounded — Easy

Open [frontend/src/player/controller.js](../../frontend/src/player/controller.js), lines 5–25 (`export function createController`).

**Front:** Explain these lines. Explain the normalization of forward/right movement. What would diagonal movement do without it?

<details>
<summary>Back — check your explanation</summary>

The direction is divided by its magnitude before applying speed. Otherwise two full input axes would make diagonal movement faster. Collision supplies the actual movement used by animation.

</details>

## 3. Choose an overlapping hotspot — Medium

Open [frontend/src/world/zones.js](../../frontend/src/world/zones.js), lines 12–23 (`export function findZone`).

**Front:** Explain these lines. Why score distance relative to radius instead of taking the first matching zone?

<details>
<summary>Back — check your explanation</summary>

A small nearby interaction can win against a broad overlapping region. Registration order alone should not make the cottage swallow the desk interaction.

</details>

## 4. Preserve the pixel grid — Medium

Open [frontend/src/pixel/display.js](../../frontend/src/pixel/display.js), lines 2–5 (`export function pixelViewport`).

**Front:** Explain these lines. Explain the native buffer and integer scale. How does core/renderer.js use them?

<details>
<summary>Back — check your explanation</summary>

A stable native buffer, device-pixel-ratio-independent rendering and integer CSS scaling preserve crisp pixels. Nearest texture sampling prevents interpolation from blurring the art.

</details>

## 5. Find a route — Medium

Open [frontend/src/world/places/registry.js](../../frontend/src/world/places/registry.js), lines 42–54 (`export function routeTo`).

**Front:** Explain these lines. Explain the queue and visited set. How is a locked destination handled?

<details>
<summary>Back — check your explanation</summary>

Breadth-first search finds a shortest marked-leg route without cycling. Unknown or locked destinations are rejected; the supplied unlock state controls eligibility.

</details>

## 6. Recover a failed landing — Hard

Open [frontend/src/world/places/manager.js](../../frontend/src/world/places/manager.js), lines 3–42 (`export function createWorld`).

**Front:** Explain these lines. Trace a failed next-place attachment. What must the finally block release?

<details>
<summary>Back — check your explanation</summary>

The failed next place is disposed, the previous place is recreated/attached, and transition/busy state is released. Failure must not leave the player permanently locked or leak a place root.

</details>

## 7. Refuse a stale interaction — Safety / testing

Open [frontend/tests/places.test.js](../../frontend/tests/places.test.js), lines 47–58 (`it('emits only valid current-place`).

**Front:** Explain these lines. Find the stale/invalid hotspot checks. Can a jail interaction fire while on Lighthouse Isle?

<details>
<summary>Back — check your explanation</summary>

The manager checks the current place zones rather than trusting an old interaction identifier. Invalid interactions return false. Explain how the tests also check recovery and bounded live instances.

</details>

## 8. Dispose shared resources once — Safety / testing

Open [frontend/src/world/places/resources.js](../../frontend/src/world/places/resources.js), lines 9–24 (`export function createLifetime`).

**Front:** Explain these lines. Explain the sets and disposed guard, then open tests/place-lifetime.test.js. What assertion would catch a leak or double-dispose?

<details>
<summary>Back — check your explanation</summary>

Sets deduplicate shared resources; a guard makes repeated disposal harmless. Cleanup unsubscribes listeners and detaches the root. Tests count disposal events and verify resources and subscriptions are released once.

</details>

## 9. Return from a hidden tab — Medium

Open [frontend/src/core/loop.js](../../frontend/src/core/loop.js), lines 2–12 (`export function startLoop`).

**Front:** Explain these lines. Why skip hidden-tab updates and cap elapsed time? What stops the loop?

<details>
<summary>Back — check your explanation</summary>

A long pause must not become a giant movement/physics step. The delta cap bounds updates; cleanup cancels the scheduled animation frame.

</details>

## 10. Lose the gamepad safely — Safety / testing

Open [frontend/tests/gamepad.test.js](../../frontend/tests/gamepad.test.js), lines 1–10; follow the related cases named below.

**Front:** Explain these lines. Explain the missing/throwing gamepad API tests. What should still work?

<details>
<summary>Back — check your explanation</summary>

Unsupported or failed gamepad reads release gamepad movement instead of leaving a held direction. Keyboard/touch input remains usable; fake browser globals test those failure cases.

</details>
