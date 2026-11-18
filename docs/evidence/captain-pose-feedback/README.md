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

## Checks

- Meaningful red regressions: accepted live shot under a visible 1.8 s stall; original chronological pose order across promoted/fresh events; movement/combat/draw phase order. The expected behavior was preserved when implementing fixes.
- `npm test -- --maxWorkers=1 tests/redesign-movement.test.js tests/pirates/live-attack-feedback.test.js tests/pirates/controller.test.js tests/pirates/poses.test.js tests/pirates/multiplayer.test.js tests/pirates/recovery-controller.test.js tests/pirates/recovery-wave-end.test.js`: **7 files / 83 tests passed**, 3.05 s.
- `node scripts/text-lint/index.mjs`: **0 errors / 8 existing report-only findings**.
- An intermediate multiplayer run was deliberately interrupted to preserve movement-before-combat ordering before continuing final verification; it is not a passing result.
- Final original multiplayer, complete frontend, build and diff checks: in progress; update this record with exact outcomes before handover.

## Limits

No live Supabase delivery, authenticated wallet, physical-device rasterizer or human acceptance is established by local fake-browser evidence. A separate human teammate must review the current change before merge. The separate boat/quest patch remains in Draft #467; this task adds no payout rule, backend, migration, dependency, service or deployment.
