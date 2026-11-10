# Data inventory

What the game can store, send and log, for players and the course team. **student project, not legal advice**.

Reviewed on 9 November 2026 against the current migration chain through `20261109010000` and the integrated application. This is an inventory of the repository, not proof of the deployed database or provider settings. Generated captain names and random player IDs still link activity to an account; they are not anonymous data.

## Sources and reading rules

Schema sources, in timestamp order:

- [foundation](../supabase/migrations/20261106000000_foundation.sql).
- [island exchange](../supabase/migrations/20261106010000_island_exchange.sql).
- [accounts](../supabase/migrations/20261106020000_accounts.sql).
- [entry profiles](../supabase/migrations/20261106030000_entry_profiles.sql).
- [crew codes](../supabase/migrations/20261106040000_crew_codes.sql).
- [live presence](../supabase/migrations/20261106050000_live_presence.sql).
- [case rules](../supabase/migrations/20261106060000_case_rules.sql).
- [home islet](../supabase/migrations/20261106070000_home_islet.sql).
- [case board and night](../supabase/migrations/20261106080000_case_board_and_night.sql).
- [exchange leverage](../supabase/migrations/20261106090000_exchange_leverage.sql).
- [prediction desk](../supabase/migrations/20261106100000_prediction_desk.sql).
- [lantern duels](../supabase/migrations/20261106110000_lantern_duels.sql).
- [relighting](../supabase/migrations/20261106120000_relighting.sql).
- [npc partners](../supabase/migrations/20261106130000_npc_partners.sql).
- [followups](../supabase/migrations/20261106140000_followups.sql).
- [festival](../supabase/migrations/20261106160000_festival.sql).
- [host console](../supabase/migrations/20261106170000_host_console.sql).
- [sports desk](../supabase/migrations/20261106180000_sports_desk.sql).
- [demo window](../supabase/migrations/20261109010000_demo_window.sql).
- [class code](../supabase/migrations/20261109020000_class_code.sql).

The sections below cover **all 45 current application tables and all 333 current columns**. The three old `market_*` tables were dropped by Exchange v2 (`090000`); their replacements are `exchange_positions` and `exchange_events`. Derived views such as `prediction_pool_sides` contain no separate stored rows.

Each table has RLS enabled. Visitors have no direct application-table access. Signed-in players receive only the read grants and row filters stated below; all game writes go through server-authorised operations. New case/world/festival/host/sports/demo tables are server-only, with purpose-built API views rather than browser table grants. Authorised database operators can inspect data beyond these player views.

There is **no automatic account expiry, inactivity purge or course-end deletion date implemented**. Unless an exception is stated below, account-linked rows remain until account deletion. No claim is made about backup erasure or the providers' retention settings; those need a separate check by the project owners. The [player notice](PRIVACY.md) explains the practical choices.

## Application tables

### public.profiles

Source: foundation. Purpose: identify players without displaying their GitHub identity. Readers: **every signed-in player can read every column**, including the ID and signup time, not just the name. Lifetime: until account deletion.

| Column | What it holds and why |
|---|---|
| `id` | Supabase Auth user UUID; joins the player's records to their login. |
| `display_name` | Generated captain name, or initially `Captain-` plus six ID characters; identifies the player in the game. |
| `created_at` | Signup time; records when the player joined. |

### public.saves

Source: foundation, with version meaning changed by accounts. Purpose: resume progress on another visit/device and refuse an older save overwriting a newer one. Readers: the player owning the row. Lifetime: latest data is replaced on a successful save; the row remains until account deletion. There is no separate save-history table here.

| Column | What it holds and why |
|---|---|
| `player_id` | Owner's player UUID. |
| `data` | JSON progress/settings supplied to the save API; not a fixed list of fields. Do not put personal messages or secrets in it. API limit: 100,000 compact JSON bytes; database limit: 200,000 JSON-text bytes. |
| `version` | Count of save writes, starting at 1; detects a stale save. It is no longer a save-format version. |
| `updated_at` | Last write time; shows how recent the save is. |

### public.wallets

Source: foundation. Purpose: hold the current play-coin balance. Readers: the owner. Lifetime: balance changes during play; the row is removed with the account.

| Column | What it holds and why |
|---|---|
| `player_id` | Wallet owner's UUID. |
| `balance` | Current play coins, initially zero; checks available coins. |
| `updated_at` | Last balance-change time. |

### public.wallet_reasons

Source: foundation and Island Exchange. Purpose: shared definitions for coin changes. Readers: every signed-in player. Lifetime: reference data retained independently of accounts; not removed by player deletion. **No personal data in these columns.**

| Column | What it holds and why |
|---|---|
| `reason` | Stable reason ID for a ledger entry. |
| `direction` | Whether that reason adds coins, spends them, or permits either. |
| `description` | Explanation of the reason. |

### public.wallet_transactions

Source: foundation. Purpose: explain coin changes and prevent repeated requests paying twice. Readers: the owner. Lifetime: rows are not edited during normal play; **all of the player's ledger rows are removed on account deletion**, with no player-linked ledger kept behind.

| Column | What it holds and why |
|---|---|
| `id` | Running transaction number; orders the changes. |
| `player_id` | Player whose balance changed. |
| `delta` | Play coins added or spent. |
| `reason` | Type of game action causing the change. |
| `ref` | Action/order/clue reference, at most 120 characters; stops duplicates. |
| `balance_after` | Balance after this change; explains the balance history. |
| `created_at` | Database transaction time. |

### public.crews

Source: foundation, extended by crew codes. Purpose: run shared or solo crews. Readers through direct RLS: players seated in that crew. The server also reads crew/seat details internally to process joining codes; see the access note below. Lifetime: until the crew is removed or its owner is deleted without another human member. A solo draft is also removed when its creator joins another crew. A shared crew can survive account deletion by changing its owner.

| Column | What it holds and why |
|---|---|
| `id` | Crew UUID; joins the crew to its seats. |
| `created_by` | Owner's player UUID; identifies who started/now owns the crew. It changes during deletion handover. |
| `mode` | Solo or crew play mode. |
| `status` | Forming, active or finished; controls joining and play. |
| `created_at` | Crew creation time. |
| `updated_at` | Last crew update time. |
| `code` | Six-symbol joining code; absent on some older crews. Treat it as an invitation, not a private password. |
| `version` | Change counter; refuses actions based on an old crew state. |
| `started_at` | Muster/start time; empty while forming. |

### public.crew_seats

Source: foundation, with kit rules tightened by crew codes. Purpose: show who is in the crew and the kit each seat carries. Readers through RLS: every player seated in that crew. The server reads seat details internally to choose a seat during joining; this is not a browser preview endpoint. Lifetime: the player's seat goes with their account or when the crew is deleted; NPC seats can be replaced by players.

