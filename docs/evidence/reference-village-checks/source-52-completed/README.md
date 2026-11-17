# Main-integrated source 52: completed verification history

This record preserves a completed **mixed result**, including its failures.
Responsible human: Johannes Franz Lang (`frcola`); documentation Draft
[#388](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/388).
These files were copied unchanged from the coordinator's completed runs. The
[SHA-256 manifest](sha256.json) records their original paths, sizes and hashes.
Archiving the records did not rerun the application or open a browser.

## Exact source and timing

The eight-check sequence ran at
`52f6bb158b03188b57260c1872e273391598debf`, from
2026-11-17 22:04:59.747928 to 22:30:44.804992 UTC. Its overall exit code was **1**.
The [original runner report](sequence/report.json) preserves each actual command
and process duration; [runner output](sequence/runner.log) preserves chronology.

| Application boundary | Exact tree |
|---|---|
| `frontend/src` | `6e0c6b27b717a7b8eedcde498d7372de6f0942cb` |
| `frontend/public` | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| `backend` | `c785196095edef4f5416744b46435ab564da4e9c` |
| `supabase` | `6e52a63b87028291127dbae8c344c9f49a73896d` |

The stage-eight screenshot runtime `91c1f9d5` has those same four trees.
That equality does not imply equality of the whole checkout or test files.
The later keyboard-activation test variant and VIS52 toast correction are
outside source 52. No result below validates an unrecorded later candidate.

## Completed sequence

Commands ran in the source checkout's `frontend/`, with installed Chromium,
headless browser checks and one Vitest worker. Output-folder arguments in the
raw runner report identify the exact workspace paths; they are not production
destinations. Durations below are process wall times from that report.

| Check / raw output | Result | Process time |
|---|---|---:|
| [Frontend](sequence/frontend.log): `npm test -- --maxWorkers=1 --reporter=verbose` | **FAIL:** `Test Files 1 failed \| 418 passed (419)`; `Tests 1 failed \| 4583 passed (4584)`; Vitest duration 658.12 s. Only the defense-report ownership case exceeded its unchanged 20,000 ms limit. | 659.05 s |
| [Accessibility](sequence/a11y.log): `npm run test:a11y` | **PASS:** `screens: 33`, `failures: []`, `errors: []`. | 369.85 s |
| [Demo](sequence/demo.log): `npm run test:demo` | **PASS:** 34 checks, `errors: []`, `external: []`; [original journey record](sequence/demo-captures/journey.json). | 86.28 s |
| [Layout](sequence/overlaps.log): `npm run test:overlaps -- --shots <recorded output>` | **FAIL:** two real Goals × island-toast overlaps; exact geometry below. | 84.17 s |
| [Production build](sequence/build.log): `npm run build` | **PASS:** exit 0, including the spoiler guard. | 2.06 s |
| [Budget](sequence/budget.log): `node scripts/report-budget.js --check` | **PASS:** exit 0 for the script's title-asset limits. This does not close the separate 8MiB world-art effort target. | 0.28 s |
| [Text lint](sequence/text-lint.log): `node ../scripts/text-lint/index.mjs` | **PASS with report diagnostics:** exit 0; preserve the original reported spelling/name messages. | 1.32 s |
| [Multiplayer](sequence/multiplayer.log): `node scripts/check-multiplayer.js <recorded output>` | **FAIL:** own firing-pose assertion `0 !== 2` at script line 809 after the preceding scenarios completed. | 341.99 s |

### Layout finding

The [original layout report](sequence/overlap-captures/report.json) records:

- 390×844 island toast: Goals `[12,94,378,183]`, toast
  `[12,172,378,261]`; overlap **366×11 px**
  ([unchanged actual screenshot](sequence/overlap-captures/island-toast-390x844.png)).
- 844×390 island toast: Goals `[12,95,832,185]`, toast
  `[153,172,691,206]`; overlap **538×13 px**
  ([unchanged actual screenshot](sequence/overlap-captures/island-toast-844x390.png)).

The audit also sampled 1280×720. Its three `wave-hint` rows are explicitly
`skipped`; they are not passing coverage. Other measured rows, including wave
toasts, recorded no intersections/clipping/covering. Only the two failing PNGs
are copied here; the report and log are complete. This finding opened
[VIS52 issue #419](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/419) /
[Draft #420](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/420).
Its correction and later game/check evidence require their own source receipts.

### Multiplayer boundary

The run proved the recorded lobby/start roles, co-op wall construction, level-two
and level-three upgrades, tower skills/research, house roles, demolition and
refunds. It then observed shared seeded wave state, musket shots, captain fall,
paid Medic revive at 75/100 HP, early hold release, pause/resume, a break-time
upgrade, one next wave after two clicks and two late joiners for four members.
The full log retains exact sample counts and timings.

The firing-pose assertion then failed at both 1280×720 and 375×812. Eight
recorded attempts accepted named shots from a live captain at a live target,
but the observer saw neither the own nor teammate pose. Browser errors were
`[]`. Boss and subsequent assertions were **not reached**. The existing
upstream main status already records the same `0 !== 2` musket-pose failure;
this is a known upstream failure, with its cause still under investigation,
not an established new visual regression or a complete multiplayer pass.

## Later keyboard variant: still failed

The separate [runner report](keyboard-follow-up/report.json) and
[complete output](keyboard-follow-up/report-input.log) ran the keyboard-activated
button variant at `b9da278390ac4f63c580ab34d7ba369e71a4a36a`, from
22:41:30.495568 to 22:41:53.607150 UTC. The four application trees above are
unchanged, but test-only revisions `5cdc9b17` / `40798f09` are present.

Command: `npm test -- --maxWorkers=1 tests/pirates/defense-report-ownership.test.js --reporter=verbose`.
Result: **one file / one test failed**, `Test timed out in 20000ms`, 20.025 s
test body, 22.32 s Vitest / 23.09 s process. The real visible controls use
focus and Enter; the movement assertions, 24 real frames, high quality and
20-second limit remain. This variant does not resolve the timing failure.
No timeout increase, assertion deletion or fabricated success is represented.

## Preserved visual history and next gate

The exact stage-eight package before these documentation updates is retained
at immutable documentation head
[`07d0c146`](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/07d0c14649ae7d1fb6a3503012d8941bee4e6a42/docs/evidence/reference-village-latest-review).
Its [manifest](stage-eight-sha256.json), [Draft snapshot](stage-eight-pr-snapshot.json)
and [original README bytes](stage-eight-readme.txt) are also archived here. That twelve-image comparison's
native check was pending; the older eight-image proof does not validate it.

The [backend record](../../reference-village-backend-checks/README.md) separately
proves 262 route/unit and 269 actual scratch-PostgreSQL checks on matching
backend/Supabase trees. It is not a fresh full-backend result. All application
changes after this source, fresh game capture, applicable complete/UI checks
and native verification of the final comparison remain **PENDING** until their
own exact receipts arrive. All component PRs remain Draft; no PR was merged to
main and no live database, flag or deployment was changed by this archive.
