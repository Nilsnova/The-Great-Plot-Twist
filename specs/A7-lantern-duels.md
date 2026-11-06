# A7 Lantern Duels

> **What this is:** the implementation spec for Lantern Duels. Two captains each seal a sequence of lantern signals. The server opens both envelopes at once and decides every round. A duel is friendly or played for equal play-coin stakes, and it sits behind the flag `arena`, which stays off.
>
> **Who uses it:** the server builder (rules, migration, routes), the screen builder (the arena panel), the reviewers, and whoever switches `arena` on later.

- **Status:** draft for review, 6 Nov 2026. Names marked **new** go to the Mon 9 contract review (D009).
- **Branch:** `feat/a7-lantern-duels`, in the worktree `The-Great-Plot-Twist-a7`, from `main` at `3d59b6a`.
- **Package:** ROADMAP A7 (should, 2nd).
- **Sources read for this spec:**
  - ROADMAP A7
  - INTERFACES sections 1, 4, 5, 7, 8 and 9
  - ENGINEERING recipes 4.1, 4.2, 4.5 and 4.7, and sections 5 to 7
  - `supabase/README.md` and both existing migrations
  - `backend/server/market/` and `routes/market.py` (the atomic money pattern)
  - `wallet.py`, `supabase_admin.py` and `app.py`
  - D003, D004 and D017
  - on the client: `game.js`, the place registry, the case bridge, the UI kit and the test setup
  - read only: `docs/story/OPEN-WORLD.md` on `s0final` (section 9 and tables 6.3, 6.5, 13.1 and 14)

## 1. The answer in short

- **One duel style for 23 Nov: sealed signals.**
  - Each captain seals all rounds at once. The challenger seals when sending the challenge, and the other captain answers by sealing theirs.
  - Answering *is* accepting. In one database transaction the server stores the answer, reveals both envelopes, decides every round and settles the coins.
- **Signals:** Flash, Shade and Mirror, as in OPEN-WORLD section 9.
  - Flash outshines Shade. Shade leaves Mirror nothing to throw. Mirror throws Flash back.
  - Lantern oil equals the number of rounds. Flash burns 2, Mirror 1 and Shade 0.
- **Challenges:** by captain name (the exact display name, in any letter case) or open to any captain, where the first answer wins. A duel has 3 or 5 rounds.
- **Stakes:** 0 (friendly), 10, 25, 50 or 100 coins from each captain.
  - The challenger's stake is held when the challenge is sent. The answerer's stake is held when they answer.
  - The winner takes the pot minus 5 %, rounded down.
  - A draw, a withdrawal, a decline or an expiry gives every stake back.
  - Reasons `arena_stake` and `arena_payout`; ref `duel:<duel id>`.
- **Timeouts:** a challenge can be answered for 24 hours. The deadline is checked lazily, on the next request that touches the duel; there is no cron. **A sealed duel has no forfeits:** nobody can lose by being offline.
- **Database:**
  - Two tables, `duels` and `duel_moves`.
  - Three atomic functions: `duel_create()`, `duel_answer()` and `duel_void()`. Each one is the only way its money change can happen.
  - Players may read their own duels and have no right at all on `duel_moves`, so a sealed signal can never reach the other captain early.
- **API:** five routes:
  - `GET /api/duels` (new)
  - `POST /api/duels`
  - `GET /api/duels/{id}`
  - `POST /api/duels/{id}/move`
  - `POST /api/duels/{id}/cancel` (new)
- **Polling:** the screen asks every 5 s for 2 minutes after an action, then every 30 s, and stops after 10 quiet minutes. It never asks while the tab is hidden.
- **Screen:** an arena panel at the `arena_gate` hotspot in Smugglers' Cove.
  - It holds the challenges, a sealed signal picker, the reveal animation, and results and history.
  - It comes with a local practice fake.
  - Keyboard, screen reader, reduced motion and 375 px are part of done.

## 2. The duel, as a player hears it

> Two captains, one ring. In each round both lanterns show one signal at the same moment. **Flash** outshines **Shade**. **Shade** leaves a **Mirror** nothing to throw back. A **Mirror** throws a **Flash** back at its sender. The same signal twice scores nothing. You get as much lantern oil as the duel has rounds: Flash burns 2, Mirror 1, Shade none. Seal your signals; the ring keeper opens both envelopes only when both are in. More rounds won wins the duel.

| Rule | Value |
|---|---|
| Rounds | 3 or 5, chosen by the challenger |
| Signals | `flash`, `shade`, `mirror` |
| Who takes a round | `flash` beats `shade`, `shade` beats `mirror`, `mirror` beats `flash`. The same signal on both sides scores for nobody. |
| Lantern oil | Equal to the rounds (3 or 5). Flash costs 2, Mirror 1, Shade 0. A sequence that costs more is refused. This is "duel oil", not the windmill's lamp oil. |
| Sealing | All rounds at once. The challenger seals with the challenge, the answering captain with the answer. A sealed signal never changes. |
| Reveal | Happens in the same database step that stores the answer. After it, both captains see every signal and every round result. |
| Who wins | More rounds won. Equal is a draw. |
| Friendly | Stake 0. No coin moves and the wallet is not called. |
| Staked | 10, 25, 50 or 100 from each captain, the same for both. The winner takes 19, 47, 95 or 190 (the pot minus 5 %, rounded down). A draw returns both stakes. |
| Answer window | 24 hours. Then the challenge expires and the challenger's stake comes back. |
| Who may answer | A named challenge: only that captain. An open challenge: any signed-in captain except the challenger. The first answer wins. |
| Words | None: no free text and no chat. Preset taunts come later (section 14). |
| Money | Play money only. The panel says "Simulation, play money". |

**Worked example** (5 rounds, 100 coins each; it is also a test). Brave Puffin 17 challenges Captain-3fa85f and seals Flash, Shade, Shade, Mirror, Shade (3 of 5 oil). Captain-3fa85f answers with Mirror, Flash, Shade, Shade, Mirror (4 of 5 oil).

| Round | Challenger | Answerer | Point |
|---|---|---|---|
| 1 | Flash | Mirror | answerer (Mirror throws Flash back) |
| 2 | Shade | Flash | answerer (Flash outshines Shade) |
| 3 | Shade | Shade | nobody |
| 4 | Mirror | Shade | answerer (Shade leaves Mirror nothing) |
| 5 | Shade | Mirror | challenger (Shade leaves Mirror nothing) |

The score is 1 to 3, so the answerer wins. The ledger rows all carry the ref `duel:<id>`:

- The challenger: `arena_stake` -100, when sending.
- The answerer: `arena_stake` -100 and `arena_payout` +190, both in the answer step.

Net result: the challenger is down 100 and the answerer up 90. The 10-coin cut is simply not paid out.

## 3. Why it is fair, and simple

Checked by a script on 6 Nov 2026; the tests repeat the checks.

- **Symmetric.** Both captains have the same signals, oil and rounds. Swapping the two captains swaps the result. This holds for all 17 x 17 pairs of allowed 3-round sequences and all 147 x 147 pairs of 5-round ones.
- **No unbeatable sequence.** At 3 and at 5 rounds, every allowed sequence loses to at least one other allowed sequence. Oil makes the strong signal scarce, so there is no safe plan, only a guess about the other captain.
- **Sealing first is no disadvantage.** Nothing about the first envelope is visible before the second is sealed (section 9).
- **Draws are common:** about 31 % of random 3-round pairs and 23 % at 5 rounds. A draw returns the stakes.
- **The server decides** (D003). The browser sends only signals, never a round result, a winner or an amount.

## 4. Life of a duel

| From | Action | Who | To | Coins |
|---|---|---|---|---|
| (nothing) | challenge: `POST /api/duels` | any signed-in captain | `open` | the challenger's stake is held (`arena_stake`) |
| `open` | answer: `POST /api/duels/{id}/move` | the named captain; for an open challenge, anyone but the challenger | `finished` | the answerer's stake is held, then the payout or the two refunds, all in one step |
| `open` | withdraw: `POST /api/duels/{id}/cancel` | the challenger | `withdrawn` | the challenger's stake comes back (`arena_payout`) |
| `open` | decline: the same route | the named captain | `declined` | the challenger's stake comes back |
| `open` | 24 hours pass, then any request touches the duel | the server | `expired` | the challenger's stake comes back |

- **No other change exists.** A `finished`, `withdrawn`, `declined` or `expired` duel never changes again.
- **Timeouts are lazy.**
  - Nothing runs on a timer, because Vercel Cron cannot be used with Services.
  - The database clock decides when a challenge has expired (`expires_at <= now()`).
  - The refund happens on the next request that touches the duel: the list or the detail of either captain, or an answer attempt.
  - Until then the coins stay held, and the panel shows them as held.
- **No forfeits in a sealed duel.** Until both envelopes are in, either side can step back and every stake comes back. Once both are in, the duel is already decided. Forfeits arrive only with live duels (section 14).
- **"Turn-based", as the roadmap means it.** Each captain has exactly one turn: sealing their envelope.
  - These moves are out of turn: a second seal, a seal by the challenger, a seal in a closed duel, and a third captain in a named duel.
  - A move out of turn is refused and changes nothing.
- **The roadmap check "a timed-out duel refunds both players".**
  - In a sealed duel only the challenger has staked before the answer, so a timed-out challenge returns every stake that was taken.
  - The answerer's stake is taken in the same transaction that decides the duel, so it can never be stuck.

## 5. Money

- **One way to move coins.** Only `apply_wallet_transaction()` moves coins, and only inside the three duel functions. Each money change is one atomic database function, like `market_trade()`.
- **Reasons** (recipe 4.7): `arena_stake` (spend) and `arena_payout` (earn). They are added by the migration and at the end of `WALLET_REASONS`.
- **Ref.** Every arena ledger row uses `duel:` plus the duel id: 41 characters, under the limit of 120.
  - Per player and duel there is at most one `arena_stake` row and one `arena_payout` row.
  - So the ledger's unique index on (player, reason, ref) stops a double stake or a double payout, even if a function ran twice.
- **Payout.** `winner takes = (2 x stake x (100 - cut_percent)) / 100`, in whole coins, rounded down by integer division.
  - `cut_percent` is stored on the duel when it is created (5 today).
  - So a later change of the cut never touches a running duel.
- **The cut has no ledger row** (OPEN-WORLD 6.3: "simply not paid out"). It is the duels' only coin sink, and duels never create coins.
- **Conservation.** There is a test in Python and a check on the scratch database.
  - The arena rows of one duel sum to 0 for a friendly duel, a draw, a withdrawal, a decline or an expiry.
  - For a decided staked duel they sum to minus the cut: -1, -3, -5 or -10 for stakes of 10, 25, 50 or 100.
- **Caps**, checked inside the functions while the locks are held:
  - At most `MAX_WAITING = 3` open challenges per challenger.
  - At most `PAIR_DAILY_LIMIT = 3` decided staked duels between the same two captains, either way round, per Lisbon day (from 00:00 Europe/Lisbon). It is checked at the answer. This keeps OPEN-WORLD 6.5 and 6.7: at most 300 coins a day between two captains.
  - Stakes only from `STAKE_CHOICES`. The database refuses a stake above 100.
- **Lock order**, so that two requests never wait for each other forever:
  - A function locks at most one duel row, always first (`select ... for update`).
  - Then it locks the wallets it needs, in player-id order (`order by player_id for update`).
  - `duel_create()` locks only the challenger's wallet, because its duel does not exist yet.

