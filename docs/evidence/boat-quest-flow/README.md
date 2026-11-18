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
- Focused command: `npm test -- --maxWorkers=1 tests/island/boat-transition.test.js tests/island/quest-progress.test.js tests/ui/first-quests.test.js tests/ui/hud.test.js tests/tutorial/guide.test.js tests/pirates/boat.test.js tests/pirates/boat-scene.test.js tests/island/card-model.test.js tests/island/dom.test.js` — **9 files, 97 tests passed** before final copy/visibility refinements. A final full-suite run is in progress.
- Initial full `npm test`: **3846 passed, 1 failed, 349 files**, 325.56 s. The only failure was the text linter rejecting three new strings; those strings were corrected. `node scripts/text-lint/index.mjs` then reported **0 errors, 8 pre-existing report-only findings**.
- `npm run build`: passed after final notice colors/spacing; spoiler guard checked **243 text files and 12 protected lines**, no suspect elimination data.
- Bare `npm run test:mp` initially stopped before launching Chrome because its existing default output directory is a developer-specific `/Users/...` path. The documented positional output-folder argument will be used for the actual run.
- `git diff --check`: passed. Independent read-only agent source review found no remaining gameplay bug; it is not human peer approval.

## Limits and next step

Real Supabase room delivery, live wallet settlement, physical-device interaction and human acceptance are not verified here. Backend/SQL checks are not applicable to this frontend-only change. Best-score topups remain a product choice pending the user; D057 payout is preserved and explained before play. A different human teammate must review the current change before merge.
