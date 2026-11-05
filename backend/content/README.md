# Game content

> **What this file is:** the guide to the `backend/content/` folder: what lives here, the exact format of `story.json`, the rule that public and secret content stay apart, and where the story came from.
>
> **Who uses it:** everyone who writes or changes story content, and every coding agent that touches the story engine or the content route.

## What lives here

| Path | What it is | Who may see it |
|---|---|---|
| `story.json` | The intro story, "The Keeper's Last Log": scenes, items, choices and endings. | Everyone. The browser downloads it from `GET /api/content/intro-story`. |
| `names.json` | The word lists for generated captain names such as "Brave Puffin 17" (package A2, decision D006). | The server only. It is not on the list of public content and is never served. |
| `entry_kits.json` | The four entry kits of the case and which Act 1 ending leads to which one (package A3, decision D019). | The server only. It is not on the list of public content and is never served. |
| `secret/` (does not exist yet) | Content the browser must never see, for example the real solution of a case. | Server code only. It is never served. |

Content is data, not code. The story engine reads it and never contains story text. You can change `story.json` without touching any Python or JavaScript.

## Why this folder is in `backend/`

Decision D016 (proposed): game content that the server uses lives in `backend/content/`. Vercel builds each service from its own folder only. The API service is built from `backend/`, so files here are available to the server. The browser service is built from `frontend/`, so nothing in this folder ends up in the browser bundle by accident. That matters for secret content such as the case solution, which must never be bundled into the browser. The browser gets public content through the API instead.

## Public and secret content stay apart

- **Public content** is something the browser needs in order to play, such as the intro story. It is served by `GET /api/content/<name>`, with no sign-in. Browsers may keep an answer for five minutes (`Cache-Control: public, max-age=300`), so a changed story can take up to five minutes to reach a page that is already open.
- **A page can hold an old story.** After `story.json` changes and is deployed, a page that is already open can keep playing the old story for up to five minutes, while the server already uses the new one. So the server must never trust what the browser played. The referee (package A3, decision D019) replays a player's moves on the server, and it does not ask which story the browser played: Story v2 only adds actions and changes no rule, so an old move log still replays to the same end state. A log that only a newer story allows is refused as `move_refused`, and the message tells the player to reload the page. The referee stores the SHA-256 of the story file it replayed on with each entry profile, so a later audit knows which story a profile was judged on. Also note that `max-age` is an instruction for browsers only. It does not ask Vercel's network to cache the answer (that would need `s-maxage`), so every new visitor still starts the API function. Whether to add `s-maxage` is open (see D016).
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

## The format of `names.json`

The word lists for generated captain names (package A2, decision D006). The server reads them with `backend/server/account/names.py`. The file is **server only**: its name is not on `PUBLIC_CONTENT`, so `GET /api/content/...` never serves it, and the browser never needs it.

A captain name is **an adjective, a noun and a number from 10 to 99**, for example `Brave Puffin 17`. With 40 adjectives, 40 nouns and 90 numbers there are 144,000 names. Names are not unique (the database allows two players the same name), and a name never comes from the GitHub login or from free text. Names appear on a projector, so **every word must be kind and plain**. Bird names with a slang meaning (booby, shag) are left out on purpose. A human reads every new word before it is added.

| Field | Type | Meaning |
|---|---|---|
| `about` | text | A note for people. The server ignores it. |
| `adjectives` | list of words | The first part of a name. At least 32 words. |
| `nouns` | list of words | The second part of a name. At least 32 words. |

The rules for a word, which `load_word_lists` checks when the server reads the file:

- One word of 2 to 12 letters, A-Z and a-z only, with a capital first letter. No hyphen, space, digit or accent.
- No word appears twice, not inside one list and not in both lists.
- The longest adjective, the longest noun, two spaces and the two digits of the number must fit into 24 characters, which is the limit of `profiles.display_name`. Today that is "Wandering Lighthouse 99": 23 characters.

A file that breaks a rule stops the code with a message that says which word or list is the problem. `backend/server/tests/test_captain_names.py` loads the real file on every test run, so a broken list cannot be merged.

**Changing a list never renames a player.** A player's name is stored in the database when it is given. Adding or removing a word only changes the names that new players and re-rolls draw from. Two players can still draw the same name. That is allowed and rare (about 1 in 144,000 for any two players).