| Race | How it ends |
|---|---|
| Two captains answer the same open challenge at once | The duel row lock lets one through. The other sees `finished` and gets `409 duel_taken`; none of their coins moved. |
| The same answer arrives twice | The second finds the answerer's envelope: `409 already_applied`. |
| The challenger withdraws while the named captain answers | The duel row lock puts them in order. The later one gets `409 duel_closed`, and the coins follow whichever came first. |
| The same challenge is sent twice (a retry) | The challenger's wallet lock puts them in order. The second finds the same `create_uid`: `409 already_applied`. One duel, one stake. |
| A captain sends four challenges at once | The wallet lock puts them in order. The fourth gets `409 too_many_waiting`. |
| Two duels between A and B are answered at once near the pair limit | Both lock the same two wallets in the same order, so the second counts the first. |
| The answerer cannot pay the stake | `apply_wallet_transaction()` raises `insufficient_funds` and the whole transaction rolls back: no envelope, and the duel stays open. |
| The database times out on a money call | `503 database_unavailable`: the outcome is unknown. The client reads the duel again and never resends with a new id. |

## 6. Database: `supabase/migrations/20261106110000_lantern_duels.sql`

It runs after the two existing migrations. It is safe to run twice: it uses `if not exists`, `on conflict do nothing`, `create or replace` and `drop policy if exists`.

**Appendix A holds the full sketch of the tables, policies, grants and all three functions. It parses with `pglast`: the statements and the PL/pgSQL bodies, checked on 6 Nov.**

The builder adds, in the style of the Exchange migration:

- the header comment;
- a plain-English comment above every table, policy and function;
- `comment on` for every table, column, policy and function.

### 6.1 Tables

**`duels`**: one row per challenge. It never holds a signal. Before the reveal it holds nothing secret; after the reveal it holds the round results.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid, primary key, `gen_random_uuid()` | The duel; `duel:<id>` is the ledger ref. |
| `challenger_id` | uuid, not null, `profiles` on delete cascade | Who sent the challenge. |
| `opponent_id` | uuid, null, `profiles` on delete **set null** | The named captain, or whoever answered an open challenge. Set null rather than cascade, so that deleting the opponent never deletes a duel whose stake is still held. |
| `is_open` | boolean, not null | True: anyone may answer. |
| `rounds` | smallint, not null, 3 or 5 | |
| `stake` | integer, not null, 0 to 100 | From each captain. |
| `cut_percent` | smallint, not null, 0 to 20 | Fixed at creation. |
| `status` | text, not null, default `open` | `open`, `finished`, `withdrawn`, `declined` or `expired`. |
| `outcome` | text, null | `challenger`, `opponent` or `draw`. Filled only when finished. |
| `round_results` | text[], null | One per round: `challenger`, `opponent` or `even`. Filled only when finished. |
| `create_uid` | text, not null, `^[A-Za-z0-9_-]{8,64}$` | The challenger's `actionUid`. Unique per challenger. |
| `created_at`, `expires_at` | timestamptz, not null | `expires_at` is creation plus 24 h, and must be after `created_at`. |
| `answered_at`, `closed_at` | timestamptz, null | Set when the duel ends. |

**Checks on `duels`:**

- the allowed values of rounds, stake, cut and status;
- `opponent_id <> challenger_id`;
- the result columns are filled exactly when the duel is `finished`;
- `closed_at` is filled exactly when the duel is not `open`;
- `round_results` has one entry per round, each one of the three allowed words.

**Indexes on `duels`:**

- unique `(challenger_id, create_uid)`
- `(challenger_id, created_at desc)`
- `(opponent_id, created_at desc)`
- `(status, created_at desc)`

**`duel_moves`**: the sealed envelopes, one row per captain and round. The table is insert-only. No role, not even the server, may change or delete a sealed signal; rows disappear only by cascade.

| Column | Type | Meaning |
|---|---|---|
| `duel_id` | uuid, `duels` on delete cascade | |
| `player_id` | uuid, `profiles` on delete cascade | |
| `round_no` | smallint, 1 to 5 | |
| `signal` | text, one of `flash`, `shade`, `mirror` | |
| `action_uid` | text, the same pattern as `create_uid` | The `actionUid` of the click that sealed it. For the challenger it is the `create_uid`. |
| `sealed_at` | timestamptz, default `now()` | Never shown to anyone. |

The primary key is `(duel_id, player_id, round_no)`, so a second envelope from the same captain is a unique violation. There is no identity column, so there is no sequence to revoke.

**Index on `duel_moves`:** `(player_id)`. The primary key starts with `duel_id`, so it cannot serve a search by captain. The index lets the database find a captain's envelopes when that captain is deleted, as every other foreign key in the project does.

### 6.2 Row-level security and grants

| Table | Action | Visitor (`anon`) | Signed-in player | Server (`service_role`) |
|---|---|---|---|---|
| `duels` | read | no access | the duels they take part in (as challenger or opponent) | yes |
| `duels` | insert | no access | no access | yes (only through `duel_create()`) |
| `duels` | update | no access | no access | yes (only through `duel_answer()` and `duel_void()`) |
| `duels` | delete | no access | no access | no access (only by cascade) |
| `duel_moves` | read | no access | **no access, not even their own** | yes |
| `duel_moves` | insert | no access | no access | yes (only through `duel_create()` and `duel_answer()`) |
| `duel_moves` | update, delete | no access | no access | **no access**: sealed means sealed |

- **RLS is on for both tables.**
  - There is one policy, on `duels`: `for select to authenticated using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()))`.
  - There is no policy on `duel_moves`, so even a wrong grant would show nothing.
- **Grants.** First `revoke all` on both tables from `public, anon, authenticated, service_role`. Then grant back:
  - `grant select on duels to authenticated`
  - `grant select, insert, update on duels to service_role`
  - `grant select, insert on duel_moves to service_role`
- **The three functions:**
  - `revoke all ... from public, anon, authenticated`, then `grant execute ... to service_role`;
  - not `security definer`;
  - `set search_path = ''`, with every name written in full.
- Realtime stays off for both tables.

### 6.3 The three functions

Each function returns `jsonb`:

- `{"status": "done", ...}` when it worked.
- `{"status": "refused", "reason": "..."}` when a rule says no. A refusal always comes **before any write**. This is the market's pattern: a raised error cannot carry the reason through our database client.

Real failures raise an error instead:

- `insufficient_funds`, from the wallet.
- A repeat, raised as `already_applied` with error code `23505`. `supabase_admin.py` already turns that code into `409 already_applied`.
- `bad_duel` or `wallet_not_found`, for arguments that make no sense. These are bugs (the server and the database disagree), answered with `502`.

**`duel_create(p_challenger_id uuid, p_opponent_name text, p_rounds integer, p_stake integer, p_cut_percent integer, p_signals text[], p_create_uid text, p_answer_hours integer, p_max_waiting integer)`**

1. Check that the arguments make sense, else `bad_duel`. A null `p_opponent_name` means an open challenge.
2. Lock the challenger's wallet (`wallet_not_found` if there is none).
3. A repeated `create_uid` raises `already_applied` (23505), before every other rule.
4. For a named challenge, find the captain by `lower(display_name) = lower(btrim(name))`:
   - no match: `no_such_captain`;
   - two or more matches: `name_not_unique`;
   - the challenger's own name: `cannot_duel_yourself`.
5. If the challenger's open, unexpired challenges are already at the cap: `too_many_waiting`.
6. Insert the duel, with `expires_at = now() + p_answer_hours hours`.
7. Insert the envelope, one row per round.
8. Take the stake if it is above 0 (`arena_stake`, `duel:<id>`).
9. Return `{"status": "done", "duelId", "opponentId", "opponentName", "balance"}`.

**`duel_answer(p_duel_id uuid, p_player_id uuid, p_signals text[], p_action_uid text, p_round_results text[], p_outcome text, p_day_start timestamptz, p_pair_daily_limit integer)`**

The round results and the outcome come from Python (`rules.resolve`), like the price of a trade. The database does not repeat the signal rules, but it checks everything that follows from them.

1. Check that the arguments make sense and that `p_day_start` is not in the future (one minute of clock difference is allowed), else `bad_duel`.
2. Lock the duel row. If it is missing: `no_such_duel`.
3. If the caller already has an envelope in this duel (they answered, or they are the challenger), raise `already_applied` (23505), before every other rule.
4. Check the state of the duel:
   - not `open`: an answered open challenge is `duel_taken`, anything else is `duel_closed`;
   - a named duel and the caller is not its captain: `no_such_duel`;
   - past `expires_at`: `duel_expired`.
5. Check the numbers: one signal and one result per round, every result one of the three words, and an outcome that follows from the counted points. Else `bad_duel`.
6. Lock both wallets in player-id order (`wallet_not_found` unless both rows exist).
7. For a staked duel, if the decided staked duels between the two captains since `p_day_start` are at the limit: `daily_pair_limit`.
8. Take the answerer's stake, insert their envelope, and set `opponent_id`, `status = 'finished'`, `outcome`, `round_results`, `answered_at` and `closed_at`.
9. Pay out. A draw returns each stake; otherwise the winner gets the payout (`arena_payout`, `duel:<id>`).
10. Return `{"status": "done", "balance": <answerer's balance>, "winnerTakes": <payout or 0>}`.

**`duel_void(p_duel_id uuid, p_player_id uuid, p_new_status text)`**, where `p_new_status` is `withdrawn`, `declined` or `expired`

1. Check that the arguments make sense, else `bad_duel`. Lock the duel row; if it is missing: `no_such_duel`.
2. If the duel is not `open`:
   - the same captain closing it the same way again raises `already_applied` (23505);
   - anything else is `duel_closed`.
3. Check who asks:
   - `withdrawn` needs the challenger and `declined` needs the named captain, else `not_your_duel`;
   - `expired` needs `expires_at <= now()`, else `not_expired`. Anyone may ask for it.
4. Lock the challenger's wallet, return the stake if it is above 0 (`arena_payout`, `duel:<id>`), and set the status and `closed_at`.
5. Return `{"status": "done", "refunded": <stake>, "challengerBalance": <balance>}`.

### 6.4 Traps in the existing migration tests

`backend/server/tests/test_wallet_matches_migration.py` reads every migration as plain text.

- **The reasons need exactly this shape,** with no apostrophe in a description:
  `insert into public.wallet_reasons (reason, direction, description) values (...), (...) on conflict (reason) do nothing;`
- **Never write `update`, `delete from` or `truncate` followed by `wallet_reasons`,** not even in a comment.
- **One existing test breaks by design.** `test_python_ends_its_list_of_reasons_with_the_three_market_reasons` pins the market reasons to the end of `WALLET_REASONS`, and appending the arena reasons breaks it.
  - Change it to "the market reasons come right after the first eight" (`WALLET_REASONS[8:11]`).
  - Say why in the pull request (ENGINEERING 5.2): the requirement changed, because recipe 4.7 appends new reasons.
- **Add the two pairs** to `test_the_wallet_reasons_are_the_agreed_pairs_in_the_agreed_order` in `test_wallet.py`.
- **Pin the position of the arena reasons, not the end of the list.** The next package that adds a reason appends it after them (recipe 4.7), so a test on `WALLET_REASONS[-2:]` would break the same way. `test_duels_migration.py` checks `WALLET_REASONS[11:13]` instead (8 reasons of the foundation and 3 of the market come first).

### 6.5 Quick checks after applying (for `supabase/README.md`)

