# Story engine in the browser

> **What this file is:** how the browser plays the story. It lists what is in `frontend/src/story/`, shows how to use it and states the rule that it must stay equal to the Python engine.
>
> **Who uses it:** whoever builds the story screens, and everyone who changes a game rule.

## What is here

| File | What it does |
|---|---|
| `engine.js` | The `Game` class: the rules of the story (which actions are allowed, what they change, endings). It also re-exports everything from `storage.js`. |
| `saves.js` | Reads a saved game back from its text and ignores a save that does not fit the story. |
| `storage.js` | Where progress is kept: `memoryStorage()`, `browserStorage(area)` and `SAVE_KEY`. |

There is no DOM code and no Three.js here, and nothing imports from other folders of `src/`. So Vitest and Node.js can run these files without a browser. The story itself is data: see `backend/content/README.md` for the format of `story.json`.

## How the browser uses it

```js
import { Game, browserStorage, memoryStorage } from './story/engine.js';

// 1. Get the story from the API (the same file as backend/content/story.json).
const story = await (await fetch('/api/content/intro-story')).json();

// 2. Make the game. The second argument says where progress is kept.
const game = new Game(story, browserStorage(window.localStorage));
if (!game.resume()) game.newGame(); // continue a saved game, or start a new one

// 3. Draw the current situation.
game.scene.title;        // heading of the scene
game.scene.text;         // the main text
game.sceneNotes();       // extra lines, for example "The drawer is empty now."
game.visibleActions();   // [{ action, allowed }]; allowed false means "show it as locked"
game.inventoryDetails(); // [{ name, description }]

// 4. When the player clicks an action:
const result = game.perform(action.id); // { accepted, message }; show result.message, then redraw
```

Where progress is kept is up to the caller:

- **No second argument** means `memoryStorage()`. Nothing survives a reload. Tests use this.
- **`browserStorage(window.localStorage)`** saves in the browser. The engine never touches `localStorage` by itself, so the caller passes it in. A failing read or write (private mode, storage full) is ignored and the player keeps playing without saving. Reading `window.localStorage` can itself throw in some privacy settings, so guard it:

  ```js
  function pickStorage() {
    try {
      return browserStorage(window.localStorage);
    } catch {
      return memoryStorage(); // the player keeps playing, but progress is lost on reload
    }
  }
  ```

The methods, with the name the Python engine uses:

| JavaScript | Python | What it does |
|---|---|---|
| `new Game(story, storage)` | `Game(story, save_path)` | Starts at `story.start`. |
| `newGame()` | `new_game()` | Resets all progress and saves. |
| `resume()` | `resume()` | Loads the save. JavaScript returns `false`, and changes nothing, when there is no usable save. Python raises a `FileNotFoundError` when there is no file. |
| `hasSave()` | `has_save()` | Is there a save? JavaScript also checks that it fits the story. |
| `scene` | `scene` | The current scene object. |
| `sceneNotes()` | `scene_notes()` | The note texts whose conditions hold. |
| `visibleActions()` | `visible_actions()` | JavaScript gives `{ action, allowed }` objects, Python gives `(action, allowed)` pairs. |
| `inventoryDetails()` | `inventory_details()` | JavaScript gives `{ name, description }`, Python gives `(name, description)`. |
| `perform(actionId)` | `perform(action_id)` | Tries the action. Gives `{ accepted, message }`. A refused action changes nothing. |
| `conditionsMet(conditions)` | `conditions_met(conditions)` | Do these conditions hold right now? |
| `state` | `state` | `{ scene, inventory, flags, ended, message }`. Read it; change it only through the methods above. |

Python also has `item_name(item_id)`, which the browser does not need.

## It must stay equal to the Python engine

`engine.js` mirrors `backend/plot_twist/engine.py` rule for rule. A rule that differs would make the browser and the server disagree about what a move does.

- **Change a rule in both engines, and in both sets of tests, in the same pull request.**
- The guard is `backend/plot_twist/tests/test_web_parity.py`. It plays 60 random runs of 60 moves, both endings and the two Story v2 routes that end locked in the tower (after warning the harbor and after telling no one), through the two engines and compares every answer, state, visible action and note. Run it with `cd backend && uv run pytest plot_twist/tests/test_web_parity.py -rs`. It needs Node.js. Without Node.js it is skipped, and the skip reason is printed, so run it on a machine that has Node.js before you merge.
- Differences that are allowed because they are not game rules: how progress is stored (Python: an optional file, JavaScript: an injected storage), what the methods return (see the table above), and that JavaScript checks a save against the story before it uses it.

## How it will meet the island

The island sends `interact` events with the ids `cottage`, `desk`, `shore` and `tower_door` (see `docs/INTERFACES.md`, "The story trigger ids", and the hotspot table in `frontend/GRAPHICS.md`, "Places, hotspots, lights and events"). The island also sends other hotspot ids, which the story must ignore. The same four words are scene ids in `story.json`. Nothing connects them yet: that is the job of a later package.

## Not the place for money or shared progress

The browser engine plays the intro so the player sees each answer at once. It decides nothing the server stores: the referee (package A3) replays the move log with the Python engine and decides the ending (decision D003, and principle 7 in `docs/ENGINEERING.md`). That is why the two engines must agree move for move. A save in `localStorage` is only a convenience for resuming on this device, and the server never trusts it. This engine must never decide coins or anything that other players share.

## Tests

`cd frontend && npm test` runs two story test files. Both play the real story, loaded by `tests/story-fixture.js` from `backend/content/story.json`.

- `tests/story-engine.test.js`: the acceptance scenarios A1 to A6 and the saving rules.
- `tests/story-engine-rules.test.js`: engine rules that A1 to A6 do not pin down. Two are rules the real story can never show, tested with small variants of it. Seven are rules the story does show but the scenarios never check: `not_flags`, notes, a flag stored once, the remembered message and the three fixed refusal texts.

Changed `engine.js`? Also run `cd backend && uv run pytest plot_twist/tests -rs`, which holds the parity test. `npm test` alone does not compare the two engines, and the parity test is skipped on a machine without Node.js, so check that the `-rs` output does not list it as skipped.
