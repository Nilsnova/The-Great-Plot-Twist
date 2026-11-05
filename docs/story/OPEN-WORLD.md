# Open world: the daily round, the economy and the calendar

> **What this file is:** the "forever" part of The Great Plot Twist, the play that runs beside the case. It holds the 10 to 15 minute daily round, every loop inside it with its tier, the play-money economy in numbers, the Island Exchange, prediction and sports pools, Lantern Duels, and the key dates from 16 Nov to mid-December.
>
> **Who uses it:** the four teammates and their coding agents. Give it to your agent together with [AGENTS.md](../../AGENTS.md) and [docs/ENGINEERING.md](../ENGINEERING.md). The case itself (cards, deductions, the finale, crews, NPC partners) lives in the other documents in this folder.

- **Status:** approved by Nils on 5 Nov 2026, with the rest of the story round (D018 in the [decision log](../DECISIONS.md) records his decisions). It counts as accepted when a different teammate has reviewed it and it is merged, the same path as decision D001. **Section 7 is superseded by decision D017**, and the other sections that touch the Exchange were re-derived from it after the review.
- **Built from:** the approved story skeleton v1 and Nils' five decisions of 5 Nov (D013), the open-world design of the same day, and three data-source checks of 5 Nov (market data, predictions and sports, hosting).
- **Checked against `main` at commit `8d0a718`** (5 Nov evening, after the L4 Island Exchange merged as `d7857d9`) and `ROADMAP.md` v0.2. The first version was checked at `60bd60e`. The budget in 4.1 was recounted against `ROADMAP.md` v0.3, which the same branch writes. Six things on `main` shape this file. A wallet starts at 0 and the entry kit pays the first coins (D004). The wallet reasons are a table, and the Exchange added three (D017). Crews have up to four seats (D012). The look is original top-down pixel art (D005). Server content lives in `backend/content/` (D016, proposed). A `crons` entry in `vercel.json` breaks our deploys under Vercel Services (D002), so nothing here uses a cron. Files that exist only on `main`, not on every branch, are written in `code style` here and are not links.
- **What to give your agent for one loop:** section 2, the loop's own section (5 for the world loops, 7 for the Exchange, 8 for pools, 9 for duels), and then sections 6, 13 and 14.
- **Numbers:** every number below is a start value. In the code it lives in a content JSON file, never inside a function, and it changes only by pull request. Where a number is a guess, the text says so.
- **Names:** places and companies are placeholders until the final name check (section 15).
- **Folders:** the server package is `backend/server/`. Where an older document says `server/`, read `backend/server/`. Content files live in `backend/content/` (D016), so where this file or an older one says `content/`, read `backend/content/`.
- **If two documents disagree** on a number, open an issue. Do not pick one silently. Section 15.2 lists the disagreements known today.

**Contents**

