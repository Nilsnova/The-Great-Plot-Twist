# T19 Nearby building interactions

> **What this is:** make building clicks, E and the phone Use action agree on interaction reach.
>
> **Who uses it:** players using keyboard/mouse or touch, and reviewers of the interaction code.

- Status: implemented and verified locally; author and independent human review pending.
- Responsible teammate: Johannes Franz Lang (@frcola), with Codex assistance.
- Branch: `feat/t19-nearby-interactions`, from main `3a88a7a`.
- Issue: [#6](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/6).
- Draft PR: [#7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7).

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
