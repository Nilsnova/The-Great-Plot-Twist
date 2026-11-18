# T59 repair feedback evidence

**Current UI evidence, 18 Nov 2026.** The new captures below use the approved wave-end rule: repaired structures return to full HP when a wave ends, with no gradual-repair ETA. The earlier capture sections in this file document the preceding design and are historical; their free-repair ETAs and bell-pause copy are superseded.

Captured from the production island card DOM with offline fixture DTOs using `cd frontend && node scripts/capture-structure-recovery-card.js`. Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium`). The fixture does not call an API or charge coins. It supplies old rate/ETA fields in sample responses to verify the UI ignores those promises.

| Viewport | Scenario | Screenshot |
|---|---|---|
| 1440 × 900 desktop | Damaged wall, exact HP, fixed price, full free restoration when a wave ends | [Wave-end restoration](wave-end-20261118-restoration-desktop.png) |
| 390 × 844 phone | Destroyed cannon during a reserved wave, paid repair price and two shared uses remaining | [Paid repair quota](wave-end-20261118-paid-quota-phone.png) |
| 390 × 844 phone | Health loading, visible disabled Upgrade and the helper “Wait until building health has loaded.” | [Upgrade health loading](wave-end-20261118-upgrade-loading-phone.png) |
| 1280 × 800 desktop browser | Saved Workshop role is recorded but inactive; Barracks and Tavern remain selectable | [Inactive saved Workshop](wave-end-20261118-house-role-inactive-desktop.png) |

The captures verify the Repair button fits the phone viewport and the tiny-positive health sample keeps a one-pixel fill. The house-role view shows the saved Workshop as inactive and the Barracks and Tavern choices. Source logic suppresses the inactive Workshop's selection ring under recovery v1; the standalone card fixture does not render the world scene. These are rendered production UI views with local fixture data; they do not demonstrate a persisted island response, payment, server recovery, multiplayer or deployment.

Verification on 18 Nov 2026 from `frontend/`:

```sh
node scripts/capture-structure-recovery-card.js
./node_modules/.bin/vitest run tests/island/structure-recovery-model.test.js tests/island/structure-recovery-card.test.js tests/island/card-model.test.js tests/campaign/captain-repair-policy.test.js tests/tutorial/unlock-cards.test.js tests/tutorial/tutorials.test.js tests/tutorial/host.test.js tests/narrator/narrator.test.js --maxWorkers=1
npm run build
```

The capture script passed and emitted the screenshots listed above using offline fixture DTOs. The focused suite passed 8 files and 133 tests. The production build passed; the spoiler guard checked 243 text files with 12 protected lines and found no suspect elimination data. `git diff --check` passed from the repository root.

**All screenshots here use offline fixture data; they do not demonstrate live API, payment, game runtime, or multiplayer.** The standalone component button reports an intent to the preview page; it sends no request and changes no health or coins.

Captured from source commit `10d409c1` with:

```sh
cd frontend && npm run test:recovery:component
```

The command starts the local Vite server and opens the standalone fixture in headless Chromium. Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium` by default; `CHROME_PATH` may override it). No game URL, feature flags, API or multiplayer service is used.

| Viewport | Screenshot |
|---|---|
| 1440 × 900 desktop | [Desktop component preview](../../../frontend/captures/t59-recovery-component-desktop.png) |
| 390 × 844 phone | [Phone component preview](../../../frontend/captures/t59-recovery-component-phone.png) |

The fixture uses current level-one values from `BUILDINGS` in `frontend/src/island/td-rules.js` and `towerMaxHp` in `frontend/src/pirates/tower-health.js`. It shows a wall at 45/60 HP for 10 coins with a 150-second base-rate ETA; a destroyed cannon at 0/80 HP for 30 coins during preparation with two uses remaining; and a harpoon at 0.00006/60 HP for 40 coins with a 600-second base-rate ETA. The preview calculates those ETAs from the D059 base rate. These screenshots demonstrate presentation only.

## Production island card preview

**Standalone fixture only; the production island card UI is rendered without a game API, game session, payment request, feature-flag setup, or multiplayer client.** The preview button emits a local fixture intent only.

Captured from source commit `e59a0b25` with:

