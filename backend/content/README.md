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

Content is data, not code. The story engine reads it and never contains story text. You can change `story.json` without touching any Python or JavaScript.

## Why this folder is in `backend/`

Decision D016 (proposed; the case files already follow it): game content that the server uses lives in `backend/content/`. Vercel builds each service from its own folder only. The API service is built from `backend/`, so files here are available to the server. The browser service is built from `frontend/`, so nothing in this folder ends up in the browser bundle by accident. That matters for secret content such as the case solution, which must never be bundled into the browser. The browser gets public content through the API instead.

## Public and secret content stay apart

- **Public content** is something the browser needs in order to play, such as the intro story. It is served by `GET /api/content/<name>`, with no sign-in. Browsers may keep an answer for five minutes (`Cache-Control: public, max-age=300`), so a changed story can take up to five minutes to reach a page that is already open.
- **A page can hold an old story.** After `story.json` changes and is deployed, a page that is already open can keep playing the old story for up to five minutes, while the server already uses the new one. So the server must never trust what the browser played. When a later package replays a player's moves on the server (the referee, package A3), the browser should send which story it played, for example the story's hash or a version number, and the server should refuse a move log from a different story with a 409. This is a note for that package, not a rule yet. Also note that `max-age` is an instruction for browsers only. It does not ask Vercel's network to cache the answer (that would need `s-maxage`), so every new visitor still starts the API function. Whether to add `s-maxage` is open (see D016).
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
| `chart` | `size` `[448, 256]`, the native pixels of the sea chart, `axes` (x east, y south), `fog_bank` (`center` `[250, 40]`, `radius` 30), `schooner` (`max_offset_from_fog_center` 20, `seeded_by`: the crew id, so a copied bearing usually misses), `min_degrees_between_fixed_lights` (20). |
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

This is Story v1. The team writes the next version of the story itself, and nobody needs the solo repository for that.

The solo game also had a terminal version (`cli.py`, started with `python -m plot_twist`). It is not part of the web game, so it was not imported.