- 12 tables, each with RLS on.
- 11 policies, all `SELECT`. `duel_moves` has none on purpose.
- 11 rows for `authenticated` in the grants query, each `SELECT` (none for `duel_moves`), and none for `anon`.
- 13 wallet reasons.

## 7. Server: `backend/server/duels/` and `backend/server/routes/duels.py`

The duels code is a package like `market/`, with one job per file.

- The roadmap's `duel.py` becomes `duels/rules.py`.
- OPEN-WORLD's `duel.json` is not needed: the numbers are named constants with tests, as D017 did for the Exchange.

| File | One job |
|---|---|
| `duels/__init__.py` | The map of the package, in the style of `market/__init__.py`. |
| `duels/rules.py` | Every rule and number, as pure functions: signals, beats, oil, the choices, the cut, the windows, the caps, checking a sequence, resolving rounds, the payout, the coins per captain, the Lisbon day start. |
| `duels/views.py` | What one captain may see of one duel: the summary, the detail and the reveal from their side. Pure. **The only place that decides visibility** (section 9). |
| `duels/store.py` | The database reads (`select_rows`), the three function calls (`call_function`), their argument dictionaries and the reply readers. Copy the two tiny readers `to_time` and `to_whole_number` rather than importing them from the market. |
| `duels/refusals.py` | Turns a refusal from the database, or a failed rule, into the standard `ApiError` (table in 7.3). |
| `duels/service.py` | `DuelService(clock=utc_now)` with `create`, `answer`, `cancel`, `get`, `list` and the lazy expiry sweep. |
| `routes/duels.py` | The five URLs, the Pydantic models and the header contract. It is the home of the contract, like `routes/market.py`. |

### 7.1 Numbers and functions in `rules.py`

```python
SIGNALS = ("flash", "shade", "mirror")
BEATS = {"flash": "shade", "shade": "mirror", "mirror": "flash"}
OIL_COST = {"flash": 2, "mirror": 1, "shade": 0}
OIL_PER_ROUND = 1                      # oil = rounds
ROUND_CHOICES = (3, 5)
STAKE_CHOICES = (0, 10, 25, 50, 100)   # 0 is a friendly duel
CUT_PERCENT = 5
ANSWER_HOURS = 24
MAX_WAITING = 3
PAIR_DAILY_LIMIT = 3
DUEL_DAY_TIMEZONE_NAME = "Europe/Lisbon"   # the pair limit counts from 00:00 there
SWEEP_LIMIT = 5                        # expired duels refunded per request at most
MY_DUELS_LIMIT = 20                    # own duels read for one list
OPEN_CHALLENGES_LIMIT = 10
RECENT_LIMIT = 10
REF_PREFIX = "duel:"
```

The functions, each at most about 20 lines:

| Function | What it does |
|---|---|
| `oil_for(rounds)` | The oil of a duel. |
| `sequence_cost(signals)` | The oil a sequence burns. |
| `check_choices(rounds, stake)` | Raises `bad_rounds` or `bad_stake`. |
| `check_sequence(signals, rounds)` | Raises `wrong_signal_count` or `not_enough_oil`. |
| `round_point(challenger_signal, opponent_signal)` | `challenger`, `opponent` or `even`. |
| `resolve(challenger_signals, opponent_signals)` | A frozen `Resolution` with `round_results`, `challenger_points`, `opponent_points` and `outcome`. |
| `winner_takes(stake, cut_percent)` | The payout. |
| `coins_change(stake, cut_percent, outcome, role)` | A captain's net coins. |
| `duel_day_start(now)` | The latest Lisbon midnight, as UTC, with the same `ZoneInfo` fallback as `market/rules.py`. |
| `duel_ref(duel_id)` | `duel:<id>`. |
| `all_valid_sequences(rounds)` | For the tests. |

### 7.2 Each route, in the order of its checks

Every route does three things first, in this order:

1. It resolves `player: PlayerDep` (401 if not signed in).
2. It checks the flag: `404 feature_off` while `arena` is off, with no database call.
3. FastAPI checks the body (`422 validation_error`).

The player id comes only from the sign-in.

**`POST /api/duels`** (challenge)

1. Repeat check. If a duel of this challenger with this `create_uid` exists: `409 already_applied`. The read is `duels?challenger_id=eq.<me>&create_uid=eq.<uid>`.
2. `check_choices` and `check_sequence`: `422 bad_rounds`, `bad_stake`, `wrong_signal_count` or `not_enough_oil`.
3. Call `duel_create(...)` with `CUT_PERCENT`, `ANSWER_HOURS` and `MAX_WAITING`, and map a refusal (7.3).
4. Answer with the detail, built exactly as `GET /api/duels/{id}` builds it, plus `coins` (the balance from the function).

**`POST /api/duels/{id}/move`** (the answer)

1. Read the duel. If it is missing, or a named duel the caller is not in: `404 no_such_duel`. An open challenge is never a 404 for a signed-in captain, so a late visitor hears `409 duel_taken`.
2. Repeat check: read the caller's own envelope.
   - Same `actionUid`: `409 already_applied`.
   - Another `actionUid`: `409 already_sealed`.
   - This also covers the challenger, whose envelope came with the challenge.
3. State check.
   - Not `open`: `409 duel_taken` for an answered open challenge, otherwise `409 duel_closed`.
   - Past `expires_at`: run `duel_void(expired)`, then answer `409 duel_expired`.
4. `check_sequence(signals, duel.rounds)`: `422`.
5. Read the challenger's envelope (server only) and call `resolve(challenger, answer)`.
6. Call `duel_answer(...)` with `duel_day_start(now)` and `PAIR_DAILY_LIMIT`, and map a refusal. A `duel_expired` refusal also runs `duel_void(expired)` first.
7. Answer with the finished detail, including the reveal, and `coins`.

**`POST /api/duels/{id}/cancel`** (no body)

1. Read the duel. If the caller cannot see it: `404 no_such_duel`.
2. Decide the new status:
   - the challenger asks for `withdrawn`;
   - the named captain asks for `declined`;
   - either becomes `expired` once the window has passed (the refund is the same);
   - anyone else gets `403 not_your_duel`.
3. If the duel is `expired` already (the first cancel came after the deadline, or a clean-up closed it), answer `409 already_applied` at once: the stake is back and nothing is left to do. Otherwise call `duel_void(...)`. A repeat raises `already_applied` (409); a closed duel is `409 duel_closed`.
4. Answer with the detail. `coins` is the caller's balance if the caller is the challenger, otherwise `null`.

**`GET /api/duels/{id}`**

1. The path id must be a UUID (`422 validation_error`). Read the duel; if the caller cannot see it: `404 no_such_duel`.
2. If it is `open` and past `expires_at`: run `duel_void(expired)` and read it again.
3. Read the caller's own envelope (for a participant). Read the other captain's envelope **only if the duel is `finished`**.
4. Read the names and build the detail (section 8.3).

**`GET /api/duels`**

1. Read the caller's duels in both roles, newest first, at most `MY_DUELS_LIMIT` (`or=(challenger_id.eq.<me>,opponent_id.eq.<me>)`).
2. Sweep: each of them that is still `open` and past `expires_at` gets `duel_void(expired)`, at most `SWEEP_LIMIT` per request. A `not_expired` refusal (the clocks differ) leaves that duel open.
3. Read the open challenges of other captains that are still open and not expired, at most `OPEN_CHALLENGES_LIMIT` (`status=eq.open&is_open=eq.true&challenger_id=neq.<me>&expires_at=gt.<now>`).
4. Read the caller's coins and the names of every captain in the answer (`profiles?id=in.(...)`).
5. Split the duels into `incoming`, `yours` and `recent` (section 8.2).

A list call makes at most 5 small reads, plus the rare sweeps. Ask only for the columns the views use.

### 7.3 What the database answers, and what the route answers

| From the function | Route answer |
|---|---|
| `done` | 200 |
| refused `no_such_duel` | 404 `no_such_duel` |
| refused `no_such_captain` | 404 `no_such_captain` |
| refused `name_not_unique` | 409 `name_not_unique` |
| refused `cannot_duel_yourself` | 422 `cannot_duel_yourself` |
| refused `too_many_waiting` | 409 `too_many_waiting` |
| refused `duel_taken` | 409 `duel_taken` |
| refused `duel_closed` | 409 `duel_closed` |
| refused `duel_expired` | `duel_void(expired)`, then 409 `duel_expired` |
| refused `daily_pair_limit` | 409 `daily_pair_limit` |
| refused `not_your_duel` | 403 `not_your_duel` |
| refused `not_expired` | Only from the sweep: nothing happens, the duel stays open. |
| raised `23505` | 409 `already_applied` (`supabase_admin.py` already does this) |
| raised `insufficient_funds` | 409 `insufficient_funds` (already done) |
| raised `bad_duel`, `wallet_not_found`, a constraint error or an unknown reason | 502 `database_error`: a bug, logged by code only |
| timeout or 5xx | 503 `database_unavailable`: the outcome is unknown |

### 7.4 `create_app` and the shared files

- **`create_app`.** Add `create_app(..., *, duel_service: DuelService | None = None)`, keyword only, after `market_service`.
  - Store the service as `app.state.duels`.
  - Add `app.include_router(duels.router, prefix="/api")`.
  - Put a `DuelsDep` dependency in `service.py`, like `MarketDep`.
- **Shared lines the server builder must touch.** They are small and append-only, and they are outside the listed ownership, but the work cannot be done without them:
  - `backend/server/app.py`, as above;
  - `backend/server/wallet.py`: the two pairs at the end, with a comment naming the migration;
  - `backend/server/tests/test_wallet.py` and `backend/server/tests/test_wallet_matches_migration.py` (6.4);
  - one line each in the file maps of `backend/server/__init__.py` and `backend/server/routes/__init__.py`.
- **Logging.** Never log signals, names or player ids. Log only the status and the database codes.

## 8. API contract

### 8.1 Rules for all five routes

- **Sign-in.** Signed-in players only (`Authorization: Bearer <token>`). `401` comes before `404 feature_off`.
- **The flag.** While `arena` is off, every route answers `404 feature_off` and touches no database.
- **JSON.** Names are camelCase. Request models refuse extra fields (`extra="forbid"`), so a `playerId` in the body is a `422`.
- **Caching.** Every good answer carries `Cache-Control: private, no-store`. An error answer holds no personal data (a code and a sentence) and carries no cache header, like the errors of `GET /api/me`.
- **Times.** UTC with whole seconds, like `"2026-11-06T10:00:00Z"`. Every answer has `serverTime`, so the screen can count down without trusting the device clock.
- **`actionUid`** (on challenge and answer):
  - 8 to 64 letters, digits, hyphens or underscores;
  - made by the browser once per click, and **sent again unchanged on a retry**;
  - never part of a ledger ref (the duel id is).
- **`signals`.** A list of 3 to 5 items, each `"flash"`, `"shade"` or `"mirror"`. It is a Pydantic `Literal`, and a test checks that it matches `SIGNALS`.
- **`rounds` and `stake`.** `StrictInt`, checked by `rules.py`.
- **Lists are short.** At most 20 of your own duels are read, and at most 10 open challenges and 10 recent results are returned.

### 8.2 `GET /api/duels` (new)