```sh
cd frontend && npm run capture:recovery:card
```

Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium`; `CHROME_PATH` may override it). Chromium runs headless with `--no-sandbox --disable-dev-shm-usage`. The capture uses fixture DTOs in `frontend/tests/fixtures/structure-recovery-card-preview.js` and current level-one catalogue values from `BUILDINGS` and `towerMaxHp`.

| Viewport | Scenario | Screenshot |
|---|---|---|
| 1440 × 900 desktop | Wall, 45/60 HP, 10 coins, 150-second free ETA | [Between-wave card](../../../frontend/captures/t59-structure-card-between-desktop.png) |
| 390 × 844 phone | Destroyed cannon, 0/80 HP, 30 coins, preparation, two uses left | [Preparation card](../../../frontend/captures/t59-structure-card-preparation-phone.png) |
| 375 × 812 phone | Harpoon, 0.00006/60 HP, 40 coins, one-pixel bar, 600-second free ETA | [Tiny-positive card](../../../frontend/captures/t59-structure-card-tiny-phone.png) |

The capture checks visible repair controls at phone widths and verifies the one-pixel positive HP fill. It does not show live service responses or an actual repair. Runtime evidence remains pending for real between-wave healing, preparation/combat pause and quota, zero/partial/full HP, and two actual clients.

### Bell-pause estimate wording refresh

The card screenshots above were refreshed from source commit `3ce09753` on 17 Nov 2026 with:

```sh
cd frontend && npm run capture:recovery:card
```

The production card now tells players that free repair pauses when the bell rings and that the displayed estimate counts only time between waves. The fixture derives build and next-level upgrade costs from `BUILDINGS` for each sample's kind and level; capture assertions check Wall 20, Cannon 60, and Harpoon 80. The fixture still provides offline DTOs; the button emits a local intent and does not call an API. At desktop and phone sizes the text wraps without clipping. The preparation phone capture correctly shows paused status and remaining uses with no ETA.

The focused model check also passed from this revision:

```sh
cd frontend && npx vitest run tests/island/structure-recovery-model.test.js
```

Result: 1 file, 24 tests passed. The refreshed image paths are the three rows in the production island card preview table above; no live service, payment, database, or multiplayer behavior is demonstrated.

## Integrated UI with offline signed-shape adapter

**These captures run the production island card, world scene, `wireWaves`, controller, and replay code with a local offline API fixture. It returns API-shaped DTOs but makes no authenticated request and uses no live account, charge, database, or second client.** They show production UI and replay wiring, not actual server acceptance.

Captured from source commit `aae4d118` with:

```sh
cd frontend && node scripts/capture-structure-recovery-integration.js
```

Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium` by default; `CHROME_PATH` may override it), headless with SwiftShader WebGL. The script uses Vite and Playwright. Desktop viewport is 1440 × 900; phone viewports are 390 × 844 and 375 × 812. It loads the production `main.js` and `game.js` UI stylesheet layers in their existing order plus the island, recovery and pirate styles; computed-style assertions check the production system font, gradient panel, and rounded card/buttons on desktop and phone. Fixture-only inline CSS is limited to scene sizing and the offline label.

The fixture asserts canonical response shapes and request flow, exact card HP/quotes, refusal behavior, preparation quota, and combat checkpoint-before-repair. It holds the paid-repair event outside the visible journal frontier to verify that the HTTP success does not locally heal combat HP; after the event is released to replay, HP updates from the journal. It also checks a tiny positive phone bar is at least one pixel wide and full health hides the recovery UI.

| Viewport | Scenario | Screenshot |
|---|---|---|
| 1440 × 900 desktop | Between-wave wall at 45/60 HP; 10 coins; 150-second free ETA | [Between-wave partial wall](../../../frontend/captures/t59-integrated-between-desktop.png) |
| 1440 × 900 desktop | Destroyed wall, with card closed; focused scene shows the empty world bar, `!`, and existing rubble | [Zero HP and ruin](../../../frontend/captures/t59-integrated-zero-ruin-desktop.png) |
| 1440 × 900 desktop | Insufficient-funds refusal retains server HP | [Refused repair](../../../frontend/captures/t59-integrated-refusal-desktop.png) |
| 1440 × 900 desktop | Accepted between-wave repair reaches full HP and hides offer | [Full between-wave repair](../../../frontend/captures/t59-integrated-full-between-desktop.png) |
| 375 × 812 phone | Harpoon at 0.00006/60 HP with visible minimum fill | [Tiny positive HP](../../../frontend/captures/t59-integrated-tiny-phone.png) |
| 390 × 844 phone | Preparation state shows paused automatic repair and shared quota; paid prep repair succeeds | [Preparation and quota](../../../frontend/captures/t59-integrated-preparation-phone.png) |
| 1440 × 900 desktop | Combat replay damage shown with automatic repair paused | [Combat partial HP](../../../frontend/captures/t59-integrated-combat-desktop.png) |
| 1440 × 900 desktop | Health checkpoint and repair HTTP success returned, journal event still held; combat HP remains partial | [HTTP response held](../../../frontend/captures/t59-integrated-combat-http-response-held.png) |
| 1440 × 900 desktop | Journal event replayed; HP heals and recovery display hides | [Journal event applied](../../../frontend/captures/t59-integrated-combat-journal-applied.png) |
| 390 × 844 phone | Full structure hides recovery display | [Full HP on phone](../../../frontend/captures/t59-integrated-full-phone.png) |