| Column | What it holds and why |
|---|---|
| `crew_id` | Crew this seat belongs to. |
| `seat_no` | Position 1 to 4; also selects the successor during owner deletion. |
| `player_id` | Seated player's UUID, or empty for an NPC. |
| `npc_id` | Computer-controlled partner ID, or empty for a player. |
| `kit` | Entry kit carried by the seat; relates to the player's intro outcome. |
| `joined_at` | Time the seat was taken. |

### public.captain_name_rerolls

Source: accounts. Purpose: allow just one captain-name re-roll and recognise a repeated request. Readers: the owner. Lifetime: until account deletion; not a record of all previous names.

| Column | What it holds and why |
|---|---|
| `player_id` | Player who used the re-roll. |
| `action_uid` | Browser-generated request ID, 8 to 64 characters; detects a repeat. |
| `rerolled_at` | Re-roll time. |

### public.entry_profiles

Source: entry profiles. Purpose: remember the first accepted intro outcome and award its kit once. Readers: the owner. Lifetime: first result is kept until account deletion.

| Column | What it holds and why |
|---|---|
| `player_id` | Player receiving the kit. |
| `ending` | Accepted intro ending. |
| `decision` | Intro decision used to select the kit. |
| `read_log` | Whether the player read the story logbook; enables its clue card. |
| `kit` | Awarded kit ID. |
| `start_place` | Where the player begins after the intro. |
| `kit_coins` | Play coins assigned to that kit. |
| `move_count` | Number of accepted actions; a summary, not the complete move log. |
| `story_sha256` | Hash of the story file replayed by the server; identifies the rules used. |
| `created_at` | Time the entry result was stored. |

### public.crew_join_failures

Source: crew codes. Purpose: slow down crew-code guessing. Readers: server only; no signed-in-player read grant or read policy.

Lifetime: the current rule counts 10 wrong guesses within 10 minutes. The next code lookup by that player removes their attempts older than the window. **This is lazy cleanup, not a guaranteed ten-minute retention limit**: inactive players' rows can remain until another lookup or account deletion.

| Column | What it holds and why |
|---|---|
| `id` | Running attempt-row number. |
| `player_id` | Player making the failed lookup; groups their attempts. |
| `attempted_at` | Attempt time; enforces the guessing window. |

Neither the actual guessed code nor an IP address is stored in this table.

### public.case_state

Purpose: Crew case clock, revision, night and solved state. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Survives member deletion while the crew remains; player actor links become null. Removed with its crew.

| Column | What it holds and why |
|---|---|
| `accuse_wait_until` | Case second after which another accusation may be tried. |
| `case_id` | Case-content identifier. |
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `night_called_by` | Player who called the current or most recent night; null after deletion. |
| `night_no` | Number of the current or most recent night, zero before the first. |
| `night_started_second` | Crew case second when the current or most recent night began. |
| `orders_count` | Count of accepted partner orders; advanced under the crew lock. |
| `pair_wait_until` | Case second after which another deduction pair may be tried. |
| `revision` | Monotonic revision of this crew case state. |
| `schooner_found_second` | Case second when the timed discovery was earned. |
| `solved_by` | Solving player UUID; cleared on deletion. |
| `solved_second` | Case second of accepted solve. |
| `started_at` | Database timestamp anchoring the crew case clock. |
| `updated_at` | Most recent update time. |
| `world_outcome` | Stored world-hook result so a repeated solve cannot relight twice. |

### public.case_finds

Purpose: Crew discoveries, routes, readiness and paid-search attribution. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Survives a member leaving/deleting while the crew remains; nullable actor links are cleared. Removed with the crew.

| Column | What it holds and why |
|---|---|
| `by_partner` | Whether the contribution came from an NPC partner. |
| `card_id` | Internal evidence-card ID; no private player message. |
| `coins_paid` | Play coins paid for this action/build. |
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `order_no` | Crew-scoped NPC order number. |
| `ready_second` | Case second when work becomes available. |
| `route_id` | Selected search route ID. |
| `seat_no` | Contributing or occupying crew seat. |
| `started_by` | Searching player UUID; cleared on deletion. |
| `started_second` | Case second work began. |

### public.case_deductions

Purpose: Accepted shared deductions and contribution timing. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared crew history; actor links become null on player deletion, crew deletion removes rows.

| Column | What it holds and why |
|---|---|
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `deduction_id` | Accepted deduction ID. |
| `formed_by` | Player UUID that formed this deduction; cleared on deletion. |
| `formed_seat` | Seat that formed the shared deduction. |
| `formed_second` | Case second a deduction was accepted. |

### public.case_accusations

Purpose: Accusation attempts and correctness for cooldown/rule checks. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared attempts remain with the player link cleared on account deletion; crew deletion removes them.

| Column | What it holds and why |
|---|---|
| `case_second` | Elapsed case-clock second of this action. |
| `correct` | Server-computed accusation correctness. |
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `id` | Internal primary key or singleton identifier. |
| `player_id` | Verified player UUID linking this account-owned record. |
| `seat_no` | Contributing or occupying crew seat. |
| `suspect` | Offered suspect ID selected in an accusation. |

### public.case_solvers

Purpose: Each solving player’s kit, contribution and once-only reward. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Player rows are removed on account deletion; crew deletion also removes them.

| Column | What it holds and why |
|---|---|
| `contributor` | Whether this player qualified as a contributor. |
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `kit` | Accepted entry-kit ID. |
| `player_id` | Verified player UUID linking this account-owned record. |
| `seat_no` | Contributing or occupying crew seat. |
| `share` | Allocated play-coin reward share. |
| `share_paid` | Whether the allocated share was already paid. |
| `solved_second` | Case second of accepted solve. |

### public.case_actions

Purpose: Exact intent receipts scoped to player and crew. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Player receipts are removed on account deletion; crew deletion also removes them.

| Column | What it holds and why |
|---|---|
| `action_uid` | Caller-supplied repeat identity scoped to its verified player/host. |
| `case_second` | Elapsed case-clock second of this action. |
| `created_at` | Database creation time. |
| `crew_id` | Crew UUID linking shared game records. |
| `id` | Internal primary key or singleton identifier. |
| `kind` | Type of action/event/order. |
| `outcome` | Accepted rule outcome or settlement result. |
| `player_id` | Verified player UUID linking this account-owned record. |
| `target` | Requested game target, not a private message. |

### public.islets

Purpose: Player timber balance for home-islet construction. Readers: Owner through direct RLS. Lifetime: Removed with the player account.