**A human reads every word (pending Nils' decision, N9).** Nils or the S lane reads both lists before a class sees the names. A check by a reviewer found these pairs that could read as teasing on a projector, to look at first:

- `Sturdy`, `Hardy` or `Mighty` with `Whale` or `Walrus`: they can sound like body-shaming.
- `Windy` with any noun: it invites a fart joke.
- `Crab`: it is also a slang word.

If a word is dropped, replace it with a neutral word that follows the rules above (one capitalised word of 2 to 12 letters), keep at least 32 words in each list, and keep the longest possible name within 24 characters. `test_captain_names.py` checks all three.

## The format of `entry_kits.json`

The four entry kits of the case, and which Act 1 ending leads to which one (package A3, decision D019). The server reads the file with `backend/server/game/entry_kits.py`. It is **server only**: its name is not on `PUBLIC_CONTENT`, so `GET /api/content/...` never serves it. The browser gets the kit it needs in the answer of `POST /api/intro/complete`.

**Pending Nils' decision (N5).** The coins and the texts come from the S0 story drafts (`CASE-FILE.md`, section 3) and wait for Nils' approval of S0. A test (`test_entry_kits.py`) pins the coins, so changing one is a visible act.

| Field | Type | Meaning |
|---|---|---|
| `about` | text | A note for people. The server ignores it. |
| `decisionFlags` | object | `trusted` and `warned`: the names of the two story flags that stand for the decisions. Today `trusted_fisherman` and `warned_harbor`. |
| `logFlag` | flag name | The flag that means "read the keeper's last logbook entry": `read_log`. It gives the log card and does not change the kit. |
| `kits` | list of kits | The kits. Today four. |

The three flag names must be three different flags that some action of `story.json` sets. A test checks that.

### Kit

```json
{ "id": "witness", "name": "Witness", "ending": "ending_trapped", "decision": "warned",
  "startPlace": "saltreach_harbor", "coins": 1000, "cheapCard": "C2",
  "item": { "id": "radio_words", "name": "Words through the door", "text": "..." } }
```

| Field | Type | Meaning |
|---|---|---|
| `id` | id | `true_keeper`, `witness`, `informant` or `stranger`. The database repeats this list (the rule `entry_profiles_kit_allowed`, and later the seats of a crew), and a test compares it with this file. |
| `name` | text | What the player sees. |
| `ending` | scene id | The Act 1 ending scene that leads to this kit. It must be a scene of `story.json` with `"ending": true`. |
| `decision` | `warned`, `trusted` or `none` | What the player decided at the shore. `none` means neither flag is set. |
| `startPlace` | place id | Where the player starts the case. It must be a place of the browser registry `frontend/src/world/places/registry.js`: `lighthouse_isle` or `saltreach_harbor`. |
| `coins` | whole number | The kit coins, paid once through the wallet reason `kit_grant` with the fixed ref `kit`. From 1 to 1,000,000 (the limit of one wallet change). |
| `cheapCard` | card id | The clue card the player holds from the start, for example `C2`. The case (package S3) shows it. |
| `item` | object | A small item: `id`, `name` and `text`. |

An **id** is 2 to 40 characters: lowercase letters, digits and underscores. The pair `ending` and `decision` belongs to exactly one kit, and no two kits share an `id`.

### How the 8 end states of today's story map to the 4 kits

| Ending | Flags at the end | Decision | Kit | `readLog` |
|---|---|---|---|---|
| `ending_rescue` | `warned_harbor` | warned | True Keeper | no (yes with the logbook) |
| `ending_trapped` | `warned_harbor` | warned | Witness | no (yes with the logbook) |
| `ending_trapped` | `trusted_fisherman` | trusted | Informant | no (yes with the logbook) |
| `ending_trapped` | neither | none | Stranger | no (yes with the logbook) |

The rescue is only possible after warning the harbor master, so there is no rescue with the other two decisions. Reading the logbook gives the same kit with `readLog` true, which makes eight end states. Story v2 adds one action at the shore (`keep_quiet`, which sets no flag), so it still has the same eight end states.

### What `load_entry_kits` checks

A file that breaks a rule stops the code with a message that names the file and the field. The route answers `503 intro_unavailable` for such a file, and the log says why.

- The file is a JSON object with `kits` (a list with at least one kit), `decisionFlags` and `logFlag`.
- Every kit has all eight fields, with the right kind of value. `coins` is a whole number (not text, not `true`, not a decimal) from 1 to 1,000,000. `decision` is one of the three words.
- No two kits share an `id`, and none share the pair `ending` and `decision`.
- The trusted flag, the warned flag and the log flag are three different names.

### Changing the file

- **A changed kit changes what new players get.** A player who has an entry profile keeps it, because the first ending counts (decision D019). The profile stores the kit id, the start place and the coins as they were.
- **A new ending or a new decision needs a kit.** If the story can end in a way that no kit covers, `kit_for` raises an error and the player gets a 500. `test_referee.py` searches the real story for every end state and fails first.
- **A new kit id needs a new migration**, because the table `entry_profiles` lists the allowed ids. Never edit the migration that exists.
