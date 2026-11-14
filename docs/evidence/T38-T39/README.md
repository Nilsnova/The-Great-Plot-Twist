# T38 + T39 evidence

Screenshots of the last-chance rescue's rehearsal checkpoint in the real game page
(`?pirates=demo&practice=rescue`, the dev harness; fake API, no coins, no saved progress), captured with headless
Chromium on the local Vite dev server on 14 Nov 2026. The checkpoint runs the real rescue rules (`finisher/rescue.js`)
at wave 20 with one captain; the input was a scripted Space hold, so the result shown is a failure.

| Step | 1280 × 720 | 375 × 812 |
|---|---|---|
| First-time introduction (T28 flow, rescue goal text) | [learn](rescue-learn-1280x720.png) | [learn](rescue-learn-375x812.png) |
| The haul: needle, green zone, treasure chest on the cliff, crew meter | [haul](rescue-haul-1280x720.png) | [haul](rescue-haul-375x812.png) |
| Result card and caption | [result](rescue-result-1280x720.png) | [result](rescue-result-375x812.png) |

Not shown: the rescue inside a real lost wave. That needs the `sim.js` hook described in the
[spec](../../../specs/T38-T39-minigames-rescue.md#the-sim-hook-still-needed-owner-of-simjs) and the flag `rescue`.