```text
GET /api/duels
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"rules": {"signals": [{"id": "flash", "cost": 2, "beats": "shade"},
                       {"id": "shade", "cost": 0, "beats": "mirror"},
                       {"id": "mirror", "cost": 1, "beats": "flash"}],
           "roundChoices": [3, 5], "oilPerRound": 1, "stakeChoices": [0, 10, 25, 50, 100],
           "cutPercent": 5, "answerHours": 24, "maxWaiting": 3, "pairDailyLimit": 3,
           "dayStarts": "00:00 Europe/Lisbon"},
 "coins": 900,
 "heldCoins": 100,
 "incoming": [<summary>, ...],
 "openChallenges": [<summary>, ...],
 "yours": [<summary>, ...],
 "recent": [<summary>, ...],
 "serverTime": "2026-11-06T10:00:05Z"}
```

| Field | Meaning |
|---|---|
| `incoming` | Named challenges to you, still open and not expired (at most 10). |
| `openChallenges` | Open challenges of other captains, still open and not expired (at most 10). |
| `yours` | Your challenges still waiting (at most 3). |
| `recent` | Your duels that ended, newest first (at most 10). |
| `heldCoins` | Your coins held in waiting challenges. |

**A summary** is one duel in a list. It never carries a signal.

```json
{"id": "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44", "status": "open", "isOpen": false,
 "you": "opponent", "challengerName": "Brave Puffin 17", "opponentName": "Captain-3fa85f",
 "rounds": 5, "oil": 5, "stake": 100, "cutPercent": 5, "winnerTakes": 190,
 "createdAt": "2026-11-06T10:00:00Z", "expiresAt": "2026-11-07T10:00:00Z", "closedAt": null,
 "score": null, "yourResult": null, "coinsChange": null, "heldStake": 0,
 "canAnswer": true, "canWithdraw": false, "canDecline": true}
```

| Field | Values |
|---|---|
| `status` | `open`, `finished`, `withdrawn`, `declined` or `expired` |
| `you` | `challenger`, `opponent` or `visitor` (someone looking at an open challenge) |
| `opponentName` | `null` for an unanswered open challenge, or for a captain who has left |
| `winnerTakes` | 0 for a friendly duel |
| `score` | Finished only: `{"you": 3, "them": 1}` |
| `yourResult` | Finished only: `won`, `lost` or `draw` |
| `coinsChange` | Your net coins from this duel once it has ended (`+90`, `-100`, `0`); `null` while open |
| `heldStake` | Your coins held in it right now (only for the challenger of a waiting staked duel), else 0 |
| `canAnswer`, `canWithdraw`, `canDecline` | What the buttons may offer. The server checks again anyway. |

Errors: `401 unauthorized`, `404 feature_off`, `502 database_error`, and `503 database_not_configured` or `database_unavailable`.

### 8.3 `GET /api/duels/{id}`

The example is the answering captain's view after the worked example.

```text
GET /api/duels/6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44
Authorization: Bearer <token>

200 OK
{"duel": {<summary fields>, "status": "finished", "closedAt": "2026-11-06T10:04:12Z",
          "score": {"you": 3, "them": 1}, "yourResult": "won", "coinsChange": 90,
          "canAnswer": false, "canWithdraw": false, "canDecline": false,
          "yourSignals": ["mirror", "flash", "shade", "shade", "mirror"],
          "reveal": [{"round": 1, "yours": "mirror", "theirs": "flash",  "point": "you"},
                     {"round": 2, "yours": "flash",  "theirs": "shade",  "point": "you"},
                     {"round": 3, "yours": "shade",  "theirs": "shade",  "point": "even"},
                     {"round": 4, "yours": "shade",  "theirs": "mirror", "point": "you"},
                     {"round": 5, "yours": "mirror", "theirs": "shade",  "point": "them"}]},
 "serverTime": "2026-11-06T10:04:13Z"}
```

| Field | Meaning |
|---|---|
| `yourSignals` | Your own sealed signals. `null` for a visitor, or before you sealed. |
| `reveal` | `null` unless the duel is `finished`. One entry per round, from your side; `point` is `you`, `them` or `even`. `theirs` is `null` for a captain who has left. |

**Who may look:** the two captains, and anyone while an open challenge is still open.

**Errors:**

- `401 unauthorized` and `404 feature_off`;
- `404 no_such_duel`: unknown, a named duel you are not in, or an answered open challenge you are not in;
- `422 validation_error`: the id is not a UUID;
- `502` and `503`.

### 8.4 `POST /api/duels` (challenge)

```text
POST /api/duels
Authorization: Bearer <token>
{"opponentName": "Captain-3fa85f", "rounds": 5, "stake": 100,
 "signals": ["flash", "shade", "shade", "mirror", "shade"], "actionUid": "q7x2k9m4ab"}

200 OK
{"duel": <detail: status open, yourSignals, heldStake 100, canWithdraw true>,
 "coins": 900, "serverTime": "2026-11-06T10:00:00Z"}
```

**`opponentName`:**

- It is optional; `null` or leaving it out makes an open challenge.
- It follows the display-name rule: 2 to 24 characters from A-Z, a-z, 0-9, space, `_`, `.` and `-`.
- It is only a lookup key: never stored and never shown to anyone. The name shown is the profile's own.

| Status | Code | When |
|---|---|---|
| 401 | `unauthorized` | No sign-in, or a bad one. |
| 404 | `feature_off` | `arena` is off. |
| 404 | `no_such_captain` | No captain has that name. |
| 409 | `already_applied` | This `actionUid` already made a challenge. Nothing new happened; treat it as done. |
| 409 | `name_not_unique` | Several captains share that name. Send an open challenge instead. |
| 409 | `too_many_waiting` | You have 3 challenges waiting. |
| 409 | `insufficient_funds` | You cannot pay the stake. Nothing was created. |
| 422 | `validation_error` | The body does not fit: an unknown signal, a missing field or an extra field. |
| 422 | `bad_rounds`, `bad_stake` | Not 3 or 5 rounds; not one of the five stakes. |
| 422 | `wrong_signal_count`, `not_enough_oil` | Not one signal per round; the signals cost more oil than the duel has. |
| 422 | `cannot_duel_yourself` | The name is your own. |
| 502, 503 | `database_error`; `database_not_configured`, `database_unavailable` | As everywhere. A 503 means the outcome is unknown: read the list before trying again. |

### 8.5 `POST /api/duels/{id}/move` (answer: accept and seal)

```text
POST /api/duels/6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44/move
Authorization: Bearer <token>
{"signals": ["mirror", "flash", "shade", "shade", "mirror"], "actionUid": "z81kq0p3dd"}

200 OK
{"duel": <detail: status finished, with yourSignals, reveal, score, yourResult, coinsChange>,
 "coins": 1090, "serverTime": "2026-11-06T10:04:12Z"}
```

| Status | Code | When |
|---|---|---|
| 401, 404 | `unauthorized`, `feature_off` | As above. |
| 404 | `no_such_duel` | Unknown, or a named duel for someone else. |
| 409 | `already_applied` | This `actionUid` already answered. Treat it as done and read the duel. |
| 409 | `already_sealed` | You already sealed signals in this duel, which includes being its challenger. Nothing changed. |
| 409 | `duel_taken` | Another captain answered this open challenge first. None of your coins moved. |
| 409 | `duel_closed` | Withdrawn, declined or already decided. |
| 409 | `duel_expired` | The 24 hours have passed. The challenger's stake went back. |
| 409 | `daily_pair_limit` | You have played 3 staked duels with this captain today (from 00:00 Lisbon). |
| 409 | `insufficient_funds` | You cannot pay the stake. Nothing changed. |
| 422 | `validation_error`, `wrong_signal_count`, `not_enough_oil` | As above. |
| 502, 503 | as above | |

### 8.6 `POST /api/duels/{id}/cancel` (new: withdraw or decline)

There is no body. The challenger withdraws, or the named captain declines. Either way, the challenger's stake comes back.

```text
POST /api/duels/6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44/cancel
Authorization: Bearer <token>

200 OK
{"duel": <detail: status withdrawn, declined or expired>, "coins": 1000, "serverTime": "..."}
```

`coins` is your balance if you are the challenger, otherwise `null`.

**Errors:**

- `401` and `404 feature_off`;
- `404 no_such_duel`;
- `403 not_your_duel`: an open challenge of another captain;
- `409 already_applied`: you already withdrew or declined it, or it had run out of time and was closed and refunded already (by your own cancel or by a clean-up);
- `409 duel_closed`: it ended some other way;
- `502` and `503`.

### 8.7 Additions to the status table of INTERFACES section 1

| Status | New codes |
|---|---|
| 403 | `not_your_duel` (the first route that uses 403) |
| 404 | `no_such_duel`, `no_such_captain` |
| 409 | `already_sealed`, `duel_taken`, `duel_closed`, `duel_expired`, `daily_pair_limit`, `too_many_waiting`, `name_not_unique` |
| 422 | `bad_rounds`, `bad_stake`, `wrong_signal_count`, `not_enough_oil`, `cannot_duel_yourself` |

## 9. Sealed means sealed: what never leaks

A captain's sealed signals reach the other captain only after both envelopes are in, and only as part of the stored reveal.

**The server does both commit and reveal:**

- The commit is inserting an envelope into `duel_moves`. No player may read it, and no role (not even the server) may change it.
- The reveal is the one transaction that stores the second envelope, the round results and the coins.

1. **No answer carries the other captain's signals before `finished`:** not the list, not the detail and not an error.
   - `views.py` refuses (raises) if it is handed the other envelope for a duel that is not finished.
   - `service.py` reads that envelope only for a finished duel or to resolve an answer.
2. **Nothing derived from those signals either:** no oil spent, no count of signals and no "sealed at" time. The other side shows only that it is sealed.
3. **The database:**
   - players have no right on `duel_moves` (no grant, no policy, and RLS on);
   - `duels` holds no signal;
   - the results are written in the same transaction as the answer;
   - Realtime stays off.
4. **Withdrawn, declined and expired duels** never show the challenger's signals to anyone but the challenger.
5. **Logs:** the signals travel only in request bodies, never in an address, and the code never logs them.
6. **The test that proves it:** two fake databases that differ only in the challenger's sealed signals must give byte-identical answers to the named captain and to a visitor. This covers the list, the detail, every refusal of `move` and `cancel`, and the state after a withdrawal and after an expiry.

## 10. Polling and the free tiers

| When | What the client does |
|---|---|
| The panel opens, or the player acts (challenge, answer, cancel, "Check now") | Ask at once, then every **5 s** for **2 minutes**. |
| After 2 quiet minutes | Ask every **30 s**. |
| After 10 quiet minutes (no change in the list and no action) | Stop, and show "Paused. Check again". |
| The tab is hidden, the panel closes, or the panel's element leaves the page | Stop at once. When shown again, ask once and start the fast window. |
| A `429` | Wait `Retry-After` seconds, and at least the current interval. |
| A network error or a 5xx | Keep the last view, double the wait up to 60 s, and say "The ring did not answer. Retrying." |
| Always | One request at a time, and `GET /api/config` once per opening. |

The client polls only `GET /api/duels`. It adds one `GET /api/duels/{id}` when a duel the player is waiting on has ended, to get the reveal.

**The arithmetic:**

- **One panel.** One open, quiet panel asks at most 24 times in the first 2 minutes and 16 times in the next 8, then never: **40 calls per 10 quiet minutes.**
- **Vercel.** Vercel Hobby allows 1,000,000 function calls a month (ARCHITECTURE section 6).
  - A heavy day of 40 captains, each opening the ring 3 times for 10 quiet minutes, is 4,800 calls. That is about 144,000 a month, 14 % of the budget.
  - A 10-duel live demo costs under 500 calls.
