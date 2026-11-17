# VIS53: known upstream captain-pose diagnostic

Responsible human: Johannes Franz Lang (`frcola`). Tracking
[issue #421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421) remains
open; this evidence adds no runtime change or runtime PR.

The full multiplayer journey at source
`52f6bb158b03188b57260c1872e273391598debf`, frontend tree
`6e0c6b27b717a7b8eedcde498d7372de6f0942cb`, failed the firing-pose assertion
already documented on upstream main. Its preceding co-op/synchronization/revive/
pause/late-join observations and exact failure are preserved in the
[complete source-52 history](../reference-village-checks/source-52-completed/README.md).
Boss and subsequent assertions were not reached.

The separate passive native diagnostic is **INCONCLUSIVE**. Its single shot
returned `false`, with **zero accepted `captain_fired` events**; the diagnostic's
distance gate was too loose for the actual level-three musket range. A clean
driver completion and `failure: null` do not mean the shot, pose or multiplayer
check passed. The driver finished in **54.417 s**, then closed its browser/server.
The range-gate correction for a future diagnostic was not run natively.

The trace measured foreground frame gaps near 1,066.7 ms. A separate synthetic
controller probe reproduced a mechanism where a 1,800 ms frame gap excludes an
otherwise accepted shot from the recent pose/drawing window, while 250 ms
draws it. Neither observation proves the cause of the eight accepted-shot pose
failures in the full native journey. No freshness cutoff, pose lifetime,
graphics-quality setting, timing limit or assertion was changed to claim success.

The [manifest](sha256.json) verifies these **four unchanged original files**:

- [Original native report](report.json): refused shot and passive trace.
- [Original script](attempt-01-script.mjs): exact `715dda1f…` script hash recorded
  by that report; diagnostic reproduction code, not application code.
- [Summary](summary.json): explicitly inconclusive, corrected future script not run.
- [Original workspace README](original-readme.txt): retained as text because its
  relative paths describe its original workspace location.

Packaging these supplied files performed no browser/application rerun. Final
stage-nine frontend/UI evidence has its own `e874023f` source boundary. The
known upstream multiplayer failure stays open; no final-source full multiplayer
pass, production change or human acceptance is claimed.
