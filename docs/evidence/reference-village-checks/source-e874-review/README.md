# Final toast correction: exact-source review evidence

Responsible human: Johannes Franz Lang (`frcola`). All records here are copied
unchanged; [the manifest](sha256.json) retains their original paths and hashes.
This documentation packaging did not run an application/browser check.

## Source boundary

Actual game capture, full-game overlap audit and final six-command sequence use
the same frozen source `e874023f27fff1a7bf5b21787e1ecd5c55a75a9f`:

| Path | Exact tree |
|---|---|
| `frontend/src` | `d76918ec05735c46c9cda4a55cc495e28bfa0d5a` |
| `frontend/public` | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| `backend` | `c785196095edef4f5416744b46435ab564da4e9c` |
| `supabase` | `6e52a63b87028291127dbae8c344c9f49a73896d` |

The frontend tree differs from stage eight/source 52 because VIS52 clears
compact-screen toasts below the measured Goals strip. The source also contains
the previously documented keyboard-activated report test. The new
[stage-nine capture](../../reference-village-latest-review/README.md) supplies
twenty unchanged actual game PNGs; the older stage-eight pictures are preserved
at immutable documentation commits `07d0c146` / `267405ea`.

## Full-game layout: passed 21 measured rows

The [runner report](report.json) and [complete log](overlaps.log) preserve
`npm run test:overlaps -- --shots <recorded output>` from `frontend/`.
Process time: **86.77 seconds**, exit **0**. The
[complete geometry report](overlap-captures/report.json) has **21 measured
state/viewport checks**, `problems: []`, plus **three explicitly skipped
wave-hint rows**. It is not 24 passing checks.

The default viewports are 1280×720, 390×844 and 844×390. For the previously
failing island-toast state, compact-screen Goals/toast coordinates now retain
a ten-pixel gap (rounded report coordinates):

| Actual view | Goals bottom / toast top | Unchanged original image |
|---|---:|---|
| 1280×720 | Distinct desktop columns; no overlap | [PNG](overlap-captures/island-toast-1280x720.png) |
| 390×844 | 183 / 193 | [PNG](overlap-captures/island-toast-390x844.png) |
| 844×390 | 185 / 195 | [PNG](overlap-captures/island-toast-844x390.png) |

Only these three full-game PNGs are copied here; all measured and skipped rows
remain in the complete report. The desktop and 375×812 native component
before/after proof belongs to
[VIS52 Draft #420](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/420).
Its identical regression helper failed three before cases and passed three
after cases in 8.92 s; it is separate from this full-game audit and the
1280×720/375×812 stage-nine game journey. Earlier source-52 failures remain
[unchanged history](../source-52-completed/README.md).

## Final six-command sequence: closed mixed result

The [frozen-source full frontend run](frontend.log) has completed: **4,586 passed / one failed**,
420 files (419 passed / one failed), **554.53 s Vitest / 555.61 s process**.
The sole failure is the defense-report ownership test's unchanged 20-second
limit (20.006 s body). All three new toast-clearance cases passed. This is
not a complete-suite pass or an established report-input performance fix.

The [closed runner report](final-commands-report.json) records all six commands
from 22:59:48.635341 to 23:16:40.118952 UTC, overall exit **1**. The
[complete runner log](final-commands-runner.log) preserves execution order.
The source and all four application trees above remained frozen.

| Final command / raw receipt | Exact result | Process time |
|---|---|---:|
| [`npm test -- --maxWorkers=1 --reporter=verbose`](frontend.log) | **FAIL:** 4,586 passed / one timeout; 420 files (419 passed / one failed), 554.53 s Vitest. | 555.61 s |
| [`npm run test:a11y`](a11y.log) | **PASS:** 33 screens, `failures: []`, `errors: []`. | 359.22 s |
| [`npm run test:demo`](demo.log) | **PASS:** 34 checks, `errors: []`, `external: []`; [original journey record](demo-captures/journey.json). | 91.97 s |
| [`npm run build`](build.log) | **PASS:** spoiler guard `244 text files, 12 protected lines, no suspect elimination data`. | 1.88 s |
| [`node scripts/report-budget.js --check`](budget.log) | **PASS:** title-asset limits; this does not close the separate 8MiB world-art effort target. | 0.37 s |
| [`node ../scripts/text-lint/index.mjs`](text-lint.log) | **PASS:** `4549 candidate strings in 533 source files; 0 errors, 8 report-only findings`. | 2.40 s |

The same backend/Supabase trees retain separately scoped 262 route/unit and
269 scratch-PostgreSQL passes plus Ruff. Those selected-file results are not a
fresh full-backend run; no live migration was applied. The final twelve-image
comparison document's [native check](../../reference-village-comparison-browser/latest-v2-stage09/README.md)
**PASSED** for the unchanged HTML `f65e5020…` / streaming checker `d3d59405…`: twelve
original images, three tablists and 33 real actions at each viewport, zero page
errors/external requests and exact browser-response bytes. Two prior cache-read
failures remain archived. This is document verification, not another app run.

The known upstream multiplayer musket-pose failure remains source-52 evidence,
not a passing final-source rerun. [VIS53 issue #421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421)
tracks it; [the separate native diagnostic](../../VIS-53-captain-pose-diagnostic/README.md)
was inconclusive because its single shot was refused. No pose/runtime fix or
new runtime PR is represented. No PR merge, deployment or live flag change
is represented by these records.