- **Supabase.** Each list call makes at most 5 small reads. It moves at most about 10 kB from Supabase (a few hundred bytes per row, at most about 30 rows), and usually about 2 kB.
  - The heavy month above stays under 1.5 GB of Supabase egress.
  - The Free plan allows 5 GB; check the live limits page.
- No Realtime, no WebSockets and no timer on the server.

## 11. The arena screen: `frontend/src/screens/duels/`

### 11.1 Files

Each file stays under 150 lines, in plain readable code (ENGINEERING section 1).

| File | One job |
|---|---|
| `index.js` | `openArena(ctx)`, the lazy entry. It picks the adapter (the fake with `?arena=local` in development only, otherwise HTTP), creates the panel once, and opens or focuses it. |
| `panel.js` | The dialog, built with `createModal` and `createTabs` from the UI kit. It holds the tabs and notices, wires intents to the adapter, handles focus, and stops key events at the dialog so the explorer never moves behind it. |
| `picker.js` | The sealed signal picker. |
| `reveal.js` | The reveal animation and its text twin. |
| `history.js` | Results and history, with Replay and Rematch. |
| `logic.js` | Pure logic: oil left and affordability, the picker state, payouts, the reveal steps, the poll schedule, the captain-name rule, and local resolution for the fake. |
| `messages.js` | Every error code mapped to one plain sentence. |
| `http-adapter.js` | The HTTP mapping: `/api/config`, the token, the five routes, polling, and retries with the same `actionUid`. |
| `fake-adapter.js` | The local practice ring: in memory, with a seeded rival, nothing saved. |
| `duels.css` | The panel, the lanterns, the 375 px layout and reduced motion. |
| `README.md` | What each file does, the adapter contract, how to try `?arena=local`, and the manual checks. |

The tests live in `frontend/tests/duels-*.test.js`, because Vitest only looks in `tests/**`.

### 11.2 The adapter contract (both adapters)

```js
adapter.read()                       // a copy of the current view
adapter.subscribe(listener)          // listener(view) after every change; returns stop()
adapter.refresh()                    // ask now; restarts the fast window
adapter.challenge({ opponentName, rounds, stake, signals })   // resolves { ok, view, code?, message? }
adapter.answer(duelId, signals)
adapter.cancel(duelId)
adapter.select(duelId)               // load one duel's detail (for the reveal)
adapter.retry()                      // resend the last intent whose outcome was unknown, same actionUid
adapter.setVisible(isVisible)        // the page or the panel was hidden or shown
adapter.dispose()
```

The view has these fields: `{ mode, revision, rules, coins, heldCoins, incoming, openChallenges, yours, recent, selected, serverOffsetMs, polling, notice, canRetry }`.

- `mode` is `loading`, `closed` (the flag is off), `signed_out` (no token), `ready`, `practice` (the fake) or `unavailable`.
- `polling` is `fast`, `slow`, `paused` or `off`.
- `notice` is `null` or `{ code, message }`.
- Lists and details are the server's JSON, unchanged.

The HTTP adapter:

- **Takes** `{ fetchImpl = fetch, getToken = () => null, now = Date.now }`.
- **Has no token yet.** The game client has no sign-in until A2, so today it shows `signed_out` when the flag is on. A2 passes `getToken` in the hook later.
- **Makes one `actionUid` per intent** (`crypto.randomUUID()`, 36 characters) and keeps it until a definite answer (2xx or 4xx).
- **On a network error or a 503,** it reads the list and offers "Try again". `retry()` sends **the same** `actionUid`, so a lost answer can never make two challenges.
- **After `409 already_applied`,** it reads again and treats the intent as done.

### 11.3 Layout

One `<dialog>` titled "Lantern Duels". Under the title: the line "The ring at Smugglers' Cove. Simulation, play money.", the captain's coins and the held coins.

1. **Challenges** (tab 1): incoming named challenges (Answer, Decline), then open challenges (Answer).
   - Each card shows the challenger, the rounds, the stake with "winner takes 190", and "answer within 23 h".
   - An empty list says "No challenges yet. Send an open challenge and any captain can answer."
2. **New challenge** (tab 2):
   - The opponent: "Any captain (open challenge)", or "A captain by name" with a text field (label "Captain's name, as shown in the harbor", `maxlength` 24, `autocomplete="off"`, `spellcheck="false"`).
   - Rounds: 3 or 5.
   - Stake: Friendly, 10, 25, 50 or 100. Stakes above your coins are disabled, with "you have 40 coins".
   - The picker, and the button "Seal and send" (or "Seal, stake 100 and send").
3. **Your duels** (tab 3): waiting challenges, then results and history.
   - A waiting challenge shows your sealed signals, the countdown, and "Withdraw: your 100 coins come back".
4. **A rules card,** always one click away: the three signals, what beats what, the costs, and "oil equals rounds".

### 11.4 The sealed picker

- **Layout.** One `<fieldset>` per round, with `<legend>Round 2 of 5</legend>` and three native radio inputs styled as large buttons. Each button shows the glyph, the name and the cost ("Flash, 2 oil").
- **Affordability.** An option is disabled when the oil cannot pay for it, given the other rounds' choices. The reason is shown in text ("needs 2 oil, 1 left"). An unfilled round can always take Shade, so no choice is a dead end.
- **The oil line.** "Oil left: 3 of 5", in an `aria-live="polite"` region, plus a `createProgress` bar.
- **Buttons.** "Clear" empties every round. The seal button stays disabled until every round has a signal.
- **Keyboard.** Tab moves between rounds, the arrow keys choose within a round (native radios), and Enter or Space on the seal button seals.
- **When answering,** the picker shows the challenge's rounds and stake. The challenger's signals are of course not there.

### 11.5 The reveal

- **The scene.** Two lanterns face each other: "You" on the left and the other captain on the right. In each round:
  - both shutters open at the same moment and show the two signals;
  - the round strip marks the point;
  - a line explains it ("Mirror throws Flash back. Your point.");
  - the score ticks.
- **Timing.** About 900 ms per round, then the result banner: "You win 3 to 1. +90 coins (play money)." Focus starts on "Skip" and ends on "Back to the ring".
- **Screen readers.** An `aria-live="polite"` region speaks each round as text, for example "Round 2 of 5. You showed Flash, Brave Puffin 17 showed Shade. Flash outshines Shade: your point. 2 to 0." It speaks the result once.
- **Reduced motion.** Use `reducedMotion()` from `settings/preferences.js`, which follows both the device and the player's setting, plus the `data-reduced-motion` attribute in CSS. With reduced motion there is no animation: the whole result shows at once as a table (`createTable`), and the summary is spoken once.
- **Not colour alone** (GRAPHICS, the colour-blind option). Each signal has its own shape and its name in text: Flash a sunburst, Shade a closed shutter, Mirror a diamond. The shapes are drawn in code (inline SVG with `crispEdges`, or CSS), so no outside asset is needed.
- **When it plays:**
  - right after an answer;
  - for the challenger, when a poll shows that the duel they are watching has ended. If they are not watching it, a notice says "Your duel with Captain-3fa85f is decided. Watch the reveal.";
  - from Replay in the history.

### 11.6 Results and history

Up to 10 recent duels, each with the date in the player's own time:

- "Won 3 to 1 against Captain-3fa85f, +90 coins"
- "Draw 1 to 1, stake returned"
- "Withdrawn, stake returned"
- "Declined by Captain-3fa85f, stake returned"
- "No answer within 24 h, stake returned"

Replay plays the stored reveal. Rematch opens New challenge with the name filled in.

### 11.7 Accessibility and phones

- **Focus and keys.** The kit modal traps focus, closes on Escape and gives focus back to the canvas.
  - The panel listens for `keydown` on its dialog and stops it there, so the arrow keys on a tab panel never move the explorer.
  - It calls `resetInput` on open and on close.
  - The game knows the panel is open (11.9): Escape closes the panel instead of opening the pause menu, and the gamepad and the hotkeys leave the explorer alone.
- **Controls.** Every control is a native button, radio or text field with a visible label and the kit's focus outline. Touch targets are at least 44 px and text at least 14 px (GRAPHICS).
- **375 x 667.**
  - Everything sits in one column and the tabs wrap.
  - The three signal buttons of a round fit in about 310 px, and the lanterns scale down.
  - There is no horizontal scroll.
- **Notices** use `role="status"`, and refusals use the sentences of 11.8.
- **Size.** The panel loads only on first use (a dynamic import), so the title and game chunks do not grow.

### 11.8 Messages

| Code | Sentence |
|---|---|
| `feature_off` | The ring is closed for now. |
| `unauthorized` | Sign in with GitHub to duel. |
| `no_such_captain` | No captain has that name. Check the spelling, or send an open challenge. |
| `name_not_unique` | Several captains share that name. Send an open challenge instead. |
| `cannot_duel_yourself` | You cannot challenge yourself. |
| `too_many_waiting` | You have 3 challenges waiting. Withdraw one or wait for an answer. |
| `insufficient_funds` | You do not have enough coins for this stake. |
| `already_applied` | None: the panel treats it as done and reads again. |
| `already_sealed` | Your signals for this duel are already sealed. |
| `duel_taken` | Another captain answered first. Your coins did not move. |
| `duel_closed` | This challenge is closed. |
| `duel_expired` | This challenge ran out of time. Its stake went back to the challenger. |
| `daily_pair_limit` | You have played 3 staked duels with this captain today. Try a friendly duel. |
| `not_your_duel` | Only the challenger can withdraw this challenge. |
| `no_such_duel` | This duel is not here any more. |
| `bad_rounds`, `bad_stake`, `wrong_signal_count`, `not_enough_oil`, `validation_error` | Pick a signal for every round within your oil. |
| `too_many_requests` | The ring is busy. Trying again in a moment. |
| `database_unavailable` | The ring did not answer. Your duel may have gone through; checking. |
| anything else | Something went wrong. Try again. |

### 11.9 The hook and the overlay lines: `frontend/src/game.js`

Directly after the existing line `const stopListening = on('interact', ...)`:

```js
// A7 Lantern Duels: the arena gate opens the duel panel, loaded only when first needed.
const stopArena = on('interact', event => {
  if (event.id !== 'arena_gate' || intro.active) return;
  import('./screens/duels/index.js')
    .then(module => { arenaScreen = module; return module.openArena({ container, resetInput: input.reset, focus: () => graphics.renderer.domElement.focus() }); })
    .catch(() => hud.message('The ring could not open. Try again.'));
});
```

Add `stopArena();` next to `stopListening();` in both clean-ups: the failed first `goTo` and `dispose()`.

- **The open panel is an overlay of the game.** This was not in the first version of this spec. The review of 6 Nov ran the real game in Chrome: the shell's Escape handler runs on `window` in the capture phase, before the dialog hears the key, and it opens the pause menu unless `hasOverlay()` says an overlay is open. So Escape opened the pause menu on top of the panel, and a gamepad stick still moved the explorer behind it. The fix is a few more lines in `game.js`, and `isArenaOpen()` in `screens/duels/index.js` (true while the dialog is open):
  - next to the other state variables: `let arenaScreen = null;` and `const arenaOpen = () => arenaScreen?.isArenaOpen() === true;`;
  - `world.isBlocked` gets `|| arenaOpen()`, the way it already has `caseUi?.active`, so `world.busy` is true while the panel is open and the explorer, the gamepad, the touch controls and the hotspots leave the game alone;
  - the block of the game loop that reads the hotkeys gets `&& !arenaOpen()`;
  - the `hasOverlay` the game hands to the shell gets `||arenaOpen()`.
