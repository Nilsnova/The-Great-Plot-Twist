# WALL-27 · Real wall-building controls and previews

> **What this is:** Island management controls wired to WALL-26's real quote/build lifecycle.
>
> **Who uses it:** Players constructing a full perimeter or internal wall compartments.

- **Status:** real controls and component checks implemented; integrated game/server/perimeter proof and human review remain.
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

## Executed component evidence

[Draft PR #296](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/296) stacks on WALL-26. The camera's final source/evidence commits are retained as normal cherry-picks; its roadmap handover and WALL-26's handover were both preserved during the documentation conflict resolution.

`npm --prefix frontend test -- --maxWorkers=1 tests/island/wall-builder-preview.test.js tests/island/wall-builder.test.js tests/island/move-mode.test.js tests/island/village-mode.test.js` passed **56 tests / 4 files**, duration **1.33s**, exit 0. Geometry checks cover exact projection/half-grid footprints, bounded reuse, quote color and owned-resource cleanup without disposing the borrowed wall texture.

With the coordinated Chromium slot: `CHROME_PATH=/usr/bin/chromium npm --prefix frontend test -- --maxWorkers=1 tests/island/wall-builder-dom.test.js` passed **2 tests / 1 file**, duration **3.54s**, exit 0. Real DOM controls fit 1280×720 and 375×812 with 44px targets and an accessible unknown/retry state. A real canvas click plus ArrowRight reached index/world/controller, drafted exact cells, obtained an ordered quote, confirmed it and restored village controls. This uses a declared local construction transport, not production SQL or full-game screenshots. The browser slot was released immediately.

Integrated server/fake/cohort behavior, full suite/build/budget/text/a11y/demo/overlap checks, actual-game before/after captures and full-ring save/reload/breach/gap evidence remain the coordinated integration owner's work. No production/Safari/physical-device result or merge is claimed.

### Confirmed reset and authoritative epoch follow-up

WALL-26 now requires the server quote's UUID `islandEpoch` in the immutable build intent and receipt. This is distinct from a private local reset generation in index.js: production island answers can omit the epoch even when the structures endpoint has one. A confirmed reset increments that local generation, advances the existing own-write guard and cancels the current display session. Travel/dispose cancel the session too. None of these local values grants permission or replaces the server reset fence.

The actual-index reset regression first failed with only the generation increment disabled: **1 failed / 4 filtered-out cases**, duration **3.46s**. Restoring it passed the whole Chromium component file: **5 tests / 1 file**, duration **6.66s**, exit 0. The new cases hold a pre-reset response, reset the same code without an islandEpoch field, reopen a fresh draft and verify the old reply cannot repaint walls or replace that draft. Actual registered travel/dispose paths also reject late painting. Both browser slots were released immediately.

Current focused geometry/controller/Move/village tests: **60 tests / 4 files**, duration **1.15s**, exit 0. Text lint initially found seven new-copy errors; the UI now uses existing reviewed words (including “Remove last”), with **0 errors / 8 existing report-only findings**. No dictionary exemption or assertion was weakened. Full-game/server/SQL/capture evidence remains the integration owner's work.

### Offer visibility follow-up

The game passes `perimeterWallsOn` from real ready configuration or the fake transport's actual flags. The village entry is shown when that flag is true or the own island is already admitted under wall rule 1. Existing admitted islands retain access to historical receipt reconciliation when new offers pause. This display condition is not permission and does not alter controller eligibility or the server's checks.

The component fixtures explicitly enable offers. Legacy/off hides the entry, flag-on shows it, and admitted rule 1 with flag-off still shows it. The full Chromium component file now passes **8 tests / 1 file**, duration **10.57s**, exit 0. Actual combined game/SQL/capture evidence remains separate.
