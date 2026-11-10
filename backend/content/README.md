# Game content

> **What this file is:** the guide to the `backend/content/` folder: what lives here, the exact format of `story.json`, the format of the case data (`secret/case.json`) and the partner lines (`partners.json`), the rule that public and secret content stay apart, and where the story came from.
>
> **Who uses it:** everyone who writes or changes story content, and every coding agent that touches the story engine, the case or the content route.

## What lives here

| Path | What it is | Who may see it |
|---|---|---|
| `story.json` | The intro story, "The Keeper's Last Log": scenes, items, choices and endings. | Everyone. The browser downloads it from `GET /api/content/intro-story`. |
| `secret/case.json` | The case "The Light That Shouldn't Be": cards, routes, deductions, the finale, the reveal. It names the culprit. Format: [The case data](#the-case-data-secretcasejson-and-partnersjson). | Server code only. It is never served. |
| `partners.json` | Every word an NPC partner says (34 lines). Format: [The case data](#the-case-data-secretcasejson-and-partnersjson). | Server code only. It is not on the public list. |
| `market/` | The Island Exchange: the seven companies and the recorded replay. Its own `README.md` explains them. | Server code only. |
| `weather/` | The recorded weather answer and saved sample answers. Its own `README.md` explains them. | Server code only. |
| `names.json` | The word lists for generated captain names such as "Brave Puffin 17" (package A2, decision D006). | The server only. It is not on the list of public content and is never served. |
| `entry_kits.json` | The four entry kits of the case and which Act 1 ending leads to which one (package A3, decision D019). | The server only. It is not on the list of public content and is never served. |
| `buildings.json` | The buildings of a home islet (package L2): the five spots, the price of a level 1 building and the starter timber. Format: [buildings.json](#buildingsjson-the-buildings-of-a-home-islet). | The server only. It is not on the list of public content; the browser gets everything through `GET /api/islet`. |
| `weather_states.json` | The numbers behind the weather states (storm, fog, rain, calm), the hours of a night and the start of the harbor's almanac. | Server only. It is not on the public list. The browser sees the result in `GET /api/weather` (`state`, `tonight`) and `GET /api/bulletin`. |
| `bulletin.json` | Every word of the harbor bulletin, the dated notices and the list of what resets when. | Server only. The browser sees it in `GET /api/bulletin`. |
| `chapter_two_hook.json` | The Board notice and the beam of the Chapter 2 hook, "A light where no light was". | Server only. The browser gets it from `GET /api/bulletin` only after the hook has fired. |
| `keeper_lock.json` | Every word of the Keeper's Lock (the class demo's weather puzzle, D029): the question, the five skies, the riddle used when the weather cannot be read (its answer is not secret) and the messages. | Server only. It is not on the public list; the browser gets it through `GET /api/lock` and `POST /api/lock/answer`. |

Content is data, not code. The story engine reads it and never contains story text. You can change `story.json` without touching any Python or JavaScript.

## Why this folder is in `backend/`

Decision D016 (proposed; the case files already follow it): game content that the server uses lives in `backend/content/`. Vercel builds each service from its own folder only. The API service is built from `backend/`, so files here are available to the server. The browser service is built from `frontend/`, so nothing in this folder ends up in the browser bundle by accident. That matters for secret content such as the case solution, which must never be bundled into the browser. The browser gets public content through the API instead.

## Public and secret content stay apart

- **Public content** is something the browser needs in order to play, such as the intro story. It is served by `GET /api/content/<name>`, with no sign-in. Browsers may keep an answer for five minutes (`Cache-Control: public, max-age=300`), so a changed story can take up to five minutes to reach a page that is already open.
- **A page can hold an old story.** After `story.json` changes and is deployed, a page that is already open can keep playing the old story for up to five minutes, while the server already uses the new one. So the server must never trust what the browser played. The referee (package A3, decision D019) replays a player's moves on the server, and it does not ask which story the browser played: Story v2 only adds actions and changes no rule, so an old move log still replays to the same end state. A log that only a newer story allows is refused as `move_refused`, and the message tells the player to reload the page. The referee stores the SHA-256 of the story file it replayed on with each entry profile, so a later audit knows which story a profile was judged on. Also note that `max-age` is an instruction for browsers only. It does not ask Vercel's network to cache the answer (that would need `s-maxage`), so every new visitor still starts the API function. Whether to add `s-maxage` is open (see D016).
- **Secret content** goes in `backend/content/secret/`. Nothing in that folder is ever served, and the browser must not be able to work out its text from anything we send. Tests prove it: `backend/server/tests/test_content.py` tries every name and path for every file in `secret/`, and for every other file that is not on the public list, and checks that the answer is a 404 with none of the file's text in it.
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

## The case data: `secret/case.json` and `partners.json`

This section is the data format of the case "The Light That Shouldn't Be", field by field, and the rules a linter checks before any of it reaches a player. It is for the S3 package (the case on the server) and its coding agent, the S4 package (NPC partners), the map and finale-visuals packages, and anyone who changes a card, a route or a number. The story behind every field is in [docs/story/CASE-FILE.md](../../docs/story/CASE-FILE.md).

**Spoiler warning.** `secret/case.json` names the culprit. The repository is public, so anyone can read it here. In the game, the culprit's name reaches only crews that solved the case.

**Where the files live.** Decision D016 puts server content in `backend/content/` and the secret case in `backend/content/secret/`, because the deployed API may not see files outside `backend/` and the game build must never pick up the solution. The story round (package S0) wrote the two files in a draft folder at the top of the repository so that the story could be reviewed as one piece. They were then moved here: the case to `secret/case.json` and the partner lines to `partners.json` (the name the interfaces page reserves for S4). This section was the data page of that draft folder. [docs/story/README.md](../../docs/story/README.md#where-the-files-live) lists what moved. D016 itself stays proposed until a teammate has reviewed it (D001).

### The two files

| File | What it holds | Story document that explains it |
|---|---|---|
| `secret/case.json` | The whole case for one crew: kits, places, suspects, 8 cards and their routes, 4 deductions, the board, the case clock, the Night of Three Lights, the accusation, the reveal, rewards and the Relighting. Server only, never served. | [CASE-FILE.md](../../docs/story/CASE-FILE.md) |
| `partners.json` | Every word an NPC partner says, including one "found" and one "pinned" line per card. Server only: it is not on the public list. | [NPC-PARTNERS.md](../../docs/story/NPC-PARTNERS.md) |

The timing program, [`backend/tools/simulate_case.py`](../tools/README.md), reads both files and checks the promised minutes.

### The minimum for 23 November

The first S3 pull request loads only what it needs: the routes of kind `kit`, `open` and `timed` (12 of the 19 routes), the lights of tier `must` (three of four), and the linter rules named under "Linter rules". The server may ignore the other routes (`paid`, `share`, `world`, `log_reader`) and the `should` light until their own packages arrive. The file keeps them anyway, so that ids never change. The whole list is in [CASE-FILE.md](../../docs/story/CASE-FILE.md#the-minimum-for-23-november).

### Five ground rules

1. **Server only.** `secret/case.json` holds the solution (`accusation.culprit`) and every card text. Never import it in `frontend/` code. The browser gets only what the server sends: a card when a seat finds it, a finding when a deduction forms, the reveal after the accusation. `server/tests/test_content.py` proves that no name and no path serves a file from `secret/`.
2. **Data, not code.** Code reads every text and number from here. No card text, price or minute is typed into Python or JavaScript.
3. **Ids never change.** Saves, board pins and wallet `ref`s point at ids such as `C4` and `C4.back_room`. Change a text freely; never rename an id that has shipped.
4. **Writing style.** Plain English, short sentences, no em dash, no en dash. Characters have titles only; Elena is the only named character. Place and company names are placeholders until the final name check.
5. **One change, one check.** After any edit, run the linter (the rules below) and the case tests. If the story changes, update CASE-FILE.md in the same pull request.

### The shape at a glance

```text
case.json
  format_version, case_id, title, status, about, where_it_lives, spoiler_warning, server_only,
  placeholder_names
  premise, question
  kits[]               4 kits: who starts where, with what, and which card is cheap for them
  all_seats_carry      the two Act 1 items every seat holds
  entry_profiles[]     8 profiles: 4 kits x read the log or not
  places[]             places and their hotspots, with the ids of the place registry (at most one
                       card per hotspot)
  suspects[]           4 suspects, how each is cleared, the line a wrong accusation gets
  log_card             what reading Elena's log in Act 1 gives the crew
  continuity_lines[]   lines that keep Act 1 and the case consistent
  cards[]              C1 to C8, each with its routes[]
  deductions[]         D1 to D4: two cards each, a finding, what it clears and opens
  board                pin and pairing rules
  muster               what the case needs from the muster step
  case_clock           the crew's minute counter and its windows (low tide and others)
  night                the Night of Three Lights: rules, aiming, chart, lights[], lines
  accusation           who can accuse, what it needs, the culprit
  reveal               the twist lines, a closing line per kit, the last beat
  rewards              coins with wallet reasons and refs, keepsakes, epilogue lines
  relighting           what the first solve changes for everyone, later crews, the spoiler rule
  partners             what the case expects from NPC partners
  planning             estimate constants and the two timetables (not enforced)
```

### Field by field

#### Top level

| Field | Type | Meaning |
|---|---|---|
| `format_version` | number | The version of this format. Today `1`. Raise it when a field changes meaning. |
| `case_id` | text | `false_light`. Every wallet `ref` of the case starts with it. |
| `title`, `status`, `about` | text | Shown to developers, not to players. |
| `where_it_lives` | object | `path` (`backend/content/secret/case.json`) and `why` (D016). |
| `spoiler_warning` | text | The same warning as the top of this page. |
| `server_only` | true | A reminder of ground rule 1. |
| `placeholder_names` | list of text | Names that still need the final name check. |
| `premise`, `question` | text | Shown on the crew board when the case starts. |

#### `kits[]`

One entry per kit. The referee (package A3) gives every player one kit from their Act 1 ending. `crew_seats.kit` in the database holds the same ids.

| Field | Type | Meaning |
|---|---|---|
| `id` | text | `true_keeper`, `witness`, `informant` or `stranger`. |
| `name` | text | Shown to players. |
| `act1_end` | object | `ending` (a scene id in story.json) and `decision` (`warned_harbor`, `trusted_fisherman` or `none`). |
| `starts_at` | place id | Where this kit starts the case. |
| `home` | place id | `home_islet` for all four kits. Every player has a home islet, a True Keeper too (OPEN-WORLD.md 5.1). A True Keeper starts on Lighthouse Isle (`starts_at`) but builds on their islet like everyone else. |
| `kit_item` | object | `id`, `name`, `text`: what makes this kit's cheap route possible. |
| `start_coins` | number | Coins the case assumes at the start: 1,000, or 1,600 for the Stranger. The entry kit package is the source; the linter compares when `backend/content/entry_kits.json` exists. |
| `cheap_card` | card id | The one card that is cheap for this kit. |

`all_seats_carry` lists the Act 1 items every seat holds, partners included: `brass_key` and `oil_lantern`. All 8 Act 1 end states hold both.

#### `entry_profiles[]`

Eight entries: each kit with `read_log` true or false. `id` looks like `witness.read_log`. The linter checks fairness against all eight.

#### `places[]` and their `hotspots[]`

| Field | Type | Meaning |
|---|---|---|
| `id`, `name` | text | The ids are the ones in the place registry. `home_islet` is the seat's own home islet, and its beach is the zone `home_driftline`. `anywhere` is the one place that is not in the registry: it means the seat's journal or satchel, wherever it is. |
| `hotspots[].id`, `.name` | text | A spot a player can walk to and investigate. The id is a zone id of the registry (`ferry_pier`, `harbor_office`, `keepers_post_room`, `back_room`, `salvage_yard`, `yard_gate`, `beach`, `islet_signal_station`, `home_driftline`, `plot_2` and so on). One zone may hold several routes to its card: `harbor_office` holds the two slow routes to C6 (the mail boat and the day clerk), and `back_room` the kit route and the doorman's route to C4. The True Keeper's route to C6 sits at `keepers_post_room`, the Stranger's route to C5 at `salvage_yard` and the timed route to C5 at `yard_gate`. |
| `hotspots[].card` | card id or null | The card this hotspot can give. **At most one card per hotspot.** A hotspot with no card is a decoy: searching it finds nothing. |
| `hotspots[].light` | light id or null | The light that stands here, if any. The Keeper's lamp has a zone of its own, `keepers_lamp` (the lamp room above the tower door). |

Every place, hotspot and light id must exist in the place registry on `main`, `frontend/src/world/places/registry.js`, which owns the ids and the positions; this file owns what is found there. Only the virtual place `anywhere` (the journal and the satchel) is not in the registry. The registry is browser code (D016), so a test compares the ids and the light positions (CASE-FILE.md, section 17). The ids follow the registry since the G6 merge (`9f5bf97`), which added the zones `keepers_lamp`, `keepers_post_room`, `yard_gate` and `home_driftline`. A registry zone that is not listed here is a decoy: searching it finds nothing. NPC-PARTNERS.md says "place" for what this file calls a hotspot: a partner searches one hotspot at a time.

#### `suspects[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | text | `fisherman`, `salvage_foreman`, `coastguard_commander`, `harbor_master`. |
| `title` | text | How the game names them. Titles only. |
| `on_the_surface` | text | Why players might suspect or trust them. |
| `cleared_by` | deduction id or null | The deduction that rules them out. The culprit has null. |
| `refused_line` | text or null | What a wrong accusation of this suspect shows. Starts with "Refused." |

#### `log_card`

What reading Elena's log in Act 1 gives. Story v2 owns the Act 1 text; the case owns the effect.

| Field | Meaning |
|---|---|
| `for_profiles_with` | `read_log`. |
| `board_lead` | Shown on the crew board from the start when any player seat holds the log card. |
| `what_it_saves` | The route `C8.log_reader`: after D3, a log reader finds the torn page with no search timer. |
| `pinnable` | false: the log card is a lead, not one of the eight cards. |
| `partners_carry_it` | false: partners never played Act 1. |

#### `continuity_lines[]`

Lines that keep Act 1 and the case consistent, for example the release order at the jail that explains why the fisherman is free. Fields: `id`, `place`, `hotspot`, `text`, `shown_to`.

#### `cards[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | text | `C1` to `C8`. |
| `title` | text | The card's name on the board. |
| `deduction` | deduction id | The one deduction this card belongs to. |
| `kind` | `open` or `kit` | `open`: no kit has an advantage. `kit`: cheap for one kit. |
| `cheap_for_kit` | kit id or null | For a kit card, the kit that has the cheap route. |
| `opens_after` | list of deduction ids | The card cannot be found, and its lead is hidden, until these are solved. Empty means from the start. |
| `lead` | text | The one-line hint shown on the board once the card is open. NPC-PARTNERS.md calls an open card a "lead": a partner can fetch only a lead. |
| `closed_line` | text, optional | What a player sees at the hotspot while the card is not open yet. |
| `text` | text | **The card exactly as players read it.** The same for every route. At most 400 characters. |
| `routes` | list | Every way to find the card. See the next table. |

#### `cards[].routes[]`

A route is one way to find a card. The server keeps every rule in these fields, so a route can be checked without reading its text.

| Field | Type | Meaning |
|---|---|---|
| `id` | text | `<card id>.<name>`, for example `C4.low_tide_cave`. |
| `kind` | text | `kit`, `open`, `timed`, `paid`, `share`, `world` or `log_reader` (table below). |
| `place`, `hotspot` | ids | Where the route is taken. The hotspot's `card` must be this card. |
| `kit` | kit id or null | Only for `kind: kit`: the one kit that may use it. |
| `players_only` | true or false | True means NPC partners may never use it. |
| `coins` | number | The price. 0 for every kind except `paid`. |
| `open_when` | `always` or a window id | A `timed` route can start only while its window in `case_clock.windows` is open. |
| `timer_minutes` | number | Case minutes from starting the route until the card lands in the seat's journal. The seat may do other things meanwhile. |
| `estimate_minutes` | number | Planning only, never enforced: how long a first-time player needs, setting off from Saltreach Harbor. It follows `planning.estimate_formula`. Waiting for a window comes on top. |
| `found_line` | text | One sentence shown with the card when it is found this way. At most 240 characters. |
| `starts_in_journal` | true, optional | The card is in every seat of that kit from minute 0. Only `C2.radio_words`. |
| `needs_flag` | flag name, optional | Only `share` routes: the feature flag that must be on (`market`). |
| `needs_share` | text, optional | Only `share` routes: the company share the player must hold, by the company `id` in `backend/content/market/companies.json` (`greyfathom-salvage`). The share is bought on the Exchange; the route itself costs nothing. |
| `needs_world` | text, optional | Only `world` routes: the open-world event that must have happened (`sealed_crate_on_your_beach`). |
| `needs_profile` | text, optional | Only `log_reader` routes: `read_log`. |

The seven route kinds:

| Kind | Who may use it | Costs | Counts for solvability? |
|---|---|---|---|
| `kit` | Seats with that kit, players and partners | Free, always open, the shortest timer of the card | Yes |
| `open` | Every seat | Free, always open | Yes |
| `timed` | Every seat | Free, only inside a case-clock window | Yes |
| `paid` | Every seat. A partner uses it only when the order says `allowPaid`, and its price is charged to the player who gave the order. | `coins` | No: coins are a shortcut |
| `share` | Players only | Holding one share; needs the `market` flag | No |
| `world` | Players only | Depends on real weather in the open world | No |
| `log_reader` | Players whose profile read the log | Free | No: it is a bonus |

The order of routes inside a card matters for partners: NPC-PARTNERS.md lets a partner take the cheapest usable route that is open when it arrives, and on a tie the first one in this file. Keep the order kit, open or timed, paid, then the player-only kinds.

**How the server takes a route for a player.** Settle the case clock first. Then check, in this order, and stop at the first failure without changing anything: the card is open (`opens_after`); the seat does not hold the card yet; the seat may use the route (`kit`, `players_only`, `needs_*`); the window is open (`open_when`); the player can pay (`coins`). Then charge the coins with the wallet, store the start minute, and put the card in the seat's journal at start plus `timer_minutes`.

#### `deductions[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | text | `D1` to `D4`. |
| `name` | text | Short name on the board. |
| `cards` | two card ids | The pair. It forms only when the two cards are pinned by two different seats and a player pairs them. |
| `finding` | text | Shown to the whole crew when it forms. |
| `clears`, `clear_line` | suspect id and text, or null | The suspect it rules out, and the sentence that says so. |
| `opens` | list | What it unlocks: card ids, light ids, `nightfall` or `accusation`. |
| `opens_line` | text | Tells the crew what is now open. |

#### `board`

Pin and pairing rules: `pins`, `player_pin_minutes` (0), `partner_pin_minutes` (a pointer to NPC-PARTNERS.md), `pairing_by` (`player`), `pair_needs_two_seats` (true), `wrong_pair_wait_seconds` (30) and the `lines` for a wrong pair, a pair from one seat, an unpinned card and the wait.

#### `muster`

What the case needs from the muster step before the case clock starts: partners in every empty seat (`fills_empty_seats_with_partners`), one third-light building (`case_needs`: a level 1 signal station on a player's home islet, which every crew can build), an `optional_extra` (the workshop for the ruin light, tier should), the `reminder_line` and a `note` with the open-world prices.

#### `case_clock`

| Field | Meaning |
|---|---|
| `starts` | The clock starts at 0 when the muster ends. |
| `unit` | Whole case minutes. |
| `owner` | The crew model decides how the clock moves. The case only reads it. |
| `no_background_jobs` | Every timer, window and night is worked out from stored minutes when someone asks. |
| `windows.<id>` | `every_minutes`, `from_minute`, `open_minutes`, `closed_line`. A window is open when `from_minute <= (case_minute % every_minutes) < from_minute + open_minutes`. `{minutes}` in `closed_line` is the wait until it opens. |

#### `night`

| Field | Meaning |
|---|---|
| `opens_after` | `["D1"]`: a player may call nightfall once D1 is solved. |
| `called_by` | `player`. The clock never calls nightfall by itself. |
| `always_fog` | A case night always brings the crew's own fog and false light. Real weather does not matter. |
| `night_minutes` | Longest night: 20 case minutes. |
| `dawn_wait_minutes` | After a failed night, the crew waits 3 minutes before calling nightfall again. |
| `lights_needed` | 3. |
| `one_seat_per_light` | One seat per light and one light per seat. |
| `aimed_by` | Only players aim, also for a light a partner holds. |
| `aiming` | Four rules. `where`: aiming happens in the browser and costs no request; Lock sends the bearing. `beam_stays_aimed`: a beam keeps its bearing after a lock ends or is refused, and pressing Lock again re-sends it. `aim_first_lock_later`: one player may aim every beam first and then lock them one after another. `reserved_light_shows_its_beam`: a light reserved by a partner order shows its beam at once, but a lock counts only when a seat is on post. |
| `lock_seconds` | An accepted lock holds 90 seconds. |
| `locks_must_overlap` | The fog parts when three accepted locks are all still held, so the last must be accepted less than `lock_seconds` after the first. |
| `lock_ends_when_seat_leaves` | A lock also ends when the seat at that light leaves it. |
| `tolerance_degrees` | 5: the lock is accepted when the beam's centre line is within 5 degrees of the true bearing. |
| `beam_width_degrees` | 10: the drawn gold wedge, so "the light inside the beam" means "within 5 degrees". |
| `turn_step_degrees` | Keyboard steps: 1 degree, 5 with Shift. |
| `relock_wait_seconds` | After an off-target lock, that light can lock again after 5 seconds. |
| `climb_minutes` | A player at a light's place needs 1 minute to climb and light it. |
| `bearing_rule` | How the server computes the true bearing. The chart's y grows to the south, so north is the light's y minus the schooner's y. |
| `chart` | `size` `[448, 256]`, the native pixels of the sea chart, `axes` (x east, y south), `fog_bank` (`center` `[250, 40]`, `radius` 30), `schooner` (`max_offset_from_fog_center` 20, `seeded_by`: the crew id, so each crew's schooner sits at its own spot), `min_degrees_between_fixed_lights` (20). |
| `lights[]` | `id` (the registry's light ids: `keepers_lamp`, `harbor_light`, `islet_signal_station`, `ruin_light`), `name`, `tier` (`must` or `should`), `place`, `hotspot`, `chart_xy` (a pair on the 448 by 256 chart, copied from the registry: the place's chart position plus half the beam origin, vertical part flipped), `ready` (`from_start`, or a building, or for the ruin light `lens_from` with `craft_minutes`, `fit_after` and `fit_minutes`: a lens can be made at any time, and only fitting it waits for the deductions in `fit_after`, which is D3), `partners_may_man` (the field NPC-PARTNERS.md reads), `planning_price_coins` (the open-world building price), `note`. The `ruin_light` has tier `should`: no crew needs it. |
| `lines` | Texts for nightfall, taking a post, a lock on a light nobody has reached (`not_manned`), an off-target lock, a lock, the fog parting and dawn. `{light}` is filled by the server. |

#### `accusation`

`needs_deductions` (D2, D3, D4), `needs_schooner_found` (true), `accused_by` (a player aboard the schooner), `suspects` (the four ids in screen order), `culprit` (the only field that holds the culprit's id; the reveal, closing and epilogue texts name him in words and are held back the same way), `wrong_wait_seconds` (60) and `lines`.

#### `reveal`

| Field | Meaning |
|---|---|
| `spoiler` | true: shown only to the seats of the crew that solved it, and later only to players who have solved. |
| `lines[]` | `id`, `text`, `cites`: the unmasking, the twist line and four "how" lines. |
| `closing_lines.<kit id>` | One closing line per kit, each with `cites`. |
| `log_reader_line` | One extra line for players whose profile read the log, with `cites`. |
| `last_beat` | The final line ("One lens is missing."), with `cites`. |
| `order` | The order the screen shows them in. `closing_line` stands for the line of the viewer's own kit. |

`cites` lists the cards that make a line fair. Every reveal line must cite at least one card, and every cited card must be reachable by all 8 entry profiles (rule L11).

#### `rewards`

| Field | Meaning |
|---|---|
| `contributor`, `part_of_a_deduction`, `finale_role`, `partner_pin_counts_for`, `frozen_when` | Who earns what, in words the tests can follow. |
| `once_per_player` | true: the `ref`s carry no crew id, so the ledger refuses a second payout from another crew. |
| `coins[]` | `id`, the amount (`amount`, or `base`, `per_deduction_part`, `finale_role` and `max` for the solve share), `when`, `reason` (a wallet reason), `ref` (with `{card_id}` or `{deduction_id}` to fill in) and `max_per_player`. |
| `paid_routes` | The wallet reason and the `ref` patterns for paid routes, for players and for partners. |
| `keepsakes[]` | Non-coin rewards: `id`, `kind`, `text`. |
| `epilogue_lines` | One line per kit, plus a suffix for log readers. |

#### `relighting`

`trigger`, `world_stage` (`dark` to `relit`, once, and only while the relight lock is open), `relight_lock` (one server setting keeps the switch locked until the game opens, so the team's own test solves cannot relight the coast), `rehearsals` (there is no separate demo world for now; rehearsals use the `?demo=1` tour, which never touches the live world), `for_everyone[]` (`id`, `text`, and `tier` `should` for the changes that need a change in another package, such as `greyfathom_delisted`), `later_crews` (names, one more light, `extra_light_spots`), `spoiler_rule` (`rule`, `covers`, `everyone_else_sees`, `wall_shows`, `inside_a_case`) and `crews_still_on_the_case[]`.

#### `partners`

What the case expects from NPC partners: which route kinds they may and may not use, that a paid route needs `allowPaid` (`paid_only_with_allow_paid`), who pays for it, the Witness partner's starting card, the two lights they may man and what they never do. Three fields hold decisions of 5 Nov 2026: `kit_order` (an empty seat takes the first kit in the list that no player holds: informant, stranger, true_keeper, witness; the timing program keeps the same order and a test compares the two), `kit_order_note` and `takeover_kit` (a friend who takes over a seat keeps their own kit). The rules themselves live in NPC-PARTNERS.md and the words in `partners.json`.

#### `planning`

Not rules. The constants of `estimate_formula` (`crossing_minutes`, `find_spot_minutes`, `read_minutes`, `pair_minutes`), `lock_press_seconds`, a copy of the partner minutes from NPC-PARTNERS.md, the two `timetables` (crew of four: 120 minutes, solo: 150) and `expected_totals_minutes`. The timing program `backend/tools/simulate_case.py` reads them; the server never does.

### Linter rules

The S3 package turns these into `backend/tools/lint_case.py` (or adds them to the content linter from package S1, `backend/tools/lint_content.py`) and runs it in `uv run pytest`. Each rule names what it protects.

**For 23 Nov, build first:** L1 to L8, L10 to L12, L14, L15, L18 and L19. L9 and L17 are already checked by the timing program (`backend/tools/simulate_case.py`, and its fast parts in `server/tests/test_case_timing.py`). L13 and L16 follow with the paid routes and the finale geometry.

| Rule | The linter checks | It protects |
|---|---|---|
| L1 | The file is valid JSON, `format_version` is 1 and `case_id` is `false_light`. | Loading |
| L2 | Ids are unique in each list. Cards are exactly C1 to C8 and deductions D1 to D4. Other ids use 2 to 40 characters from a-z, 0-9 and underscore, like `npc_id`. Route ids are `<card id>.<name>`. | Saves, refs and the database |
| L3 | Every reference resolves: kits, places, hotspots, cards, deductions, suspects, windows and lights, wherever they are named. A `needs_share` names a company `id` in `backend/content/market/companies.json`. | Typos |
| L4 | A hotspot holds at most one card, and every route sits at a hotspot whose `card` is that route's card. | Partner searches (NPC-PARTNERS.md 5.5) |
| L5 | Exactly 8 cards and 4 deductions. Each deduction has two different cards, and each card belongs to exactly its own deduction. | The case shape |
| L6 | Four `open` cards and four `kit` cards. The kit cards are cheap for four different kits, and each kit's `cheap_card` points back. Open cards have no kit route. | Every kit matters |
| L7 | A kit card has exactly one kit route: free, always open, for its kit, with the shortest timer of the card. A paid route's timer is at least 3 minutes longer than the kit route's. A timed route's timer is never shorter. | "Cheap for one kit, slower for the rest" |
| L8 | Every route's fields fit its `kind` (the table above). Partner kinds are never `players_only`; `share`, `world` and `log_reader` always are. | Clear route rules |
| L9 | `estimate_minutes` equals crossing (1, or 0 at the harbor or anywhere) plus finding the spot (2, or 0 anywhere) plus `timer_minutes` plus reading (1). | Honest planning numbers |
| L10 | **Every card is reachable by every kit:** for each of the 8 entry profiles and each card there is a free route (its own kit route, an open route or a timed route) that needs no coins, no flag, no world event and no log card. | Any mix of endings works |
| L11 | **Every reveal line cites a card all 8 entry profiles can reach:** every line in `reveal` has at least one entry in `cites`, every cited card exists, and every cited card passes L10 for all 8 profiles. There is one closing line per kit. | A fair twist |
| L12 | **Every kit mix can solve:** for all 531 ways to fill four seats (1 to 4 players, partners holding any kit), each deduction's two cards can be found by two different seats on free routes, with partners limited to partner kinds, and three seats can man three lights (the two public lights plus one light a player can build for at most the smallest `start_coins`). | Solo, 2, 3 and 4 players |
| L13 | **Starting coins are enough:** for each kit, the cheapest third-light building plus the cheapest paid route of every kit card that is not its own costs at most that kit's `start_coins`. | One player alone can afford every shortcut |
| L14 | No deduction needs a card that opens after that deduction or a later one. The night opens after an existing deduction. | No dead ends |
| L15 | Every suspect except the culprit is cleared by exactly one deduction, which the accusation needs, and has a `refused_line` starting "Refused.". The culprit is cleared by none. The culprit's id appears in no other field than `accusation.culprit`, `accusation.suspects` and its own suspect entry. | Fair refusals; the solution sits in one place |
| L16 | `lights_needed` is 3. The two lights ready from the start have `partners_may_man` true. Every other light has it false and a price no higher than the smallest `start_coins`. Every light of tier `must` is ready from the start or can be built by every kit (every kit has `home` `home_islet`). Fixed lights lie outside the fog bank, and their bearings to its centre differ by at least `min_degrees_between_fixed_lights`. All lights, the fog bank and every spot the schooner may take lie inside the 448 by 256 chart. | A finale every mix can reach, with beams that visibly cross |
| L17 | The crew-of-four timetable adds up to 120 minutes and the solo timetable to 150. | The skeleton's size |
| L18 | Every reward and paid-route `reason` is on the wallet reason list. Every `ref`, filled with the longest ids (a crew id has 36 characters, an `order_uid` 64), has at most 120 characters (`MAX_REF_LENGTH`): the longest, the partner shortcut `false_light:{crew_id}:npc:{order_uid}`, has 117. The solve share's `max` lies between `base` and base plus four deductions plus the finale role. | The wallet contract |
| L19 | No text contains an em dash, an en dash or a double hyphen, and no text is empty. The twist line starts with "Plot twist:". Card texts have at most 400 characters and found lines at most 240. | Style and screen space |

A scratch version of these rules ran on 5 Nov 2026 against this `case.json`: all 19 passed over 19 routes and 531 seat fills, and deliberate mistakes (a missing free route, an uncited reveal line, an em dash, a card gated by its own deduction, shortcuts that cost too much, a home light opened to partners, the culprit's id in a lead, a wrong estimate) were each caught. The scratch script is not in the repository; S3 writes the real one test-first.

### Tests the case package still owes

The linter checks the data. These pytest tests check the rules that use it (package S3, with S4 for partners):

- One seat can never form a deduction: a pair from a single seat is refused and nothing changes.
- One seat can never part the fog: locks from fewer than three different seats never reveal the schooner, and a lock ends when its seat leaves the light.
- One player can hold three locks for partner lights: they aim every beam first, then lock them one after another inside 90 seconds, with partners on duty at two lights. A beam stays aimed after its lock ends, and a lock for a light that nobody has reached yet is refused.
- Every place, hotspot and light id in `case.json` exists in the place registry (`frontend/src/world/places/registry.js`), except the virtual place `anywhere`, and each light's `chart_xy` equals the registry's chart position plus half the beam origin (within 0.01). The test may run Node to read the registry, as the parity test does.
- Every one of the 69 player mixes, with partners filled by NPC-PARTNERS.md's kit order, finishes on starting coins, also with the `market` flag off and with no world events. The timing program already checks the minutes of every mix, and `server/tests/test_case_timing.py` runs the fast parts of it.
- A wrong accusation changes nothing but the 60 second wait. The right one is accepted once.
- The world stage moves from `dark` to `relit` exactly once; a second solve adds names and one light. While the relight lock is on, a solve pays its rewards but the stage stays `dark`.
- Every reward is paid once per player: the same pin, deduction or solve in a second crew pays nothing (`already_applied`).
- No reveal line, culprit name or `accusation.culprit` value is ever sent to a player who has not solved.

### Changing the case safely

1. Change the text or the number in `case.json`. Keep ids.
2. Run the linter and the case tests.
3. If a minute, price or rule changed, update the matching table in CASE-FILE.md.
4. If a card text changed, check that its partner lines in `partners.json` still fit.
5. If a minute, window, timer or price changed, run `python3 -I backend/tools/simulate_case.py` and paste the new output into TIMING.md in the same pull request.
6. Say in the pull request which rule or test proves the change is safe.

## Where this story came from

Imported on 5 November 2026 as an unchanged copy of `plot_twist/story.json` from Nils' solo game Plot Twist, at commit `e235ee4` (decision D007). The SHA-256 of the file as imported is `3713d17a778d7ad3cfe8a8f24e33810bc96a54e1f8be90f3babf15d5698c66a2`. The solo repository itself was not changed.

The 11 original tests (9 acceptance and content tests, and 2 parity tests) were ported with the same assertions. The engines were ported with the same rules. A few tests were added on top (see `backend/plot_twist/tests/__init__.py`).

This is Story v2. The file imported above is Story v1. On 5 November 2026 the second story pull request applied the 12 edits of the Story v2 change list (decision 2 in D013): one ending line for each decision, a third choice at the shore ("Tell no one what you know"), a lead for players who read the log, hints that every player sees, and two shore fixes. The edits change words and add one choice. No existing `requires`, `set`, `take` or `goto` changed, no scene, item or flag was added, and the engines are untouched. The SHA-256 of the file after the edits is `3eb9e736b86bee8297814e4f703fdef2621dc7b8bd704a1427d32f1824a6c6cb`, and `backend/plot_twist/tests/test_story_v2.py` pins each edit. The team writes the next version of the story itself, and nobody needs the solo repository for that.

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

**Settled by the story round (N5, D018).** The coins and the texts come from the S0 story drafts (`CASE-FILE.md`, section 3). They waited for Nils' approval of S0, which he gave with the story round on 5 Nov 2026, and the `kits` section of `secret/case.json` holds the same kits. A test (`test_entry_kits.py`) pins the coins, so changing one is a visible act.

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

## islands.json: your island and the pirate waves

The numbers of the island game (docs/BUILD-PLAN.md sections 3.2 to 3.4, decision D032). Server only, never served; `backend/server/island/catalogue.py` reads and checks it at start-up, and a mistake stops only the island routes (`503 island_unavailable`). `backend/server/tests/test_island_rules.py` keeps it equal to the economy table of BUILD-PLAN 3.2, so change both together.

| Field | What it holds |
|---|---|
| `about`, `playMoneyNote` | What the file is for; the play-money line. |
| `startingCoins` | Coins a brand-new captain gets once (100). Also the guest coins (`GUEST_COINS` in `server/demo/guests.py`, checked by a test). |
| `kinds` | `[{kind, name, coins}]`: the four kinds (`wall` 10, `cannon` 30, `watchtower` 40, `house` 50), whole coins from 1 to 1,000,000. No two share a `kind`. |
| `spots` | `[{id, kind}]` in the order `GET /api/island` shows them: `wall_1`..`wall_4`, `cannon_1`..`cannon_4`, `tower_1`, `house_1`, `house_2`. Each `kind` must be in `kinds`; ids are unique. A new spot also needs a new migration that widens the check rule `islet_buildings_plot_fits_building`. |
| `loot` | `{base, perWave, perHouse, piratePointBase}`: a survived wave *n* pays each participant `base + perWave * n + perHouse * houses` (10, 5, 5) on an island, `piratePointBase + perWave * n` (20, 5) on Pirate Point. |
| `waves` | `{countdownSeconds, minimumSeconds, maximumSeconds, highestWave}`: 10 s from the bell to the ships, no finish earlier than 15 s after that, a wave is over after 900 s, at most wave 50. |
| `weather` | One entry per weather state (`storm`, `fog`, `rain`, `calm`): `{kind, label, ships, fog}`. `ships` 0.5 to 3, `fog` 0 to 1. Storm 1.5 / 0, fog 1.0 / 0.4, the others 1.0 / 0. |

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

## How the server reads the case

`server/game/case_data.py` loads the private case file into frozen records and runs load-time checks L1 to L8, L14, L15, L18 and L19. `case_lint.py` adds exhaustive free-route, citation and seat-fill checks in tests. The active Phase 1 route kinds are `kit`, `open` and `timed`; other routes keep their ids in the loaded data but are not offered. A route's optional `label` falls back to the card title. The case view exposes only earned cards, formed deductions and a reveal earned by a solver in that same crew. The private file is never added to public content. Phase 1 changes no secret content.
