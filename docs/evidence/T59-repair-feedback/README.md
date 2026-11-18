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
