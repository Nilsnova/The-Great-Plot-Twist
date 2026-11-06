# The story: The Light That Shouldn't Be

> **What this file is:** the approved story skeleton v1, the five decisions Nils made on 5 Nov, the next detail round and the rules for changing the story.
>
> **Who uses it:** the S lane first, and everyone who builds a part of the mystery (A3, A6, S3, S4, L3, G2 to G4). The work plan is in [ROADMAP.md](../ROADMAP.md); what is happening now is in [STATUS.md](STATUS.md).

**Spoiler warning.** This file names the culprit. The repository is public, so anyone can read it here. In the game, the culprit's name reaches only crews that solved the case.

**Status:** skeleton v1, approved by Nils on 5 Nov 2026 with five decisions; decision 4 changed. The text below is the approved skeleton with short notes added (sections 2, 8 and 9). The detail round, package S0, is done and approved, except three review changes that wait for Nils' OK: it is in [story/README.md](story/README.md), and the decision log entry is D018 ([DECISIONS.md](DECISIONS.md)).

**About the look.** The look is decided: original top-down pixel art (D005, Nils, 5 Nov). Section 2 keeps its approved wording, with a note beside it.

## 1. Title and logline

**The Great Plot Twist: The Light That Shouldn't Be.** A false light is wrecking ships off the Saltreach Isles, and a crew of four (friends, or NPC partners in empty seats) can unmask its sender in about two hours, but only by pooling clues from different intro endings. The first crew to solve it relights the coast for everyone, and the world runs on for weeks.

## 2. The world

**The Saltreach Isles** (placeholder names): stormy coastal noir in a top-down nautical-journal look, with gold kept for light and clues.

> *Look superseded by D005: original top-down pixel art.*

- **Lighthouse Isle:** Act 1 (cottage, boathouse, jetty, lighthouse). A True Keeper starts the case here, and has a home islet like every player.
- **Saltreach Harbor** (shared hub): Harbor Office, Harbor Light, ferry, jail, market hall, prediction kiosk, sports pavilion, signal station.
- **Home islets** (one per player): cabin, workshop, windmill, greenhouse, signal station.
- **Smugglers' Cove:** back room, low-tide cave, arena gate.
- **Wreck Point:** Greyfathom's salvage yard and beach.
- **The Teeth:** reef, watchtower ruin, raid arch, and the fog bank that hides Gull's Rest.

## 3. Act 1: Lighthouse Isle

Everyone first plays *The Keeper's Last Log* alone (10 minutes) on its tested rules. Story v2 edits only story.json (decision 2): one ending variant per decision (today every locked-in player hears "Thanks for telling me where to look"; warned players get the new "The harbor master never came."), a third path for saying nothing, a card for reading the log, and planted hints everyone sees: a seal (an anchor with an open eye) on the key's tag, the harbor master's lit window, three circled nights in the tide tables, a torn-out page.

The referee (the frozen engine.py, replaying your moves) maps the 8 end states to 4 kits:

| Kit | Ending | Start | Only you, cheaply |
|---|---|---|---|
| True Keeper | Warned the harbor, flashed the alarm | Lighthouse Isle: "Maybe the light should be yours now." | Harbor Office back room (C6) |
| Witness | Warned, locked in | Morning ferry | Words heard through the door (C2) |
| Informant | Trusted the fisherman, locked in | Ferry, his red token (new) | Smugglers' back room (C4) |
| Stranger | Never decided, locked in | Ferry, +600 coins | A salvage-yard shift (C5) |

## 4. The big shared mystery

**Premise.** Lighthouses keep losing their lenses. Some nights a light flashes the harbor alarm (long, short, long) from open sea, and ships that follow it wreck on the Teeth. The harbor master posts a reward. **Question:** who is the "someone out at sea" in Elena's log, and where does the light hide? **Suspects:** the fisherman, the salvage foreman, the coastguard commander, the harbor master. Each crew plays its own copy (decision 1).