The latest capture completed with 103 calls to the offline API fixture. It does not prove SQL behavior, real signed-in transport, or two-client synchronization. The separate disposable PostgreSQL/API/replay evidence is documented by T60.

### Independent follow-up verification

On 17 Nov 2026, `npm exec vitest -- run tests/island/structure-recovery-model.test.js tests/island/structure-recovery-card-dom.test.js --maxWorkers=1` from `frontend/` passed 25 tests across 2 files. `npm run build` passed in 1.12 seconds and the spoiler guard passed across 241 text files. The corrected desktop/phone captures were inspected: Wall level-2 upgrade is 20 coins and Harpoon level-2 upgrade is 80 coins, with the existing current-level repair prices unchanged. The bell-pause explanation wraps legibly. These remain offline fixture screenshots and do not prove API/payment/database/multiplayer behavior.


## Final review follow-ups · 18 Nov

`057d3fde` limits unavailable-health upgrade blocking to the six supported damageable kinds. Affordable house/watchtower upgrades have no structure-health row and remain available; the affected card model suite passed 36 tests. `394ffab5` keeps the revised tutorial within the existing three-sentence/110-character limits, and `05fe4e40` updates the real-DOM assertions from obsolete ETA to full wave-end wording/shared quota. Paid intent/price, zero-HP marker, phone fit, 44-pixel action target and tiny-positive-HP checks remain. The affected DOM/tutorial command passed 44 tests across five files.

The later local combined review candidate includes this UI branch, the saved-policy error guard and saved gated-defense fix: 19 frontend files / 207 tests passed in 62.70 seconds, followed by a production build and spoiler guard. This is combined-source evidence, not an isolated UI-branch or authenticated service/browser claim. Its first attempt had 204 passing / 3 failing tests (obsolete ETA expectation and revised tutorial limits); those failures were corrected without widening bounds. The text linter then identified seven correctly spelled words missing from its small project vocabulary; each was manually reviewed before adding it to `scripts/text-lint/words.txt`. The final linter reports zero errors and eight unchanged report-only findings. Historical captures are retained.

## Main sync review · 18 Nov

The UI branch was merged locally with `origin/main` at `37eb70fa`. The three textual conflicts were resolved by retaining both committed `docs/STATUS.md` histories in their original order, combining the health-ready checks with main's stale-level check in `card-model.js`, and retaining both reviewed vocabulary groups. The health-loading guard applies only to wall, cannon, mortar, harpoon, culverin and swivel; houses and watchtowers without health rows remain upgradeable. A focused card-model regression checks that a health row from a different building level keeps Upgrade visible but disabled with “Wait until building health has loaded.”

From `frontend/`, the focused policy/card/tutorial/narrator command passed 8 files and 136 tests. `npm run build` passed, including the production spoiler check. From the repository root, `node scripts/text-lint/index.mjs` reported zero errors and eight report-only findings. `git diff --check` reports one incoming main warning: a new blank line at the end of `frontend/src/ui/styles.css`; no repair-UI conflict files have whitespace errors. No new browser capture was made during this sync; browser review and any new captures remain with the integration owner. Existing images and their offline-fixture limitations are unchanged.


## Current-main screenshot review · 18 Nov

Current screenshots are stored separately in `main-db573347/`; the earlier captures above remain unchanged. Source baseline is `fc305cda` (including main `db573347`), plus the capture script's optional `RECOVERY_CAPTURE_DIRECTORY` output path. The output-path option changes no game or fixture behavior. The subsequent unlock-toast wording removes an obsolete fixed wall count to match the current island layout.

Run from `frontend/`:

