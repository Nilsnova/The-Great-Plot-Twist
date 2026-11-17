# T59 repair feedback evidence

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
