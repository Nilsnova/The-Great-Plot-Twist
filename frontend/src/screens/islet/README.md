# Your home islet: the build panel

> **What this file is:** the guide to `frontend/src/screens/islet/`. It lists the files, the view and the two intents, how the intents map to the two server routes, how to try the panel on your laptop, and what comes next.
>
> **Who uses it:** whoever changes the islet panel, wires it to the sign-in (package A2), or draws the islet in the world.

The panel lets a player build on their own home islet. The server owns the rules (package L2, `specs/L2-home-islet.md`): prices, timber, which plots can be built and what is saved. The panel only shows what the server says and sends two kinds of request.

## What is here

| File | Its one job |
|---|---|
| `host.js` | `attachIsletPanel(...)`, called once from `game.js`. Picks the transport, opens the panel on `plot_clicked` (at the four plots: the signal station's hotspot opens the finale screen, which has its own build step), closes it on `travel`, refreshes on `arrived` at `home_islet` (in live mode only when `canAsk()` says the player is signed in), emits `islet_changed`, and returns `stop()`. |
| `adapter.js` | The view and the two intents. It maps them to the two routes through an injected transport and keeps one click id per build. |
| `view.js` | Pure functions: the first view, the server answer read into view data, and the notices. |
| `labels.js` | Pure functions: the texts of a card (badge, price, what is missing, button) and the coins line. |
| `action-uid.js` | `makeActionUid(randomBytes)`: the 16 character click id. |
| `panel.js` | DOM only: the kit modal with the wallet line, the status line and the cards. |
| `spot-card.js` | DOM only: one card. |
| `set-text.js` | Sets text only when it changed, so a live region does not announce the same words twice. |
| `islet.css` | Styles in the kit's colours. |
| `fake-transport.js` | For local rehearsal only: an in-memory stand-in for the two routes, with the server's answers, codes and check order. Nothing is saved. |
| `fake-catalogue.js` | The fake's copy of `backend/content/buildings.json`. The frontend build on Vercel cannot read `backend/`, so `tests/islet-catalogue.test.js` keeps the two equal. |

Rules for this folder: plain JavaScript ES modules, each file under 150 lines with a one-line header comment, text only through `textContent`, UI from `src/ui/kit`. Screens never call `fetch` and never decide a rule. Not even the adapter calls `fetch`: it uses the transport it is given. `tests/islet-boundary.test.js` checks these rules.

## The transport

`attachIsletPanel` picks one of three modes.

| Mode | When | What happens |
|---|---|---|
| `local` | A dev build and `?islet=local` in the address | Requests go to `fake-transport.js`. The panel says that nothing is saved. A production build ignores the flag and does not even contain the fake. |
| `live` | `transport` was passed in | Requests go to the transport. It must be A2's `api` from `src/online/api.js`: `get(path)` and `post(path, body)` answer `{ok: true, status, data}` or `{ok: false, status, code, message, retryAfterSeconds?}`. |
| `unavailable` | Neither | No request is ever sent. The panel says: "Your islet will be saved to your account once sign-in is connected." |

`?islet=local` wins over a passed transport in a dev build, so the rehearsal keeps working after the sign-in is wired.

**Signed in or not.** The refresh on arrival is silent, and A2's `api` answers a 401 by making the session forget the token, which shows the sign-in prompt. So in live mode `attachIsletPanel` takes an optional `canAsk()` (it defaults to always true) and the arrival refresh waits until it says the player is signed in. Opening the panel always asks, because the player asked for it, and a 401 then shows "Please sign in again." in the panel. The local fake and unavailable mode ignore `canAsk`.

## The view and the intents

`adapter.read()` returns a copy of this:

```js
{
  schema: 1,
  mode: 'live' | 'local' | 'unavailable',
  status: 'loading' | 'ready' | 'error' | 'unavailable',
  busyPlot: null,            // the plot whose build is running
  coins: 1000, timber: 20,   // null until the first answer
  playMoneyNote: 'Play money. No cash value. It cannot be bought or cashed out.',
  signalStationBuilt: false,
  spots: [{plot, plotName, type, name, about, state, level, builtAt, cost, missing, canBuild, lockedNote, retry}],
  notice: null,              // or {tone: 'success' | 'error' | 'info', code, message}
  revision: 0,
}
```

`state` is `built`, `empty` or `locked`. `retry` is true when the last build of that plot has an unknown outcome. `status` is `error` only when there is no good answer yet. If a later refresh fails, the last good view stays and the notice says why.

| Intent | Does | Answers |
|---|---|---|
| `adapter.refresh()` | `GET /api/islet` | `{accepted, code, message}`. Never rejects. |
| `adapter.build(plot)` | `POST /api/islet/build` | `{accepted, code, message}`. Never rejects. `code` is `built`, `already_applied`, `confirmed`, the code of the server's refusal, `unconfirmed`, `busy`, `no_such_plot` or `not_connected`. |
| `adapter.subscribe(listener)` | Calls `listener({type: 'islet_updated', view, answered})` after every change and returns `stop()`. | `answered` is true when the change came from a good `GET /api/islet` answer. |
| `adapter.dispose()` | Stops the listeners. Answers still on their way are dropped. | |

## How the intents map to the routes

**`refresh()`** sends `GET /api/islet`. A good answer replaces the spots, coins and timber. Any other answer keeps the last good view and shows the message of the transport ("Please sign in again." for a 401). An answer that cannot be read counts as a failure too. An old answer that arrives after a newer one is ignored.

**`build(plot)`** sends `POST /api/islet/build` with `{plot, type, actionUid}`. The `type` is copied from the spot the server sent, never chosen by the browser. Only one build runs at a time: while `busyPlot` is set, `build()` answers `busy` and sends nothing.

| The server answers | The adapter does |
|---|---|
| 200 | Drops the click id, refreshes, then shows "Signal station built. You have 700 coins and 10 timber left." |
| 409 `already_applied` | Treats it as done: drops the click id, refreshes, says nothing was charged twice. |
| Any other 4xx | Shows the message of the server, drops the click id, refreshes. |
| No answer (status 0) or any 5xx | **Keeps the click id** and marks the spot `retry`. Shows "We could not confirm the build. Checking your islet now." and refreshes. If the spot is built now, drops the id and shows "Built." If not, the button says "Try again: build the signal station (it will not charge twice)", with the name of its building. |

The retry rule in one sentence: the adapter keeps the click id only when the answer does not say what happened. A retry sends the same id again, and the server answers `already_applied` if the first request went through. The id is made once per click by `makeActionUid`.

## The panel

- A kit modal with the title "Your islet", the coins and timber line, the play money note, a status line (`role="status"`, announced politely) and a Refresh button. After a good manual refresh the status line says: Your islet is up to date.
- One card per spot, in the order the server sends them. A card shows the building and plot name, a badge ("Standing", "Empty plot" or "Coming later"), the about line, the price, what is missing ("You need 120 more coins"), the locked note or the build date, and one button.
- The button is on only when the server said `canBuild` (or a safe retry is pending) and nothing is running. The browser never works out whether a build is allowed.
- `open(plot)` resets the game input, opens the modal, refreshes, and puts focus on the card of that plot: its button if it is on, otherwise its heading. The first open waits for the first answer before it moves focus, and it moves focus only if the player has not moved it.
- **Keyboard.** The dialog stops every key except Escape and Tab, so nothing reaches the game behind it: the explorer does not walk, and E, M and the other game keys do nothing. Tab stays inside (the kit modal traps it). Escape closes the panel and focus returns to the canvas. When a build starts, focus moves to the heading of its card, so it is not lost when the button turns off.
- **Gamepad.** While the panel is open `game.js` does not treat the gamepad as playing (see the table below), so the gamepad's dialog mode drives the panel: the D-pad moves focus between the buttons, A presses the focused one, and B or Start closes the panel, after which focus returns to the canvas. The stick, Y and A-as-interact do nothing behind the panel.
- **Touch.** The panel is a modal dialog, so the touch controls behind it cannot be pressed. A stick push left over from before the panel opened moves nothing, because the explorer is held still while the panel is open (the gate of `controller.update` in the table below).
- **Screen reader.** Each card is an `article` named by its heading, the cards sit in a list, every button names its building ("Build the workshop for 300 coins and 10 timber") and is also described by its card heading, and every change of the status line is announced. No two buttons on the page share a name (WCAG 2.4.6).
- **Reduced motion.** The panel has no animation. The global reduced-motion setting still applies to everything around it.
- **Colour.** The state is always written in words in the badge. Borders are solid, filled or dashed as well, and gold follows the colour-blind setting through `--kit-gold`.
- **375 px.** One column, full-width buttons of at least 44 px, text of at least 14 px, no sideways scrolling.

## What game.js and the test helpers do with it

`game.js` has four small touch points, and one test helper follows them. Each has a reason. `tests/islet-boundary.test.js` pins each of the four.

| Where | What | Why |
|---|---|---|
| The import and `const stopPlots = attachIsletPanel({container, on, emit, resetInput: input.reset, focus: ...})` | Replaces the old `plot_clicked` listener, so `dispose()` and the start-up failure path still stop it. | One call wires the whole folder. |
| `hasOverlay` in the object that `startGame` returns: `stopPlots.active` is added to its list of overlays | `stop` carries an `active` flag that is true while the panel is open. | The shell listens for Escape before anything else (`shell/controller.js`, capture phase on `window`) and opens the Pause menu unless `hasOverlay()` is true. Without this, Escape would open Pause over the panel instead of closing the panel. |
| `deviceActions.isPlaying` ends with `&&!stopPlots.active` | While the panel is open the gamepad is not playing, so it uses its dialog mode (D-pad moves focus, A presses the focused button, B or Start closes). | Without it the stick walks the explorer behind the panel, A presses E (at the signal station that opens the case finale over the panel), Y opens the chart and Start opens Pause. A gamepad-only player could neither build nor close the panel. |
| The gate of `controller.update` ends with `&& !stopPlots.active` | The explorer stands still while the panel is open, whatever pushes it. | A stick or touch push left over from before the panel opened must not walk the explorer under the dialog. |
| `dismissIntro` in `scripts/intro-browser-fixture.js` also closes `.islet-modal` | A test helper. | `scripts/check-world.js` presses E at every hotspot. At `plot_1` to `plot_4` that now opens the panel, and an open panel would swallow the next E press. |

## The event `islet_changed`

`host.js` emits `{type: 'islet_changed', built: ['plot_1', 'islet_signal_station'], signalStationBuilt: true}` after every good `GET /api/islet` answer in `live` or `local` mode, and never in `unavailable` mode. `built` lists every plot whose state is `built`, the cabin included, in the order of the server. The world listens to this to draw what stands. Until the world listener lands and documents the event in `frontend/GRAPHICS.md`, its home is section 3 of `docs/INTERFACES.md`.

## Try it on your laptop

1. Run `cd frontend && npm run dev`.
2. Open `http://127.0.0.1:5173/?islet=local` and start a game.
3. Sail to the home islet and click a plot. Or run `__island.emit({type: 'plot_clicked', plot: 'plot_2'})` in the console.

In local mode the console has a handle for rehearsals:

```js
__isletLocal.dev.setCoins(100);           // then the station shows "You need 200 more coins"
__isletLocal.dev.setTimber(5);
__isletLocal.dev.failNext('timeout');     // the next request is applied, but its answer is lost
__isletLocal.dev.failNext('network');     // the next request never arrives
__isletLocal.dev.failNext('server');      // the next request gets a 503 and is not applied
__isletLocal.dev.reset();                 // back to a new player with 1,000 coins
```

Each `failNext` call queues one failure for one of the next requests. To rehearse a lost answer that the check cannot confirm, call `failNext('timeout')` and `failNext('network')`, then press Build: the card shows the safe retry button.

## Tests

Vitest collects only `frontend/tests/`, so the tests of this folder are `tests/islet-*.test.js`: `action-uid`, `view` (with `labels`), `set-text`, `fake`, `adapter`, `host`, `catalogue` and `boundary`. There is no DOM test environment, so they are pure. The DOM of `panel.js` and `spot-card.js` is checked in a real browser by `scripts/check-islet.js` (with `scripts/gamepad-browser-fixture.js`, a fake gamepad). It needs Chrome and writes no files:

```
cd frontend && node scripts/check-islet.js
```

It opens the panel with `?islet=local` and checks: E at a plot and a click on a plot open it; the explorer, E, M, A and Y do nothing in the game behind it; Escape and B close it without opening Pause and focus returns to the canvas; locked and unaffordable buttons are off; each button names its building; building the station leaves 700 coins and 10 timber; the D-pad and A can build; travelling closes it; and without a transport it asks nothing. To use another dev server, set `TEST_URL`, as for the other checks. When `package.json` is next edited, add `"test:islet": "node scripts/check-islet.js"` next to `test:world`.

## Limits and follow-ups

- The panel builds through `POST /api/islet/build`. The finale screen's "Build signal" button maps to the same route in the real case adapter, so the case never charges for the station itself.
- If the panel chunk cannot load (for example offline), nothing opens, the console shows the error, and the next click tries again.
- After A2 merges: `import {api} from './online/api.js'` in `game.js`, and `transport: api` and `canAsk: () => session.signedIn` (or A2's equivalent) in the `attachIsletPanel` call. The test in `tests/islet-boundary.test.js` that pins that line changes with it. Pass the live transport only after the home islet migration is applied: until then `GET /api/islet` answers `502 database_error`. Until the transport is passed, the panel runs in unavailable mode and sends no request.
- The world draws a building only when `islet_changed` says it stands (`world/places/home.js`, `layouts.js`).
- Opening the windmill and the greenhouse is a data change: `"buildable": true` in `buildings.json`, and the same in `fake-catalogue.js`. No code change.
- Upgrades to levels 2 and 3 need a third route (`POST /api/islet/upgrade`), one more adapter intent and one more button on a built card.