```sh
RECOVERY_CAPTURE_DIRECTORY=captures/t59-main-db573347 node scripts/capture-structure-recovery-card.js
```

The eight output PNGs were moved unchanged into this evidence directory. For a repeat directly into the same evidence location, set `RECOVERY_CAPTURE_DIRECTORY=../docs/evidence/T59-repair-feedback/main-db573347`. Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79`, headless `/usr/bin/chromium` with the script's existing no-sandbox/dev-shm settings. [Exact command output](main-db573347/capture.txt).

| Viewport | Scenario | Screenshot |
|---|---|---|
| 1440 × 900 | Partial wall: current-level repair price and full wave-end recovery, no ETA | [Wall](main-db573347/t59-wave-end-20261118-between-desktop.png) |
| 390 × 844 | Destroyed cannon during preparation: two shared paid uses remain | [Cannon](main-db573347/t59-wave-end-20261118-preparation-phone.png) |
| 375 × 812 | Tiny positive harpoon HP: minimum one-pixel health fill | [Harpoon](main-db573347/t59-wave-end-20261118-tiny-phone.png) |
| 390 × 844 | Health still loading: visible disabled Upgrade and wait helper | [Loading](main-db573347/t59-wave-end-20261118-upgrade-health-loading-phone.png) |
| 1280 × 800 | Stored Workshop role is inactive; Barracks and Tavern remain | [House](main-db573347/t59-wave-end-20261118-house-roles-desktop.png) |
| 390 × 844 | Stored Quick Mend identifier retained without an active repair effect | [Wall skill](main-db573347/t59-wave-end-20261118-stored-wall-skill-phone.png) |
| 390 × 844 | Crew offers omit Carpenter while keeping other hires | [Crew](main-db573347/t59-wave-end-20261118-crew-phone.png) |
| 1280 × 800 | Tech tree omits new Mason Drill purchases | [Tech](main-db573347/t59-wave-end-20261118-tech-desktop.png) |

All eight images were visually reviewed. The command also checks the paid action's local intent, absent ETA, shared quota copy, 44-pixel phone repair target, viewport fit, tiny positive fill, disabled loading Upgrade, and retired choices. These are production DOM cards with offline DTO fixtures: no authenticated API request, real payment, live database, game session or second client is demonstrated.

## Wave-end component and integration refresh · 18 Nov

Captured from source `bd1333ea` (app baseline `be8b30d7`, including main `db573347`). The component and production integration scripts now assert the full wave-end helper, no gradual ETA copy, the no-free-repair-through-wave-closure text and shared remaining paid uses. The component script verifies the standalone preview’s three examples. The integration script preserves canonical DTO/request checks, fixed repair price, quota decrement, refusal HP, checkpoint-before-repair, held HTTP response versus journal replay, full-health hiding, tiny-positive fill, mobile view and production styles.

The integrated fixture’s destroyed-wall check was adapted to main’s wall batching: it reads the selected wall’s `wallPosts` entry from `island-wall-connections`, asserts that exact post is marked `broken`, and focuses the camera using that post’s projected coordinates. This keeps the empty health bar, `!` indicator and rendered ruin checks while following the current renderer structure. The fixture still supplies the rate/estimate members required by the current recovery DTO validator; the UI assertions no longer use them to promise gradual healing. No gameplay source changed.

Commands run from `frontend/`:

```sh
RECOVERY_CAPTURE_DIRECTORY=../docs/evidence/T59-repair-feedback/wave-end-20261118-component npm run test:recovery:component
RECOVERY_CAPTURE_DIRECTORY=../docs/evidence/T59-repair-feedback/wave-end-20261118-integration node scripts/capture-structure-recovery-integration.js
./node_modules/.bin/vitest run tests/island/selection-dock.test.js --maxWorkers=1
```

The component command passed: three cards, exact HP, destroyed marker, tiny-positive visible fill, intent-only button and desktop/phone screenshots. The final integrated capture passed with 72 signed-shape offline adapter requests and no browser errors. All four selection-dock tests passed, including the intentional “Wait until building health has loaded.” expectation. Both capture scripts accept `RECOVERY_CAPTURE_DIRECTORY`; new captures were saved in dated directories below, leaving historical screenshots unchanged. The run used headless Chromium (`/usr/bin/chromium`) with the existing SwiftShader flags for integration.

| Viewport | Scenario | Screenshot |
|---|---|---|
| 1440 × 900 / 390 × 844 | Standalone wall, preparation cannon and tiny-positive harpoon; full wave-end helper and shared quota | [Desktop](wave-end-20261118-component/t59-recovery-component-desktop.png) · [Phone](wave-end-20261118-component/t59-recovery-component-phone.png) |
| 1440 × 900 | Production island wall at 45/60 HP, fixed 10-coin repair and wave-end helper | [Between waves](wave-end-20261118-integration/t59-integrated-between-desktop.png) |
| 1440 × 900 | Destroyed wall with empty bar, `!` and broken wall post visible | [Zero HP and ruin](wave-end-20261118-integration/t59-integrated-zero-ruin-desktop.png) |
| 1440 × 900 | Insufficient-funds refusal retains 45/60 HP | [Refusal](wave-end-20261118-integration/t59-integrated-refusal-desktop.png) |
| 390 × 844 | Preparation offer: wall at 0/60 HP, fixed 10-coin quote and three shared uses before payment | [Offer](wave-end-20261118-integration/t59-integrated-preparation-offer-phone.png) |
| 390 × 844 | After preparation payment: shared uses decrement from three to two | [Preparation quota](wave-end-20261118-integration/t59-integrated-preparation-phone.png) |
| 1440 × 900 | Combat repair success held from journal, then applied by replay | [HTTP held](wave-end-20261118-integration/t59-integrated-combat-http-response-held.png) · [Journal applied](wave-end-20261118-integration/t59-integrated-combat-journal-applied.png) |

The integration also captured accepted between-wave repair, partial combat health, tiny-positive phone health and full-health phone state in the same directory. These remain offline fixture captures: they do not demonstrate an authenticated API, real payment, database recovery, actual canonical wave closure or a second client. The first refreshed integration attempt hit the obsolete individual-wall-mesh assertion at the ruin case. The fixture now reads the batch group’s actual visibility and exact selected post look, and camera focus follows that post. The full capture passed. The preparation-offer screenshot resets the card scroll to show health, the fixed quote and the three-use quota together. No live service, migration, deployment or activation was used.

### Combined current-main verification

Local candidate `35f91e0e` combines the four repair follow-ups with main `db573347`. Its 23-file frontend command passed 232 tests, including the changed policy/card/tutorial/replay cases and the latest village decode/shipping/raster contracts. Production build passed in 1.71 seconds; the spoiler guard checked 245 text files and 12 protected lines. Text lint reported zero errors and eight unchanged report-only findings. This is combined-source evidence, not an isolated-branch full-suite claim.

The full disposable island SQL suite passed 398 tests in 52.66 seconds on the preceding combined candidate `d25242e1`. The backend and migration trees are byte-identical in `35f91e0e`; the later main update changes artwork delivery. No live migration, deployment or activation was performed.

After the unlock-toast wording adjustment, the focused narrator/tutorial/host command passed 39 tests across three files in 8.95 seconds on this UI branch.


## Final current-main review

UI source `d096e530` passed a fresh production build in 1.97 seconds, including the spoiler guard (245 text files, 12 protected lines). Text lint reported zero errors and eight unchanged report-only findings. Protected instructions, historical captures and both committed STATUS histories remain unchanged or preserved in order; local Markdown targets and the secret scan passed.

The final local four-branch candidate `b908e34e` passed all 53 selection-dock, card-model, saved-policy and upgrade-DOM tests across four files in 26.69 seconds: [exact output](wave-end-20261118-integration/final-guard-tests.txt). Its backend/migration trees remain byte-identical to the earlier 398-test disposable-SQL candidate. This is combined-source evidence, not an isolated UI-branch full-suite result.

The earlier complete combined frontend run on `35f91e0e` finished with 4,623 passed and three failed; it was not green. The old dock helper expectation was corrected without weakening its stale-HP/disabled-upgrade assertions. The village desktop case subsequently passed separately within its unchanged 60-second limit. The nearby-game timeout also reproduced on pristine main `db573347`, so full-game E/revive coverage remains a limit. [Exact full, baseline and isolated outputs with source provenance](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/a3f06c3b/docs/evidence/T59-repair-feedback/README.md#full-combined-source-frontend-result).

The current zero-HP world and preparation-offer phone captures were independently inspected: the broken wall, empty bar/marker, fixed price and shared quota are visible. No authenticated API, real charge, second client, live migration, activation or deployment is demonstrated. The approved rule-document alignment and backend refusal/target-policy metadata remain separate in PRs #468 and #478.
