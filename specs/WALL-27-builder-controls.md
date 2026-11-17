# WALL-27 · Real wall-building controls and previews

> **What this is:** Island management controls wired to WALL-26's real quote/build lifecycle.
>
> **Who uses it:** Players constructing a full perimeter or internal wall compartments.

- **Status:** in progress; controller tests already exist, visible/runtime checks follow.
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Issue:** [WALL-27 #281](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/281).
- **Branch:** `feat/wall-27-builder-controls`, stacked on WALL-26 and retaining the camera's final fixes.

## Scope and contracts

Village mode gains a Build walls entry. The builder bar explains unchecked/checked/refused/unknown states, quoted total and pieces remaining after building. Buttons quote, build/retry, undo, clear and cancel through the actual controller. Pointer taps use the existing terrain projection. Ghosts reuse the current level-1 wall art, with exact 2×2 half-grid footprint lines; green is reserved for an accepted quote. Input and preview resources have one owner and are released on exit/dispose.

Files: new `wall-builder-bar.js`, `wall-builder-preview.js` and styles; small `index.js`, `village-bar.js` and `world.js` hooks; focused tests. Preserve camera callbacks, normal Move, wave/visit/reset context and existing accessibility behavior. W08's `layout:()=>target()?.layout` callback remains intact when integrated.

## Proof and limits

Actual controls must demonstrate snapped runs/turns, visible validity text, exact total, confirmed construction, refusal, lost-reply retry and cancellation. Required real-game before/after are 1280×720 and 375×812. Coordinate browser/full/build/budget/text/a11y/demo/overlap checks with the integration owner; no generated target is runtime evidence. Backend/SQL/fake integration remains separately owned. Do not claim full-perimeter completion until save/reload and real boarder enclosure/breach/gap proof pass.

Explain-back: UI drafts only propose geometry; the authoritative quote supplies IDs/price, and the immutable controller sends payment intent. Ghosts and grid lines do not own land, money or collision.

Questions: What does green mean? Why keep an unknown purchase after closing? Which resources and input handlers must disappear on exit?

No new dependency, live migration application, activation, main push, force push or merge. Human walkthrough/review remain pending.
