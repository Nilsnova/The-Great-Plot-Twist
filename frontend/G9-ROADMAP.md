# G9 required-feature finish queue

Nils confirmed this scope on 7 November 2026: finish the required G9 features and a verified team
handoff. **All 17 overflow items are deferred.** Keyboard, touch, gamepad and accessibility remain
required. The approved pixel style, server authority, replay, privacy and budgets remain unchanged.

Work in 30–60-minute slices toward these 22 reviewable results. A failed check gets a specific
follow-up slice; it does not become an unexplained multi-hour task. Long sequential browser gates
may span two slices: report their command and progress, keep source frozen, then continue the same
run. Commit coherent streams; publish after the required checkpoint checks. A local commit is not
a remote handoff.

## Current pickup state

- Branch: `feat/g9-real-adapter`. Last verified remote head: `8844962`, including islet source
  `e720eaf`. Main `64fc731` is adopted. Do not reset, recreate, rebase or force-push this branch.
- Stream 9, the Exchange, completes the first slice locally: all 11 stream commands pass, including
  3,130 unit tests, 106 market checks, 14 fault cases / 81 checks, aggregate online/fault checks,
  accessibility and the world check. Source/evidence are delivered with this handoff.
  **Remote Exchange readiness requires chunk 2's committed-source regression and push.**
- Predictions/arena, bulletin, production/CSP and input work already have prepared drafts. These
  are coordinator-owned, local and unverified until their gates pass. Reuse them; do not rebuild
  them or describe them as published features.
- Read `HANDOFF-G9.md` for exact source/evidence and `G9-BRIEF.md` for acceptance details. This file
  is the short execution queue; it does not replace the approved contracts.

## Work slices

| # | Result | Completion check / dependency |
|---|---|---|
| 1 | Close the Exchange implementation | Finish its stream checks, address new failures, commit source/evidence and update the handoff. Keep R16's hardware failure explicit; do not claim a completed checkpoint. |
| 2 | Publish a usable team baseline | Run the exact committed-source 44-command driver and engineering scan, preserve every failure, push normally and verify the remote SHA. Publish pickup instructions. |
| 3 | Adopt prediction and duel fixes | Reconcile the prepared C10 code; focused cooldown, safe error-copy, credits and lifecycle tests pass. Disjoint leaf reviews can run in parallel. |
| 4 | Verify and commit both panels | Recorded stake/full duel, fresh local 1280/375 journeys, strict-off, five-minute flag refresh, recovery, Escape and accessibility pass; run the stream gate. |
| 5 | Adopt the bulletin reader | Reconcile prepared C11 data/projection/controller code; public-only requests, stale/off states, nullable attribution and safe failures pass focused tests. |
| 6 | Verify and commit the bulletin | Recorded read/retry/cache/announcement paths, production-off and the stream gate pass. Preserve read-only behavior and public 401/409 handling. |
| 7 | Prove the production adapter boundary | Use the prepared C16 proof. Production uses the real/disconnected path; development stand-ins stay guarded; the server-free demo still works. |
| 8 | Compose final security checks | Use the prepared C17 fixture/runner. Shared account, wallet, save and SDK ownership are consistent; authoritative CLI wiring tests pass. |
| 9 | Integrate required input components | Reuse the prepared focus/navigation, Back release, HUD, text editor and finale-stick work. Wire ownership/cleanup and pass native component tests. |
| 10 | Prove account and crew input | Public keyboard, actual touch and gamepad paths enter/edit/confirm/back correctly, with no movement behind controls or stale-account input. |
| 11 | Prove panel input | The same input modes exercise islet, Exchange, prediction and duel actions through public controls; preserve UID, wallet and save assertions. |
| 12 | Map the published case view | **R11 first.** Map only authorized serialized DTOs and placeholder fixtures; conformance and earned-state guards pass. |
| 13 | Prove case freshness | Push/deadline/poll/hidden-tab rules, reload/effect memory and null-case-to-Crew behavior pass; stream 12 is committed. |
| 14 | Finish board and searches | Pin/pair, refusal/success, price reconfirmation and completed-search paths pass with keyboard/touch and the stream-13 gate. |
| 15 | Finish partner orders | Supported fetch/man-light intents, unsupported-order refusals, authoritative progress and receipts pass; stream 14 is committed. |
| 16 | Finish the three-light night | Supplied posts, aim, normalized bearings, accepted locks and once-only effects pass. No inferred winning angle or server outcome. |
| 17 | Finish solve and the changed coast | Wrong-accusation cooldown, solve, runtime-only reveal and locked/relit world pass spoiler/privacy checks; stream 15 is committed. |
| 18 | Complete input and phone proof | Add case actions to the modality paths. Audit 375×812, 390×844, 812×375, 320 px and the short code field; stream-18 gate and parity table pass. |
| 19 | Close performance and load evidence | Check lazy-load inventory, unchanged byte/draw/resource/wire budgets and telemetry. R16 hardware proof is a separate external dependency. |
| 20 | Complete the recorded golden path | One coherent 1280/375 path covers all required features, shared wallet/save state, sign-out/deletion and required fault groups. Split happy/fault runs if needed. |
| 21 | Finish security, screenshots and docs | All six composed CSP flows pass. Code-matched docs and indexed placeholder screenshots fit evidence budgets; manual-device limits are explicit. |
| 22 | Publish the final handoff | Freeze source, run the full driver/new gates and engineering scan, update the handoff, push and verify its SHA. Supply the paste-ready Claude update. |

Items 3–11 can progress while R11 blocks the case lane. Items 12–17 become ready when the required
contract and routes are published. Final input/golden checks follow the implemented features.
Publishing slices recur at coherent boundaries; item 2 is the first one, not the only one.

## Parallel ownership and external work

- The coordinator owns shared hooks, application of prepared changes, browser/runtime checks,
  commits and pushes. Bounded workers may prepare or review disjoint leaf files concurrently.
  Keep one browser owner, including unit commands that launch Chromium.
- A teammate taking code work starts from the published SHA on their own branch and agrees the
  file boundary first. Do not edit the active G9 worktree or duplicate coordinator-owned drafts.
  Every handoff states the source SHA, changed files, checks, unresolved failures and next command.
- **G10 / R11:** publish the exact redacted serialized nested case DTOs and fixtures on the
  authorized case branch. No frontend estimate substitutes for this dependency. Never inspect
  secret case data or private implementation to fill a missing contract.
- **Presenter proof / R16:** run unchanged offline/intercepted frame checks on approved hardware
  and publish the source SHA and numeric result. Cloud frame failures remain failures.
- **Claude:** owns main integration, server/platform settings and deployment. G9 changes only
  `frontend/`, apart from the already approved eight-word dictionary exception.
- Live accounts, services and databases are outside the authorized test policy. No live-service
  or database pass is claimed. Actual device/assistive-technology results remain manual evidence,
  not something inferred from headless Chromium.

## Work removed from the active queue

- All 17 overflow items. Revisit them only after the required-feature handoff.
- New packages, art, fonts, visual redesigns and general-purpose frameworks are unnecessary here.
- Rebuilding already prepared modules, unrelated refactors and repeated copies of the same proof.
- Repeating a standalone journey when an aggregate already executes the identical function with
  identical options on unchanged source. Reduced `extended:false` runs do not replace local or
  hot-flag coverage. Keep all required gates; rerun affected checks after fixes and the full driver
  before a push.

This queue keeps required gameplay, account/save integrity, outcome authority, privacy, spoilers,
security, input access and regression proof. A blocker or an unverified environment stays visible
in the handoff; it is never converted into a passing check.
