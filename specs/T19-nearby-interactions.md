# T19 Nearby building interactions

> **What this is:** make building clicks, E and the phone Use action agree on interaction reach.
>
> **Who uses it:** players using keyboard/mouse or touch, and reviewers of the interaction code.

- Status: implemented and verified locally; author and independent human review pending.
- Responsible teammate: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/t19-nearby-interactions`, from main `3a88a7a`.
- Issue: [#6](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/6).
- PR: [#7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7).

## Scope and contract

Use the existing building interaction zones as the reach rule. A distant click must show
"Walk closer" without opening a card. Near a building, E or the phone Use action opens it.
A fallen teammate takes priority: holding E/Use helps them up rather than opening a building.
Retain the existing revival payment, timing and server authority.

Login, API calls/contracts, movement speeds and game rules stay unchanged. No files are deleted,
no packages are added and no migration is written or applied. Target under 400 changed code lines.

## Likely files

`frontend/src/island/world.js`, `frontend/src/island/index.js`, a small connection in
`frontend/src/game.js`, and focused island/input/revival tests. Reuse the existing zone and
wave-action rules; do not add a second interaction system.

## Acceptance checks

- [x] Near/far/boundary click tests: only the nearby target opens; distant clicks give a next step.
- [x] Keyboard E and phone Use open a nearby building once.
- [x] A reported revive takes priority over a building; overlays and a fallen local captain block input.
- [x] Existing tests remain valid; no false database/network evidence is claimed.
- [x] `npm test`, `npm run build`, `node scripts/report-budget.js --check`, `npm run test:a11y`, `npm run test:demo`, and the house text lint have exact recorded results in the PR.
- [x] Before/after captures at 1280 x 720 and 375 x 812: [evidence](../docs/evidence/T19/README.md).
- [x] WALKTHROUGH, TEST-MAP, OPEN-TODOS and required status/roadmap notes updated.
- [ ] Independent human review before merge.

## Limits and risks

This is browser interaction guidance, not a server-side anti-cheat rule. Watch for mismatched
radii, a Use button that consumes E before the revive hold, tap-to-walk side effects, and cards
opening behind another overlay. Physical phones and real multiplayer are distinct from fakes.

## Main integration and conflict resolution (14 Nov 2026)

Merged main `53a59d4` into this task branch using a merge commit, preserving both histories. No PR was merged into main.

Main now supplies the shared clickVerdict reach rule, flexible placement, poses and eDecision routing; those are retained. The remaining task delta guards building clicks while fallen or while the wave owns the action, and refuses an explicitly missing player position. The nine regression cases use the current position getter/onFar contract, the current Use label and zone.radius ± 0.001 (currently 2.599/2.601); assertions were retained. No login or API behavior was changed.

Commands below ran against the integrated working tree, from `frontend/` unless stated otherwise, with installed Chrome.

| Command | Actual result |
|---|---|
| `npm install` | Exit 0; existing package manifest and lockfile retained. |
| `npm test` | Test Files  261 passed (261); Tests  3213 passed (3213); Duration  129.99s (tests 86%, import 12%, transform 2%, worker 1%) |
| `npm run build` | ✓ built in 464ms |
| `node scripts/report-budget.js --check` | Exit 0; initial JS 18208 / 21080 bytes; CSS 8550 / 12000 bytes; title image None. |
| `node scripts/text-lint/index.mjs (repository root)` | Text lint: 3957 candidate strings in 443 source files; 0 errors, 8 report-only findings. |
| `npm run test:a11y` | Exit 0; 33 screens; failures: []; errors: []. |
| `npm run test:demo` | Exit 0; 33 checks; errors: []; external: []. |
| `npm run test:mp -- <local-output-folder>` | check-multiplayer: OK (4 pages) |

Documentation: local link targets and conflict markers checked; no unresolved index entries; `git diff --check` clean. Earlier screenshots and verification above/in the original PR describe the original feature baseline, not a new before/after capture of this synchronization. Fresh browser checks ran against the integrated state; generated output stayed outside tracked evidence.

Not verified: real Supabase/login/Realtime, actual database payments, physical phones, backend pytest/Ruff (no task changes to backend), or all eight pending PRs combined. The four-page T19 run uses the existing fake server and BroadcastChannel, not real Realtime. Remaining: independent human review of the updated diff; existing draft status is retained. No approval, force push, deployment or main merge was performed.