| Column | What it holds and why |
|---|---|
| `created_at` | When the islet row was made, which is when the player built for the first time. |
| `player_id` | The player this islet belongs to. It is also the primary key, so there is exactly one islet row per player and the starter pack arrives only once. Deleting the player deletes the row. |
| `timber` | Whole pieces of timber the player holds. Never below 0. Not coins, so there is no ledger row: islet_buildings.timber_paid records what each building took. |
| `updated_at` | When the timber last changed. Set by the database. |

### public.islet_buildings

Purpose: Accepted building levels and timber/play-coin costs. Readers: Owner through direct RLS. Lifetime: Removed with the player account.

| Column | What it holds and why |
|---|---|
| `building_type` | What stands on the plot: workshop, windmill, greenhouse or signal_station on the home islet, or wall, cannon, watchtower or house on the island (migration 20261110010000). Each plot holds only its own kind of building (a check rule). The finale counts the rows of type signal_station. |
| `built_at` | When the database transaction of the build started. |
| `coins_paid` | Whole coins the player paid for the building, at least 1. The wallet ledger has the matching row (reason building_purchase, the same ref). |
| `level` | The level of the building, from 1 to 3. islet_build() builds level 1. Levels 2 and 3 come with the upgrades of a later migration. |
| `player_id` | The player whose islet the building stands on. With plot it is the primary key, so a plot holds one building. Deleting the islet deletes this row. |
| `plot` | The spot: plot_2, plot_3, plot_4 or islet_signal_station (backend/content/buildings.json), or wall_1..4, cannon_1..4, tower_1, house_1..2 (backend/content/islands.json). The cabin has no row. |
| `ref` | islet: (home islet) or island: (island) plus the actionUid the browser made for the click, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot build or charge twice. The wallet ledger row of the build uses the same ref. |
| `timber_paid` | Whole pieces of timber the building took from the islet. Timber has no ledger, so this column is the only record of it. |

### public.islands

Purpose: Each player's own island for the island game: its code, so friends can visit and defend it, and its progress. Readers: Server only (no browser policy); `GET /api/island` shows the owner, and `GET /api/island/visit/{code}` shows anyone signed in who knows the code the captain name, best wave and buildings. Lifetime: Removed with the player account; the fresh-start admin script resets the best wave and flags but keeps the code.

| Column | What it holds and why |
|---|---|
| `code` | The island code (5 symbols, shown as ISLE-<code>), made by the server at random. Not a secret: it lets another player look at the island and defend it. |
| `created_at` | When the island was first opened. |
| `flags` | Pirate flags won on this island: one per survived wave. |
| `player_id` | The owner's player UUID, also the primary key. |
| `updated_at` | When the best wave or the flags last changed. |
| `wave_best` | The highest wave survived on this island. |

### public.wave_runs

Purpose: Every pirate wave a player started, on an island or on Pirate Point, so the server can hand out one shared seed, allow one running wave per island, check the timing and pay capped loot once. Readers: Server only (no browser policy); the player sees their own wave through the wave routes. Lifetime: Removed with the player who started it, or with the island it was fought on; the fresh-start admin script removes every row.

