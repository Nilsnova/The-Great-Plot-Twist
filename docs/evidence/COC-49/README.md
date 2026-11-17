# COC-49: real screenshots of the bounded village mode

These are screenshots of the local running browser game, not generated concept
art. The game uses its existing fake island transport: no live login, backend,
production database, multiplayer service or Safari compatibility is established.

Baseline is an archived frontend from main
`a09787c079ba2921fb05facdecb41f61ca8ab84d`; after is this feature branch.
Both use the same fake setup, one cannon and captain location. The initial cannon
purchase uses the ordinary fake API; this feature does not award the 70 coins.

| Viewport | Before: Explore rejects distant selection | After: visible management | After: existing remote card |
|---|---|---|---|
| 1280 × 720 | [Before](before/before-1280x720.png) | [Mode](after/mode-1280x720.png) | [Card](after/after-1280x720.png) |
| 375 × 812 | [Before](before/before-375x812.png) | [Mode](after/mode-375x812.png) | [Card](after/after-375x812.png) |

## Reproduce

From `frontend/`, with the existing dependencies:

```sh
node scripts/capture-village-mode.mjs /path/to/archived-main/frontend /tmp/coc49-before
node scripts/capture-village-mode.mjs . /tmp/coc49-after manage
```

The runner checks remote-card behavior, mode state, bar viewport bounds, browser
errors and external requests. The after capture also checks that the Exit
button is the actual topmost hit target, including while narrator captions show. Both `capture-results.json` files record the actual
setup and observations. The baseline has no village mode property.

## Focused verification

```sh
npm test -- --maxWorkers=1 tests/island/village-mode.test.js tests/island/village-game.test.js
```

Original implementation run: `Test Files 2 passed (2)`, `Tests 13 passed (13)`, duration `28.26s`.
It covers own-only entry, reservation/context/disposal, Explore's reach rule,
remote selection, held captain movement, text-input arrows, Enter on Cancel,
Escape placement/mode hierarchy and accepted bell exit at both viewport sizes.

The follow-up reservation regression held a successful start's defended-island
prepare read before `ringBell()` resolved. It proved that mode/bar/placement were
already cleared, `flow.current` was still null, and re-entry/remote picking were
blocked. That full mode/browser batch reported `2 passed (2)` files and
`14 passed (14)` tests in `30.41s`. One further pending/refused-join model case
was then added and the final pure controller/flow file reported `13 passed (13)`;
the two browser cases were unchanged by that extra model-only test. Root's
combined validation remains separate.

The final Menu-eligibility/boundary follow-up used:

```sh
npm test -- --maxWorkers=1 tests/island/village-mode.test.js tests/island/village-game.test.js tests/islet-boundary.test.js
npm test -- --maxWorkers=1 tests/island/dom.test.js -t 'builds from the card'
```

The first reported `3 passed (3)` files and `88 passed (88)` tests in `30.52s`.
The selected legacy DOM/card/menu case reported `1 passed | 7 skipped (8)` in
`3.48s`; those seven cases were not selected by `-t`, not removed or weakened.
The controller now exposes pure eligibility and the Menu hides Manage while
unavailable. Existing islet boundary assertions now check the actual
`captainBlocked` call sites and additionally lock its OR-composition with
`outsideBlocked()` and management; all StopPlots/external-overlay checks remain.

Two initial runs reached the first desktop test's existing 20-second runner
limit; the phone case and controller cases passed. A quiet run with the original
shared runner and no module warmup passed 13/13 in 27.80s. After adding the
focused-Cancel guard, one test fixture incorrectly expected raw `spot.z` on an
unmoved spot; the API omits it and placement uses defaults. The final assertion
compares the complete authoritative spot before/after cancellation instead,
then the unchanged strict runner passed 13/13 in 28.26s. No timeout was increased,
assertion removed or shared test harness changed.

`node scripts/text-lint/index.mjs`: 0 errors and 8 existing report-only findings.
`git diff --check` passed. Root coordinates the full frontend suite, build,
budget, accessibility and demo checks after integrating independent lanes; those
checks are not claimed here.

## Limits

A visual inspection initially found the narrator covering the management bar;
the final CSS reuses the existing narrator-height variable and both final captures
passed the Exit hit test.

This first slice has no independent editor camera or new catalogue. A separate
COC-02 fit-camera follow-up uses the `managing` flag so the whole base can be
reached while the captain is stationary. The current screenshots show this
bounded slice, not that later feature. This PR remains draft and is not merged.
