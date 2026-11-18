# VIS60: distinct multiplayer samples and replayable native evidence

Used by Johannes Franz Lang (`frcola`) and multiplayer reviewers. [Issue #436](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/436), [Draft #437](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/437), [scope](../../../specs/VIS-60-distinct-sync-samples.md).

## Observed failure and its limits

The coordinator's original source `7fab8866b83e27c6102df6b123ffdf2eb96619d0` native run failed after **341.53 s**, at `Ana runs the owner's wave 2`. [The unchanged raw log](source-7fab-multiplayer.log) and [diagnostic receipt](source-7fab-diagnostic.json) preserve the actual result. Both own-body musket sizes and the teammate pose had already passed. The failing predicate requires at least **three comparisons**, with ship and boarder count gaps at most one. The recorded Ana result was **one comparison, matching ships and boarders, count gaps 0/0**. Its recorded failure is insufficient observation coverage, not an observed state mismatch.

The comparator discarded nine of every ten collected owner observations before joining ticks. Full original input arrays were not archived. It is therefore **unknown** how many additional pairs that particular run contained, and this task cannot replay it into a pass. Owner tick1694/running and later friend snapshots at tick1714/ended are different-tick, sequential diagnostic reads; that phase difference alone does not establish deterministic divergence. Nor does one matching sample rule out divergence outside the observed overlap.

The entire `frontend/src/pirates` subtree and original native entry are identical between integration `6c87b8dc` and source7fab; exact Git identities are in the diagnostic receipt. This confirms the visual follow-up did not change that preserved engine/harness. It is not a baseline browser comparison against current main or proof that no underlying game defect exists.

## Independent QA contract

The new pure helper uses every **distinct** collected observation. It reserves all exact-tick pairs first, then tries the original **-1 before +1** window for remaining observations. A left/right tick is consumed at most once. The output retains `checked`, `same`, `worst`, `sameBoarders`, `worstBoarders` and `withBoarders`, using the original formulas. Matched tick pairs are additional diagnostic data.

Duplicate ticks with identical ship/boarder ID strings collapse. Conflicting duplicate state fails explicitly. Both histories must be arrays with safe nonnegative integer ticks and the native collector's canonical sorted unique comma-separated IDs (empty string means none). Missing/nonstring, repeated, unsorted or malformed IDs fail, including unmatched records; they cannot silently manufacture agreement. The helper copies relevant fields and does not mutate histories. It imports no product simulation or matching implementation and remains **50 lines**.

All **72 native assertion lines** are byte-identical. Existing minimums, mismatch tolerances, actions, waits, frame collection, graphics, wave filtering, `landed` projection and exact-tick heart/militia checks remain unchanged. [Scope/identity proof](scope-identity.json) records those block hashes and exact product/public/backend/Supabase/package identities against base `1d979f005e77392dba9a439e508badbedc3469e2`.

## Native diagnostic handover

Each existing `compare()` call buffers its exact already-collected left/right arrays, player labels, wave ID, matched ticks and metrics, or its validation error. Comparison performs **no disk I/O**, waits or extra sampling. Normal success writes `sync-samples.json` once after the last native assertion and before success output. The existing failure handler writes the buffered data before its original diagnostics/throw/cleanup, including a validation error from comparison. A failed diagnostic write is logged without masking the original failure; a success-side write failure remains observable as a failed journey. Inputs come only from the declared fake players, not production accounts.

Histories retain the original collector's existing bound of at most 6,000 rows per page, and the native journey makes its existing four comparisons. This stores original observations rather than inferred replacement data. It does not collect additional frames or add a waiting period. The native artifact itself remains pending the coordinator run; this task tests the boundary with synthetic inputs.

## Tests first and exact results

| Stage | Exact source/result | Evidence |
|---|---|---|
| Legacy-selection red | Claim `1f6f7e6f` with the uncommitted mechanical old-policy extraction and new tests, each hash identified; those bytes were then committed as `9fb41524`. **18 failed / 8 passed (26)**, **378 ms** Vitest / **1.36 s** process. | [Receipt](legacy-selection-red.json), [raw log](legacy-selection-red.log), [old extracted policy](legacy-selection-helper.js) |
| Corrected helper, first green | HEAD still `9fb41524`, uncommitted helper SHA-256 `7d080e48…` later committed unchanged. **26 passed (26)**, **268 ms** Vitest / **1.31 s** process. | [Exact boundary](focused-green.json), [raw log](focused-green.log) |
| Earlier per-comparison writer | Source `ab78a10a`, **186 passed / four files, 1.59 s** Vitest / **2.72 s** process. Historical only: the coordinator then requested deferred writes to minimize observer I/O during the journey. | [Receipt](before-deferred-final-pure.json), [raw log](before-deferred-final-pure.log) |
| Final deferred-writer source | `8b901604be03076a70802f7140c80871aa742293`: **186 passed (186), four files passed (4), 1.54 s** Vitest / **2.47 s** process. | [Command/source/hashes](final-pure.json), [raw log](final-pure.log) |

The final command is `npm test -- --maxWorkers=1 --reporter=verbose tests/multiplayer-sync-samples.test.js tests/multiplayer-sync-wrapper.test.js tests/multiplayer-map-observer.test.js tests/island/capture-wall-buffers.test.js`. `node --check scripts/check-multiplayer.js` also passed. No Chrome was started by this task.

The 26 independent comparator cases cover discarded offset-cadence overlap, late joins, exact/-1/+1 preference, repeated ticks, right-sample reuse, insufficient data, genuine count mismatches, equal-count ID mismatch signals, stable ordering/nonmutation, conflicting duplicates and malformed records. Six additional wrapper cases execute the **actual comparison function** extracted from the trusted native entry with mock pages, avoiding the entry's Chrome startup. They prove unrelated-wave isolation, unchanged exact heart/militia metrics, insufficient-data/error buffering, actual terminal writer payload, write failures and success/failure-only persistence. The remaining selected cases retain strict wall-buffer/observer regression coverage.

## Not verified and next step

Synthetic passing tests do not prove the native synchronization gate passed. The coordinator must freeze the composed QA source and run the full frontend and real native multiplayer journey. The source7fab failure stays failed evidence; no minimum is lowered, no timeout raised and no gameplay response changed. The separate unchanged native input timeout and any later multiplayer failure remain open. Browser/device, balance, production persistence and human visual acceptance are not checked here.

Different-human review and explain-back remain pending. Keep Draft; no main/PR merge, force push, deployment, live migration, .env edit, new package/service or production flag change. Locked npm setup installed the existing 46 packages without manifest/lock changes.

## Explain-back

“The test collected useful samples but discarded most of them. I compare the distinct observations, reserve exact matches before nearby ticks and count each observation once. Invalid or conflicting rows cannot manufacture the minimum coverage. The original assertions and exact heart/militia checks remain. I buffer the actual inputs during the journey and write them only when it finishes or fails, so a later failure can be replayed. Passing synthetic fixtures does not establish a real multiplayer pass.”

Before readiness: why reserve exact matches first; why cannot repeated frames prove independent coverage; what does insufficient data establish about game divergence?
