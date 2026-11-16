# T59 repair feedback evidence

**Standalone component only; no API or game integration.** These previews render fixture data. The button reports an intent to the preview page; it sends no request and changes no health or coins.

Captured from source commit `e799c4d1` with:

```sh
cd frontend && npm run test:recovery:component
```

The command starts the local Vite server and opens the standalone fixture in headless Chromium. Environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium` by default; `CHROME_PATH` may override it). No game URL, feature flags, API or multiplayer service is used.

| Viewport | Screenshot |
|---|---|
| 1440 × 900 desktop | [Desktop component preview](../../../frontend/captures/t59-recovery-component-desktop.png) |
| 390 × 844 phone | [Phone component preview](../../../frontend/captures/t59-recovery-component-phone.png) |

The fixture shows a damaged wall between waves, a destroyed cannon during preparation with two uses remaining, and a harpoon with one normalized HP unit. These screenshots demonstrate presentation only.

Integrated evidence remains pending T55–T57. It should show between-wave pay and wait choices; preparation and combat with paused repair and shared quota; zero, partial, tiny-positive and full HP; and phone controls at 390 px and 375 px. Multiplayer evidence must come from the actual integrated clients.
