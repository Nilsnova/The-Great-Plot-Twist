# Quest and boat flow evidence

Controlled component evidence for issue #462, used by Ianno and the peer reviewer. Source baseline: main `48aee0e7`; task branch `fix/boat-quest-flow`.

## Browser evidence

From `frontend/`, run `node ../docs/evidence/boat-quest-flow/capture.mjs`. Production HUD, island controller, ship card and boat scene run with the local fake server. A second fake captain starts wave 31 and the first joins while playing the boat. The recorded old save starts at goal 8 with two hired gunners and recovers to goal 10.

At both 1280×720 and 375×812, [capture.json](capture.json) confirms: no remaining boat or modal, captain input available, visible notice contained in the viewport, no countdown overlap or horizontal overflow, zero application page errors and zero external requests. Local Vite's blocked hot-reload WebSocket emitted eight console errors; these are retained as an explicit capture limitation, not presented as application failures or zero-console evidence. The capture stores no transient hot-reload token.

| Ship card before starting | Interrupted during countdown |
|---|---|
| [Desktop](ship-card-desktop.png) | [Desktop](interrupted-desktop.png) |
| [Phone](ship-card-phone.png) | [Phone](interrupted-phone.png) |

Screenshots are labelled component fixtures. They show the current production UI on a plain fixture background, not a live multiplayer battle.

## Checks

- Before implementation: three new saved-achievement cases failed. Chromium also reproduced the boat retaining input at countdown and a delayed scene opening after a wave transition.
- Focused command: `npm test -- --maxWorkers=1 tests/island/boat-transition.test.js tests/island/quest-progress.test.js tests/ui/first-quests.test.js tests/ui/hud.test.js tests/tutorial/guide.test.js tests/pirates/boat.test.js tests/pirates/boat-scene.test.js tests/island/card-model.test.js tests/island/dom.test.js` — **9 files, 97 tests passed** before final copy/visibility refinements. The final full suite includes the final wording, notice styling and visibility assertions.
- Final `npm test` on application source `d464c20a`: **349 files / 3847 tests passed**, 378.89 s, exit 0.
- Initial full `npm test`: **3846 passed, 1 failed, 349 files**, 325.56 s. The only failure was the text linter rejecting three new strings; those strings were corrected. `node scripts/text-lint/index.mjs` then reported **0 errors, 8 pre-existing report-only findings**.
- `npm run build`: passed after final notice colors/spacing; spoiler guard checked **243 text files and 12 protected lines**, no suspect elimination data.
- Bare `npm run test:mp` initially stopped before launching Chrome because its existing default output directory is a developer-specific `/Users/...` path. The actual command `npm run test:mp -- /tmp/boat-quest-mp` reached four players and failed at `check-multiplayer.js:813`: the owner musket pose was observed at 1 of 2 viewports (`1 !== 2`; phone passed, desktop failed). This presentation failure is separately tracked in [#421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421); the task changes neither the musket-pose renderer nor that assertion. The run reported no browser errors. Co-op builds/upgrades/research, wave/ship-fire synchronization, revive, pause/resume, shared next wave and late joins progressed first. Boss/finisher steps were not reached: **the full multiplayer gate is not passed**.
- `git diff --check`, capture-script syntax and 144 local document links: passed. Independent read-only agent source review found no remaining gameplay bug; it is not human peer approval.

## Limits and next step

Real Supabase room delivery, live wallet settlement, physical-device interaction and human acceptance are not verified here. Backend/SQL checks are not applicable to this frontend-only change. Best-score topups remain a product choice pending the user; D057 payout is preserved and explained before play. A different human teammate must review the current change before merge.
