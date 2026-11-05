# Story v2: the change list for story.json

> **What this file is:** the exact edits that turn the original `story.json` (*The Keeper's Last Log*) into Story v2, with the tests that prove them.
>
> **Who uses it:** whoever takes package S1 (import Plot Twist and fix the intro story), their coding agent, and the teammate who reviews that pull request.

**Status:** approved by Nils on 5 Nov 2026. He approved decisions 1 to 4 of the approval sheet: the new lines (changes 3, 4 and 6), the third path (change 5), and the two edits that were optional until then, which are now part of Story v2 as changes 13 and 14. Changed after the review of the same day, then folded together with his answers. The branch that applies these edits to `story.json` is a different one.

**Based on:** decision 2 of 5 Nov 2026 (Story v2 = small story.json edits only) and the approved skeleton, `20261105_Story-Skeleton_v1.md`, section 3. The original file is `plot_twist/story.json` in the solo Plot Twist repo at commit `e235ee4`. Place names are placeholders until the final name check.

## 1. The short version

- **14 edits** in `story.json`: 6 changed texts, 7 new notes and 1 new action.
- **No engine changes.** `engine.py` and `engine.js` stay exactly as they are. No new scene, item or flag. Every scene id and action id stays. One view change is needed outside `story.json`: the intro ending card must show the ending notes (section 7, row S2).
- **The 11 existing tests stay green**, and none of their expectations change. One more test, added by the import and not one of the 11, pins the shore notes by position and has to change in the same pull request (section 5.1).
- **19 new tests:** 17 story tests and 2 parity tests. 15 of them fail on today's file, as test-first requires. The other 4 are guards: they pass today and must keep passing.
- **Still 8 end states.** A full search finds 122 reachable states, the same as today.
- **Length:** the file grows by about 220 words (794 to 1,017 by our count of the `text`, `message`, `label`, `description` and `blocked_message` fields). One playthrough reads about 75 to 175 more words, well under a minute, so Act 1 still fits the 12 minutes the skeleton's phase table gives it.
- **Checked on 5 Nov 2026** in a scratch copy of the solo game: all 28 tests passed on the first 12 edits. **Checked again that evening** with all 14 edits, in a scratch copy of this repository's two engines: the 19 new tests pass, the search finds 122 reachable states and 8 end states, and of the 45 tests that `backend/plot_twist/tests/` holds today, 44 pass and one needs the change in section 5.1. Section 9 says how.

### The minimum for 23 November

Do all 14 edits and their 19 tests, in one small second pull request of package S1. Do not ship "the import plus the ending lines only" (changes 1 to 4). Without changes 7 to 12 the Informant and Stranger kits never see the lit window or the desk plants, and the case file's fairness proof (CASE-FILE.md, section 16) fails. Changes 13 and 14 are the two edits that were optional; Nils approved them on 5 Nov 2026 (decisions 3 and 4), so they ship with the rest. Add the ending card change of section 7 in the same pull request, or as the first S2 follow-up, because without it 6 of the 8 end states lose their "Plot twist:" line.

The roadmap line (S1, "Minimum version") now reads: "the import, then all 14 Story v2 edits and their 19 tests in one small pull request".

## 2. Rules for any story.json edit

| Rule | Why |
|---|---|
| Every note has a `"when"`. A line that always shows uses `"when": {}`. | `engine.py` reads `n["when"]` and crashes without it. `engine.js` would show the note anyway, so the two engines would disagree. |
| Every action has a `"message"`. | `engine.py` reads `action["message"]` and crashes without it. |
| Keep every scene id and action id. | The intro in the browser (S2) uses the zones `cottage`, `desk`, `shore` and `tower_door` of Lighthouse Isle; the anchors are `stairwell` and `lamp_room`. The tests and the referee use the action ids. Old saves name a scene. |
| Change no existing `requires`, `set`, `take` or `goto`. | Story v2 changes words, not rules. This keeps tests A1 to A6 valid and lets old move logs replay to the same end state. |
| Add no flag and no item. | Each new flag or optional item multiplies the end states. The referee and the kit table expect exactly 8. |
| Conditions are AND only: `has`, `missing`, `flags`, `not_flags`. There is no OR. | Both engines check every listed condition. Write two notes instead of one OR. |
| Notes show after the scene text, in list order, on every scene, endings included. | Put a note where its sentence should be read. |
| Speech inside a text uses straight single quotes, as the original does. | Same voice, and no escaping inside JSON. |

Two lines are read by tests, so leave them exactly as they are: the desk note "The drawer is empty now. You already took the key." (test A3) and the door's blocked message "The door is locked tight. You need a key." (test A1 looks for "key").

## 3. The change list

| # | Where (scene and field) | Kind | In one line | Serves |
|---|---|---|---|---|
| 1 | `ending_trapped.text` | changed | Keeps only what is true for every trapped player | ending line per decision |
| 2 | `ending_trapped.notes` | new | Trusted the fisherman: keeps "Thanks for telling me where to look" | Informant kit |
| 3 | `ending_trapped.notes` | new | Warned the harbor: "The harbor master never came." | Witness kit, C2 |
| 4 | `ending_trapped.notes` | new | Never decided: nobody knows you are up there | Stranger kit |
| 5 | `shore.actions` | new | A third choice: "Tell no one what you know" | third path |
| 6 | `desk.notes` | new | After reading the log: where the page was torn out, and two words | log card, C8 |
| 7 | `items.brass_key.description` | changed | A seal on the key's tag | C3, D2 |
| 8 | `desk.actions`, `take_key.message` | changed | The same seal, at the moment you take the key | C3, D2 |
| 9 | `desk.text` | changed | Three circled nights and a torn-out page | C2, C7, C8 |
| 10 | `shore.text` | changed | The lit window for everyone; the fisherman and lantern sentences move out | D4, C8, the twist; base-text fixes |
| 11 | `shore.notes` | new | The fisherman tying up the red boat, shown only until it leaves | base-text fix |
| 12 | `shore.notes` (warned) | changed | His window answers first, then the red boat slips away | Witness and True Keeper closing lines, D4 |
| 13 | `desk.notes` | new | After reading the log: Elena's drawing of a lamp and a row of flashes | Chapter 2 hook (decision 3, the old optional A) |
| 14 | `shore.notes` | new | The lantern sentence moves into a note that shows until the lantern is taken | base-text fix (decision 4, the old optional B) |

Card and deduction ids (C1 to C8, D1 to D4) are the ones in the skeleton, section 4.

### Ending lines (changes 1 to 4)

Today every locked-in player hears "Thanks for telling me where to look" and "the man you trusted", even players who never spoke to him. The scene text now keeps only what is true on all three paths. Each decision gets its own note, and each note ends with its own "Plot twist:" line. All three notes start with "Through the door": each is what you heard after he locked you in. Nils approved the new lines on 5 Nov 2026 (decision 1): the Witness ending hears "No fog tonight. We wait for the next one." and then "The harbor master never came.", and the Stranger ending hears "Whoever you are, nobody knows you're up there."

#### 1. `ending_trapped.text` (changed)

- **Old:** "The fisherman laughs through the door. 'Thanks for telling me where to look,' he calls. He has locked the tower from outside. You and Elena are safe but trapped until the morning ferry spots you. By then the red boat and its cargo are long gone. Plot twist: the man you trusted was the one you should have feared."
- **New:** "The fisherman has locked the tower from outside. You and Elena are safe but trapped until the morning ferry spots you. By then the red boat and its cargo are long gone."
- **Condition:** none. Scene text always shows.
- **Why:** the fisherman's words and the "Plot twist:" line move into changes 2 to 4. The morning ferry stays, because the Witness, Informant and Stranger kits all arrive by ferry.
- **Test:** `test_each_trapped_end_state_shows_exactly_one_decision_line`.

#### 2. Trusted line (new note on `ending_trapped`)

```json
{"when": {"flags": ["trusted_fisherman"]}, "text": "Through the door, the fisherman laughed. 'Thanks for telling me where to look,' he called. Plot twist: the man you trusted was the one you should have feared."}
```

- **Condition:** `flags: trusted_fisherman`.
- **Why:** keeps the original words for the one path they fit. It sets up the Informant kit: he used you, and later his red token opens the Smugglers' back room (C4). The tense moves to the past because the note comes after the line about the morning ferry.
- **Test:** `test_trapped_after_trusting_keeps_the_thanks_line`.

#### 3. Warned line (new note on `ending_trapped`)

```json
{"when": {"flags": ["warned_harbor"]}, "text": "Through the door, you heard him talk into a radio: 'No fog tonight. We wait for the next one.' Then his steps faded away. The harbor master never came. Plot twist: the harbor was watching for your signal, and you never sent one."}
```

- **Condition:** `flags: warned_harbor`. Only trapped players see it; warned players who flash the lamp end in `ending_rescue`.
- **Why:** "The harbor master never came." is the skeleton's line. Today it reads innocently: you hid instead of flashing the lamp. Later it echoes C8, "He never comes ashore after dark." The radio words are the Witness kit's "words heard through the door", the in-game source of C2 (wrecks only on fog nights). The night is stormy, not foggy, so "No fog tonight" fits the rain in the cottage text. The "Plot twist:" line is true in the game's own logic: a warned player could have flashed the lamp, and on that path "The harbor master has been watching". It names no culprit, so the big twist (decision 5) stays for the finale.
- **Test:** `test_trapped_after_warning_says_the_harbor_master_never_came`.

#### 4. Never-decided line (new note on `ending_trapped`)

```json
{"when": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "text": "Through the door, he called: 'Whoever you are, nobody knows you're up there.' He was right. You had told no one. Plot twist: by trusting no one, you left no one to come for you."}
```

- **Condition:** `not_flags: trusted_fisherman, warned_harbor` (neither choice made).
- **Why:** gives "never decided" an ending of its own and seeds the Stranger kit. Nobody on the coast knows your face, which fits the Stranger's cheap card: a salvage-yard shift (C5).
- **Test:** `test_trapped_after_telling_no_one_shows_the_stranger_line`.

### The third path (change 5)

#### 5. `keep_quiet` (new action on `shore`)

```json
{"id": "keep_quiet", "label": "Tell no one what you know", "requires": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "hide_when_blocked": true, "message": "You keep what you know to yourself. The fisherman never looks your way. To him you are just a stranger passing through."}
```

- **Position:** in `shore.actions`, after `warn_harbor` and before `shore_back`.
- **Condition:** shown and allowed only while neither choice is made, exactly like the other two choices.
- **Why:** saying nothing becomes a visible third choice next to the other two. It sets no flag on purpose: a new flag would add end states (section 2). It has no `goto`, so the intro adapter in the browser (S2) can never mistake it for a "go to" action. A player can still trust or warn later. The choice becomes final when they climb, because the lamp room has no way back. Whoever reaches the end with neither flag gets change 4 and the Stranger kit, whether they clicked this or not.
- **Tests:** `test_tell_no_one_is_offered_only_before_a_decision`, `test_tell_no_one_changes_no_state`.
- **Decided by Nils on 5 Nov 2026 (decision 2): option one.** ROADMAP S1 accepts Story v2 when "no decision" is a real third path. `keep_quiet` is visible but not final: it changes no state, so a player can click it and still trust the fisherman or warn the harbor afterwards. That respects decision 2 of the skeleton round (content only, 8 end states), and the choice becomes final when the player climbs. We keep it as written and watch in the first playtest whether players notice that clicking it does nothing. **The fallback**, if they do not: make it binding with a flag `kept_quiet` that `keep_quiet` sets and that `trust_fisherman` and `warn_harbor` also refuse (`not_flags`). That needs no engine change and replays old move logs unchanged, because no old log contains `keep_quiet`. But it edits two existing `requires`, which section 2 forbids today, and it gives 10 end states instead of 8, because `kept_quiet` with and without `read_log` add two (the referee maps `kept_quiet` to the Stranger). It would be a new decision next to D013 and D018.

### The log card (change 6)

#### 6. Log lead (new note on `desk`)

```json
{"when": {"flags": ["read_log"]}, "text": "The torn-out page came right after 'Tell the harbor master.' Her pen pressed through to the page beneath, and two words still show: 'old watchtower'."}
```

- **Position:** last in `desk.notes`.
- **Condition:** `flags: read_log`.
- **Why:** today `read_log` is set and never checked. Now this note reads it, and so does the referee: every end state with `read_log` carries the log card, C8's lead. The lead shows that Elena wrote more after "Tell the harbor master", and that someone removed it. That explains her advice: she wrote it before she knew more. The two words point to the watchtower ruin, where C8 waits. Elena's log text stays word for word.
- **Approved** by Nils on 5 Nov 2026 (decision 1: "Elena's log points to the old watchtower"). He also approved that the log helps only a little (decision 8): the lead is C8's, and nothing else.
- **Tests:** `test_reading_the_log_shows_the_torn_page_lead`, `test_every_set_flag_is_checked_somewhere`.

### Planted hints every player sees (changes 7 to 10)

Every end state holds the brass key and the oil lantern, so every player who finishes took the key at the desk and the lantern at the shore. Hints in those places reach all four kits.

#### 7. `items.brass_key.description` (changed)

- **Old:** "Heavy and cold. A tag reads: TOWER DOOR."
- **New:** "Heavy and cold. A tag reads: TOWER DOOR. The tag is stamped with a small seal: an anchor with an open eye."
- **Condition:** none. The inventory shows it.
- **Why:** C3, "seal on your key tag", the first half of D2 (with C4, the same seal on wreck crates). Every seat owns this clue.
- **Test:** `test_key_tag_shows_the_seal`.

#### 8. `desk` action `take_key`, field `message` (changed)

- **Old:** "You take a heavy brass key. Its tag reads: TOWER DOOR."
- **New:** "You take a heavy brass key. Its tag reads: TOWER DOOR. The tag is stamped with a small seal: an anchor with an open eye."
- **Condition:** none. `take_key` is the only way to get the key.
- **Why:** the terminal shows the inventory only when you type `i`, so the seal also goes into the message everyone reads.
- **Test:** `test_key_tag_shows_the_seal`.

#### 9. `desk.text` (changed)

- **Old:** "Papers, tide tables and a leather logbook cover the desk. One drawer is slightly open."
- **New:** "Papers, tide tables and a leather logbook cover the desk. Three nights in the tide tables are circled in pencil. A page has been torn out of the logbook. One drawer is slightly open."
- **Condition:** none.
- **Why:** two hints. The circled nights pay off when C2 (wrecks only on fog nights) and C7 (the coastguard was sent away each wreck night) name the wreck nights. The torn-out page pays off with C8. The tide tables are already on the desk; Story v2 only marks them.
- **Test:** `test_desk_shows_the_circled_nights_and_the_torn_page`.

#### 10. `shore.text` (changed)

- **Old:** "Waves slam against the jetty. A fisherman in a yellow coat is tying up a red boat. An old oil lantern hangs on a hook by the boathouse door."
- **New:** "Waves slam against the jetty. Across the bay, the harbor master's window glows."
- **Condition:** none.
- **Why:** three jobs. First, the lit window becomes a hint on every path. Today only warned players see it, so the Informant and Stranger kits never do. The sentence is the existing line, moved word for word, so the skeleton's quote of it stays true. It pays off in D4 (the lit window is a decoy) and C8 ("His window is a lie."). Second, the fisherman sentence leaves the base text. Base text shows in every state, so it still showed him tying up the red boat after the boat had gone. The sentence comes back as change 11. Third, the lantern sentence leaves the base text for the same reason: it still said the lantern hangs on its hook after the player had taken it, while a note said the hook was empty. It comes back as change 14 (decision 4).
- **Tests:** `test_shore_shows_the_lit_window_before_any_choice`, and the guard `test_every_end_state_holds_the_key_and_the_lantern`.

### Shore fixes (changes 11 and 12)

#### 11. Fisherman line (new note on `shore`)

```json
{"when": {"not_flags": ["warned_harbor"]}, "text": "A fisherman in a yellow coat is tying up a red boat."}
```

- **Position:** first in `shore.notes`, so it reads right after the base text.
- **Condition:** `not_flags: warned_harbor`. It shows until the red boat leaves.
- **Why:** the original sentence, word for word, now hidden once the warned note says the boat has gone. Players who trust him still see it, as today.
- **Test:** `test_tied_up_red_boat_shows_only_until_the_warning`.

#### 12. Warned note on `shore` (changed, reordered)

- **Old:** "The red boat is gone. Across the bay, the harbor master's window glows. Your message got through."
- **New:** "After a while, the harbor master's window goes dark, then lights again. Your message got through. Moments later, the red boat slips away from the jetty with no lights showing."
- **Condition:** `flags: warned_harbor` (unchanged).
- **Why:** today the boat is gone before the window answers, so nothing on screen links them. Now the window answers first and the boat slips away a moment later. This sets up a later closing line such as "Your note is how the red boat knew to run" (from the critique) without saying it now. "Your message got through." stays word for word. The warn message still says "The fisherman watches you but says nothing", which keeps an innocent reading open: maybe he left because he saw you.
- **Test:** `test_warned_note_shows_the_window_before_the_boat_leaves`.

### Chapter 2 plant (change 13)

#### 13. Elena's drawing (new note on `desk`)

```json
{"when": {"flags": ["read_log"]}, "text": "Inside the back cover, Elena has drawn a lamp and a row of long and short flashes, with a question mark beside them."}
```

- **Position:** last in `desk.notes`, after the log lead of change 6.
- **Condition:** `flags: read_log`. It reads a flag that already exists, so there is no new flag and no new end state.
- **Why:** the skeleton (section 7) has a new beam flash "a pattern found in Elena's logbook" after the first solve, and today the logbook holds no pattern. The note plants one, and it names no exact pattern, so Chapter 2 can still choose it. `OPEN-WORLD.md` section 10.2 uses it for the Chapter 2 hook beam (tier should). Nils approved it on 5 Nov 2026 (decision 3: "plant Chapter 2 now").
- **Test:** `test_reading_the_log_shows_the_chapter_two_pattern`.

### The lantern fix (change 14)

#### 14. Lantern on its hook (new note on `shore`)

```json
{"when": {"missing": ["oil_lantern"]}, "text": "An old oil lantern hangs on a hook by the boathouse door."}
```

- **Position:** second in `shore.notes`, right after the fisherman line of change 11, so a new player reads the same order as before: waves, window, fisherman, lantern.
- **Condition:** `missing: oil_lantern`. It shows until the lantern is taken. The existing note "The hook by the door is empty. The lantern is with you." takes over, so the shore text never says both.
- **Why:** the original game says the lantern hangs on its hook and, after you take it, also says the hook is empty. Change 10 takes the sentence out of the base text and this note puts it back for exactly the time it is true. Nils approved the fix on 5 Nov 2026 (decision 4).
- **Test:** `test_the_lantern_hangs_on_its_hook_until_it_is_taken`.

## 4. The 8 end states and their kits

The referee replays a player's move log with the frozen `engine.py` and Story v2. It then reads three things:

1. the ending scene;
2. the decision, from the flags: `trusted_fisherman` means trusted, `warned_harbor` means warned, neither means none (the two flags can never both be set);
3. whether `read_log` is set.

The inventory is always the brass key and the oil lantern, because both are needed to reach the lamp room, so it adds nothing.

| # | Ending scene | Flags at the end | Decision | Kit | Log card |
|---|---|---|---|---|---|
| 1 | `ending_rescue` | `warned_harbor` | warned | True Keeper | no |
| 2 | `ending_rescue` | `warned_harbor`, `read_log` | warned | True Keeper | yes |
| 3 | `ending_trapped` | `warned_harbor` | warned | Witness | no |
| 4 | `ending_trapped` | `warned_harbor`, `read_log` | warned | Witness | yes |
| 5 | `ending_trapped` | `trusted_fisherman` | trusted | Informant | no |
| 6 | `ending_trapped` | `trusted_fisherman`, `read_log` | trusted | Informant | yes |
| 7 | `ending_trapped` | none | none | Stranger | no |
| 8 | `ending_trapped` | `read_log` | none | Stranger | yes |

The kits, as in the skeleton, with the Act 1 line that sets each one up:

| Kit | Act 1 ends with | Start | Only you, cheaply |
|---|---|---|---|
| True Keeper | "Maybe the light should be yours now." (unchanged) | Lighthouse Isle | Harbor Office back room (C6) |
| Witness | "No fog tonight. We wait for the next one." and "The harbor master never came." | Morning ferry | Words heard through the door (C2) |
| Informant | "Thanks for telling me where to look" | Ferry, his red token (new) | Smugglers' back room (C4) |
| Stranger | "Whoever you are, nobody knows you're up there." | Ferry, +600 coins (play money) | A salvage-yard shift (C5) |

- **Log card:** C8's lead (change 6). The case file sets its exact text and what it saves the crew.
- **Where the mapping lives:** in `backend/content/entry_kits.json` (roadmap package A3, decision D016), not in `story.json`. The referee returns `{ending, decision, readLog, kit}`, as A3 already plans.
- **Quiet players:** clicking "Tell no one what you know" changes no state, so end states 7 and 8 cover both quiet players and players who simply never chose.
- **NPC partners** never play Act 1, so they have no end state. The NPC partner spec gives each partner the kit the crew lacks. Partners never carry the log card: it would work as a free hint, which decision 3 rules out.
- **Any mix works,** including four identical end states. The kit only decides which cards are cheap for you; the case file's slower routes cover the rest (decision 1).
- **Old move logs** made before Story v2 replay to the same end state, because no `requires`, `set`, `take` or `goto` changed.

## 5. Tests

### 5.1 The 11 existing tests: what changes

Nothing. No expectation changes, and none of the 11 is edited.

**One more existing test has to change.** The import added `test_engine_rules.py` and `test_story_format.py` next to the 11 originals, so `backend/plot_twist/tests/` holds 45 tests today. 44 of them pass on Story v2. The 45th, `test_a_note_is_shown_only_while_its_conditions_hold` in `test_engine_rules.py`, reads the trusted note from the shore by its position (`notes[1]`) and expects it to be the only note shown. Change 11 puts a note in front of it and change 14 another, and the fisherman and lantern notes also show after `trust_fisherman`. The test names a rule that stays true (a note shows only while its condition holds), so keep the rule and find the notes by their condition, not by their place. This version passes on today's file and on Story v2, as checked in the scratch run (section 9):

```python
def test_a_note_is_shown_only_while_its_conditions_hold():
    story = load_story()
    game = make_game(story)

    play(game, "to_shore", "trust_fisherman")

    notes = story["scenes"]["shore"]["notes"]
    trusted_note = next(n["text"] for n in notes if n["when"] == {"flags": ["trusted_fisherman"]})
    warned_note = next(n["text"] for n in notes if n["when"] == {"flags": ["warned_harbor"]})
    assert trusted_note in game.scene_notes()  # its condition holds
    assert warned_note not in game.scene_notes()  # its condition does not hold
```

| Test | Still valid because |
|---|---|
| `test_a1_locked_route` | The door's blocked message still contains "key". |
| `test_a2_unlocked_route` | `unlock_door` and its `goto` are unchanged. |
| `test_a3_no_duplicate_collection` | The desk note "The drawer is empty now. You already took the key." is unchanged. The new desk note shows only after `read_log`. |
| `test_a4_resume_correctly` | `warn_harbor` still sets only `warned_harbor` and `take_lantern` sets nothing. `keep_quiet` is hidden after the warning, so the action list is the same before and after resume. |
| `test_a5_two_outcomes` | Both routes use unchanged action ids, conditions and gotos. |
| `test_a6_restart_safely` | A new game is engine code; story edits do not touch it. |
| `test_minimum_size` | Still 8 scenes, 2 items and 2 endings. |
| `test_references_are_valid` | `keep_quiet` has no `goto` and no `take`. |
| `test_every_ending_is_reachable` | Both endings are still reachable. The search still finds 122 states. |
| `test_random_playthroughs_match` | Both engines read the same file. Every new note has a `"when"` and the new action has a `"message"`. |
| `test_both_endings` | Same ids; both engines show the same new notes. |

### 5.2 New tests (19)

Put 17 story tests in a new file, `test_story_v2.py`, in the same folder as the imported `test_acceptance.py`, reusing its `GameTestCase` (import it from wherever S1 puts that file). Put the 2 parity tests into the existing parity test class as new methods; the two methods already there stay as they are. After S1, `backend/plot_twist/tests/` holds 64 tests: the 45 it holds today and these 19.

Routes the tests play:

- `TRUSTED_TRAPPED`: `to_desk`, `take_key`, `desk_back`, `to_shore`, `take_lantern`, `trust_fisherman`, `shore_back`, `to_tower`, `unlock_door`, `climb`, `untie`
- `WARNED_TRAPPED`: the same with `warn_harbor` instead of `trust_fisherman`
- `SILENT_TRAPPED`: the same with `keep_quiet` instead of `trust_fisherman`

Loops live in small helper functions, not in the tests (ENGINEERING.md, section 5): `everything_shown(game)` (scene text plus notes as one string), `end_states(story)` (the same search as `test_every_ending_is_reachable`, returning the end states), `profiles(story)`, `decision_line_counts(story)`, `flags_set_but_never_checked(story)`, `end_inventories(story)`, `snapshot(game)`, `allowed_action_ids(game)` and `visible_action_ids(game)`.

| # | Test | Change | Asserts | Fails today? |
|---|---|---|---|---|
| 1 | `test_trapped_after_trusting_keeps_the_thanks_line` | 2 | After `TRUSTED_TRAPPED` the scene is `ending_trapped` and "'Thanks for telling me where to look,' he called." is shown. | yes |
| 2 | `test_trapped_after_warning_says_the_harbor_master_never_came` | 1, 3 | After `WARNED_TRAPPED`, "The harbor master never came." is shown and "Thanks for telling me where to look" is not. | yes |
| 3 | `test_trapped_after_telling_no_one_shows_the_stranger_line` | 4, 5 | After `SILENT_TRAPPED`, "'Whoever you are, nobody knows you're up there.'" is shown. | yes |
| 4 | `test_each_trapped_end_state_shows_exactly_one_decision_line` | 1 to 4 | Each of the 6 trapped end states shows exactly one of the three decision lines, and it is the one for its decision: the thanks line after trusting, "The harbor master never came." after warning, the "Whoever you are" line otherwise. | yes |
| 5 | `test_story_has_exactly_eight_end_states` | all | The end states are exactly the 8 in section 4, as (ending, decision, read_log). | no, guard |
| 6 | `test_tell_no_one_is_offered_only_before_a_decision` | 5 | At the shore `keep_quiet` is allowed; after `warn_harbor` it is not on screen. | yes |
| 7 | `test_tell_no_one_changes_no_state` | 5 | Scene, inventory and flags are the same before and after `keep_quiet`. | yes |
| 8 | `test_reading_the_log_shows_the_torn_page_lead` | 6 | At the desk "'old watchtower'" is not shown before `read_log` and is shown after it. | yes |
| 9 | `test_every_set_flag_is_checked_somewhere` | 6 | Every flag an action sets appears in some `requires` or `when`. | yes (`read_log`) |
| 10 | `test_key_tag_shows_the_seal` | 7, 8 | After `take_key`, the message and the key's inventory description contain "an anchor with an open eye". | yes |
| 11 | `test_desk_shows_the_circled_nights_and_the_torn_page` | 9 | The desk text contains "Three nights in the tide tables are circled" and "A page has been torn out of the logbook." | yes |
| 12 | `test_shore_shows_the_lit_window_before_any_choice` | 10 | On arrival the shore text contains "Across the bay, the harbor master's window glows." | yes |
| 13 | `test_every_end_state_holds_the_key_and_the_lantern` | 7 to 10 | Every end state holds exactly the key and the lantern, so every finisher read the desk, the shore and the `take_key` message. | no, guard |
| 14 | `test_warned_note_shows_the_window_before_the_boat_leaves` | 12 | The warned note contains "window goes dark" and "red boat slips away", in that order. | yes |
| 15 | `test_tied_up_red_boat_shows_only_until_the_warning` | 10, 11 | The tied-up line shows on arrival and is gone after `warn_harbor`. | yes |
| 16 | `test_trapped_after_warning_matches` (parity) | 3 | Python and JavaScript agree at every step of `WARNED_TRAPPED`, which ends in `ending_trapped`. | no, guard |
| 17 | `test_trapped_after_telling_no_one_matches` (parity) | 4, 5 | The same for `SILENT_TRAPPED`. | no, guard |
| 18 | `test_reading_the_log_shows_the_chapter_two_pattern` | 13 | At the desk "a row of long and short flashes, with a question mark beside them" is not shown before `read_log` and is shown after it. | yes |
| 19 | `test_the_lantern_hangs_on_its_hook_until_it_is_taken` | 10, 14 | On arrival at the shore "An old oil lantern hangs on a hook by the boathouse door." is shown and "The hook by the door is empty." is not. After `take_lantern` it is the other way round. | yes |

The shape of a story test, as checked in the scratch run:

```python
TO_SHORE_WITH_ITEMS = ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern"]
TO_LAMP_ROOM = ["shore_back", "to_tower", "unlock_door", "climb"]
WARNED_TRAPPED = TO_SHORE_WITH_ITEMS + ["warn_harbor"] + TO_LAMP_ROOM + ["untie"]


def everything_shown(game):
    """The scene text and its notes, as one string."""
    return " ".join([game.scene["text"]] + game.scene_notes())


class TestEndingLines(GameTestCase):
    def test_trapped_after_warning_says_the_harbor_master_never_came(self):
        self.play(*WARNED_TRAPPED)
        self.assertIn("The harbor master never came.", everything_shown(self.game))
        self.assertNotIn("Thanks for telling me where to look", everything_shown(self.game))
```

## 6. Who sees which hint after Story v2

| Hint | Where | True Keeper | Witness | Informant | Stranger |
|---|---|---|---|---|---|
| Seal on the key's tag | `take_key` message, key description | yes | yes | yes | yes |
| Three circled nights, a torn-out page | desk text | yes | yes | yes | yes |
| The harbor master's lit window | shore text | yes | yes | yes | yes |
| "send a note to the harbor master" | shore choice label, shown until a choice is made | yes | yes | yes | yes |
| Window answers, then the boat slips away | shore note, warned | yes | yes | no | no |
| "The harbor master has been watching" | `signal` message | yes | no | no | no |
| Fog words through the door; "The harbor master never came." | ending note | no | yes | no | no |
| "Tell the harbor master.", the torn page's place, "old watchtower" | `read_log` message and desk note | log readers | log readers | log readers | log readers |
| Elena's drawing of a lamp and a row of flashes (Chapter 2) | desk note (change 13) | log readers | log readers | log readers | log readers |

Before Story v2 the Informant and Stranger kits saw no harbor master hint except the choice label (critique, fact checks). Now all four kits see the seal, the desk hints and the lit window.

## 7. Notes for the other documents

| For | Keep consistent |
|---|---|
| Case file (cards and deductions) | The C2 card should match the Witness's radio words: "No fog tonight. We wait for the next one." The C8 torn page should mention the old watchtower and say who tore it out and why it is in the ruin. Name the three circled nights as the three wreck nights; Story v2 gives no dates. D4 says he never comes ashore after dark, so the case file should say who made his window go dark and light again on the warned night (for example someone who keeps his lamp at the Harbor Office). |
| Per-kit closing lines at the unmasking | They can call back: "The harbor master never came." (Witness), "Thanks for telling me where to look" (Informant), "Whoever you are" (Stranger), and the window-then-boat order (True Keeper and Witness: "Your note is how the red boat knew to run"). |
| Referee (package A3) | `keep_quiet` is a valid action id. The decision comes from the flags, the log card from `readLog`. Old move logs replay to the same end state. |
| The intro in the browser (package S2) and the class demo | No demo shortcut or chapter select may skip the desk or the shore, or the planted hints are skipped. **The ending card must show the ending notes.** Codex fixes this on its own branch. S2 is merged on `main`, and `frontend/src/story/intro-view.js` still puts only `view.text` in the ending card (`endingText.textContent = view.text`) and the notes in a separate list below it. With Story v2, 6 of the 8 end states would lose their decision line and its "Plot twist:" line from the card, because both move into notes (changes 1 to 4). Fix, in the S1 second pull request or as an S2 follow-up: when `view.ended`, write `endingText.textContent = [view.text, ...view.notes].join(' ')` and hide the separate notes list. Add a Vitest named `the ending card shows the Plot twist line for each trapped decision` that checks the card text contains "Plot twist:" after each of the three trapped routes (trusted, warned, told no one). The view itself has no DOM test today, so put the join in a small pure function, for example `endingCardText(view)` in `frontend/src/story/`, and test that with the Story v2 file. |
| Open world (`OPEN-WORLD.md`) | Its Stranger start (1,000 + 600 = 1,600 coins) matches the kit table here. Its Chapter 2 hook beam (should) needs a pattern in Elena's logbook: change 13 plants it. |
| README of the imported game | Update the story map: the shore now has three choices, and the trapped ending has one line per decision. |

## 8. Not in Story v2, on purpose

Two edits were optional in the first draft of this list. Nils approved both on 5 Nov 2026, so they are now part of Story v2: **optional A is change 13** (decision 3, Chapter 2's pattern in Elena's logbook) and **optional B is change 14** (decision 4, the lantern sentence). Each was tested on its own on top of the first 12 edits (28 of 28 tests pass), and all 14 together keep 8 end states and 122 reachable states (section 9).

Left as it is:

- **Small things left as in the original.** The trusted note has the fisherman smile at you after he "walks off quickly toward the red boat". The lamp room says a red boat is heading for the jetty on paths where it was tied up there earlier (time has passed). The rescue ending's "You read the signs" also shows to players who never read the log; it reads as a figure of speech.
- **No new scenes, characters or names** (decisions 2 and 5 of the skeleton round). The harbor master stays a title. Elena Vos stays the only named character. The rescue ending is unchanged. The night clerk is a title only, and appears in C8 and the reveal, not in `story.json`.

## 9. How this was checked (5 Nov 2026)

The first check covered the first 12 edits and 17 tests. The second, further down, covers all 14 edits and 19 tests.

1. We copied the solo game at commit `e235ee4` into a scratch folder and built Story v2 there with a small script. The solo repo itself was not changed.
2. We ran `python -m unittest` with Python 3.9.6 and Node 24.17.0, so the parity tests ran too. The team's server uses Python 3.12; the tests use nothing that differs between the two.
   - Today's file: 11 of 11 pass.
   - Story v2 with the 11 tests unchanged: 11 of 11 pass.
   - Story v2 (12 edits) with the first 17 new tests: 28 of 28 pass.
   - The first 17 new tests on today's file: 13 fail and the 4 guards pass.
3. A full search of Story v2 found 122 reachable states (the same as today) and 8 end states. Each trapped end state shows exactly one decision line, and no flag is set without being checked.
4. Every line the skeleton quotes as already in the game is still in Story v2, word for word.
5. **Not run:** `ruff` (not installed here), the intro in the browser (S2), and `pytest` under the team's `uv` setup. Run `uv run pytest` and `uv run ruff check .` in the S1 pull request.

**The check with all 14 edits (5 Nov 2026, late evening).** A script applied the 14 changes to the `story.json` on `main` in a scratch folder outside the repository, together with copies of `backend/plot_twist/` and the browser engine. Python 3.12 with the team's `uv` environment and Node.js 24.17.0 ran the tests. Nothing in the repository was changed.

1. The 17 story tests and 2 parity tests of section 5.2 were written out as pytest tests. On today's file 15 fail and 4 pass (the guards). On the first 12 edits, all pass except tests 18 and 19. On all 14 edits, all 19 pass.
2. A full search of Story v2 finds 122 reachable states and 8 end states, the same as today. Each trapped end state shows exactly the decision line of its decision.
3. Of the 45 tests in `backend/plot_twist/tests/` today, 44 pass on Story v2. The one that fails is `test_a_note_is_shown_only_while_its_conditions_hold`, which reads the shore notes by position (section 5.1). The version of section 5.1 passes on today's file and on Story v2, and all 45 plus the 19 new tests pass together.
4. The word count above (794 to 1,017) counts the `text`, `message`, `label`, `description` and `blocked_message` fields. The first 12 edits alone give 994 by the same count.
5. The story in the repository is not changed by this branch. Another branch applies the 14 edits to `backend/content/story.json`.

## Appendix: the changed parts in full

The four changed blocks, in the original file's layout, with all 14 changes. Everything else in `story.json` stays as it is.

```json
"brass_key": {
  "name": "Brass key",
  "description": "Heavy and cold. A tag reads: TOWER DOOR. The tag is stamped with a small seal: an anchor with an open eye."
},
```

```json
"desk": {
  "title": "The Writing Desk",
  "text": "Papers, tide tables and a leather logbook cover the desk. Three nights in the tide tables are circled in pencil. A page has been torn out of the logbook. One drawer is slightly open.",
  "notes": [
    {"when": {"missing": ["brass_key"]}, "text": "Something brass glints inside the open drawer."},
    {"when": {"has": ["brass_key"]}, "text": "The drawer is empty now. You already took the key."},
    {"when": {"flags": ["read_log"]}, "text": "The torn-out page came right after 'Tell the harbor master.' Her pen pressed through to the page beneath, and two words still show: 'old watchtower'."},
    {"when": {"flags": ["read_log"]}, "text": "Inside the back cover, Elena has drawn a lamp and a row of long and short flashes, with a question mark beside them."}
  ],
  "actions": [
    {"id": "take_key", "label": "Take the key from the drawer",
     "requires": {"missing": ["brass_key"]}, "hide_when_blocked": true,
     "take": "brass_key",
     "message": "You take a heavy brass key. Its tag reads: TOWER DOOR. The tag is stamped with a small seal: an anchor with an open eye."},
    {"id": "read_log", "label": "Read the last entry in the logbook",
     "set": ["read_log"],
     "message": "Elena's handwriting shakes: 'The lights aren't for ships anymore. The man with the red boat signals someone out at sea. If I vanish, do NOT trust him. Tell the harbor master.'"},
    {"id": "desk_back", "label": "Go back to the cottage", "goto": "cottage",
     "message": "You leave the desk and return to the middle of the room."}
  ]
},
```

```json
"shore": {
  "title": "The Boathouse",
  "text": "Waves slam against the jetty. Across the bay, the harbor master's window glows.",
  "notes": [
    {"when": {"not_flags": ["warned_harbor"]}, "text": "A fisherman in a yellow coat is tying up a red boat."},
    {"when": {"missing": ["oil_lantern"]}, "text": "An old oil lantern hangs on a hook by the boathouse door."},
    {"when": {"has": ["oil_lantern"]}, "text": "The hook by the door is empty. The lantern is with you."},
    {"when": {"flags": ["trusted_fisherman"]}, "text": "The fisherman gives you a thin smile. 'I'll keep an eye on the tower for you.'"},
    {"when": {"flags": ["warned_harbor"]}, "text": "After a while, the harbor master's window goes dark, then lights again. Your message got through. Moments later, the red boat slips away from the jetty with no lights showing."}
  ],
  "actions": [
    {"id": "take_lantern", "label": "Take the oil lantern",
     "requires": {"missing": ["oil_lantern"]}, "hide_when_blocked": true,
     "take": "oil_lantern",
     "message": "You lift the lantern off its hook and light it. It burns steadily."},
    {"id": "trust_fisherman", "label": "Tell the fisherman that the keeper is missing",
     "requires": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "hide_when_blocked": true,
     "set": ["trusted_fisherman"],
     "message": "'Missing, you say?' He glances up at the tower. 'Leave it with me. Don't you go up there tonight.' He walks off quickly toward the red boat."},
    {"id": "warn_harbor", "label": "Say nothing to him and send a note to the harbor master",
     "requires": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "hide_when_blocked": true,
     "set": ["warned_harbor"],
     "message": "You give a boy a coin to run your note across to the harbor master: 'Watch the lighthouse tonight.' The fisherman watches you but says nothing."},
    {"id": "keep_quiet", "label": "Tell no one what you know",
     "requires": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "hide_when_blocked": true,
     "message": "You keep what you know to yourself. The fisherman never looks your way. To him you are just a stranger passing through."},
    {"id": "shore_back", "label": "Climb back up to the cottage", "goto": "cottage",
     "message": "You climb back up the path, rain in your eyes."}
  ]
},
```

```json
"ending_trapped": {
  "title": "Ending: Locked In the Light",
  "ending": true,
  "text": "The fisherman has locked the tower from outside. You and Elena are safe but trapped until the morning ferry spots you. By then the red boat and its cargo are long gone.",
  "notes": [
    {"when": {"flags": ["trusted_fisherman"]}, "text": "Through the door, the fisherman laughed. 'Thanks for telling me where to look,' he called. Plot twist: the man you trusted was the one you should have feared."},
    {"when": {"flags": ["warned_harbor"]}, "text": "Through the door, you heard him talk into a radio: 'No fog tonight. We wait for the next one.' Then his steps faded away. The harbor master never came. Plot twist: the harbor was watching for your signal, and you never sent one."},
    {"when": {"not_flags": ["trusted_fisherman", "warned_harbor"]}, "text": "Through the door, he called: 'Whoever you are, nobody knows you're up there.' He was right. You had told no one. Plot twist: by trusting no one, you left no one to come for you."}
  ]
}
```