**Threads.** Eight cards, four deductions. Four cards are open to all; the other four are cheap for one kit and slower for the rest (coins, low tide, an Exchange share).

| Deduction | Cards | Finding |
|---|---|---|
| D1 Where | C1 reward notice: a light where none stands + C2 wrecks only on fog nights | A ship hides in the fog; opens the finale |
| D2 Seal | C3 seal on your key tag + C4 same seal on wreck crates | Crates from the Harbor Office; clears the fisherman |
| D3 Money | C5 manifest: 12 lenses to Greyfathom Salvage + C6 its owner gets mail at the Harbor Office | Wrecks pay the office; clears the foreman |
| D4 Signal | C7 coastguard log: office orders sent them away each wreck night + C8 the page torn out after "Tell the harbor master", found in the ruin: "He never comes ashore after dark. His window is a lie." | The lit window is a decoy; clears the coastguard |

**Why nobody solves it alone.** Each deduction needs cards pinned by two different seats; the finale needs three seats at three lights at once. Mixed endings are fastest; identical endings take the slower routes. Automated tests (pytest) prove one seat never can, and every mix of players plus NPC partners can, on starting coins.

**NPC partners.** Each of the four seats holds a player or an NPC partner run by the game, carrying a kit the crew lacks. You order it to search a place, pin its card or man a light. An errand takes about 10 minutes and ends in a scripted line ("Same seal on the crates. Pinning it."). Partners count as crew but never pick card pairs or accuse (decision 3). A friend can take over a seat with a crew code. Solo, you sail with three partners: they run errands and man two lights while you explore, pair cards and accuse. That takes about 2.5 hours, over two sittings; two or three players need 2 to 2.5 hours.

