# The story folder: index

> **What this file is:** the one-page index of the story detail round (package S0) for "The Light That Shouldn't Be": what each file is, who owns it, which decisions Nils made, and what is still open.
>
> **Who uses it:** Nils first, then the four teammates and their coding agents. Start here, then open the one file your package needs.

**Status: approved by Nils on 5 November 2026, except three review changes.** He approved all 19 recommendations of the story approval sheet as written, and that evening he made two scope decisions: no demo world for now, and live multiplayer is core. Decision D018 in the [decision log](../DECISIONS.md) records the 19 decisions and the two scope decisions. The round was written, reviewed against `main` at `8d0a718`, fixed, and then folded together with Nils' answers on the same day (branch `docs/s0-story-round`, from `main` at `3ca7d38`). Three changes that the review made to the text of the approval sheet are not approved yet: they wait for his OK ([below](#changes-to-the-approval-sheet-after-the-review)). S0 is done except for that OK, which comes before the pull request. S3 and S4 start from the minimum boxes. S1's Story v2 pull request is already on `main` (`3d59b6a`).

## What is in the round

| File | What it is | Owner | Read it when |
|---|---|---|---|
| [CASE-FILE.md](CASE-FILE.md) | The case for one crew: premise, suspects, 8 cards and every route, 4 deductions, the Night of Three Lights, the accusation, the twist, rewards, the Relighting. Starts with "the minimum for 23 November". | S3 owner, with the story author | You build the case, the board or the finale |
| [NPC-PARTNERS.md](NPC-PARTNERS.md) | The rules for NPC partners: kit order, orders, minutes, refusals, takeover, 34 scripted lines, 27 rules and the tests. Starts with its minimum box. | S4 owner (rules), story author (lines) | You build partners |
| [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) | The 14 edits that turn `story.json` into Story v2, with 19 tests, and the one view fix for the ending card. | S1 owner | You build S1 or S2 |
| [OPEN-WORLD.md](OPEN-WORLD.md) | The daily round, the play-money economy, pools, duels and the calendar. Section 7 (the Exchange) is superseded by D017. | L-lane owners | You build a loop beside the case |
| [TIMING.md](TIMING.md) | The result of the timing program: does each crew fit its minutes? Real output, a reading, what to tune. | S3 owner, and whoever runs the paper playtest | You change a minute, a window or a price |
| [`backend/content/secret/case.json`](../../backend/content/secret/case.json) | The case as data. Server only, never served, and it names the culprit. | S3 owner | You change a card, a route or a number |
| [`backend/content/partners.json`](../../backend/content/partners.json) | Every word a partner says (34 lines). Server only. | Story author | You change a partner line |
| [`backend/content/README.md`](../../backend/content/README.md#the-case-data-secretcasejson-and-partnersjson) | The section "The case data": the data format, field by field, and the 19 linter rules. | S3 owner | You write the linter |
| [`backend/tools/simulate_case.py`](../../backend/tools/simulate_case.py) and its [README](../../backend/tools/README.md) | The timing program: plays the case on paper for all 69 crews. A design tool outside the graded walkthrough. Its fast parts run in `backend/server/tests/test_case_timing.py`. | S3 owner | You run or port the timing check |

**Which number belongs to which file.** If two files disagree, fix the wrong one in the same pull request.

| Number | Value | Owned by |
|---|---|---|
| Length of a case | About 120 minutes for four players, about 150 solo | CASE-FILE.md 15.1 and `planning` in `case.json` |
| Cards, deductions, lights | 8, 4, 3 | `case.json` |
| Windows | Low tide 12 to 19, ferry 10 to 14, mail boat 15 to 19, shift change 0 to 7 (8 minutes wide, decision 13), every 20 minutes | `case_clock` in `case.json`. A copy sits in `frontend/src/adapter/fake/routes.js` (the G6 stand-in on `main`) |
| Errand, arrival, pin, wait | 10, 4, 5, 5 minutes | NPC-PARTNERS.md 5.1 |
| NPC kit order | Informant, Stranger, True Keeper, Witness (decision 12) | NPC-PARTNERS.md 4.2. Copies: `partners.kit_order` in `case.json`, `NPC_KIT_ORDER` in the timing program and `npcKitOrder` in `frontend/src/adapter/fake/data.js` (the G6 stand-in on `main`) |
| Beam tolerance, lock hold | 5 degrees, 90 seconds | `night` in `case.json` |
| Third light | A signal station on a home islet: 300 coins and 10 timber (decision 6; the station as the one third light is review change R2, below) | OPEN-WORLD.md 5.1 |
| Start coins | 1,000, or 1,600 for the Stranger | OPEN-WORLD.md 6.1 |
| Wallet reasons for the case | `clue_reward`, `mystery_reward`, `clue_purchase`, with the case id in every ref (decision 15) | CASE-FILE.md 13.2 |
| Exchange fee | 2% each way, 1% after the Relighting (decision 17) | D017 and the code in `backend/server/market/` |
| Fast-travel fee | None for now (decision 16); the numbers are kept | OPEN-WORLD.md 5.2 |

## Where the files live

D016 puts server content in `backend/content/`. This round first wrote its data and its program in a draft folder at the top of the repository, so that the story could be reviewed as one piece. The deployed API may not see files outside `backend/`, and the game build must never pick up the solution, so the files were moved to the paths D016 names. **The case files now follow D016. D016 itself stays proposed until a teammate has reviewed it (D001).**

| File | Draft path | Now |
|---|---|---|
| The case | `content/case/case.json` | `backend/content/secret/case.json` (never served) |
| The partner lines | `content/case/npc_lines.json` | `backend/content/partners.json` (the name `docs/INTERFACES.md` reserves for S4) |
| The data format page | `content/case/README.md` | A section in `backend/content/README.md` |
| The timing program | `tools/story/simulate_case.py` | `backend/tools/simulate_case.py` |
| Its page | `tools/story/README.md` | `backend/tools/README.md` |
| The timing test | none | `backend/server/tests/test_case_timing.py`: the fast parts of the program (see below) |
| The proof that `secret/` is never served | none | `backend/server/tests/test_content.py`, the last tests: no name and no path serves a file from `secret/`, or any file that is not on the public list |

What the move changed: the two path constants in the program (`CASE_FILE`, `LINES_FILE`), every link in the story pages, both READMEs and the repository map in `docs/ENGINEERING.md`. `REPO_ROOT` stayed right, because the program sits two folders below the root in both places. There is no root `content/` or `tools/` folder any more.

**Why the full timing run is not a test.** The program takes about 15 to 20 seconds on an idle laptop and up to a minute on a busy one, and the whole `uv run pytest` takes about 20 seconds on an idle laptop, so the full run would nearly double it. So `test_case_timing.py` checks the fast parts in about 3 seconds: the program finds its files, the data says what the decisions say, every crew of four fits 120 minutes (and a window of 5 minutes would not), the solo starts fit 150. The full run, with exit code 0, stays a command you run before you change a number: `python3 -I backend/tools/simulate_case.py`.

## Changes outside this folder

These belong to files outside `docs/story/`. The rows marked Done were made in the same branch. The other rows are not done here, and the last column says who does them.

| File | Change | Status |
|---|---|---|
| `ROADMAP.md`, S0 "Provides" | Points at [CASE-FILE.md](CASE-FILE.md) and [NPC-PARTNERS.md](NPC-PARTNERS.md) instead of `specs/S3-the-light.md` and `specs/S4-npc-partners.md`. | Done |
| `ROADMAP.md`, S1 "Minimum version" | From "the import plus the ending lines only" to "the import, then all 14 Story v2 edits and their 19 tests in one small pull request". | Done |
| `ROADMAP.md`, S3 "Minimum version" | From "one route per card (no slower routes), and the finale with two lights" to "8 cards with 12 routes (4 kit, 4 timed, 4 open), 4 deductions, the accusation, the reveal and closing lines, and the finale with three lights. Paid, share, world and log-reader routes come later." | Done |
| `ROADMAP.md`, S4 "Minimum version" | From "two orders, search a place and man a light" to "one order that fetches a card and pins it (15 case minutes), `man_light`, the kit rule and the refusals busy, wrong kit, locked window and not ready, in about 25 tests. `allowPaid` stays off." | Done |
| `ROADMAP.md`, L3 | Keeps three lights. No presenter seed or demo world: a server setting keeps the relight switch locked until the game opens. | Done |
| `ROADMAP.md`, L4 and L2 text | L4: a 2% fee and the same buy leaves 38, not 38.20 (D017). L2: four plots and a signal station, not 3 plots. | Done. The recount of the spare days (count G2, G3 and L4 as done) is not made here. |
| `ROADMAP.md`, Demo and Later; new A4 | No demo world: rehearsals use the `?demo=1` tour. A4 live presence moves from Later into core. | Done |
| `ROADMAP.md`, status lines and late-evening answers | The lines for G2, G3, S1, S2 and A1 match `main`. The keep-alive is decided (a daily GitHub Actions workflow). No package is reserved for a teammate, so S4 is no longer proposed for the L-lane owner. The per-lane count includes A4 (A about 7). A D017 row is in the decision table, and the A4 acceptance sets the room size in the A4 spec instead of citing a plan limit. The L4 entry is marked as superseded in part by Nils' Exchange answers. | Done. L4's rewrite waits for the Exchange branch. |
| `docs/STORY.md`, the status line, rule 3, rule 7, sections 2, 8 and 9, and the questions of the detail round | The status line says S0 is done and points here. Rule 3 extends the spoiler exception to [CASE-FILE.md](CASE-FILE.md), `case.json` and the case data section, because the repository is public. Rule 7 also covers the 19 decisions (a change needs a new entry that supersedes D018). Section 2: a True Keeper starts the case on Lighthouse Isle and has a home islet like every player (a review change that waits for Nils' OK). Section 8: the team may test in the live world, but the relight lock keeps the coast dark, and the demo is the `?demo=1` tour. Section 9: the core list names live presence, and the pools are off until Nils is sure. The questions of the detail round have their answers, and the third one (does the demo show the twist) is still open. | Done |
| `docs/ENGINEERING.md`, section 2 | Adds `docs/story/`, `backend/content/secret/` and `backend/tools/` to the repository map. | Done |
| `docs/DECISIONS.md` | D018 records the 19 decisions and the two scope decisions, and says that the three review changes wait for Nils' OK. | Done |
| `frontend/src/story/intro-view.js` and a Vitest | The ending card must show the ending notes. Details and the test: [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md), section 7. | Not here. Codex fixes it on its own branch. |
| G4 `three_lights` cinematic and L3 | Pass the schooner's chart position as `target`. Its default is the Teeth marker, from where the two public lights are only 11 degrees apart ([CASE-FILE.md](CASE-FILE.md), section 10.7). | Open, for the G4 and L3 packages |
| `docs/INTERFACES.md` | Another branch updates its realtime section for A4. Its A4 rows (the flag table and the package row) still say "later" and describe a presence table with `POST /api/presence`, so they must change to Supabase Realtime rooms and core. Its S3 and S4 rows already use the D016 paths. After that merge, check that it also names the relight lock setting. | Not touched here |
| `docs/STATUS.md` | Its open decisions 4 ("live on a seeded demo world, or recorded?") and 5 (seat takeover) are answered by decisions 19 and 10. Whether the demo shows the unmasking is still open (below). Also stale: the L3 agent brief. It still asks for presenter routes behind `require_host`, a list board with two lights, and polling with no Realtime. It should say three lights, no presenter routes, the relight lock, and A4 pushes with polling as the fallback. The S0 brief still creates `specs/S3-the-light.md` and `specs/S4-npc-partners.md`, but the pages in `docs/story/` stand in for them. Kickoff question 1, "Who builds S4", is answered: no package is reserved for a teammate. | Not touched here |

## Decisions Nils made on 5 November 2026

Nils approved the 19 recommendations of the approval sheet as written. Decision 19 was changed by him later that evening, and he made one more scope decision. The numbers below are the sheet's. [D018](../DECISIONS.md) holds the same list.

| # | Decision | What was decided | Written in |
|---|---|---|---|
| 1 | New Act 1 lines | Yes. The Witness ending hears "No fog tonight. We wait for the next one." and then "The harbor master never came."; the Stranger ending hears "Whoever you are, nobody knows you're up there."; Elena's log points to the "old watchtower". | [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) changes 3, 4, 6 |
| 2 | A third-path button, "Tell no one what you know" | Yes. Visible but not final: the player can still trust or warn later. Still exactly 8 endings. | [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) change 5 |
| 3 | Plant Chapter 2 now | Yes. One line in Elena's logbook: a lamp and a row of long and short flashes, with a question mark. It is part of Story v2 (change 13, the old optional A). | [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) change 13 |
| 4 | Fix the lantern-hook mismatch | Yes. It is part of Story v2 (change 14, the old optional B). | [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) changes 10 and 14 |
| 5 | Keep the night clerk | Yes. A minor character, title only, who keeps the harbor master's window lit. | [CASE-FILE.md](CASE-FILE.md) 5.3 (C8), 12, 19 |
| 6 | Every crew builds one light for the finale | Yes. 300 coins and 10 timber; every kit can afford it. | [CASE-FILE.md](CASE-FILE.md) 10.2 |
| 7 | Players call nightfall after D1 | Yes. Night never falls by itself. | [CASE-FILE.md](CASE-FILE.md) 10.1 |
| 8 | Reading Elena's log helps a little | Yes, small: C8's lead shows from the start and a search of 5 minutes is saved. | [CASE-FILE.md](CASE-FILE.md) 3, 5.3 (C8) |
| 9 | Partner pins pay the player who ordered them | Yes. | [CASE-FILE.md](CASE-FILE.md) 7, 13.1 |
| 10 | A friend who takes over a partner's seat keeps their own kit | Yes. | [NPC-PARTNERS.md](NPC-PARTNERS.md) 7 |
| 11 | Partners spend your coins on a shortcut only when you allow it for that order | Yes, off by default. It touches money, so the team confirms it at kickoff. | [NPC-PARTNERS.md](NPC-PARTNERS.md) 5.6 |
| 12 | Partners fill missing kits in the order Informant, Stranger, True Keeper, Witness | Yes. It is also a team call, so the team hears it at kickoff. | [NPC-PARTNERS.md](NPC-PARTNERS.md) 4.2 |
| 13 | Widen the salvage-yard shift change window from 5 to 8 minutes | Yes. Every crew of four then fits 120 minutes. | [TIMING.md](TIMING.md), `case.json` |
| 14 | A lens can be made before D3 | Yes. Only fitting it waits for D3. | [CASE-FILE.md](CASE-FILE.md) 10.2 |
| 15 | Coin entries use the foundation's wallet reasons | Yes: `clue_reward`, `mystery_reward`, `clue_purchase`, with the case id in every `ref`. | [CASE-FILE.md](CASE-FILE.md) 13.2 |
| 16 | No fast-travel fee for now | Yes. The chart skip is free; the numbers are kept for later. | [OPEN-WORLD.md](OPEN-WORLD.md) 5.2 |
| 17 | Exchange fee 2% each way | Yes, and 1% after the Relighting. The roadmap's old 3% example is fixed. | [OPEN-WORLD.md](OPEN-WORLD.md) 7.3, `ROADMAP.md` L4 |
| 18 | The prediction desk and sports pools stay off | Yes, until Nils is sure that play-money bets on real matches are fine for class. | [OPEN-WORLD.md](OPEN-WORLD.md) 8, 15.1 |
| 19 | Our own crew does not relight the live coast | Yes. **Changed by Nils later that evening:** no separate demo world for now. Rehearsals use the existing `?demo=1` tour on the browser-side stand-in, and one server setting keeps the relight switch locked until the game opens. | [CASE-FILE.md](CASE-FILE.md) 14.1, `ROADMAP.md` Demo |
| Scope 1 | No demo world for now | "Maybe we add later, for now we just build the game." This is the change to decision 19. | as decision 19 |
| Scope 2 | Live multiplayer is core | Package A4 (live presence) moves from Later into core. It runs on Supabase Realtime: small rooms (one per crew, one per place), positions sent only while moving (at most 2 a second), presence for who is here, and the server pushing rule changes into the crew room. The server stays the referee. Target: the Fri 13 slice shows two players seeing each other live. | `ROADMAP.md` A4 |

### Changes to the approval sheet after the review

Line 3 of the approval sheet says that any change from the review "comes back to Nils before it lands". Three review changes alter text in the sheet. They are in the documents and the data, but Nils has not seen them. **They are not approved.** He says yes to each one, or names what he wants instead, before the S0 pull request. When he has seen them, write the date in the last column.

| # | What the sheet said | What the documents say now | Why | Where | Seen by Nils |
|---|---|---|---|---|---|
| R1 | The kit table says a True Keeper starts at "Lighthouse Isle, now home". | A True Keeper starts the case on Lighthouse Isle and, like every player, has a home islet. | A crew of True Keepers could not build a third light, because a signal station needs a home islet. | CASE-FILE.md 3 and 10.2, `kits[].home` in `case.json`, STORY.md section 2 | Not yet |
| R2 | The finale says the third light is "a signal station, or the watchtower ruin relit with a lens". | The third light is a signal station on a home islet. The ruin light with a lens is an optional extra (tier should). | The same problem. With a home islet for every kit, every crew can build a station, so no crew needs a lens. | CASE-FILE.md 10.2, `night.lights` in `case.json` | Not yet |
| R3 | "Does it fit the time?" says solo takes 118 to 122 minutes. | Solo takes 121 to 124 minutes. Four different kits still take about 102. | The second timing run counts a partner's pin as an order of its own, and it uses the new finale model (the player aims while the partners sail). | TIMING.md sections 1 and 5 | Not yet |

Decision 6 (every crew builds one light, 300 coins and 10 timber) and decision 14 (a lens can be made before D3) stay as Nils approved them. R1 to R3 change what the sheet says around them.

## Decisions still open for Nils

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Accept D016 (server content in `backend/content/`, the case in `backend/content/secret/`). The case files already follow it. | Yes. The deployed API may not see a root `content/` folder. It needs a teammate's review (D001). | `docs/DECISIONS.md` |
| 2 | If L3 slips, may the finale drop to two lights? | No. Cut the cinematics first. Two lights would change "why nobody solves it alone". | [CASE-FILE.md](CASE-FILE.md), section 1 |
| 3 | Stop the highlights demo at the schooner, without the unmasking? | Yes. The repository is public and classmates play later. | [CASE-FILE.md](CASE-FILE.md), open point 10 |
| 4 | If Binance refuses our deployed function, may the demo run the Exchange on the labelled replay (`DEMO_MODE`)? | Yes. | [OPEN-WORLD.md](OPEN-WORLD.md), 15.1 |
| 5 | A hard 300 coin reserve in `market_trade()`? It changes D017. | No for now. The case pays 50 and 200 coins before the finale, and a crew needs one building. | [OPEN-WORLD.md](OPEN-WORLD.md), 15.1 |
| 6 | The final name check for every place and company. | Before the demo. | [CASE-FILE.md](CASE-FILE.md), open point 8 |
| 7 | Say yes to the three review changes R1 to R3, or name what you want instead. | Yes, before the S0 pull request. Each fixes a problem the review found: a crew of True Keepers could not build a third light, and the solo minutes moved. | [Above](#changes-to-the-approval-sheet-after-the-review) |

Closed since the first draft of this list: approving the story documents, the look (D005 is decided), the third path, partner pins, the night clerk, the size of the log card, the live relight, the pools (they stay off, decision 18), and the Exchange multiplier (Nils answered on 5 November, late evening: there is no multiplier any more, only real prices with 10x leveraged positions, and no circuit breaker, floor or ceiling; D017 and L4 change on the Exchange branch). Asking the module teacher whether play-money pools are fine for class is one way for Nils to become sure; it is his call.

Not Nils' alone, but open: a crew that loses players can release a seat to a partner (A6, [CASE-FILE.md](CASE-FILE.md), open point 9). The team confirms decisions 11 and 12 at kickoff. A human timed playtest, which is still owed ([TIMING.md](TIMING.md), section 9). The size of A4: it is a proposal in `ROADMAP.md` until the A4 spec is written. Who builds S4 is no longer open: no package is reserved for a teammate (Nils, 5 November, late evening), so Claude and Codex build it as far as they can and a teammate may join ([NPC-PARTNERS.md](NPC-PARTNERS.md), section 11).

## What changed after the review

The review of 5 November found 1 critical, 8 major and 9 minor problems. Each is fixed in the text or turned into a decision above. The move of the files, which waited for D016, is done.

| Problem | Fix | Where |
|---|---|---|
| A crew of True Keepers could not build a third light | Every player has a home islet, True Keepers too. The ruin light with a lens is an extra (tier should). | CASE-FILE.md 3 and 10.2 |
| Three locks of 90 seconds each could not be held by one player | A beam stays aimed, a player aims first and locks one after another, and the program checks the hold. | CASE-FILE.md 10.4 and 10.5, TIMING.md 4.2 |
| The roadmap's minimum versions broke the guarantees | A minimum box in each document, and the roadmap lines above. | The boxes, and this page |
| The content paths did not match `main` | The files now sit at the D016 paths. | "Where the files live", above |
| Place ids and the chart did not match the map | The case uses the registry's ids and a 448 by 256 chart. | `case.json`, CASE-FILE.md 10.2 and 10.7 |
| The ending card hid the "Plot twist:" lines | Show the notes in the card. | STORY-V2-CHANGES.md 7 |
| The kit order and `allowPaid` drifted | One order, and `allowPaid` only on request. | CASE-FILE.md 3 and 9, `case.json` |
| OPEN-WORLD described another Exchange than D017 | Section 7 and everything that touches it was re-derived from D017. | OPEN-WORLD.md |
| The look was named differently | D005. | NPC-PARTNERS.md 3 |
| Three crews of four took 124 minutes | The shift change window is 8 minutes wide. | `case.json`, TIMING.md |
| The night clerk appeared only in the reveal | C8 names him. | CASE-FILE.md 5 and 12 |
