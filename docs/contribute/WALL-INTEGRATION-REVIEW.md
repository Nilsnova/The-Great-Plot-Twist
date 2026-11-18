# Wall integration review

Focused VIS69 review for Johannes Franz Lang (`frcola`), based on current main `840549a5`.

The user requests multiple visual passes, working wall placement, a maximum of three defensive rows per existing attack approach, and a concise GitHub review queue. The twelve original wall spots, five upgrade levels and existing build, defense and high-score loop remain the product boundary. The separate 128-piece perimeter programme is not part of this pass.

Parent task: [VIS69 #469](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/469).

The local follow-up includes the revised rendering, purchase feedback, collision fix and matched Chrome journeys. [Local review and screenshots](../evidence/VIS-69-local-walls/README.md)

## Local Mac handover checkpoint

The user requested moving execution to their local Mac before further cloud implementation or browser work. The review branch contains a saved checkpoint, not an accepted visual result. No new before/after screenshots have been captured for this revision.

| Task | Agent work | Checkpoint status |
|---|---|---|
| [VIS70 #470](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/470) | Wall artwork | First trial composed as `7f8e6d76`: lower spans, consistent post scale across intact/damaged/broken states, exact existing contacts and feet. Component selection: 76 tests / seven files passed in 2.83 s. Actual visual acceptance remains pending. |
| [VIS71 #471](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/471) | Three-row rule | Composed as `e7d84761`. Mirrored pure JS/Python rules and shared fixtures. Syntax, Python compilation and targeted Ruff passed in the component checkout. Post-implementation application checks have not run. |
| [VIS72 #472](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/472) | Feedback | Audit and plan only; no implementation. Proposed bounded gold ground highlight for a confirmed build/upgrade transition, with reduced motion, replay/stale-owner protection and cleanup. |
| [VIS73 #473](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/473) | Independent observer | Composed as `87138129`; 191 existing cases retained and 120 added. Against the old renderer, the intentional red run reported 21 passed / 290 failed in 2.99 s. A combined green run is pending. |

All commits use Johannes Franz Lang's verified Git identity. The main review is [Draft #474](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/474), branch `fix/vis-69-integrated-walls`. Components are saved on separate branches; no extra component PRs were opened.

## Agreed rules and visual trial

The user explicitly confirmed three rows per attack approach, preserving the existing game. All twelve reserved original wall sites count, including unbuilt ones, as they already reserve ground in the existing placement model. Equal X depth shares a row on the east/west approaches; equal Z depth shares a row on the south approach. The nearest east/south/west approach to the heart determines the sector, with south winning its 45-degree ties. A half-grid stagger is a distinct row. Existing defaults have two rows per approach. A prospective Move may not increase a count beyond three; old reads and non-worsening corrections stay compatible. The existing complete-layout Move CAS fences the exact inputs. Five upgrade tiers and the twelve-site limit remain unchanged.

The first visual trial uses span heights 0.85 / 0.95 / 1.10 / 1.20 / 1.30 and half-width 0.28. Post width uses factor 0.60 and height/anchor factor 0.65 for every state. These are review values, not accepted appearance. Transparent quad bounds alone do not prove solid-pixel overlap. Inspect real alpha bounds and ordinary ground depth in actual screenshots before judging them.

Current main still allows ordinary builds at historical reserved sites without a fresh scenery check. Existing prospective Move checks do reserve scenery. Do not claim this checkpoint repairs every old save or closes that separate purchase-validation gap; do not import the old perimeter/SQL stack to hide it.

## Continue locally

Open a **Local** Codex workspace on the Mac. This cloud chat cannot switch its own execution machine or access Safari on that Mac. Use a fresh checkout if another teammate or agent already writes to an existing one:

```bash
git clone --single-branch --branch fix/vis-69-integrated-walls https://github.com/Nilsnova/The-Great-Plot-Twist.git The-Great-Plot-Twist-visual-review
cd The-Great-Plot-Twist-visual-review
```

Read `AGENTS.md`, `CONTRIBUTING.md` and this guide. Inspect status before edits, verify the author's existing Git identity, and preserve all current work. Use Node compatible with `frontend/package.json`, the project's Python version and `uv`. Do not copy cloud caches or a `.env` file.

```bash
cd backend
uv sync --frozen
uv run --no-env-file pytest -q server/tests/test_wall_rows.py server/tests/test_island_layout_rules.py server/tests/test_island_move_routes.py server/tests/test_wall_scenery_clearance.py
uv run --no-env-file ruff check .
cd ../frontend
npm ci --include=dev --no-audit --no-fund
npm test -- --maxWorkers=1 tests/island/wall-rows.test.js tests/island/placement.test.js tests/island/move-mode.test.js tests/pirates/wall-lanes.test.js tests/pirates/fake-api.test.js tests/multiplayer-map-observer.test.js tests/island/wall-textured-batches.test.js tests/island/wall-tier-detail.test.js tests/island/wall-selection.test.js tests/art/wall-upright-volume.test.js
npm run dev
```

The dev server prints the local URL; `?islands=fake` runs an in-memory island, not live persistence. Browser scripts support the installed Chrome path:

```bash
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

Use the project's actual browser helpers and document their scope. The historical `capture-home-island-waves.mjs` buys only six walls, hides toast/banner classes, uses desktop 1280x800, and does not fail every missing-boarder/error condition. It is not sufficient evidence for this review. Create an honest twelve-wall journey at 1280x720 and 375x812 with normal paid build/upgrade receipts, unchanged saved positions/coins on rejected actions, selection, free Move, three-row refusal, and actual battle firing/breach. Capture without hiding real UI. Include a matching baseline from `840549a5`, with the same fixture and settings.

Then perform multiple visual passes across all five wall tiers and intact/damaged/broken/mixed states. Review measured joins, alpha bounds, object depth, building hierarchy, phone Fit/Work and reduced-motion feedback. Keep collision and picking anchors stable. Add the restrained feedback only after reading its task and tracing actual successful state transitions. Run the full applicable frontend checks, build/spoiler, budgets, text, accessibility and demo; run backend checks appropriate to any further rule changes. Report exact failures and unverified Safari/device/performance limits. Do not weaken tests or raise timeouts to manufacture a pass.

## GitHub cleanup

Twenty-five redundant original Draft PRs were closed reversibly, without merging or deleting branches: #342, #346, #349, #350, #353, #354, #355, #356, #363, #375, #382, #383, #384, #390, #392, #402, #406, #410, #414, #420, #426, #427, #431, #432 and #446. Twenty-one have exact current-main parity for all changed non-documentation files; four older assembled reviews are exact ancestors of retained historical #445. Original descriptions remain with an appended closure explanation. Unique perimeter work and teammate PRs were preserved. This is a conservative cleanup, not a claim that the entire queue is now empty.

## Current review gates

The local checks and screenshots are ready for user review in Draft #474. A different human teammate must approve the current code before a merge under `CONTRIBUTING.md`. The review evidence records the browser and device scope.
