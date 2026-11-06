# Full-screen island rooms

Owner: Nils. Branch: `feat/redesign-interiors`, from `f91f541`. This package implements the requested house transitions as separate, opaque viewport scenes. Root integrates `game.js`; this branch does not edit the existing world, story, player, HUD, global CSS or assets.

## Integration

Lazy-import `frontend/src/world/interiors/scene.js` when the player first enters a doorway. It exports:

```js
const roomScene = createInteriors({
  container,               // e.g. document.body
  resetInput,              // releases the outside controller
  focus,                   // restores the outside game canvas on exit
  reducedMotion,           // boolean or getter
  onInteract: event => intro.open(event.id, {resume: event.resume}),
  onExit: ({outside}) => restoreOutsidePosition(outside),
  onMenu: () => shell.show('pause'),
});
```

`roomScene.active` and `roomScene.roomId` are getters. `enter(roomId, {unlocked})` returns success; `close(reason, {immediate})` exits; `update(delta, {blocked})` advances the room; `dispose()` releases its input listeners, timers, resize observer and buffers. All values have safe defaults, and disposal has no late exit or focus callback.

Before calling the outside world's interaction function, use `entranceFor(placeId, playerPosition)`. It returns `{roomId, placeId, requiresOpenedDoor}` within a doorway's radius, otherwise `null`. Keep the outside controller and outside interaction dispatch paused while `roomScene.active`. Pass only **external** overlays as `blocked`; passing a predicate that includes the room itself would pause it permanently. Native open story dialogs are also detected automatically. The outside camera render can be skipped while the opaque room is active.

Call `canEnterRoom(roomId, intro.state)` before entering. For the lighthouse, pass `{unlocked: true}` only when that guard passes: it requires `stairwell`, `lamp_room` or an ended intro, rather than simply owning a key. Otherwise, dispatch the existing `tower_door` interaction so the locked-door story remains intact. Resume the already-entered tower story directly through `intro.open(event.id, {resume: true})`; emitting only the old island interaction would navigate it back to the outside door.

The existing intro listener must not receive a doorway interaction as well as the new room entry. Intercept that action before `world.interact`; room inspection later opens the existing paged story UI.

| Room ID | Existing parent place | Exterior doorway x/z | Safe exit x/z | Existing story interaction |
| --- | --- | --- | --- | --- |
| `cottage` | `lighthouse_isle` | -7 / 5.1 | -7 / 7 | `desk` |
| `boathouse` | `lighthouse_isle` | -7 / 17.3 | -7 / 18.7 | `shore` |
| `lighthouse` | `lighthouse_isle` | 9 / -5.2 | 9 / -3.7 | `tower_door`, `resume: true` |

`onInteract` receives `{type: 'interact', id, place: 'lighthouse_isle', roomId, resume}`. `onExit` receives `{roomId, placeId: 'lighthouse_isle', outside: {x,z}, reason}`. The root restores the outside player x/z and uses the existing ground-height function for y. These are client-only visual rooms: no server area IDs, saves, progress writes, item grants or story rules are introduced.

## Presentation and input

Each room replaces the island with a complete high-resolution canvas: floor, walls, doorway, original furniture, window light and a moving explorer. Cached room scenery is rebuilt only on entry/resize, with device pixel ratio capped at 2; the actor and quiet ambient light draw each frame. There are no dependencies or external assets. The title/objective and exit keep stable positions; reduced motion removes transitions and ambient animation.

Arrow keys/WASD walk, E/Enter/Space inspect the nearby story hotspot, and Escape leaves. Walking through the bottom doorway also exits. Accessible object buttons allow direct inspection by touch or keyboard. A standard gamepad uses axes, A to inspect, B to exit and Start to open the supplied pause menu; coarse-pointer displays receive a directional pad with at least 44px controls. Tab stays in the active room; native story dialogs retain their own input. Background input, held buttons, unrelated pointers, lost capture, overlays, blur and disposal have explicit release handling.

## Verification

- `cd frontend && npm test -- --reporter=dot tests/interiors-logic.test.js tests/interiors-dom.test.js`: 13 passed in two files. Covers doorway/gate validation, bounds and furniture collision, existing story IDs, full viewport/focus/exits, overlay input ownership, cancellation/disposal, owned pointer cleanup and gamepad exit during its own frame, and Start/held-button/native-dialog ownership. The last regression first reproduced the released-room crash, then passed after the fix.
- `cd frontend && node scripts/check-interiors.js`: builds the actual module into an owned temporary directory, checks all three desktop rooms and touch layouts at 375/320px, actual movement/Escape, full viewport and exit restoration, disposal, and strict CSP with zero browser errors or external requests. The script deletes its temporary build/server on completion.
- Screenshot artifacts: `/tmp/plot-twist-interiors-proof/{cottage,boathouse,lighthouse}-desktop.png`, `cottage-375.png`, `cottage-320.png`, plus `report.json`.
- `git diff --check`: clean. The shared text dictionary needs review of the ordinary words `rack`, `inspects` and `highlighted`; the branch deliberately does not edit shared text-lint files.

Not verified here: the final integrated outside-doorway flow, outside HUD behavior, production deployment, multiplayer/save behavior, or the full application test/build gates. Those belong to the root integration. No live services, migrations or deployments were changed.
