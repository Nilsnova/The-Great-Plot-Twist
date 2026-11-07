# Intro dialogue redesign

Presentation and verification handoff for Nils' visual simplification request. Used by the integration agent.

## Changed

- A fixed story box replaces the overflowing scene, notice, inventory and move-log stack. It is 330px tall on desktop and bounded by the viewport; phones use the available height up to 420px. The duplicate goal line is hidden, the title is quieter, and empty ending choices reserve no space.
- One short passage appears at a time. Continue replaces it, Show full text reveals it immediately, and the existing instant-text and reduced-motion preferences still work.
- Two original actions appear per batch. More actions cycles through every remaining action without recording a game move or replaying the typewriter. Keyboard numbers and arrows operate the currently visible choices.
- Early scene summaries and action labels are shorter. The public story file, action IDs, conditions, engine, endings and accepted move journal are unchanged. Original scene prose, conditional notes, pockets and the accepted move trail remain in the optional Journal.
- The original ending-summary element and arrival slot retain their DOM relationship for the referee/G9 integration. The duplicate summary is hidden because the same original ending prose is paged above and available in Journal.
- `createIntro(ctx)` accepts optional `ctx.onSceneChange(scene)`. It fires on the initial shown engine scene and subsequent engine scene changes. Passage paging, action batching, same-scene item actions and rejected actions do not fire it. Existing events and `onEnding` payloads are unchanged. The integration owner requested this callback for the full-screen room presentation.

## Verified

From `frontend/`:

```sh
npm test -- --reporter=dot tests/intro-pages.test.js tests/g8-ending-view.test.js tests/intro-adapter.test.js
node scripts/check-intro-pages.js
npm run build
```

- 14 tests pass across three focused files. They cover lossless bounded pages, faithful display summaries, preserved IDs/conditions, new-note delivery, original ending prose, exact accepted-action replay, and the existing ending/arrival DOM contract.
- Chromium component proof passes 77 checks. It uses the actual intro controller, original story JSON, engine, adapter and browser journal. Viewports: 1280×720, 375×667, 320×568 and 844×390. It checks replaced passages, stable compact dimensions, controls and text fitting, opt-in original prose, Journal Escape, keyboard/reveal/repeat handling, reduced motion, scene callbacks, both actual endings, internal scrolling for long arrival content, disabled actions, reload restoration, restart, and a 503/retry read.
- Production build and spoiler guard pass: 140 text files, 12 protected lines, no suspect elimination data.
- `git diff --check` passes.
- Screenshots inspected at desktop and phone sizes. Evidence is local and untracked in `/tmp/intro-compact-checks/`: opening-1280.png, opening-375.png, opening-320.png, opening-844.png, ending_rescue.png, ending_trapped.png, ending_rescue-arrival.png, ending_trapped-arrival.png and report.json. The compact follow-up reruns only the targeted browser proof; the earlier 14 tests and build were already green and its JavaScript behavior is unchanged.

## Integration notes and remaining checks

- The existing `scripts/check-intro.js` assumes all actions are visible immediately after revealing a scene. Its helper needs to consume `[data-choice="intro:next"]` first, revealing any active typewriter, then cycle `[data-choice="intro:more"]` until the requested original ID is visible. The new `check-intro-pages.js` contains working `pages(page)` and `choose(page,id)` helpers. The old script is outside this agent's assigned write scope.
- The text audit reports ten editable-copy occurrences of seven legitimate new words: catches, disappear, warn, trail, chapter, journey and continues. The integration owner owns their reviewed additions to `scripts/text-lint/words.txt`. No dictionary or policy was changed here. Existing report-only findings are unaffected.
- The optional callback needs to be recorded in the shared contract documentation by the integration owner, who owns the game/shell integration files.
- This proof uses a deterministic component harness rather than the full Three.js game. Full-screen interiors, global HUD, movement, multiplayer, cloud saves, deployment and the in-flight G9 branch remain with their assigned owners. No dependency, secret, feature flag, backend content, database or production setting was changed.
- The worktree temporarily used a `frontend/node_modules` symlink to the existing shared installation. The symlink is untracked and must not enter the commit.

Branch: `feat/redesign-dialogue`, based on `f91f541`. No push or deployment is performed by this agent.
