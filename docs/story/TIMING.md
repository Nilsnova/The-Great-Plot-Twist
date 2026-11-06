# Timing check: does the case fit its minutes?

> **What this file is:** the result of a program that plays "The Light That Shouldn't Be" on paper for every crew and checks the promise: about 120 minutes for a crew of four, about 150 for one player with three NPC partners. It holds the real output, a short reading and the numbers in `case.json` to tune.
>
> **Who uses it:** the four teammates and their coding agents, above all the owners of the case package (S3) and the NPC partner package (S4), and whoever runs the paper playtest. Nils reads section 1.

- **Status:** approved by Nils on 5 November 2026 with the rest of the story round. Third run, 5 November 2026, late evening, after the approval and the move to `backend/tools/`: every command quoted below was run again on the moved program with the final data. Every number is the same as in the second run, and the program exits with 0, also with `--all`. After that, the place ids and the share id in `case.json` changed (see "How it was checked" in [backend/tools/README.md](../../backend/tools/README.md)); every command was run again and every output is identical. These are planning numbers. No human playtest has happened yet.
- **Run it:** `python3 -I backend/tools/simulate_case.py` from the repository root. It takes about 15 to 20 seconds (up to a minute on a busy laptop). How it works: [backend/tools/README.md](../../backend/tools/README.md). Where the files live: [README.md](README.md#where-the-files-live). Its fast parts also run in `uv run pytest`, in `backend/server/tests/test_case_timing.py`.
- **It reads:** [`backend/content/secret/case.json`](../../backend/content/secret/case.json) and [`backend/content/partners.json`](../../backend/content/partners.json).
- **Sibling documents:** [CASE-FILE.md](CASE-FILE.md) (the case and its timetable), [NPC-PARTNERS.md](NPC-PARTNERS.md) (errands and the kit order), [OPEN-WORLD.md](OPEN-WORLD.md) (prices).
- **If this file and the program disagree,** the program is right. Run it again and paste the new output.
- **What changed since the first run (same day):** the shift change window is 8 minutes wide, not 5. Every player has a home islet, a True Keeper too, so no crew needs a lens. A partner's pin is an order of its own, which adds 0 to 3 minutes per mix. The finale model lets a player aim while the partners sail and checks the 90 second hold. Everything in this list except the 8 minute window is a review change to the approval sheet and waits for Nils' OK ([README.md](README.md#changes-to-the-approval-sheet-after-the-review)).
- **Names** of places are placeholders until the final name check.

## 1. The answer in one minute

| Question | Answer |
|---|---|
| Does a crew of four fit about 120 minutes? | Yes. Four different kits take **102 minutes** at first-time pace and 93 at best play. That leaves 18 spare. The crew could play 2.5 times slower than the planning minutes before it missed 120. The worst crew of four takes 110. |
| Does one player with three partners fit about 150? | Yes. **121 to 124 minutes**, so 26 to 29 spare. The slowest start is the Stranger. The approval sheet said 118 to 122: this run counts a partner's pin as an order of its own and uses the new finale model. Nils has not seen that change yet ([README.md](README.md#changes-to-the-approval-sheet-after-the-review)). |
| Does anything break? | No. All 14 classes hold at first-time pace, and even best play fits every class. |
| Where is it tightest? | Crews of four with neither an Informant nor a Stranger, and not four identical kits: three True Keepers and a Witness, two True Keepers and two Witnesses. They take **110 against 120**, and could play 1.75 times slower than the planning minutes. |
| What changed to get there? | One number: `case_clock.windows.shift_change.open_minutes` went from 5 to **8**. Nils approved it on 5 November 2026 (decision 13). In the first run three crews of four took 124 against 120 (section 6). |
| Do the coins last? | Yes. Free routes need only the 300 coin building. The most a crew spends on shortcuts is 550 coins. The lowest wallet left in any plan is 500. |
| Does the finale fit the 20 minute night? | Yes, in every mix. Solo is the tightest: it needs **14 minutes** at first-time pace (13 at best play). A solo player's three Lock presses take 45 seconds, inside the 90 second hold. |
| How sure is this? | Not very. It uses the case file's planning numbers and has no human playtest behind it. It does not model the time to work out which two cards go together. Section 7 lists what moves the answer. The biggest is whether players walk to a place before its card opens. |

## 2. What the program does

1. **Crews.** It builds all 69 mixes of 1 to 4 players, each with a kit from their Act 1 ending. Empty seats get NPC partners with the first kits in the order Informant, Stranger, True Keeper, Witness (NPC-PARTNERS.md, section 4.2).
2. **Card phase.** It searches every way to hand out the cards, in a fixed order of steps, and keeps the fastest plan. Other orders of steps were never faster (backend/tools/README.md). Players and partners work at the same time. The two cards of a deduction come from two different seats. C5 and C6 wait for D2, and C8 waits for D3. Routes, timers, windows and the 1 minute crossing between places come from `case.json`. A partner errand takes 10 minutes and a pin 5, and the pin is an order of its own, so the player spends one more order minute on it. Only players pair cards.
3. **Finale.** It adds the least the Night of Three Lights can take by the rules: three seats at three lights, a partner needs 10 minutes to get to its light, and only players aim and lock. Aiming costs no request and overlaps the partners' trip, and one player's Lock presses must fit inside the 90 second hold (CASE-FILE.md, sections 10.3 to 10.5).
4. **Total.** Act 1 and the muster (20 minutes), the accusation (10), the Relighting (5) and the night allowance (15 to 25) come from the timetable, because the case data has no mechanics for them. The total is compared with the promise.
5. **Checks.** Coins, the NPC line bank, the lock hold and a few rules (section 4.6).

Words used in the output:

| Word | Meaning |
|---|---|
| Mix | The kits of the players in a crew, for example `TK WI IN ST`. TK True Keeper, WI Witness, IN Informant, ST Stranger |
| Class | A group of mixes with the same shape, such as "two pairs". The 35 mixes of four players have five shapes: four different kits, one pair, two pairs, three plus one, and four identical. Four identical is shown once for each kit |
| Best play | Pace 1: nobody wastes a minute |
| First-time pace | Pace 1.5: every minute a player spends walking, looking, reading, pairing and giving orders takes 1.5 minutes. Timers, windows and partner errands do not get slower. This is the guess in CASE-FILE.md, section 19, point 5 |
| Budget | The promise: 120 for four players, 130 or 140 for three or two, 150 solo. Four identical kits have their own two numbers, 135 on free routes and 125 with shortcuts |
| Spare | Budget minus the slowest mix of the class |
| Pace (column) | How many times slower than the planning minutes the slowest mix may play and still fit |
| HOLDS, TIGHT, BREAKS | Fits at pace 1.5, fits only between pace 1 and 1.5, does not fit even at pace 1 |

### The numbers it uses

| Input | Value | Source |
|---|---|---|
| Crossing between two places, finding a spot, reading | 1, 2 and 1 minute | `planning` in `case.json` |
| Route timers and windows | per route, per window | `cards` and `case_clock` |
| Partner errand, arrival, pin | 10, 4 and 5 minutes | `planning.partner_minutes_copied_from_npc_partners_md` |
| Pairing | 2 minutes, plus 1 for each card a partner pinned | `planning.pair_minutes`, `read_minutes` |
| Climb to a light | 1 minute | `night.climb_minutes` |
| Act 1, muster, accusation, Relighting, night | 12, 8, 10, 5; 15 or 25 | `planning.timetables` |
| The promise | 120, 125, 135, 150 | `planning.expected_totals_minutes` |
| Start coins, building | 1,000 or 1,600; 300 | `kits`, `night.lights` |
| Pace of first-time play | 1.5 | **Assumed**, CASE-FILE.md, section 19, point 5 |
| A player notices a partner's line and gives the next order, a fetch or a pin | 1 minute | **Assumed**, the 5 November scratch model used 1 |
| A player aims one beam | 1 minute | **Assumed**, only the finale check uses it |
| One press of Lock and the answer on screen | 10 seconds | **Assumed**, only the finale check uses it |

Four simplifications matter for the answer:

- **Nobody walks to a place before its card opens.** A first-time crew learns where to go when D2 or D3 forms. This is the cautious choice. Section 7 shows what the other choice does.
- **Giving an order costs the player no other time.** An order minute delays the order, not the player's reading, pairing or walking. A crew with many partner orders is therefore a little too fast in the program.
- **The lens.** Not needed any more. Every player has a home islet, a True Keeper too, so every crew builds a signal station. The lens steps stay in the program for the optional ruin light (tier should) and do nothing with the shipped data.
- **The night.** The program works out the minimum the rules force. For the total it uses the larger of that and the timetable's night allowance, because talk and a retry are not in the rules. The allowance is 15 for four players, 25 solo, and in between for 1 and 2 partners.

## 3. The real output

This is the output of `python3 -I backend/tools/simulate_case.py`, unchanged.

```text
Case timing check: The Light That Shouldn't Be (false_light). Times are case minutes.
Pace 1.5 = first-time crews. Pace 1 = best play. NPC kit order: IN, ST, TK, WI.

Class                        Mixes  Fastest  Worst  Shortcuts   Budget  Spare    Pace  Verdict  Worst mix
---------------------------  -----  -------  -----  ---------  -------  -----  ------  -------  -----------
4 players, all TK                1      110    110        105  135/125    +25   x2.25  HOLDS    TK TK TK TK
4 players, three plus one       12      102    110        105      120    +10   x1.75  HOLDS    TK TK TK WI
4 players, two pairs             6      102    110        105      120    +10   x1.75  HOLDS    TK TK WI WI
4 players, one pair             12      102    110        105      120    +10   x2.00  HOLDS    TK TK WI ST
4 players, 4 different kits      1      102    102        102      120    +18   x2.50  HOLDS    TK WI IN ST
4 players, all WI                1      110    110        105  135/125    +25   x2.25  HOLDS    WI WI WI WI
4 players, all IN                1      104    104        104  135/125    +31   x2.50  HOLDS    IN IN IN IN
4 players, all ST                1      110    110        105  135/125    +25   x2.50  HOLDS    ST ST ST ST
3 players + 1 partner           20      104    112        107      130    +18   x2.00  HOLDS    TK TK TK
2 players + 2 partners          10      108    115        111      140    +25  x3.00+  HOLDS    TK TK
1 player + 3 partners, TK        1      121    121        121      150    +29  x3.00+  HOLDS    TK
1 player + 3 partners, WI        1      121    121        121      150    +29  x3.00+  HOLDS    WI
1 player + 3 partners, IN        1      121    121        121      150    +29  x3.00+  HOLDS    IN
1 player + 3 partners, ST        1      124    124        121      150    +26  x3.00+  HOLDS    ST

Fastest, Worst: total minutes at pace 1.5 (free routes) of the fastest and slowest mix.
Shortcuts: the slowest mix when players may buy shortcuts. Spare: Budget minus Worst.
Budget: the promise. Four identical kits show two numbers: free routes / with shortcuts.
Pace: how many times slower than the planning minutes the worst mix may play and still fit.
HOLDS fits at pace 1.5. TIGHT fits only at a pace from 1 up to 1.5. BREAKS: not even at 1.
Result: 14 classes HOLD, 0 are TIGHT, 0 BREAK.

The finale
Players  Partners  Rules need (best)  Rules need (first-time)  Timetable gives  Night lasts at most  Lock presses  Seconds to press them  Hold
-------  --------  -----------------  -----------------------  ---------------  -------------------  ------------  ---------------------  ----
      4         0                  3                        4               15                   20             1                     15  90 s
      3         1                  3                        4               19                   20             1                     15  90 s
      2         2                 12                       12               22                   20             2                     30  90 s
      1         3                 13                       14               25                   20             3                     45  90 s

Coins
Players  Most spent on shortcuts (crew)  Most by one player  Lowest wallet left (shortcuts)  Lowest wallet left (free)
-------  ------------------------------  ------------------  ------------------------------  -------------------------
      1                             450                 450                             500                        700
      2                             550                 400                             550                        700
      3                             550                 400                             650                        700
      4                             550                 200                             700                        700

What a solo run asks of partners
Crew     Fastest: orders  partner min  cards done  Cheapest: orders  partner min  cards done
-------  ---------------  -----------  ----------  ----------------  -----------  ----------
solo TK                9           70          61                 9           70          61
solo WI               10           80          61                10           80          61
solo IN                9           70          61                 9           70          61
solo ST               11           85          64                 9           70          68

Checks
  PASS  the two timetables add up to 120 and 150 minutes, as promised
  PASS  19 routes: estimate_minutes matches the planning formula
  PASS  69 of 69 mixes find all 8 cards on free routes
  PASS  every deduction in every plan uses cards from two different seats
  PASS  no mix runs out of coins: the lowest wallet left in any plan is 500
  PASS  the night fits in 20 minutes for every mix
  PASS  one player can press all their Lock buttons inside the 90 second hold: 45 seconds at pace 1.5 in the worst mix
  PASS  the line bank (34 lines) covers all 19 kinds of errand line the plans use
```

## 4. Reading the output

### 4.1 The class table

- **All 14 classes hold at first-time pace. None breaks.** The Pace column is at least x1.75 everywhere, so even best play fits every class.
- **Four players with different kits: 102 minutes** (best play 93). The cards are all in at minute 52 and the timetable allows 70. The longest block on the way is the 15 minute salvage shift (Appendix A).
- **Four identical kits: 104 to 110 on free routes**, against 135. With shortcuts every one of them takes 104 or 105, against 125. A crew with no Informant (True Keepers, Witnesses or Strangers) is slowest because C4 waits for low tide.
- **Solo: 121 to 124**, against 150. Solo is slower than a crew of four different kits by 19 to 22 minutes (see 4.5 for why).
- **The tightest classes** are the crews of four that lack both an Informant and a Stranger and are not all alike. Section 5 explains why they still fit.

### 4.2 The finale

The rules need 3 to 4 minutes for four or three players, 12 for two players and 13 to 14 for one player. The night lasts at most 20. A solo player has 20 minus 14, so 6 minutes spare at first-time pace.

How the 14 add up for a solo player at first-time pace: the two orders for the partners' lights take 3 minutes, and the partners are on post after 13 (the orders plus their 10 minute trip). Aiming does not add to that. A beam stays where it was aimed, a light that a partner order has reserved shows its beam at once, and a player can aim it while the partner sails. Climbing to the own light and aiming all three beams takes 6 minutes, which fits inside the partners' trip. Then the three Lock presses follow, one after another: 15 seconds each at first-time pace, 45 seconds in all. All three locks must fall inside the 90 second hold, and 45 seconds fits. That makes about 14 minutes.

The first run said a solo player has about 3.5 minutes per beam. Those minutes were the time left for aiming, not the time a lock lasts, and aiming does not compete with the partners' trip, so they cost nothing extra. The timetable gives 25 minutes for the solo night and 22 for two players. That is more than one night, so it reads as room for one retry after dawn (3 minutes wait). The program cannot check that. Rerun it with `--lock-seconds 40` to see the lock check fail, and with `--order-minutes 3` to see the solo night take all 20 minutes (`--aim-minutes 3` takes 19).

### 4.3 The coins

No mix runs out. On free routes the only cost is the 300 coin building, so the lowest wallet left is 700 (1,000 minus 300). With shortcuts, the most a whole crew spends is 550 coins and the most one player pays is 450 (a solo player pays for the partners' shortcuts). The lowest wallet left in any plan is 500. No plan asks more than 750 coins from one player, so the Stranger's 600 extra coins are never needed.

### 4.4 The line bank

The 34 lines cover every errand the plans use: 19 kinds of line (orders, arrivals, found lines and pinned lines for the cards that partners fetch, and the light lines). No partner is ever speechless.

### 4.5 Solo, and the partners

- The cheapest plan for a solo run needs **9 orders and 70 partner minutes** (True Keeper, Informant, Stranger) or **10 orders and 80 minutes** (Witness). That is exactly what NPC-PARTNERS.md, section 10.11, says.
- The fastest plan asks for 9 to 11 orders, because a busy player hands one more card to a partner. It is 0 to 4 minutes faster than the cheapest plan.
- **Partners are on the critical path.** In a solo run D2 waits about 18 minutes for one partner (an order, the errand, a pin order, the pin), and D3 waits about 18 minutes for the next (Appendix A, solo True Keeper). If partner errands and pins took no time (`errand` and `pin` set to 0 in `planning.partner_minutes_copied_from_npc_partners_md`, the 4 minute arrival left as it is), solo would take 89 to 95 minutes instead of 121 to 124. Setting the arrival to 0 as well gives 89 to 97. If the player's own pairing, reading and searching took no time, it would take about 103. The two do not add up, because they overlap. NPC-PARTNERS.md, section 10.11, now says the same: in these plans the partners are the larger part of the extra time, not the one player. Solo still fits with 26 or more minutes spare.

### 4.6 The checks

All eight pass: the timetables add up to 120 and 150, every route estimate matches the formula, all 69 mixes find all 8 cards on free routes, every deduction uses two different seats, no mix runs out of coins, the night fits, one player's Lock presses fit inside the hold, and the line bank is complete.

## 5. Where the budget holds, where it is tightest

| Crew | First-time minutes | Budget | Why |
|---|---|---|---|
| Four players with an Informant and a Stranger | 102 | 120 | Both cheap kit routes (the C4 back room and the C5 yard shift) keep D2 and D3 early |
| Four players with an Informant, no Stranger | 104 | 120 | C5 goes through the yard gate, which is open 8 minutes in every 20 |
| Four players with no Informant | 110 | 120 | C4 waits for low tide (up to 12 minutes) and, with no Stranger either, C5 waits for the shift change |
| Four identical kits | 104 to 110 | 135 free, 125 with shortcuts | Same waits as above. A shortcut or a different kit removes them |
| Three players and a partner | 104 to 112 | 130 | Worst when no one brings the Informant kit and the Stranger kit |
| Two players and two partners | 108 to 115 | 140 | The partners bring the Informant and, where they can, the Stranger |
| One player and three partners | 121 to 124 | 150 | Every cheap kit is in the crew. The partner chains set the pace |

**Why the crews that were tight now fit.** Take three True Keepers and a Witness (Appendix A). Nobody holds the Informant kit, so C4 waits for low tide (minutes 12 to 19 of every 20). D2 forms at minute 21.5. Nobody holds the Stranger kit either, so C5 goes through the yard gate, which opens at the change of shift. In the first run the gate was open for 5 minutes in every 20 (minutes 0 to 4). A player reached it at minute 26, one minute too late for the window of minutes 20 to 24, and the next window opened at 40. The player waited 14 minutes, then the shift timer ran for 15. C5 was in hand at 56.5 and D3 formed at 59.5, where the timetable allows 55: 124 minutes against 120. With the window 8 minutes wide (minutes 0 to 7 of every 20), the player at the gate at minute 26 finds it open. C5 is in hand at 42.5, D3 forms at 45.5 and the crew finishes in 110. Buying the 200 coin doorman for C4 puts D2 at 17 and the crew finishes in 105.

## 6. The numbers in case.json to tune

The program moves one number at a time and shows what it does to three telling crews: the mixed crew (`TK WI IN ST`), the slowest crew of four (`TK TK TK TK`) and the slowest solo start (`ST`).

```text
Change in total minutes (pace 1.5, free routes). Base totals: TK WI IN ST 102, TK TK TK TK 110, ST 124
Lever (today)                        Try  TK WI IN ST  TK TK TK TK  ST
-----------------------------------  ---  -----------  -----------  --
C5 yard timers: shift and gate (15)   10           -5           -5  -3
C5 yard timers: shift and gate (15)   20           +5           +5  +5
shift_change open_minutes (8)          5           +0          +14  +0
shift_change open_minutes (8)         10           +0           +0  -3
C8.ruin timer_minutes (5)              3           -2           -2  -2
C8.ruin timer_minutes (5)              8           +3           +3  +3
partner errand minutes (10)            8           +0           +0  -6
partner errand minutes (10)           12           +0           +0  +2
planning pair_minutes (2)              1           -4           -5  -7
planning pair_minutes (2)              4           +9          +20  +9
planning find_spot_minutes (2)         1           -4           -3  -3
planning find_spot_minutes (2)         3           +5           +3  +3
assumption: ORDER_MINUTES (1)          2           +0           +0  +3
assumption: ORDER_MINUTES (1)          3           +0           +0  +9
```

**Done in this round: `shift_change.open_minutes` is 8** (it was 5; Nils approved it on 5 November 2026, decision 13). It was the only change needed. The lever table shows what going back to 5 would do: 14 more minutes for the crew of four with no Informant and no Stranger. In the first run the window sizes 5 and 6 left the worst crew of four at 124, and 7 or more brought it to 110. The second run, with the pin order and the new finale, gives the same result: with 5 or 6 two classes are TIGHT (124 against 120), with 7, 9, 10 and 12 all 14 classes hold and the worst crew of four takes 110. Seven is the least that works for this plan, at exactly first-time pace (x1.50). Eight leaves room (x1.75). A player who arrives at a random minute waits on average (20 minus open minutes) squared, divided by 40. That is 5.6 minutes for 5, 3.6 for 8 and 2.5 for 10. The window is the right number to move because it removes the wait itself. The yard timers (15 minutes) only shorten what comes after.

**If the playtest shows the case is slower than the program says,** these are the levers, read from the table above:

| Lever | `TK WI IN ST` | `TK TK TK TK` | `ST` | Note |
|---|---|---|---|---|
| `C5.yard_shift` and `C5.yard_gate_timed` `timer_minutes` 15 to 10 | -5 | -5 | -3 | Change both together. Rule L7 keeps the kit route the shortest. The shift is the longest block on the critical path |
| `planning.pair_minutes` 2 to 1 | -4 | -5 | -7 | The size depends on whether a window is hit |
| `planning.find_spot_minutes` 2 to 1 | -4 | -3 | -3 | Same |
| `partner_minutes_copied_from_npc_partners_md.errand` 10 to 8 | +0 | +0 | -6 | Helps solo. NPC-PARTNERS.md owns the number, so change it there first |
| `C8.ruin` `timer_minutes` 5 to 3 | -2 | -2 | -2 | Direct |

The totals jump by whole waits because a window is open only 5 or 8 minutes in every 20. A change of 1 minute can move a plan across a window and save or cost 14 minutes. Read the lever table as a direction, not as a forecast.

## 7. How far to trust it

| What changes | Effect (worst mix per class) |
|---|---|
| Players walk to a place and search it before its card opens (`--pre-position`) | Crews of two to four players are 5 to 9 minutes faster, and all 14 classes hold. Solo does not change, because its pace is set by the partners |
| Every player read Elena's log (`--log-readers`) | 5 minutes faster in every class |
| A player takes 3 minutes to give the next order (`--order-minutes 3`) | Solo takes 133 minutes (9 to 12 more), and the solo night needs 20 of its 20 minutes. Crews with two or three players take 1 to 2 minutes more |
| Pairing takes 4 minutes instead of 2 (`pair_minutes`) | 9 to 20 more minutes for the three telling crews |
| Aiming takes 3 minutes per beam (`--aim-minutes 3`) | The solo night needs 19 of its 20 minutes, and four players need 7 |
| One press of Lock takes 40 seconds (`--lock-seconds 40`) | The lock check fails: a solo player needs 180 seconds for three locks, against a hold of 90 |

The class by class numbers for the first two rows:

```text
Worst mix per class, total minutes at first-time pace (free routes).

Class                        Today  Walk before card opens  Log readers
---------------------------  -----  ----------------------  -----------
4 players, all TK              110                     101          105
4 players, three plus one      110                     102          105
4 players, two pairs           110                     102          105
4 players, one pair            110                     101          105
4 players, 4 different kits    102                      93           97
4 players, all WI              110                     102          105
4 players, all IN              104                      99           99
4 players, all ST              110                     102          105
3 players + 1 partner          112                     106          107
2 players + 2 partners         115                     109          110
1 player + 3 partners, TK      121                     121          116
1 player + 3 partners, WI      121                     121          116
1 player + 3 partners, IN      121                     121          116
1 player + 3 partners, ST      124                     124          119
```

What the program does not model:

- **The time to work out which two cards go together.** Pairing is 2 minutes. A wrong pair costs a 30 second wait and thinking. This is the biggest risk, because the pairing is the puzzle.
- **Waiting for friends,** logging in and talking. Pace is the only allowance. The crew's case clock may also pause while nobody is online (CASE-FILE.md, section 8). The program counts minutes of play.
- **A failed night.** The timetable's allowance is used for the night.
- **Crews that play badly.** The plans are good plans. Pace makes players slower, not worse.
- **The open world, weather and the market.** They are switched off.
- **Timber.** A building needs 10 timber and every new player gets 20.
- **Building the signal station.** The time to sail home and place it is not modelled, only its 300 coins. It can happen during any timer before nightfall. A True Keeper now has to leave Lighthouse Isle for it, like the other kits.
- **The 23 Nov minimum of package S4,** where a fetch also pins and no pin order exists. It is never slower than this program.

## 8. The NPC kit order

NPC-PARTNERS.md, section 11, asked the timing check to run the comparison again. The order is Informant, Stranger, True Keeper, Witness. The old one, used by CASE-FILE.md before the review, is True Keeper, Informant, Stranger, Witness. Only the mixes where the two orders give different partners are shown.

At first-time pace (`python3 -I backend/tools/simulate_case.py --kit-orders`):

```text
Players   New partners  New total  Old partners  Old total  New saves
--------  ------------  ---------  ------------  ---------  ---------
WI WI WI  IN                  112  TK                  112         +0
WI WI IN  ST                  104  TK                  105         +1
WI WI ST  IN                  112  TK                  112         +0
WI IN IN  ST                  104  TK                  105         +1
WI ST ST  IN                  112  TK                  112         +0
IN IN IN  ST                  104  TK                  105         +1
ST ST ST  IN                  112  TK                  112         +0
WI WI     IN ST               115  TK IN               115         +0
WI IN     ST TK               108  TK ST               108         +0
WI ST     IN TK               115  TK IN               115         +0
IN IN     ST TK               108  TK ST               108         +0
ST ST     IN TK               115  TK IN               115         +0
WI        IN ST TK            121  TK IN ST            121         +0
IN        ST TK WI            121  TK ST WI            121         +0
ST        IN TK WI            124  TK IN WI            124         +0

Pace 1.5, free routes. The two orders give different partners in 15 of the 34 mixes with partners.
The new order is faster in 3, slower in 0 and equal in 12. Minutes saved in total: 3.
```

At best play (`python3 -I backend/tools/simulate_case.py --kit-orders --pace 1`):

```text
Players   New partners  New total  Old partners  Old total  New saves
--------  ------------  ---------  ------------  ---------  ---------
WI WI WI  IN                  106  TK                  106         +0
WI WI IN  ST                   96  TK                  100         +4
WI WI ST  IN                  106  TK                  106         +0
WI IN IN  ST                   96  TK                  100         +4
WI ST ST  IN                  106  TK                  106         +0
IN IN IN  ST                   96  TK                  100         +4
ST ST ST  IN                  106  TK                  106         +0
WI WI     IN ST               109  TK IN               109         +0
WI IN     ST TK                99  TK ST                99         +0
WI ST     IN TK               109  TK IN               109         +0
IN IN     ST TK                99  TK ST                99         +0
ST ST     IN TK               109  TK IN               109         +0
WI        IN ST TK            113  TK IN ST            113         +0
IN        ST TK WI            113  TK ST WI            113         +0
ST        IN TK WI            113  TK IN WI            113         +0

Pace 1, free routes. The two orders give different partners in 15 of the 34 mixes with partners.
The new order is faster in 3, slower in 0 and equal in 12. Minutes saved in total: 12.
```

With the wider shift change window the new order is never slower and helps in 3 mixes (a Stranger partner in place of a True Keeper, when the players are Witnesses and Informants): by 1 minute at first-time pace and 4 at best play. The gain is small, because the window now makes a missing Stranger cheap. Keep the new order: it costs nothing and it is never worse. If a window or a timer moves, run this again.

## 9. A paper playtest to run next

Run the mixed crew (`TK WI IN ST`) and a solo player with a stopwatch, and write down these six times. Each one replaces a guess in this file.

| Measure | The program assumes | Why it matters |
|---|---|---|
| Time from the moment D2 forms until C5 is in hand, for a crew with neither an Informant nor a Stranger | 21 minutes (`TK TK TK WI`, Appendix A) | The one chain that waits for a window |
| How long a first-time player needs to find a spot on an island with decoys | 2 minutes, and nobody searches before the card opens | Biggest swing in section 7 |
| Pairing, including wrong pairs | 2 minutes | The puzzle is not modelled |
| Solo: time between a partner's line and the next order | 1 minute | Partners are on the critical path |
| The night: time to aim one beam, and to press Lock | 1 minute, and 10 seconds | A solo player aims three beams while the partners sail (about 13 minutes) and then needs under a minute to lock them |
| The whole case on the clock | 102 minutes (four different kits), 121 to 124 solo | The promise itself |

## 10. Where these numbers are used

The program is the source for the numbers. The first run listed nine places that needed a new number. This round changed them, and the last row, which belonged to a file outside this folder, is done too.

| Document and place | The first run said | Now | Status |
|---|---|---|---|
| `case.json`, `case_clock.windows.shift_change` | `open_minutes` 5 | 8 | Done |
| CASE-FILE.md, section 5.2; NPC-PARTNERS.md, sections 4.1 and 4.3 | Shift change open in minutes 0 to 4 | 0 to 7, longest wait 12 | Done |
| CASE-FILE.md, section 15.3, last row | One player with three partners: best play to D4 is 50 to 61 | 52 to 53 (`--all`, column "D4 best") | Done |
| CASE-FILE.md, section 15.3, text | The most a crew spent on shortcuts was 600 coins | 550 | Done |
| CASE-FILE.md, sections 15.3 and 19, point 5 | A paper playtest and a simulated run follow | This file is the simulated run. A human playtest is still owed | Done |
| CASE-FILE.md, sections 3 and 9 | Kit order True Keeper, Informant, Stranger, Witness | Informant, Stranger, True Keeper, Witness (NPC-PARTNERS.md, section 4.2) | Done |
| NPC-PARTNERS.md, section 4.3 | Four players with four different kits form D4 after 37 case minutes; the new order saves 1 to 9 minutes in 8 of 69 mixes | 43; faster in 3 of 34 mixes with partners, never slower; the Informant missing costs 9 minutes and the Stranger 6 | Done |
| NPC-PARTNERS.md, section 10.11 | Partners should not be the slow part of a solo run | They are the larger part (section 4.5). The counts, 9 or 10 orders and 70 or 80 minutes, are confirmed | Done |
| `backend/content/README.md`, section "The case data", `planning` | "A timing test may read them" | The program exists (`backend/tools/simulate_case.py`) and its fast parts run in `backend/server/tests/test_case_timing.py` | Done |
| ENGINEERING.md, section 2 (repository map) | No `tools/` folder | `backend/tools/` and `backend/content/secret/` are in the map (D016) | Done |

## 11. Decisions and open points

| # | Point | Recommendation | Who decides |
|---|---|---|---|
| 1 | **Three crews of four took 124 minutes against a promise of 120.** | Done: the shift change window is 8 minutes wide. Decided by Nils on 5 November 2026 (decision 13). `test_case_timing.py` keeps it: every crew of four fits, and a window of 5 minutes would not. | Closed |
| 2 | **Can a lens be made before D3?** | Decided by Nils on 5 November 2026 (decision 14): yes. A lens can be made before D3, and only fitting it waits for D3. It changes no total here, because every crew builds a signal station and the lens belongs to the optional ruin light (tier should). | Closed |
| 3 | **Keep pace 1.5** until the paper playtest. | Keep. It is the case file's own guess. Section 9 replaces it with a measurement. | The team |
| 4 | **Budgets for two and three players.** The docs say "120 to 150". The program uses 130 for three players and 140 for two. | Keep. If those pass, the range passes. | Case file author |
| 5 | **Turn the checks into pytest tests.** The program prints PASS or FAIL. | Done in part. `backend/server/tests/test_case_timing.py` runs the fast parts in about 3 seconds: the paths, the decisions in the data, every crew of four, the solo starts. The full run takes 15 seconds or more, so it stays a command and is not in `uv run pytest`. If the team wants it in CI, call `main([])` from a test marked slow. | S3 owner |
| 6 | **The program is a design tool.** It has about 1,250 lines (after `ruff format`) and a search, which is hard to explain line by line. | Keep it outside the graded walkthrough, say so in its README, and let S3 port only the checks. | The team |

## Appendix A. Three paper playtests

Each is the program's own plan for one crew at first-time pace on free routes. The left column is the minute the event happens. "In hand" is when a card lands in the journal or satchel. A card is pinned at the minute on the left.

**The mixed crew** (`python3 -I backend/tools/simulate_case.py --explain TK,WI,IN,ST`). The 15 minute salvage shift for C5 and the search of the ruin for C8 set the pace.

```text
Paper playtest: TK WI IN ST (4 players), pace 1.5, free routes only
Seats:
  seat 1: player, TK
  seat 2: player, WI
  seat 3: player, IN
  seat 4: player, ST
Third light: a home signal station (one building, 300 coins)

Timeline:
     1.5  C2 pinned by seat 2 (WI) via C2.radio_words, in hand at 1.5
     1.5  C3 pinned by seat 1 (TK) via C3.key_tag, in hand at 1.5
     4.5  C1 pinned by seat 4 (ST) via C1.notice_board, in hand at 4.5
     6.0  C7 pinned by seat 2 (WI) via C7.night_log, in hand at 6.0
     7.5  D1 forms, seat 3 pairs the cards
    11.0  C4 pinned by seat 3 (IN) via C4.back_room, in hand at 11.0
    14.0  D2 forms, seat 1 pairs the cards
    20.0  C6 pinned by seat 1 (TK) via C6.back_room, in hand at 20.0
    35.0  C5 pinned by seat 4 (ST) via C5.yard_shift, in hand at 35.0
    38.0  D3 forms, seat 1 pairs the cards
    49.0  C8 pinned by seat 1 (TK) via C8.ruin, in hand at 49.0
    52.0  D4 forms, seat 1 pairs the cards

Nightfall can be called at minute 52.0. The rules need 3.2 minutes for the night; the timetable gives 15.0.

Against the timetable (case minutes, intro not counted):
  D2 forms at 14.0; the timetable allows 25.0
  D3 forms at 38.0; the timetable allows 55.0
  D4 forms at 52.0; the timetable allows 70.0

Total 102.0 = 35.0 (Act 1, muster, accuse, Relighting) + 52.0 (cards) + 15.0 (night). Budget 120.0.
```

**The slowest crew of four** (`--explain TK,TK,TK,WI`). C5 goes through the yard gate, which is open at the change of shift. In the first run, with a window of 5 minutes, it waited 14 minutes and the crew took 124. With `--shortcuts` this crew buys C4 from the doorman, forms D2 at 17 and finishes in 105.

```text
Paper playtest: TK TK TK WI (4 players), pace 1.5, free routes only
Seats:
  seat 1: player, TK
  seat 2: player, TK
  seat 3: player, TK
  seat 4: player, WI
Third light: a home signal station (one building, 300 coins)

Timeline:
     1.5  C2 pinned by seat 4 (WI) via C2.radio_words, in hand at 1.5
     1.5  C3 pinned by seat 1 (TK) via C3.key_tag, in hand at 1.5
     6.0  C1 pinned by seat 3 (TK) via C1.notice_board, in hand at 6.0
     6.0  C7 pinned by seat 4 (WI) via C7.night_log, in hand at 6.0
     9.0  D1 forms, seat 4 pairs the cards
    18.5  C4 pinned by seat 2 (TK) via C4.low_tide_cave, in hand at 18.5
    21.5  D2 forms, seat 1 pairs the cards
    26.0  C6 pinned by seat 3 (TK) via C6.back_room, in hand at 26.0
    42.5  C5 pinned by seat 1 (TK) via C5.yard_gate_timed, in hand at 42.5
    45.5  D3 forms, seat 1 pairs the cards
    56.5  C8 pinned by seat 1 (TK) via C8.ruin, in hand at 56.5
    59.5  D4 forms, seat 1 pairs the cards

Nightfall can be called at minute 59.5. The rules need 3.2 minutes for the night; the timetable gives 15.0.

Against the timetable (case minutes, intro not counted):
  D2 forms at 21.5; the timetable allows 25.0
  D3 forms at 45.5; the timetable allows 55.0
  D4 forms at 59.5; the timetable allows 70.0

Total 109.5 = 35.0 (Act 1, muster, accuse, Relighting) + 59.5 (cards) + 15.0 (night). Budget 120.0.
```

**Solo True Keeper** (`--explain TK`). The partners pin C2, C4, C5 and C7 (the Witness partner already holds C2). D2 waits for C4 and D3 waits for C5. The player builds the signal station for the third light (one building, 300 coins) and needs no lens.

```text
Paper playtest: TK (1 player), pace 1.5, free routes only
Seats:
  seat 1: player, TK
  seat 2: partner, IN
  seat 3: partner, ST
  seat 4: partner, WI
Third light: a home signal station (one building, 300 coins)

Timeline:
     1.5  C3 pinned by seat 1 (TK) via C3.key_tag, in hand at 1.5
     6.5  C2 pinned by seat 4 (WI) via C2.radio_words, in hand at 1.5
    18.0  C4 pinned by seat 2 (IN) via C4.back_room, in hand at 11.5
    18.0  C7 pinned by seat 3 (ST) via C7.night_log, in hand at 11.5
    22.5  D2 forms, seat 1 pairs the cards
    28.5  C1 pinned by seat 1 (TK) via C1.notice_board, in hand at 28.5
    33.0  C6 pinned by seat 1 (TK) via C6.back_room, in hand at 33.0
    37.5  D1 forms, seat 1 pairs the cards
    40.5  C5 pinned by seat 3 (ST) via C5.yard_shift, in hand at 34.0
    45.0  D3 forms, seat 1 pairs the cards
    56.0  C8 pinned by seat 1 (TK) via C8.ruin, in hand at 56.0
    60.5  D4 forms, seat 1 pairs the cards

Nightfall can be called at minute 60.5. The rules need 13.8 minutes for the night; the timetable gives 25.0.

Against the timetable (case minutes, intro not counted):
  D2 forms at 22.5; the timetable allows 35.0
  D3 forms at 45.0; the timetable allows 70.0
  D4 forms at 60.5; the timetable allows 90.0

Total 120.5 = 35.0 (Act 1, muster, accuse, Relighting) + 60.5 (cards) + 25.0 (night). Budget 150.0.
```

## Appendix B. All 69 mixes

The output of `python3 -I backend/tools/simulate_case.py --all`, the table only. "D4 best" is the minute D4 forms at best play (pace 1) on free routes. "D4 best+shortcuts" is the same with shortcuts. "Best play", "First-time" and "Shortcuts" are totals in minutes. "Coins" is what the shortcut plan spends. The two D4 columns are the ones to compare with the table in CASE-FILE.md, section 15.3.

```text
Mix          Players  D4 best  D4 best+shortcuts  Best play  First-time  Shortcuts  Coins  Budget  Spare
-----------  -------  -------  -----------------  ---------  ----------  ---------  -----  ------  -----
TK TK TK TK        4       52                 49        102         110        105    350     135    +25
TK TK TK WI        4       52                 49        102         110        105    200     120    +10
TK TK TK IN        4       49                 46         99         104        104    150     120    +16
TK TK TK ST        4       52                 46        102         110        105    350     120    +10
TK TK WI WI        4       52                 49        102         110        105    200     120    +10
TK TK WI IN        4       49                 46         99         104        104      0     120    +16
TK TK WI ST        4       52                 46        102         110        105    200     120    +10
TK TK IN IN        4       49                 46         99         104        104    150     120    +16
TK TK IN ST        4       43                 43         93         102        102    150     120    +18
TK TK ST ST        4       52                 46        102         110        105    350     120    +10
TK WI WI WI        4       52                 49        102         110        105    200     120    +10
TK WI WI IN        4       49                 46         99         104        104      0     120    +16
TK WI WI ST        4       52                 46        102         110        105    200     120    +10
TK WI IN IN        4       49                 46         99         104        104      0     120    +16
TK WI IN ST        4       43                 43         93         102        102      0     120    +18
TK WI ST ST        4       52                 46        102         110        105    200     120    +10
TK IN IN IN        4       49                 46         99         104        104    150     120    +16
TK IN IN ST        4       43                 43         93         102        102    150     120    +18
TK IN ST ST        4       43                 43         93         102        102    150     120    +18
TK ST ST ST        4       52                 46        102         110        105    350     120    +10
WI WI WI WI        4       52                 49        102         110        105    400     135    +25
WI WI WI IN        4       49                 46         99         104        104      0     120    +16
WI WI WI ST        4       52                 46        102         110        105    400     120    +10
WI WI IN IN        4       49                 46         99         104        104      0     120    +16
WI WI IN ST        4       43                 43         93         102        102      0     120    +18
WI WI ST ST        4       52                 46        102         110        105    400     120    +10
WI IN IN IN        4       49                 46         99         104        104      0     120    +16
WI IN IN ST        4       43                 43         93         102        102      0     120    +18
WI IN ST ST        4       43                 43         93         102        102      0     120    +18
WI ST ST ST        4       52                 46        102         110        105    400     120    +10
IN IN IN IN        4       49                 46         99         104        104    150     135    +31
IN IN IN ST        4       43                 43         93         102        102    150     120    +18
IN IN ST ST        4       43                 43         93         102        102    150     120    +18
IN ST ST ST        4       43                 43         93         102        102    150     120    +18
ST ST ST ST        4       52                 46        102         110        105    550     135    +25
TK TK TK           3       51                 45        105         112        107    350     130    +18
TK TK WI           3       51                 45        105         112        107    200     130    +18
TK TK IN           3       42                 42         96         104        104    150     130    +26
TK TK ST           3       51                 45        105         112        107    350     130    +18
TK WI WI           3       51                 45        105         112        107    200     130    +18
TK WI IN           3       42                 42         96         104        104      0     130    +26
TK WI ST           3       51                 45        105         112        107    200     130    +18
TK IN IN           3       42                 42         96         104        104    150     130    +26
TK IN ST           3       43                 42         97         105        104    250     130    +25
TK ST ST           3       51                 45        105         112        107    350     130    +18
WI WI WI           3       52                 45        106         112        107    400     130    +18
WI WI IN           3       42                 42         96         104        104      0     130    +26
WI WI ST           3       52                 45        106         112        107    400     130    +18
WI IN IN           3       42                 42         96         104        104      0     130    +26
WI IN ST           3       43                 42         97         105        104    250     130    +25
WI ST ST           3       52                 45        106         112        107    400     130    +18
IN IN IN           3       42                 42         96         104        104    150     130    +26
IN IN ST           3       43                 42         97         105        104    400     130    +25
IN ST ST           3       43                 42         97         105        104    400     130    +25
ST ST ST           3       52                 45        106         112        107    550     130    +18
TK TK              2       51                 45        108         115        111    350     140    +25
TK WI              2       51                 45        108         115        111    200     140    +25
TK IN              2       42                 42         99         108        108      0     140    +32
TK ST              2       51                 45        108         115        111    200     140    +25
WI WI              2       52                 45        109         115        111    400     140    +25
WI IN              2       42                 42         99         108        108      0     140    +32
WI ST              2       52                 45        109         115        111    400     140    +25
IN IN              2       42                 42         99         108        108    150     140    +32
IN ST              2       43                 42        100         108        108    250     140    +32
ST ST              2       52                 45        109         115        111    550     140    +25
TK                 1       52                 52        112         121        121      0     150    +29
WI                 1       53                 52        113         121        121    200     150    +29
IN                 1       53                 52        113         121        121    200     150    +29
ST                 1       53                 52        113         124        121    450     150    +26
```