- **Nothing else changes in shared client files:** not the case adapter, `case-spots.js`, `GRAPHICS.md` or `package.json`.
- **No extra clean-up call.** The panel stops its own polling when its element leaves the page, so the game's `dispose()` needs nothing more.

### 11.10 The practice fake (`?arena=local`, development only)

- **Start state.** So that every part of the panel shows, it starts with:
  - 500 coins;
  - one incoming challenge from "Brave Puffin 17" (3 rounds, friendly);
  - one open challenge from "Captain-7c41d2" (5 rounds, stake 25);
  - two past duels, one won and one expired.
- **The rival.** It answers the player's challenge about 6 s later with a uniformly chosen valid sequence, using `seededRandom` from `core/math.js` with a fixed seed.
- **Same rules as the server.** It uses the server's rules and numbers (`logic.js`), the same refusals, the same `revision` and the same view shape.
  - Held stakes, payouts and refunds each happen once.
  - It never puts the rival's signals in the view before the reveal.
- **The label.** It says on screen: "Practice ring: a local stand-in rival. Nothing is saved."

## 12. Tests to write first

The house rules for tests:

- No network (the `conftest.py` guard).
- Fixed seeds and a fake clock.
- One behaviour per test, with a name that reads like a sentence.
- No loops or `if` inside a test; use `parametrize` and helpers instead.

### 12.1 Server

**`test_duels_rules.py`**: the rules, the oil, fairness, the payout and the money conservation.

- `test_flash_beats_shade_shade_beats_mirror_mirror_beats_flash` (all 9 pairs)
- `test_the_same_signal_scores_for_nobody`
- `test_oil_is_the_number_of_rounds`
- `test_flash_costs_2_mirror_1_shade_0`
- `test_a_sequence_over_the_oil_is_refused` (Flash, Flash, Mirror, Mirror, Shade costs 6 of 5)
- `test_a_sequence_with_the_wrong_number_of_signals_is_refused`
- `test_only_3_or_5_rounds_and_the_five_stakes_are_allowed`
- `test_the_worked_example_ends_1_to_3`
- `test_equal_points_are_a_draw` (Flash, Shade, Shade against Shade, Flash, Shade)
- `test_swapping_the_captains_swaps_the_result` (all 3-round pairs)
- `test_no_sequence_is_unbeatable` (3 and 5 rounds)
- `test_there_are_17_sequences_of_3_rounds_and_147_of_5`
- `test_the_winner_takes_19_47_95_or_190`
- `test_a_friendly_duel_moves_no_coins`
- `test_duels_never_create_coins`: for every stake and outcome, the two captains' coins sum to 0 or to minus the cut
- `test_the_duel_day_starts_at_lisbon_midnight_also_on_the_october_clock_change`: 25 Oct 2026 at 00:30 UTC gives 24 Oct 23:00 UTC
- `test_the_duel_ref_fits_into_a_wallet_ref`

**`test_duels_views.py`**: visibility, decided in one place.

- `test_the_named_captain_sees_that_the_challenger_sealed_but_not_what`
- `test_the_view_of_an_unanswered_duel_is_the_same_whatever_the_challenger_sealed`
- `test_the_view_refuses_the_other_envelope_while_the_duel_is_open`
- `test_a_finished_duel_shows_both_sides_from_each_captain_point_of_view`
- `test_coins_change_for_winner_loser_draw_and_closed_duels`
- `test_held_stake_shows_only_for_the_challenger_of_a_waiting_staked_duel`
- `test_the_buttons_follow_the_role_and_the_status`
- `test_a_named_duel_is_hidden_from_other_captains`
- `test_an_answered_open_challenge_is_hidden_from_visitors`
- `test_a_captain_who_left_shows_no_name_and_no_signals`

**`test_duels_store.py`**: the database contract from the Python side.

- the argument dictionaries of the three functions;
- every read asks only for its columns and filters on the verified player;
- `done`, `refused` and odd replies are read correctly (an odd reply is a `502`);
- the list reads use the limits.

**`test_duels_routes.py`**: the contract of section 8, money repeats and secrecy.

- Every route:
  - needs sign-in (401);
  - answers `feature_off` while the flag is off and calls no database;
  - answers `private, no-store` when it succeeds (an error answer carries no cache header).
- Challenge:
  - a named staked challenge holds the stake and answers the detail;
  - an open challenge needs no name;
  - **the same challenge sent twice is created once** (`already_applied`, one function call);
  - each refusal gives its code: `no_such_captain`, `name_not_unique`, `cannot_duel_yourself`, `too_many_waiting`, `insufficient_funds` (nothing held), `bad_rounds`, `bad_stake`, `wrong_signal_count` and `not_enough_oil`;
  - an extra `playerId` field is a 422.
- Answer:
  - the named captain answers and both captains see the reveal;
  - the answer sends the round results and the outcome worked out in Python;
  - **a repeated answer is `already_applied`**;
  - **a second answer with a new `actionUid` is `already_sealed`**;
  - the challenger cannot answer their own challenge;
  - another captain cannot answer a named duel (404);
  - an open challenge answered first by someone else is `duel_taken`;
  - a withdrawn duel is `duel_closed`;
  - an expired challenge is refused and its stake goes back (one `duel_void` call);
  - `daily_pair_limit`;
  - a database timeout on the answer is a `503`, and nothing is retried.
- List:
  - the list has its four parts within their limits and never carries a signal;
  - my expired challenges are refunded at most five per request.
- Cancel:
  - withdraw and decline give the stake back;
  - a visitor cannot cancel (403);
  - cancelling twice is `already_applied`;
  - cancelling a finished duel is `duel_closed`.
- Secrecy:
  - **the no-leak test of section 9**;
  - `test_signals_never_reach_the_log` (caplog at DEBUG).

**`test_duels_migration.py`**: the SQL text and Python agree.

- the migration sorts after the Exchange;
- it adds `arena_stake` and `arena_payout`, in this order;
- Python has them right after the market reasons (`WALLET_REASONS[11:13]`: the position is pinned, not the end of the list, see 6.4);
- each function takes exactly the arguments the server sends, with no defaults;
- the functions are for the server only and not `security definer`;
- a refusal comes before any write: `duel_void` refuses a closed duel before it refunds, and `duel_answer` refuses a wrong state, the pair limit and an unknown duel before it takes the stake;
- `duel_moves(player_id)` has an index of its own;
- RLS is on for both tables, with one policy: a `select` on `duels`;
- there is no grant to `authenticated` on `duel_moves`;
- the server may only `select` and `insert` on `duel_moves`;
- the revoke comes before the grant;
- the wallets are locked in player-id order;
- the payout text rounds down and keeps the cut;
- the database's checks fit Python's numbers: rounds 3 and 5, stake at most 100, the three signals, round numbers up to 5, and the `actionUid` pattern.

**Changed files**, for recipe 4.7: `test_wallet.py` gets the two new pairs, and `test_wallet_matches_migration.py` now checks that the market reasons come right after the first eight.

**Money races** cannot be shown with a fake database. The route tests prove that the server sends one call per action and maps every refusal. The race itself is proven by the database checks in 12.3.

### 12.2 Client

The tests go in `frontend/tests/`. The Vitest setup has no DOM, so they test the pure logic and the adapters.

**`duels-logic.test.js`**

- a signal is offered only when the oil can pay for it;
- the seal needs one signal per round, within the oil;
- the local rules give the worked example 1 to 3;
- the payouts are 19, 47, 95 and 190, and a draw returns the stakes;
- the poll waits 5 s for two minutes, then 30 s, and stops after ten quiet minutes;
- a hidden page never polls, and showing it asks once;
- any action restarts the fast window;
- a `429` waits for `Retry-After`;
- the reveal has one step per round with the running score, and reduced motion gives one final step;
- every error code of 11.8 has a sentence, and an unknown code gets the generic one;
- a captain name follows the display-name rule.

**`duels-index.test.js`**

- the lazy entry builds one panel for two quick presses, and builds a fresh one after the game shut the old one down;
- `isArenaOpen()` is true only while the panel's dialog is open (a small stand-in panel, because there is no DOM).

**`duels-fake.test.js`**

- the rival's signals are never in the view before the reveal;
- a staked challenge holds the stake once, and the answer pays the winner once;
- a draw returns both stakes;
- withdrawing returns the stake;
- a repeated intent with the same `actionUid` changes nothing;
- an expired challenge returns its stake;
- the rival answers after the delay, within the oil.

**`duels-http.test.js`**

- it reads `/api/config` first, and asks nothing more while the flag is off;
- it asks nothing without a token, and says how to sign in;
- it sends the exact method, path, body and `Bearer` header for each intent, and never a player id;
- it keeps the `actionUid` after a network failure or a 503, and `retry()` sends the same one;
- `already_applied` reads again and counts as done;
- it maps every refusal to its sentence and keeps the last view;
- it sends one request at a time.

**By hand** (screen builder, with screenshots in the pull request):

1. `cd frontend && npm run dev`, then open `/?arena=local`.
2. Start a game, sail to Smugglers' Cove (chart: M), walk to the arena gate and press E.
3. Play a staked practice duel using the keyboard only.
4. Check the spoken text with VoiceOver.
5. Switch reduced motion on in the game settings.
6. Repeat at 375 x 667.
7. Without `?arena=local`, the panel says the ring is closed.
8. In the running game, Escape in the panel closes the panel and does not open the pause menu. With a gamepad, the stick does not move the explorer while the panel is open, and Start or B closes it.

### 12.3 Database (server builder, on a private scratch Postgres 17 if one can be started)

No system Postgres and no Docker were installed on the development machine on 6 Nov, but a scratch Postgres 17 can be started without either: the npm package `@embedded-postgres/darwin-x64` carries the server binaries (the review of 6 Nov ran 17.9 from it, on the loopback address only, and stopped it afterwards). If none can be started, say so in the report; the gate says "if you can".

The scratch database needs stand-ins for Supabase, never committed:

- the roles `anon`, `authenticated` and `service_role`;
- a schema `auth` with a table `users (id uuid primary key)`;
- a function `auth.uid()` that reads `request.jwt.claims`.

Apply the three migrations, then all three again; there must be no error. Then, with two test captains holding 1,000 coins each:

1. **The worked example, staked 100.** A's balance is 900 after the challenge and B's is 1090 after the answer (1000 - 100 + 190). The arena rows of the duel sum to -10.
2. **The same `duel_create` twice.** The second raises `23505`; A still has 900, and there is one duel.
3. **The race.** Two `psql` sessions answer the same open challenge inside open transactions. The second waits, then gets `duel_taken` after the first commits. The second captain's balance is unchanged.
4. **A draw** (Flash, Shade, Shade against Shade, Flash, Shade, staked 50). Both balances are back where they were, and the rows sum to 0.
5. **Closing a duel.** Each refund happens once.
   - Withdraw twice: the second raises `23505`.
   - Decline.
   - Expire before the deadline (`not_expired`) and after it (a refund). To pass the deadline, move `created_at` and `expires_at` back together as the default role, because `expires_at` must stay after `created_at`.
6. **Insufficient funds on the answer.** An error, no envelope, and the duel still open.
7. **The caps.** A fourth waiting challenge is refused. The fourth staked duel of the day between A and B is refused (or pass a limit of 1).
8. **Players and roles.**
   - As `authenticated`, B reads 1 duel and gets `permission denied` on `duel_moves`.
   - `anon` gets `permission denied` on both tables.
   - Neither role can run the three functions.
   - `service_role` cannot update or delete a row of `duel_moves`.
