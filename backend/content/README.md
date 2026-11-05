# Game content

> **What this file is:** the guide to the `backend/content/` folder: what lives here, the exact format of `story.json`, the rule that public and secret content stay apart, and where the story came from.
>
> **Who uses it:** everyone who writes or changes story content, and every coding agent that touches the story engine or the content route.

## What lives here

| Path | What it is | Who may see it |
|---|---|---|
| `story.json` | The intro story, "The Keeper's Last Log": scenes, items, choices and endings. | Everyone. The browser downloads it from `GET /api/content/intro-story`. |
| `secret/` (does not exist yet) | Content the browser must never see, for example the real solution of a case. | Server code only. It is never served. |
| `weather_states.json` | The numbers behind the weather states (storm, fog, rain, calm), the hours of a night and the start of the harbor's almanac. | Server only. It is not on the public list. The browser sees the result in `GET /api/weather` (`state`, `tonight`) and `GET /api/bulletin`. |
| `bulletin.json` | Every word of the harbor bulletin, the dated notices and the list of what resets when. | Server only. The browser sees it in `GET /api/bulletin`. |
| `chapter_two_hook.json` | The Board notice and the beam of the Chapter 2 hook, "A light where no light was". | Server only. The browser gets it from `GET /api/bulletin` only after the hook has fired. |

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

## The open-world files (server only)

Three files belong to the open world (the weather states, the daily bulletin and the Chapter 2 hook). They are in this folder so they ship with the API, but none of them is on the public list `PUBLIC_CONTENT`, so `GET /api/content/{name}` answers 404 for them (a test checks it). The server reads each one once, when it starts, and checks every field. A mistake is reported with the file name and the field. The server does not stop because of it: the problem goes to the log, the weather route leaves out `state` and `tonight`, and `GET /api/bulletin` answers `503 bulletin_unavailable`. Their tests are in `backend/server/tests/test_weather_states.py` and `test_daily_content.py`, and they also check the real files. The design is `OPEN-WORLD.md` in the story documents (`docs/story/`, on the branch `docs/s0-story-round` until it is merged; sections 3.1 to 3.4, 5.4 and 10.2), and the build spec is `specs/open-world-must.md`.

None of these texts may name the culprit or the case's answers, before or after the first solve (the spoiler rule, CASE-FILE 14.3). A test scans every text for the words that would give it away.

### weather_states.json

```json
{
  "stateFrom": {"storm": {"wind": 0.8}, "fog": {"fog": 0.5}, "rain": {"rain": 0.4}},
  "night": {"startsHour": 18, "endsHour": 6, "hoursForState": 3},
  "fogNightRule": {"almanacStartsOn": "2026-11-16"}
}
```

| Field | Meaning |
|---|---|
| `stateFrom` | The value of the game's weather (each from 0 to 1, see `weather/mapping.py`) at which an hour counts as a storm (`wind`), as fog (`fog`) or as rain (`rain`). Each number is above 0 and at most 1. In real units: a wind of 0.8 is 48 km/h, a fog of 0.5 is a visibility of 5 km or less (or a fog weather code) and a rain of 0.4 is 3.2 mm an hour (or a rain weather code of 0.4 or more). **The order is not in the file:** if several apply, storm comes first, then fog, then rain, otherwise calm. Cloud cover never changes the state. |
| `night.startsHour`, `night.endsHour` | A night runs from `startsHour` (12 to 23) on one date to `endsHour` (2 to 11) on the next, Lisbon time. A night therefore spans midnight and never touches 01:00, the hour in which the Lisbon clocks change. A daytime is the rest of the date. |
| `night.hoursForState` | A night or a daytime takes a state when this many of its hours have it (1 to 12). |
| `fogNightRule.almanacStartsOn` | The date from which the harbor's almanac counts one fog night in every three, written `YYYY-MM-DD`. It also counts backwards from that date. |

Other loops may add their own keys to this file later (storm warnings, rainy oil). The loader ignores keys it does not know.

### bulletin.json

| Field | Meaning |
|---|---|
| `stateWords` | One word for each weather state: exactly `storm`, `fog`, `rain` and `calm`. |
| `noForecast` | The words for a night or day whose weather is not known. |
| `weatherLine` | The first line. It must contain `{tonight}` and `{tomorrow}`, which are replaced by the words above. |
| `fogNightLines` | The line for a fog night while the coast is dark: exactly `real` (the weather made it) and `almanac` (only the rule did). |
| `exchange.feedWords` | One phrase for each price feed: exactly `live`, `cache`, `stale` and `replay`. |
| `exchange.allOpen`, `exchange.somePaused` | The Exchange line. `allOpen` must contain `{feed}`. `somePaused` must contain `{feed}` and `{companies}` (the names of the paused companies, separated by commas). |
| `relitLine`, `relitLineHours` | The line for the days after the first solve, and for how many hours it is shown (1 to 168). |
| `calendar` | Dated notices: `{"on": "2026-11-16", "text": "..."}`. A notice is shown in the bulletin of that bulletin day (08:00 to 08:00). A date may appear only once. The list may be empty. |
| `resets` | What resets when, as `{"when": "Every day at 00:00", "what": "A new game day begins."}`. The list is not empty. The bulletin sends it with the day, for a help box. |

A text is never empty and at most 600 characters. A template may contain only its own placeholders in curly braces.

### chapter_two_hook.json

| Field | Meaning |
|---|---|
| `id` | Always `chapter_two_hook`. The browser keeps its "new" mark for the notice by it. |
| `firesByNight` | The hook fires at the end (06:00 Lisbon time) of the first calm night among the first this many nights after the first solve, or at the end of the last of them (1 to 7). |
| `bulletinLine` | The one line in the bulletin of the morning it fires. |
| `notice.title`, `notice.text` | The Board notice. It describes the flashes in words ("a row of long and short flashes", as Elena's drawing in the logbook does) and names no exact pattern, so Chapter 2 can still choose one. It must not name the missing lens: the lens count comes from the ledger at Gull's Rest, which is on the spoiler list. |
| `beam.chart` | Where the beam is on the sea chart: `x` from 0 to 447 and `y` from 0 to 255 (the chart is 448 by 256). Beyond Gull's Rest at (407, 34). Never shown in a text. |
| `beam.pattern` | The flashes, 1 to 12 of `short` and `long`, in the order they flash. A proposal for the package that draws the beam. It must not be the harbor alarm, `long, short, long`. |
| `beam.flash` | The timings in seconds, each above 0 and at most 10: `shortSeconds`, `longSeconds`, `gapSeconds` (between two flashes) and `pauseSeconds` (between two rounds). |
