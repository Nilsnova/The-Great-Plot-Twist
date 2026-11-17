# Captain pose diagnostic: inconclusive native shot

Responsible human: Johannes Franz Lang (`frcola`). This is diagnostic evidence, not a runtime change or multiplayer acceptance.

The isolated runtime was exactly `52f6bb158b03188b57260c1872e273391598debf`, frontend source tree `6e0c6b27b717a7b8eedcde498d7372de6f0942cb`. The unchanged native multiplayer journey on that source failed its late own/teammate musket-pose assertion after earlier co-op, revive, pause, synchronization and late-join phases passed. The boss/finisher path was not reached.

One separate passive native attempt used ordinary local fake-game Create/Join/Start, declared initial best wave three and paid structures, and one `shoot()` attempt. It finished in **54.417 seconds** under a 90-second diagnostic bound; browser and Vite closed, and zero live Chromium processes were verified. It made no clock, FPS, graphics-quality, pose or damage/outcome changes.

**The shot was not accepted.** The diagnostic's range gate was too loose: a level-three musket has range 16, while the player stood at coast radius 14 and the gate allowed a ship at radius 32. This setup could require range 18. `shoot()` returned `false`, no `captain_fired` event was observed, and the resulting trace cannot establish the native pose failure's cause. No retry was made.

The passive trace did record foreground, non-hidden RAF gaps up to **1,066.7 ms** on the host and about **1,066.6 ms** on two peers. These exceed the 600 ms pose lifetime and approach/exceed the controller's one-second visual-event freshness window. This is relevant timing evidence, not accepted-shot causal proof.

The separate read-only pure-controller probe at `../musket-pose-freshness-diagnostic/observations.json` reproduces a mechanism: the same accepted shot draws and poses after a 250 ms following frame gap, while at 1,800 ms it still emits `captain_fired` but is excluded from recent drawing/pose events. That probe uses synthetic time and does not prove the exact eight native attempts took that path.

Before another native diagnostic, compute eligibility from the actual current `captainStats` and target/player positions immediately before the single shot. Preserve the original multiplayer assertion and timing/quality budgets; do not raise the freshness cutoff, extend the pose lifetime or replay historical shots as a shortcut.

Files:

- `report.json`: original passive trace, exact runtime/script identities and one refused shot. Its `failure: null` means the diagnostic driver completed, not that a shot or multiplayer check passed.
- `attempt-01-script.mjs`: exact original external script matching the report's `715dda1f…` SHA-256.
- `../musket-pose-native-diagnostic.mjs`: corrected future diagnostic; its actual-stat eligibility check has **not** been run natively.
- `../musket-pose-native-diagnostic.log`: driver completion output.
- `../musket-pose-freshness-diagnostic/observations.json`: independent pure-controller mechanism and source hashes.

No product source was edited. No live accounts, migration, feature activation, deployment, PR merge or new package was used.
