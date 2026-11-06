# Developer tools

The [disposable local API](../../docs/LOCAL-TEST-SERVER.md) runs the real API and SQL rules
with four fixed players and a database that is deleted on shutdown. The rest of this page
describes the case timing design tool.

## The case timing check

> **The timing program:** `simulate_case.py` plays "The Light That Shouldn't Be" on paper for every crew and checks the promised minutes: about 120 for a crew of four, about 150 for one player with three NPC partners.
>
> **Who uses it:** the owners of the case package (S3) and the NPC partner package (S4), everyone who changes a minute, a window or a price in `backend/content/secret/case.json`, and their coding agents. The result of the run, with a reading, is in [docs/story/TIMING.md](../../docs/story/TIMING.md).

**This is a design tool, not part of the game.** It is outside the graded code walkthrough, and the engineering rule of about 200 lines per file does not apply to it. It has about 1,250 lines because it searches for the fastest plan, and because `ruff format` gives every long line a line of its own.

**Where it lives.** In `backend/tools/` (decision D016, see [docs/story/README.md](../../docs/story/README.md#where-the-files-live)), and it reads the case data in `backend/content/`. Two constants at the top name the files: `CASE_FILE` is `backend/content/secret/case.json` and `LINES_FILE` is `backend/content/partners.json`. `REPO_ROOT` is two folders above the file. The program moved here from a draft folder with its data, and nothing else changed except the paths and the line breaks that `ruff format` made: the output is identical.

**Is it in `uv run pytest`?** Only its fast parts are. The full run takes about 15 to 20 seconds on an idle laptop and up to a minute on a busy one, which is too slow for every test run. `backend/server/tests/test_case_timing.py` loads the program and checks in a few seconds that it finds its files, that the data says what the decisions of 5 Nov 2026 say (kit order, an 8 minute shift change window, the lens, the wallet reasons), that every crew of four and every solo start fit their minutes at first-time pace, and that a 5 minute shift change window would break three crews of four. Run the whole program by hand before you change a number in `case.json`. Exit code 0 means every check passed.

## Run it

From the repository root. You need Python 3.9 or newer. You do not install anything.

```bash
python3 -I backend/tools/simulate_case.py
```

It takes about 15 to 20 seconds (up to a minute on a busy laptop). The `-I` makes Python ignore environment variables and the current folder, so a stray file cannot change the program.

It reads two files and writes nothing:

| File | What the program takes from it |
|---|---|
| `backend/content/secret/case.json` | Cards, routes, minutes, windows, lights, kits, the timetable, the promised totals |
| `backend/content/partners.json` | Only the line bank, to count NPC errands and check each one has its words |

## What you get

| Block | What it shows |
|---|---|
| Class table | 14 classes of crews. For each: the fastest and the slowest mix, the promise, the spare minutes, how slow a crew may play and still fit, and a verdict |
| The finale | How many minutes the Night of Three Lights needs by the rules, against the 20 minute night, and how many seconds the busiest player needs to press their Lock buttons, against the 90 second hold |
| Coins | The most a crew spends on shortcuts and the lowest wallet left |
| What a solo run asks of partners | Orders and partner minutes of the fastest plan and of the cheapest plan |
| Checks | Eight PASS or FAIL lines. Any FAIL makes the exit code 1 |

The verdicts:

| Verdict | Meaning |
|---|---|
| HOLDS | The slowest mix of the class fits its promise at pace 1.5 (first-time play) |
| TIGHT | It fits only at a pace between 1 and 1.5 |
| BREAKS | It does not fit even at pace 1 (best play) |

## Options

| Option | What it does |
|---|---|
| `--all` | Also one line for each of the 69 mixes |
| `--explain TK,WI` | A paper playtest of one mix: who finds which card, when, and how the total adds up. Kit codes: `TK` True Keeper, `WI` Witness, `IN` Informant, `ST` Stranger. Add `--shortcuts` to let players buy shortcuts |
| `--tune` | Moves one number at a time and shows what it does to three telling crews. About 15 seconds more |
| `--kit-orders` | Compares the NPC kit order of NPC-PARTNERS.md (Informant, Stranger, True Keeper, Witness) with the old order (True Keeper, Informant, Stranger, Witness) that CASE-FILE.md used before the review |
| `--pace 1.5` | The pace of first-time crews. `--pace 1` is best play |
| `--pre-position` | Players may walk to a place and search it before its card opens (a best-play habit) |
| `--log-readers` | Every player read Elena's log in Act 1 |
| `--order-minutes 1`, `--aim-minutes 1`, `--lock-seconds 10` | The three assumptions below. `--lock-seconds 40` makes the lock check fail, to show that it works |
| `--case PATH`, `--lines PATH` | Read other copies of the files, for example a `case.json` you are trying out |

## How it works

1. **Crews.** A crew is 1 to 4 players with a kit each. That gives 69 mixes (4 + 10 + 20 + 35). Empty seats get NPC partners with the first kits in the order Informant, Stranger, True Keeper, Witness (NPC-PARTNERS.md, section 4.2).
2. **Card phase.** A search tries who fetches which card and keeps the fastest plan. Players and partners work at the same time. The two cards of a deduction always come from two different seats. C5 and C6 wait for D2, C8 waits for D3. A player's route costs the crossing (1 minute between two places), finding the spot (2), the wait for the window, the timer and reading (1). A partner's errand costs 10 minutes and a pin 5, whatever the route. In NPC-PARTNERS.md a pin is an order of its own, so the player also spends one order minute (1 at best play, 1.5 at first-time pace) on the fetch order and another on the pin order. Giving an order never uses the player's other hands-on time: that is a simplification. Only players pair cards (2 minutes, plus 1 for each card a partner pinned).
3. **Finale.** The rules give a minimum for three seats at three lights: players climb (1 minute), a partner needs an order and a 10 minute trip, and only players aim and lock. Aiming costs no request and a player can aim while the partners sail, so it overlaps their trip. A player aims every beam first and then locks them one after another, as soon as the last partner is on post (CASE-FILE.md 10.3 to 10.5). The program also checks that one player's Lock presses fit inside the 90 second hold. Every player has a home islet, a True Keeper too, so every crew builds a signal station (300 coins) as its third light. The lens steps (make a lens at home, 3 minutes, which may happen before D3, and fit it after D3, 2 minutes) belong to the optional ruin light (tier should). They stay in the code but do nothing with the shipped `case.json`.
4. **Total.** Act 1, the muster, the accusation, the Relighting and the night allowance come from the timetable in `case.json`, because the case data has no mechanics for them. The total is compared with the promise in `planning.expected_totals_minutes`. Crews with 1, 2 or 3 partners lie between 120 and 150 (130, 140, 150).
5. **Checks.** Coins, the lock hold and the line bank (see below).

### Pace

Pace says how much slower a real crew is than the planning minutes. It covers talk, doubts and wrong turns. At pace 1.5 every minute a player spends walking, looking, reading, pairing and giving orders takes 1.5 minutes. Route timers, windows and partner errands do not get slower. Pace 1 is best play. 1.5 is the guess in CASE-FILE.md, section 19, point 5.

### What the program adds itself

These four numbers are not in `case.json`. They are named constants at the top of the file.

| Constant | Value | Why |
|---|---|---|
| `FIRST_TIME_PACE` | 1.5 | CASE-FILE.md, section 19, point 5 |
| `ORDER_MINUTES` | 1 | A player notices a partner's line and gives the next order, a fetch or a pin. The 5 November scratch model used 1 too |
| `AIM_MINUTES` | 1 | One player drags one beam onto the glow. Only the finale check uses it |
| `LOCK_PRESS_SECONDS` | 10 | One press of Lock and the answer on screen. Only the finale check uses it |

### What the checks protect

| Check | It protects |
|---|---|
| The two timetables add up to 120 and 150 | The promise itself |
| Every route's `estimate_minutes` matches the planning formula | Honest route numbers (linter rule L9) |
| All 69 mixes find all 8 cards on free routes | "Any mix of endings works" |
| Every deduction uses cards from two different seats | The rule that nobody solves alone |
| No mix runs out of coins | Starting coins are enough. A free plan costs only the 300 coin building |
| The night fits in 20 minutes for every mix | A solo player can still man and aim three lights |
| One player's Lock presses fit inside the 90 second hold | A solo player can lock three beams one after another before the first lock ends |
| The line bank covers every errand the plans use | No partner is ever speechless |

## Try a change safely

1. Copy `backend/content/secret/case.json` to a temporary file outside the repository and change one number in the copy.
2. Run `python3 -I backend/tools/simulate_case.py --case /path/to/copy.json`.
3. Compare the class table with the one in TIMING.md.
4. If the change is good, make it in the real file in a pull request, run the case linter and this check, and paste the new output into TIMING.md.

If a window or a timer changes, also run `--kit-orders`. The best NPC kit order depends on those numbers.

## Disposable local API

For browser integration, [LOCAL-TEST-SERVER.md](../../docs/LOCAL-TEST-SERVER.md) documents the
guarded, loopback-only API with four fixed players and a disposable real PostgreSQL database.
From `backend/`: `LOCAL_TEST_SERVER=1 APP_ENV=local uv run --with pgserver --with 'psycopg[binary]' python -m tools.local_server`.
It runs the real migrations, referee and API rules; Ctrl-C removes its database. It refuses
preview, production and any environment with a `VERCEL` variable.

## Limits

- It uses planning numbers. No playtest has happened yet.
- It plays well: no wasted trips and no wrong pairs. Pace is the only allowance for talk and mistakes.
- It does not model the time to work out which two cards go together. Pairing is 2 minutes.
- Nobody walks to a place before its card opens, unless you pass `--pre-position`. A first-time crew does not know where to go.
- The market flag, the sealed crate and the shareholder route are switched off. The log reader route is off unless you pass `--log-readers`.
- Timber is not checked. A building needs 10 timber and every new player gets 20 (OPEN-WORLD.md, section 5.1).
- The time to sail home and place the signal station is not modelled, only its 300 coins.
- The 23 Nov minimum order of package S4 (a fetch that also pins, no separate pin order) is not modelled. It is never slower than this program, which charges the pin order.
- The ruin light is not modelled by the shipped data: every crew builds a signal station.
- A time in the table can jump by a whole wait. Windows open 5 or 8 minutes in every 20, and a plan that arrives one minute late waits for the next one.

## Layout of the file

The file is longer than the usual 200 lines because it does one job in ten steps, and it is a design tool outside the graded walkthrough (see the top of this page). Read it from the top. The sections are in the order the program runs: assumptions, loading the data, crews, the world one run plays in, taking a route, the steps of a plan, the search, the finale and totals, reports, `main`.

`WORK_ORDER` near the top fixes the order of the steps (for example, D1 is paired after the long timers have started; the lens steps do nothing with the shipped data). The search is exact within that order: it tries every seat for every card.

## How it was checked

**First version, 5 November 2026 (morning),** with scratch scripts that are not in the repository:

- Switching the pruning off, or the skipping of identical seats off, gave the same finish times and coins in all 276 runs (69 mixes, pace 1 and 1.5, free routes and shortcuts). The same holds with `--pre-position`.
- Four other orders of the steps were never faster than `WORK_ORDER` in any of those 276 runs, and neither were 25 random valid orders for any of the 69 mixes (pace 1.5, free routes).
- At best play the program matched the earlier scratch model of CASE-FILE.md, section 15.3, in 112 of 138 runs and was faster in the other 26, never slower.
- The plans of three crews (four different kits, three True Keepers with a Witness, and a solo True Keeper) were checked by hand against `case.json`, minute by minute.
- It printed the same output on Python 3.9, 3.11, 3.12 and 3.13, and `ruff check` with the repository settings passed.

**After the review, 5 November 2026 (evening),** the program changed in two ways (a partner's pin is a separate order, and aiming overlaps the partners' trip with a check on the 90 second hold), and the data changed in two (every kit has a home islet, so no crew needs a lens, and the shift change window is 8 minutes wide). What was checked again:

- The output pasted in TIMING.md is the output of this version on Python 3.9.6, and `ruff check` with the repository settings passes.
- Switching the pruning floor off gave the same finish times and coins in all 207 runs (69 mixes at pace 1.5 and 1, free routes, and at pace 1.5 with shortcuts).
- The checks of the first version about other step orders and about Python 3.11 to 3.13 were not repeated.
- `--lock-seconds 40` makes the lock check fail, and `--order-minutes 3` brings the solo night to 20 of 20 minutes, as the text in TIMING.md says.

**After the approval and the move, 5 November 2026 (late evening),** the program moved to `backend/tools/`, took its two paths from `backend/content/`, and was formatted with `ruff format` (`ruff check` and `ruff format --check` pass on it). What was checked again:

- The output for the mixed crew (`--explain TK,WI,IN,ST`) is identical before and after the move and the formatting, and every table pasted in TIMING.md was produced again by this version with the final `case.json`. TIMING.md says so in its status line.
- `backend/server/tests/test_case_timing.py` passes (19 tests, about 3 seconds). It includes a window of 5 minutes, which makes `TK TK TK WI`, `TK TK WI WI` and `TK WI WI WI` take 124 minutes against 120, as the first run found.
- The full program exits with 0, also with `--all`.

**After the second check, 5 November 2026 (night),** two kinds of ids changed in `case.json`. The place ids now follow the registry on `main` (the G6 merge `9f5bf97` added the zones `keepers_lamp`, `keepers_post_room`, `yard_gate` and `home_driftline`). The share route got the Exchange's company id, `greyfathom-salvage`. Nothing else changed. The output of every command quoted in TIMING.md is identical before and after (compared line by line), and the full program still exits with 0, also with `--all`. `test_case_timing.py` has one more test, which checks that the share route names a company on the Exchange (20 tests in all).

The full run is still a command, not a test. If the team later wants it in CI, call `main([])` from a test marked slow.
