# Captain attack feedback evidence

Native causal traces and verification for issue #476, used by Ianno and the peer reviewer. Baseline: current main `37eb70fa`; branch `fix/captain-pose-feedback`.

## Native causal boundary

The unchanged [baseline multiplayer run](main-baseline-mp.log) fails at `check-multiplayer.js:814`, with the owner's musket pose observed at one of two viewports (`1 !== 2`). The native observer and its timeouts remain unchanged in this task.

The staged traces use an actual eligible legacy shot, not an injected pose or forced outcome. Actor HP 100, standing, target HP 24, range 14 and distance 7.75 establish eligibility before `shoot(targetId)`; the matching canonical `captain_fired` event establishes acceptance. An initial attempt with a cannon was inconclusive because its nearly dead target sank before the scheduled input; it supplied no accepted event and is excluded from the causal conclusion. The corrected fixture contains no defensive cannon.

| Stage | Accepted shot | Pose after handler | Actual rendered pose |
|---|---|---|---|
| [Unchanged main](baseline-accepted.json) | Yes | None | None |
| [Live-input correlation only](provenance-only.json) | Yes | Present, age 0.012 s | None; next game read was over 1 s later |
| [One frame, preliminary candidate](same-frame-candidate.json) | Yes | Present | Firing and ready frames |
| [Final movement/combat/draw hook](final-native.json) | Yes | Present | Firing frame |

The first three stages were bounded observations using the existing multiplayer startup helpers, with temporary passive event/get/update/render wrappers. The preliminary same-frame candidate sampled combat before movement; review identified that input-order risk and the final hook preserves movement first. The final reproducible probe records exact SHA-256 hashes of six application files. Its `source` is the baseline ancestor and `dirty:true` explicitly records the then-uncommitted task patch; the file hashes identify the final application. No pose durations, simulation rules, FPS/quality settings or observer budgets were increased. Frame gaps are observations, not an imposed clock.

## Reproduce the final native probe

From `frontend/`:

```sh
node ../docs/evidence/captain-pose-feedback/native-probe.mjs /tmp/captain-pose-probe
```

This opens two real game pages with local fake accounts, starts a real fake-server wave and submits one shot only when the target is in the actual captain's range. It observes accepted events, getter values and actual renderer calls. A one-time canvas readback captures the already rendered pose; it does not inject one. `EXPECT_POSE=0` retains a baseline diagnostic without requiring a successful pose, while still requiring a genuinely accepted eligible shot, high quality and no browser errors/external requests.

The original short-form startup probe encountered a self-closing intro before its Skip click; the final helper handles that existing transition. The final probe completed with `accepted:true`, `drawn:true`, high quality and zero application page errors, console errors or external requests. [Rendered accepted frame](native-accepted-frame.png) is a local synthetic game, not authenticated online multiplayer.

## Native multiplayer images

| Viewport | Own captain | Teammate figure |
|---|---|---|
| Desktop 1280×720 | [Crop](own-desktop.png) | [Crop](teammate-desktop.png) |
| Phone 375×812 | [Crop](own-phone.png) | [Crop](teammate-phone.png) |

These are the original native checker's screenshots, not a new pose fixture or changed assertion.

## Checks

- Meaningful red regressions: accepted live shot under a visible 1.8 s stall; original chronological pose order across promoted/fresh events; movement/combat/draw phase order. The expected behavior was preserved when implementing fixes.
- `npm test -- --maxWorkers=1 tests/redesign-movement.test.js tests/pirates/live-attack-feedback.test.js tests/pirates/controller.test.js tests/pirates/poses.test.js tests/pirates/multiplayer.test.js tests/pirates/recovery-controller.test.js tests/pirates/recovery-wave-end.test.js`: **7 files / 83 tests passed**, 3.05 s.
- `node scripts/text-lint/index.mjs`: **0 errors / 8 existing report-only findings**.
- An intermediate multiplayer run was deliberately interrupted to preserve movement-before-combat ordering before continuing final verification; it is not a passing result.
- `npm run test:mp -- /tmp/captain-pose-final-mp` on application `0b714732`: **OK (4 pages)**, exit 0. The unchanged journey passed own/teammate poses at both viewports, four-player joining, synchronized combat/ship fire/HP, revive, pause/resume, shared next wave, boss-wave admission, T28 personal practice separation and a shared four-page finisher result. [Exact raw log](final-multiplayer.log).
- Joint `npm test` on `9ff8cd8b` (latest main + pose + boat/quest): **421 files / 4627 tests passed**, 388.98 s, exit 0. [Exact full-suite log](joint-frontend.log).
- Joint `npm run build`: **passed**, 698 ms, including the spoiler guard (**245 text files / 12 protected lines**). [Build log](joint-build.log). Application files are identical at `465c8e39` and `9ff8cd8b`; the latter includes the source-guard alignment.
- The first joint run had 4626 passes and one source-string guard expecting the old two-argument movement call. That guard now recognizes the callback-bearing gated call and retains its overlay assertion. Targeted guard/movement/live-feedback checks: **3 files / 98 tests passed**, 908 ms. The subsequent complete suite passed.
- Final application source, diff and document-link checks passed; independent read-only review found no actionable integration defect. Components remain separately reviewable in Drafts #481 then #467.

## Limits

No live Supabase delivery, authenticated wallet, physical-device rasterizer or human acceptance is established by local fake-browser evidence. A separate human teammate must review the current change before merge. The separate boat/quest patch remains in Draft #467; this task adds no payout rule, backend, migration, dependency, service or deployment.
