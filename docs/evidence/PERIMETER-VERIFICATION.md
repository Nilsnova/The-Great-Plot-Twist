# Perimeter candidate: integrated verification

Prepared for Johannes Franz Lang (`frcola`). This is a draft implementation record, not a merge, production migration, deployment or feature activation. Read the [review guide](../contribute/PERIMETER-REVIEW.md) and [migration runbook](../../supabase/README.md#perimeter-defense-candidate-six-migration-additions) before release work.

## Source and scope

The final gameplay capture used runtime `525c2ab470d455ac76414bb0b963526897519008`, with frontend application tree `64864989885cf3afa9fc5d1e4e663c8b0a6fed84`. Later changes update QA evidence/helpers, the explicit renderer-layer test contract and the separately scoped BASE-52 market accessibility fix. The only application-source difference from the wall gameplay capture is the Harbor disabled-choice opacity (.5 to .65); all wall, combat, camera and art source is unchanged. The final frontend application tree is `52716c98798a4956fcd34a609af276451be87e7b`. The candidate includes teammate changes through main `8759fc802a43e2860e631bf452b07d792d1c50c4`.

Backend verification ran in the separate `verification` clone at `e11d6a8910bc638bd9b58156f8f841c7ae56350e`, backend tree `e8d128f1ed1830a052aa1407858d8d899d3cb2d8`, identical to the integrated candidate. The complete private SQL run used the same production backend/schema logic before two later static contract-test corrections. Those corrections change only the demolition-history and public-flag expectations.

The original checkout remains at `ee9d03cb0fc8402e9e6c43644260024ff3521092` on its original branch. Component writers used separate clones; the coordinator composes their unmerged drafts on `chore/perimeter-integration-review`. Fixed task dependency bases keep individual PR diffs focused. Before any future merge, reconcile each intended task against then-current main and rerun affected checks; do not merge the preview wholesale.

## Playable result

- Policy 1 provides 128 stable wall IDs. Added inventory has no unpaid default coordinates.
- The server quotes 1–32 connected cells on the existing half-unit grid and 2×2-unit wall footprint. SQL commits a complete paid run, positions, contributions and one immutable receipt together.
- The measured 102-wall ring is legal and saved. It leaves 26 capacity slots. Fixed coastal services may stay outside the inset ring.
- Existing manual wall levels 1–5, prices, unlocks and recovery rules remain. No automatic island growth or new opponent/account/service requirement is introduced.
- A normal bell delivers the frozen local demo through the real event flow into the actual controller/simulation. Production recovery V1/protocol 2 and public config 2 remain a separate, capability-fenced path.
- Broken health removes the actual barrier and its joins. Friendly-captain collision and naval/projectile attacks retain their existing rules.

## Actual browser journey

[WALL-24 evidence](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/1fd16f1fc0055edc832f3a849b6959e77e78ca2b/docs/evidence/WALL-24/README.md) contains untouched 1280×720 and 375×812 images, declared fixture/progression, source/helper revisions, saved-state comparisons, control measurements and the raw report. These are local Chromium fixtures, not a live account or Safari session.

Each full journey drafts/cancels without spending, pays for 102 exact walls in 32/32/32/6 runs, reloads the same coordinates and four receipts, upgrades one wall through its real card, uses Zoom/Fit/Exit, and handles a deliberate delayed refusal without payment. Construction costs 1,020 coins; the existing wall upgrade costs 20. Wall construction begins with 7,700 coins after the 8,000-coin fixture pays for seven ordinary buildings, and ends with 6,660 after the wall purchases and upgrade. Its progressed state is declared test setup, not a claim about natural first-session earnings.

The actual frozen wave is wave 41, seed 25135766. All 106 logical shared-side joins match frozen standing defenses; the first real zero-HP wall removes its two joins, leaving 104. Renderer meshes are observed separately from logical links after batching. Browser time acceleration is declared. The tests do not inject a fake victory, repair or health result.

The final phone workspace preserves 17px button text and 44px targets. Unquoted/quoted panels are about 316/335px high with the full canonical shore above them. The formerly clipped Cancel now has a 68.25px button and 56.25px text; its Range is visibly inside the actual padding clip box and scroll width equals client width. DOM text ranges may ascend 1px into valid padding, so the QA guard uses the real clipping boundary rather than an incorrect content-box assumption. The old phone image is labeled software-before; construction before/after pictures are explicitly different states on one runtime.

The 40 cannon checks per viewport compare real world-art and combat-atlas pixels at densities 1.5 and 2; maximum pixel difference is zero. There are no JavaScript page exceptions or external requests in the final journey. Each viewport records two expected 503 resource diagnostics from deliberately unavailable offline fixture services; this is not described as an entirely clean console.

## Verification results

Counts below belong to separate commands; overlapping suites must not be added together.

| Check | Exact result | Boundary |
|---|---|---|
| Complete backend, `uv run --frozen --no-env-file pytest -q` | 536956 passed, 303 skipped in 941.81s (0:15:41); exit 0 | Includes the existing exhaustive flag matrix. Optional test skips are reported. |
| Complete island SQL directory with `CASE_PG_SCRATCH=1` and temporary pgserver/psycopg extras | 609 passed in 25.19s; exit 0 | Real disposable Unix-socket PostgreSQL, actual migration chain and API adapters; no live database. |
| All migration-contract modules | 494 passed in 4.75s | Exact ordered migration and monetary/recovery parity checks retained. |
| Complete frontend | 354 files passed; 4051 tests passed in 509.97s; exit 0 | Browser/DOM and pure tests, including exact batched geometry guards; no timeout relaxation. |
| Accessibility | 33 screens; failures [], errors [], browserErrors [], externalRequests []; exit 0 | Actual script scope, not physical assistive-technology acceptance. |
| Demo journey | 34 executed default checks; errors [], external []; exit 0; optional perf report not requested (perf:null) | Declared local/offline class-demo flow. |
| UI overlaps | No overlaps in 24 state × viewport checks; exit 0 | Script fixtures and measured viewports. |
| Production build and spoiler guard | Build completed; spoiler guard: 241 text files, 12 protected lines, no suspect elimination data; exit 0 | No production deployment. |
| Cold-title transfer budget | Initial JavaScript 18,698 / 21,080 bytes; CSS 9,410 / 12,000 bytes; exit 0 | This is separate from world rendering cost. |
| Backend Ruff | All checks passed! | Coordinator command on the candidate. |
| Text lint | 0 errors, 8 existing report-only findings | Source copy audit; not a semantic review of all prose. |

Recorded frontend commands, from `frontend/`:

```sh
npm test -- --maxWorkers=1 --reporter=verbose
npm run test:a11y
npm run test:demo
npm run test:overlaps
npm run build
node scripts/report-budget.js --check
```

Backend Ruff used `UV_CACHE_DIR=/workspace/.cache/uv uv run --frozen --no-env-file ruff check .` from `backend/`. Text lint used `node scripts/text-lint/index.mjs` from the repository root. Complete SQL used `CASE_PG_SCRATCH=1 UV_CACHE_DIR=/workspace/.cache/uv uv run --frozen --no-env-file --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql` from `backend/`; the extras were temporary test tools, not new application dependencies. Raw logs and checksums accompany the local review packet.

Component specs and capture READMEs preserve their earlier scoped handovers, including then-pending broad checks. The coordinator results in this table supersede those pending-check notes where source parity is explicitly recorded. They do not close human acceptance or the production/rendering gates.

The timed-out full-game input test was rerun unchanged with a fresh temporary cache and no competing heavy job: one file/one test passed in 14.36s. The original 20-second limit remained. No warmup patch or timeout relaxation was introduced. The subsequent complete suite, not that isolated pass, is the broad verification gate.

## Browser-check fixes found during final verification

[BASE-52 evidence](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/b33b7d8d67cebc76253cf7606d9cdbd1ba54b76c/docs/evidence/BASE-52-market-accessibility/README.md) records the fix for the existing Harbor disabled-choice opacity from .5 to .65. The exact low-contrast control measures 3.9664 before and 5.6064 after at 1280, 375 and 320px; the minimum requirement remains 4.5. The real 15-second refresh still replaces controls and preserves focus by their unique semantic key. The keyboard audit now verifies the native current order and the original key across replacement, rather than relying on a test marker that replacement legitimately removes. All visible, inside, order, count and focus-trap checks remain. Targeted coverage passed 133 tests in 10 files; the unchanged complete a11y command then passed all 33 screens.

[BASE-51 evidence](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/323d4bef3a6d9a8e858142c3629b63ecd2468683/docs/evidence/BASE-51-demo-journey/README.md) records the intentional current-goal disclosure in main. Its demo script checks the Lamp hint when Lamp really becomes current after Wave and Defend, while retaining all 34 original standalone assertion-helper calls, the actual lock/duel/combat/finale actions and every original explicit wait/timeout. It adds a current-Wave hint check. Its complete browser result is recorded above; this is QA flow maintenance, not a product change that reveals future goals.

## Rendering evidence and remaining performance gate

[WALL-45](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/1fd16f1fc0055edc832f3a849b6959e77e78ca2b/docs/evidence/WALL-45-span-batches/README.md) compares the same paid scene before and after, at both required viewports and native pixel ratio 1. The 106 logical joins become 36 meshes at the same painter layers; exact vertex/color/index hashes preserve geometry and occlusion. Actual calls fall from 375 to 235, geometries from 330 to 260, and 38 textures remain unchanged. Transparent DoubleSide rendering uses two passes, explaining 140 saved calls from 70 fewer meshes.

The separate final journey after reload reports 235 calls, 199 geometries and 30 textures. Its cache/lifetime point differs, so it is not compared against the no-reload baseline to invent a larger saving. These are measured stills and resource counts, not sustained FPS or real-device acceptance.

**235 calls still exceeds the unchanged project target of fewer than 150.** Further sprite/post batching and device measurements remain open. The target was not raised to make this candidate pass.

## Human review and release limits

All task PRs remain Draft. No agent merged them, applied a live migration, enabled the production perimeter flag, requested a teammate review or deployed the candidate. A different human reviews the current revision after Johannes practices the explain-back questions in the guide and individual PRs.

The complete illustrated art direction, land expansion, late-wave balance/ranking comparability, BASE-45 score/reset continuity and physical-device/Safari behavior remain separate work. Keeping existing score/reward calculations does not prove that 128-wall capacity is balanced. Functional wall evidence does not close the visual-quality or rollout gate.

The six schema additions must be reviewed/applied in timestamp order before compatible server code, even when new offers are off. Pausing offers preserves paid policy, positions, receipts and supported clients; it is not a safe schema downgrade. Follow the runbook and fix forward. This document contains no live migration or activation command.
