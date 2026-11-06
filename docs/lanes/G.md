# G — world and graphics

Used by the graphics presenter and the [G drills](../drills/G.md). The intended `frontend/HOW-IT-WORKS.md` handover does not exist on audited main; use the current [GRAPHICS.md](../../frontend/GRAPHICS.md) and [asset register](../../frontend/ASSETS.md). Add the intended link only once its target lands.

## What the player gets

A crisp, top-down pixel world, movement and interaction, a keyboard-accessible sea chart, sailing transitions, visual settings, synthesized sound and a title/pause shell. Seven places are registered; six are initially reachable, while Gull's Rest has an external unlock gate. Thirty-four registered hotspots are interaction hooks, not thirty-four completed gameplay systems. Touch/gamepad input and readable HTML controls complement keyboard play.

## Files and data flow

| Responsibility | Files |
| --- | --- |
| Small title entry, lazy world, menu lifetime | `frontend/src/main.js`, `frontend/src/shell/controller.js`, `frontend/src/game.js` |
| Native pixel grid and renderer | `frontend/src/pixel/display.js`, `frontend/src/core/renderer.js`, `frontend/src/pixel/catalog.js` |
| Movement and collision | `frontend/src/player/controller.js`, `frontend/src/player/collision.js`, `frontend/src/controls/` |
| Places, routes and hotspot definitions | `frontend/src/world/places/registry.js`, `frontend/src/world/zones.js`, `frontend/src/ui/chart.js` |
| Travel and lifetime | `frontend/src/world/places/manager.js`, `frontend/src/world/places/resources.js` |
| Art authoring and audio | `frontend/scripts/pixel_art/`, `frontend/src/audio/`, `frontend/ASSETS.md` |

Input is normalized into movement intent → player controller proposes a step → collision constrains the position → animation uses actual motion → the renderer displays snapped native pixels. Interaction chooses an eligible nearby zone and emits a view-level event. Chart selection → breadth-first route lookup → place manager travel → disposal of the departed place → attachment of the next → arrival event. A failed attachment restores the previous place and releases the transition lock.

`main.js` imports `game.js` only after play/tour intent, so the title does not need WebGL. The place resource scope owns geometry/material disposal and subscriptions. `core/loop.js` skips hidden-tab updates and caps the time step to avoid a jump after returning. The presentation can show a lock or an animation; Python remains responsible for authoritative game effects (D003).

## Evidence

From `frontend/`:

```bash
npm test -- tests/pixel.test.js tests/controls.test.js tests/gamepad.test.js tests/places.test.js tests/place-lifetime.test.js
npm run build
CHROME_PATH=/usr/bin/chromium CAPTURE_PREFIX=G-Release npm run test:production
```

The pure tests check image/grid contracts, input fallbacks, places/routes and disposal. The build includes the protected-sentence scan. The production smoke checks a real WebGL canvas, production inspection boundaries, quality preference, keyboard focus and chart travel. Optional deeper checks: `npm run test:world`, `npm run test:browser`, `npm run test:art`; set `CHROME_PATH` and a new `CAPTURE_PREFIX`, run them sequentially and preserve historical captures.

## Known limits

- A harbor building/hotspot is not evidence of working trading, predictions, duels or construction.
- The normal production case adapter is disconnected. A local fake is explicitly rehearsal-only.
- `?demo=1` works; `record=1` and production `perf=1` are unimplemented. FPS diagnostics are development-only. Browser checks on one machine do not prove phone/gamepad hardware performance.
- The built-in tour continues beyond the class-demo stop. Follow the [presenter script](../PRESENTER-SCRIPT.md), ending at the schooner.
