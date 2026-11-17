# VIS57 Preserve teammate fixes in the visual review base

> **What this is:** a review-only integration checkpoint for the next presentation pass.
>
> **Who uses it:** Johannes Franz Lang and the visual component reviewers.

- **Status:** in progress; Draft only.
- **Branch:** `chore/vis-57-playtest-base`
- **Issue:** [#425](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/425)
- **Responsible teammate:** Johannes Franz Lang (`frcola`).

## Goal and scope

Start from current main `66d29ea9eeb6ac39523c6605c8379004277326fe` and preserve the existing visual preview `e636ae7578813d1aa45f05092fdacc8cfadcbfe5`. Keep both authored histories. The visual follow-up must retain the teammate's playtest fixes, including carried weapons, round loot, repair behavior and smoother movement.

Reconcile the one expected textual conflict in `frontend/src/pirates/render.js`: use the incoming smoother while passing both smoothed logical coordinates to D064's projected ship metadata. Move only the unmerged VIS50 finish-checkpoint guard from migration version `20261118040000` to unused `20261118050000`; its SQL body remains exact. Main's playtest migration stays unchanged. Record the 46 incoming paths and 19 overlapping paths with exact results.

## Acceptance checks

- Both named source commits remain ancestors of this branch.
- The renderer retains smoothing, projection, wall batches and their existing lifecycle.
- All migration versions are unique; the playtest SQL and relocated guard bytes match their source commits.
- Focused frontend regression tests and route/disposable-PostgreSQL checks cover the affected integration boundaries. Record failures without weakening tests.
- The next component PRs contain only focused visual changes on this base.
- A different human reviews the current revision before readiness or merge.

## Contracts and limits

No new API, event, dependency, game rule or recovery design is introduced. Current-main behavior and the existing unmerged perimeter/visual contracts are composed together. Do not apply live migrations, change flags, deploy, push main, force-push or merge a GitHub PR. This aggregate is not suitable for wholesale merge before dependency and human review.

The coordinator owns full-game/browser verification after this checkpoint; this task does not claim those checks. Existing unresolved native input timing and multiplayer pose evidence remains open until fresh proof says otherwise.

## Explain-back

“I kept the teammate's working game behavior and the existing visual work together in a review branch. The renderer's smooth position still goes through the same projection as the rest of the game. The two SQL files had the same migration number, so I gave only our unmerged guard a new number and preserved both files' contents. A clean textual merge is not proof that the game works, so I checked the affected functions and kept the exact test results.”

Questions before readiness: why must smoothed coordinates use the shared projection; why must migration versions be unique; why does the first finish require an accepted health checkpoint?
