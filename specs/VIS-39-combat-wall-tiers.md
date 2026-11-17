# VIS-39: readable material wall tiers during combat

Issue: [#393](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/393).
Draft: [#394](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/394).

## Goal

Remove redundant level stars from combat walls that already use the approved material/post atlas. The actual composed wave capture (`stage-04/wave-projectiles-1280x720.png`) shows repeated stars over 21 level-three inner walls, obscuring the new wall materials. Parent: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one renderer-polish agent in a separate clone, pinned to the coordinator's frozen `414559fb` integration dependency.

## Scope

Only the existing pip condition in `frontend/src/pirates/render.js`, meaningful actual renderer-buffer tests and a bounded spec. Suppress pips only when the post is a wall and the active material wall renderer confirms `wallConnections.hasPost(id)`. Preserve all tower pips, legacy/pixel wall pips, health, smoke, repair/crew behavior, collision and gameplay. No new dependency, flag, source artwork, main/force push or merge.

## Acceptance and verification

- An actual material-wall level-three renderer layer contains no redundant pip quads.
- Its legacy/pixel fallback still draws the existing three pips.
- A level-three tower retains its pips.
- Use actual renderer root/layer buffers, not a new Boolean helper test. Run focused pure checks and build. No Chrome until the coordinator grants a slot.
- Final composed-game screenshot acceptance, full suite and human review remain coordinator work. Keep Draft; no production activation.

## Implemented

The existing pip condition now excludes a wall only when the active material
renderer confirms it actually supplies that post. A missing/new-atlas fallback
therefore keeps the old sprite and level markers. Towers retain their pip
condition. The adjacent sprite, health, smoke, repair and crew paths were not
changed. No second state flag or Boolean helper was introduced.

## Exact verification

Verified runtime source: `1bf8e1c552ef48837dfbf1e64af0eedbfeeaaf21`.
Before the condition change, the new actual renderer-buffer test failed:
the material L3 post still emitted three pip instances where zero were
expected. Legacy-wall and tower cases already passed. After the fix, from
`frontend/`:

```text
npx vitest run tests/pirates/material-wall-pips.test.js tests/pirates/render.test.js tests/pirates/rebuilt-wall-look.test.js tests/pirates/wall-connections.test.js
Test Files  4 passed (4)
Tests       21 passed (21)
Duration    2.61s

npm run build
Built in 1.01s
Spoiler guard: 244 text files, 12 protected lines, no suspect elimination data.

node scripts/report-budget.js --check
Exit 0; cold-title JavaScript 18,825 bytes, CSS 9,410 bytes.
```

From the root, `node scripts/text-lint/index.mjs` exited 0:
`4538 candidate strings in 532 source files; 0 errors, 8 report-only findings.`
The existing report-only findings were not changed.

The new test creates the actual wave renderer, actual material wall connection
buffers and actual per-defense instanced layers. It identifies pip rectangles
from their UV coordinates and counts emitted instances. The material L3 wall
retains its real wall-post buffer and emits zero redundant layer instances;
the legacy L3 wall still emits its sprite plus three pips; a L3 cannon keeps
the same sprite and three pips even when a material wall atlas is available.
The adjacent existing renderer, break-restoration and wall-connection checks
also pass. These are CPU geometry/lifetime tests, not GPU screenshot evidence.

No Chrome was launched in this lane. Root owns the composed before/after
combat captures and full frontend/a11y/demo verification. Live account and
production behavior are not verified here. Keep Draft and the issue open
until applicable final acceptance and human review.

## Explain-back

I avoid drawing the same wall tier twice. The new material post already
identifies its level, so I omit its extra star row only after that renderer
confirms the actual post exists. I preserve the old markers when the new
renderer is unavailable, and keep tower markers because their presentation
still uses them. The test inspects real emitted sprite buffers rather than
testing a separate helper that could disagree with the renderer.

1. Why must the guard check an actual material post instead of a feature flag?
2. Which markers remain when the new wall atlas is unavailable?
3. How do the buffer assertions distinguish removing stars from losing the wall?
