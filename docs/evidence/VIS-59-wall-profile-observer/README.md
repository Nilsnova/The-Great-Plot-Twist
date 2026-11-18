# VIS59: strict current wall-profile observation

Used by Johannes Franz Lang (`frcola`) and multiplayer reviewers. [Issue #434](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/434), [Draft #435](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/435), [agreed scope](../../../specs/VIS-59-wall-profile-observer.md).

## Result and scope

The multiplayer verifier recognizes the intentional cap heights **0.95 / 1.15 / 1.25 / 1.35 / 1.43** for tiers 1–5, plus the sparse authored posts along straight runs. These are explicit independently written expectations in the QA module; it does not import the renderer's height list or shape-selection implementation. Every third two-unit coordinate cell retains the authored post, in either direction and at negative/half-grid positions. Other straight cells require the exact small top cap. Corners, endpoints, mixed-tier junctions and existing damage-state behavior retain the previous full-post expectation.

The [observer patch](observer-change.patch) changes only **six added / two removed lines**. The module remains **109 lines**. No permissive fallback accepts both shapes: each coordinate has one expected shape. Exact indexed positions/UVs, source atlas receipts, visible material, transform chains, draw ranges and the existing `1e-5` numeric tolerance remain in force. A diagnostic tier cannot substitute for actual matching buffers.

Product source, public art, backend, Supabase, package manifests/locks and the native multiplayer journey are unchanged from coordinator base `480d636d3e18b879f51126804d8c76e2720265e2`. [The scope/identity receipt](scope-identity.json) records their exact Git hashes and proves that the original **6,075-byte test file** remains an unchanged prefix with SHA-256 `07f39681d53241e38afeb8b2df9346e0c92858bed69248d0ba7fe20972e88ecc`. All **31 original cases** remain; only 120 new cases are appended. No ownership, semantic-level/pip, geometry, visibility, teardown, duplicate-renderer, timing or graphics assertion is weakened.

## Why the correction is needed

The coordinator's full source-7fab run reported 4,639 passes / two failures across 424 files (563.75 s). One is the existing unchanged 20.027-second input timeout. The second is the original observer's obsolete level-three 1.45-unit cap assumption. This task independently reproduces that second failure below. It changes the verifier to match the agreed visual contract; it does not change the game to satisfy a test or close the separate input issue.

## Tests-first evidence

| Step | Source and exact result | Original receipt |
|---|---|---|
| Original observer/test | Claim `78278cf7`: **30 passed / 1 failed (31)**, **1.12 s** Vitest / **2.76 s** process. Fails the unchanged real straight level-three cap case. | [Command/hashes](original-red.json), [raw log](original-red.log) |
| New tests, old observer | Test-only commit `5fcff27d`: **52 passed / 99 failed (151)**, **1.75 s** Vitest / **3.26 s** process. This red run precedes the observer edit. | [Command/hashes](expanded-red.json), [raw log](expanded-red.log) |
| First corrected observer | HEAD still `5fcff27d`, with the uncommitted observer bytes identified by SHA-256 `3c0768bee371f680428ed6cc4ac3fcb82b68332a7f395c45eb030c020c0d1c8a`: **151 passed (151)**, **912 ms** Vitest / **2.77 s** process. Those exact bytes were then committed. | [Precise boundary](focused-green.json), [raw log](focused-green.log) |
| Committed focused wall selection | Code `3584c38692fe7672309b56c417641339c9eb5bd7`: **197 passed (197), 7 files passed (7)**, **5.13 s** Vitest / **7.16 s** process. | [Command/source/hashes](final-pure.json), [raw log](final-pure.log) |

Original/corrected single-file command: `npm test -- --maxWorkers=1 --reporter=verbose tests/multiplayer-map-observer.test.js`. The expanded red run uses reporter `dot` without changing case selection. The final exact seven-file command is in its receipt and includes wall textured batches, wall connections/selection, combat connections, tier identity and actual capture-buffer checks. All runs are pure; no Chrome is started.

## Added matrix

| Added cases | Coverage |
|---|---|
| 20 positive cases, each with three positions | Five tiers × horizontal/vertical × cap/buttress; positive, negative and half-grid coordinates give **60 real drawing scenarios**. |
| 20 stale-diagnostic cases | Each tier/orientation/form first succeeds, then refuses fresh semantic tiers over old buffers, then accepts the actual repaint. |
| 60 corrupted-buffer cases | Each tier/orientation/form first succeeds, then refuses a corrupted indexed position, UV or triangle index. |
| 20 stale-teardown cases | Each form first succeeds; removing the diagnostic row without clearing geometry fails; actual geometry removal then reports level zero/no pips. |

The original cases still reject missing/hidden/moved/scaled geometry and ancestors, manual matrices, empty/excluded draw ranges, transparent materials, missing/wrong textures, malformed/placeholder source receipts, stale teardown remnants despite invalid art, and duplicate legacy renderers. Their original exact semantic level/pip assertions remain intact.

Static evidence checks resolve all 12 local targets in this receipt/spec. The manifest records the original evidence bytes and hashes. Git whitespace checking flags one preserved blank context line in the raw `.patch` output; edited source/docs pass with raw `.patch` and `.log` evidence excluded. The original patch bytes are retained.

## Verification limits and next step

The coordinator owns the source-specific native multiplayer rerun and fresh full frontend run after composition. This task does not claim either passed, does not rerun unrelated backend/build/a11y/demo checks, and does not reuse a historical native pass. Existing input timing and any later multiplayer failure remain open. Product application trees are unchanged, so this QA correction supplies no new screenshot or visual-acceptance claim. Different-human review and explain-back remain pending; keep the PR Draft.

No main/PR merge, force push, deployment, live migration, .env edit, new dependency/service or production flag change was performed. Locked setup used the existing `npm ci --include=dev --no-audit --no-fund` with the workspace cache; 46 packages installed, with no manifest/lock change.

## Explain-back

“The game already draws the intended wall profile. Our independent multiplayer observer still expected an older cap height and treated every straight position as a small cap. I gave it the explicit current five-height contract and the coordinate rule for the sparse posts. It still checks the actual indexed geometry and texture coordinates, so changing a diagnostic level or hiding a bad mesh cannot make it pass. The old failing proof stays in the PR, and the separate input timeout remains open.”

Before readiness: why must expected wall profiles be independently specified; why does a fresh diagnostic tier fail over old UVs; why must teardown fail until the old drawn quad is removed?
