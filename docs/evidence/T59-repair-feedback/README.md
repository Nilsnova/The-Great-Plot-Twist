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
