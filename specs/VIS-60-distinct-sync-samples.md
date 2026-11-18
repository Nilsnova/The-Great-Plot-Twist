# VIS60 Compare distinct collected multiplayer samples

> **What this is:** a QA-only correction and replayable receipt for existing synchronization observations.
>
> **Who uses it:** Johannes Franz Lang (`frcola`) and multiplayer reviewers.

- **Status:** in progress; Draft only.
- **Issue:** [#436](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/436).
- **Branch:** `test/vis-60-distinct-sync-samples`.
- **Base:** coordinator source `1d979f00`; product behavior remains unchanged.

## Goal and observed evidence

The source-7fab native run passed musket poses and then failed the minimum synchronization coverage for Ana: one matching ship/boarder observation, zero count mismatches, below the existing minimum of three. The comparison discarded nine out of ten collected owner observations. Full sample arrays were not retained, so neither unobserved agreement nor a native fix can be claimed from that run.

Use all existing distinct observations. Reserve exact-tick pairs first, then use the existing -1/+1 tick preference without reusing a left or right observation. Duplicate ticks with identical observed ship/boarder state collapse; conflicting duplicates or malformed data fail explicitly. Keep the existing metric formulas, minimum counts, tolerances, wave filtering, exact-tick heart/militia code and native actions/timings/frame counts/graphics unchanged.

## Files and acceptance

- A small pure helper under `frontend/scripts/` with no product algorithm import.
- Independent synthetic tests: strided capture loss, late joins, duplicates, unique pairs, exact/-1/+1 preference, insufficient data, real mismatches, malformed data and the retained wave-filter boundary.
- `frontend/scripts/check-multiplayer.js` delegates only ship/boarder matching and writes the exact collected arrays, matched tick pairs, metrics/errors and QA source/wave to a bounded-history receipt on success or failure. No additional collection time or frames.
- Tests first, preserve initial red results, run meaningful pure checks, and record exact product/native-boundary identity checks.
- Coordinator reruns full frontend/native multiplayer on a frozen composed source. Keep Draft pending actual results, explain-back and different-human review.

## Limits and explain-back

No product, package, API, database, environment, timeout, threshold or game-rule change. No Chrome by this task, deployment, main/PR merge or live migration.

“The test already collected useful samples but threw most away. I compare the distinct samples, protect exact matches before nearby ticks and count each observation once. A duplicate or malformed row cannot manufacture the minimum coverage. I keep the original thresholds and exact heart/militia checks, and save the actual inputs so the next failure can be replayed. Synthetic passing tests do not prove the real multiplayer journey passed.”

Before readiness: why reserve exact matches first; why cannot repeated frames prove independent coverage; what does insufficient data establish about game divergence?