9. **Clean up.** Stop the server and delete its data folder.

The same steps, shortened to what the Supabase SQL editor can do, become steps D1 to D12 of the manual test plan in `supabase/README.md`, after E13. The SQL editor runs each block as its own transaction, so the race needs `psql`.

## 13. Documents to update (server builder)

- **`docs/INTERFACES.md`:**
  - a "Lantern Duels (package A7)" part in section 2, like the Island Exchange's: routes, rules list and errors, with `routes/duels.py` as the home;
  - the codes of 8.7 in section 1;
  - the two tables and three functions in section 4;
  - the two reasons in section 5;
  - the A7 row of section 9: built, flag off, migration not applied, and the two new routes;
  - the "PvP arena (A7)" rules: sealed signals and the polling numbers of section 10.
- **`supabase/README.md`:**
  - the files table;
  - a "Lantern Duels migration" section;
  - the two reasons;
  - the quick-check numbers of 6.5;
  - the matrix rows of 6.2 and the function rows;
  - "What the server's secret key may do";
  - steps D1 to D12.
- **`docs/DECISIONS.md`:** **D026 · Lantern Duels rules · 2026-11-06.** It was D018 on the branch and became D026 at merge; the story round keeps D018.
  - Decision: sections 2, 4 and 5, in short.
  - Why: fair and explainable, nobody loses by being offline, few calls, and one atomic function per money change.
  - Alternatives and trade-offs:
    - live round-by-round duels now: more calls, round timers and forfeits; planned for later;
    - a separate accept step: a half-accepted duel needs a deadline and a forfeit; rejected;
    - hash commitments: the server is already the trusted referee; rejected;
    - no cut: simpler, but no coin sink and cheaper coin passing; open for Nils;
    - `duel.json` for the numbers: D017 used constants; open for Nils.
  - Agreed by: pending Nils and a reviewer.
- **`.env.example`:** no change. There is no new setting, and the `FEATURE_FLAGS` line already lists `arena`.
- **Other files.** The screen builder writes `frontend/src/screens/duels/README.md`. Nobody touches `ROADMAP.md`, `docs/STATUS.md`, `frontend/GRAPHICS.md`, `vercel.json` or `.github/`.

## 14. The 23 Nov minimum, the floor, and later

**The minimum: on `main` by Mon 23 Nov with `arena` off, built in this session.**

1. The migration of section 6, parsed and, if possible, applied twice on a scratch Postgres 17.
2. The server of section 7, with all five routes and the tests of 12.1.
3. The arena panel of section 11:
   - the practice fake and the HTTP mapping;
   - the picker, the reveal, and results and history;
   - keyboard, screen reader, reduced motion and 375 px;
   - the hook at `arena_gate`.
4. The documents of section 13.

What the minimum plays:

- sealed signals only, with 3 or 5 rounds;
- named and open challenges;
- friendly and staked duels (0, 10, 25, 50, 100), with the 5 % cut;
- the 24-hour window with lazy expiry;
- withdraw and decline;
- the two caps.

**The floor, if time runs out.** The roadmap's own minimum ("three rounds, no stakes") is the same code with `ROUND_CHOICES = (3,)`, `STAKE_CHOICES = (0,)` and the matching tests. The migration does not change, because it already allows 5 rounds and stakes, so growing back later is one small pull request.

**After 23 Nov** (should or later, each behind `arena`):

- **Live duels** (OPEN-WORLD: "both players online, round by round"):
  - a new style value;
  - accepting holds both stakes and opens round 1 with a 30-second timer;
  - in each round both captains seal one signal, and the server reveals it when both are in;
  - oil carries over, and spent oil shows only for revealed rounds;
  - the screen polls every 3 s while a live duel is on screen, about 80 calls a duel.
- **Forfeits,** with live duels:
  - if only one captain sealed the current round by its deadline, the other forfeits and the duel pays out as a win;
  - if neither did, the duel is void and both stakes come back;
  - a captain may strike their colours at any time (`POST /api/duels/{id}/forfeit`).
  - This needs a new migration (style, current round, round deadline) and the functions `duel_accept()`, `duel_round()` and `duel_timeout()`.
- **Preset taunts:**
  - `backend/content/duels/taunts.json`, about 8 lines about "the boss on the water";
  - a `tauntId` on the challenge and on the answer, shown with the reveal;
  - a new migration that adds two columns.
- **The weekly cup:** a title, no coins, counted at Monday 00:00 Lisbon from `duels` (most wins, with at least 5 duels) and shown in the Monday bulletin. The table already has what it needs.
- **Smaller items:**
  - the Keepers' Ring at the harbor after the Relighting;
  - a per-player limit on duel actions, like the Exchange's;
  - history pages beyond 10;
  - a practice bout against the ring's crew for lone players. This needs Nils' OK, because OPEN-WORLD keeps NPCs out of every loop.

## 15. Done when (acceptance checks)

- [ ] `cd backend && uv run pytest -q`: every test passes; paste the count.
- [ ] `cd backend && uv run ruff check .` says "All checks passed!", and `uv run ruff format --check` on every changed Python file finds nothing to reformat.
- [ ] The parse check of ENGINEERING 4.2, step 9, says "SQL parses: 3 file(s)".
- [ ] Scratch Postgres 17, if it can run: the three migrations apply twice without an error, and the checks of 12.3 give the expected balances. Then the server is stopped and its folder deleted. If it cannot run, the report says so.
- [ ] `cd frontend && npm install && npm test && npm run build`: the tests pass, the build passes and the spoiler guard prints its line.
- [ ] The roadmap's acceptance checks are met:
  - a move out of turn is refused with no change (the `already_sealed`, `duel_closed` and `no_such_duel` tests);
  - the server stores the result of every round (`round_results`);
  - stakes are taken once and paid once, with the duel id in the ref (the repeat tests, the unique ledger index, and 12.3);
  - a timed-out duel returns every stake that was taken (section 4);
  - no free text: no text field reaches another player.
- [ ] With the flag off, every duel route answers `404 feature_off` (tests), and the panel says the ring is closed (by hand).
- [ ] The practice ring is checked by hand at desktop size and at 375 x 667, keyboard only, with reduced motion on and off, with screenshots in the pull request.
- [ ] The diff touches only the owned files, plus the shared lines named in 7.4 and 11.9. There is no secret, no `.env` and no generated cache.
- [ ] A different human teammate has reviewed and approved the current change. The migration is applied to Supabase only after that review, following Nils' rule of 5 Nov: an Opus review and all tests first, and each application is reported.

## 16. Out of scope

- Live duels, round timers, forfeits, taunts, the weekly cup and the Keepers' Ring (section 14).
- NPC opponents in the real game. OPEN-WORLD's rule is that NPC partners join no loop; the practice rival is for development only.
- Realtime, WebSockets, cron, and any timer on the server.
- Sign-in inside the game client (A2). The panel waits for a token getter.
- Applying the migration to Supabase and switching `arena` on. Nils decides, after review.
- These files: the case adapter, `case-spots.js`, `frontend/GRAPHICS.md` and `package.json` (Codex is changing them on another branch), plus `vercel.json`, `.github/`, `docs/STATUS.md` and `ROADMAP.md`.

## 17. Contracts touched

- [x] **API:** `GET /api/duels` (new), `POST /api/duels`, `GET /api/duels/{id}`, `POST /api/duels/{id}/move` and `POST /api/duels/{id}/cancel` (new). Home: `backend/server/routes/duels.py`.
- [x] **Browser:** no new event. One `interact` listener for the existing hotspot id `arena_gate`, and the overlay lines of 11.9.
- [x] **Database:** the tables `duels` and `duel_moves`, one policy, three functions, and the matrix in `supabase/README.md`.
- [x] **Shared lists:** the reasons `arena_stake` (spend) and `arena_payout` (earn), in the migration and in `WALLET_REASONS`. The flag `arena` already exists. No new setting.
- [ ] **Content format:** none for the minimum (taunts come later).
- [x] **Decisions:** D026, Lantern Duels rules (renumbered at merge).

## 18. Open questions for Nils

The spec's answer stands until he decides.