| Column | What it holds and why |
|---|---|
| `action_uid` | The retry identity of the bell click, scoped to the player. |
| `created_at` | Database time of the bell. |
| `expired` | Whether the wave was closed because nobody finished it in time. |
| `flag_counted` | Whether the wave's one best wave and flag were counted (at the first survived finish). |
| `finished_at` | When the wave was finished or closed. |
| `id` | The wave id; the loot's ledger ref is `wave:<id>`. |
| `island_owner` | The owner of the island the wave was fought on; empty on Pirate Point. |
| `loot` | Play coins paid to the first player who finished the wave (each participant's own loot is in wave_participants). |
| `maximum_seconds` | After this long the wave is over and pays nothing. |
| `minimum_seconds` | A finish earlier than this after the countdown is refused. |
| `place` | `island` or `pirate_point`. |
| `seed` | The random seed every client feeds into the same wave simulation. |
| `ships_sunk` | Ships sunk, as the player's browser reported it. |
| `started_by` | The player UUID of who rang the bell (only they may finish it and get the loot). |
| `starts_at` | When the ships come (the bell plus the countdown). |
| `survived` | Whether the island held, as the player's browser reported it. |
| `wave` | The wave number. |
| `weather_fog` | How much fog hid the ships (from the real weather where the bell was rung, else the game's default place; the place itself is never stored). |
| `weather_kind` | The weather state at the start: storm, fog, rain or calm. |
| `weather_ships` | How many ships compared with calm weather. |

### public.wave_participants

Purpose: Every player in a pirate wave (the bell-ringer and everyone who joined), so each gets their own capped loot once. Readers: Server only (no browser policy); a player sees their own result through the wave routes. Lifetime: Removed with the player, or with the wave run; the fresh-start admin script removes every wave run and so these rows too.

| Column | What it holds and why |
|---|---|
| `expired` | Whether the player finished too late and so got nothing. |
| `finished_at` | When the player finished their part. |
| `joined_at` | When the player rang the bell or joined. |
| `loot` | Play coins paid to this player for the wave. |
| `player_id` | The participant's player UUID. |
| `ships_sunk` | Ships sunk, as this player's browser reported it. |
| `survived` | Whether the island held, as this player's browser reported it. |
| `wave_id` | The wave. |

### public.board_pins

Purpose: Shared pinned evidence and contribution credit. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared crew history remains; nullable player attribution is cleared on deletion. Crew deletion removes it.

| Column | What it holds and why |
|---|---|
| `by_partner` | Whether the pin was ordered for a partner. |
| `card_id` | Public card identifier, from C1 to C8. |
| `coins_rewarded` | Clue coins actually paid, zero for a previously rewarded card. |
| `created_at` | Database time when this immutable history row was created. |
| `crew_id` | Crew whose case owns this record. |
| `order_no` | Partner order number when applicable. |
| `ordered_second` | Crew case second when a player pinned or ordered the partner pin. |
| `pinned_by` | Player credited for this pin, including a partner orderer; null after deletion. |
| `pinned_second` | Crew case second when this pin becomes available for pairing. |
| `seat_no` | Kit seat number, from one to four. |

### public.finale_posts

Purpose: Light-post occupancy by a player or NPC and its lifetime. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with the crew; deleting a player cascades their occupancy rows.

| Column | What it holds and why |
|---|---|
| `created_at` | Database time when this immutable history row was created. |
| `crew_id` | Crew whose case owns this record. |
| `ended_second` | Crew case second when explicitly ended; null while not explicitly ended. |
| `id` | Database-generated history identifier. |
| `light_id` | Public light identifier. |
| `npc_id` | Partner holding this duty; exactly one of player_id and npc_id is set. |
| `on_post_second` | Crew case second when the climb finishes and aiming becomes possible. |
| `order_no` | Partner order number when applicable. |
| `player_id` | Player holding this duty; exactly one of player_id and npc_id is set. |
| `seat_no` | Kit seat number, from one to four. |
| `taken_second` | Crew case second when the duty started. |

### public.finale_signals

Purpose: Aimed bearings, lock deadlines and earned finale completion. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared crew history remains with nullable player attribution cleared; crew deletion removes it.

| Column | What it holds and why |
|---|---|
| `aimed_by` | Player who aimed, including a player aiming a partner light; null after deletion. |
| `aimed_seat_no` | Seat of the player who aimed. |
| `bearing` | Normalised compass bearing in degrees to one decimal, from zero below 360. |
| `case_second` | Crew case second when the aim happened. |
| `created_at` | Database time when this immutable history row was created. |
| `crew_id` | Crew whose case owns this record. |
| `ended_second` | Crew case second when explicitly ended; null while not explicitly ended. |
| `holds_until_second` | Exclusive lock expiry second, set only for on-target aims. |
| `id` | Database-generated history identifier. |
| `light_id` | Public light identifier. |
| `night_no` | One-based night whose aims are recorded. |
| `on_target` | Whether this aim hit the server-computed target. |
| `parted` | Whether this lock contributed when the fog parted. |
| `post_seat_no` | Seat holding the light when aimed; distinct post seats are required. |

### public.exchange_positions

Purpose: Leveraged long/short positions and open/close values, fees and retry references. Readers: Owner through direct RLS. Lifetime: Open and closed rows remain until the owner deletes their account.

| Column | What it holds and why |
|---|---|
| `close_fee` | Whole coins of closing fee, taken from the value and never more than it. Always 0 for a zeroed position. Empty while it is open. |
| `close_price` | The price it was closed at (for a zeroed position the price that reached the zero point). Empty while it is open. |
| `close_ref` | The ref of the closing: market:close: plus the actionUid for a closing by the player, market:zero: plus the position id for a close at zero. Empty while it is open. |
| `close_value` | Whole coins the position was worth when it closed, before the closing fee. Never below 0. Always 0 for a zeroed position. Empty while it is open. |
| `closed_at` | When the position was closed. Empty while it is open. |
| `company_id` | The company, as written in backend/content/market/companies.json: lowercase letters, digits and hyphens, for example harbor-trust. |
| `entry_price` | The real price of the company when the position opened, with at most 8 decimals. |
| `id` | The position, a random id. |
| `leverage` | How many times a price move counts: always 10. A move of 1 percent changes the position by 10 percent of the stake. |
| `open_fee` | Whole coins of fee paid when the position opened: 2 percent of the stake, rounded up (1 percent after the Relighting). At least 1. |
| `open_ref` | market:open: plus the actionUid the browser made for the click, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot open twice. |
| `opened_at` | When the database transaction of the opening started. The automatic close only closes a position with a price that was quoted after this moment. |
| `player_id` | The player who holds the position. Deleting the player deletes this row. |
| `price_mode` | Which kind of prices the position was opened on: live (the real feed) or replay (the recorded demo day). The position can only be closed with prices of the same kind. |
| `side` | rising: the player gains when the price goes up. falling: the player gains when the price goes down. |
| `stake` | Whole coins the player put in. The fee comes on top and is not part of the stake. |
| `status` | open, closed (the player closed it) or zeroed (the stake was used up and the position closed at zero). |
| `zero_price` | The price where the stake is used up: 90 percent of the entry price for a rising position, 110 percent for a falling one. At or beyond it the position closes at zero. |

### public.exchange_events

Purpose: Append-only opening/closing/zero events and coin changes. Readers: Owner through direct RLS. Lifetime: Removed with the player account, including its event history.

| Column | What it holds and why |
|---|---|
| `coins_change` | What reached the wallet: minus (stake + fee) for open, value minus fee for close, 0 for zero. |
| `company_id` | The company, as written in backend/content/market/companies.json. |
| `created_at` | When the database transaction of the event started. |
| `fee` | Whole coins of fee of this event: the opening fee for open, the closing fee for close, 0 for zero. |
| `id` | Running number in the order the events happened. Order the rows of a player by id. |
| `kind` | open (a position was opened), close (the player closed it) or zero (a price reached its zero point and it closed at zero). |
| `player_id` | The player whose position changed. Deleting the player deletes this row. |
| `position_id` | The position. Deleting the position deletes this row. |
| `price` | The price of the event: the entry price for open, the closing price for close and zero. |
| `ref` | The ref of the action, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot act twice. The wallet ledger rows of the action use the same ref. |
| `side` | rising or falling, as in the position. |
| `stake` | The stake of the position, in whole coins. |
| `value` | Whole coins the position was worth. 0 for open and zero. |

### public.prediction_pools

Purpose: Public question closing/result state and aggregate settlement totals. Readers: All authenticated players through direct RLS; public question views through the API. Lifetime: Shared game data retained independently of one account; only public result labels and aggregate totals are retained, not a payout list.

| Column | What it holds and why |
|---|---|
| `closes_at` | When staking closes: the closing time the server knew at the first stake. Nothing ever changes it. At every later stake the earlier of this time and the closing time the server knows at that moment counts, so the stored closing time never moves later. |
| `created_at` | When the pool row was created, by the first stake or by the settlement. |
| `cut_coins` | Coins that left the game: 5 percent of the coins on the losing side, rounded down. 0 for a refund. Empty while the pool is open. |
| `outcome` | How the question was decided: yes, no, or void (cancelled or unclear). Empty while the pool is open. |
| `paid_coins` | Coins paid out to the players. The paid coins plus the cut are exactly the coins staked. Empty while the pool is open. |
| `question_id` | The question, as written in backend/content/predictions/questions.json: lowercase letters, digits and hyphens, for example groundhog-2027. Never rename a question while its pool is unsettled. |
| `settled_at` | When the pool was settled. Empty while the pool is open. |
| `settled_by` | Who settled the pool: host (a presenter pressed the button) or auto (the server, after Manifold decided and a grace period). Empty while the pool is open. |
| `settlement` | How the pool ended: winners (the winning side shared the pool), refund_void (the question is void), refund_no_winners (nobody picked the winning side) or refund_one_sided (everybody picked the same side). Empty while the pool is open. |
| `status` | open until the pool is settled, then settled. A pool settles once, and a settled pool is final: a trigger refuses every change to its row. |

### public.prediction_stakes

Purpose: Each player’s question choice, stake, payout and retry reference. Readers: Owner through direct RLS. Lifetime: Removed with the player account.

| Column | What it holds and why |
|---|---|
| `amount` | Whole coins staked. Always above 0. The server limits one stake to 50 coins. |
| `created_at` | When the database transaction of the stake started. The daily cap counts stakes from the start of the Lisbon day. |
| `id` | Running number in the order the stakes were placed. A pool uses it to break ties, so the earliest stake wins a tie. Order the stakes of a player by id. |
| `payout` | Coins paid back when the pool was settled: 0 for a lost stake, more than the stake for a win, the stake for a refund. Empty while the pool is open. |
| `player_id` | The player who staked. Deleting the player deletes this row. |
| `question_id` | The pool the stake belongs to (a row of prediction_pools). |
| `ref` | stake: plus the stake_id: the ref of the wallet ledger row that took the coins. |
| `side` | yes or no. |
| `stake_id` | The id the browser made for the click: 8 to 64 letters, digits, underscores or hyphens. For one player it can be used only once, so a repeated request cannot stake twice. |

### public.duels

Purpose: Challenge participants, stake, deadline, public round results and outcome. Readers: Participants through direct RLS; API challenge lists disclose only permitted summaries. Lifetime: Challenger deletion cascades the duel and moves; opponent deletion clears its link. Other historical values follow those row rules.

| Column | What it holds and why |
|---|---|
| `answered_at` | When the other captain answered. Empty unless the duel is finished. |
| `challenger_id` | The captain who sent the challenge. Deleting the captain deletes the duel. |
| `closed_at` | When the duel ended in any way. Empty exactly while the duel is open. |
| `create_uid` | The actionUid of the click that sent the challenge, 8 to 64 letters, digits, hyphens or underscores. For one challenger the same value can be used only once, so a repeated click cannot send two challenges. |
| `created_at` | When the challenge was sent. |
| `cut_percent` | The share of the pot that is not paid out, in percent. Fixed when the duel is created, so a later change of the cut never touches a running duel. |
| `expires_at` | The end of the answer window: 24 hours after creation. Must be after created_at. The database clock decides whether it has passed. |
| `id` | The duel. The ledger ref of every coin movement of the duel is duel: plus this id. |
| `is_open` | True: any captain except the challenger may answer, and the first answer wins. False: only the named captain may answer. |
| `opponent_id` | The named captain, or the captain who answered an open challenge. Empty for an open challenge nobody answered yet. Set to empty (not deleted) when that captain is deleted, so a duel whose stake is still held never disappears. |
| `outcome` | challenger, opponent or draw. Filled exactly when the duel is finished. |
| `round_results` | One entry per round: challenger, opponent or even (a round that scored for nobody). Worked out by the server and checked by duel_answer(). Filled exactly when the duel is finished. |
| `rounds` | The number of rounds: 3 or 5. It is also the lantern oil each captain has: Flash burns 2, Mirror 1 and Shade 0. |
| `stake` | The stake each captain puts in, in whole coins: 0 (a friendly duel), 10, 25, 50 or 100. The server only offers those five. The table refuses more than 100. |
| `status` | open, finished, withdrawn, declined or expired. A duel starts open and ends once in one of the other four. A closed duel never changes again. |

### public.duel_moves

Purpose: Sealed player signals and repeat identities, one per round. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed when that player or its duel is deleted. Signals are server-only until authorised participant reveal.

| Column | What it holds and why |
|---|---|
| `action_uid` | The actionUid of the click that sealed the envelope. For the challenger it is the create_uid of the duel. |
| `duel_id` | The duel. Deleting the duel deletes its envelopes. |
| `player_id` | The captain who sealed the signal. Deleting the captain deletes their envelope. |
| `round_no` | The round, counted from 1. |
| `sealed_at` | When the signal was sealed. Never shown to anyone. |
| `signal` | flash, shade or mirror. Flash outshines Shade, Shade leaves Mirror nothing to throw back and Mirror throws Flash back. |

### public.world_state

Purpose: Shared first Relighting time, solve count and later-solve extra lights. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared singleton retained; first-crew link becomes null when that crew is deleted.

| Column | What it holds and why |
|---|---|
| `extra_lights` | Later crew lamps, capped at 12. |
| `first_crew_id` | First open solving crew; cleared if that crew is deleted. |
| `id` | Always 1, enforced by a check. |
| `relit_at` | Time of the first open solve; never moved by later solves. |
| `solves` | Lifetime count of open qualifying crew solves. |
| `stage` | dark until the first accepted solve with the server relight switch open. |
| `updated_at` | Time of the most recent qualifying solve. |

### public.world_solves

Purpose: Once-per-crew solve order and timestamp. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with its crew; the shared world counter is not decremented.

| Column | What it holds and why |
|---|---|
| `crew_id` | Qualifying crew; removed if that crew is deleted. |
| `solve_no` | Unique positive solve order, allocated while the shared coast is locked. |
| `solved_at` | Time the qualifying solve transaction began. |

### public.wall_of_lights

Purpose: Contributing player IDs resolved to current generated captain names for the public wall. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed when the player deletes their account; crew link becomes null if the crew is deleted.

| Column | What it holds and why |
|---|---|
| `added_at` | Time the contributor first reached the Wall. |
| `crew_id` | First qualifying crew; cleared if the crew is deleted. |
| `player_id` | Contributor profile; account deletion cascades the Wall entry. |
| `solve_no` | Order of this contributor first qualifying for the Wall. |

### public.npc_orders

Purpose: Free scripted partner errands, targets, timings and exact retry identity. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared crew history; ordering-player link becomes null on deletion. Removed with the crew.

| Column | What it holds and why |
|---|---|
| `action_uid` | Ordering player action receipt, unique with ordered_by for exact deterministic replay. |
| `arrive_second` | Crew case second when a fetch reaches its place; null for pin-only and light orders. |
| `created_at` | Database time when this immutable order history was created. |
| `crew_id` | Crew whose case owns this partner order. |
| `found_second` | Crew case second when the fixed card find becomes available; null for pin-only and light orders. |
| `kind` | Accepted partner order kind; the minimum exposes fetch and man_light. |
| `npc_id` | Partner holding this seat when the order was accepted. |
| `order_no` | Consecutive accepted order number within the crew. |
| `ordered_by` | Player who ordered and receives pin credit; null after account deletion. |
| `ordered_second` | Crew case second when the order was accepted. |
| `pin_second` | Crew case second when the ordered pin becomes available for pairing. |
| `price` | Recorded route price, always zero while paid errands are disabled. |
| `ready_second` | Crew case second when this partner is free to accept another order. |
| `result_card` | Public card identifier fixed at acceptance when applicable. |
| `route_id` | Free route fixed at acceptance; null for an already held card or light duty. |
| `seat_no` | Partner seat number, from one to four. |
| `target` | Public card or light identifier requested by the player. |

### public.festival_control

Purpose: Singleton lock that serialises festival matching. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared reference row; no player data and no event-expiry purge.

| Column | What it holds and why |
|---|---|
| `id` | The single serialization row for festival writes, independent of world solve locks. |

### public.festival_actions

Purpose: Immutable per-player claim/join/leave receipts. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with the player account; event expiry alone does not purge history.

| Column | What it holds and why |
|---|---|
| `action_uid` | Exact caller-generated click receipt, unique per player. |
| `created_at` | Database time when this action result was recorded. |
| `kind` | The claim, join or leave operation originally accepted or refused. |
| `player_id` | Verified player who made this action; deleted with their account. |
| `reply` | Immutable public-safe result without sealed signals or another player id. |

### public.festival_claims

Purpose: Free lamp reservation owner and time, separate from extra lights. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with the player account. Hidden from event views after expiry, not automatically erased then.

| Column | What it holds and why |
|---|---|
| `claimed_at` | Database time when this reservation was accepted. |
| `lamp_id` | Canonical festival_lamp_01 to festival_lamp_12 spot identifier. |
| `player_id` | Current reservation owner, cleared by account deletion. |

### public.festival_queue

Purpose: Private three-signal friendly-ring queue and pairing history. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with the player account; duel deletion clears its duel link. Event expiry does not erase rows.

| Column | What it holds and why |
|---|---|
| `created_at` | Database entry time used with id for deterministic FIFO order. |
| `duel_id` | Actual friendly A7 duel once paired, null if that duel is deleted. |
| `id` | Server-generated immutable queue entry identifier. |
| `player_id` | Verified waiting or paired captain, cleared by account deletion. |
| `signals` | Three sealed A7 signals, visible only to server code. |
| `state` | Queued, paired or left; old entries remain history. |

### public.host_console_actions

Purpose: Host-scoped once-only successful test-crew close audit. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Preserved when a crew is deleted; removed if its host deletes their account. No names or tokens stored.

| Column | What it holds and why |
|---|---|
| `action_uid` | Retry identity scoped to this host. |
| `created_at` | Database time of the successful close. |
| `crew_id` | Crew closed once; no cascading deletion of audit. |
| `host_id` | Verified host who requested the close. |

### public.host_console_health

Purpose: Last successful keep-alive time. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared operational row; no player identifier.

| Column | What it holds and why |
|---|---|
| `name` | Only the keepalive check is currently recorded. |
| `succeeded_at` | Database time after all three keep-alive reads succeeded. |

### public.fixtures

Purpose: Sports fixture identity, score, provider verification and aggregate settlement state. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Shared game data retained independently of a player; recorded sources cannot authorise stake settlement.

| Column | What it holds and why |
|---|---|
| `away` | Public away-team name. |
| `away_score` | Verified away-team score. |
| `closes_at` | Deadline for new stakes. |
| `competition` | Public competition label. |
| `created_at` | Database creation time. |
| `cut_coins` | Aggregate play-coin cut retained by game rules. |
| `fixture_id` | Canonical provider fixture ID. |
| `home` | Public home-team name. |
| `home_score` | Verified home-team score. |
| `kickoff` | Fixture start timestamp. |
| `outcome` | Accepted rule outcome or settlement result. |
| `paid_coins` | Aggregate play coins paid out. |
| `provider` | Configured public sports-data source. |
| `provider_match_id` | Upstream public fixture identifier. |
| `result_status` | Provider result state used to verify finality. |
| `settled_at` | Time settlement completed. |
| `settlement` | Settlement mode such as winners or a refund reason; not a player list. |
| `sport` | Sport category. |
| `status` | Current state in this system. |
| `verified_at` | Time the result was verified from its source. |

### public.sports_stakes

Purpose: Player fixture choice, play-coin amount, payout and repeat identity. Readers: Server only; API views apply authentication, crew/participant ownership and earned-information rules. Lifetime: Removed with the player account.

| Column | What it holds and why |
|---|---|
| `amount` | Play-coin stake amount. |
| `created_at` | Database creation time. |
| `fixture_id` | Canonical provider fixture ID. |
| `id` | Internal primary key or singleton identifier. |
| `payout` | Play coins returned/awarded on settlement. |
| `pick` | Chosen sports result. |
| `player_id` | Verified player UUID linking this account-owned record. |
| `stake_id` | Stable per-player stake repeat identity. |

### public.demo_window

Purpose: The class demo's single guest-play window (D029), unused since the class code (D030) and kept in place. Readers: Server only (no route reads it any more). Lifetime: One shared operational row; the last host's ID is cleared when that host deletes their account.

| Column | What it holds and why |
|---|---|
| `changed_at` | Database time of the last switch. |
| `changed_by` | Verified host who switched the window last, cleared on account deletion. |
| `name` | Always `class_demo`. |
| `open_until` | End of the guest-play window, or null while closed. |

### public.demo_window_actions

Purpose: Host-scoped once-only switches of the demo window. Readers: Server only. Lifetime: Removed with the host account.

| Column | What it holds and why |
|---|---|
| `action_uid` | Retry identity scoped to this host. |
| `created_at` | Database time of the switch. |
| `host_id` | Verified host who switched the window. |
| `hours` | Hours asked for: 0 closes, 1 to 6 opens. |
| `open_until` | End time this switch set, or null for a close. |

### public.demo_class_code

Purpose: The current class code that lets an anonymous guest in (D030). Readers: Server only; the host sees it through `GET /api/host/demo`; it is never in `GET /api/config` or a log. Stored as plain text so the host can show it again. Lifetime: One shared operational row; replaced by each new code; the host's ID is cleared when that host deletes their account.

| Column | What it holds and why |
|---|---|
| `code` | The current 5-symbol class code, or null before the first one. |
| `name` | Always `class_demo`. |
| `set_at` | Database time the current code was made. |
| `set_by` | Verified host who made the current code, cleared on account deletion. |

### public.demo_class_code_actions

Purpose: Host-scoped once-only "New class code" clicks, and the audit of code changes. Readers: Server only. Lifetime: Removed with the host account. Old codes here let nobody in.

| Column | What it holds and why |
|---|---|
| `action_uid` | Retry identity scoped to this host. |
| `code` | The code this click set. |
| `created_at` | Database time of the click. |
| `host_id` | Verified host who made the code. |

### public.demo_guests

Purpose: The anonymous guests who presented a valid class code; read by the guest gate and by the browser policies through `is_admitted_guest()`. Readers: Server only (the policy helper answers only yes or no for the caller). Lifetime: Removed with the player account (cascade from `auth.users`), so the automatic and manual guest clean-up and **Delete my data** remove it. A new code removes nobody.

| Column | What it holds and why |
|---|---|
| `admitted_at` | Database time of the first admission. |
| `player_id` | The admitted guest's player UUID. |

### public.demo_lock_attempts

Purpose: Keeper's Lock answers and the server's verdicts, for retries, the hint path and "opened". Readers: Server only; the player sees their own verdicts through the lock routes. Lifetime: Removed with the player account. No place, coordinates, IP address or weather reading is stored.

| Column | What it holds and why |
|---|---|
| `accepted` | Whether the answer opened the lock. |
| `action_uid` | Stable per-player answer repeat identity. |
| `answer` | Chosen sky or riddle choice id, or `hint` / `hint_confirm`. |
| `created_at` | Database time of the answer. |
| `outcome` | Server verdict: exact, close, hint, clue, wrong, hint_too_early, hint_offered or question_changed. |
| `player_id` | Verified player UUID linking this account-owned record. |

## Access beyond direct table reads

The [crew join route](../backend/server/routes/crews.py) uses the [crew service](../backend/server/crews/service.py) and server-only `crew_find_by_code()` to look up a code and choose a seat internally. The lookup includes crew ID/status/version and seat/player/NPC/kit details for the server; it is not exposed as a browser preview endpoint. After joining, the API returns a crew view with names, kits and seat details, omitting player UUIDs and the version counter. Direct database RLS still lets members read every column of their crew and seats, including player UUIDs, codes and timestamps.

The server's privileged database role has broader rights than player RLS. Some rules such as “write only through this function” are team conventions in addition to SQL grants; they are not a promise that administrators cannot see or change data. See [the grant matrix](../supabase/README.md#who-may-do-what).

## Login, browser data, memory and logs

These are outside the application tables:

| Data/place | Why and who receives it | Lifetime / deletion limits |
|---|---|---|
| Supabase-managed Auth users, identities and sessions | GitHub sign-in account details, or the email address of an email code sign-in (the project's mail provider receives it to deliver the code; never shown to other players), or an anonymous guest user during the class demo (no e-mail until a guest confirms one; the host deletes guests older than 24 hours by reading Supabase Auth's admin user list), user UUID and login/session information. The game uses the verified UUID, not the GitHub name/email as a public captain name. Supabase's internal schema is not defined by these migrations. | The implemented delete function removes the Auth user and associated identities/sessions. GitHub's own account and records remain. Hosted behavior still needs a live test. |
| Supabase `auth.audit_log_entries` | Auth events may include actor UUID, login email and IP address; accessible to authorised service/project operators. | Not removed by the game's delete function; no user foreign key triggers cleanup. The game does not purge provider audit rows. No fixed provider retention duration is established here. |
| Vercel/Supabase platform logs and backups | Request/network metadata, service operation and diagnostics; provider and authorised project operators may have access. | Account deletion does not clear them. Provider settings/schedules govern retention; this repository sets no numeric duration or backup-erasure guarantee. |
| Application server logs | Ordinary auth/code/database warnings use status/error type or code; HTTP client INFO URLs are suppressed because database URLs may include player IDs. Unexpected errors log method, path and an exception traceback, so logs must not be described as anonymous. | Provider/runtime retention, outside account-row deletion. Successful deletion logs a generic message without the player ID. |
| Auth verification memory cache | SHA-256 token fingerprint, player UUID and expiry; recognises a verified token for up to 60 seconds. Raw tokens are not stored in this cache. | Removed lazily or on process exit, not explicitly purged by deletion. A deleted player's token may pass the same instance's check briefly. A validity window is not a guaranteed memory-erasure time. |
| Market rate-limit memory | Player UUID and recent trade timestamps; limits requests in a 30-second window. | Cleaned on reuse, when the map grows beyond 5,000 players, or process exit; deletion does not explicitly purge it. The counting window is not a maximum retention time. |
| Demo gate and Keeper's Lock memory | Player UUIDs of guests already given a name and kit (at most 5,000), player UUIDs of admitted guests for 10 seconds (at most 5,000), the class-code join budget (per-player UUIDs and SHA-256 fingerprints of network addresses with try times, 10 minutes), per-player lock/search request times, the weather of rounded places (0.1 degree) for 10 minutes and place-search texts with their results for 24 hours. The player's own place (from Vercel's IP geolocation headers or chosen by them) is used for one request and never stored or logged. | Process memory only; dropped oldest-first, lazily, or on process exit; deletion does not explicitly purge it. |
| `HOST_PLAYER_IDS` configuration | Host player UUIDs, used by the server to restrict presenter routes. | Kept in server settings until an operator changes them; account deletion does not edit configuration. |
| Browser `plot_twist_preferences_v1` (local storage) | Version, graphics quality, master/music/effects volume, reduced motion, text speed, colourblind setting, captain visibility (`showCaptains`: everyone/crew/off), guidance toggle (`hintsEnabled`) and up to 100 dismissed hint IDs (`dismissedHints`). Same-origin browser code can read it. | No expiry; overwritten by preference changes, removed when site data is cleared. Not cleared by account deletion. |
| Browser `plot_twist_intro_moves_v1` (local storage) | Version and intro action IDs; replays the local story on reload. | No expiry; a new/restarted intro replaces the action list. Clear site data to remove it. Not cleared by account deletion. |
| Browser `plot_twist_quests_v1` (local storage) | Class demo quest ticks (Wave, Duel, Keeper's Lock) for up to 12 players, each under `captain:<captain name>` or `device`. | No expiry; the oldest player is dropped beyond 12. Clear site data to remove it. Not cleared by account deletion. |
| Browser `plot_twist_path_v1` and `plot_twist_front_door_v1` (local storage) | `full` or `demo`, the path the player chose; `1` once the front-door intro has been seen. | No expiry. Clear site data to remove them. Not cleared by account deletion. |
| Browser `plot_twist_join_v1` (tab session storage) | The class code from `?join=` or the Join page (5 symbols), or `harbor` from the in-game button, so the tab joins the class harbor. A refused code is removed. | Removed when the tab session ends or site data is cleared. |
| Browser `plot_twist_lock_place_v1` (tab session storage) | The place a player picked with "Change place" at the Keeper's Lock: name, latitude, longitude. Sent to the game server with lock requests; never stored by the server. | Removed by "Use my area again", when the tab session ends or site data is cleared. |
| Browser `plot-twist-save-v1` (legacy/helper local storage) | Scene, inventory, flags, ending state and message. Present in the helper, not wired to the current game's intro, which uses memory storage. | Old/helper values can remain until cleared; do not assume every player has this key. |
| Browser `auth-check-verifier` (session storage) | Temporary random PKCE secret used by the team sign-in check page. | Removed on exchange or “Forget me”; otherwise the tab session. It is not the login token. |
| Browser `plot-twist-auth-v1` namespace (tab session storage) | The Supabase SDK's sign-in session, including tokens and user details returned by Supabase, plus temporary PKCE verifier entries for GitHub sign-in. The current game uses tab session storage, not local storage or application cookies, for this namespace. | Reload can restore sign-in; the browser manages the tab session's lifetime and browser session restoration can preserve it. Sign-out or a rejected session removes owned session/verifier entries when storage permits. Sign-in return handling removes verifier entries; an abandoned flow can leave them until cleanup or the tab session ends. Normal app disposal preserves the stored session. |
| Browser login-token memory | Current access token used by the API client and connected Realtime rooms. It is copied from the SDK session; the SDK's stored session above is a separate copy. | The page's memory is lost on reload and cleared on sign-out or a rejected session. Reload can restore it from the stored SDK session. None of these steps deletes server records or guarantees provider-session revocation. |
| Realtime rooms | Supabase private world/place rooms distribute transient captain presence, game position and preset emotes when connected. The class harbor room (`live:place:class_harbor:1`) shows up to 40 other captains; positions and emotes are display-only, and lamp states and duel invitations travel as transient extras there. Crew rooms carry server-only change notifications that tell members to refetch; they do not carry case data. Room access is checked by database policies. | Connection/presence state is transient; provider transport and diagnostic retention is separate. The browser adapter connects these rooms when signed in and live presence is enabled. |

The game code does not set application cookies and includes no advertising or analytics integration found in this review. GitHub/Supabase sign-in pages and hosting may use their own cookies and logs. Clearing site data removes local progress/preferences, not cloud records. The standalone privacy page writes no storage or cookies and makes no API calls.

Sources: [settings](../frontend/src/settings/logic.js), [intro journal](../frontend/src/story/intro-journal.js), [legacy storage helper](../frontend/src/story/storage.js), [session](../frontend/src/online/session.js), [game auth](../frontend/src/online/auth.js), [auth storage](../frontend/src/online/auth-storage.js), [live presence](../frontend/src/online/case-adapter/presence.js), [sign-in check](../frontend/public/auth-check.js), [PKCE](../frontend/public/auth-check-pkce.js), [auth cache](../backend/server/auth.py), [market limiter](../backend/server/market/limits.py), [server logging](../backend/server/errors.py), [HTTP logging](../backend/server/app.py), [host configuration](../backend/server/settings.py).

## Outside services

| Service | What it receives / current use |
|---|---|
| GitHub | Browser visits for sign-in and GitHub's own account/authentication handling. GitHub and Supabase exchange provider identity information to establish a login. This is a browser redirect flow, not a server-only data feed. |
| Supabase | Authentication codes/verifiers, token checks and the game's stored account/activity data. The setup guide selects West EU (Ireland) for the database project; its actual deployed region/settings were not checked here. |
| Vercel | Browser/API requests, network metadata and backend logs. Functions are configured for Dublin (`dub1`); this does not establish that every CDN request, log or backup stays in Dublin. |
| Open-Meteo | Server-side weather calls with the configured game place's latitude/longitude and requested weather fields/units. No browser geolocation or player ID/token is sent in the parameters. Provider sees the server's network metadata. Demo mode uses a recording. The Keeper's Lock (class demo) also sends the player's place rounded to 0.1 degree (from Vercel's city-level IP headers or the player's chosen place) and, for "Change place", the typed search text to the geocoding API; neither is stored. |
| Binance | Server-side public price calls with instrument symbols, not a player's holdings, orders, identity or login token. No real trading account is opened. Provider sees the server's network metadata. Feature flags/demo mode can use no live feed. |
| Finnhub | Integrated stock-price source; receives public stock symbols from the server, never a player ID, token, position or game stake. |
| Manifold | Integrated public question/result source; requests use public market IDs, not player stakes or identity. |
| Football-Data.org / BALLDONTLIE | Implemented server-only football/basketball fixture/result feeds. Sports stays off without configured provider access. Public competition/fixture parameters, not player stakes or tokens, are sent. Recorded OpenFootball data is explicitly labelled and cannot authorise live settlement. |

Server-only data feeds do not mean server-only sign-in: browsers visit GitHub and Supabase to authenticate. No player IDs or tokens should be added to outside-data queries.

Sources: [setup/regions](SETUP.md), [hosting configuration](../vercel.json), [code exchange](../backend/server/sign_in_code.py), [weather request](../backend/server/weather/open_meteo.py), [market feed](../backend/server/market/feed.py), [prediction source](../backend/server/predictions/source.py), [stock providers](../backend/server/market/stocks.py), [sports providers](../backend/server/sports/providers.py).

## What deletion actually does

The implemented authenticated `DELETE /api/me` requires `{"confirm": true}` and calls `delete_player()`:

1. A crew owned by the player is handed to the other human player in the lowest seat, if one exists.
2. The Auth user is deleted. Cascades remove the profile, save, wallet, **all wallet transactions**, Exchange positions/events, prediction/sports stakes, own duel moves, islet rows, festival rows, re-roll, entry profile, join-failure rows and the player's seats.
3. An owned crew with no other human player is deleted with its seats. Shared crews passed to another player and that other player's data remain.

Direct deletion in the Supabase Auth dashboard skips crew handover. Deleting only a profile is not the same as deleting the Auth account. The API does not clear browser site data, provider audit/platform logs/backups, GitHub records, host configuration or process caches. A timeout leaves the outcome unknown; the operation can safely be retried with support from the team.

N4/D022 requires all own ledger rows to cascade with account deletion. The account screen has a confirmed deletion control, but the ordinary game’s G9 account/case connection remains paused. Shared case/history records can survive with nullable actor links cleared; a host close audit survives crew deletion but cascades when its host deletes their account. None of this purges Supabase security audits or platform backups. Contact **Nils through the course page** when the game cannot confirm your account. This is source behaviour, not a live deletion test.

Sources: [D022](DECISIONS.md), [delete route](../backend/server/routes/delete_me.py), [deletion service](../backend/server/account/deletion.py), accounts migration above and [manual database checks](../supabase/README.md).

## Keeping this inventory current

Run `python3 -m unittest discover -s docs/tests -v` from the repository root. The documentation test requires a section for every current table after applying migration creates/drops in timestamp order and a row for every declared or added column. It checks coverage, not deployed RLS, provider retention or the truth of prose. Update this inventory, the notice and the standalone page together when data handling changes.
