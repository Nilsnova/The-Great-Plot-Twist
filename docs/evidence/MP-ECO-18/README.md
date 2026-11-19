# Island treasury and personal Captain display

These Chromium screenshots use public synthetic fixtures. They demonstrate the bounded frontend projection, without live accounts, server settlement or economy activation.

| Evidence | Viewport | What to inspect |
|---|---|---|
| [Defended island crew](treasury-crew-desktop.png) | 1280 × 800 | The visitor sees the defended island's crew and treasury. Available and committed funds are separate; Carpenter hiring is unavailable. The visit chip stays below the treasury. |
| [Exact phone treasury](treasury-phone.png) | 375 × 812 | The amount above JavaScript's safe integer limit remains exact, wraps within the viewport and stays clear of Menu. Private-wallet and stale responses cannot replace it. |
| [Personal Engineer skills](engineer-personal-progress.png) | 1280 × 800 | On a legacy-economy island, an idle adopted Captain retains the Engineer commitment while a free skill-only respec remains available. |

Regenerate from `frontend/`:

```sh
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-18 npm test -- --maxWorkers=1 tests/island/economy-dom.test.js tests/island/economy-captain-dom.test.js tests/ui/hud.test.js tests/island/captain-card.test.js
```

The module-split refresh at frontend runtime `3909627a` passed 4 files and 21 tests in 26.00 s. All three regenerated images are byte-identical to the published evidence and were visually inspected. The checks assert the displayed money, button state and layout boundaries. Final runtime `cf39d84e` adds only a reset-response guard afterward, with no layout or fixture-state change.

The [specification](../../../specs/MP-ECO-18-treasury-ui.md) records API dependencies and broader validation limits. Arsenal, Harbor betting, Boat and wave-lifecycle adoption require separate integration. The earlier broad legacy multiplayer journey also passed with four pages at frozen runtime `cf39d84e` in 434.81 s, including the boss finisher; the specification records its exact command and limits separately. These fixtures do not establish authenticated shared-mode integration or complete multiplayer rollout.

The subsequent main1350 integration preserves these image fixtures and styles; no new screenshot-capture run is claimed for this refresh. Its current real-DOM selection passed 45 files / 465 tests at runtime `f6353484`. The complete fake multiplayer harness passed with four pages in 450.74 s on the same frozen runtime, including the boss finisher stage; all four pages agreed on `finisher_failed`, 195/224. The [current integration section](../../../specs/MP-ECO-18-treasury-ui.md#integration-after-always-on-flag-retirement) records flag retirement, wallet-observer correction, exact commands and remaining shared-mode limits.
