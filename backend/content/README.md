# Game content

> **What this file is:** the guide to the `backend/content/` folder: what lives here, the exact format of `story.json`, the rule that public and secret content stay apart, and where the story came from.
>
> **Who uses it:** everyone who writes or changes story content, and every coding agent that touches the story engine or the content route.

## What lives here

| Path | What it is | Who may see it |
|---|---|---|
| `story.json` | The intro story, "The Keeper's Last Log": scenes, items, choices and endings. | Everyone. The browser downloads it from `GET /api/content/intro-story`. |
| `buildings.json` | The buildings of a home islet (package L2): the five spots, the price of a level 1 building and the starter timber. Format: [buildings.json](#buildingsjson-the-buildings-of-a-home-islet). | The server only. It is not on the list of public content; the browser gets everything through `GET /api/islet`. |
| `secret/` (does not exist yet) | Content the browser must never see, for example the real solution of a case. | Server code only. It is never served. |

Content is data, not code. The story engine reads it and never contains story text. You can change `story.json` without touching any Python or JavaScript.

## Why this folder is in `backend/`

Decision D016 (proposed): game content that the server uses lives in `backend/content/`. Vercel builds each service from its own folder only. The API service is built from `backend/`, so files here are available to the server. The browser service is built from `frontend/`, so nothing in this folder ends up in the browser bundle by accident. That matters for secret content such as the case solution, which must never be bundled into the browser. The browser gets public content through the API instead.

## Public and secret content stay apart

- **Public content** is something the browser needs in order to play, such as the intro story. It is served by `GET /api/content/<name>`, with no sign-in. Browsers may keep an answer for five minutes (`Cache-Control: public, max-age=300`), so a changed story can take up to five minutes to reach a page that is already open.
- **A page can hold an old story.** After `story.json` changes and is deployed, a page that is already open can keep playing the old story for up to five minutes, while the server already uses the new one. So the server must never trust what the browser played. When a later package replays a player's moves on the server (the referee, package A3), the browser should send which story it played, for example the story's hash or a version number, and the server should refuse a move log from a different story with a 409. This is a note for that package, not a rule yet. Also note that `max-age` is an instruction for browsers only. It does not ask Vercel's network to cache the answer (that would need `s-maxage`), so every new visitor still starts the API function. Whether to add `s-maxage` is open (see D016).
- **Secret content** goes in `backend/content/secret/`. Nothing in that folder is ever served, and the browser must not be able to work out its text from anything we send.
- **Being in this folder does not make a file public.** A file is public only when its name is on the list `PUBLIC_CONTENT` in `backend/server/routes/content.py`. A name that is not on the list gets a 404. Never put a path or anything from `secret/` on that list. A test checks that every name on the list is a plain `.json` file directly inside `content/`.
- To add public content: put the file here, add one line to `PUBLIC_CONTENT`, and add a test in `backend/server/tests/test_content.py`. Anyone on the internet can read public content, so tell the team first (an issue is enough).

## The format of `story.json`

A story has four top-level fields.

| Field | Type | Meaning |
|---|---|---|
| `title` | text | The name of the story, shown to the player. |
| `start` | scene id | The scene where a new game begins. It must be a key of `scenes`. |
| `items` | object | Everything the player can carry. The key is the item id, for example `brass_key`. |
| `scenes` | object | Every place and every ending. The key is the scene id, for example `cottage`. |

Ids are lowercase words joined with underscores. The engine compares them letter for letter, so spell them the same way everywhere.

### Item

```json
"brass_key": { "name": "Brass key", "description": "Heavy and cold. A tag reads: TOWER DOOR." }
```

| Field | Type | Meaning |
|---|---|---|
| `name` | text | Short name shown in the inventory. |
| `description` | text | One or two sentences shown in the inventory. |

### Scene

| Field | Type | Required | Meaning |
|---|---|---|---|
| `title` | text | yes | Heading of the scene. |
| `text` | text | yes | What the player reads here. |
| `notes` | list of notes | no | Extra lines that appear only when their conditions are met. They show what the player changed earlier. |
| `actions` | list of actions | no | The choices in this scene. An ending has none. |
| `ending` | `true` | no | Marks an ending. When the player arrives in a scene with `"ending": true`, the story is over. |

### Note

```json
{ "when": { "has": ["brass_key"] }, "text": "The drawer is empty now. You already took the key." }
```

| Field | Type | Meaning |
|---|---|---|
| `when` | conditions | Required. The note is shown while these conditions hold. `{}` means always. |
| `text` | text | Required. The extra line. |

A note only displays text. It never changes the game.

### Action

```json
{ "id": "take_key", "label": "Take the key from the drawer",
  "requires": { "missing": ["brass_key"] }, "hide_when_blocked": true,
  "take": "brass_key",
  "message": "You take a heavy brass key. Its tag reads: TOWER DOOR." }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | text | yes | Name of the action, unique inside its scene. In this story every id is unique in the whole story. |
| `label` | text | yes | The button text the player sees. |
| `message` | text | yes | Shown when the action is accepted. |
| `goto` | scene id | no | The scene the player moves to. |
| `take` | item id | no | An item the player picks up. It is added only once. |
| `set` | list of flag names | no | Flags to switch on. Each flag is switched on only once. |
| `requires` | conditions | no | The action works only while these conditions hold. |
| `blocked_message` | text | no | Shown when the player chooses the action but `requires` is not met. The default is "You can't do that right now." |
| `hide_when_blocked` | `true` | no | While `requires` is not met, do not list the action at all. Without it the action is listed as locked. |

### Conditions

Conditions are used in `requires` and in a note's `when`. All four lists are optional, and **all of them must hold**.

| Field | Holds when |
|---|---|
| `has` | The player carries every item in the list. |
| `missing` | The player carries none of the items in the list. |
| `flags` | Every flag in the list is on. |
| `not_flags` | None of the flags in the list is on. |

An empty or missing conditions object always holds.

A **flag** is a name for a decision the game remembers, for example `warned_harbor`. Flags have no list of their own: a flag exists because some action puts it in `set`. A condition that names a flag nobody sets can never be met, so a typo in a flag name fails silently. Check flag names twice.

## What happens when the player picks an action

The engine follows these rules, in this order. The Python engine (`backend/plot_twist/engine.py`) and the browser engine (`frontend/src/story/engine.js`) do exactly the same. The labels R1 to R4 are the rule numbers from the solo game's brief, and the code comments use the same numbers.

1. If the story has ended, nothing works. The message is "This story has ended. Start a new game to play again."
2. If the current scene has no action with that `id`, nothing changes. The message is "You can't do that here."
3. **R1, blocked actions do nothing.** If `requires` is not met, nothing changes (no move, no item, no flag, no save). The message is `blocked_message`, or the default text.
4. Otherwise the action is accepted, and these things happen in order:
   - the `take` item is added to the inventory if the player does not already have it (**R2, no duplicates**);
   - each flag in `set` is switched on if it is not on yet;
   - the player moves to the `goto` scene;
   - if that scene is an ending, the story is marked as ended;
   - the action's `message` is remembered and the game is saved.
5. **R3, notes remember.** Whenever a scene is shown, its notes whose conditions hold are shown too.
6. **R4, a new game resets the progress, never the story.** The story data is never changed while playing.

What the player sees as choices: if the story has ended, none. Otherwise every action whose `requires` holds, plus every blocked action that is not marked `hide_when_blocked` (shown as locked).

A saved game holds exactly five things: the current `scene`, the `inventory` (item ids), the `flags`, whether the story has `ended`, and the last `message`.

## What the tests check

- The story has at least 5 scenes, 2 items and 2 endings.
- Every `goto` names a scene that exists and every `take` names an item that exists.
- Every ending can be reached by some legal sequence of choices (the test tries them all).
- The acceptance scenarios A1 to A6 (from the solo game's brief) play fixed routes through the story, using ids such as `to_tower`, `take_key` and `unlock_door`. **If you rename one of these ids, update the tests too.**
- The Python and the JavaScript engine give the same answer to the same moves on this file.
- **The format.** `backend/plot_twist/tests/test_story_format.py` checks the rules in the tables above: `start` names a scene; `title`, `text`, `name`, `description`, `id`, `label` and `message` are texts that are not empty; `goto`, `take` and `blocked_message` are texts that are not empty when present; `ending` and `hide_when_blocked` are exactly `true` when present; `set` and the four condition lists are lists of texts; every note has a `when` object. Extra fields that this page does not mention are allowed, because both engines ignore them.

Why the format is checked: the two engines give the same answers for every story that follows it, but they can differ for a story that does not. For example, a note without `when` stops the Python engine with an error while the browser always shows the note, and `"ending": []` counts as false in Python but as true in the browser. Once the server replays a player's moves (package A3), such a difference would make the server decide something other than what the player saw.

The tests do not check these directly: that item ids in `has` and `missing` exist, that flag names are spelled consistently, or that every scene can be reached. The content linter planned for the second pull request (`backend/tools/lint_content.py`) is meant to catch unknown items and flags.

## Where this story came from

Imported on 5 November 2026 as an unchanged copy of `plot_twist/story.json` from Nils' solo game Plot Twist, at commit `e235ee4` (decision D007). The SHA-256 of the file as imported is `3713d17a778d7ad3cfe8a8f24e33810bc96a54e1f8be90f3babf15d5698c66a2`. The solo repository itself was not changed.

The 11 original tests (9 acceptance and content tests, and 2 parity tests) were ported with the same assertions. The engines were ported with the same rules. A few tests were added on top (see `backend/plot_twist/tests/__init__.py`).

This is Story v1. The team writes the next version of the story itself, and nobody needs the solo repository for that.

The solo game also had a terminal version (`cli.py`, started with `python -m plot_twist`). It is not part of the web game, so it was not imported.

## buildings.json: the buildings of a home islet

`buildings.json` holds what the home islet (package L2) is made of: its five spots, which building each spot holds, what a level 1 building costs and how much timber every player starts with. It is **server only**. It is not on the list `PUBLIC_CONTENT`, so the browser never downloads it (decision D016). The browser gets everything it needs through `GET /api/islet`, which shows each spot with its price and whether the player can build it ([INTERFACES.md](../../docs/INTERFACES.md#your-home-islet-package-l2)). Keys are camelCase, like `market/companies.json`. Coins are play money only.

The server reads and checks the file once, when it starts (`backend/server/game/building_catalogue.py`). A mistake stops the home islet: its routes answer `503 islet_unavailable`, the rest of the API keeps working, and the log names the entry and the field. The numbers are start values from the open-world design (`docs/story/OPEN-WORLD.md`, section 5.1) and change only by pull request.

### Top-level fields

| Field | Type | Meaning |
|---|---|---|
| `about` | text, not empty | Says what the file is. The code only checks that it is there. |
| `playMoneyNote` | text, not empty | The line the islet panel shows to say that coins are play money. It comes with every answer of `GET /api/islet`. |
| `starterTimber` | whole number, 0 to 100 | The timber every player gets once, when the first build makes their islet row. |
| `priceList` | list with exactly one entry | The price of each level. Only level 1 exists until the upgrades are built. |
| `spots` | list of 1 to 10 entries | The spots of the islet, in the order of the place registry (`frontend/src/world/places/registry.js`). |

### An entry of `priceList`

```json
{ "level": 1, "coins": 300, "timber": 10 }
```

| Field | Type | Meaning |
|---|---|---|
| `level` | the whole number 1 | The level this price is for. |
| `coins` | whole number, 1 to 1,000,000 | Coins for the building. 1,000,000 is the biggest change the wallet allows (`MAX_DELTA` in `backend/server/wallet.py`). |
| `timber` | whole number, 0 to 1,000 | Pieces of timber for the building. |

### A spot

```json
{ "plot": "plot_2", "plotName": "Workshop plot", "type": "workshop", "name": "Workshop",
  "about": "A bench and tools for making parts. What it can make comes in a later update.",
  "buildable": true }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `plot` | id | yes | The hotspot of the islet in the place registry, for example `plot_2` or `islet_signal_station`. |
| `plotName` | text, 2 to 40 characters | yes | The name of the spot that the player reads, for example "Workshop plot". |
| `type` | id | yes | The one kind of building this spot holds, for example `workshop`. |
| `name` | text, 2 to 40 characters | yes | The building as the player reads it, for example "Workshop". |
| `about` | text, 1 to 160 characters | yes | One line about the building. It names no culprit: the file holds no case text. |
| `standsFromStart` | true or false | no, default false | True only for the cabin: it is there on the first day, free, and has no levels and no row in the database. |
| `buildable` | true or false | yes | False while the spot cannot be built yet (the windmill and the greenhouse). |
| `lockedNote` | text, 1 to 160 characters | when needed | Why a spot is locked. Needed for a spot that is neither there from the start nor buildable. |

An **id** (`plot` and `type`) is 2 to 40 characters: lowercase letters, digits and underscores.

### What the loader checks

- Every field above has the right type, length and range. A whole number is a whole number: not a fraction, not a text and not `true`.
- No two spots share a `plot`, and no two share a `type`.
- A spot that stands from the start cannot also be buildable.
- A spot that is neither there from the start nor buildable has a `lockedNote`.
- Exactly one spot has the `type` `signal_station`, and its `plot` is `islet_signal_station`. The finale counts it (the crew's third light).

The tests are in `backend/server/tests/test_building_catalogue.py`. `test_islet_matches_migration.py` keeps the file and the SQL check rule `islet_buildings_plot_fits_building` equal.

### Rules for changing the file

- **Never rename a plot or a type after players have built.** Rows in `islet_buildings` point at them, and so does the finale.
- **To open the windmill or the greenhouse** (once timber has a second source, the driftline): set `buildable` to `true`. No code change is needed, because the database already allows a building on those plots.
- **To add a spot:** write a new migration that replaces the check rule `islet_buildings_plot_fits_building`, and add the spot here and to the place registry. The test fails until all three agree.
- **A new price** counts for the next build. A building that stands keeps what it cost (`coins_paid` and `timber_paid` in `islet_buildings`).
