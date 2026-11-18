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

Current result at frontend runtime `7db9222f`: 4 files, 21 tests passed in 24.43 s. The checks assert the displayed money, button state and layout boundaries; screenshots were also visually inspected.

The [specification](../../../specs/MP-ECO-18-treasury-ui.md) records API dependencies and broader validation limits. Arsenal, Harbor betting, Boat and wave-lifecycle adoption require separate integration. The current broad legacy multiplayer journey also passed with four pages at runtime `7db9222f`, including the boss finisher; the specification records its exact command and limits separately. These fixtures do not establish authenticated shared-mode integration or complete multiplayer rollout.
