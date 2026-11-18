# BASE-51 actual current-goal demo journey

The documented demo command passes with the intentional one-current-goal HUD. Future goals remain hidden. The QA journey now opens the actual current Wave hint, completes Wave and Defend through the existing rehearsal controls, returns to the Harbor while Lamp is current, then exercises the unchanged exact lamp hint and both original lamp finales.

No runtime file or gameplay rule changes. The source uses the normal Goals disclosure and current-row buttons. The existing scripted travel/position setup, recorded lock responses, simulated captains and duel radio fixture remain QA scaffolding; goal completion is not injected. If the first ordinary Point battle ended during the Harbor visit, the real projector bell can start the next battle before continuing.

## Source and exact result

| Item | Identity |
|---|---|
| Responsible teammate | Johannes Franz Lang (`frcola`) |
| Task / Draft | [Issue #341](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/341) / [Draft #342](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/342) |
| Assigned pinned runtime base | `1fd16f1fc0055edc832f3a849b6959e77e78ca2b` |
| Spec-first claim | `40d8fe11760e54027b99abd8b38ebd0b8d698735` |
| QA flow source | `ab73718cf5b93f32affaca7822ec224345c29167` |
| Executed source, including hint captures | `37be80880e91562b510d09796d62340c6fc76579` |

```sh
SHOTS_DIR=/workspace/village-perimeter-work/base-51-demo-run npm run test:demo
```

**Exit code: 0.** The untouched [raw log](run.log) and [journey report](journey.json) record 34 executed default checks, `errors: []`, `external: []`, and `perf: null`. The [audit manifest](audit.json) records source, command and preservation checks. One coordinated Chromium process ran; no other browser task ran concurrently.

The existing assertion set is preserved verbatim: **34 original standalone `check(...)` assertion calls**, plus one new current-Wave hint assertion. One assertion belongs to optional `--perf`, which was not run; the default run therefore records 34 results. An earlier broad call-site count of 35 also counted the unchanged Playwright radio `.check(...)` method; that method is not the assertion helper. All original explicit timeouts and waits remain unchanged.

The run retains the recorded wrong/right Keeper's Lock path and action IDs, Wave, friendly duel reveal, real Point Defend progress, exact lamp hint, Harbor lamp/relight/caption checks, projector QR, Point captains/lamps/flagship finale, no rehearsal server writes, pause/resume and error/external-request checks.

## Actual goal proof

| Real UI state | Screenshot |
|---|---|
| Current Wave, 0 of 3 complete; its visible hint is open | [Current Wave hint](03b-current-wave-hint.png) |
| Real Wave and Defend complete, 2 of 3; Lamp is current before lighting | [Current Lamp hint](28b-current-lamp-hint.png) |

These are untouched screenshots of the actual renderer/controls at 1280 × 720. Future goal rows are not revealed through CSS changes or forced hidden-goal clicks. The active battle HUD intentionally hides the Goals strip, so the lamp hint is checked after the ordinary return to the Harbor.

The full 22-shot run remains at `/workspace/village-perimeter-work/base-51-demo-run`; two current-goal screenshots are committed to keep the review focused. All lock/wave/finale results remain in the committed raw report/log.

## Limits and handover

The run uses offline recorded services and simulated captains. Optional performance mode, physical devices, Safari, live accounts/services and production are not verified by this QA maintenance. The coordinator owns the broader integration gates. Johannes still needs to review/explain the change and obtain a different human's approval. Keep Draft; no merge, deployment, activation or migration application.
