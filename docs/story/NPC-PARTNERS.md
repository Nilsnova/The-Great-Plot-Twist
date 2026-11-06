# NPC partners

> **What this is:** the rules for NPC partners, the crew mates that the game runs when a seat has no player. It covers which kit a partner carries, the five orders and what they cost in case minutes, what happens when an order cannot be done, and how a friend takes over a seat. It also describes the 34 scripted lines.
>
> **Who uses it:** the owner of package S4, which builds the partner rules, and their coding agent. They turn this page into Python rules and pytest tests. The story author owns the lines. Every teammate may have to explain partners in the code walkthrough.

- **Status:** approved by Nils on 5 November 2026 (draft v2, changed after the review of the same day, then folded together with his answers). It follows his decisions of 5 November: each crew plays its own copy of the case, partners are scripted errand runners, and the four decisions that touch partners are made: the kit order (decision 12), shortcuts only on request (decision 11), partner pins pay the ordering player (decision 9) and a friend keeps their own kit (decision 10). Decisions 11 and 12 are also team calls, so the team confirms them at kickoff. It replaces the first draft of the same day, which had to guess the routes in the case file.
- **Lines:** [`backend/content/partners.json`](../../backend/content/partners.json), 34 lines.
- **The case data these rules read:** [`backend/content/secret/case.json`](../../backend/content/secret/case.json). Its format is in [the case data section of backend/content/README.md](../../backend/content/README.md#the-case-data-secretcasejson-and-partnersjson) and its story in [CASE-FILE.md](CASE-FILE.md). Where the files live: [README.md](README.md#where-the-files-live).
- **Related reading:** [ENGINEERING.md](../ENGINEERING.md) for how we write code, and [supabase/README.md](../../supabase/README.md) for the database. The crews and seats tables come with the foundation update. If that README has no crews section yet, read the comments in the migration.
- **Where to start:** the S4 owner reads the box "The minimum for 23 November" below, then sections 4, 5, 6 and 10. The story author reads section 9. Everyone else can stop after section 1.
- **Who owns which number:** errand minutes, the kit order and the partner titles belong to this page. Card text, routes, places, windows, prices and lights belong to the case file. If two documents disagree, fix the wrong one and say so in the pull request.
- **Spoilers:** this page names cards, places and routes. It never names the culprit or the solution.
- **How it was checked:** on 5 November 2026 a scratch model of these rules (not in the repository) ran against the real `case.json` and the real line bank. It checked every refusal reason, the exact waits for all four windows and the worked example in 5.7. It checked the kit rule for all 69 kit mixes and 256 chains of joining friends. Last, it played the card phase of all 69 mixes with partners that follow only the orders on this page, and no coin was spent. S4 writes the real tests first.

## 1. The answer in one minute

A partner is a seat run by the game. It has no sign-in, no wallet and no ideas of its own. It does what a player tells it, one order at a time, and it answers with one fixed line.

| Question | Short answer |
|---|---|
| Who gets a partner? | Every seat with no player when the crew starts. Then the crew has four seats. |
| Which kit does a partner take? | A kit that no player holds, so the crew has as many cheap kit routes as possible. The order is Informant, Stranger, True Keeper, Witness (decided by Nils on 5 November 2026). Alone, you get the three kits you lack. |
| What can I order? | Search a place, fetch a card, pin a card, man a light, wait. |
| How long does it take? | Search, fetch and the trip to a light: 10 case minutes, sailing included. A pin: 5. A wait: 5. |
| Does a partner spend my coins? | Only when the order says `allowPaid` (decided by Nils on 5 November 2026, off by default). Without it a partner uses free routes and never spends a coin. |
| What if it cannot be done? | The server refuses at once. No minutes pass, no coins move, and the partner says one fixed line. The main reasons are the wrong kit, not enough coins and a place that is shut. |
| Can a friend take over? | Yes, with the crew code. The seat number, the satchel and the pins stay. The kit becomes the friend's own (decided by Nils on 5 November 2026). |
| What does a partner never do? | Pair cards, accuse, call nightfall, aim a beam, trade, give hints, or act without an order. |
| Where do its words come from? | One file with 34 lines. The server never writes partner text itself. |
| How do we test it? | Every result follows from the order and the case minute. The same state at the same minute gives the same result. Nothing is random. |

### The minimum for 23 November

The full rules below have 27 numbered rules and about 70 tests. That is too much to build, test and explain by the freeze on Wed 18 Nov. No package is reserved for a teammate (Nils, 5 November 2026, late evening): Claude and Codex build S4 as far as they can, and a teammate may join. This is the smallest version that keeps the promises of the case: every mix can solve, and solo reaches the finale.

| Build for 23 Nov | Leave for later |
|---|---|
| **One order that fetches a card and pins it,** 15 case minutes in all (10 for the errand, 5 for the pin). Build `fetch` (a card id) first. A Witness partner's C2 is already in its satchel, so the same order only pins it, in 5 minutes. | The `search` order and the decoy rules (5.5), the separate `pin` order, the `wait` order. |
| **`man_light`:** 10 minutes, only for the Keeper's lamp and the Harbor Light, only after nightfall. | Light duty after dawn (N15) and the rules for ending duty (5.3). |
| **The kit rule** (4.2) and the Witness partner that starts with C2. | Taking over a seat (section 7). |
| **Four refusals:** `busy`, `wrong_kit`, `locked_window` and `not_ready`. Any other reason in 6.1 is answered as `not_ready` until its own rule exists. | `no_coins`, `already_have`, `payPrice`. |
| **`allowPaid` stays off.** A partner uses free routes only and never calls the wallet. | Paid errands (5.6, N17 to N19). |
| **About 25 tests:** the 27 rows marked "23 Nov" in section 10.8, and the line bank (34 lines, already written). | The other 44 tests of section 10.8. |

The timing program ([TIMING.md](TIMING.md)) models the full rules, with a separate pin order, so its totals are an upper bound for this minimum, which has no pin order.

## 2. Words used on this page

| Word | Meaning |
|---|---|
| Crew | Four seats that play one copy of the case together. |
| Seat | One of seats 1 to 4. It holds a player or a partner, never both. |
| Kit | The starting package from your Act 1 ending: True Keeper, Witness, Informant or Stranger. Each kit has one cheap card. |
| Partner | An NPC partner: a seat that the game runs. |
| Order | One thing a player tells a partner to do. A partner has at most one running order. The Harbor Slate and the Exchange in OPEN-WORLD.md also have orders, so in code say `partner_order`. |
| Place | One spot a partner can search, such as the smugglers' back room. In `case.json` it is called a hotspot. A search names it as `place.hotspot`, for example `smugglers_cove.back_room`. |
| Errand | An order that sends the partner somewhere: search, fetch or man a light. |
| Route | One way to get a card, from `case.json`: a place, who may use it, a price and a time rule. |
| Free route, shortcut | A free route costs no coins (kinds `kit`, `open` and `timed`). A shortcut is a paid route (kind `paid`). |
| Window | The part of every 20 case minutes when a timed route is open, such as low tide. |
| Lead | A card that is open, because the deductions in its `opens_after` are solved. Only a lead can be fetched. |
| Satchel | The cards a partner carries but has not pinned yet. The whole crew can read them. |
| Pin | Put a card on the shared board. Several seats may pin the same card. A second pin of a card is a co-pin. |
| Case clock, case minute | The crew's own minute counter, written `now` in code. The crew model decides how it moves. Partner rules only read it. |
| Settle | The server applies every order whose time has come. |
| Duty | A partner standing at a light after a man-a-light order. |
| Public light | A light no home belongs to: the Keeper's lamp and the Harbor Light. |

## 3. What a partner is

In the database a partner is a row in `crew_seats` with an `npc_id` where a player would have a `player_id`. It has a title, a kit, a satchel and a state. The screen always labels it "Partner", so nobody mistakes it for a classmate.

| A partner can | A partner cannot |
|---|---|
| Run the five orders in section 5 | Choose which two cards make a deduction |
| Carry cards in its satchel | Accuse anyone |
| Use free routes, and shortcuts when the order allows them | Give hints, advice or opinions |
| Spend the ordering player's coins on a shortcut | Hold coins, trade on the Exchange or hold a share |
| Stand at a public light until the order changes | Call nightfall, aim a beam, craft a lens, build or duel |
| Say the fixed lines in section 9 | Act without an order, or speak with an AI voice |

Partners have titles, not names. The title follows the seat number:

| Seat | Title | `npc_id` |
|---|---|---|
| 1 | the Lookout | `lookout` |
| 2 | the Deckhand | `deckhand` |
| 3 | the Bosun | `bosun` |
| 4 | the Cook | `cook` |

On screen each partner is one small figure in the game's look (D005: original top-down pixel art, gold for light and clues). A gold lantern shows when it is on duty at a light. The art list is a separate document.

## 4. Which kit a partner takes

Every kit has one cheap card. A crew that lacks a kit still gets that card, but it must wait for a window or pay coins. So an empty seat should carry a kit that no player holds. Then the crew keeps as many cheap routes as it can.

### 4.1 The four kits

All numbers in this table come from `case.json`.

| Kit (`id`) | Cheap card | Cheap route: free, always open | Free route for everyone else: open only in a window | Shortcut for everyone else |
|---|---|---|---|---|
| True Keeper (`true_keeper`) | C6 The owner's post | The post room behind the Harbor Office | Mail boat, minutes 15 to 19 of every 20 | Day clerk, 200 coins |
| Informant (`informant`) | C4 Sealed crates | The smugglers' back room | Low tide cave, minutes 12 to 19 | Doorman, 200 coins |
| Stranger (`stranger`) | C5 Greyfathom's manifest | A shift in the salvage yard | Yard gate at the change of shift, minutes 0 to 7 | Dockhand, 250 coins |
| Witness (`witness`) | C2 Fog nights only | Radio words: C2 is in the journal from minute 0 | Ferry log, minutes 10 to 14 | Ferry clerk, 150 coins |

The other four cards (C1, C3, C7 and C8) are open to every kit. Three more routes exist, and partners never use them because they are for players only: an Exchange share for C6, a driftline crate for C4, and Elena's log for C8.

### 4.2 The rule

`NPC_KIT_ORDER` is `informant`, `stranger`, `true_keeper`, `witness`. Nils decided this order on 5 November 2026 (decision 12). It is also a team call, so the team confirms it at kickoff. The same list is `partners.kit_order` in `case.json`, and the timing program uses the same order. `test_case_timing.py` keeps the data and the program equal.

1. When the crew starts, note the kits the players hold. Those kits are covered.
2. Go through the empty seats, lowest seat number first.
3. Give each empty seat the first kit in `NPC_KIT_ORDER` that is not covered. Then mark that kit as covered.
4. A partner keeps its kit until a friend takes its seat.

The result is one sentence, and the tests check it: **with n partners in the crew, the partners hold the first n kits in `NPC_KIT_ORDER` that no player holds.** There are always enough missing kits. A crew with p players holds at most p kits. So at least 4 - p kits are missing, and 4 - p is the number of empty seats.

| Empty seats | The partners take |
|---|---|
| 1 | The first kit in `NPC_KIT_ORDER` that no player holds. |
| 2 | The first two such kits, in order. The first goes in the lower seat. |
| 3 | The first three such kits. With one player, that is exactly the three kits the player lacks. |

### 4.3 Why this order

Take a crew where every kit is present except one. The table shows what that one missing kit costs. The minutes come from the timing program ([TIMING.md](TIMING.md)) at best play on `case.json`: four players with four different kits form D4 after 43 case minutes. Every number is a planning estimate until a human playtest.

| Kit that is missing | Card that gets slower | What the crew does instead | Shortcut | Case minutes lost |
|---|---|---|---|---|
| Informant | C4 | Waits for low tide, open 8 of every 20 minutes | 200 coins | 9 |
| Stranger | C5 | Waits for the change of shift, open 8 of every 20 minutes | 250 coins | 6 |
| True Keeper | C6 | Waits for the mail boat, open 5 of every 20 minutes | 200 coins | 0 |
| Witness | C2 | Waits for the ferry, open 5 of every 20 minutes | 150 coins | 0 |

- The order is by minutes lost, and a tie goes to the dearer shortcut. That gives Informant, Stranger, True Keeper, Witness.
- True Keeper and Witness lose nothing with today's windows. C6 is fetched at the same time as C5, and the wait for the mail boat ends about when C5 is ready. C2 only opens the night, and no other card waits for it.
- The old order was True Keeper, Informant, Stranger, Witness. The two orders give different partners in 15 of the 34 kit mixes that have partners. In those 15 the new order is never slower: it is faster in 3 mixes (WI WI IN, WI IN IN and IN IN IN, where it sends a Stranger partner instead of a True Keeper), by 1 minute at first-time pace and by 4 at best play, and equal in the other 12 (TIMING.md, section 8). The gain is small, because the wider shift change window makes a missing Stranger cheap. The order still holds, and it is one constant to change.
- The order depends on the windows and timers in `case.json`. If one of them moves, run `python3 -I backend/tools/simulate_case.py --kit-orders` again and reorder the constant (and `partners.kit_order` in `case.json`). The rule in 4.2 does not change.

### 4.4 Examples with 1, 2 and 3 empty seats

The table assumes the players sit in the lowest seats, so the partners fill the seats after them.

| Players (kits) | Empty seats | Partners (seat: kit) | Kits the crew still lacks |
|---|---|---|---|
| 1 player: True Keeper | 3 | 2: informant, 3: stranger, 4: witness | none |
| 1 player: Witness | 3 | 2: informant, 3: stranger, 4: true_keeper | none |
| 2 players: True Keeper, Informant | 2 | 3: stranger, 4: witness | none |
| 2 players: True Keeper, True Keeper | 2 | 3: informant, 4: stranger | witness |
| 2 players: Witness, Witness | 2 | 3: informant, 4: stranger | true_keeper |
| 3 players: True Keeper, Informant, Witness | 1 | 4: stranger | none |
| 3 players: True Keeper three times | 1 | 4: informant | stranger, witness |
| 3 players: Stranger, Stranger, Witness | 1 | 4: informant | true_keeper |
| 4 players, any mix | 0 | none | whatever they lack |

Four players with the same kit have no partner and use the free timed routes or shortcuts. That is allowed: any mix of endings works.

### 4.5 When seats change

The rule stays true after a friend joins or a player leaves. A friend replaces the partner who has the friend's kit, or else the partner last in `NPC_KIT_ORDER`. A player who leaves is replaced by a partner with the first kit that nobody holds. Section 7 has the details. A scratch script checked all 69 kit mixes, 256 chains of joining friends and every single departure, and the sentence in 4.2 held every time. The tests in 10.8 repeat that check.

## 5. The five orders

### 5.1 Numbers

| Name in code | Value | Meaning |
|---|---|---|
| `ERRAND_MINUTES` | 10 | Search, fetch, and the trip to a light. Sailing is included. |
| `ARRIVE_AFTER_MINUTES` | 4 | Search and fetch: when the partner reaches the place. A timed route must be open at that minute. |
| `PIN_MINUTES` | 5 | A pin. |
| `WAIT_MINUTES` | 5 | A wait. |
| `NPC_KIT_ORDER` | see 4.2 | Which missing kit comes first. |

An errand looks like this:

```text
minute 0           minute 4           minute 6           minute 10
order given        partner arrives    search is done     back at the berth
[ 4 minutes sailing out ][ 2 minutes at the place ][ 4 minutes sailing back ]
```

Every errand ends with the partner back at the harbor berth, except a trip to a light. So no order depends on where the previous one ended, and every duration is a fixed number.

A route's own `timer_minutes` is for players. A partner always takes the same 10 minutes, whatever the route. This means a Stranger partner can finish the 15 minute yard shift faster than a player can. That is allowed in v1: a partner stands in for a missing crew mate and is not a rival, and one fixed number keeps the rules and the tests simple. If the timing check finds it too generous, the fix is one line: the errand takes the larger of 10 minutes and 8 minutes plus the route's `timer_minutes`.

### 5.2 The orders

| Order | You say | Target | Case minutes | The server checks | You get |
|---|---|---|---|---|---|
| `search` | Go to this place and search it. | `place.hotspot` | 10, arrives after 4 | The fixed checks in 6.2 | The card the place holds, in the satchel. Or nothing. |
| `fetch` | Bring me this card. | A card id | 10, arrives after 4 | The card is a lead, and the same route rules apply. The partner may use a route at any place. | The card, in the satchel. |
| `pin` | Put this card on the board. | A card id | 5 | The card is in this partner's satchel. | The card on the board, filed under the partner's seat. |
| `man_light` | Man this light. | A light id | 10 to get there, then on duty | Night has fallen, partners may man this light, and no other seat holds it. | The light counts as manned. |
| `wait` | Stand by. | None | 5 | Nothing else. | Nothing changes, except that duty ends. |

`search` and `fetch` can also carry `allowPaid`, which is false when left out. Every order also needs the partner to be free (section 5.3).

### 5.3 The states of a partner

- **Idle:** no running order.
- **Busy:** an order is running, so `ordered_at <= now < ready_at`.
- **On duty:** the partner's latest order is `man_light` and it has finished. The partner stays at the light.

The state comes from the seat's latest order. No extra state is stored. Only a busy partner turns an order down for being busy. An idle partner and a partner on duty can take a new order, and any new order ends the duty. Duty also ends when a friend takes the seat or the crew is finished. It does not end at dawn: after a failed night the partners are still at their lights.

### 5.4 Choosing the route

A card has one or more routes in `case.json`. For a search or a fetch the partner works through four steps.

1. **Keep the routes the partner may use.** Those are the routes of kind `open`, the `kit` route for its own kit, `timed` routes, and `paid` routes only when the order says `allowPaid`. Drop everything marked `players_only` (an Exchange share, a driftline crate, Elena's log).
2. **Keep the routes that are open when the partner arrives**, at case minute `now + 4`. A route that is always open stays. A timed route stays only inside its window.
3. **Take the cheapest.** A free route costs 0, so it always beats a shortcut. On a tie, take the route listed first in `case.json`.
4. **Check the answer.** If step 1 left nothing, the reason is `wrong_kit`. If step 2 left nothing, the reason is `locked_window`, and `minutes` says how long to wait. If the price from step 3 is more than the ordering player's coins, the reason is `no_coins`.

A window is open when `from_minute <= (minute mod every_minutes) < from_minute + open_minutes`. The `minutes` of a `locked_window` refusal is the smallest whole number k of 1 or more for which that is true at `now + k + 4`. Ordering again after k minutes then works, and ordering one minute sooner is refused again. Every window is open for at least 5 minutes, which is longer than the trip of 4, so a partner that is sent at the right minute always arrives inside it.

For a `search`, only the routes at the named place count. For a `fetch`, routes at every place count. That is why both orders exist: a search explores one place, a fetch goes wherever the cheapest way is.

### 5.5 What a search or a fetch brings back

- A place holds at most one card (linter rule L4 in the case README).
- A place with no card is a decoy. The search takes the full 10 minutes and finds nothing. This costs the player time, so a search is a real choice.
- A place whose card is not a lead yet counts as a decoy too. The search finds nothing, so a player cannot learn that something will be there later.
- A partner has no home islet (`home_islet`), so it has no driftline beach either (`home_islet.home_driftline`). A search there is refused as `wrong_kit`.
- Two places sit in `anywhere`: C2's radio words (the journal) and C3's key tag (the satchel). The partner still takes the 10 minutes, so there is no special case.
- A Witness partner starts with C2 in its satchel and needs only a pin order. A fetch of C2 by that partner is refused as `already_have`.
- Partners carry the brass key and the oil lantern like every seat, so they can use the key tag and the Keeper's lamp. They never carry the log card from Act 1, because it would work as a free hint. The board may show C8's lead early to a log reader, but a fetch of C8 still needs D3 to be solved.
- The result is decided when the order is accepted (rule N5), not when it ends.

### 5.6 Who pays

Coins are play money here, as everywhere in the game. A partner has no wallet. A shortcut is charged to the player who gave the order, at the moment the order is accepted, with the wallet reason `clue_purchase`. The `ref` is `false_light:{crew_id}:npc:{order_uid}` (rule N17), so it starts with the case id like every other `ref` of the case. Free routes cost no coins.

A partner never spends coins on its own. If the order does not say `allowPaid`, shortcuts do not exist for it. Nils decided this on 5 November 2026 (decision 11): partners spend a player's coins on a shortcut only when the player allows it for that order, and it is off by default. It touches money, so the team confirms it at kickoff. This matters because a free timed route is shut for most of every 20 minutes. If partners paid by themselves, most orders for a missing kit would cost 150 to 250 coins without the player noticing. When a fetch is refused as `locked_window` and a shortcut exists, the answer also carries `payPrice`. The screen can then ask "Pay N coins to go now?" and send the order again with `allowPaid`.

### 5.7 A worked example

A solo True Keeper has an Informant as the Deckhand in seat 2 and a Witness as the Cook in seat 4. Earlier the Cook pinned its C2 (order 1). At minute 40 the player orders a fetch of C4 from the Deckhand. This is the crew's second accepted order.

| Case minute | What happens | Line |
|---|---|---|
| 40 | The order is accepted. The Deckhand takes its own kit route, the back room, for free. `arrive_at` is 44 and `ready_at` is 50. | "On it, Captain! Back in about 10 minutes." |
| 44 | The Deckhand reaches the place. | "Made landfall. Having a good look around." |
| 50 | The card is in the satchel. | "Found the crates. Every lid is stamped with a seal." |
| 52 | The player orders a pin of C4 (order 3). `ready_at` is 57. | "Off to the board with this one. About 5 minutes." |
| 57 | C4 is on the board under seat 2, and `ordered_by` is the player. | "Same seal on the crates. Pinning it." |

### 5.8 What the rules read from other documents

The partner rules own none of this data. They only read it.

| They need | From | Used for |
|---|---|---|
| Places: the `place.hotspot` ids and the card at each | `case.json`, `places` | Search, and decoy places |
| Routes for each card: place, kind, `kit`, `players_only`, `coins`, `open_when` | `case.json`, `cards` | Route choice (5.4) |
| Windows: `every_minutes`, `from_minute`, `open_minutes` | `case.json`, `case_clock` | Open or shut on arrival, and the `minutes` of `locked_window` |
| Which cards are open (`opens_after`), and which deductions are solved | `case.json` and the board | Leads |
| The cards each seat holds, and the pins on the board | The satchel and board tables (S3 and L3) | `already_have`, pin, co-pin |
| Lights: id, name and `partners_may_man` | `case.json`, `night.lights` | Man a light, and the `{light}` words |
| Is a night on? Which light does each player hold? | The finale (L3) | Man a light |
| The case minute `now` | The crew model | Everything |
| The player's coin balance, and the one wallet call | `backend/server/wallet.py` | Shortcuts |
| Each seat's kit, and who sits where | `crew_seats` | The kit rule and takeover |

## 6. When an order cannot be done

An impossible order is not the same as an invalid one. A request that is malformed (an unknown order kind, a target that does not exist, a seat that holds a player) gets the standard API error. A request that is well formed but cannot be done gets a normal answer with `accepted: false`, a `reason` and the partner's `line`. Nothing changes: no order, no minutes, no coins.

### 6.1 The reasons and the lines

Ten reasons share six groups of lines. The words are in `backend/content/partners.json`, which is the source. Keep this table in step with it.

| Reason | When | Line group | Extra numbers in the answer | What the partner says |
|---|---|---|---|---|
| `wrong_kit` | No route exists that the partner may use. This includes a place only another kit or a player can use, a shortcut-only place when the order lacks `allowPaid`, and the player's home or driftline. | `wrong_kit` | none | "That one's not for me, Captain. I don't carry what it needs." |
| `light_not_for_partners` | A `man_light` order for a light that players must man. | `wrong_kit` | none | same as above |
| `no_coins` | The cheapest open route costs more coins than the ordering player has. | `no_coins` | `price` | "That costs {price} coins, and the purse is short." |
| `locked_window` | Every usable route is timed and shut when the partner would arrive. | `locked_window` | `minutes`, and `payPrice` on a fetch when a shortcut exists | "Shut when I'd get there, Captain. Ask me again in about {minutes} minutes." |
| `busy` | The partner is running an order. | `busy` | `minutes` | "Still on my last job. Free again in about {minutes} minutes." |
| `already_have` | A search or a fetch for a card this partner holds, has already pinned or is already fetching. Or a `man_light` for the light this seat already holds. | `already_have` | none | "I already have that one, Captain." |
| `no_lead` | A fetch for a card that is not a lead yet. | `not_ready` | none | "Can't do that one yet, Captain. Not the right moment." |
| `not_carrying` | A pin for a card that is not in this partner's satchel. | `not_ready` | none | same as above |
| `not_nightfall` | A `man_light` order while no night is on. | `not_ready` | none | same as above |
| `light_taken` | Another seat holds that light, or is on its way to it. | `not_ready` | none | same as above |

In the `busy` line, `{minutes}` is `ready_at - now`. In the `locked_window` line, it is the k from 5.4. In the `no_coins` line, `{price}` is the price of the route from step 3 of 5.4.

### 6.2 The fixed order of checks

The first check that fails is the reason. The order is fixed so that a test can predict it: first whether the partner is free, then what can never work, then what only works later, and last the money.

| Order | Checks, in this order |
|---|---|
| `search` | `busy`, home or driftline (`wrong_kit`), decoy or card not a lead (accepted, finds nothing), `already_have`, `wrong_kit`, `locked_window`, `no_coins` |
| `fetch` | `busy`, `no_lead`, `already_have`, `wrong_kit`, `locked_window`, `no_coins` |
| `pin` | `busy`, `not_carrying` |
| `man_light` | `busy`, `light_not_for_partners`, `not_nightfall`, then `already_have` or `light_taken` |
| `wait` | `busy` |

The decoy check comes before the kit check on purpose. Otherwise a refusal could tell a player that a place will hold something later.

### 6.3 Three examples

These use the real routes in `case.json` and a solo True Keeper crew: the Deckhand is an Informant, the Bosun a Stranger and the Cook a Witness.

- **Wrong kit.** The player orders the Cook (a Witness) to search `smugglers_cove.back_room`. Only the Informant's kit route and the doorman's paid route are there. The Cook may not use the first, and may use the second only with `allowPaid`, so the answer is `wrong_kit`.
- **A shut place.** At case minute 3 the player orders the Bosun to fetch C4. The free way is the low tide cave, open in minutes 12 to 19 of every 20. The Bosun would arrive at minute 7, so the answer is `locked_window` with `minutes` 5 and `payPrice` 200. An order at minute 8 arrives at 12 and is accepted, for free. An order at minute 7 would be refused again, with `minutes` 1.
- **Not enough coins.** The same order sent with `allowPaid` and only 100 coins uses the doorman, who costs 200. The answer is `no_coins` with `price` 200. With 1,000 coins the order is accepted, 200 coins are charged, and the partner goes.

The client may disable the order buttons only while a partner is busy. Every other refusal is found by trying, so the buttons never hint where a card is. The client shows the line and nothing more: a refusal never names the kit, the card or the place that would work.

## 7. Taking over a seat with a crew code

A crew code is a pass to the crew. The crew model makes the code and decides how it works. This section says only what happens to a partner's seat.

### 7.1 Steps

1. The friend plays Act 1, so the referee gives them a kit. Without a kit there is nothing to bring.
2. The friend enters the crew code. The crew must be `active` and must still have a partner. The friend must not sit in another active crew, and must not already hold a seat in this one.
3. The server picks the seat. The friend does not choose, which keeps the crew's kits as useful as possible. It takes the partner who has the friend's kit. If no partner has it, it takes the partner whose kit is last in `NPC_KIT_ORDER`. The screen shows the friend which partner they replace before they confirm.
4. In one database step the seat row changes from `npc_id` to `player_id`, and `kit` becomes the friend's own kit (decided by Nils on 5 November 2026, decision 10).
5. The partner who leaves says its `takeover` line.

If the crew is still `forming`, there is no partner yet. The friend takes an empty seat, and the rule in section 4 runs when the crew starts.

### 7.2 What carries over

| What | After the takeover | Why |
|---|---|---|
| Seat number | Stays | Pins on the board are filed by seat. |
| Cards in the satchel | Stay, and the friend can pin them at once. A card the friend also holds appears once. | The crew already paid the minutes for them. |
| Cards already on the board | Stay, filed under the seat. The friend earns nothing for them. | Rewards go to what a human does (rule N23). |
| A running errand | Finishes on time. Its card goes to the seat. | The result was decided when it was accepted (N5). |
| Coins paid for that errand | Stay paid, no refund | The card still arrives. |
| Light duty | Ends. The light is free. | The friend must man a light themselves. |
| Kit | Becomes the friend's own kit | The friend brings their own cheap card. |
| Title, look and lines | Leave with the partner | |
| Case clock, board, deductions | Unchanged | |
| The friend's own coins | Stay the friend's | A partner never held any. |

### 7.3 When a player leaves

If the crew model lets a player leave or be removed from an active crew, the seat gets a partner again. The new partner takes the first kit in `NPC_KIT_ORDER` that no seat holds, starts with an empty satchel (a Witness partner starts with C2) and is idle. The leaving player's pins stay on the board.

A crew of four players has no partners, so if two of them stop coming, the two who are left cannot man three lights, because partners are added only when the crew starts. This is an open point for package A6 (section 11): a crew can release an absent player's seat to a partner, by a vote or after a set idle time. The rules above then apply as they are.

## 8. What partners never do

| A partner never | How the rules make sure |
|---|---|
| Chooses which two cards make a deduction | No order does it. Pairing is a request that needs a signed-in player, and a partner has no sign-in. |
| Accuses | Same: no order, and the accusation request needs a signed-in player. |
| Calls nightfall or aims a beam | Same. A player aims and locks the beam of a light a partner holds, from their own screen. |
| Gives a free hint | It only says lines from the bank. A line may repeat what its own card shows. It never names another card, a deduction, a suspect or the culprit, and it never advises (section 9). |
| Speaks with an AI voice | Lines come from a file. No code path may ask a language model for partner text, and the `companion_llm` flag stays unused here. |
| Carries the log card | Partners never play Act 1, so they have no log to read. |
| Acts without an order | Nothing gives a partner an order except a player. |
| Moves coins on its own | It has no wallet. A shortcut is charged to the player who gave the order, and only when the order says `allowPaid`. |
| Holds a share, trades, builds, crafts a lens, salvages or duels | Those orders do not exist, and routes that need a share are never used. |

## 9. The line bank

### 9.1 The events

The file `backend/content/partners.json` holds 34 lines for 10 events.

| Event | Said when | Lines | Variants |
|---|---|---|---|
| `order_accepted` | The order is given. | 5 | `go` (2 lines, for search and fetch), `pin`, `man_light`, `wait` |
| `arrived` | A search or a fetch reaches the place, at `arrive_at`. | 1 | any |
| `found_card` | A search or a fetch ends with a card, at `ready_at`. | 8 | C1 to C8 |
| `found_nothing` | A search ends at a place with nothing to find. | 1 | any |
| `pinned_card` | A pin ends and the card is on the board. | 8 | C1 to C8 |
| `cannot_do_it` | An order is refused. | 6 | `wrong_kit`, `no_coins`, `locked_window`, `busy`, `already_have`, `not_ready` |
| `manning_light` | A trip to a light ends and the partner goes on duty. | 1 | any |
| `beam_locked` | A player locks the beam of the light this partner holds. | 1 | any |
| `case_solved` | The crew solves the case. Every partner says it. | 2 | any |
| `takeover` | A friend takes the seat. The leaving partner says it. | 1 | any |

The file also holds the partner titles with their `npc_id` by seat, the placeholder list, the length limit and, for each event, its salt. It holds the map from raw reasons and order kinds to line groups too. That map is the "Line group" column of the table in 6.1, plus `search` and `fetch` both mapping to `go`.

### 9.2 Picking a line

Each variant holds a list. The server takes `list[salt mod length]`.

- For an event tied to an order, the salt is that order's number: the crew's count of accepted orders, starting at 1.
- For a refusal, the salt is the crew's count of accepted orders so far.
- For `beam_locked`, `case_solved` and `takeover`, the salt is the seat number. With two `case_solved` lines and partners in seats 2, 3 and 4, the lines alternate.

There are no random numbers. Adding another line to any list needs no code change. One function, `pick_line`, is the only way to get partner text. The finale package calls it too, for `beam_locked` and `case_solved`.

### 9.3 Placeholders

Three placeholders exist: `{minutes}`, `{light}` and `{price}`. The server fills them from its own data. A light comes with its article, for example "the Harbor Light". The client shows the finished sentence as plain text (`textContent`), never as HTML.

### 9.4 Rules for writing a line

The tests in `test_npc_lines.py` check what a machine can check: length, characters, placeholders, ids and words. A person checks the tone.

- At most 80 characters (`max_characters` in the file), counted on the line as stored, with the placeholders not filled in. Plain ASCII, straight quotes, no em dash, no en dash and no double hyphen.
- Cheerful, short and a little nautical. Titles only, no personal names. Players are captains in this game, so a partner may say "Captain" to the player who gave the order, but not in every line.
- A line may repeat what its own card shows. It never names another card or a deduction (no C or D ids), never says what a card proves, and never advises.
- None of these words, as whole words in any case, with a plural allowed: `harbor master`, `harbormaster`, `fisherman`, `foreman`, `commander`, `culprit`, `guilty`, `suspect`, `traitor`, `villain`, `betray`, `blame`, `clue`, `hint`, `deduction`, `deduce`, `pair`, `match`, `proof`, `proves`, `clears`, `innocent`, `hidden`, `secret`, `lie`, `liar`, `window`, `should`, `maybe`, `perhaps`, `probably`, `interesting`, `strange`, `odd`, `suspicious`, `fishy`, `try`, `why not`, `think`, `elena`.
- Nothing that points at the culprit or clears a suspect before the twist.

The one line the skeleton quotes, "Same seal on the crates. Pinning it.", is the `pinned_card` line for C4, word for word.

## 10. Server rules for package S4

These rules are numbered so a test can name the rule it checks. "Server" means the Python code in `backend/server/`. Suggested files, one job each: `npc_kits.py` (the kit rule and the takeover choice), `npc_orders.py` (checks, routes and times), `npc_lines.py` (loading the bank and `pick_line`) and a thin route file `routes/crew_orders.py`. The contract for the route goes in the comment at the top of that file, as ENGINEERING.md asks.

The contracts draft (INTERFACES.md, section 9) reserves `POST /api/crews/me/orders` for S4. Its JSON uses camelCase, as the API conventions say. In Python and SQL the same names are snake_case.

| Part | Fields |
|---|---|
| Request | `seat` (1 to 4), `order` (`search`, `fetch`, `pin`, `man_light` or `wait`), `target` (a `place.hotspot`, a card id, a light id, or left out for `wait`), `allowPaid` (optional, false when left out), `actionUid` (made once per click, called `order_uid` in Python and SQL) |
| Answer when accepted | `accepted: true`, `line`, and `order` with `number`, `seat`, `order`, `target`, `orderedAt`, `arriveAt` (empty for pin, man_light and wait), `readyAt` and `price` (0 for a free route) |
| Answer when refused | `accepted: false`, `reason`, `line`, and the extra numbers from 6.1 |
| Standard errors | 401 not signed in. 404 not in a crew. 409 the crew is not active, or the seat holds a player. 422 a bad order kind, seat or target. The suggested codes are for S4's spec to settle. |

S4's spec also adds a read route for the screen, for example `GET /api/crews/me/partners`. For each partner it should return the seat, title, kit, state (idle, busy or on duty), running order, satchel and the lines since a given order number.

### 10.1 Time and settling

- N1. Partner rules take `now`, a whole number of case minutes, as an argument. They never read the real time and never use random numbers. A test passes a fake `now`. A paused case clock pauses every errand.
- N2. When an order is accepted, the server stores `ordered_at = now` and `ready_at = ordered_at` plus the minutes of the order. For search and fetch it also stores `arrive_at = ordered_at + 4`. These numbers never change.
- N3. An order is finished when `now >= ready_at`. At `ready_at - 1` it is still running. At `ready_at` the partner is free for a new order.
- N4. The server settles first, on every request that reads or changes the crew. Settling applies every unsettled order whose `ready_at` has passed, in order of `ready_at` and then order number. A search or fetch puts its card in the satchel, and a pin moves its card to the board. A second settle changes nothing. No background job does this, because Vercel Hobby allows a cron only once a day. If the clock jumps (for example when a presenter moves it forward), every due order finishes at once.
- N5. What an order brings back (which card, or nothing) and which route it uses are decided when the order is accepted and stored with it. A later clock jump or another player's move does not change it.

### 10.2 Giving orders

- N6. Only a player who holds a seat in the crew may give an order. The order goes to a seat that holds a partner. The crew must be `active`. Otherwise the request fails with the standard API error. The player id comes from the sign-in, never from the request.
- N7. A partner has at most one running order. A new order for a busy partner is refused as `busy`. A partner on duty is not busy, and a new order ends the duty.
- N8. The same `actionUid` twice acts once: one order, one charge, and the first answer again. Only accepted orders are remembered. A refusal changes nothing, so asking again just checks again. The team may still pick another answer for repeats (the open question in the API conventions).
- N9. The checks run in the fixed order in 6.2, and the first failure is the reason.
- N10. A refusal changes nothing: no order row, no minutes, no coins. The answer has `accepted: false`, the `reason`, the `line` and the extra numbers from 6.1.

### 10.3 Routes and results

- N11. Route choice follows the four steps in 5.4. A partner uses only `kit` routes of its own kit, `open` routes, `timed` routes and, when the order says `allowPaid`, `paid` routes. It never uses `share`, `world` or `log_reader` routes, and never a route marked `players_only`.
- N12. A search looks at the routes at the named `place.hotspot`. A place with no card, or whose card is not a lead yet, finds nothing after 10 minutes and says `found_nothing`. A place in `home_islet`, the driftline beach `home_driftline` included, is refused as `wrong_kit`. A search target names the place as well as the hotspot (`place.hotspot`), because ids are only unique inside one place.
- N13. A fetch needs a lead. It looks at the routes at every place. When it is refused as `locked_window` while `allowPaid` is false, and a shortcut exists, the answer carries `payPrice`.
- N14. When a pin ends, the card leaves the satchel and goes on the board under the partner's seat. If the card is on the board already, the seat is added as a co-pinner and nothing else changes. The pin row keeps `ordered_by`.
- N15. A man-a-light order needs a night that is on, a light with `partners_may_man` true in `case.json`, and a light that no other seat holds. Today only the Keeper's lamp and the Harbor Light have it. The light is reserved from the moment the order is accepted, and a player may aim its beam at once. At `ready_at` the partner goes on duty, and only then does a lock for that light count (CASE-FILE.md, section 10.4). Duty stays after dawn, and it ends only as 5.3 says.
- N16. A wait takes 5 minutes and has no other effect. If the partner was on duty, the duty ends at once and the light is free.

### 10.4 Money

- N17. A shortcut is used only when the order says `allowPaid`. Its price is charged to the player who gave the order, when the order is accepted, with the wallet reason `clue_purchase` and `ref` set to `false_light:{crew_id}:npc:{order_uid}`. That is at most 12 + 36 + 5 + 64 = 117 characters (a 36 character crew id and a 64 character `order_uid`), under the wallet limit of 120. A free route never calls the wallet. A shortcut is refused as `already_have`, with no charge, when that seat already holds the card.
- N18. If the wallet answers `already_applied` for that `ref`, the coins are already paid: create the order and do not charge again. If it answers `insufficient_funds`, refuse the order as `no_coins`. If it answers 503, the outcome is unknown: look the `ref` up in the ledger before doing anything else (ENGINEERING.md, recipe 4.1, step 8).
- N19. A partner never earns, spends or trades on its own. Settling never calls the wallet.

### 10.5 Seats and kits

- N20. With n partners in a crew, the partners hold the first n kits in `NPC_KIT_ORDER` that no player holds. The server keeps this true at the start, after a takeover and after a player leaves.
- N21. A partner keeps its kit and its satchel until a friend takes the seat. Kits do not move when other seats change. A Witness partner starts with C2 in its satchel, also when it is made later.
- N22. A takeover follows the steps in 7.1 and the table in 7.2.
- N23. Every pin row (one for each card and seat) keeps `seat_no`, `by_partner` and `ordered_by`. `by_partner` is true when the order was given to a partner, even if a friend took the seat later. For a player's own pin, `ordered_by` is that player. The rewards rules read `ordered_by`, and Nils decided on 5 November 2026 that the ordering player is paid (decision 9, section 11).

### 10.6 Words and limits

- N24. The only text a partner says comes from the bank. The server picks a line by the salt rule in 9.2.
- N25. The server fills the placeholders from its own data. The client shows the sentence as plain text.
- N26. There are exactly five order kinds, and none pairs cards, accuses, calls nightfall or aims a beam. Those requests refuse anyone who is not a signed-in player.
- N27. A partner never acts without an order.

### 10.7 What the database guards

The database protects its own data, as ENGINEERING.md asks. These guards go in the migration for S4, with a comment on each and a row in the policy matrix of supabase/README.md. The table below is a proposal. Agree it with the crew model and board authors first, because ENGINEERING.md asks the team to talk before a new table is added.

- One table of partner orders. Its key is the crew and the order number. Each row holds the seat, kind, target, who ordered, `order_uid`, `ordered_at`, `arrive_at`, `ready_at`, the result card, the route id, the price and whether it is settled.
- At most one unsettled order per partner seat, as a partial unique index. If two players order the same partner at the same moment, the index lets one order in, and the other gets the answer `busy`.
- `order_uid` is unique inside a crew, and so is the order number.
- A satchel holds a card once per seat, and a seat pins a card once.
- Settling marks an order settled in the same step that applies it, and only if it is not settled yet. Two requests at once cannot apply an order twice.
- A player may read the orders of a crew they sit in. Only the server writes them.
- The migration test checks that row-level security is on and that browser roles have no write grants.

### 10.8 Tests to write first

Tests that share a shape can be one parametrized test.

| File | Test | Rule | 23 Nov |
|---|---|---|---|
| `test_npc_kits.py` | `test_partners_get_the_kits_in_the_examples_table` (one case for each row of 4.4) | N20 | yes |
| | `test_partners_hold_the_first_missing_kits_for_all_69_kit_mixes` | N20 | yes |
| | `test_empty_seats_are_filled_from_the_lowest_seat_number` | N20 | yes |
| | `test_a_witness_partner_starts_with_card_c2_in_its_satchel` | N21 | yes |
| | `test_partners_keep_their_kit_when_other_seats_change` | N21 |  |
| `test_npc_takeover.py` | `test_friend_replaces_the_partner_with_the_same_kit` | N22 |  |
| | `test_friend_replaces_the_last_partner_in_the_order_when_no_kit_matches` | N22 |  |
| | `test_partners_hold_the_first_missing_kits_after_every_chain_of_takeovers` | N20, N22 |  |
| | `test_the_seat_takes_the_friends_own_kit` | N22 |  |
| | `test_takeover_keeps_seat_number_satchel_and_pins` | N22 |  |
| | `test_takeover_lets_a_running_errand_finish_into_the_seat` | N5, N22 |  |
| | `test_takeover_ends_light_duty_and_frees_the_light` | N22 |  |
| | `test_takeover_is_refused_for_a_finished_crew_or_a_crew_without_partners` | N22 |  |
| | `test_takeover_is_refused_for_a_player_in_another_active_crew` | N22 |  |
| | `test_a_leaving_player_is_replaced_by_a_partner_with_the_first_missing_kit` | N20 |  |
| `test_npc_orders.py` | `test_search_arrives_after_4_minutes_and_is_ready_after_10` | N2, N3 | yes |
| | `test_fetch_and_man_light_take_10_minutes_and_pin_and_wait_take_5` | N2 | yes |
| | `test_an_order_is_still_running_one_minute_before_ready_at` | N3 | yes |
| | `test_a_partner_is_free_again_at_ready_at` | N3 |  |
| | `test_a_clock_jump_finishes_every_due_order_in_ready_at_order` | N4 |  |
| | `test_settling_twice_changes_nothing` | N4 | yes |
| | `test_the_same_orders_at_the_same_minutes_give_the_same_results_and_lines` | N1 |  |
| | `test_the_outcome_is_fixed_when_the_order_is_accepted` | N5 | yes |
| | `test_only_a_player_of_the_crew_can_give_an_order_to_a_partner_seat` | N6 | yes |
| | `test_an_order_to_a_seat_that_holds_a_player_gets_the_standard_error` | N6 |  |
| | `test_a_busy_partner_refuses_a_second_order` | N7 | yes |
| | `test_a_partner_on_duty_accepts_a_new_order_and_the_duty_ends` | N7, N16 |  |
| | `test_duty_stays_after_dawn` | N15 |  |
| | `test_the_same_action_uid_twice_acts_once` | N8 | yes |
| | `test_search_in_a_decoy_place_finds_nothing_after_10_minutes` | N12 |  |
| | `test_search_in_a_place_whose_card_is_not_a_lead_finds_nothing` | N12 |  |
| | `test_search_in_a_home_or_the_driftline_is_refused_as_wrong_kit` | N12 |  |
| | `test_a_search_target_names_the_place_and_the_hotspot` | N12 |  |
| | `test_fetch_needs_a_lead` | N13 | yes |
| | `test_fetch_may_use_a_route_at_any_place` | N13 |  |
| | `test_the_cheapest_open_route_wins_and_a_tie_goes_to_the_first_in_the_file` | N11 |  |
| | `test_a_partner_never_uses_share_world_or_log_reader_routes` | N11 | yes |
| | `test_a_timed_route_is_used_only_when_its_window_is_open_on_arrival` | N11 | yes |
| | `test_pin_files_the_card_under_the_partner_seat_with_ordered_by` | N14, N23 | yes |
| | `test_pinning_a_card_that_is_already_on_the_board_adds_the_seat_as_a_co_pinner` | N14 |  |
| | `test_a_second_partner_may_fetch_a_card_that_another_partner_already_pinned` | N9, N14 |  |
| | `test_a_light_is_reserved_from_the_moment_man_light_is_accepted` | N15 | yes |
| | `test_wait_takes_5_minutes_and_frees_the_light` | N16 |  |
| `test_npc_refusals.py` | `test_wrong_kit_is_refused_with_its_reason` | N9 | yes |
| | `test_a_shut_place_is_refused_with_the_exact_minutes_until_an_order_would_arrive_inside_the_window` | N9, N11 | yes |
| | `test_ordering_again_after_those_minutes_is_accepted_and_one_minute_sooner_is_refused` | N9, N11 | yes |
| | `test_a_locked_fetch_shows_the_pay_price_when_a_shortcut_exists` | N13 |  |
| | `test_not_enough_coins_is_refused_and_nothing_is_charged` | N9, N17 |  |
| | `test_checks_run_in_the_fixed_order` (one case for each row of 6.2) | N9 |  |
| | `test_man_light_is_refused_before_nightfall_and_for_home_lights` | N9, N15 | yes |
| | `test_a_refusal_creates_no_order_and_costs_no_minutes_or_coins` | N10 | yes |
| `test_npc_money.py` | `test_a_partner_never_pays_unless_the_order_allows_paying` | N17 | yes |
| | `test_a_shortcut_charges_the_ordering_player_once_with_reason_clue_purchase` | N17 |  |
| | `test_the_same_paid_order_sent_twice_charges_once` | N8, N17 |  |
| | `test_wallet_already_applied_still_creates_the_order` | N18 |  |
| | `test_wallet_insufficient_funds_refuses_the_order_as_no_coins` | N18 |  |
| | `test_settling_never_calls_the_wallet` | N19 |  |
| `test_npc_never.py` | `test_there_are_exactly_five_order_kinds_and_none_pairs_or_accuses` | N26 |  |
| | `test_pair_accuse_and_nightfall_refuse_a_request_without_a_player_sign_in` | N26 | yes |
| | `test_partners_alone_never_create_a_deduction_or_solve_the_case` | N26 |  |
| | `test_a_partner_without_an_order_does_nothing_however_much_time_passes` | N27 |  |
| `test_npc_lines.py` | `test_the_bank_has_every_event_every_card_and_every_reason_group` | N24 |  |
| | `test_every_line_fits_the_limit_and_uses_known_placeholders` | N24 |  |
| | `test_no_line_has_a_dash_a_card_or_deduction_id_or_a_banned_word` | N24 | yes |
| | `test_line_choice_follows_the_salt_rule` | N24 |  |
| | `test_partner_text_always_comes_from_the_bank` | N24, N25 |  |
| | `test_the_skeleton_line_for_c4_is_there_word_for_word` | N24 |  |
| `test_npc_solvability.py` | `test_every_partner_kit_can_fetch_and_pin_every_open_card_on_free_routes` | N11, shared with S3 |  |
| | `test_every_kit_mix_can_pin_all_eight_cards_with_two_seats_for_each_deduction` | shared with S3 | yes |
| | `test_no_kit_mix_spends_a_coin_on_a_card` | N17, shared with S3 |  |
| | `test_every_kit_mix_can_man_three_lights_with_three_seats` | shared with S3 | yes |

**For the 23 Nov minimum** 27 of the 71 tests are marked, about 25 once you count each parametrized test as one. In the minimum, `fetch` takes the place of `search` in the order tests, and the pin is part of the same order, so a card is on the board 15 minutes after the order. There are two order kinds, not five. A refusal other than the four in the box is answered as `not_ready`. The money test only checks that a partner never calls the wallet.

### 10.9 The proof S4 owes the case

There are 69 kit mixes: 4 with one player, 10 with two, 20 with three and 35 with four. For each mix:

1. Fill the empty seats with the rule in section 4.
2. Play the card phase with a simple planner. Players act at once, and partners get only the orders on this page, with `allowPaid` left out. When a fetch is refused as `locked_window`, the planner waits the `minutes` from the answer and asks again. That also tests the `minutes`.
3. The planner passes when all 8 cards are pinned, two different seats pinned the cards of every deduction, no coin was spent, and every fetch was accepted on the first or the second try.
4. Three different seats can man three lights. Two seats man the public lights (partners, or players when there are no partners). A player builds the third light for at most the smallest `start_coins`.
5. A second run lets only the partners act. It must never create a deduction or solve the case.

The scratch model did steps 1 to 3 on 5 November 2026 for all 69 mixes. Every mix finished and no coin was spent. The timing program ([TIMING.md](TIMING.md)) repeats the card phase with the orders timed so that every window is open, and finds the same: all 69 mixes finish on free routes.

### 10.10 Build order

Each step is one small pull request with its tests first. Steps 1 to 6 are the 23 Nov minimum (see the box in section 1). Steps 7 and 8 come later.

1. The kit rule and the Witness partner's C2, as pure functions (section 4).
2. Order times and settling, still pure (N1 to N5), for the fetch-and-pin order and `man_light`.
3. Route choice and the four refusals `busy`, `wrong_kit`, `locked_window` and `not_ready` (N9 to N15).
4. The database guards and the thin route (10.7).
5. The line bank loader and the lint test.
6. The proof in 10.9, steps 1 to 4.
7. Later: the takeover choice (section 7), the `search` and `wait` orders and the decoy rules, the other refusals.
8. Later: the shortcut and the wallet call (N17 to N19, `allowPaid`).

### 10.11 What a solo run asks of partners

The cheapest plan for a solo run needs 9 or 10 partner orders. A solo Informant, Stranger or True Keeper needs 3 fetches, 4 pins and 2 trips to the public lights. That is 9 orders and 70 partner minutes (3 x 10 + 4 x 5 + 2 x 10). A solo Witness needs 4 fetches, so 10 orders and 80 partner minutes, because the Witness partner is missing and a partner must fetch one open card for D1. Spread over three partners that is about 25 minutes each.

The orders also run side by side, so the chain that decides the pace is short. D2 needs one fetch and one pin (15 minutes, plus the player's second order for the pin), D3 another pair of orders, and the third light waits for the night. Even so, the timing program finds that the partner chains are the larger part of the solo time, not the smaller one: with partner errands and pins set to no time, solo would take 89 to 95 minutes instead of 121 to 124 (with `errand` and `pin` set to 0 and the 4 minute arrival left as it is; setting the arrival to 0 as well gives 89 to 97), and with the player's own pairing, reading and searching set to no time, about 103. The two do not add up, because they overlap (TIMING.md, section 4.5). Solo still fits the 150 minute promise with 26 or more minutes spare. If a playtest finds it too slow, change `ERRAND_MINUTES` first (TIMING.md, section 6), then `NPC_KIT_ORDER`.

## 11. Open points

| Point | Recommendation | Who decides |
|---|---|---|
| **The kit order: closed.** 4.3 moves the Informant and the Stranger ahead of the True Keeper. CASE-FILE.md sections 3 and 9 now name the same order, and all four windows map to one reason, `locked_window`. The timing program reran the comparison with the new windows (TIMING.md, section 8). | Keep. If a window or a timer moves, run `--kit-orders` again. | Decided by Nils on 5 November 2026 (decision 12). The team confirms it at kickoff. |
| **Shortcuts only on request: closed.** A partner spends coins only when the order says `allowPaid`. CASE-FILE.md section 9 and `case.json` (`paid_only_with_allow_paid`) now say the same. This touches money, so the team confirms it (ENGINEERING.md, section 1). | Keep `allowPaid`, false by default. For 23 Nov it stays off in the minimum, so a partner never calls the wallet. | Decided by Nils on 5 November 2026 (decision 11). The team confirms it at kickoff. |
| **Who earns the pin rewards when a partner pins?** A reward goes to a human seat with an accepted pin. Example: in a solo run with a Witness player, C5 and C6 come from partners, so the player would earn nothing for D3. | Pay the player who gave the pin order (`ordered_by`). The case file already assumes this. | Decided by Nils on 5 November 2026 (decision 9): yes, the ordering player is paid. |
| **Which kit does a taken-over seat carry?** STORY.md asked this. | The friend's own kit, because the kit item belongs to the friend's story. 7.1 and N22 say so. | Decided by Nils on 5 November 2026 (decision 10). |
| **Partners need 10 case minutes after nightfall.** A night lasts at most 20. The timing program finds that a solo player needs 14 at first-time pace: three orders take 3, the partners are on post after 13, and the three locks take under a minute. Aiming overlaps the partners' trip, because a player can aim a reserved light's beam while the partner sails (CASE-FILE.md 10.4). Duty stays after dawn, so a second night starts with partners in place. | The finale spec reads partner duty from the orders and keeps the rule that a beam stays aimed. If it is too tight, let partners go to a light once D1 is solved. | Finale spec author |
| **A solo player must build the third light: closed.** Partners may man only the two public lights. | Done: every player has a home islet, a True Keeper too, so every crew can build a signal station for 300 coins, inside the 1,000 coin start. | Closed |
| **A partner is faster than a player on a long route.** The Stranger partner brings C5 in 10 minutes, a player needs 15 for the shift. | Keep it in v1. If the timing check says it is too generous, use the one-line fix in 5.1. | Timing check |
| **No order queue.** A player waits for a partner to finish before giving the next order. | Keep v1 simple. If solo play feels slow, add a short queue later. | The team, after play |
| **Contract names.** The contracts draft (INTERFACES.md, section 9) reserves `backend/content/partners.json` for orders, errand times and lines (D016). The words now sit in that file, and the numbers are constants in code. The request id is `actionUid` in JSON and `order_uid` in Python and SQL. The repeat question in the API conventions (first answer again, or `409 already_applied`) is still open. | The file move is done. Keep the two spellings of the id, and follow the team's answer for repeats. | The team, at the contracts review |
| **Partners appear when the crew starts.** A crew in `forming` has none. | The crew model confirms this and defines the crew code. | Crew model author |
| **A crew that loses players** (7.3). A crew of four players has no partners to take over. | A6 lets a crew release an absent player's seat to a partner, by a vote or after a set idle time. | A6 owner |
| **Who builds S4: closed.** No package is reserved for a teammate. Claude and Codex build S4 as far as they can, and a teammate may join or bring ideas. | Build the minimum box above first. | Decided by Nils on 5 November 2026, late evening. Closed. |
| **Pages that copy a rule from here.** CASE-FILE.md (sections 3, 9 and 15), the case data section of `backend/content/README.md` (the route order and the word "place") and the `partners` and `planning` parts of `case.json`. | When a rule here changes, change them in the same pull request. | Whoever changes the rule |
| **Place and company names are placeholders** until the final name check. | Lines name no place or company. The case file supplies the light names for `{light}`. | Name check |