**Finale: Night of Three Lights.** After D1 the crew calls nightfall on its own case clock, so nobody waits for real fog. Three seats man three lights (the Keeper's lamp, the Harbor Light, a home signal station, the ruin relit with a workshop lens) and drag flat gold beams onto the blinking light. The beams cross, the fog parts, a dark schooner appears. Aboard, the crew accuses its masked captain with D2 to D4. A wrong accusation is refused, changes nothing and shows the clearing deduction.

**Twist (decision 5).** The captain is the harbor master: "Plot twist: the man who answered your alarm was the one sending it." Each kit gets its own closing line. Last beat: one lens is missing.

**Fair hints.** In the game today: "Tell the harbor master." (the log), the choice to send him a note, "Across the bay, the harbor master's window glows.", "The harbor master has been watching", the harbor-alarm pattern. New: the planted hints, his reward notice, the cards.

| Phase (crew of four) | Minutes |
|---|---|
| Act 1, each alone | 12 |
| Muster: kits, seats, first building | 8 |
| First leads: D1, D2 | 25 |
| Follow the money: D3 | 30 |
| The Teeth, third light: D4 | 15 |
| Night of Three Lights | 15 |
| Board, accuse, unmask | 10 |
| Relighting, rewards | 5 |
| **Total** | **120** |

## 5. Rewards for solving

**Each contributor** (a human seat with an accepted pin, bearing or accusation): coins (50 per first card, 200 per deduction, a 400 to 800 solve share, once per player), the title Relighter, a Keeper's Star over your home on every chart, your name on the Wall of Lights, a recovered lens for your signal station, and an epilogue line from your choices.

**Everyone, at the first solve:** the Relighting. Lights come on across the shared chart, the fog rolls back, Gull's Rest opens, Greyfathom is delisted, fees drop, and a 48-hour festival doubles salvage. Each later crew adds names and one more light. Anything naming the culprit shows only to crews that solved it.

## 6. The open world alongside

A 10 to 15 minute daily round that never needs the case. Play money only.

| Loop | You do | Why come back | Mystery link | Tier |
|---|---|---|---|---|
| Home islet | Build; the windmill presses lamp oil | Weeks of progress | Lens, signal station | core |
| Sailing and salvage | Sail the real wind; salvage where it blows | New sea daily | Sealed crates after fog | core |
| Weather states | Real fog, storm, calm, rain | Matches the sky | False light on foggy nights | core |
| Island Exchange | Real price moves amplified x20 to 100; resets daily; pauses after a 30% move | Moves in minutes | A Greyfathom share gives C6 | core |
| Prediction and sports pools | Stake on weather, curated questions, tonight's match | Results by morning | "Fog tonight?" | should |
| Lantern Duels (player vs player) | 5-round turn-based duels | Quick rivalries | Smugglers' rumours | should |
| Storm raids | Defend a light on storm nights | Forecastable | The culprit's gang | later |

**Key events:** 08:00 bulletin and Exchange open, 22:00 close; weekly duel cup; storm warnings a day ahead; fog nights; match nights; the first solve and its festival; the first clear night after it.

## 7. After the solve

**Changes for good:** lit lanes, Gull's Rest open with the stolen lenses and, for solvers, Elena's Lightkeepers' Hall in the old Harbor Office. **Keeps running:** every loop, home and wallet; newcomers still start with Act 1 and their own case.

**Next chapter:** on the first clear night after the Relighting, a beam flashes far beyond the old fog line in a pattern sketched in Elena's logbook (new), and the red boat sails toward it. The jailed culprit: "I only borrowed the light. Ask who was buying it." Chapter 2, The Unmarked Light, is found by bearings from the lights players keep lit.

## 8. The class demo moment (7:30)

> **Changed by decision 4 (5 Nov):** the class demo is very short and shows highlights only. It is not the live first solve. The beats below stay as the list of candidate highlights. The plan is in [ROADMAP.md](../ROADMAP.md#demo).

Before class the team may test the case in the live world, but the relight lock keeps the coast dark until the game opens, so the first real solve stays open for players (decisions 4 and 19 of 5 Nov). The class demo uses the highlights tour (`?demo=1`), which runs in the browser on a stand-in that never touches the live world. The beats below are candidates for it: the phone parts of beats 3 and 5 are dropped with the class join, the Relighting in beat 7 is the tour's own and not the real one, and the tour stops before the unmasking.

1. 0:00 The chart unrolls and a gold beam sweeps; Act 1 on a fresh guest: the note to the harbor master, the ending card.
2. 1:40 Four arrival cards, one seat held by an NPC partner.
3. 2:20 A windmill placed; the Exchange ticker moves; the class joins by QR.
4. 3:30 Two teammates pin the last cards; D4 lights up everywhere.
5. 4:30 Night of Three Lights: phones tap long, short, long to brighten the beams (never required); the schooner appears.
6. 5:30 A wrong accusation refused; the twist.
7. 6:30 The real Relighting, credits, the new beam; 7:00 two test names on screen; close.

## 9. Core by 23 Nov vs later

> **Cut by the roadmap:** this core list comes to about 50 package days, nearly twice the team's capacity. [ROADMAP.md](../ROADMAP.md#capacity-and-the-cut-rule) v0.2 cuts it into core, should and later, and the M1 cut rule decides how much of the core grows past its minimum version.

**Core:** Act 1 with Story v2 and the referee; crews, seats, NPC partners; the case (8 cards, 4 deductions, finale, accusation, twist); rewards and the Relighting switch; home islet, sailing, salvage, weather, Exchange; live presence (you see the other captains live, core since the late evening of 5 Nov); phone page for the class; presenter panel.

**Later:** prediction and sports pools (switched off until Nils is sure that play-money bets on real matches are fine for class), duels, harbor orders, Elena's radio bulletin (should, in that order); boarding rounds, storm raids, Light Network, Chapter 2, AI (LLM) voices.

## Decisions (5 Nov)

Nils answered the five questions of the skeleton on the evening of 5 Nov. They go into the decision log as D013, written with package S0.

| # | Question | Nils' answer | What it means |
|---|---|---|---|
| 1 | One shared case for the whole world, or an own copy per crew? | **Yes: own copy per crew.** The first solve relights the coast for everyone. | Each crew of up to four seats (players or NPC partners) solves the case once. Every later crew adds its names and one more light. Anything that names the culprit shows only to crews that solved it. |
| 2 | How far may Story v2 change the original intro? | **Yes: small `story.json` edits only.** | An ending line per decision, a real third path for saying nothing, a card for reading the log, planted hints everyone sees, and the reordered warned shore note. Both engines ignore unknown fields, so the 11 existing tests and the referee keep working. |
| 3 | How smart are NPC partners in version 1? | **Yes: scripted errand runners.** | A few fixed orders, about 10 minutes per errand, short preset lines. They never pick card pairs or accuse. No free hints and no AI voice yet. Hints that cost coins may come later. |
| 4 | Is the class demo the live first solve? | **Changed: no.** The class demo is very short and shows highlights only. | The recommendation was a live first solve after rehearsals. Instead the demo shows highlights, and the live world's first solve stays open for players. See [ROADMAP.md](../ROADMAP.md#demo). |
| 5 | Who is the culprit, and do new characters get personal names? | **Yes: the harbor master, titles only.** | The cast is the harbor master, the fisherman in the yellow coat, the salvage foreman and the coastguard commander. Elena stays the only named character. |

## Next detail round

This is the work of package S0 (Nils and the S-lane owner), due on Mon 9. Each item names the package that owns it. The cut of the core list into core, should and later is already done in [ROADMAP.md](../ROADMAP.md) v0.2.

1. **Story v2 change list for `story.json`.** Every new line, the three ending variants, the planted hints, the reordered warned shore note, and the fixed base shore text (it still shows the fisherman tying up the red boat after it has left). Tests go next to the 11 existing ones. *Owner:* S0, then S1 (its second pull request).
2. **The case file in content JSON.** All 8 cards (text, kit route, slower route, cost or wait), the 4 deductions, the suspects' clearing lines, the four per-kit closing lines, the fisherman's continuity line (freed by a Harbor Office order, since the rescue ending shows his arrest), and an optional second remembered choice inside the case, for example opening or delivering a sealed crate. *Owner:* S0 drafts, S3 builds.
3. **Fairness and solvability tests.** A linter rule that every reveal line cites a card reachable from all 8 entry profiles, and pytest proofs for every ending mix with 1 to 4 players plus NPC partners, including four identical endings. *Owner:* S0 writes the rules, S3 writes the tests.
4. **Crew and seat model.** Crews, seats (a player or an NPC partner, with a kit), credit for each pin, bearing and accusation, seat takeover by crew code, the case clock, and the solve-once and reward-once rules. *Owner:* foundation wave 2 (the tables), A6 (crews and seats), L3 (case clock and rewards). The rule is D012, "Crews and seats", written in the foundation update: up to 4 seats per crew, each holding a player or an NPC partner; solo means one player plus NPC partners.
5. **NPC partner spec.** The order list, errand timings, a bank of about 30 short scripted lines, which kit each partner takes when several are missing, and what happens when an order is impossible. *Owner:* S0, then S4.
6. **Timing check.** A paper playtest and a simulated run to confirm about 120 minutes for four players and about 150 minutes solo, then tune routes and errand times. *Owner:* S0 (paper), S3 (timed playtest).
7. **Night of Three Lights spec.** Chart geometry, bearing tolerance, the three-light time window, which lights every kit mix can reach on starting coins, and the schooner reveal. The phone layer for the class is dropped (decision 4). *Owner:* L3, with G4.
8. **Map and art list.** Where each existing building sits on the sea chart, and the new art needed: false light, dark schooner, seal, torn page, Keeper's Star, Gull's Rest. *Owner:* G2, with G3 and G4.
9. **Open-world numbers and calendar.** Costs, caps and Exchange multipliers in content JSON, a key-event calendar from 16 Nov to mid-December, and the economy simulation test. *Owner:* L2 and L4.
10. **Relighting switch and rewards.** Ledger reasons, once-per-player references, the spoiler rule, and what crews still on the case see on the chart after the first solve. *Owner:* S0 writes the rules, L3 builds them.
11. **Demo script and name check.** The demo script is now a short highlights script (decision 4), with a rehearsal plan and fallbacks. A final name check (published games and real companies) covers every place and company name. *Owner:* M3 for the demo, S0 for the name check.

Questions for this round, and their answers:

- When a friend takes over a partner's seat, does the seat keep the partner's kit, or take the friend's own kit? **Decided by Nils on 5 Nov 2026 (decision 10): the friend's own kit.**
- If the home islet ships only at its minimum version (signal station plus one building), which three lights can every kit mix reach? **Answered by decision 6 (every crew builds one light) and the review fix that gives every player a home islet:** the Keeper's lamp, the Harbor Light and a home signal station. Every player has a home islet, so every crew builds one for 300 coins and 10 timber. The review fix waits for Nils' OK ([story/README.md](story/README.md#changes-to-the-approval-sheet-after-the-review)).
- Does the highlights demo show the twist? Showing it spoils the case for classmates who play later. **Still open** ([story/README.md](story/README.md#decisions-still-open-for-nils), open decision 3). The recommendation is to stop at the schooner.

The third question is also on the team kickoff list in [STATUS.md](STATUS.md#open-decisions).

## Rules for changing the story

1. **Story changes go through S-lane pull requests.** `backend/content/story.json`, the case file and every other story text change only in a pull request that the S-lane owner has seen and a different human teammate has approved ([CONTRIBUTING.md](../CONTRIBUTING.md)). One scene or island per pull request. The content linter and the solvability proofs stay green ([ENGINEERING.md](ENGINEERING.md), recipe 4.6).
2. **Story v2 stays small (decision 2).** Edit `story.json` only. The engines stay frozen, so the 11 original tests, the parity test and the referee keep working.
3. **Never reveal the culprit's name outside solved crews.** Reveal lines, the unmasking and anything else that names the culprit stay on the server and go only to crews that solved the case. They never go into the browser bundle, the shared chart, a public page or a notification. The exceptions are the team's own design documents and data, because the repository is public: this file, [story/CASE-FILE.md](story/CASE-FILE.md), [story/STORY-V2-CHANGES.md](story/STORY-V2-CHANGES.md), decision D013 in the [decision log](DECISIONS.md), the case data `backend/content/secret/case.json` and its data page (the section "The case data" in [backend/content/README.md](../backend/content/README.md#the-case-data-secretcasejson-and-partnersjson)). Each carries a spoiler warning at the top (D013 at the top of the log and of its entry). Nils confirmed on 6 Nov 2026 that the solution may stay in the public repository this way (D018). The data file is server only and is never served; a test proves it.
4. **Titles only, no personal names.** New characters get titles: the harbor master, the fisherman in the yellow coat, the salvage foreman, the coastguard commander. Elena stays the only named character. Real people's names and private details never go into the story.
5. **Check every new name.** A new place or company name gets a name check against published games and real companies before it ships.
6. **Keep the hints fair.** Every reveal line cites a card that all 8 entry profiles can reach. The fairness linter checks this.
7. **Approved decisions change only with Nils' OK.** Changing one of the five decisions needs a new decision entry that supersedes D013, and changing one of the 19 decisions of the story round needs one that supersedes D018. Each keeps the original reason ([DECISIONS.md](DECISIONS.md)).
8. **Original text only.** We write the story ourselves and keep authorship and third-party notices ([AGENTS.md](../AGENTS.md)).