1. **The cut:** 5 % of a staked pot, not paid out (OPEN-WORLD 6.3), or none? Spec: 5 %.
2. **Stakes at the first switch-on:** up to 100 from each captain, or friendly duels only at first (the roadmap's minimum)? Spec: stakes on. The floor in section 14 is one constant away.
3. **The answer window:** 24 hours (OPEN-WORLD), or shorter for class, for example 1 hour for open challenges? Spec: 24 hours.
4. **Live round-by-round duels** after 23 Nov: keep them in the plan, or drop them?
5. **Two routes beyond the reserved names** (`GET /api/duels` and `POST /api/duels/{id}/cancel`): agree them at the Mon 9 freeze.
6. **The numbers:** Python constants (as D017 did) instead of OPEN-WORLD's `duel.json`?

## 19. Owner and reviewer

- **Responsible teammate:** the A-lane owner (not yet named); Nils until then.
- **Coding agents:** Claude, as a server builder and a screen builder, with one writer per file set on one branch. The teammate stays responsible for their output.
- **Reviewer:** a different human teammate. In week 1, A is paired with L.
- **Pull requests:** the work is larger than the roadmap's 400-line guide. If the team keeps that guide, split it into three: the database and its documents, the server, and the screen.
- **Last updated:** 2026-11-06.

## Appendix A: migration sketch

It parses with `pglast` (6 Nov 2026). The comments are still to be added.

```sql
insert into public.wallet_reasons (reason, direction, description) values
  ('arena_stake',  'spend', 'Coins held as the stake of a Lantern Duel.'),
  ('arena_payout', 'earn',  'Coins paid out of a Lantern Duel: the winnings, or a stake that comes back.')
on conflict (reason) do nothing;

create table if not exists public.duels (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id   uuid references public.profiles (id) on delete set null,
  is_open       boolean not null,
  rounds        smallint not null,
  stake         integer not null,
  cut_percent   smallint not null,
  status        text not null default 'open',
  outcome       text,
  round_results text[],
  create_uid    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  answered_at   timestamptz,
  closed_at     timestamptz,

  constraint duels_rounds_allowed check (rounds in (3, 5)),
  constraint duels_stake_range check (stake between 0 and 100),
  constraint duels_cut_percent_range check (cut_percent between 0 and 20),
  constraint duels_status_allowed
    check (status in ('open', 'finished', 'withdrawn', 'declined', 'expired')),
  constraint duels_outcome_allowed check (outcome in ('challenger', 'opponent', 'draw')),
  constraint duels_not_against_yourself check (opponent_id <> challenger_id),
  constraint duels_create_uid_format check (create_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint duels_expires_after_creation check (expires_at > created_at),
  constraint duels_result_only_when_finished
    check ((status = 'finished') = (outcome is not null and round_results is not null and answered_at is not null)),
  constraint duels_closed_time_only_when_closed
    check ((status = 'open') = (closed_at is null)),
  constraint duels_round_results_fit
    check (round_results is null
           or (cardinality(round_results) = rounds
               and round_results <@ array['challenger', 'opponent', 'even']))
);

create unique index if not exists duels_one_row_per_create_uid
  on public.duels (challenger_id, create_uid);
create index if not exists duels_challenger_id_idx on public.duels (challenger_id, created_at desc);
create index if not exists duels_opponent_id_idx on public.duels (opponent_id, created_at desc);
create index if not exists duels_status_idx on public.duels (status, created_at desc);

create table if not exists public.duel_moves (
  duel_id    uuid not null references public.duels (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  round_no   smallint not null,
  signal     text not null,
  action_uid text not null,
  sealed_at  timestamptz not null default now(),

  primary key (duel_id, player_id, round_no),
  constraint duel_moves_round_no_range check (round_no between 1 and 5),
  constraint duel_moves_signal_allowed check (signal in ('flash', 'shade', 'mirror')),
  constraint duel_moves_action_uid_format check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$')
);

create index if not exists duel_moves_player_id_idx on public.duel_moves (player_id);

alter table public.duels      enable row level security;
alter table public.duel_moves enable row level security;

drop policy if exists "Players can read the duels they take part in" on public.duels;
create policy "Players can read the duels they take part in"
  on public.duels for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()));

revoke all on table public.duels, public.duel_moves
from public, anon, authenticated, service_role;
grant select on table public.duels to authenticated;
grant select, insert, update on table public.duels to service_role;
grant select, insert on table public.duel_moves to service_role;

create or replace function public.duel_create(
  p_challenger_id uuid,
  p_opponent_name text,
  p_rounds        integer,
  p_stake         integer,
  p_cut_percent   integer,
  p_signals       text[],
  p_create_uid    text,
  p_answer_hours  integer,
  p_max_waiting   integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_balance       bigint;
  v_matches       integer;
  v_opponent_id   uuid;
  v_opponent_name text;
  v_waiting       integer;
  v_duel_id       uuid;
  v_round         integer;
begin
  if p_challenger_id is null
     or p_rounds is null or p_rounds not in (3, 5)
     or p_stake is null or p_stake < 0 or p_stake > 100
     or p_cut_percent is null or p_cut_percent < 0 or p_cut_percent > 20
     or p_signals is null or cardinality(p_signals) <> p_rounds
     or p_create_uid is null
     or p_answer_hours is null or p_answer_hours < 1 or p_answer_hours > 72
     or p_max_waiting is null or p_max_waiting < 1 then
    raise exception 'bad_duel';
  end if;

  select balance into v_balance
    from public.wallets where player_id = p_challenger_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  if exists (
    select 1 from public.duels
     where challenger_id = p_challenger_id and create_uid = p_create_uid
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  if p_opponent_name is not null then
    select count(*) into v_matches
      from public.profiles
     where lower(display_name) = lower(btrim(p_opponent_name));
    if v_matches = 0 then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_captain');
    end if;
    if v_matches > 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'name_not_unique');
    end if;
    select id, display_name into v_opponent_id, v_opponent_name
      from public.profiles
     where lower(display_name) = lower(btrim(p_opponent_name));
    if v_opponent_id = p_challenger_id then
      return jsonb_build_object('status', 'refused', 'reason', 'cannot_duel_yourself');
    end if;
  end if;

  select count(*) into v_waiting
    from public.duels
   where challenger_id = p_challenger_id and status = 'open' and expires_at > now();
  if v_waiting >= p_max_waiting then
    return jsonb_build_object('status', 'refused', 'reason', 'too_many_waiting');
  end if;

  insert into public.duels
    (challenger_id, opponent_id, is_open, rounds, stake, cut_percent, create_uid, expires_at)
  values
    (p_challenger_id, v_opponent_id, p_opponent_name is null, p_rounds, p_stake, p_cut_percent,
     p_create_uid, now() + make_interval(hours => p_answer_hours))
  returning id into v_duel_id;

  for v_round in 1 .. p_rounds loop
    insert into public.duel_moves (duel_id, player_id, round_no, signal, action_uid)
    values (v_duel_id, p_challenger_id, v_round, p_signals[v_round], p_create_uid);
  end loop;

  if p_stake > 0 then
    v_balance := public.apply_wallet_transaction(
      p_challenger_id, -p_stake, 'arena_stake', 'duel:' || v_duel_id::text);
  end if;

  return jsonb_build_object(
    'status', 'done', 'duelId', v_duel_id, 'opponentId', v_opponent_id,
    'opponentName', v_opponent_name, 'balance', v_balance);
end;
$$;

revoke all on function public.duel_create(uuid, text, integer, integer, integer, text[], text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.duel_create(uuid, text, integer, integer, integer, text[], text, integer, integer)
  to service_role;

create or replace function public.duel_answer(
  p_duel_id          uuid,
  p_player_id        uuid,
  p_signals          text[],
  p_action_uid       text,
  p_round_results    text[],
  p_outcome          text,
  p_day_start        timestamptz,
  p_pair_daily_limit integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_duel              public.duels%rowtype;
  v_result            text;
  v_challenger_points integer := 0;
  v_opponent_points   integer := 0;
  v_wallets_locked    integer;
  v_staked_today      integer;
  v_ref               text;
  v_payout            bigint;
  v_round             integer;
  v_balance           bigint;
begin
  if p_duel_id is null or p_player_id is null or p_signals is null or p_action_uid is null
     or p_round_results is null
     or p_outcome is null or p_outcome not in ('challenger', 'opponent', 'draw')
     or p_day_start is null or p_day_start > now() + interval '1 minute'
     or p_pair_daily_limit is null or p_pair_daily_limit < 1 then
    raise exception 'bad_duel';
  end if;

  select * into v_duel from public.duels where id = p_duel_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;

  if exists (
    select 1 from public.duel_moves where duel_id = p_duel_id and player_id = p_player_id
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  if v_duel.status <> 'open' then
    if v_duel.is_open and v_duel.status = 'finished' then
      return jsonb_build_object('status', 'refused', 'reason', 'duel_taken');
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'duel_closed');
  end if;
  if not v_duel.is_open and v_duel.opponent_id is distinct from p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;
  if v_duel.expires_at <= now() then
    return jsonb_build_object('status', 'refused', 'reason', 'duel_expired');
  end if;

  if cardinality(p_signals) <> v_duel.rounds
     or cardinality(p_round_results) <> v_duel.rounds
     or not (p_round_results <@ array['challenger', 'opponent', 'even']) then
    raise exception 'bad_duel';
  end if;
  foreach v_result in array p_round_results loop
    if v_result = 'challenger' then
      v_challenger_points := v_challenger_points + 1;
    elsif v_result = 'opponent' then
      v_opponent_points := v_opponent_points + 1;
    end if;
  end loop;
  if (p_outcome = 'challenger' and v_challenger_points <= v_opponent_points)
     or (p_outcome = 'opponent' and v_opponent_points <= v_challenger_points)
     or (p_outcome = 'draw' and v_challenger_points <> v_opponent_points) then
    raise exception 'bad_duel';
  end if;

  perform 1 from public.wallets
   where player_id in (v_duel.challenger_id, p_player_id)
   order by player_id
     for update;
  get diagnostics v_wallets_locked = row_count;
  if v_wallets_locked <> 2 then
    raise exception 'wallet_not_found';
  end if;

  if v_duel.stake > 0 then
    select count(*) into v_staked_today
      from public.duels
     where status = 'finished' and stake > 0 and answered_at >= p_day_start
       and ((challenger_id = v_duel.challenger_id and opponent_id = p_player_id)
         or (challenger_id = p_player_id and opponent_id = v_duel.challenger_id));
    if v_staked_today >= p_pair_daily_limit then
      return jsonb_build_object('status', 'refused', 'reason', 'daily_pair_limit');
    end if;
  end if;

  v_ref := 'duel:' || p_duel_id::text;
  if v_duel.stake > 0 then
    perform public.apply_wallet_transaction(p_player_id, -v_duel.stake, 'arena_stake', v_ref);
  end if;

  for v_round in 1 .. v_duel.rounds loop
    insert into public.duel_moves (duel_id, player_id, round_no, signal, action_uid)
    values (p_duel_id, p_player_id, v_round, p_signals[v_round], p_action_uid);
  end loop;

  update public.duels
     set opponent_id   = p_player_id,
         status        = 'finished',
         outcome       = p_outcome,
         round_results = p_round_results,
         answered_at   = now(),
         closed_at     = now()
   where id = p_duel_id;

  v_payout := 0;
  if v_duel.stake > 0 and p_outcome = 'draw' then
    perform public.apply_wallet_transaction(v_duel.challenger_id, v_duel.stake, 'arena_payout', v_ref);
    perform public.apply_wallet_transaction(p_player_id, v_duel.stake, 'arena_payout', v_ref);
  elsif v_duel.stake > 0 then
    v_payout := (2 * v_duel.stake * (100 - v_duel.cut_percent)) / 100;
    if p_outcome = 'challenger' then
      perform public.apply_wallet_transaction(v_duel.challenger_id, v_payout, 'arena_payout', v_ref);
    else
      perform public.apply_wallet_transaction(p_player_id, v_payout, 'arena_payout', v_ref);
    end if;
  end if;

  select balance into v_balance from public.wallets where player_id = p_player_id;
  return jsonb_build_object('status', 'done', 'balance', v_balance, 'winnerTakes', v_payout);
end;
$$;

revoke all on function public.duel_answer(uuid, uuid, text[], text, text[], text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.duel_answer(uuid, uuid, text[], text, text[], text, timestamptz, integer)
  to service_role;

create or replace function public.duel_void(
  p_duel_id    uuid,
  p_player_id  uuid,
  p_new_status text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_duel    public.duels%rowtype;
  v_balance bigint;
begin
  if p_duel_id is null or p_player_id is null
     or p_new_status is null or p_new_status not in ('withdrawn', 'declined', 'expired') then
    raise exception 'bad_duel';
  end if;

  select * into v_duel from public.duels where id = p_duel_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;

  if v_duel.status <> 'open' then
    if v_duel.status = p_new_status
       and ((p_new_status = 'withdrawn' and v_duel.challenger_id = p_player_id)
         or (p_new_status = 'declined' and v_duel.opponent_id = p_player_id)) then
      raise exception 'already_applied' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'duel_closed');
  end if;

  if p_new_status = 'withdrawn' and v_duel.challenger_id <> p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'not_your_duel');
  end if;
  if p_new_status = 'declined'
     and (v_duel.is_open or v_duel.opponent_id is distinct from p_player_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_your_duel');
  end if;
  if p_new_status = 'expired' and v_duel.expires_at > now() then
    return jsonb_build_object('status', 'refused', 'reason', 'not_expired');
  end if;

  select balance into v_balance
    from public.wallets where player_id = v_duel.challenger_id for update;

  if v_duel.stake > 0 then
    v_balance := public.apply_wallet_transaction(
      v_duel.challenger_id, v_duel.stake, 'arena_payout', 'duel:' || p_duel_id::text);
  end if;

  update public.duels set status = p_new_status, closed_at = now() where id = p_duel_id;

  return jsonb_build_object(
    'status', 'done', 'refunded', v_duel.stake, 'challengerBalance', v_balance);
end;
$$;

revoke all on function public.duel_void(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.duel_void(uuid, uuid, text)
  to service_role;
```

**Notes for the builder:**

- A refusal returns before any write, so nothing needs undoing.
- When `apply_wallet_transaction()` raises `insufficient_funds`, the whole call rolls back.
- Integer division rounds the payout down for these positive numbers.
- The comments of `duel_answer` must say that the round results are an input from Python, and that the database checks only what follows from them.
- The migration file in `supabase/migrations/` is the source of truth, not this sketch. The file has run twice on a scratch Postgres 17 and passed the checks of 12.3; the sketch itself is not run.