1. [The answer in one page](#1-the-answer-in-one-page)
2. [How the open world sits beside the case](#2-how-the-open-world-sits-beside-the-case)
3. [The daily round](#3-the-daily-round)
4. [The loops, the budget and the honest cut](#4-the-loops-the-budget-and-the-honest-cut)
5. [The world loops in detail](#5-the-world-loops-in-detail)
6. [The economy in numbers](#6-the-economy-in-numbers)
7. [The Island Exchange](#7-the-island-exchange)
8. [Prediction desk and sports pools](#8-prediction-desk-and-sports-pools)
9. [Lantern Duels](#9-lantern-duels)
10. [The key-event calendar](#10-the-key-event-calendar)
11. [Play-money rules](#11-play-money-rules)
12. [Free-tier limits and sources we do not use](#12-free-tier-limits-and-sources-we-do-not-use)
13. [Contracts to add before the freeze](#13-contracts-to-add-before-the-freeze)
14. [Tests that prove it](#14-tests-that-prove-it)
15. [Open points and decisions](#15-open-points-and-decisions)
16. [Words we use](#16-words-we-use)

## 1. The answer in one page

**The open world is a 10 to 15 minute daily round that never needs the case, and the case never needs it.** By Mon 23 Nov we build only what fits the one spare day in the roadmap. That is the weather, a small islet and a thin daily frame, beside the Island Exchange, which L4 has already built. Everything else waits in a fixed order. Play money only.

The **Must** row is this file's minimum for 23 November. Nothing in the Should row may start before it is green.

| Tier | What we build | When | New days |
|---|---|---|---|
| **Must** | The daily frame: Lisbon day, daily caps, a text bulletin. Weather states and the fog-night rule. The home islet at minimum size. Sailing by sea chart (already built). The Island Exchange as built (L4, D017: seven companies, live Binance prices, the replay in demo mode). The Chapter 2 hook as a Board notice. | Merged by the freeze on Wed 18 Nov. Hard stop Mon 23 Nov. | 0.75, on top of the roadmap packages L1, L2, L3, G2 and L4 |
| **Should** | In this order: the Exchange extras (the Greyfathom shareholder route, the delisting and the lower fee at the Relighting, a weekly title), the driftline and the full islet, Lantern Duels, the prediction desk, sports predictions, Harbor Slate orders, Elena's radio and the Chapter 2 hook beam. | After the Fri 13 Nov check, and only if the must list is green. In practice, after submission on Mon 23 Nov. | about 13.5 |
| **Later** | NBA pools, the Polymarket backup, collections and Harbor Standing, storm raids, the Light Network, Chapter 2 content. | After submission. | not sized |

**The honest cut.** The team has about 26 package days until the freeze. The roadmap's core packages at minimum size take 23 of them, and the Island Exchange (core, by Nils' decision) took 2 more at minimum size. Those 2 are spent: L4 is merged. That left about 1 day, but A4 live presence (core since the late evening of 5 Nov, a proposed 1.5 days) takes it to about -0.5 on paper (4.1). The paper count still treats G2 and G3 as open work, so the real picture is better. The must list needs 0.75 more. The open-world design of 5 Nov wanted about 5.5 extra days in the must list, so it did not fit. It is cut: salvage, level 2, the windmill, the hook beam and the Exchange extras all move to should. The ladder for the days that are left is in section 4.3.

**Money in one breath**

- A wallet starts at 0. The entry kit pays 1,000 coins once. The Stranger kit pays 1,600.
- With the must list there is no daily income: only the kit, the case rewards (450 to 2,000, once per player) and Exchange wins. The driftline (should) adds up to 150 coins a day, and orders (should) up to 150 more.
- Buildings cost 300 coins and 10 timber at level 1, 900 at level 2 and 2,000 at level 3. Four lines to level 3 cost 12,800 coins.
- The Exchange (D017) charges a 2% fee on every buy and sell, rounded against the player. A purchase is 1 to 500 coins, at most 2,000 coins of shares can be bought per market day, and a sale must wait 10 minutes after the latest purchase. A price stays between 25% and 400% of the company's start price, and a 30% move pauses the company for 15 minutes. It has no reserve and no closing time. The average round trip loses the fees, about 20 coins on 480.
- Pools and duels only move coins between players and destroy 5%.

**What can go wrong**

| Risk | What we do | Where |
|---|---|---|
| Not enough days. On paper the days are short by about 0.5. | The recount at the Fri 13 Nov check (G2, G3 and L4 are done), then the cut ladder: the weather states first, then the bulletin. The Exchange is built, and the `market` flag stays off until the review queue clears. | 4.1, 4.3 |
| Binance market data is the Exchange's only live source. It can refuse US addresses (HTTP 451), and then the live Exchange has no prices at all. | Test it from the deployed function in Dublin before the class, and use `DEMO_MODE=true` (the recorded replay) if it refuses. | 7.4 |
| At the multiplier of 100 that the code has today, a real move of 0.3% is a 30% game move. The crypto companies are paused for a third of the day and their prices sink toward the floor over days (D017's simulation). | Answered by Nils on 5 Nov, late evening: the multiplier and the pauses go away (real prices, 10x leveraged positions). D017 and L4 change on the Exchange branch. | The note at the top of 7, and 15.1 |
| Gambling look and the law. | Play money, no prizes, labels on every money screen, flags, ask the teacher. | 11 |
| A bad trade leaves a player unable to pay for the case's one building. | The crew needs one building, not one per player. A player who lost their coins still earns 50 per first pin and 200 per deduction before the finale, so 300 coins are within reach. A hard guarantee would be a 300 coin reserve in `market_trade()`, a change to D017 that needs Nils' OK. | 2, 7.3 |
| Delisting Greyfathom removes a route a crew on the case still needs, and D017 forbids removing a company while players may hold shares. | Three other routes to C6 stay open. Delisting needs a change in L4 first (a `delisted` flag and a one-time cash-out), so it is should. | 7.7 |

**Decisions for Nils** are in section 15.1: the replay for the demo if Binance refuses us, and the hard coin reserve. The multiplier question is answered (15.1, point 1). The pools stay switched off until he is sure that play-money bets on real matches are fine for class (decision 18, 8 and 15.1).

## 2. How the open world sits beside the case

Nils decided on 5 Nov that each crew plays its own copy of the case, and that the first solve anywhere relights the coast for everyone. So the world is shared and the case is not.

| Shared by everyone | Per crew |
|---|---|
| The sea, the weather, the driftline, the harbor, the Exchange board, the pools, the duels, the Wall of Lights, the world stage (`dark` until the first solve, then `relit`) | The case: cards, deductions, the finale, NPC partners. Each crew has its own case clock. |

**Seven rules keep the two apart**

1. **The case never needs a loop.** A crew can finish without a single trade, pile or duel.
2. **The case never needs more than 300 coins of your own.** That is one level 1 building (300 coins and 10 timber) for the third light, a signal station on a home islet. The 20 timber starter pack covers the timber. The crew needs one building, not one per player. Paid shortcuts (150 to 250 coins each) are optional. The Exchange has no reserve (D017), so a bad trader can lose their coins. Even then, the case pays them back before the finale: 50 coins for each first pin and 200 for each deduction they take part in, so a player who pins two cards and takes part in D1 holds 300 coins. A pytest test proves it (section 14). If the team wants a hard guarantee, a 300 coin reserve in `market_trade()` would give it, as a D017 change that needs Nils' OK.
3. **NPC partners join no loop.** They have no wallet. They do not trade, stake or duel. A paid errand is charged to the player who gave the order. A crew has no shared wallet either: every wallet belongs to one player.
4. **Spoiler rule.** Nothing in a loop names the culprit before a crew has solved its case. Where a loop touches a clue, it only adds a slower route to a card that the case file owns.
5. **Two clocks.** The world clock (real Lisbon days, real weather, real prices) drives the loops. The story clock (`dark`, then `relit`) changes their settings. A crew's case clock belongs to the case.
6. **Works alone and at different times.** Piles are per player. The Exchange trades against the house. Pools refund when they are one-sided. Duels can be sealed. Only the finale needs people online together, and the finale is not in this file.
7. **Rules in Python, the browser asks.** Each loop is one rules module, one content JSON file and one test file. Coins move only through the wallet function ([docs/ENGINEERING.md](../ENGINEERING.md), section 1).

**Where a loop touches the case**

| Loop | Touch point | Rule |
|---|---|---|
| Home islet | The Signal Station is a home light, and every crew needs one. The Workshop makes the lens for the optional ruin light (should). | Both are level 1: 300 coins and 10 timber each. The starter pack (5.1) covers the timber. |
| Salvage | After a real fog night, one sealed crate lies on your beach. | A slower route to the crate card (C4). The case file owns the card and the route (`C4.beach_crate`). It never counts toward solvability. |
| Weather | On fog nights the false light shows on the shared chart, before the first solve. | A teaser only. The case runs on its own clock and never waits for real fog. |
| Exchange | One unit of Greyfathom Salvage (GREY) opens the shareholder register. | A slower route to C6 (`C6.shareholder_register`), never the only route. |
| Almanac Desk | "Fog tonight?" is a weather question. | No link to the culprit. |
| Duels | The smugglers' ring has preset taunts about "the boss on the water". | Flavour only. The ring moves to the harbor after the Relighting. |
| Football and NBA pools | None, on purpose. | They can be switched off without touching the story. |

## 3. The daily round

A visit takes 10 to 15 minutes. It never requires the case. The bulletin ends with the cheapest next lead for your kit, so a casual player is nudged toward the case and never forced. A player who only wants the case never has to grind.

With the must list alone, the round is about 5 minutes (steps 1, 4 and 5). The driftline adds 5. The other should loops add up to 5 more.

### 3.1 The steps

| # | Step | What you do | Minutes | Tier |
|---|---|---|---|---|
| 1 | Bulletin | Read it: weather tonight, the Exchange state and its feed label, today's notice, your next lead. With the driftline: today's beach. | 1 | must |
| 2 | Sail and collect | Sail to the downwind beach and collect up to 10 piles. | 4 | should |
| 3 | Sell | Sell surplus salvage at the harbor (up to 150 coins a day). | 1 | should |
| 4 | Home | Look at your islet. With the windmill: collect oil and light your signal station. Start an upgrade when you can pay. | 2 | must (oil: should) |
| 5 | Exchange | Open a position in the morning. Look once at lunch. | 2 | must |
| 6 | Extras | One Almanac question, tonight's match, up to 3 orders, one duel. | up to 5 | should |
| | **Total** | | **5, or 10 with the driftline, or up to 15 with all should loops** | |

### 3.2 What resets when

All times are Lisbon time. Lisbon is UTC+0 until the clock change on 28 March 2027, so the whole calendar in section 10 is UTC+0. The code must use the `Europe/Lisbon` zone and never a fixed offset.

```text
00:00  new Lisbon day: caps reset, the day seed is made, piles renew
08:00  bulletin; the Exchange re-bases (a new market day starts)
Mon 00:00  a new harbor week
```

| When | What happens |
|---|---|
| Every day 00:00 | A new game day. Every daily cap goes back to zero, except the Exchange's, which counts market days. The day's seed is made from the date. With the driftline: your piles renew (10, or 15 after a real storm) and the day's beach is fixed from the wind forecast for 08:00. |
| Every day 08:00 | The bulletin is published. The Exchange re-bases: the first look after 08:00 gives every company a new base. The game price stays and only the real starting point moves, so nobody's shares change value. The 2,000 coin buy limit starts again (a market day runs from 08:00). |
| Every Monday 00:00 | A new harbor week. Weekly things reset: the best-return title, the duel cup, the co-op order. |
| Never reset | Wallet, buildings, stored oil, materials, shares, titles. Oil keeps filling. The Exchange does not close and does not cash anyone out. |
| On demand | A pool settles on the first request after its result is final. An Exchange trade fills at the shared price of that moment (a price at most 5 seconds old). |

**What the Exchange re-base puts back.** Two things: the real starting point of each company, and the day's buy limit. The game price stays. It puts back no wallet, no building and no shares. This answers kickoff question 6 in `docs/STATUS.md`.

The bulletin is only the readout. The day's beach and piles exist from 00:00.

### 3.3 No timers

There is no background job. Everything that depends on time is worked out when a player asks, from timestamps and a seed made from the date: oil in the shed, the day's beach, the Exchange re-base, pool settlement. Supabase pauses an idle project after 7 days, and a `crons` entry in `vercel.json` breaks our deploys while we use Vercel Services (D002, update of 5 Nov), so nothing in this file uses a cron. A daily GitHub Actions workflow calls the keep-alive route (`.github/workflows/keepalive.yml`, Nils, 5 Nov; [docs/ARCHITECTURE.md](../ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)). Nothing in this file depends on it.

### 3.4 The bulletin

| Line | Comes from | Tier |
|---|---|---|
| Weather tonight and tomorrow. A fog night says "real" or "by rule". | Weather states (5.4) | must |
| Exchange: any company paused, and the feed label: live, cache, old prices (trading paused) or replay | Exchange state | must |
| Festival or event notice | Calendar (section 10) | must |
| The cheapest next lead for your kit, one line | Your crew's case state | must |
| Today's beach and number of piles. Tomorrow's beach too (the forecast is known a day ahead). | Wind forecast | should |
| Storm warning 24 hours ahead | Forecast | should |
| Today's three orders | Harbor Slate | should |
| Tonight's match and today's questions | Desk | should |
| All of it read out in preset lines by Elena's radio | Content JSON, no AI voice | should |

Everything except the "next lead" line is the same for every player and is cached for the day. The bulletin and the money panels are plain HTML, so they also work on a phone. Their look follows the game (D005: original top-down pixel art, with gold kept for light, interaction and clues; see `frontend/GRAPHICS.md`).

## 4. The loops, the budget and the honest cut

### 4.1 The budget

One package day is about 4 focused hours with a coding agent, the unit of the roadmap. All sizes are guesses.

| Item | Days | Note |
|---|---|---|
| Team capacity, Fri 6 to Wed 18 Nov | 26 | 4 teammates x (8 roadmap days minus 1.5 for kickoff, reviews and checkpoints) |
| Roadmap core, 16 packages, minimum versions | 23 | `ROADMAP.md` v0.3. It is 37 days at full size. It already holds the weather (L1), the islet (L2), the sea chart (G2) and the Relighting and rewards (L3). |
| Island Exchange (L4), minimum version | 2 | Core by Nils' decision of 5 Nov. Built and merged as `d7857d9` (D017), so these days are spent. It is 4 days at full size. |
| A4 live presence, minimum version (proposed) | 1.5 | Core since the late evening of 5 Nov; the size is a proposal |
| **Spare** | **-0.5 on paper** | 26 minus 26.5, as ROADMAP v0.3 says. |
| This file's must extras (table 4.2) | 0.75 | Daily frame 0.5, weather states 0.25. The Board notice after the first solve is text and costs nothing extra. |
| **Left** | **-1.25 on paper** | |

**The honest reading.** On paper there is no slack: the table is 1.25 days short. A slip eats the must extras first, and then the cut ladder (4.3) starts. The roadmap lets L2 and G3 grow back to full size if the M1 check passes. The paper arithmetic still counts G2, G3 and L4 as open work (next paragraph), so the real picture is better. Until the recount frees days, nothing grows before the freeze, so every "should" in this file means "after submission" in practice. An older roadmap draft (v0.1) counted 26 days of core at full size and 17 at minimum size. That was before the story packages S0, S4 and A6 and the Exchange were added. Use the v0.3 numbers.

**G2, G3 and L4 are already done.** Codex built G2 and G3 on Thu 5 Nov, before the capacity window, and they were merged as `60bd60e`. The L4 minimum was merged as `d7857d9`. ROADMAP v0.3 counts G1, G2, G3 and L4 as on `main` and recounts the spare days at the Fri 13 check, so the arithmetic above is the paper arithmetic. When the roadmap owner subtracts G2 and G3, the spare grows by at least 2.5 days (their minimum sizes). Then "If days free up" in 4.3 applies.

**A4 live presence is core since the late evening of 5 Nov** (Nils: "the game needs to be a multiplayer game, so we need to see everyone live"). `ROADMAP.md` carries it as a package of its own, with a proposed size of 1.5 days at minimum size. That is less than the 2.5 days that subtracting G2 and G3 frees, and the roadmap owner confirms the size at the Fri 13 Nov check. The loops in this file need no new days for it.

**Why cut instead of squeeze.** Every rule needs a test, and every teammate must be able to explain every line in the code walkthrough ([docs/ENGINEERING.md](../ENGINEERING.md), section 1). A loop that is half built, or built too fast to be explained, is worse than a loop that is not there.

### 4.2 Every loop, its tier and what is cut

"New days" are on top of the minimum versions in the roadmap packages named in the table. The lane is mostly L (Live Systems). Duels are lane A, the sea chart and the art are lane G.

| # | Loop | Package | Tier | Built for that tier | New days | What is cut or waits, and why |
|---|---|---|---|---|---|---|
| 1 | Daily frame and bulletin | none | must | The Lisbon-day helper, the date seed, daily caps counted from the ledger, a text bulletin (3.4) | 0.5 | Elena's radio voice (should): the text works without it. A presenter page of sources and sinks (should): a saved SQL query does the job first. |
| 2 | Weather states | L1 | must | Fog, storm, rain and calm as one pure function of L1's data, plus the fog-night rule (5.4) | 0.25 | Storm warnings 24 hours ahead (should). |
| 3 | Home islet | L2 | must (minimum) | The signal station plus one other building at level 1, saved per account, and the 20 timber starter pack (5.1) | 0 | The other lines, level 2, windmill oil and decor (should): they are coin sinks that need salvage. Visiting friends (later): A4 live presence is core now, so a visit needs only an islet screen that shows another player's islet. |
| 4 | Sailing | G2 | must (done) | The sea chart with the wind-driven passage, free, as G2 built it (5.2) | 0 | The fog and storm seconds (should). The fast-travel fee is not planned for now (decision 16). Free steering and the sloop (later): a bigger scene than the days allow. |
| 5 | Island Exchange | L4 | must (built) | Seven companies on live Binance prices, the recorded replay in demo mode, and the rules of D017 (7.3) | 0 | The Greyfathom shareholder route, the delisting, the fee that reads the world stage and a weekly title (should, row 7). A CoinGecko backup (later). |
| 6 | The Relighting notice | L3 and this file | must | A Board notice on the first clear night after the first solve (10.2). It is text. | 0 | The beam on the horizon and the lower fee (should, row 14). Festival fireworks and lantern colour (should): small art. Chapter 2 content (later). |
| | **Must total** | | | | **0.75** | |
| 7 | Island Exchange extras | L4 | should 1 | The Greyfathom shareholder route to C6 (7.7), the delisting and the lower fee at the Relighting (both need small changes to D017), a weekly best-return title | 1.0 (a guess) | A CoinGecko backup needs a key that a teammate must create (decision D014). |
| 8 | Driftline and the full islet | L2 | should 2 | Salvage (5.3), the four building lines to level 2, windmill oil | 1.5 (0.5 and 1.0) | Level 3 and decor are only sinks: add them by config later. |
| 9 | Crossings and fast travel | G2 | should 2 | The fog and storm seconds (5.2). The fast-travel fee is not built for now (decision 16); its numbers stay in 5.2 | 0.25 | Free steering (later). |
| 10 | Lantern Duels | A7 | should 3 | Sealed and live duels, friendly and staked, the weekly cup (section 9) | 2.75 | The ranked ladder (later). |
| 11 | Prediction desk | L5 | should 4 | Weather questions first (no new outside source), then a hand-picked Manifold list (8.2). Stays switched off until Nils is sure (decision 18) | 2.5 | The Polymarket backup (later). |
| 12 | Sports predictions | L6 | should 5 | Football first: OpenLigaDB for UEFA nights, football-data.org for the leagues it covers (8.3). Stays switched off until Nils is sure (decision 18) | 2.5 | NBA (later): one source and no second check. |
| 13 | Harbor Slate orders | none | should 6 | 3 orders a day, the weekly co-op order, the pier sweep (5.5) | 1.5 | Until it exists, salvage sales are the safety net for a broke player. |
| 14 | Elena's radio, storm warnings, festival art, the hook beam | none | should 6 | The bulletin in preset lines, the warnings, fireworks, a free lantern colour, and the Chapter 2 beam on the horizon (Story v2 change 13 plants its pattern in Elena's logbook) | 1.5 | No AI voice. |
| | **Should total** | | | | **13.5** | |
| 15 | NBA pools, Polymarket backup | L5, L6 | later | | not sized | NBA has one source and no second check. Polymarket's site has been reported blocked by some Portuguese providers since Jan 2026, and its questions need hand curation. |
| 16 | Collections and Harbor Standing | none | later | | not sized | Ranks need points from the case and from orders. Exchange limits stay flat for everyone. |
| 17 | Storm raids | none (flag `raid`) | later | | not sized | The roadmap puts them later. They reuse the boarding engine, which is also later. |
| 18 | Light Network, Lantern Council, Hoard Auction | none | later | | not sized | They need the Relighting to be live first. |
| 19 | Chapter 2 content | none | later | | not sized | The hook notice is must (row 6), the beam is should (row 14). The chapter is not. |

The should order follows the roadmap's grow order (the Exchange, then the islet, then duels, the desk and sports). Salvage joins the islet because the islet's upgrades need its materials.

### 4.3 The cut ladder

The roadmap's cut rule applies at the M1 check on Fri 13 Nov. If less than 70% of the M0 and M1 packages are merged, every remaining core package stays at its minimum version and no should item starts. For the open world, cut in this order. Stop as soon as the days fit. The hook beam is not on the ladder any more: it is should, so it never started.

| Step | Cut | Frees | What players lose | What stays safe |
|---|---|---|---|---|
| 1 | Weather states and the fog-night rule | 0.25 | The fog-night labels and the false-light teaser | L1's weather on screen. The case runs on its own clock. The Board notice then fires on the third night after the first solve. |
| 2 | The text bulletin | 0.25 | One daily readout | The Exchange panel shows its own status |
| 3 | The Exchange stays behind its flag (`market` is off by default). **Only Nils can decide this**, because he made it core. | 0 | The Exchange in the graded game | The code stays merged and tested. The case keeps three other routes to C6. |

**Never cut:** the Lisbon-day helper and the daily caps. The Exchange needs the day helper for its 08:00 re-base, and the caps guard the economy. After steps 1 and 2 the open world adds only 0.25 days.

**If days free up** (for example when the roadmap counts G2, G3 and L4 as done), add in this order, which follows the roadmap's grow order: the Exchange extras (1.0), then the driftline (0.5), then the full islet (1.0), then Lantern Duels at their minimum size (1.5). With 2.5 free days that is the Exchange extras, the driftline and the full islet.

### 4.4 Order of work

1. The contract pull request (section 13), before the freeze on Mon 9 Nov: the kit coins in `backend/content/entry_kits.json`. The shape of `backend/content/market/companies.json` is already on `main`.
2. The daily frame and its tests. The Lisbon-day helper comes first, because the Exchange needs it for its 08:00 re-base.
3. Weather states (needs the L1 mapping).
4. The minimum islet (needs L2 and the `building_purchase` reason).
5. The Exchange is built (L4, D017, merged as `d7857d9`). What is left is on Nils' review queue: apply its migration, then switch the `market` flag on.
6. The Board notice after the first solve (needs the L3 world stage).
7. The economy simulation test, last, when the numbers exist. Then tune.

Each step is a small pull request. Tests first. Walk through the safety checklist in [docs/ENGINEERING.md](../ENGINEERING.md), section 6, for every loop that moves coins.

## 5. The world loops in detail

### 5.1 Home islet and buildings

Each player has one home islet (their own copy; others see it from the sea). G2 on main draws it with four build plots and a signal station: `plot_1` (cabin), `plot_2` (workshop), `plot_3` (windmill), `plot_4` (greenhouse) and `islet_signal_station`. That is five building types. The cabin is your home. It is free, and in version 1 it has no levels. The other four are building lines that share one price list. Each line has its own spot, so you can build all four. All numbers are in `backend/content/buildings.json`.

| Level | Coins | Materials | Tier |
|---|---|---|---|
| 1 | 300 | 10 timber | must |
| 2 | 900 | 20 timber and 5 rope | should |
| 3 | 2,000 | 10 brass and 5 glass | should |

Four lines to level 3 cost 12,800 coins (4 x 3,200).

| Line | Spot | Level 1 does | Level 2 widens it | Tier |
|---|---|---|---|---|
| Workshop | `plot_2` | Makes the lens for the optional ruin light of the case | Set in `buildings.json` when the islet package starts | should |
| Signal Station | `islet_signal_station` | Your home light and a bearing point. Every crew needs one for the Night of Three Lights. | Also takes bearings on clear nights | must |
| Windmill (the Oil Shed) | `plot_3` | 1 lamp oil every 6 hours, stores 4 | Stores 6 | should |
| Greenhouse | `plot_4` | A garden you can see from the sea. Prestige only. | A bigger garden | should |

**The Boat Shed.** The open-world design had a Boat Shed (a shorter crossing and a gold lantern at night). The art has a greenhouse instead, and so do the skeleton and the roadmap. So the greenhouse it is (15.2). Prices and tests do not change if the team prefers the Boat Shed.

**Starter pack.** Every new player gets 20 timber once, with the entry kit. It is not coins, so it has no ledger row. It is stored with the islet. It lets a player place their first two buildings without waiting for the beach. The case needs only one building for the whole crew: a Signal Station (300 coins and 10 timber), which the kit's 1,000 coins cover. If a crew also builds the Workshop for the optional ruin light, that is 600 coins and 20 timber in all, still covered.

**Oil.** The shed is worked out when you ask, from the time since your last pickup. Skipping a day wastes a little. Visiting five times a day gains nothing. Oil cannot be sold or traded. In daily play 1 oil lights your signal station for a night and draws your gold beam on the shared chart. The case never needs oil: lighting a station in the finale is free. After the solve, oil will fuel the Light Network (later). This lamp oil is not the "duel oil" of Lantern Duels (section 9).

### 5.2 Sailing and fast travel

- **Sailing is free.** G2 on main plays a sea-chart passage of about 4.2 to 6.3 seconds. The real wind sets its speed: more wind, a faster passage. A player can skip it with Enter or Esc. So a crossing lasts about 4 to 6 seconds. Fog and storm may add up to 5 and 10 more seconds (start values, should), so a crossing never lasts more than about 15. The case file uses the same numbers (about 4 to 6 seconds, up to 15 in fog or storm), so its timings still hold.
- **Fast travel** is the chart's free skip today, and it stays free: Nils decided on 5 Nov 2026 that there is no fast-travel fee for now (decision 16). A coin fee only makes sense once crossings are long enough to be worth skipping: with the fog and storm seconds, or with free steering later. The numbers are kept for then, and nothing is built: 25 coins, free for anyone with fewer than 100 coins, and 10 coins after the Relighting. The case never needs it.
- **Later:** free steering with the real wind. A sea chart with about 20 marks that appear only in certain weather: a fog bell in fog, a wreck mast at low tide, a stone cairn on clear nights. A boat upgrade from rowboat to sloop (1,500 coins) with a fog lantern (400).

### 5.3 Salvage: the driftline (should)

- **Per player, no races.** Each Lisbon day you have your own 10 piles at the day's beach. The day after a real storm you have 15.
- **The beach.** At the first request of the day, the server reads the cached wind forecast for 08:00. It picks the beach the wind blows toward from a short list in `salvage.json` (start: four beaches). It never changes that day.
- **The piles.** Each pile gives 2 pieces. The seed is the date plus your player id, so a reload shows the same piles.

| Piece | Sells for | Normal day | The day after a real storm |
|---|---|---|---|
| Timber | 5 | 40% | 30% |
| Rope | 8 | 30% | 20% |
| Glass | 15 | 18% | 25% |
| Brass | 20 | 12% | 25% |

- **What an average day holds.** A normal day gives 20 pieces: 8 timber, 6 rope, 3.6 glass and 2.4 brass. Sold in full they are worth 190 coins, so the 150 coin cap decides. A storm day gives 30 pieces worth about 355. Level 3 needs brass and glass, which come mostly after storms.
- **Selling.** Keep what you need for buildings and sell the rest at the harbor at the fixed prices above. You can sell up to 150 coins a day. Pieces you cannot sell stay in your store. This is the income every player always has.
- **Sealed crate.** On the morning after a real fog night, before the first solve, one extra sealed crate lies on your beach. Inspecting it is a slower route to the crate card (`C4.beach_crate` in the case file). A night that is foggy only by the fog-night rule (5.4) washes up no crate. It never counts toward solvability.
- **Festival.** For 48 hours after the first solve the piles double (20, or 30 after a storm). The sales cap stays 150, so the festival gives materials, not coins.
- **Curios** and collections are later.

### 5.4 Weather states

One tested Python function turns the cached weather values from L1 (`cloudCover`, `rain`, `fog` and `wind`, each 0 to 1) into one state per hour. If several apply, the order is storm, fog, rain, calm. The thresholds are start values in `weather_states.json`: storm if `wind` is 0.8 or more, fog if `fog` is 0.5 or more, rain if `rain` is 0.4 or more.

| State | Effects in the loops |
|---|---|
| Fog | At night the false light shows on the shared chart (before the first solve). After a real fog night, a sealed crate lies on your beach (should). Crossings are slower (should). |
| Storm | The next day has 15 piles with more brass and glass (should). A storm warning goes in the bulletin 24 hours ahead (should). |
| Rain | The Oil Shed makes 1 oil every 4 hours that day (should). |
| Calm and clear | Normal. Later: chart marks can be seen from further. |

**The fog-night rule (must).** A night is a fog night if the night is in the fog state, or if neither of the last two nights was a fog night. So there is a fog night at least every third night, and the teaser never stalls in a sunny week. The bulletin labels it "real" or "by the harbor's almanac". The weather questions on the Desk settle on real fog only.

**Night** means 18:00 to 06:00 (start value).

**The weather place.** It is a setting in content JSON. The roadmap proposes the Faroe Islands with Lisbon as an option (kickoff question 7). The open-world design used Carcavelos, the campus, so the class can check the sky. Nothing here depends on the choice, except how often real fog and storms happen: often in the Faroes, rarely in Lisbon in winter (a guess). With Lisbon, the fog-night rule keeps the teaser alive, and real storm bonuses and sealed crates will be rare (15.2).

### 5.5 Harbor Slate orders (should)

- **Three short orders a day** come from a content list (`orders.json`): deliver 5 timber, carry a parcel to the smugglers' cove, light your station tonight, make one forecast. Each pays 40 to 60 coins. The cap is 3 orders and 150 coins a day.
- **One co-op order each harbor week** is set for the whole harbor, for example "rebuild the north pier". Its target scales with the players who were active in the last 7 days. When it is met the world changes for good (the pier is rebuilt, a stall opens), and everyone who gave at least 5 items is paid 300 coins.
- **The pier sweep** tops a broke player up to 100 coins, once a day.
- **A streak** of 7 days in a row earns a cosmetic. No coins.
- **No link to the case** before the first solve. After the solve, the Lantern Council posts the orders (later).

## 6. The economy in numbers

Play money only. All numbers are start values in JSON, tuned with a simulation test (section 14).

### 6.1 Starting coins per kit

| Kit | Starts at | Coins from `kit_grant` | Starter pack |
|---|---|---|---|
| True Keeper | Lighthouse Isle | 1,000 | 20 timber |
| Witness | The morning ferry | 1,000 | 20 timber |
| Informant | The ferry, with the fisherman's red token | 1,000 | 20 timber |
| Stranger | The ferry | 1,600 (1,000 plus 600) | 20 timber |

A wallet starts at 0 (D004, `STARTING_BALANCE = 0`). The referee (package A3) pays the kit's coins once, as one `kit_grant` row with the fixed ref `kit`. A player who has not finished Act 1 has 0 coins and sees no money panels. Foundation wave 1 paid 1,000 at sign-up with a `starting_grant` row. Wave 2 replaced that, and the 1,000 now arrives with the kit. The Stranger's extra 600 is the drafts' +60 times ten for the 1,000 coin scale. The amounts will live in `backend/content/entry_kits.json` (package A3, D016); until it exists, this table is their source. NPC partners have no wallet.

### 6.2 Where coins come from

Every cap counts today's ledger rows of that reason, where "today" is the Lisbon day.

| Source | Amount | Tier | Ledger reason |
|---|---|---|---|
| Entry kit | 1,000 once (Stranger 1,600) | must | `kit_grant`, ref `kit` |
| First find of a clue card | 50 each, once per card | must | `clue_reward` |
| A solved deduction | 200 per contributor, once per deduction | must | `mystery_reward` |
| The solve share | 400, plus 100 per deduction you were part of, plus 100 for a finale role, at most 800, once per player | must | `mystery_reward` |
| Exchange sales | The units' value at the shared price, minus the 2% fee. Not bounded by one number: see 6.6. On average minus the fees. | must | `market_sell` |
| Salvage sales | Up to 150 a day | should | `cargo_sale` |
| Harbor Slate orders | 3 a day at 40 to 60 each, up to 150 a day. The weekly co-op order pays 300 per giver when met. | should | `event_reward` |
| Pier sweep | Tops a broke player up to 100, once a day | should | `event_reward` |
| Pool and duel payouts | Other players' stakes minus 5%. No new coins. | should | `prediction_payout`, `sports_payout`, `arena_payout` |
| Storm raids | Up to 100 a raid, one raid a day | later | `event_reward` |

A contributor earns between 450 and 2,000 coins from the case, once per player. The formula and a worked example (1,200 coins for a Witness in a crew of four) are in [CASE-FILE.md](CASE-FILE.md), section 13.2.

### 6.3 Where coins go

| Sink | Price | Tier | Ledger reason |
|---|---|---|---|
| Buildings | Level 1: 300 coins and 10 timber. Level 2: 900 coins, 20 timber and 5 rope. Level 3: 2,000 coins, 10 brass and 5 glass. | level 1 must, levels 2 and 3 should | `building_purchase` |
| Decor | 100 to 5,000: paint, flags, figureheads, a gilded weathervane. Prestige only. | should | `building_purchase` |
| Boat gear | Sloop 1,500. Fog lantern 400. | later | `building_purchase` |
| Fast travel | None for now (decision 16). Kept for later: 25, or 10 after the Relighting, free below 100 coins (5.2). | later | `service_fee` (reserved, 13.1) |
| Exchange fee | 2% on every buy and sell, rounded against the player, in its own row. 1% after the Relighting (should: D017 has a fixed 2% today). | must | `market_fee` |
| Pool and duel cut | 5% of the pool. It is simply not paid out. | should | no row |
| Case shortcuts | Optional paid routes, 150 to 250 coins each ([CASE-FILE.md](CASE-FILE.md), section 5). A paid errand of an NPC partner is charged to the player who gave the order. | case | `clue_purchase` |
| After the solve | Beacon upkeep, Hoard Auction bids, donations | later | later reasons |

### 6.4 A day in coins

| Kind of day | Net coins | How |
|---|---|---|
| Reads the bulletin only | 0 | Nothing moves |
| Trades 480 coins at a fair price | about -20 | 2% fee each way |
| Buys the daily limit of 2,000 coins | no fixed bound | The price band and the multiplier decide (6.6, 7.5) |
| An engaged day with the should loops | about +275 | +150 salvage sales, +150 orders, -20 fees on a 480 coin trade, -5 pool cut on 100 staked (fast travel has no fee for now) |

At +275 a day, a level 2 building (900) is about 3 to 4 days of saving and a level 3 building (2,000) about 7 to 8.

### 6.5 The caps in one place

| Cap | Value | How the server checks it |
|---|---|---|
| Salvage sales | 150 coins a day | Sum of today's `cargo_sale` rows |
| Orders | 3 a day, 150 coins a day | The orders table and today's `event_reward` rows |
| Exchange purchases | One purchase is 1 to 500 coins. At most 2,000 coins of shares bought per player per market day (from 08:00 Lisbon). At most 10 trades per player in 30 seconds, counted in memory per server instance. | `market_trades` rows since 08:00, and the trade limiter (D017 rule 5) |
| Desk stakes | 50 per question, 200 a day | Sum of today's `prediction_stake` rows |
| Match stakes | 50 per match, 200 a day, counted apart from the Desk | Sum of today's `sports_stake` rows |
| Duel stakes | 100 per duel, at most 3 staked duels a day against the same opponent | The duels table |
| Kit grant and case rewards | Once per player, once per card, once per deduction | Unique (player, reason, ref) in the ledger |

### 6.6 Does the play money keep its value for weeks?

Mostly, with one open risk. The faucets are small and capped, the drains are large, and prices never move with the money supply. In the must world the only faucets are the kit grant (once), the case rewards (once, 450 to 2,000) and Exchange wins. With the should loops an engaged player earns at most 300 coins a day (150 from salvage, 150 from orders), each source capped per Lisbon day and counted from the ledger. Prices are fixed numbers in JSON. Four building lines to level 3 cost 12,800 coins, about 11 weeks of salvage alone or 6 weeks with orders (the 1,000 coin kit grant counted in). Pools and duels only move coins between players and destroy 5%.

The Exchange is the one place that can create coins, and under D017 its bound is looser than the first design had. At most 2,000 coins of shares can be bought per market day. A price stays between 25% and 400% of its start price, so the most one purchase can win is 15 times the coins spent (buy at the floor, sell at the ceiling) and the most it can lose is 94% of them (buy at the ceiling, sell at the floor). Both are extremes that need a price to cross the whole band. Rounding against the player, the 2% fee, the 10 minute hold and the limit of 10 trades in 30 seconds stop a profit from nothing, but not a profit from foresight, and D017 says so itself: at the default multiplier of 100 prices spend most of their time near the floor, and buying there has a small edge. At a multiplier of 20 to 30 they stay in the middle of the band (D017's simulation), so D017 recommended 20 to 30 for the class (7.6). Nils' later answer drops the multiplier (15.1, point 1).

The 28-day simulation (30 players, four styles) must show a median wallet of 500 to 8,000, nobody above 25,000, and the Exchange and the pools removing coins overall. If it fails, lower the 2,000 coin limit (or, while the multiplier still exists, the multiplier) by pull request. Coins cannot be sent, so extra accounts pass on little (6.7). The must world has the opposite risk, scarcity: with no daily income, a player who spends everything cannot earn more until the driftline arrives. The case is the safety net: it pays 50 coins for each first pin and 200 for each deduction, and a crew needs only one building.

### 6.7 Guards

- **Every money action carries an action id** made once by the browser. It becomes the ledger `ref`, so a double click pays once. The ledger refuses a second row with the same player, reason and ref (409 `already_applied`). A 503 from the wallet means the outcome is unknown: look the ref up before you retry ([docs/ENGINEERING.md](../ENGINEERING.md), recipe 4.1).
- **A broke player is never stuck.** The Exchange has no reserve (D017), so a trader can spend down to zero. Sailing is free, and fast travel has no fee for now (decision 16). The case pays 50 coins for each first pin and 200 for each deduction, before the finale. Once the driftline exists, salvage sells at fixed prices, and once orders exist, the pier sweep tops up to 100.
- **No net-worth leaderboard.** Titles go to best return (at least 5 trades) and to accuracy (at least 10 picks). They never go to the richest player.
- **No coin transfers between players,** no gifts and no trading. One narrow exception, said honestly: a staked duel can move at most 300 coins a day between the same two players (3 duels x 100), minus the 5% cut. A second account can pass on little more than that.
- **The case stays affordable.** Nothing the case needs costs more than 300 coins of your own, and a crew needs that once (rule 2 in section 2).

## 7. The Island Exchange

> **Superseded by decision D017.** The first version of this section (5 Nov, morning) described another design: three to seven companies with their own multipliers, a 5.00 price floor, a daily close at 22:00 with a cash-out, a 300 coin reserve, the live prices from CoinGecko and a special Greyfathom share. The L4 package then built the Exchange with different rules, and [D017](../DECISIONS.md) records them. This section now only restates what the rest of this file depends on. Where this page and D017 differ, D017 and the code (`backend/server/market/`, tested in `backend/server/tests/test_market_*.py`) win.
>
> **Waiting for a change (Nils' answers of 5 Nov, late evening).** He answered the D017 questions after this section was written: no circuit breaker, no price floor or ceiling, and real prices with 10x leveraged positions instead of a multiplier. D017 and L4 change on the Exchange branch. Until they do, the rows below about the multiplier, the floor and ceiling and the circuit breaker, and 7.6, describe the code as built.

### 7.1 What it is

A board of seven fictional island companies. Each follows one real price series and copies its moves, stretched by a multiplier. It is a game, not a market. The board never shows a real price, only the game price and the percentage move. Nobody can buy anything real. The board says "Simulation. Play coins only." and names its price source. It is plain HTML, so it works on a phone, and it sits behind the `market` flag, which is off, and its migration is not applied yet (the review queue on `docs/STATUS.md`). It opens from the `market_hall` hotspot in Saltreach Harbor.

### 7.2 The board

Names are placeholders. They come from `backend/content/market/companies.json`; the name check against published games and real companies is not done yet (15.2).

| Id | Company | Ticker | Follows | Start price | Lowest and highest price |
|---|---|---|---|---|---|
| harbor-trust | Saltreach Harbor Trust | SHT | Bitcoin | 60.00 | 15.00 to 240.00 |
| tidewright-works | Tidewright Works | TIDE | Ether | 40.00 | 10.00 to 160.00 |
| swiftwater-ferries | Swiftwater Ferries | SWFT | Solana | 24.00 | 6.00 to 96.00 |
| pier-post-courier | Pier Post Courier | PIER | XRP | 12.00 | 3.00 to 48.00 |
| market-hall-guild | Market Hall Guild | MHG | BNB | 30.00 | 7.50 to 120.00 |
| two-shores-bureau | Two Shores Change Bureau | TWSH | The euro against the dollar, through the Binance pair EURUSDT | 50.00 | 12.50 to 200.00 |
| greyfathom-salvage | Greyfathom Salvage | GREY | Gold, through the PAXG token | 20.00 | 5.00 to 80.00 |

The Binance pairs are BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, BNBUSDT, EURUSDT and PAXGUSDT. EURUSDT and PAXG are tokens that stand in for the euro and for gold, and the board says so. They all trade day and night, so they move during a class at 11:00. Greyfathom Salvage is a company like the others: it follows gold and has no special rules.

### 7.3 The price rule and the trading rules

```text
game price = base game price x (1 + multiplier x (real price now / real price at the base - 1))
```

The price is rounded to cents. A wallet holds whole coins, so the server rounds every trade against the player: a purchase up, a sale down (`Decimal`, never floats). The rules, as D017 numbers them:

| Rule | Value |
|---|---|
| Multiplier | `MARKET_MULTIPLIER`, a whole number from 20 to 100, default 100. D017 recommends 20 to 30 for the class (7.6). |
| Floor and ceiling | A price never falls below 25% or rises above 400% of the company's start price. A price on the floor or ceiling stays there until the real price has moved back past the base, or until the next re-base. |
| Circuit breaker | A game price 30% away from its base pauses the company for 15 minutes. The price is frozen at the limit, nobody can trade it, and **no shares are sold**. After the pause it restarts from the frozen price. |
| Daily re-base | The first look after 08:00 Lisbon gives every company a new base. The game price stays, so nobody's shares change value. |
| Purchase | Whole units. One purchase is 1 to 500 coins. At most 2,000 coins of shares per player per market day (from 08:00 Lisbon). |
| Sale | Whole units, worth at least 1 coin, with no upper limit. A sale must wait 10 minutes after the player's latest purchase of that company. |
| Fee | 2% on every buy and sell, rounded up, in its own ledger row (`market_fee`). Nils decided on 5 Nov 2026: 2% each way, and 1% after the Relighting (decision 17; the 1% needs L4 to read the world stage). |
| Speed | At most 10 trades per player in 30 seconds (counted in memory per server instance). |
| No reserve, no close | The Exchange keeps no minimum balance in a wallet, closes at no hour, and cashes out nobody. |
| Repeat safety | The ref is `market:<actionUid>`. A repeat answers `409 already_applied`, before any other check. |
| Switched off | The player routes answer `404 feature_off`. The price board works anyway, only looks and saves nothing. |

**Example.** Buying 5 units at 12.00 costs `ceil(5 x 12.00 x 1.02)` = 62 coins: 60 for the units and 2 as the fee (the fee is rounded up). A wallet of 1,000 keeps 938. The roadmap's old L4 example (a wallet of 100, a 3% fee, 38.20 left) could not hold, because a wallet holds whole coins: with a 2% fee and whole coins the same buy leaves 38 (D017). The roadmap's L4 text is fixed (decision 17).

### 7.4 The feed

| Order | Source | Key | Rules |
|---|---|---|---|
| 1 | Binance market data (`data-api.binance.vision`), one request for all seven pairs | None | The board accepts prices up to 60 seconds old, one request a minute per server instance. **A trade accepts only prices at most 5 seconds old** and asks Binance again if its copy is older, so a rush of trades is one request, at most 12 a minute per instance. If Binance is away, the board keeps the last prices marked `stale` and trading pauses (`409 prices_stale`). US addresses can get HTTP 451; our functions run in Dublin (`dub1`, [docs/SETUP.md](../SETUP.md)), so test from the deployed function. Its display terms were not found. |
| 2 | Recorded replay, `backend/content/market/replay.json` | None | 90 minutes of 1-minute closes from Binance Vision (11:00 to 12:29 UTC on 4 Nov 2026), CC BY-NC-SA 4.0, credit "Binance Vision". It plays **only in demo mode** (`DEMO_MODE=true`), never in live mode: the file is public, so a player could read the next prices and trade against them. In demo mode the Exchange never calls Binance. Coins won on demo prices count for nothing real. |
| Not built | CoinGecko Demo API | A key that a teammate must create (D014) | A possible backup. Its key would live only in Vercel, as `MARKET_DATA_API_KEY`, and the screen would say "Powered by CoinGecko". The call arithmetic (10,000 calls a month, about 330 a day) is in `docs/INTERFACES.md`, section 9. |

The screen always says which source is running: live, cache, old prices (trading paused) or replay (demo mode). All servers that share one database must use the same `DEMO_MODE`, because the preview and production projects share one (D017 rule 7).

### 7.5 What the rules mean for the economy

D017 guards the Exchange with these rules: a 25% to 400% price band, a 30% pause, rounding against the player, a 2% fee on both sides, a 10 minute hold, prices at most 5 seconds old for trades, a 2,000 coin daily purchase limit and 10 trades in 30 seconds. What they do not give is a small fixed bound on one day's result, as the first design had (+378 and -302). 6.6 works out what the band allows and why we recommend a lower multiplier. The sources-and-sinks query in section 14 shows the real flows from the first report on Tue 17 Nov.

### 7.6 The multiplier setting

`MARKET_MULTIPLIER` is one number for the whole board, from 20 to 100. D017 played its rules through the recorded minutes of 4 Nov 2026 (`backend/server/tests/test_market_replay_breaker.py` freezes the first two rows) and over several days with the trend taken out:

| Multiplier | Pauses in the 90 minute class slot (BTC, ETH, SOL, XRP, BNB, EUR/USD, gold) | Pauses in a whole day, crypto companies | Gold, EUR/USD | Crypto median price after 10 days |
|---|---|---|---|---|
| 100 (default) | 1, 3, 2, 2, 1, 0, 1 (10 in all) | 31 to 43, paused for 32% to 45% of the day | 12 and 1 | x0.25 to x0.38 of the start price, 2 to 4 of 6 paths on the floor |
| 50 | 1, 1, 1, 1, 0, 0, 0 | 11 to 18 | 3 and 0 | not tabled |
| 20 | none | 3 to 6, paused for 3% to 6% of the day | 1 and 0 | x0.47 to x1.24, none on the floor |

Read it like this: at 100 a crypto company is open for only 18 to 32 minutes between pauses, and a player who must hold shares 10 minutes before selling often cannot sell. **D017 recommends 20 to 30 for the class.** The default stays 100 because Nils asked for it; set `MARKET_MULTIPLIER=25` on Vercel, or change `DEFAULT_MULTIPLIER` in `rules.py`. This was decision 1 in 15.1. Nils answered it on 5 Nov, late evening: the multiplier goes away.

### 7.7 The Greyfathom share

The share that opens a slower route to C6 is one unit of Greyfathom Salvage (GREY), bought like any other company. It follows gold, so its price moves with the gold price, with no special rules.

- **The link to the case.** Holding at least one unit opens the shareholder register, a slower route to C6 (`C6.shareholder_register`). It is never the only route, and the server checks it with the player's position in `market_positions`. The case file says exactly what the register shows.
- **The Relighting (should).** The first design delisted the company at the first solve and cashed every holder out. D017 has no delisting, and its rule for the team is: never remove a company from `companies.json` while players may hold shares, because a company that is not in the file has no price and its shares could never be sold. So delisting needs a change in L4 first: a `delisted` flag, a one-time cash-out of every holder at the last price, and a switch for the world stage. Until it exists, Greyfathom stays listed after the Relighting, the share route to C6 stays open, and nothing else in the case changes. Crews still on the case keep three other routes to C6 anyway: the True Keeper's post room, the paid clerk and the mail boat ([CASE-FILE.md](CASE-FILE.md), section 14.4).
- **Never required.** The share route is a convenience. It never counts toward solvability, and the case works with the `market` flag off ([CASE-FILE.md](CASE-FILE.md), section 5).

## 8. Prediction desk and sports pools

All of this is should or later, behind the `predictions` and `sports` flags, and **the flags stay off until Nils is sure that play-money bets on real matches are fine for class** (his decision 18 of 5 Nov 2026). The look is "forecasting with play coins". There are no odds and no bookmaker links. The roadmap packages are L5 (the desk, at the `prediction_kiosk` hotspot) and L6 (sports, at the `sports_pavilion` hotspot). They share one rules file, `backend/server/game/pools.py`.

### 8.1 Pool rules (the Desk, matches and staked duels)

| Rule | Value |
|---|---|
| Who stakes | Players only. Never NPC partners. |
| Outcomes | 2 or 3 per question |
| Stake limits | 50 coins per question, 200 coins a day on the Desk, and a separate 200 a day on matches |
| Closing | Staking closes before the event window starts. For a match, at kickoff. |
| Payout | Winners share the pool in proportion to their stakes, minus a 5% cut. Whole coins, rounded down. Leftover coins are part of the cut. |
| Refund in full | Nobody picked the winning outcome. Everybody picked the same outcome. The question is void: cancelled, postponed, suspended, abandoned, the source says CANCEL, or the result cannot be read within 24 hours. |
| Settlement | Automatic, on the server. Each payout uses the ref `pool:<id>`, so settling twice changes nothing (8.4). |
| Money created | None. The pool can only shrink. |

### 8.2 The Almanac Desk

| Kind | Example | Source | Settled from | Tier |
|---|---|---|---|---|
| Weather | "Real rain at the weather place tomorrow 12:00 to 14:00?" and "Real fog tonight?" Two a day. | Open-Meteo data the game already has | The hourly values for the finished window, fetched when the pool settles. Each question stores its yes-or-no rule, for example "at least 0.5 mm of rain in the window". | should, first |
| Real questions | A hand-picked list of 20 to 40 Manifold questions in `backend/content/questions.json` | Manifold. No key. 500 requests a minute per address, so our server asks and caches. | `isResolved` is true and 1 hour has passed. YES or NO pays. CANCEL, or any other result, refunds. | should |
| Real questions, backup | The same method | Polymarket Gamma API, the `/events/keyset` list | `closed` is true and the status is resolved. Wait for the final state. | later |

- **Staking closes 1 hour before the window opens** (start value).
- **Show the question and how many players picked each outcome.** Do not show the market's own price.
- **Manifold.** Credit it in text on the page. Its markets are made by users and some are personal or in poor taste, so a human reads every question before it enters `backend/content/questions.json`. Find candidates by topic (technology, science, economics, culture, sports) and add a keyword filter as a second guard: war, kill, dead, die, death, shooting, election. Manifold may cancel or re-resolve a market at any time, which is why the 1 hour wait and the refund on CANCEL exist. No clause grants or forbids showing question text in a public app, so credit it and, for certainty, ask on Manifold's Discord.
- **Polymarket.** Use `/events/keyset`, because the older list is deprecated. The `exclude_tag_id` filter works but still lets poor-taste events through, so curate by hand. Disputes can take 4 to 6 days, and an unknown outcome can pay 50/50, so treat that as a refund. Never link to the site: it is a real-money exchange, and Portuguese providers have been reported to block it since January 2026.
- **Never** politics, elections, wars, deaths or personal questions.

### 8.3 Mainland Matches

Tonight's real match becomes a question: home win, draw or away win after 90 minutes. It uses the same tables and code as the Desk, plus one adapter per source (`backend/server/adapters/fixtures.py`).

| Competition | Main source | Second source | Notes |
|---|---|---|---|
| Champions League, Premier League | football-data.org free plan | OpenLigaDB | Pay when both agree |
| Europa League, Conference League | OpenLigaDB | None free | The football-data.org free plan does not carry them. Wait for the presenter to confirm. |
| Primeira Liga | football-data.org | None | OpenLigaDB has no Primeira Liga. Wait for the presenter to confirm. |
| NBA (later) | balldontlie | None | Games end after midnight in Lisbon. Settle before the 08:00 bulletin. |

| Source | Key | Limits | Rules |
|---|---|---|---|
| football-data.org | Free key by registration, kept only in the Vercel setting `SPORTS_API_KEY`. Its terms forbid keys in open-source repos, and our repo is public. | 10 calls a minute. "Scores delayed" by an amount not stated. | Show "Football data provided by the Football-Data.org API". Use text names, never crests or logos. |
| OpenLigaDB | None | At most one call per 30 to 60 seconds per league during live games, from the server, not per player. Send a descriptive User-Agent. Back off on 429 and 5xx. | The data is ODbL, so credit it. It is typed in by volunteers with no editor and no uptime promise. On 3 and 4 Nov the final results appeared 109 to 119 minutes after kickoff. There are two leagues, `ucl` and `ucl2026`, for the same competition: check which one holds results. |
| balldontlie (later) | Free key, a new setting name when NBA starts | 5 calls a minute | `status_state` is `final` when done. No credit needed. |

**Settle only when the source says the match is finished, and never earlier than 3 hours after kickoff.** Use league games or 90 minute results only, because cup ties add extra time and penalties. Refund on postponed, cancelled, suspended or abandoned. An awarded match is also a refund. An admin "settle by hand" button stays for the demo and uses the same rules.

### 8.4 How settlement works

One function, safe to run twice:

1. Read the final state from the stored fixture or question.
2. Work out the outcome from the final score or the resolution.
3. Pay each winner their share with the ref `pool:<id>`, or refund everyone with the same ref.
4. Mark the pool settled, but only after every payout row exists.

The ledger holds each player, reason and ref once, so a settle that stops halfway is finished by running it again, and nobody is paid twice. It runs on the first request that touches the pool after the result is final, for example when someone opens "My bets". There is no cron safety net: a `crons` entry breaks our deploys under Vercel Services (D002), so settlement waits for the next request, and a presenter can settle by hand. The browser never calls an outside API: the server refreshes fixtures into a table and serves everyone from it. If tests show that a half-paid pool is a real problem, the fallback is one database function that pays all wallets in one transaction (a new migration, [docs/ENGINEERING.md](../ENGINEERING.md), recipe 4.2).

## 9. Lantern Duels

A turn-based duel against another player (roadmap package A7). The server decides every round. It is should, behind the `arena` flag. Before the first solve the ring is the `arena_gate` hotspot in Smugglers' Cove.

| Rule | Value |
|---|---|
| Length | 5 rounds (the minimum version has 3 rounds and no stakes) |
| Moves | Flash, Shade or Mirror, picked in secret |
| Who wins a round | Flash beats Shade. Shade beats Mirror. Mirror beats Flash. The same move is no point for either. |
| Duel oil | Each player starts a duel with 5. Flash costs 2, Mirror costs 1, Shade costs 0. You can pick only a move you can pay for. Duel oil does not refill. It is not the lamp oil of the windmill (5.1). |
| Who wins the duel | More round wins. Equal means a draw and the stakes are returned. |
| Live | Both players online, round by round, with the page asking every 3 seconds |
| Sealed | You send all 5 moves. Your opponent answers within 24 hours. If not, the duel is void and the stake is returned. |
| Friendly | Free. No wallet call at all. |
| Staked | At most 100 coins from each player. The winner takes the pot minus 5%. At most 3 staked duels a day against the same opponent. Stake `arena_stake`, payout and refund `arena_payout`, ref `duel:<id>`. |
| Words | Preset taunts only. No free text. |
| Weekly cup | Counted when the harbor week ends (Monday 00:00): the player with the most duel wins that week, with at least 5 duels played, gets a title, shown in the Monday bulletin. No coins. The ranked ladder is later. |

- **Few players are enough.** A sealed duel needs no one online.
- **Free-tier cost.** A live duel needs about 80 calls. 50 duels a day is about 4,000 calls a day, about 12% of the 1,000,000 free function calls a month on Vercel Hobby. This loop needs no Supabase Realtime, and WebSockets on Vercel Functions are not used (Beta, and a connection closes after 300 seconds on Hobby). A4 live presence (core since the late evening of 5 Nov) does use Realtime, in its own small rooms, but a duel does not depend on it.
- **Before the solve** the ring's crew has preset taunts about "the boss on the water". **After the solve** the ring moves to the harbor as the Keepers' Ring.

## 10. The key-event calendar

Times are Lisbon time, which is UTC+0 for the whole calendar. Every day at 08:00 there is a bulletin. Harbor weeks start on Mon 16, 23 and 30 Nov and Mon 7 and 14 Dec. The tier says what is needed for the event to run. If the cut ladder (4.3) removed a loop, drop its rows.

### 10.1 Fixed dates

| Date | What happens | Loops | Tier |
|---|---|---|---|
| Mon 9 Nov | Contracts freeze (D009). The kit coins in `backend/content/entry_kits.json` are in the contract pull request before it (section 13). The Exchange's `backend/content/market/companies.json` is already on `main`. | all | must |
| Tue 10 Nov | Backbone go/no-go (D010). | all | must |
| Fri 13 Nov | M1 check. If less than 70% of the M0 and M1 packages are merged, apply the cut ladder (4.3). | all | must |
| Mon 16 Nov | **Day 1, a target.** The first bulletin runs at 08:00 and the Exchange re-bases, on whatever is merged. The team plays the daily round from now on. One server setting keeps the relight switch locked until the game opens, so the team's own test solves cannot relight the real coast, and rehearsals use the `?demo=1` tour (decision 19). | daily frame, Exchange | must |
| Tue 17 Nov | The first economy report. The sources-and-sinks query (sums of ledger changes by reason per day) is read for the first time. Numbers may still change by pull request. | economy | must |
| Wed 18 Nov | Freeze at 18:00 (M2). Economy numbers are frozen. Only fixes after this. | all | must |
| Thu 19 to Sun 22 Nov | Explain-back drills (Thu and Sat), dress rehearsal of the highlights demo (Fri), final rehearsal (Sun). No new loops. | all | must |
| Mon 23 Nov | Submission (target 18:00, deadline 23:59). From now, should items may start, in the order of table 4.2. | | |
| Tue 24 Nov | One possible class demo (assumed slot 11:00 to 12:30 Lisbon, which is 12:00 to 13:30 CET; the course has not published the slot). The crypto-linked prices move in the slot, as they did at this time of day on 5 Nov. Champions League matchday 5 starts that evening, after class (9 matches). | Exchange, matches | must, should |
| Wed 25 Nov | Champions League matchday 5, second night (9 matches). | matches | should |
| Thu 26 Nov | Europa League and Conference League night (18 matches each, OpenLigaDB only). | matches | should |
| Fri 4 Dec | The other possible demo date. There are no UEFA matches from 27 Nov to 6 Dec, so a settled football pool that morning would need a league match the evening before. The NBA plays almost every night. It is 11 days since submission, longer than the 7 day pause window, so open the Supabase dashboard on Thu 3 Dec. | Exchange | must |
| Tue 8 to Thu 10 Dec | The next UEFA match nights are expected here. Not checked: read the OpenLigaDB schedule on Fri 4 Dec. | matches | should |
| Mon 14 Dec | **Season 1 review.** Read the four-week sources-and-sinks report and retune by pull request. | economy | must |

The demo is very short and shows highlights only, not a live first solve (Nils' decision 4). Facts the open world can give the demo script:

- The Exchange can be shown live if its migration is applied, the `market` flag is on and Binance answers from the deployed function, because the crypto-linked prices moved in the slot. Otherwise run it in demo mode (`DEMO_MODE=true`), which plays the labelled replay of the class slot, 11:00 to 12:29 UTC on 4 Nov, and say so on screen. Set `MARKET_MULTIPLIER` before the demo (7.6).
- A football pool is unlikely to be shown settled in the slot. On 24 Nov the Champions League games kick off after class, and on 4 Dec there are no UEFA games in the days before. Bets must be placed the evening before to show a settlement. A weather question or a duel is easier to show.
- The phone class join is dropped (decision 4). The money panels are plain HTML, so a classmate who has signed in with GitHub can still open them on a phone.

### 10.2 Events that depend on weather or players

| Event | Trigger | The bulletin says | What happens | Tier |
|---|---|---|---|---|
| Daily bulletin | Every day 08:00 | The lines of 3.4 | Published, and cached for the day | must |
| Fog night | Real fog tonight, or the fog-night rule (5.4) | "Fog tonight. The false light is out." | Before the first solve the false light shows on the shared chart. After a real fog night, a sealed crate lies on your beach (should), and crossings are slower (should). After the first solve fog is only weather. | must (teaser), should (the rest) |
| Storm warning | The forecast shows a storm tomorrow | "Storm tomorrow", 24 hours ahead | The warning is should. The richer driftline the next day comes with the driftline (should). | should |
| Match night | A fixture in the list | "Tonight: Home against Away. Stake until kickoff." | The pool opens, closes at kickoff and settles after the final whistle (8.3) | should |
| Weekly duel cup | Monday 00:00 | "The cup is counted." | The player with the most duel wins in the harbor week (at least 5 duels) gets a title. No coins. | should |
| First solve (day S) | The first accepted accusation by any crew in the live world | "The coast is relit." The Relighting plays for everyone the next time they load the game. | Lights come on across the chart, the false light is gone, the fog bank lifts, Gull's Rest opens as a small diorama. The browser reads the world stage and calls `world.setRelightingComplete(true)`. Fees drop: Exchange 2% to 1% (should: D017 has a fixed 2% today). Fast travel has no fee for now (decision 16). Greyfathom is delisted (should: it needs a change in L4, 7.7). | must (the notice and the lights), should (the rest) |
| Relighting Festival | From S to S + 48 hours | "The coast is relit. Festival for two days." | Fireworks at night and a free lantern colour (should). Double driftline piles (with the driftline). The sales cap stays 150. | should |
| Chapter 2 hook | The first night in the calm and clear state after S. If there is none by the third night after S, the rule fires it. | "A light where no light was." | A Board notice asks the question. It is for everyone, and without the logbook pattern it describes the flashes in words. A new beam far beyond the old fog line, in a pattern found in Elena's logbook, follows with the beam package. The red boat sails toward it. The jail scene with the culprit is for crews that solved their case. | must (the Board notice), should (the beam), later (the chapter) |

**Day S is not a date.** The live world's first solve stays open for players (decision 4 of the skeleton round). The team does not relight the live coast before the demo (decision 19, approved by Nils on 5 Nov 2026). One server setting, the relight lock, keeps the switch locked until the game opens, so the team's own test solves cannot use the first solve up. There is no separate demo world for now (Nils, late evening of 5 Nov: "maybe we add later, for now we just build the game"): rehearsals use the `?demo=1` tour, which runs on the browser-side stand-in and never touches the live world. If nobody has solved by mid-December, nothing breaks: the world stays dark and every loop keeps its pre-solve settings.

**The beam needs a pattern in Elena's logbook, and Story v2 plants it.** Change 13 in [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) adds a note at the desk, after reading the log: a lamp and a row of long and short flashes, with a question mark. Nils approved it on 5 Nov 2026 (decision 3). The beam is should, so the beam itself is not part of 23 Nov, and the Board notice describes the pattern in words.

### 10.3 What changes in the loops after the first solve

The Relighting is a change of state, not an ending. Homes, wallets and buildings carry over. Nothing is reset.

| Loop | Before the first solve | After the first solve |
|---|---|---|
| Fog nights | The false light shows on the shared chart. After a real fog night a sealed crate lies on the beach (should). | Fog is only weather. No false light and no sealed crates. |
| Exchange | Fee 2%. Greyfathom is listed. | Fee 1% (should). Greyfathom is delisted (should). |
| Fast travel | No fee for now (decision 16) | No fee for now |
| Salvage | 10 piles, or 15 after a storm (should) | The same, doubled for 48 hours. Gull's Rest gets its own driftline (should). |
| Duels | The ring sits in the smugglers' cove (should) | The ring moves to the harbor as the Keepers' Ring |
| New players | Start with Act 1 and their own case | The same, in a relit world, with the same kit grant |
| Later | | Light Network, Lantern Council, Hoard Auction, storm raids, Chapter 2 content |

## 11. Play-money rules

These rules hold for every loop. They answer the gambling look of a graded demo. This is a policy reading and not legal advice.

| Rule | In the game |
|---|---|
| No buying coins | There is no payment code anywhere. Coins come only from the ledger reasons in 13.1. |
| No cash-out | Nothing converts coins into money, vouchers or gifts. |
| No real prizes | Titles and cosmetics only. No coffee, no voucher, not even a small one. |
| No coin transfers | No gifts and no trading between players. 6.7 names the one narrow exception, staked duels. |
| Labels on every money screen | "Play money. No cash value. It cannot be bought or cashed out." The Exchange adds "Simulation: prices are copied from real markets, then stretched." The Desk and the matches say "Forecasting with play coins." |
| No real prices on screen | Only the game price and the percentage move. No link to any exchange or betting site. No bookmaker odds. |
| Topic allow-list | No politics, elections, war, death or personal questions. |
| Limits | Stake caps, the daily purchase limit and the trade speed limit, and no net-worth leaderboard (6.5, 6.7). |
| Switches | The flags `market`, `predictions`, `sports` and `arena` are off by default and can be switched off again before the demo. `predictions` and `sports` stay off until Nils is sure (decision 18). |
| Credits | "Replay data: Binance Vision, CC BY-NC-SA 4.0" in the replay file header and on the REPLAY label, and the price source on the live board. "Powered by CoinGecko" only if CoinGecko is ever added. "Football data provided by the Football-Data.org API". "Match data: OpenLigaDB (ODbL)". A text credit for Manifold. "Weather data by Open-Meteo.com". |

**Why these rules.** Portugal's online gambling rules (Decree-Law 66/2015, article 4) define a game of chance and a sports bet by an amount of money at stake. A pool paid out among winners looks like the "aposta mútua" wording in the same article. The EU directives also carve out gambling that has a stake with monetary value. The research found no official statement about coins that cannot be bought or cashed out, so that point is unverified. The older Lei do Jogo covers raffles and contests that give prizes with economic value, which is why there are no prizes. Supabase's acceptable use policy lists facilitating unregulated gambling among illegal trade, and Vercel Hobby is for non-commercial use only, so there are no payments and no ads. Play money, no prizes and clear labels keep us outside these rules. Say so in the README. **The pools stay switched off until Nils is sure** (decision 18). Asking the module teacher is one way to become sure (15.1).

## 12. Free-tier limits and sources we do not use

### 12.1 Limits that shape the open world

| Limit | Number | What we do |
|---|---|---|
| Vercel Hobby cron | Not usable. A `crons` entry in `vercel.json` breaks our deploys while we use Services (D002). | No timers. Everything is worked out on request. |
| Vercel function calls | 1,000,000 a month. Over the limit the project is paused for up to 30 days. | Poll slowly and stop when idle (7.4, 9). Never leave a loop polling an API ([docs/SETUP.md](../SETUP.md)). |
| Binance market data | 6,000 weight a minute per address; the Exchange's one request costs 4 | A 60 second cache per server instance, and 5 seconds for a trade (7.4). CoinGecko Demo (10,000 calls a month) is not built. |
| Supabase Realtime Free | 200 connections, 100 messages a second, 2 million a month. Every delivered copy counts. | No Realtime for the Exchange, the Desk or duels. A4 live presence (core since the late evening of 5 Nov) does use it, in small rooms (one per crew, one per place, as [ROADMAP.md](../../ROADMAP.md) A4 says), with positions sent only while a player moves and at most 2 updates a second per player. The limits are in [docs/INTERFACES.md](../INTERFACES.md), section 7. |
| Supabase pausing | After 7 days of low activity | `GET /api/keepalive` reads a few rows, and a daily GitHub Actions workflow calls it (`.github/workflows/keepalive.yml`, Nils, 5 Nov). Open the dashboard in demo week. |
| Supabase Auth, one Wi-Fi address | Sign-ins are counted per address (30 per 5 minutes, anonymous sign-ins 30 per hour) | Not an open-world issue. The phone class join is dropped, and anonymous sign-in stays off ([supabase/README.md](../../supabase/README.md)). |

The limits of the data sources are in 7.4 (CoinGecko, Binance) and 8.2 and 8.3 (Manifold, football-data.org, OpenLigaDB, balldontlie).

### 12.2 Sources we checked and do not use

| Source | Why not |
|---|---|
| Kalshi | Its developer agreement limits API use to a member's own trading and bans caching or sharing the data |
| Metaculus | Needs a token, and hides probabilities and resolutions for ordinary accounts |
| ESPN unofficial endpoints | No published terms, and Disney's terms bar automated access. Fine for a hand check during development only. |
| TheSportsDB free, API-Football free | Demo-sized, or could not be read, or the free plan seems to skip the current season |
| Coinbase market data | Its terms bar apps for end users |
| Twelve Data, Finnhub, Alpha Vantage, FMP, Massive, Marketstack, EODHD | European shares need paid plans, or the free plans bar showing the data to others, or the call limits are far too low |
| Frankfurter and the ECB rates | One fixing a day, so nothing moves in the class slot |
| Pyth Hermes, Stooq | A key is needed, or the site blocks servers |

Facts about sources were checked on 5 Nov 2026. A limit can change, so read the live page before you rely on one.

## 13. Contracts to add before the freeze

One contract pull request before the freeze on Mon 9 Nov. Follow "Changing the database later" in [supabase/README.md](../../supabase/README.md) and recipes 4.2 and 4.7 of `docs/ENGINEERING.md` on `main`. Write a decision-log entry for the economy numbers; the next free number is the one after D018 (D018 records the story round). The Exchange's numbers are already in D017.

### 13.1 Ledger reasons

`main` has eleven reasons: the first eight from wave 2 (D004) are `kit_grant`, `clue_reward`, `mystery_reward`, `event_reward`, `cargo_sale` (all earn), `clue_purchase`, `building_purchase` (both spend) and `admin_adjust` (either way), and L4 added `market_buy` (spend), `market_sell` (earn) and `market_fee` (spend) (D017). A package adds its own reasons in its own migration, at the end of `WALLET_REASONS`, in the same pull request. Never rename a reason or change its direction. Write the description without an apostrophe.

| Loop | Reason | Direction | The ref looks like | Status |
|---|---|---|---|---|
| Entry kit | `kit_grant` | earn | `kit` | on main |
| A clue found | `clue_reward` | earn | `false_light:card:C1` | on main |
| A deduction, the solve share | `mystery_reward` | earn | `false_light:deduction:D1`, `false_light:solve` | on main |
| Paid case routes | `clue_purchase` | spend | `false_light:<crew>:buy:<card>` | on main |
| Buildings, decor, boat gear | `building_purchase` | spend | `build:<line>:<level>` | on main |
| Salvage sales | `cargo_sale` | earn | `sale:<action id>` | on main |
| Orders, pier sweep, raids | `event_reward` | earn | `order:<day>:<n>` | on main |
| Fast travel | `service_fee` | spend | `travel:<action id>` | reserved; no fee for now (decision 16) |
| Exchange | `market_buy`, `market_sell`, `market_fee` | spend, earn, spend | `market:<actionUid>` | on main (L4, D017; its migration is not applied yet) |
| Desk | `prediction_stake`, `prediction_payout` | spend, earn | `stake:<id>`, `pool:<id>` | with L5 |
| Matches | `sports_stake`, `sports_payout` | spend, earn | `stake:<id>`, `pool:<id>` | with L6 |
| Duels | `arena_stake`, `arena_payout` | spend, earn | `duel:<id>` | with A7 |
| Later | `upkeep` (spend), `dividend` (earn), `auction_bid` (spend), `auction_refund` (earn), `fund_donation` (spend) | | | later |

The Stranger's extra 600 coins are not a separate row: the whole 1,600 is one `kit_grant` row. This table closes the open point about wallet reasons in [CASE-FILE.md](CASE-FILE.md) (section 19, point 1) and in [NPC-PARTNERS.md](NPC-PARTNERS.md) (section 11): paid case routes use `clue_purchase`, and `service_fee` is only for fast travel. The Exchange fee has its own row, `market_fee`, written in the same atomic call as the trade by `market_trade()` (D017 rule 8). The pool and duel cut is simply not paid out, so it needs no row, and each action stays one atomic call.

### 13.2 Flags and settings

- **No new flag for the must list.** The Exchange uses `market`, the Desk `predictions`, matches `sports`, duels `arena` and raids `raid`. Add `orders` when the Slate starts.
- **Setting names**, names only, values only in Vercel and never in the repo or a `VITE_` variable: `MARKET_MULTIPLIER` (a whole number from 20 to 100, a plain number with no secret; it goes away with the Exchange rework, 15.1 point 1), `DEMO_MODE`, `RELIGHT_OPEN` (a proposed name for the relight lock of decision 19: off by default, so the world stays dark until the game opens; whoever builds L3 adds it to `.env.example`), `MARKET_DATA_API_KEY` (a possible CoinGecko Demo key; the Exchange does not use it) and `SPORTS_API_KEY` (football-data.org). The last two are already listed, commented out, in `.env.example`. Add a third key for balldontlie when NBA starts. Decision D014 (reserved) records who creates each free account. An agent never signs up for a service.

### 13.3 One module, one JSON, one test per loop

Rules modules are in `backend/server/game/`, adapters in `backend/server/adapters/`, tests in `backend/server/tests/` and content in `backend/content/` (D016). The Exchange is the exception: L4 built it as a package of its own, `backend/server/market/`.

| Loop | Rules module | Content file | Test file | Flag |
|---|---|---|---|---|
| Daily frame and bulletin | `daily.py` | `bulletin.json` | `test_daily.py` | none |
| Weather states | `weather_states.py` (next to L1's `weather_map.py`) | `weather_states.json` | `test_weather_states.py` | none |
| Home islet | `building.py` (L2) | `buildings.json` | `test_building.py` | none |
| Salvage | `salvage.py` | `salvage.json` | `test_salvage.py` | none |
| Exchange | `backend/server/market/` (L4: `rules.py`, `exchange.py`, `trade_rules.py`, `limits.py`, `store.py`, `companies.py`) | `market/companies.json` | `test_market_rules.py`, `test_market_trade_rules.py`, `test_market_limits.py` and others | `market` |
| Market feed | `backend/server/market/feed.py` (L4) | `market/replay.json` | `test_market_feed.py`, `test_market_replay_breaker.py` | `market` |
| Pools | `pools.py` (L5 and L6) | `questions.json` | `test_pools.py` | `predictions`, `sports` |
| Fixtures feed | `fixtures.py` (L6, an adapter) | none | `test_adapters_fixtures.py` | `sports` |
| Duels | `duel.py` (A7) | `duel.json` | `test_duel.py` | `arena` |
| Orders | `orders.py` | `orders.json` | `test_orders.py` | `orders` |

The shape of `backend/content/market/companies.json` is built (D017). Each company has an `id`, a `name`, a `ticker`, what it `follows`, its Binance `symbol`, a `startPrice` from 4.00 to 125.00 and a `tagline`; the format is in `backend/content/market/README.md`. The rule numbers (the multiplier limits, the 25% floor, the 400% ceiling, the 30% breaker, the 15 minute pause, the 08:00 re-base, the fee and the purchase limits) are named constants in `backend/server/market/`, each with a test, and are not repeated here.

```json
{
  "id": "harbor-trust", "name": "Saltreach Harbor Trust", "ticker": "SHT",
  "follows": "BTC", "symbol": "BTCUSDT", "startPrice": 60.00,
  "tagline": "The old harbor bank. When it moves, the whole market feels it."
}
```

## 14. Tests that prove it

All use fakes, fixed seeds and a fake clock. None uses the network. Names are suggestions. The Exchange rules are not in this table: the L4 package tested them itself, in `backend/server/tests/test_market_*.py` (rules, trade rounding, limits, the replay breaker, the feed, the store and the routes), against D017.

| Test | What it proves |
|---|---|
| `test_kit_grants_are_1000_and_1600_once` | 1,000 for three kits, 1,600 for the Stranger, once, with the ref `kit` |
| `test_case_items_cost_at_most_300_of_your_own` | The case needs at most one level 1 building (300 coins) for every kit mix |
| `test_case_rewards_alone_pay_for_the_third_light` | A player with 0 coins who pins C1 and C3 and takes part in D1 holds 300 coins, so a trader who lost everything can still build |
| `test_caps_reset_at_lisbon_midnight` | Every daily cap resets at 00:00 Lisbon, also around the March clock change |
| `test_bulletin_is_the_same_for_everyone_except_the_next_lead` | One cached bulletin per day, and only the next-lead line differs by player |
| `test_fog_night_at_least_every_third_night` | Two nights without fog are always followed by a fog night, so the teaser never stalls |
| `test_hook_fires_on_first_clear_night_or_the_third_night` | The Chapter 2 Board notice fires once, after the first solve |
| `test_shareholder_route_needs_a_greyfathom_unit` | A player holding at least one GREY unit opens `C6.shareholder_register`; a player with none is refused (should, with the Exchange extras) |
| `test_salvage_cap_150_and_free_for_broke` | Sales stop at 150. A player with 0 coins can still earn and sail. |
| `test_fast_travel_free_below_100` | Not written while there is no fee (decision 16). For later: 25 coins at 100 or more, free below, 10 after the Relighting |
| `test_pool_never_creates_coins` | Payouts add up to at most the stakes |
| `test_pool_refunds` | One-sided, no winner, void, postponed: everyone is refunded |
| `test_settle_twice_pays_once` | Running settle again, even after a half-finished run, pays each winner once |
| `test_duel_rules` | Beats, duel oil costs, only affordable moves, draw refund, sealed timeout refund |
| `test_economy_simulation` | 30 players, 28 days, four styles: median 500 to 8,000, nobody above 25,000, the Exchange and the pools remove coins overall |
| `test_content_numbers_come_from_json` | No price, cap or fee is hard-coded in a rules module |

Run `uv run pytest` and `uv run ruff check .` in `backend/` before every push.

**The tuning tool for the first weeks** is one saved query that sums ledger changes by reason per day, sources against sinks. A presenter-only page for it is should. One person owns tuning, and numbers change only by pull request.

```sql
-- Sources and sinks by reason, per Lisbon day. Read-only. Run it in the Supabase SQL editor.
select (created_at at time zone 'Europe/Lisbon')::date as day,
       reason,
       sum(delta) filter (where delta > 0) as coins_in,
       sum(delta) filter (where delta < 0) as coins_out
from public.wallet_transactions
group by 1, 2
order by 1, 2;
```

## 15. Open points and decisions

### 15.1 Decisions for Nils

| # | Question | Recommendation | Why |
|---|---|---|---|
| 1 | **Answered by Nils on 5 Nov 2026, late evening:** there is no multiplier to choose. The Exchange shows real prices with 10x leveraged positions, and has no circuit breaker, no floor and no ceiling. D017 and L4 change on the Exchange branch. | Closed. Nothing to set on Vercel. 7.3 to 7.6 describe the code as built until that change lands. | The old question was which `MARKET_MULTIPLIER` the class should play with (D017 built the range 20 to 100 and a default of 100, as Nils asked). His answer removes the multiplier and the pauses. |
| 2 | If Binance refuses our deployed function (HTTP 451) or does not answer by the freeze on Wed 18 Nov, may the graded game run the Exchange in demo mode, on the labelled replay? | Yes. Do not delay the freeze for the feed. Say so in the README and show the replay in the demo. | `DEMO_MODE=true` plays the 90 minutes of 4 Nov on the screen, labelled, and never calls Binance. It is the fallback D017 and `docs/INTERFACES.md` already name. A CoinGecko backup needs a teammate to create a key first (D014). |
| 3 | **Decided on 5 Nov 2026 (decision 18):** the prediction desk and the sports pools stay switched off until Nils is sure that play-money bets on real matches are fine for class. | Keep the flags `predictions` and `sports` off. Asking the module teacher is one way for Nils to become sure, and it is his call whether and when. | The research found no official statement about coins that cannot be cashed out. Asking is cheap. |
| 4 | Should the Exchange get a hard guarantee that a trader keeps 300 coins for the case's building (a 300 coin reserve in `market_trade()`)? | No for now. The case already pays 50 coins per first pin and 200 per deduction before the finale, and a crew needs one building, not one per player. Add the reserve only if the first economy report shows broke players. | A reserve is a change to D017's rules and its database function, and it needs Nils' OK. |

### 15.2 Open points for the team

| # | Point | Who | Before |
|---|---|---|---|
| 1 | Weather place: the Faroe Islands (the roadmap's proposal, kickoff question 7) or Carcavelos (this design). Lean: Carcavelos, because the class can check the sky. The fog-night rule keeps the teaser coming. Real storms and sealed crates will be rare. | Team | Before L1 ships |
| 2 | Building lines: G2 draws a cabin, a workshop, a windmill, a greenhouse and a signal station (five types). This file makes the cabin free and level-less and prices the other four. The Boat Shed of the open-world design is dropped. Confirm in the L2 spec. | Team | The islet package starts |
| 3 | A CoinGecko backup (not built): one teammate creates the free Demo key and puts it only in Vercel, reads sections 4.4, 6.1 and 6.2 of CoinGecko's API terms on the live page, and asks whether amplified prices count as derived data. Who creates the free accounts is kickoff question 3 (D014). | Lane L | A backup pull request, if ever |
| 4 | Test Binance market data from the deployed function in Dublin. If it answers 451, use demo mode for the demo. Someone also reads the Binance terms in a normal browser. | Lane L | The Exchange launch |
| 5 | Register the free football-data.org key and measure the real score delay on one match night | Lane L | Football pools start |
| 6 | Check whether Supabase Cron exists on the Free plan. If not, settle pools only on request, which is the plan anyway (8.4). | Lane A | Pools start |
| 7 | Delisting Greyfathom at the first solve needs a change in L4 (7.7). Until then it stays listed, and [CASE-FILE.md](CASE-FILE.md) section 14.4 says crews still on the case keep three routes to C6 anyway. The case package confirms it in the linter. | Case package, L4 owner | The freeze |
| 8 | Confirm the 20 timber starter pack and the crossing times (G2 measured 4.2 to 6.3 seconds; fog and storm may add more) against the case timings. [CASE-FILE.md](CASE-FILE.md) section 15.2 now uses about 4 to 6 seconds, up to 15 in fog or storm. | Case package | The freeze |
| 9 | Final name check for every place and company in this file, against published games and real companies. Only a shallow web search was done (7.2). | Nils | The demo |
| 10 | Pick the demo date (Tue 24 Nov or Fri 4 Dec), the slot and the format. The course has not published them. | Team | Mon 16 Nov |
| 11 | One list of ledger reasons across main, the case file, the NPC partner file and this file: closed. 13.1 matches main (eleven reasons, D017). | Lane A | Closed |
| 12 | The Chapter 2 hook beam needs a pattern in Elena's logbook. Done: Story v2 change 13 plants it (Nils approved it on 5 Nov 2026, decision 3). The Board notice does not need it. | Nils | Closed |
| 13 | The roadmap's L4 text said a 3% fee and an example that leaves 38.20 from 100: closed by D017, which built 2% and whole coins (the same buy leaves 38). Done: the roadmap's L4 text is fixed (decision 17). | Roadmap owner | Closed |
| 14 | Tuning data for the Exchange (7 days, 28 if we can, of 5-minute closes from Binance Vision, credit in each header, a small script in `backend/tools/`): the 90 minute replay is built, a longer series is not. | Lane L | The first economy report |
| 15 | The 300 coin reserve of the first design is not built: see decision 4 in 15.1. | Nils | Closed unless the economy report says otherwise |
| 16 | Does the team want the coast relit before the demo? **Decided on 5 Nov 2026: no (decision 19).** The relight switch stays locked by one server setting until the game opens, and rehearsals use the `?demo=1` tour. There is no separate demo world for now. | Nils | Closed |
| 17 | Keep or drop the fast-travel fee. **Decided on 5 Nov 2026 (decision 16): no fee for now.** G2's chart skip is free, and the numbers are kept in 5.2. | Nils | Closed |
| 18 | The roadmap's L2 text said 3 plots. G2 on main draws 4 plots and a signal station. This file follows G2. Done: the roadmap's L2 text is fixed. The L2 spec still follows G2. | L2 spec author | The L2 spec |
| 19 | G2, G3 and L4 are merged but the roadmap still counts them as open work. Recount the spare days (4.1). | Roadmap owner | The Fri 13 Nov check |
| 20 | The Exchange extras (7.7, 6.3): the Greyfathom holding check, the delisting and the fee that reads the world stage are small changes to L4 and D017. | L4 owner | After submission |

### 15.3 What is not verified

- The 120 minute and 150 minute case timings, all package-day sizes and the new-day sizes in 4.2 are guesses. The simulated run is [TIMING.md](TIMING.md); a human playtest is still owed.
- Binance's display terms were not found, and the board has not been tested from the deployed function.
- Manifold has no clause that grants or forbids public display of question text.
- The football-data.org score delay is not stated.
- No official statement exists about coins that cannot be cashed out.
- Every pile chance, price and cap outside the Exchange is a start value until the simulation says otherwise. The Exchange's multiplier table (7.6) comes from D017's simulation of the recorded minutes of 4 Nov, not from a long history.
- How often real fog and storms happen at the chosen weather place in November and December.
- UEFA dates after 26 Nov: only OpenLigaDB's lists were read.
- Binance from a Dublin function and Supabase Cron on the Free plan.
- Whether the Vercel Python runtime has time zone data for `Europe/Lisbon`. If not, add the `tzdata` package. (The Exchange falls back to UTC, which is the same hour from the end of October to the end of March.)
- The company names: only a shallow web search was done.

### 15.4 Where the numbers come from

- **Loops, caps, prices and fees outside the Exchange:** the open-world design of 5 Nov, moved to the 1,000 coin kit scale of D004.
- **The Exchange, its limits and its multiplier table:** D017 and the code on `main` (`backend/server/market/`). The first design's Exchange numbers are gone. Nils' answers of 5 Nov, late evening, replace the multiplier and the pauses (15.1, point 1); the table in 7.6 describes the code as built.
- **Kits, rewards, the Relighting and the key events:** the approved story skeleton (v1), Nils' five decisions of 5 Nov (D013), the 19 decisions of the approval sheet and the two scope decisions of that evening (D018), and [CASE-FILE.md](CASE-FILE.md).
- **Data sources, limits and terms:** three read-only checks on 5 Nov 2026 (market data, predictions and sports, hosting platform). A point that rests on a summary tool is marked unverified above.
- **Package days, dates and the cut rule:** `ROADMAP.md` v0.3.
- **The wallet, its reasons and crews:** D004, D012, D017, `docs/INTERFACES.md` and [supabase/README.md](../../supabase/README.md) on `main`.
- **New in this file, so proposals:** the cabin rule, the starter pack of 20 timber, the pile chances, the fog and storm seconds, windmill level 2 and the weekly cup rule. Where the case depends on one, it is listed in 15.2.
- **The world as built:** the places, hotspots, plots and the sailing times come from G2 and G3 in `frontend/GRAPHICS.md` on `main`.

## 16. Words we use

| Word | Plain meaning |
|---|---|
| Market day | One day on the Island Exchange, from one 08:00 re-base to the next. The Exchange never closes. |
| Company | One fictional island company on the board. It follows one real price series. |
| Unit (share) | One whole unit of a company. Its price stays between 25% and 400% of the company's start price. |
| Multiplier | The number that stretches a real move into a game move (`MARKET_MULTIPLIER`, 20 to 100). x20 turns a real +1% into +20%. |
| Base | The pair of a game price and a real price that moves are measured from. A daily re-base at 08:00 Lisbon and every pause set a new one. |
| Floor and ceiling | The lowest and highest game price allowed: 25% and 400% of the company's start price |
| Circuit breaker | The stop at plus or minus 30% from the base. The company is paused for 15 minutes and nobody can trade it. No shares are sold. |
| Replay | A recorded stretch of real prices played back as if it were live, always labelled. In demo mode only. |
| Kit grant | The coins that come with your entry kit, paid once with the ref `kit` |
| Pool | All the stakes on one question, shared out among the winners |
| Stake | The coins a player puts into a pool |
| Cap | The most you can earn, buy or stake in a Lisbon day |
| Driftline | The beach where the day's salvage washes up |
| Pile | One thing to collect on the beach. It gives 2 pieces. |
| Plot | One build spot on your islet, named `plot_1` to `plot_4`. The signal station has its own spot. |
| Lane | One teammate's area in the roadmap: G (world and graphics), S (story), A (accounts), L (live systems) |
| Bulletin | The harbor notice published every day at 08:00 |
| Harbor week | Monday 00:00 to Sunday 23:59, Lisbon time |
| Relighting | The world change at the first solve: lights on, fog lifted, fees down (should), a 48 hour festival |
| Relight lock | The one server setting that keeps the Relighting switched off until the game opens. While it is on, a solve pays its rewards but the world stays dark. |
| Seed, ledger, ref, flag, adapter | See [Words we use](../ENGINEERING.md#10-words-we-use) in the engineering rules |
