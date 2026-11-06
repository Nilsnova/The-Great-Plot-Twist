> **SPOILER WARNING:** this implementation spec describes the case rules and names its solution. Do not read it before playing. Labelled per Nils (D018).

# Implementation spec: the case backend (S3, L3, the Relighting switch, S4)

**For:** the Sonnet builders, one phase at a time, and Claude, who integrates, writes the real case adapter and applies the migrations.

**Starts when:**
- A2, A3 and A6 are on `main`. They were committed at 23:48 on 5 Nov on `feat/a2-a3-signin-referee` (`431e23c`) and `feat/a6-crews` (`ddb706c`), and the merge is planned for Fri 6.
- The story round is on `main`: `docs/s0-story-round`, committed as `dd2f1f2` at 00:08 on 6 Nov.
- Two parts depend on other packages:
  - The live nudges need A4's crew broadcaster.
  - The third light needs L2's signal station (section 1).

**M2 target (Wed 18, freeze 18:00):**
- A crew of four, and a solo player with three partners, both finish the case: 8 cards, 4 deductions, the Night of Three Lights, the accusation and the reveal.
- The rewards are paid once per player, and this is shown on the deployed build.
- The Relighting is proven on scratch Postgres (W1 to W9) and in tests, **never on the live project**. `RELIGHT_OPEN` stays false until the game opens, so a live solve answers `world: locked`.
- The solo run on the deployed build uses the host clock route (section 3.2). Without it, every end-to-end check would take 2 to 2.5 hours of real time.

**Written from (newest content used; nothing in any repository was changed):**
- `main` at `606ee4a`: two status-doc commits on top of `3d59b6a`, so S1 Story v2 is merged. Read there:
  - ROADMAP.md, AGENTS.md, docs/ENGINEERING.md, docs/INTERFACES.md (section 7), docs/ARCHITECTURE.md (preview and production share one Supabase project), docs/DECISIONS.md (D003, D004, D012, D016, D017), supabase/README.md and both migrations.
  - `backend/server`: app, auth, supabase_admin, wallet, errors, flags, settings (`APP_ENV`), routes and `market/`; also `routes/content.py`.
  - `frontend/GRAPHICS.md` ("Case adapter" to "Case view-model details"), `frontend/src/adapter/`, `frontend/src/world/places/registry.js` and `case-spots.js`.
- The story round, committed as `dd2f1f2` (00:08). CASE-FILE.md, OPEN-WORLD.md, docs/story/README.md and `case.json` changed until 00:05. I re-read every number this spec uses from the committed files. Also read: NPC-PARTNERS.md, TIMING.md, `backend/content/secret/case.json`, `backend/content/partners.json`, the case section of `backend/content/README.md` and `test_case_timing.py`.
- `specs/M1-backbone.md` in the a2a3 worktree (23:43), and the A2, A3 and A6 code on their branches (`hosts.py` `HostDep`, `entry_profile_store.py`, `crews/seats.py`).
- A4: `specs/A4-live-presence.md` (22:54) and `backend/server/crew_broadcast.py` (22:57), uncommitted in the a4 worktree. Its migration is `20261106050000_live_presence.sql`.
- L2: `specs/L2-home-islet.md` (23:25), `supabase/migrations/20261106070000_home_islet.sql` (still changing at 23:49) and `backend/server/game/islet_store.py`, `building.py` and `building_catalogue.py`, all uncommitted in the l2 worktree.
- G7: the conformance suite `frontend/src/adapter/conformance/suite.js` and `contract.js` (`caseReasons`), committed on `feat/g7-living-world` (branch now at `acdfbf8`). Its fixture harness is still being built.
- Decisions:
  - the approval sheet (19 decisions);
  - the end of `20261105_Roadmap-Inputs.md` (23:26): no demo world, the relight lock as one server setting, live multiplayer core, the migrations rule, and the Exchange rework to 10x positions;
  - `20261106_Roadmap_v0.3.md` (the review dates);
  - `20261106_Security-Audit_Findings.md` (preview deployments hold production secrets; the fake adapter leaks the culprit by elimination).
- `git worktree list` and every sibling's `specs/` and `supabase/migrations/`, checked before any number was picked.

**What I checked:**
- **Copied bearings.** I reran the schooner formula of 5.3 in memory for 200 crew ids (39,800 ordered pairs). A bearing copied from another crew hits at the Keeper's lamp 78% of the time, at the Harbor Light 51% and at the home station 67%. All three copied bearings hit together 44% of the time. The claim "a copied bearing usually misses" is false, so its test is gone (5.10).
- **The glow.** A glow rounded to whole chart units is at most 0.27 degrees from the true bearing for those 200 crews. Anywhere in the 20-unit disc it is at most about 0.35 degrees (bound 0.41).
- **SQL.** Every changed SQL block parses with pglast 8.7, including the PL/pgSQL bodies. I sent the SQL through stdin and wrote no files. Nothing ran on a database: the opt-in database tests (3.12) are the first behaviour test.
- **Numbers.** Every number below matches the committed `case.json`: windows, timers, the night values (1,200, 180, 90, 5 and 60 seconds), rewards (50, 200, and a share of 400 to 800), refs, the kit order, light ids and chart positions.
- **Examples.** Every example in this spec is recomputed from the rules. Section 4.11 makes the main example a test.

---

## This revision (what changed after the review)

1. The copied-bearing test is gone. A seeding test replaces it, the story sentences get corrected, and C8 now carries the glow fact.
2. The server sends `writeRevision`, which grows by one on every write. The adapter makes G6's `revision` from structural changes. Light posts are now history rows that never get deleted.
3. Nudges go through A4's real broadcaster: its kinds, `{"version": n}` data and a 1 s cut-off.
4. The migrations are renumbered to 060000, 080000, 090000 and 100000, and the timestamps now come from a reservation list.
5. `RELIGHT_OPEN=true` stops the server from starting unless `APP_ENV` is production.
6. A repeated request answers 200 with the stored outcome, so a retried refusal stays a refusal.
7. One station built by any player readies the home light for the whole crew.
8. Running Phase 1's migration again can no longer undo the Relighting hook (W9).
9. `GET /api/world` sits behind the flag. A migration is applied before the merge that reads it.
10. Opt-in database tests run every scratch check, plus static checks of the SQL.
11. "Holds a card" now means "found by now".
12. The host clock route is in the minimum. Section 10 has the schedule and a cut list.
13. The rest of the fixes:
    - The world outcome goes to every solver.
    - Rewards are computed under the lock.
    - Crew status answers are now consistent.
    - The examples are recomputed.
    - L2's helper names are used.
    - Every G6 field has a source.
    - Position and boarding are presentation only.
    - Two CASE-FILE tests are extended.
    - The Wall rule (C16) waits for a decision.
    - The share route is pending the Exchange rework.

---

**Binding handoff update, 6 Nov 2026:** Nils confirmed C4, C6, C9, C16 and C18 as built; see `docs/handoff/nils-decisions-6nov.md`. Case contracts use decision D027. The corrected migration reservations below supersede the original revision. Codex owns the named server work under Claude's review; Claude alone applies live migrations. `docs/STATUS.md` remains untouched.

## 0. Rules for the builders

- **Git and safety:** the same as M1-backbone section 0.
  - Never commit, push, stash, reset or switch branches unless the controller says so.
  - Never connect to the real Supabase project, and never open `.env`.
  - Tests use fakes, and `conftest.py` blocks the network.
  - A migration is applied only on a private scratch Postgres that is stopped afterwards (3.12).
- **Migrations:**
  - Claude applies a migration to the project only after an Opus review and with all tests green (Nils, 5 Nov). Each applied migration is reported.
  - Migrations are reviewed and applied in batches (section 10).
  - **Apply a migration before the merge that deploys code reading it.** A merge to `main` deploys production at once.
  - Turn the flag `case` on in an environment only when every case migration that its code reads is applied.
- **Numbers:** take migration timestamps and decision numbers only from the shared reservation lists (3.11 and section 11). Before you call a dependency missing, run `git worktree list` and look in every sibling's `specs/` and `supabase/migrations/`.
- **Never touch:**
  - `vercel.json` (never add `crons`), `docs/STATUS.md`, and any migration that is merged or belongs to another package;
  - `frontend/`: the real adapter is Claude's own task (section 8);
  - `backend/content/secret/case.json`, except the optional route `label` in 4.3;
  - `docs/story/`, except the two corrected sentences of 5.11 step 1, which need the story owner's OK.
- **Conventions:**
  - One job per file, with a plain-English header comment.
  - Functions of about 20 lines.
  - `ApiError` for every HTTP error.
  - camelCase in JSON, snake_case in Python and SQL.
  - No em dash, en dash or double hyphen in prose, comments or SQL comments.
  - ruff B008: no function call in an argument default.
- **Test traps:**
  - `test_wallet_matches_migration.py` reads every migration. No case migration adds a wallet reason. Never write the text `insert into public.wallet_reasons`, nor `update`, `delete from` or `truncate` followed by `wallet_reasons`, not even in a comment.
  - `supabase_admin.read_reply()` turns **any** Postgres 23505 into `409 already_applied`. In every case store module, catch `AlreadyApplied` around RPC calls and raise `SupabaseRejected` (502). The case functions answer a repeat with `{"status":"repeat", ...}` and never raise 23505 on purpose.
- **Gates before you report:**
  - `cd backend && uv run pytest -q` passes. The opt-in database tests skip here.
  - `uv run ruff check .` is clean.
  - `uv run ruff format --check <changed files>` passes.
  - The pglast parse (ENGINEERING 4.2, step 9) passes.
  - The phase's database tests pass: `cd backend && CASE_PG_SCRATCH=1 uv run --with pgserver --with "psycopg[binary]" pytest -q server/tests/case_sql`. They apply every migration in the checkout twice (3.12).
  - `python3 -I backend/tools/simulate_case.py` exits with 0 after any change to a minute, a window or a price.

---

## 1. What this spec needs from other packages

| From | What | Used by | State on 6 Nov, 00:15 | If it is late |
|---|---|---|---|---|
| A6 (`20261106040000_crew_codes.sql`) | `crews.started_at` (set at the muster), `crews.version`, `crews.code`; partner seats with kits in the order informant, stranger, true_keeper, witness; `crews/seats.py` (`KITS`, `NPC_KIT_ORDER`, `PARTNERS`, `partner_seats`); A6's read of the player's seats | every phase | Committed on `feat/a6-crews` (`ddb706c`), merging Fri 6 | Blocks Phase 1 |
| A3 (`20261106030000_entry_profiles.sql`) | `entry_profiles.read_log` and `kit`; `backend/content/entry_kits.json` | log lead, reveal log line, parity test | Committed on `feat/a2-a3-signin-referee` (`431e23c`) | Blocks the log lead (on the cut list); everything else works |
| A2 | `HostDep` (`backend/server/hosts.py`) for the host clock route, which is now in the minimum; captain names in `profiles.display_name` | the host clock route, views | Same branch as A3 | Blocks only the host clock route |
| A4 (`20261106050000_live_presence.sql`) | `CrewBroadcaster.send(crew_id, kind, data) -> bool`; `CREW_EVENT_KINDS`; `create_app(..., broadcaster=...)` storing `app.state.broadcaster`; topic `live:crew:<crewId>`, event `crew_event`, payload `{v: 1, kind, data}`; data of at most 1024 bytes; at most 20 events per crew per 10 s per instance; a 2 s HTTP timeout; flag `live_presence` | the nudges (3.9) | Spec and code exist, uncommitted in the a4 worktree | The case service gets `broadcaster=None`: no nudges, and clients poll every 5 s |
| L2 (`20261106070000_home_islet.sql`) | `islet_store.players_with_signal_station(admin, player_ids) -> frozenset[str]`: one read, at most 4 ids, and once true it stays true. `islet_store.read_timber(admin, player_id) -> int | None`: None means the starter timber. `building_catalogue.load_buildings()` and `building.level_one_cost(...)`. `POST /api/islet/build`. | Phase 2: the third light, `me.timber`, the planner | Spec, code and migration exist, uncommitted in the l2 worktree. The migration was still changing at 23:49. | **Hard dependency of the 23 Nov finale.** The default `NoStations` port answers "no station", so production cannot man the third light until L2 is on `main`. |
| S1 (Story v2) | The log card in Act 1, and C2's radio words | content parity | **On `main`** (`3d59b6a`) | Unblocked |
| G6 and G7 | G6's adapter contract; G7's conformance suite (`frontend/src/adapter/conformance/suite.js`, which requires every refusal reason to be in `caseReasons`); G7's fixture harness | section 8 | The contract is on `main`. The suite is committed on `feat/g7-living-world`. The harness is being built. | The adapter runs the suite from day one, with recorded server answers |

---

## 2. Decisions this spec makes, and what waits

Builders build the default. Items marked "pending" get a `# PENDING (...)` comment in the code and "pending" in the decision entry (section 11).

| # | Topic | Built default | Why | Who decides |
|---|---|---|---|---|
| C1 | How a game refusal answers | `200` with `accepted: false`, a `reason`, a `message`, extra numbers and the fresh view. HTTP errors are only for bad, unauthorised, failed or impossible requests. | NPC-PARTNERS section 6 says this for partner orders. One rule for every case intent, and refusals can carry numbers. | Team, Mon 9 (INTERFACES questions 2 and 3) |
| C2 | Repeated `actionUid` | **`200`, rebuilt from the stored outcome, with `repeat: true`.** It is checked before any rule (3.3). | NPC-PARTNERS N8: "the first answer again". The wallet, the Exchange, A2, A6 and L2 answer `409 already_applied` instead, which is safe there because they log only accepted actions. The case also logs a wrong pair, a wrong accusation and a missed lock (C15), so a 409 read as "done" would turn a retried refusal into a success. | Team, Mon 9, with that consequence on the table |
| C3 | Route names | `GET /api/case` (one read for the whole crew view) **replaces the reserved `GET /api/board`**. `POST /api/case/search` replaces the reserved `POST /api/act`. These stay: `POST /api/case/accuse`, `POST /api/board/pin`, `POST /api/finale/signal`, `GET /api/world`, `POST /api/crews/me/orders`. New: `POST /api/board/pair`, `POST /api/finale/nightfall`, `POST /api/finale/post`, `POST /api/host/case/clock`. | One poll instead of two. The case has no free-form actions: a route id is the whole intent. If the team keeps the old name, mount the same handler at `/api/board` too (one line). | Team, Mon 9 (D009) |
| C4 | The case clock | Case time is whole seconds since `crews.started_at`, and the database clock decides every change. No pause in v1. The host clock route moves only the host's own crew forward. | Nothing in the case punishes a break: timers finish, windows repeat, and a night can be called again. | Nils, decided 6 Nov 2026 |
| C5 | Settlement | Every timed result (a find, a partner pin, a post) is stored at acceptance with the second it takes effect. "Settled" means "that second has passed". No background job and no settle write. | Gives the behaviour of NPC-PARTNERS N4 and N5 with no `settled` column | S4 owner |
| C6 | When a partner pin's 50 coins are paid | When the order is accepted | The outcome is fixed then (N5), and nothing is written on `GET` | Nils, decided 6 Nov 2026 |
| C7 | A player running several routes at once | Allowed: there is no player `busy` rule. One find per seat and card. | CASE-FILE 5.3 and the timing program. The G6 fake's player `busy` is not a server rule. | S3 owner |
| C8 | The false light's glow | During its own night a crew receives `glow`: the schooner position rounded to whole chart units. The exact position comes only after the fog parts. **The fact for Nils:** the glow is at most 0.27 degrees from the true bearing for 200 sampled crews (about 0.35 anywhere in the disc), and the tolerance is 5 degrees. So the glow is the answer. Copying another crew's bearing gains nothing, because every crew sees its own glow. A copied bearing still hits on all three lights 44% of the time, so the per-crew seed changes the picture, not the difficulty. | G6 must draw the glow players aim at (CASE-FILE 10.4). The finale tests coordination (three seats, three lights, inside 90 s), not secret coordinates. | Nils or S3 owner (pending) |
| C9 | Solves while the relight lock is on | They never reach the world: no stage change, no Wall names and no extra light, also after the lock opens. Rewards and the reveal happen as normal. | Team test solves must neither relight the coast nor fill the Wall | Nils, decided 6 Nov 2026 |
| C10 | Browser access to case tables | None. RLS is on with no policy and no grant for `anon` or `authenticated`. Only the API reads them. | No early peek at results that are decided at acceptance | Team |
| C11 | Feature flag | New flag `case`, off by default. It gates **every** case route, `GET /api/world` included. | Phases can merge before the game opens, and a flagged route can never read a table whose migration is not applied yet (with the rule in section 0). Before the game opens the world is dark anyway. | Team |
| C12 | Light posts after dawn | Stay open, for players as well as partners | N15, applied to players | L3 owner |
| C13 | Who may lock a light | The player who holds it, or any player of the crew when a partner holds it | CASE-FILE 10.4 | L3 owner |
| C14 | Route button labels | Optional `label` per route in `case.json`. The server falls back to the card title. | Data, not code | S3 owner |
| C15 | Which refusals are remembered | Every request that changed state is logged, including a wrong pair, a wrong accusation and an off-target lock, because each one starts a wait | Keeps the `actionUid` a safe retry, together with C2 | none |
| C16 | Whose names go on the Wall of Lights | **Contributors only** (the players with a share) | CASE-FILE 14.1 says "the first crew's captain names", and 14.2 "each later crew adds its captain names". The data does not settle whether a seated player with no pin, no lock and no accusation counts. | Nils, decided 6 Nov 2026 |
| C17 | When a partner pin counts for credit | From the moment its order is accepted: for "contributor" and for "part of a deduction". Pairing still needs the pin to have landed. | `case.json` `rewards.part_of_a_deduction`: "or ordered a partner's pin of it, before the deduction formed". Matches C6. Credit then depends on rows only, so the payouts can be checked exactly under the lock. | S3 owner |
| C18 | Position and boarding | The server checks neither. Any signed-in player of the crew may search, take a post or accuse once the case rules allow it. Boarding the schooner is presentation only. | D003 and the A4 spec: positions are for showing only. If Nils wants boarding to be a real rule, add a free intent `POST /api/case/board`. | Nils, decided 6 Nov 2026 |
| C19 | The home station | **One level 1 station, built by any player of the crew, readies the home light for the whole crew.** Any player of the crew may man it, and partners never. | `case.json` ("a crew counts one station, whoever built it. Any player of the crew may man it."), CASE-FILE 10.2 and L2 section 6. Owner-only would be a story change. | Settled by the data; a change needs Nils |
| C20 | `RELIGHT_OPEN` | Accepted as `true` only when `APP_ENV` is `production`. Elsewhere the server refuses to start. | Preview and laptops with the real keys write to the same live database, and a relight cannot be undone | Team |

---

## 3. Shared design (all four phases)

### 3.1 Where things live

- **Rules:** in `backend/server/game/` (A3 creates the package): `case_*.py`, `board_*.py`, `finale_*.py`, `world_*.py`, `npc_*.py`. Each file has one job and is listed in its phase.
- **Routes:** thin files in `backend/server/routes/`. The route file header is the contract home. Pydantic models for the case view go in `routes/case_models.py`.
- **`create_app`** gets **one** new keyword-only parameter in Phase 1: `case_service: CaseService | None = None`. Place it after A4's `broadcaster` if A4 is on `main`.
  - The default is `case_or_none(settings, broadcaster=broadcaster)`, computed after the broadcaster default.
  - Without A4 the default is `case_or_none(settings)`, and the nudge slice adds the argument later.
  - Then `app.state.case = case_service`. `CaseDep` answers `503 case_unavailable` when it is `None`.
  - Later phases add keyword arguments to `CaseService.__init__` (with defaults), never to `create_app`.
- **`case_or_none(settings, *, broadcaster=None)`** loads `case.json` (and, from Phase 4, `partners.json`) and runs the load-time checks (4.3). A broken file is logged, and the case routes answer 503. The rest of the API keeps working, the same pattern as `market_or_none`.
- **`CaseService(data, *, clock=utc_now, relight_open=False, limiter=None, broadcaster=None, stations=None, lines=None)`** runs every intent.
  - `broadcaster` is `app.state.broadcaster`, A4's own object, never a second transport.
  - `stations` is the L2 port (5.2).

### 3.2 The case clock (server side)

- `case_second = floor(now - case_state.started_at)` in whole seconds, and `case_minute = case_second // 60`. `case_state.started_at` is copied from `crews.started_at`, which A6 sets with the database clock at the muster.
- Every stored case time is an integer case second: route readiness, pins, posts, locks, waits, nights and partner orders.
- **The database clock decides.** Each write function computes `now` once, after taking the crew lock, with `clock_timestamp()` (`case_begin`). Python passes durations, never times.
- Python's own clock (`utc_now`, a fake in tests) is used only to build views and to pre-check. At a boundary second the database can disagree. It then refuses with its own reason, and the view refreshes.
- **Windows** are open when `from_minute <= (minute % every) < from_minute + open_minutes`.
  - A player's timed route must be open at the start minute.
  - A partner's timed route must be open at the order minute plus 4.
  - The wait in a refusal is the smallest whole `k >= 1` that opens the window (NPC-PARTNERS 5.4).
- **No background job** (Vercel Hobby). A timed result appears when its second has passed, at the next read. Clients refetch when a countdown reaches 0 (3.9).
- **The host clock route, now in the minimum:** `POST /api/host/case/clock {seconds, actionUid}`.
  - It needs `HostDep` (A2).
  - It moves `case_state.started_at` back by 1 to 3,600 seconds for the host's own open crew, so every case second of that crew jumps forward. Each call is logged as kind `clock` and nudges the crew.
  - Other crews cannot be moved, and `world_state` is never touched. With `RELIGHT_OPEN` false, a fast-forwarded solve still answers `world: locked`.
  - Use it for the solo run and the end-to-end checks of section 10.

### 3.3 Idempotency (`actionUid`)

- Every intent body carries `actionUid`: 8 to 64 characters of `A-Z a-z 0-9 _ -`. The browser makes it once per click.
- The table `case_actions` logs every request that changed state (unique `(player_id, action_uid)`), with its `kind`, `target` and `outcome`.
- **Order inside a route:**
  1. Rate limiter.
  2. Repeat lookup (`case_store.action_lookup`). A stored row answers at once, before any rule and also for a finished crew. The answer is `200` with `repeat: true`, rebuilt from the row (see below).
  3. Snapshot.
  4. Pure decision.
  5. SQL write. The SQL checks the uid again under the crew lock. A repeat there returns `{"status":"repeat","crewId","kind","target","outcome"}`, which is answered the same way.
- **Rebuilding a repeat:**
  - `accepted` is true for the outcomes `started`, `pinned`, `formed`, `night`, `climbing`, `locked`, `parted`, `solved`, `fetch`, `man_light` and `moved`.
  - `accepted` is false for `wrong_pair` (reason `wrong_pair`), `wrong_suspect` (reason `accusation_refused`) and `off_target` (reason `off_target`).
  - The `message` is rebuilt from the data for the stored kind and target, as 3.4 says. Extra numbers are left out, and `case` is the fresh view.
- **A 503 on a write means the outcome is unknown.** Resend the same `actionUid`. If the first request went through, the answer is its stored outcome with `repeat: true`. No ledger lookup is needed.
- Wallet refs are separate (3.6). A wallet ref never contains the `actionUid`, except a partner's paid errand (N17, full version).

### 3.4 The answer shape

Every intent answers `200`:

```json
{"accepted": true, "reason": null, "message": "…", "<extra numbers>": 0, "case": { "…the view of 3.8…": 0 }}
{"accepted": false, "reason": "locked_window", "message": "The cave mouth is under water. It opens at low tide, in 4 minutes.", "minutes": 4, "case": {}}
{"accepted": false, "reason": "accusation_refused", "message": "…", "repeat": true, "case": {}}
```

**Where the message comes from.** Use the line in `case.json` or `partners.json` where one exists. Otherwise use `UI_MESSAGES` in `case_service.py`: UI text, not story text, plain English, no dashes.

| Key | Text |
|---|---|
| `started` | "Searching. The card lands in {minutes} case minutes." |
| `pinned` | "Pinned to the board." |
| `solved` | "Accusation accepted. Open the reveal." (`case.json` has no line for an accepted charge) |
| `moved` | "The case clock moved {minutes} minutes forward." |
| `wrong_kit` | "This route needs the {kit} kit." |
| `already_have` | "This card is already in your journal, or your search for it is running." |
| `card_not_held` | "That card is not in your journal yet." |
| `already_pinned` | "You already pinned that card." |
| `already_deduced` | "Your crew already formed that deduction." |
| `night_in_progress` | "The night is already on." |
| `dawn_wait` | "Dawn is breaking. Your crew can call nightfall again in {seconds} seconds." |
| `schooner_found` | "The schooner is already found." |
| `night_required` | "Call nightfall first." |
| `light_not_ready` | "That light is not ready yet." For the station: "Build a signal station on a home islet first." |
| `post_taken` | "Another seat holds that light." |
| `already_on_post` | "You are already at that light." |
| `post_not_owned` | "Another player holds that light." |
| `aim_cooldown` | "Wait {seconds} seconds before you lock this light again." |
| `already_solved` | "Your crew already solved the case." |

Every other message is a data line:
- `lead_locked`: the card's `closed_line`.
- `locked_window`: the window's `closed_line`.
- `not_pinned`, `different_seats_required`, `wrong_pair`: `board.lines`.
- `deduction_required`, `post_not_ready`, `off_target`, `locked`, `parted`, `nightfall`, `on_post`: `night.lines`.
- `schooner_required`, `evidence_required`, `accusation_cooldown`: `accusation.lines`.
- `accusation_refused`: the suspect's `refused_line` plus `accusation.lines.wait`.
- `formed`: the deduction's `finding`.

`case` is read again after an accepted write.

**HTTP errors (standard shape), shared by every case route:**

| Status | Code | When |
|---|---|---|
| 401 | `unauthorized` | No token, or a bad one |
| 403 | `forbidden` | Host route only: the player is not a host (A2) |
| 404 | `feature_off` | The flag `case` is off (every case route, `GET /api/world` included) |
| 404 | `no_crew` | A write by a player who never sat in a crew (`GET` answers `{"case": null}` instead) |
| 404 | `no_such_route`, `no_such_card`, `no_such_suspect`, `no_such_light` | An id that is not in the loaded data. In the minimum, a route of a later kind is `no_such_route`. |
| 409 | `crew_not_started` | The player's open crew is still forming |
| 409 | `crew_finished` | The player has no open crew, and the latest crew is solved. Only reads work. |
| 409 | `crew_busy` | The seats changed during the request (an A6 join or takeover), or an accusation's snapshot moved twice (4.7). Try again. |
| 409 | `not_a_partner` | Orders only: the seat holds a player, or has no row |
| 422 | `validation_error` | Bad shape, an extra field, a bad `actionUid` |
| 422 | `paid_errands_off` | Orders, minimum only: `allowPaid: true` |
| 429 | `too_many_requests` | More than 10 case writes, or more than 30 case reads, in 10 seconds per player (`Retry-After`). In memory, per instance, like `market/limits.py`. |
| 502 | `database_error` | The database refused, or a guard raised (a bug) |
| 503 | `case_unavailable`, `database_not_configured`, `database_unavailable` | Data files broken, database missing, or outcome unknown (3.3) |

- **Which crew a request is about:** the player's open crew (A6 allows one, forming or active). If there is none, the latest finished crew they sat in. If there is none of either, nothing.
  - A write answers `409 crew_not_started` for a forming crew and `409 crew_finished` for a finished one.
  - With no crew at all it answers `404 no_crew`.
- No case route answers `409 already_applied`: a repeat is the `200` of 3.3.
- Every case answer carries `Cache-Control: private, no-store`, except `GET /api/world` (6.5).

### 3.5 Locking: Python decides, the database guards

- Every case write function starts with `case_begin(crew, player, actionUid)`. It does five things:
  1. Locks the `crews` row `for update`. A6's `crew_take_seat` and `crew_start` lock the same row, so a crew's case writes and seat changes happen one at a time.
  2. Checks for a repeat and returns the stored row.
  3. Checks that the crew is active. If not, it answers `crew_not_active` with `crewStatus`.
  4. Reads the caller's seat.
  5. Computes `now`, and returns `revision` (`case_state.revision`) and `crewVersion` (`crews.version`).
- Every write function that changed state ends with `case_finish(...)`, which logs the action and adds 1 to `case_state.revision`.
- **Lock order:**
  - Every case write takes its crew row first.
  - Wallet rows are taken only after the crew row.
  - `world_state` is taken last, and only by `case_accuse` (through the Phase 3 hook).
  - No other function takes `crews` after a wallet or after `world_state`, so there is no cycle.
- **Python decides** what comes from `case.json`:
  - which route, its kit, its window, its timer and its price;
  - which two cards form which deduction;
  - the bearing check, the culprit and the share amounts;
  - whether a light is ready (for the station, through the L2 port).
- **SQL re-checks** what depends on shared state:
  - the repeat, the crew status and the seat;
  - gates already formed, and a card already held;
  - the window at the database minute;
  - pins in effect, and two different seats;
  - cooldowns, the night, open posts and overlapping locks;
  - solved once, the wallet balance and once-per-player refs.
- **SQL computes** who earns a deduction reward, from the pin rows (5.5). `case_accuse` refuses with `state_changed` when its snapshot is stale (4.6).
- A seat change during a request answers `crew_busy`.
- Partner posts and locks are valid only while the seat still holds the same partner (`finale_post_holds`). An A6 takeover therefore ends a partner's duty with no change to A6.
- **Position and boarding (C18).** The server never checks where a player is, for a search, a post or the accusation. Boarding the schooner is presentation only.

### 3.6 Money

- No new wallet reasons. The case uses `clue_reward`, `mystery_reward` and `clue_purchase` (decision 15).

| Coins | Reason | Ref (from `case.json`) | Paid in |
|---|---|---|---|
| First pin of a card, 50 | `clue_reward` | `false_light:card:{card_id}` | `board_pin`, `npc_fetch_pin` (at order acceptance, C6) |
| Part of a deduction, 200 | `mystery_reward` | `false_light:deduction:{deduction_id}` | `board_pair` (who earns it is computed in SQL) |
| Solve share: 400, +100 per deduction part, +100 for a finale role, at most 800 | `mystery_reward` | `false_light:solve` | `case_accuse` |
| Paid player route (full version) | `clue_purchase` | `false_light:{crew_id}:buy:{card_id}` (at most 55 characters) | `case_start_route` |
| Paid partner errand (full version) | `clue_purchase` | `false_light:{crew_id}:npc:{order_uid}` (at most 117) | `npc_fetch_pin` |

- **Once per player:** reward refs carry no crew id. Inside SQL, every reward call is wrapped like this:

  ```sql
  begin
    perform public.apply_wallet_transaction(p_player, p_coins, 'clue_reward', p_ref);
    v_paid := p_coins;
  exception when unique_violation then
    v_paid := 0;  -- paid before, in this crew or another one
  end;
  ```

  The pin, deduction or solve still succeeds, and `v_paid` is stored. A static test checks the wrapping (4.11).
- **Credit (C17):**
  - A pin row counts for its `pinned_by` player from its `ordered_second`. For a player's own pin that is the pin second. For a partner's pin it is the second the order was accepted.
  - **Pins** credited to a player are their pin rows.
  - **Part of a deduction** means a pin row of one of its cards with `ordered_second <= formed_second`.
  - A **finale role** is the accepted accusation, or an aimed lock marked `parted`.
- Partners never earn. A partner pin credits `pinned_by`, the ordering player.

### 3.7 Spoilers and secret content

- `case.json` is read only by `game/case_data.py` (`CONTENT_DIR / "secret" / "case.json"`). It is never on `PUBLIC_CONTENT`, and the existing `test_content.py` tests prove it is never served.
- **Never sent before the solve:** the key `culprit` or its value as the culprit; any reveal, closing, log-reader or last-beat text; epilogue lines (full version).
- **No leak by elimination:**
  - Incomplete deductions carry only `id`, `name` and `complete: false`: no `cards`, `clears`, `opens` or `opensLine`.
  - Every suspect entry has the same keys (`id`, `title`, `cleared`, `clearedBy`). `clearedBy` comes only from formed deductions, never from `cleared_by` in the data.
  - No suspect list carries a `refusedLine`, because the culprit's is null.
  - A wrong accusation's line is sent only in that refusal and in `accusation.lastWrong`.
- **What "holds" means (one definition, in `case_view.py`):** a seat holds a card when it has a `case_finds` row with `ready_second <= now`. These all use `holds(find, now)` and nothing else:
  - card texts, `holders`, `foundLine` and `foundSecond`;
  - the partner `satchel`, `canPin`, partner targets and the leads list.

  A partner's find is inserted at acceptance with a later `ready_second`, so a "row exists" test would leak the card up to 10 minutes early.
- Card texts go only for cards that a seat of the crew holds, and findings only for formed deductions.
- The reveal goes only to players with a `case_solvers` row **for that crew**. A player who solved in another crew sees the case state inside an unsolved crew (CASE-FILE 14.4).
- The four suspect ids are public, because the accusation sends one. CASE-FILE test 14's "the culprit's id" is tested as "nothing marks the culprit".
- A nudge's data is only `{"version": n}`. A4 adds `v` and `kind`.

### 3.8 The view: `GET /api/case`

- Signed in, flag `case`. It answers for the player's open crew if that crew is active. With no open crew, it answers for the latest finished crew they sat in, so the reveal stays reachable. With a forming crew or no crew, it answers `{"case": null}`.
- If `case_state` is missing, or a seat lacks its starting card, it calls `case_open` once and reads again. That is its only write.
- All times are case seconds, and `remaining` counts down. The comments below say which phase adds a key.

**Example.** It is built from this scenario, and `test_the_spec_example_view_is_what_the_rules_build` (4.11) checks it.
- Seat 1 is the viewer, a player with the Informant kit. Seat 2 is the Deckhand, a partner with the Stranger kit. Seat 3 is a True Keeper player. Seat 4 is the Cook, a Witness partner, who holds C2 from minute 0.
- The viewer found C1 at second 180 and pinned it.
- Seat 3 found C3 at 300 and pinned it.
- The viewer ordered the Cook to pin C2 at 600. The pin landed at 900.
- The viewer formed D1 at 960.
- The viewer started `C4.back_room` (kit route, 300 s, always open) at 1937, which is minute 32.
- Now is 2125, minute 35. 35 % 20 = 15, so the ferry window (minutes 10 to 14) is shut for another 15 minutes.

```json
{"case": {
  "caseId": "false_light", "writeRevision": 8, "now": 2125, "minute": 35,
  "crew": {"id": "6fcd…", "status": "active", "mode": "crew", "mySeat": 1, "startedAt": "2026-11-13T10:02:00Z"},
  "seats": [{"seatNo": 1, "holder": "player", "name": "Brave Puffin 17", "kit": "informant", "kitName": "Informant", "isMe": true},
            {"seatNo": 2, "holder": "partner", "name": "the Deckhand", "kit": "stranger", "kitName": "Stranger", "isMe": false},
            {"seatNo": 3, "holder": "player", "name": "Calm Heron 4", "kit": "true_keeper", "kitName": "True Keeper", "isMe": false},
            {"seatNo": 4, "holder": "partner", "name": "the Cook", "kit": "witness", "kitName": "Witness", "isMe": false}],
  "me": {"seatNo": 1, "kit": "informant", "readLog": false, "coins": 1300, "timber": 20},
  "premise": "…", "question": "…",
  "board": {
    "cards": [{"id": "C1", "title": "The reward notice", "text": "REWARD. …", "state": "used",
               "holders": [{"seat": 1, "label": "Brave Puffin 17"}],
               "pinnedBy": [{"seat": 1, "label": "Brave Puffin 17", "byPartner": false}],
               "foundLine": "The notice is nailed to the board outside the Harbor Office. The ink is still fresh.",
               "foundSecond": 180, "routeId": "C1.notice_board", "hotspot": "saltreach_harbor.notice_board",
               "canPin": false},
              {"id": "C2", "title": "Fog nights only", "text": "…", "state": "used",
               "holders": [{"seat": 4, "label": "the Cook"}],
               "pinnedBy": [{"seat": 4, "label": "the Cook", "byPartner": true}],
               "foundLine": "…", "foundSecond": 0, "routeId": "C2.radio_words", "hotspot": "anywhere.journal",
               "canPin": false},
              {"id": "C3", "title": "The seal on your key", "text": "…", "state": "pinned",
               "holders": [{"seat": 3, "label": "Calm Heron 4"}],
               "pinnedBy": [{"seat": 3, "label": "Calm Heron 4", "byPartner": false}],
               "foundLine": "…", "foundSecond": 300, "routeId": "C3.key_tag", "hotspot": "anywhere.satchel",
               "canPin": false}],
    "leads": [{"cardId": "C4", "title": "Sealed crates", "lead": "The smugglers at the cove are moving crates."},
              {"cardId": "C7", "title": "The coastguard night log", "lead": "The coastguard writes down every alarm."}],
    "logLead": null,
    "deductions": [{"id": "D1", "name": "Where", "complete": true, "cards": ["C1", "C2"], "finding": "…",
                    "clears": null, "clearLine": null, "opens": ["nightfall"],
                    "opensLine": "Your crew can now call nightfall and hunt the light."},
                   {"id": "D2", "name": "The seal", "complete": false},
                   {"id": "D3", "name": "The money", "complete": false},
                   {"id": "D4", "name": "The signal", "complete": false}],
    "suspects": [{"id": "fisherman", "title": "the fisherman in the yellow coat", "cleared": false, "clearedBy": null}],
    "canPair": true, "pairWait": 0},
  "search": {
    "spots": [{"hotspot": "saltreach_harbor.ferry_pier", "place": "saltreach_harbor", "routes": [
                 {"id": "C2.ferry_log_timed", "kind": "timed", "cardId": "C2", "title": "Fog nights only", "label": "Fog nights only",
                  "timerSeconds": 180, "price": 0, "kitName": null, "canStart": false, "reason": "locked_window",
                  "statusText": "The ferry is out, and the clerk with it. It comes back in 15 minutes.", "waitMinutes": 15}]},
              {"hotspot": "wreck_point.salvage_yard", "place": "wreck_point",
               "closedLine": "The yard is busy with crates. You do not know what to ask about yet."},
              {"hotspot": "saltreach_harbor.jail", "place": "saltreach_harbor", "line": "The harbor jail's only cell is empty. …"}],
    "jobs": [{"routeId": "C4.back_room", "cardId": "C4", "title": "Sealed crates", "total": 300, "remaining": 112,
              "done": false, "foundLine": null}]},
  "accusation": {"schoonerFound": false, "allowed": false, "cooldown": 0,
                 "status": "There is nobody to accuse yet. Find the light first.",
                 "suspects": [{"id": "fisherman", "title": "the fisherman in the yellow coat", "cleared": false}],
                 "evidence": [], "lastWrong": null},
  "reveal": {"available": false},
  "finale": {"…": "Phase 2, section 5.8"},
  "credits": [{"seat": 1, "name": "Brave Puffin 17", "isMe": true, "pins": 2, "deductionParts": 1, "locks": 0, "accused": false, "share": null, "paid": null},
              {"seat": 3, "name": "Calm Heron 4", "isMe": false, "pins": 1, "deductionParts": 0, "locks": 0, "accused": false, "share": null, "paid": null}],
  "partners": [{"…": "Phase 4, section 7.8"}]
}}
```

The numbers check out:
- `me.coins` is 1300: 1,000 starting coins, 50 for C1, 50 for the ordered C2 pin (C6) and 200 for D1.
- `writeRevision` is 8: it starts at 1, and seven writes followed.
- The viewer's `credits.pins` is 2: C1, plus the ordered C2 pin (C17).

**Rules of the view:**
- **`writeRevision`** is `case_state.revision`. It grows by exactly one on every accepted or state-changing write (`case_finish`), and nothing else changes it. Nudges carry it (3.9). The view has **no** structural `revision`: G6's `revision` is made by the adapter (8.1).
- **Clock keys.** These keys are the only values that change with time alone: `now`, `minute`, `remaining`, `dawnRemaining`, `cooldown`, `pairWait`, `waitMinutes` and `statusText`. A text that embeds a countdown must be a `statusText`.
- **Boundary seconds.** Every boundary second changes something outside the clock keys:
  - a find landing, a pin taking effect, a post going on;
  - a lock ending, a night ending, a dawn ending;
  - a pair wait, an accusation wait or an aim wait ending;
  - a partner arriving, finding or pinning;
  - a window opening or closing for a listed route;
  - a job leaving `jobs` 10 minutes after it landed.

  Two tests prove the rule (4.11).
- **Card `state`:** `new` (held, not pinned), `pinned` (a pin in effect), or `used` (part of a formed deduction). `pinnedBy` lists pins in effect only (`pinned_second <= now`).
- **`foundSecond`, `routeId` and `hotspot`** describe the first find of the card in the crew (G7's log).
- **`leads`** are open cards that no seat holds yet, including a card whose find is still running.
- **`search.spots`** lists only case hotspots that have an active route (in the minimum: kit, open or timed), a `closedLine` (the card is not open yet) or a continuity line.
  - A hotspot whose card is open lists its routes, with the viewer's eligibility.
  - Routes that start in the journal (`C2.radio_words`) are never listed.
  - Decoys are left out. The adapter shows "Nothing to find here."
- **`jobs`** are the viewer seat's finds that are running, or that landed in the last 10 minutes.
- **`reveal`** for a solver is `{"available": true, "solvedSecond", "world", "lines": [{"id","kind","text","cites"}], "credits": [{"seat","name","share","paid"}]}`.
  - `world` is `case_state.world_outcome` (Phase 3 fills it; Phase 1 always answers `unchanged`).
  - The lines follow `reveal.order`: the closing line for the viewer's kit at the solve (`case_solvers.kit`), the log line only when the viewer's profile read the log, then the last beat.
  - `kind` is one of `unmasking`, `twist`, `evidence`, `closing`, `log` or `last`.

### 3.9 Live crew events (A4's broadcaster) and the budget

- **Transport:** `game/case_nudges.py` wraps `app.state.broadcaster`, A4's `CrewBroadcaster`, and never builds a transport of its own. The server never subscribes (INTERFACES 7, rule 3).

  ```python
  NUDGE_KINDS = {"search": "case_changed", "accuse": "case_changed", "clock": "case_changed",
                 "pin": "board_changed", "pair": "board_changed", "nightfall": "board_changed",
                 "post": "board_changed", "signal": "board_changed", "order": "partner_changed"}
  NUDGE_TIMEOUT_SECONDS = 1.0
  ```

  After a write commits, the service calls `await asyncio.wait_for(broadcaster.send(crew_id, NUDGE_KINDS[kind], {"version": write_revision}), NUDGE_TIMEOUT_SECONDS)`.
  - It catches every exception and logs only the error type, with no ids. A nudge is a hint, and the write already happened.
  - Every case kind is in A4's `CREW_EVENT_KINDS` (a test imports the tuple).
  - The action and its outcome are not sent. Put them into `data` later only if a screen needs them, within A4's 1024 bytes.
  - A4 already returns False with the flag `live_presence` off, without Supabase settings, and beyond 20 events per crew per 10 s per instance. A burst over that limit is caught up by the next nudge, the countdown refetch or the poll.
- **Sent on:** every accepted or state-changing write, which is every call that reached `case_finish`. Wrong pairs, wrong accusations and missed locks count.
- **Not sent on:** refusals that changed nothing, repeats, reads, timed landings and world changes. `GET /api/world` is edge-cached and polled.
- **Clients:**
  - On `live_crew_updated` with a `data.version` the client has not seen, the other seats call `GET /api/case`. In practice "not seen" means a version greater than the `writeRevision` of the view they hold. The writer already has the view in its answer.
  - On `crew_changed` (A6), refetch A6's crew and `GET /api/case`.
  - At the earliest `remaining` that reaches 0, refetch once, with 0 to 2 s of jitter and at most once per 5 s.
  - Fallback poll: every 30 s while a case screen is open and the tab is visible. Without A4, or with the flag `live_presence` off, every 5 s.
- **Realtime budget** (free plan: 100 messages a second and 2 million a month, and every delivered copy counts):
  - One nudge costs 1 send plus up to 4 receivers (the crew's players), so at most 5 messages.
  - A crew case has about 60 writes (16 route starts, 12 pins, 6 pairs, 10 partner orders, 2 nightfalls, 4 posts, 6 locks, 2 accusations, plus host clock moves in playtests). That is about 300 messages, so 2 million a month covers about 6,600 crew cases.
  - A class of 30 players is about 8 crews and about 0.07 writes a second in total, so about 0.4 messages a second.
  - The per-player write limit (10 in 10 s) caps a script at 5 messages a second.
- **Function budget** (Vercel Hobby: 1,000,000 calls a month):
  - With nudges, about 160 case calls per player per hour: 120 polls, about 22 nudge refetches and about 20 countdown refetches. A crew of 4 for 2 hours is about 1,300 calls, so about 770 crew cases a month.
  - Without nudges (5-second polls), about 5,800 calls per crew case, so about 170 crew cases a month. Nudges are worth it.
  - `GET /api/world` sends `s-maxage=30` and is called **without an `Authorization` header** (8.1), so most polls should be served by Vercel's edge cache. This is unverified: confirm `x-vercel-cache: HIT` on a preview.

### 3.10 Flag and setting

- **Flag `case`** (recipe 4.5): added to `FLAG_NAMES` (the test first), to INTERFACES section 8 and to the `.env.example` comment. While it is off, every case route answers `404 feature_off`, `GET /api/world` included.
- **Setting `RELIGHT_OPEN`** (`settings.relight_open: bool = False`): read in the style of `read_demo_mode`, plus one new rule.
  - Empty or `false` is off, and `true` is on. Any other word raises `SettingsError`.
  - **`true` is accepted only when `APP_ENV` is `production`.** On `local` or `preview`, `load_settings` raises `SettingsError` ("RELIGHT_OPEN may be true only when APP_ENV is production…"), so that server refuses to start. A preview deployment with the variable set stays down until the variable is removed from the Preview environment.
  - `.env.example`:

    ```
    # [SERVER ONLY] true opens the relight switch: the first accepted accusation after that relights the
    # live coast for everyone (story decision 19), and that cannot be undone. Production only: with
    # APP_ENV local or preview the server refuses to start while this is true, because Preview and
    # laptops with the real keys share the live database. Before you set it, make sure no team test
    # crew is still active. Changing it on Vercel needs a redeploy.
    RELIGHT_OPEN=
    ```

  - `docs/SETUP.md` gets the same rule as one short step: "Opening the relight switch: production only, after the last team test crew has finished."
  - The setting is added in Phase 1, because `case_accuse` passes it from day one. It has an effect from Phase 3.

### 3.11 Migrations

**The reservation list for migration timestamps.** Claude keeps this list next to the decision-number list (section 11). Builders pick only from it.

| Timestamp | File | Package | Where it is now |
|---|---|---|---|
| `20261106000000` | `foundation` | F0 | `main` |
| `20261106010000` | `island_exchange` | L4 | `main` (not applied; being reworked) |
| `20261106020000` | `accounts` | A2 | `feat/a2-a3-signin-referee` |
| `20261106030000` | `entry_profiles` | A3 | `feat/a2-a3-signin-referee` |
| `20261106040000` | `crew_codes` | A6 | `feat/a6-crews` |
| `20261106050000` | `live_presence` | A4 | a4 worktree, uncommitted |
| `20261106060000` | `case_rules` | S3, Phase 1 | this spec |
| `20261106070000` | `home_islet` | L2 | l2 worktree, uncommitted |
| `20261106080000` | `case_board_and_night` | L3, Phase 2 | this spec |
| `20261106090000` | `exchange_leverage` | L4 v2 | reviewed group 3 file |
| `20261106100000` | prediction desk | L5 | reviewed group 3 file |
| `20261106110000` | Lantern Duels | A7 | reviewed group 3 file |
| `20261106120000` | `relighting` | Phase 3 | this spec |
| `20261106130000` | `npc_partners` | S4, Phase 4 | this spec |
| `20261106140000` | `followups` | G10 stream C | `chore/server-followups` |

| Phase file | Adds |
|---|---|
| `20261106060000_case_rules.sql` | `case_state` (with `world_outcome`), `case_finds`, `case_deductions`, `case_accusations`, `case_solvers`, `case_actions`; functions `case_window_open`, `case_begin`, `case_finish`, `case_open`, `case_start_route`, `case_after_solve` (the empty hook, created only when missing), `case_accuse`, `case_clock_forward` |
| `20261106080000_case_board_and_night.sql` | Night columns on `case_state`; `board_pins` (with `ordered_second`), `finale_posts` (append-only, with `ended_second`), `finale_signals`; functions `finale_post_holds`, `finale_leave_post`, `board_pin`, `board_pair`, `finale_nightfall`, `finale_take_post`, `finale_signal` |
| `20261106120000_relighting.sql` | `world_state` (one seeded row), `world_solves`, `wall_of_lights`; `case_after_solve` replaced |
| `20261106130000_npc_partners.sql` | `case_state.orders_count`; `npc_orders`; functions `npc_begin`, `npc_next_order_no`, `npc_fetch_pin`, `npc_man_light` |

- **House style.** Each file uses the foundation style:
  - a header block: WHAT IT DOES, WHO USES IT, WHAT IT NEEDS, SAFE TO RUN TWICE, HOW THE FILE IS ORGANISED;
  - a plain comment above each statement group;
  - `comment on` for every table, column and function.
- **Running twice safely:** use `if not exists`, `create or replace`, and `drop constraint if exists` before `add constraint`.
  - **One exception:** `case_after_solve` in the Phase 1 file is created only when it is missing (4.6), because Phase 3 replaces it. Running Phase 1's file again must not quietly put the empty hook back. The Phase 1 header says so, and scratch check W9 proves it.
- **The case migrations reference no object of A4 or L2.** The station is read through Python (5.2).
- **Grants:**
  - For every new table:
    - Revoke everything from `public`, `anon`, `authenticated` and `service_role`.
    - Revoke everything on every identity sequence.
    - Grant `service_role` exactly what the phase lists. Where only some columns are ever updated, use a column-level update grant.
    - `anon` and `authenticated` get nothing, with RLS on and no policy (C10). No case table ever gets a `delete` grant.
  - For every function: `revoke all on function … from public, anon, authenticated; grant execute … to service_role`. Every function has `set search_path = ''` and is **not** SECURITY DEFINER.
  - The helpers (`case_begin`, `case_finish`, `finale_leave_post`, `finale_post_holds`, `npc_begin`, `npc_next_order_no`) are therefore callable by the server too. A test proves that `case_store.py` calls only the intent functions.
- **`supabase/README.md`:**
  - one matrix row per table and action ("no access" for players, with the reason "server only, read through the API");
  - one row per function;
  - the database checks of each phase as manual test steps C1 and onwards.

### 3.12 The opt-in database tests (`backend/server/tests/case_sql/`)

The database is the guard (D003), so its behaviour gets automated tests, not one manual run.

- **Where and when it runs:**
  - A pytest package `backend/server/tests/case_sql/`.
  - Each module sets `pytestmark = [pytest.mark.pg, pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests")]`.
  - `pytest.importorskip("pgserver")` and `pytest.importorskip("psycopg")` run first, and the marker `pg` is registered in `backend/pyproject.toml` (`[tool.pytest.ini_options] markers`).
  - `uv run pytest -q` therefore skips the package everywhere.
- **The server it uses:**
  - `conftest.py` starts `pgserver.get_server(tmp_path_factory.mktemp("pg"), cleanup_mode="delete")`, outside the repository, and stops it at session end.
  - It asserts that the connection is a local Unix socket: the `host=` of the URI starts with `/`. psycopg talks through libpq, so the network guard of the parent `conftest.py` is not involved.
  - It never reads `.env` or any Supabase setting.
- **Setup:**
  - `stub.sql` holds the M1-backbone section 7 stand-ins (roles, `auth.users`, `auth.uid()`) plus A4's realtime stand-ins (A4 spec, Appendix B), so every migration in the checkout applies.
  - Then every file in `supabase/migrations/` runs in name order, **twice**. A4's and L2's files join automatically once they are on `main`.
- **The checks:**
  - One test per numbered check: C1 to C14 (4.10), N1 to N15 (5.9), W1 to W9 (6.7) and P1 to P10 (7.9).
  - Each runs as `service_role` (and as `authenticated` for the refusals) inside its own transaction, which is rolled back. The two-session race W6 commits on two connections and cleans up after.
  - To move a crew's clock, a test updates `case_state.started_at` as the superuser.
- **Parity with Python:**
  - `test_case_window_open_equals_python_window_open`: for all four windows of `case.json` and every minute from 0 to 119.
  - `test_sql_deduction_rewards_equal_the_python_model`: for the N6 scenario.
- **Run:** `cd backend && CASE_PG_SCRATCH=1 uv run --with pgserver --with "psycopg[binary]" pytest -q server/tests/case_sql`. Every builder runs it before reporting, and Claude runs it again before each batch is applied.

---

## 4. Phase 1: S3, the case rules

### 4.1 Scope

**Minimum (23 Nov):**
- The loader and the load-time checks; linter rules L1 to L8, L10 to L12, L14, L15, L18 and L19 as tests.
- The clock and the windows.
- **Finding cards** by the 12 kit, open and timed routes.
- The gates: D2 opens C5 and C6, and D3 opens C8.
- The pure deduction rule (used by Phase 2).
- The accusation (it needs D2, D3, D4 and the schooner; a wrong suspect waits 60 s), with the snapshot check.
- The solve share.
- The reveal: all of `reveal.order`, the four closing lines, the log line, and `world` for every solver.
- `GET /api/case`, `POST /api/case/search`, `POST /api/case/accuse`.
- **`POST /api/host/case/clock`** (moved into the minimum, 3.2).
- The flag, the fail-closed setting and the empty world hook.
- The nudges for search, accuse and clock, if A4 is on `main` (the nudge slice, 4.12).

**Full:**
- Paid routes (`clue_purchase`, price confirmation, `price_changed`).
- The log-reader route (`entry_profiles.read_log`).
- The share route, **pending the Exchange rework**. D017's positions replace "one unit held in `market_positions`". Ask L4 for one read, "holds a position in company X", in its new design. The data already names the Exchange id `greyfathom-salvage`; keep the mapping in one constant if L4 renames it.
- The world route (it needs the open-world driftline event).
- Epilogue lines, a "Relighter" title in `GET /api/me`, and `GET /api/case?crew=<id>` for older finished crews.

### 4.2 Files

| File | Job |
|---|---|
| `game/case_data.py` | Loads `case.json` into frozen dataclasses (`CaseData`, `Kit`, `Card`, `Route`, `Window`, `Deduction`, `Suspect`, `Light`, `Rewards`). `MINIMUM_ROUTE_KINDS = ("kit", "open", "timed")`. `CASE_PATH`. |
| `game/case_checks.py` | Load-time checks L1 to L8, L14, L15, L18 and L19, raising `CaseDataError` with the rule number and the place |
| `game/case_lint.py` | Test-time rules L10, L11 and L12 (8 profiles; 531 seat fills) as pure functions |
| `game/case_clock.py` | `case_second(started_at, now)`, `minute_of`, `window_open(window, minute)`, `minutes_until_open(window, minute, arrive_after=0)` |
| `game/case_snapshot.py` | Frozen dataclasses of the crew's stored state (`SeatState`, `Find`, `Pin`, `Formed`, `Accusation`, `Solver`, later `Post`, `Signal`, `Order`) and `CaseSnapshot`, which carries `write_revision` and `crew_version` |
| `game/case_routes.py` | Pure: `card_is_open`, `held_cards(seat, now)`, `decide_route(...) -> RouteDecision` in the fixed order of 4.4 |
| `game/case_board.py` | Pure: `deduction_for_pair(data, a, b)`, `two_seats_pinned(pins, a, b, now)`, `deduction_parts(snapshot, player_id)` (C17) |
| `game/case_accusation.py` | Pure: `decide_accusation(...) -> AccuseDecision` |
| `game/case_rewards.py` | Pure: refs, `solve_shares(...) -> list[Payout]`, `deduction_rewarded_players(...)`. The last one is the Python model; SQL decides (5.5). |
| `game/case_reveal.py` | Pure: `reveal_lines(data, kit, read_log)` |
| `game/case_view.py` | Pure: `holds(find, now)`, `CLOCK_KEYS`, and the dict of 3.8 built from the data, the snapshot, the viewer and now |
| `game/case_store.py` | Reads (the snapshot embed with `crews.version`, read logs, coins, `action_lookup`) and the RPC wrappers; reply parsing; `AlreadyApplied` becomes 502 |
| `game/case_limits.py` | `ActionLimiter` (copies the `market/limits.py` pattern, with case wording) |
| `game/case_nudges.py` | `NUDGE_KINDS` and `nudge(...)` around A4's broadcaster (3.9). Lands when A4 is on `main`. |
| `game/case_service.py` | `CaseService`, `case_or_none`, `CaseDep`, `UI_MESSAGES` |
| `routes/case.py`, `routes/case_models.py` | The three case routes and their models |
| `routes/host_case.py` | `POST /api/host/case/clock` (`HostDep`) |
| `supabase/migrations/20261106060000_case_rules.sql` | 4.5 and 4.6 |
| `server/tests/case_fixtures.py` | The scenario of the 3.8 example, shared by the view tests |
| `server/tests/case_sql/` | The opt-in database package (3.12) with checks C1 to C14 |
| Tests | 4.11 |

**Change:**
- `app.py`, `settings.py` (`relight_open`, fail-closed), `flags.py`, `.env.example`, `docs/SETUP.md` (one step), `backend/pyproject.toml` (the `pg` marker);
- `backend/server/__init__.py` (the `game/` lines), `routes/__init__.py`;
- INTERFACES (routes, tables, flag, setting, reasons), supabase/README;
- `backend/content/README.md` (a short paragraph "How the server reads the case"), DECISIONS (section 11).

### 4.3 Content

- Use the real file, and never change ids.
- Optional route `label` (C14): the S3 builder may add short labels to the 12 minimum routes, for example "Wait for the ferry log". Write them in plain English, with no dashes (L19). Run the linter and the timing program after the change.
- `case_or_none` loads the data, runs `case_checks`, and keeps only the routes whose kind is in `MINIMUM_ROUTE_KINDS` in the "active" route list. The full version widens the list. The other routes stay in the data, so ids keep their meaning.

### 4.4 Rules (pure, tested without a server)

**Route for a player** (`decide_route`). Check in this order, and stop at the first failure:
1. The route is in the active list, otherwise 404 `no_such_route`.
2. The card is open: every deduction in `opens_after` is formed. Otherwise `lead_locked`, with the card's `closed_line`.
3. The seat has no find of this card yet, running or landed. Otherwise `already_have`.
4. The kit: a `kit` route needs the seat's kit. Otherwise `wrong_kit`.
5. Full version only, in this order: `needs_profile` (`log_required`), `needs_share` (`share_route_unavailable`), `needs_world` (`world_route_unavailable`).
6. Full version only: a paid route without `paidConfirmed` gives `payment_confirmation_required` with `price`. An `expectedPrice` that differs gives `price_changed` with `price`.
7. The window is open at the start minute. Otherwise `locked_window` with `minutes`, and the message is the window's `closed_line` with `{minutes}` filled in.
8. Full version only: enough coins. Otherwise `no_coins` with `price`.

When the route is accepted, the timer is `timer_minutes * 60`. A timer of 0 lands the card at once, and the message is the route's `found_line`.

**Starting cards:** every seat whose kit has a `starts_in_journal` route (the Witness, `C2.radio_words`) holds that card from minute 0, partners included. `case_open` inserts the find and is safe to repeat.

**The deduction rule** (used by Phase 2): a pair `(a, b)` forms deduction D when D's cards are `{a, b}`, some seat pinned `a`, another seat pinned `b`, and both pins are in effect (`pinned_second <= now`).

**The accusation** (`decide_accusation`), in this order:
1. `already_solved`. This is defensive only: a solved crew is finished, so the request answers `409 crew_finished` before any rule. The SQL keeps the same defensive check.
2. `schooner_required` (`accusation.lines.needs_schooner`).
3. `evidence_required` (`lines.needs_deductions`).
4. `accusation_cooldown` (`lines.wait`, with `seconds`).
5. An unknown suspect is 404 `no_such_suspect`.
6. A wrong suspect gives `accusation_refused`, with that suspect's `refused_line` plus `lines.wait`, and a 60 s wait.
7. The culprit gives solved.

**Rewards** (`solve_shares`), for every player seat of the crew (partners never):
- `pins` is the number of pin rows with `pinned_by` = this player (C17).
- `parts` is the number of formed deductions where one of this player's pin rows of its cards has `ordered_second <= formed_second`.
- `finale_role`: this player made the accepted accusation, or aimed a lock marked `parted`.
- A contributor has `pins` or a `finale_role`.
- `share = min(800, 400 + 100 * parts + 100 * finale_role)`, ordered by seat.
- In Phase 1 the snapshot has no pins or locks yet, so only the accuser gets a share (500). Phase 2 adds those reads.
- Python passes the payouts together with the snapshot's `write_revision` and `crew_version`. SQL refuses with `state_changed` if either has moved (4.6). Credit depends on rows only (C17), so an unmoved snapshot means exact payouts.

**The reveal** (`reveal_lines`) follows `reveal.order`. `closing_line` is the viewer's kit's line, `log_reader_line` appears only when `read_log`, and every line carries its `cites`.

### 4.5 Tables (`20261106060000_case_rules.sql`)

```sql
create table if not exists public.case_state (
  crew_id               uuid primary key references public.crews (id) on delete cascade,
  case_id               text not null,
  started_at            timestamptz not null,
  revision              bigint not null default 1,
  pair_wait_until       integer not null default 0,
  accuse_wait_until     integer not null default 0,
  schooner_found_second integer,
  solved_second         integer,
  solved_by             uuid references public.profiles (id) on delete set null,
  world_outcome         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint case_state_case_id_format check (case_id ~ '^[a-z0-9_]{2,40}$'),
  constraint case_state_revision_positive check (revision >= 1),
  constraint case_state_waits_not_negative check (pair_wait_until >= 0 and accuse_wait_until >= 0),
  constraint case_state_schooner_not_negative check (schooner_found_second is null or schooner_found_second >= 0),
  constraint case_state_solved_needs_schooner check (solved_second is null or schooner_found_second is not null),
  constraint case_state_world_outcome_allowed check (world_outcome is null
    or (solved_second is not null and world_outcome in ('unchanged', 'locked', 'relit', 'added', 'already_recorded')))
);
create or replace trigger case_state_touch_updated_at
  before insert or update on public.case_state
  for each row execute function public.touch_updated_at();

create table if not exists public.case_finds (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  seat_no        smallint not null,
  card_id        text not null,
  route_id       text not null,
  started_second integer not null,
  ready_second   integer not null,
  coins_paid     integer not null default 0,
  started_by     uuid references public.profiles (id) on delete set null,
  by_partner     boolean not null default false,
  order_no       integer,
  created_at     timestamptz not null default now(),
  primary key (crew_id, seat_no, card_id),
  constraint case_finds_seat_no_range check (seat_no between 1 and 4),
  constraint case_finds_card_id_format check (card_id ~ '^C[1-8]$'),
  constraint case_finds_route_matches_card check (split_part(route_id, '.', 1) = card_id),
  constraint case_finds_route_id_format check (route_id ~ '^C[1-8][.][a-z0-9_]{2,40}$'),
  constraint case_finds_times check (started_second >= 0 and ready_second >= started_second),
  constraint case_finds_coins_not_negative check (coins_paid >= 0),
  constraint case_finds_order_no_positive check (order_no is null or order_no >= 1)
);

create table if not exists public.case_deductions (
  crew_id       uuid not null references public.crews (id) on delete cascade,
  deduction_id  text not null,
  formed_second integer not null,
  formed_by     uuid references public.profiles (id) on delete set null,
  formed_seat   smallint not null,
  created_at    timestamptz not null default now(),
  primary key (crew_id, deduction_id),
  constraint case_deductions_id_format check (deduction_id ~ '^D[1-4]$'),
  constraint case_deductions_second_not_negative check (formed_second >= 0),
  constraint case_deductions_seat_range check (formed_seat between 1 and 4)
);

create table if not exists public.case_accusations (
  id          bigint generated always as identity primary key,
  crew_id     uuid not null references public.crews (id) on delete cascade,
  player_id   uuid references public.profiles (id) on delete set null,
  seat_no     smallint not null,
  suspect     text not null,
  correct     boolean not null,
  case_second integer not null,
  created_at  timestamptz not null default now(),
  constraint case_accusations_seat_range check (seat_no between 1 and 4),
  constraint case_accusations_suspect_format check (suspect ~ '^[a-z0-9_]{2,40}$'),
  constraint case_accusations_second_not_negative check (case_second >= 0)
);
create index if not exists case_accusations_crew_idx on public.case_accusations (crew_id, id desc);
-- The database's own guard for "accepted once": one correct accusation per crew.
create unique index if not exists case_accusations_one_correct on public.case_accusations (crew_id) where correct;

create table if not exists public.case_solvers (
  crew_id       uuid not null references public.crews (id) on delete cascade,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  seat_no       smallint not null,
  kit           text not null,
  contributor   boolean not null,
  share         integer not null,
  share_paid    integer not null,
  solved_second integer not null,
  created_at    timestamptz not null default now(),
  primary key (crew_id, player_id),
  constraint case_solvers_seat_range check (seat_no between 1 and 4),
  constraint case_solvers_kit_allowed check (kit in ('true_keeper', 'witness', 'informant', 'stranger')),
  constraint case_solvers_share_range check (share between 0 and 1000000),
  constraint case_solvers_paid_is_all_or_nothing check (share_paid = 0 or share_paid = share),
  constraint case_solvers_share_only_for_contributors check (contributor or share = 0)
);
create index if not exists case_solvers_player_idx on public.case_solvers (player_id);

create table if not exists public.case_actions (
  id          bigint generated always as identity primary key,
  crew_id     uuid not null references public.crews (id) on delete cascade,
  player_id   uuid not null references public.profiles (id) on delete cascade,
  action_uid  text not null,
  kind        text not null,
  target      text,
  outcome     text not null,
  case_second integer not null,
  created_at  timestamptz not null default now(),
  constraint case_actions_action_uid_format check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint case_actions_kind_allowed check (kind in ('search', 'accuse', 'pin', 'pair', 'nightfall', 'post', 'signal', 'order', 'clock')),
  constraint case_actions_outcome_format check (outcome ~ '^[a-z_]{2,40}$'),
  constraint case_actions_second_not_negative check (case_second >= 0)
);
create unique index if not exists case_actions_one_per_uid on public.case_actions (player_id, action_uid);
create index if not exists case_actions_crew_idx on public.case_actions (crew_id, id desc);
```

- Row-level security is on for all six tables, with no policy. Revoke everything from all four roles, and on both sequences.
- `service_role` gets select, insert and update on `case_state`, and select and insert on the other five. All case history is append-only.
- Deleting a player follows the A2 rule: their own records cascade, and shared crew history keeps the row with `set null`.

### 4.6 Functions

`case_window_open`, `case_begin`, `case_finish`:

```sql
create or replace function public.case_window_open(p_minute integer, p_every integer, p_from integer, p_open integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_every > 0 and p_minute >= 0
     and p_from <= (p_minute % p_every) and (p_minute % p_every) < p_from + p_open;
$$;

create or replace function public.case_begin(p_crew_id uuid, p_player_id uuid, p_action_uid text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status     text;
  v_version    integer;
  v_seat       smallint;
  v_started_at timestamptz;
  v_revision   bigint;
  v_done       public.case_actions%rowtype;
begin
  if p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_action_uid';
  end if;
  -- Every case write and every seat change of package A6 takes this lock first.
  select c.status, c.version into v_status, v_version
    from public.crews as c where c.id = p_crew_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_crew');
  end if;
  -- A repeat is answered first, from what was stored, whatever has changed since.
  select * into v_done from public.case_actions as a
   where a.player_id = p_player_id and a.action_uid = p_action_uid;
  if found then
    return jsonb_build_object('status', 'repeat', 'crewId', v_done.crew_id, 'kind', v_done.kind,
                              'target', v_done.target, 'outcome', v_done.outcome);
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_not_active', 'crewStatus', v_status);
  end if;
  select s.seat_no into v_seat from public.crew_seats as s
   where s.crew_id = p_crew_id and s.player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_crew');
  end if;
  select cs.started_at, cs.revision into v_started_at, v_revision
    from public.case_state as cs where cs.crew_id = p_crew_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'case_not_open');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'seatNo', v_seat,
    'now', floor(extract(epoch from (clock_timestamp() - v_started_at)))::integer,
    'revision', v_revision,
    'crewVersion', v_version);
end;
$$;

create or replace function public.case_finish(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_kind text, p_target text, p_outcome text, p_now integer)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  insert into public.case_actions (crew_id, player_id, action_uid, kind, target, outcome, case_second)
  values (p_crew_id, p_player_id, p_action_uid, p_kind, p_target, p_outcome, p_now);
  update public.case_state set revision = revision + 1
   where crew_id = p_crew_id
  returning revision into v_revision;
  return v_revision;
end;
$$;
```

`case_open` creates the state and the starting cards. Python passes `p_start_cards` from `case.json` as `[{"kit": "witness", "card_id": "C2", "route_id": "C2.radio_words"}]`.

```sql
create or replace function public.case_open(p_crew_id uuid, p_case_id text, p_start_cards jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status     text;
  v_started_at timestamptz;
begin
  if p_case_id is null or p_start_cards is null or jsonb_typeof(p_start_cards) <> 'array' then
    raise exception 'bad_case_open';
  end if;
  select c.status, c.started_at into v_status, v_started_at
    from public.crews as c where c.id = p_crew_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_crew');
  end if;
  if v_status <> 'active' or v_started_at is null then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_not_active', 'crewStatus', v_status);
  end if;
  insert into public.case_state (crew_id, case_id, started_at)
  values (p_crew_id, p_case_id, v_started_at)
  on conflict (crew_id) do nothing;
  insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second, by_partner)
  select s.crew_id, s.seat_no, start.card_id, start.route_id, 0, 0, s.npc_id is not null
    from public.crew_seats as s
    join jsonb_to_recordset(p_start_cards) as start(kit text, card_id text, route_id text)
      on start.kit = s.kit
   where s.crew_id = p_crew_id
  on conflict (crew_id, seat_no, card_id) do nothing;
  return jsonb_build_object('status', 'opened');
end;
$$;
```

`case_start_route`: Python passes the route's facts from `case.json`. `p_window` is `{"every":20,"from":12,"open":8}` or null. `p_coins` is 0 in the minimum.

```sql
create or replace function public.case_start_route(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_id text, p_route_id text,
  p_needs_deductions text[], p_window jsonb, p_timer_seconds integer, p_coins integer, p_purchase_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_minute   integer;
  v_revision bigint;
begin
  if p_card_id is null or p_route_id is null or p_needs_deductions is null
     or p_timer_seconds is null or p_timer_seconds < 0 or p_coins is null or p_coins < 0
     or (p_coins > 0 and (p_purchase_ref is null or btrim(p_purchase_ref) = '')) then
    raise exception 'bad_route';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  v_minute := v_now / 60;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'lead_locked');
  end if;
  if exists (select 1 from public.case_finds as f
              where f.crew_id = p_crew_id and f.seat_no = v_seat and f.card_id = p_card_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_have');
  end if;
  if p_window is not null and not public.case_window_open(
       v_minute, (p_window ->> 'every')::integer, (p_window ->> 'from')::integer, (p_window ->> 'open')::integer) then
    return jsonb_build_object('status', 'refused', 'reason', 'locked_window', 'minute', v_minute);
  end if;
  if p_coins > 0 then
    perform public.apply_wallet_transaction(p_player_id, -p_coins, 'clue_purchase', p_purchase_ref);
  end if;
  insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second,
                                 coins_paid, started_by)
  values (p_crew_id, v_seat, p_card_id, p_route_id, v_now, v_now + p_timer_seconds, p_coins, p_player_id);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'search', p_route_id, 'started', v_now);
  return jsonb_build_object('status', 'done', 'now', v_now, 'readySecond', v_now + p_timer_seconds,
                            'revision', v_revision);
end;
$$;
```

`insufficient_funds` from the wallet (full version) reaches Python as `InsufficientFunds`. The store turns it into the refusal `no_coins`; nothing was written.

`case_after_solve` is the hook. Phase 3 replaces it, and its signature never changes. **This file creates it only when it is missing**, so running the file again keeps Phase 3's version. Its comment is set in the same block, so a second run does not overwrite Phase 3's comment either.

```sql
do $do$
begin
  if to_regprocedure('public.case_after_solve(uuid, boolean, uuid[])') is null then
    execute $create$
      create function public.case_after_solve(p_crew_id uuid, p_relight_open boolean, p_contributors uuid[])
      returns jsonb
      language plpgsql
      set search_path = ''
      as $body$
      begin
        -- Phase 3 (20261106120000_relighting.sql) replaces this function. Until then a solve
        -- changes nothing outside the crew.
        return jsonb_build_object('world', 'unchanged');
      end;
      $body$
    $create$;
    execute $comment$
      comment on function public.case_after_solve(uuid, boolean, uuid[]) is
        'The world hook of a solve. This first version changes nothing and answers {world: unchanged}. 20261106120000_relighting.sql replaces it, and this file never puts it back.'
    $comment$;
  end if;
end;
$do$;
revoke all on function public.case_after_solve(uuid, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.case_after_solve(uuid, boolean, uuid[]) to service_role;
```

`case_accuse`: Python passes these, all from `case.json` except the snapshot fields and the setting:
- the culprit, the needed deductions and the wait;
- the share numbers and the ref;
- the payouts it computed (`[{"player_id": "…", "share": 700}]`, at most 4, each player once);
- the snapshot's `write_revision` and `crew_version`;
- `settings.relight_open`.

```sql
create or replace function public.case_accuse(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_suspect text, p_culprit text,
  p_needs_deductions text[], p_wrong_wait_seconds integer, p_share_base integer, p_share_max integer,
  p_share_ref text, p_payouts jsonb, p_expected_revision bigint, p_expected_crew_version integer,
  p_relight_open boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin        jsonb;
  v_seat         smallint;
  v_now          integer;
  v_state        public.case_state%rowtype;
  v_revision     bigint;
  v_payout       record;
  v_paid         integer;
  v_paid_list    jsonb := '[]'::jsonb;
  v_contributors uuid[] := '{}';
  v_world        jsonb;
begin
  if p_suspect is null or p_culprit is null or p_needs_deductions is null
     or p_wrong_wait_seconds is null or p_wrong_wait_seconds < 1
     or p_share_base is null or p_share_max is null or p_share_base < 1 or p_share_max < p_share_base
     or p_share_ref is null or btrim(p_share_ref) = ''
     or p_expected_revision is null or p_expected_crew_version is null
     or p_payouts is null or jsonb_typeof(p_payouts) <> 'array' or jsonb_array_length(p_payouts) > 4 then
    raise exception 'bad_accusation';
  end if;
  if (select count(distinct x.player_id) from jsonb_to_recordset(p_payouts) as x(player_id uuid))
     <> jsonb_array_length(p_payouts) then
    raise exception 'bad_payout';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  -- Defensive only: a solved crew is finished, so case_begin has refused already.
  if v_state.solved_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'already_solved');
  end if;
  if v_state.schooner_found_second is null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_required');
  end if;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'evidence_required');
  end if;
  if v_now < v_state.accuse_wait_until then
    return jsonb_build_object('status', 'refused', 'reason', 'accusation_cooldown',
                              'seconds', v_state.accuse_wait_until - v_now);
  end if;
  if p_suspect <> p_culprit then
    insert into public.case_accusations (crew_id, player_id, seat_no, suspect, correct, case_second)
    values (p_crew_id, p_player_id, v_seat, p_suspect, false, v_now);
    update public.case_state set accuse_wait_until = v_now + p_wrong_wait_seconds
     where crew_id = p_crew_id;
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'accuse', p_suspect,
                                     'wrong_suspect', v_now);
    return jsonb_build_object('status', 'wrong', 'seconds', p_wrong_wait_seconds, 'revision', v_revision);
  end if;
  -- The payouts were worked out from a snapshot read before this lock. If anything was written
  -- since, nothing changes here: Python reads the snapshot again and retries once.
  if (v_begin ->> 'revision')::bigint <> p_expected_revision
     or (v_begin ->> 'crewVersion')::integer <> p_expected_crew_version then
    return jsonb_build_object('status', 'refused', 'reason', 'state_changed');
  end if;
  insert into public.case_accusations (crew_id, player_id, seat_no, suspect, correct, case_second)
  values (p_crew_id, p_player_id, v_seat, p_suspect, true, v_now);
  update public.case_state set solved_second = v_now, solved_by = p_player_id
   where crew_id = p_crew_id;
  for v_payout in
    select x.player_id, x.share from jsonb_to_recordset(p_payouts) as x(player_id uuid, share integer)
  loop
    if v_payout.share is null or v_payout.share < p_share_base or v_payout.share > p_share_max
       or not exists (select 1 from public.crew_seats as s
                       where s.crew_id = p_crew_id and s.player_id = v_payout.player_id) then
      raise exception 'bad_payout';
    end if;
    begin
      perform public.apply_wallet_transaction(v_payout.player_id, v_payout.share, 'mystery_reward', p_share_ref);
      v_paid := v_payout.share;
    exception when unique_violation then
      v_paid := 0;  -- solved before, in another crew: the share is paid once per player
    end;
    insert into public.case_solvers (crew_id, player_id, seat_no, kit, contributor, share, share_paid, solved_second)
    select p_crew_id, s.player_id, s.seat_no, s.kit, true, v_payout.share, v_paid, v_now
      from public.crew_seats as s
     where s.crew_id = p_crew_id and s.player_id = v_payout.player_id;
    v_contributors := array_append(v_contributors, v_payout.player_id);
    v_paid_list := v_paid_list || jsonb_build_object('playerId', v_payout.player_id,
                                                     'share', v_payout.share, 'paid', v_paid);
  end loop;
  -- Every other player seat saw the solve too: it may read the reveal, and earns nothing.
  insert into public.case_solvers (crew_id, player_id, seat_no, kit, contributor, share, share_paid, solved_second)
  select p_crew_id, s.player_id, s.seat_no, s.kit, false, 0, 0, v_now
    from public.crew_seats as s
   where s.crew_id = p_crew_id and s.player_id is not null
  on conflict (crew_id, player_id) do nothing;
  update public.crews set status = 'finished', version = version + 1 where id = p_crew_id;
  v_world := public.case_after_solve(p_crew_id, p_relight_open, v_contributors);
  -- Every solver's reveal shows what this solve did to the world (the row is locked already).
  update public.case_state set world_outcome = v_world ->> 'world' where crew_id = p_crew_id;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'accuse', p_suspect, 'solved', v_now);
  return jsonb_build_object('status', 'solved', 'payouts', v_paid_list, 'world', v_world,
                            'revision', v_revision);
end;
$$;
```

`case_clock_forward` backs the host clock route. The host check is in Python (`HostDep`); the SQL only sees a seated player of an active crew.

```sql
create or replace function public.case_clock_forward(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_revision bigint;
begin
  if p_seconds is null or p_seconds < 1 or p_seconds > 3600 then
    raise exception 'bad_clock';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  -- Moving the start back moves every case second of this crew forward. Nothing else changes.
  update public.case_state
     set started_at = started_at - make_interval(secs => p_seconds)
   where crew_id = p_crew_id;
  v_now := (v_begin ->> 'now')::integer + p_seconds;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'clock', null, 'moved', v_now);
  return jsonb_build_object('status', 'done', 'now', v_now, 'revision', v_revision);
end;
$$;
```

Grant signatures:
- `case_window_open(integer, integer, integer, integer)`
- `case_begin(uuid, uuid, text)`
- `case_finish(uuid, uuid, text, text, text, text, integer)`
- `case_open(uuid, text, jsonb)`
- `case_start_route(uuid, uuid, text, text, text, text[], jsonb, integer, integer, text)`
- `case_after_solve(uuid, boolean, uuid[])` (granted after the `do` block, see above)
- `case_accuse(uuid, uuid, text, text, text, text[], integer, integer, integer, text, jsonb, bigint, integer, boolean)`
- `case_clock_forward(uuid, uuid, text, integer)`

### 4.7 Store reply mapping

| SQL answer | Python |
|---|---|
| `{"status":"repeat", ...}` | `200`, rebuilt from `kind`, `target` and `outcome`, with `repeat: true` (3.3) |
| `refused/no_crew` | 404 `no_crew` |
| `refused/crew_not_active` with `crewStatus` `forming` | 409 `crew_not_started` |
| `refused/crew_not_active` with `crewStatus` `finished` | 409 `crew_finished`. This includes the loser of two correct accusations sent at the same moment. |
| `refused/not_in_crew`, `refused/seat_changed` | 409 `crew_busy` |
| `refused/state_changed` (accuse only) | Read the snapshot again and send the same intent once more with the same `actionUid` (the refused call wrote nothing). A second `state_changed` gives 409 `crew_busy`. |
| `refused/case_not_open` | Call `case_open` once and retry the same intent once, then 502 |
| `refused/<game reason>` | 200 `accepted: false`, with the message and the numbers. For `locked_window`, `minutes` comes from `minutes_until_open(window, minute)` using the returned minute. |
| A raised `bad_*` or `world_state_missing` | 502 (a bug) |

### 4.8 Routes

**`GET /api/case`**: section 3.8.

**`POST /api/case/search`**

```
{"routeId": "C4.back_room", "paidConfirmed": false, "expectedPrice": null, "actionUid": "s8x2k9m4"}
200 {"accepted": true, "reason": null, "message": "Searching. The card lands in 5 case minutes.", "readyIn": 300, "coinsSpent": 0, "case": {…}}

{"routeId": "C1.notice_board", "actionUid": "s9y3l0n5"}
200 {"accepted": true, "reason": null, "message": "The notice is nailed to the board outside the Harbor Office. The ink is still fresh.", "readyIn": 0, "coinsSpent": 0, "case": {…}}

{"routeId": "C4.low_tide_cave", "actionUid": "t1z4m2p6"}   (at minute 8: 8 % 20 is before low tide at 12)
200 {"accepted": false, "reason": "locked_window", "message": "The cave mouth is under water. It opens at low tide, in 4 minutes.", "minutes": 4, "case": {…}}
```

- `routeId` matches `^C[1-8][.][a-z0-9_]{2,40}$`. `paidConfirmed` is a bool (default false). `expectedPrice` is an int of 0 or more, or null. Extra fields are refused.
- Game reasons: `lead_locked`, `already_have`, `wrong_kit`, `locked_window`. The full version adds `log_required`, `share_route_unavailable`, `world_route_unavailable`, `payment_confirmation_required`, `price_changed` and `no_coins`.

**`POST /api/case/accuse`**

```
{"suspect": "salvage_foreman", "actionUid": "a1b2c3d4"}
200 {"accepted": false, "reason": "accusation_refused", "message": "Refused. D3: … Your crew can accuse again in one minute.", "seconds": 60, "case": {…}}

{"suspect": "salvage_foreman", "actionUid": "a1b2c3d4"}   (the same request again)
200 {"accepted": false, "reason": "accusation_refused", "message": "Refused. D3: … Your crew can accuse again in one minute.", "repeat": true, "case": {…}}

{"suspect": "<the culprit>", "actionUid": "e5f6g7h8"}
200 {"accepted": true, "reason": null, "message": "Accusation accepted. Open the reveal.", "solved": true, "world": "unchanged", "coinsPaid": 700, "case": {… "reveal": {"available": true, "world": "unchanged", …}}}
```

- `suspect` matches `^[a-z0-9_]{2,40}$`. An unknown suspect is 404 `no_such_suspect`.
- Game reasons: `already_solved` (defensive), `schooner_required`, `evidence_required`, `accusation_cooldown`, `accusation_refused`.
- `world` is one of `unchanged` (Phase 1), `locked`, `relit`, `added` or `already_recorded`. Every solver also gets it as `reveal.world`.
- Only a signed-in player of the crew can accuse (`PlayerDep` plus the seat check).

**`POST /api/host/case/clock`**

```
{"seconds": 600, "actionUid": "h0st0001"}
200 {"accepted": true, "reason": null, "message": "The case clock moved 10 minutes forward.", "now": 2725, "case": {…}}
```

- `HostDep` (A2): a non-host gets 403 `forbidden`. It acts on the host's own open crew. With no crew it answers 404 `no_crew`; for a forming crew, 409 `crew_not_started`.
- `seconds` is a StrictInt from 1 to 3,600. Extra fields are refused. It counts as a case write for the rate limiter.

### 4.9 Live events

`search`, `accuse` and `clock` send `case_changed` (3.9). They are wired by the nudge slice once A4 is on `main`. Until then the service has `broadcaster=None` and sends nothing.

### 4.10 Database checks C1 to C14 (in `case_sql/`, 3.12)

1. The migration applies twice, after every earlier file in the checkout.
2. `case_open` creates one `case_state` and gives C2 to every Witness seat, player and partner. Run twice: no duplicate.
3. A forming crew is refused with `crew_not_active` and `crewStatus` `forming`. A finished crew is refused with `crewStatus` `finished`.
4. `case_start_route` with timer 300 stores ready = now + 300, and `case_state.revision` grows by exactly 1.
5. The same `actionUid` gives `repeat` with the stored `kind`, `target` and `outcome`, also after the crew finished.
6. C5 with `{D2}` needed is refused `lead_locked`. After inserting D2 it starts.
7. A second start of the same card by the same seat gives `already_have`.
8. Windows: at the last closed minute (minute 11 for low tide) the answer is `locked_window`; at minute 12 the route starts. Move `started_at` back to test.
9. `case_accuse` before the schooner gives `schooner_required`. With the schooner set and D2 missing, `evidence_required`.
10. A wrong suspect sets the wait. A second accusation 59 s later is refused, and one 60 s later is accepted.
11. The culprit:
    - one correct row, and 400 to 800 coins with the ref `false_light:solve`;
    - every player seat gets a `case_solvers` row, and the crew is `finished`;
    - `world_outcome` is `unchanged`;
    - the same player solving in a second crew gets `share_paid` 0 and still solves.
12. As `authenticated`: no select on any case table, and no execute on any case function.
13. `case_accuse` with a stale `p_expected_revision`, or a stale `p_expected_crew_version`, gives `state_changed` and writes nothing: no accusation row, no wallet row and no action row.
14. `case_clock_forward` moves `started_at` back by the given seconds, logs kind `clock`, and adds 1 to `revision`. It refuses a forming crew.

### 4.11 Tests (write first)

| File | Tests |
|---|---|
| `test_case_data.py` | `test_the_real_case_file_loads_into_frozen_data`; `test_the_minimum_has_12_routes_4_kit_4_open_4_timed`; `test_load_time_checks_pass_on_the_real_file`; `test_a_broken_case_file_makes_the_case_unavailable_and_the_api_keeps_working` (503 `case_unavailable`, `/api/health` 200) |
| `test_case_lint.py` | One test per rule L1 to L8, L10 to L12, L14, L15, L18 and L19 on the real file, **and one mutation each that the rule must catch**: duplicate route id (L2), unknown hotspot (L3), two cards at one hotspot (L4), a third card in a deduction (L5), two kit cards for one kit (L6), a kit route slower than the timed route (L7), a `players_only` partner kind (L8), a kit with no free route to a card (L10), a reveal line with no cites (L11), a seat fill that cannot form D3 (L12), C5 gated by its own D3 (L14), the culprit id in a lead (L15), a ref of 121 characters (L18), an em dash (L19) |
| `test_case_parity.py` | Kits equal `entry_kits.json` (ids, coins, start places); kit ids equal `crews.seats.KITS`; `partners.kit_order` equals `NPC_KIT_ORDER`; every reward reason is in `WALLET_REASONS`; every ref fits 120 characters with the longest ids |
| `test_case_registry.py` | `test_case_ids_and_light_positions_match_the_place_registry`: runs Node on `frontend/src/world/places/registry.js`, as the parity test does. Only the virtual place `anywhere` (with `journal` and `satchel`) is exempt (CASE-FILE 17). Each light's `chart_xy` equals the chart position plus half the beam origin, y flipped, within 0.01. Skipped with a reason only when Node or `frontend/node_modules` is missing. The registry imports fine in Node without a browser. |
| `test_case_clock.py` | `test_case_second_counts_whole_seconds_since_the_muster`; `test_window_routes_open_only_inside_their_window` (all four windows: last closed minute refused, first open accepted, last open accepted, the next minute refused); `test_minutes_until_open_is_the_smallest_wait` |
| `test_case_routes.py` | `test_kit_route_is_the_fastest_free_route`; **`test_gated_cards_wait_for_their_deduction`** (C5 and C6 before D2, C8 before D3; Phase 2 adds nightfall before D1); `test_a_kit_route_needs_its_kit`; `test_a_seat_cannot_start_a_card_it_already_has`; `test_route_refusals_follow_the_fixed_order` (parametrised); `test_a_timer_of_zero_lands_the_card_at_once`; `test_a_witness_seat_holds_c2_from_minute_zero_partners_too`; `test_routes_of_later_kinds_are_not_offered_in_the_minimum` |
| `test_case_accusation.py` | `test_wrong_accusation_only_costs_a_minute` (refused with that suspect's line, nothing else changes, 59 s refused, 60 s accepted); `test_accusation_needs_d2_d3_d4_and_the_schooner`; `test_accusation_checks_run_in_the_fixed_order`; `test_the_right_suspect_is_accepted_once` |
| `test_case_rewards.py` | `test_solve_share_is_400_plus_100_per_part_plus_100_finale_capped_at_800`; `test_partners_never_earn_and_a_partner_pin_counts_for_the_ordering_player` (from its order, C17); `test_a_pin_after_the_deduction_formed_is_not_a_part`; `test_a_seat_with_no_pin_no_lock_and_no_accusation_is_not_a_contributor`; `test_every_ref_starts_with_the_case_id_and_fits_120_characters`; **`test_rewards_are_paid_once_per_player`**. In Phase 1 this test covers the solve: the refs carry no crew id, and a solve whose database answer says `paid: 0` in a second crew is still accepted and reported as paying 0. Phase 2 adds the pin and the deduction, and the database half runs as C11, N3 and N6. |
| `test_case_reveal.py` | `test_reveal_order_and_closing_line_follow_the_viewer_kit`; `test_the_log_line_only_for_players_who_read_the_log`; `test_every_reveal_line_cites_cards`; `test_every_solver_sees_the_world_outcome` (`reveal.world` from `case_state.world_outcome`) |
| `test_case_spoilers.py` | `test_culprit_is_never_sent_before_the_solve` (every answer of every case route for an unsolved crew is scanned for every reveal, closing, log and last-beat text and for the key `culprit`); `test_no_view_lets_a_client_find_the_culprit_by_elimination` (incomplete deductions have exactly `id`, `name`, `complete`; all suspect entries have identical keys; no `refusedLine` in any list); `test_a_crew_gets_only_what_it_has_earned` (no text of an unheld card, no finding of an unformed deduction); `test_a_card_text_is_not_sent_one_second_before_it_lands` (at `ready_second - 1` there is no text, `foundLine` or holder; at `ready_second` all three appear; Phase 4 adds a partner fetch); `test_a_solver_of_another_crew_sees_no_reveal_in_an_unsolved_crew` |
| `test_case_view.py` | `test_the_spec_example_view_is_what_the_rules_build` (the 3.8 scenario from `case_fixtures.py`: the ferry route `locked_window` with `waitMinutes` 15, the job with 112 of 300 left, `me.coins` 1300, `writeRevision` 8, `credits`); `test_time_alone_changes_only_the_clock_keys` (for every second of a scripted history with no boundary in between, the view without `CLOCK_KEYS` is equal); **`test_revision_never_decreases_and_changes_on_every_write_and_every_landing`** (`writeRevision` grows by one per write; at every boundary second of 3.8 the view without `CLOCK_KEYS` changes; Phase 2 adds a post move from the Harbor Light to the Keeper's lamp, a lock expiry, a night end and a dawn end; Phase 4 adds a partner arrival and a fetch that ends a partner's duty) |
| `test_case_routes_api.py` | Flag off gives 404 `feature_off`; no token gives 401; `GET` with no crew gives `{"case": null}`; a forming crew gives 409 `crew_not_started` on writes; a finished crew gives 409 `crew_finished`; `test_the_same_action_uid_twice_acts_once` (the second answer is 200 with `repeat: true` and the stored outcome, and exactly one write RPC runs); **`test_a_repeat_of_a_wrong_accusation_is_still_a_refusal`**; `test_a_repeat_is_answered_before_any_rule`; `test_a_refusal_calls_no_write_function`; `test_an_unknown_route_is_404`; `test_extra_fields_are_refused`; `test_case_open_is_called_once_when_the_state_is_missing`; `test_a_unique_violation_from_the_database_becomes_502`; `test_answers_are_never_cached`; `test_a_finished_crew_still_reads_its_reveal`; `test_more_than_10_writes_in_10_seconds_is_429`; `test_a_stale_accusation_snapshot_is_read_again_and_retried_once` (then accepted; twice stale gives 409 `crew_busy`); `test_crew_not_active_is_answered_by_crew_status`; `test_the_host_clock_moves_only_the_hosts_own_crew` (403 for a non-host, 404 without a crew, and the accepted answer's `now` moves forward) |
| `test_case_matches_migration.py` | The static checks listed after this table |
| `test_case_settings_and_flag.py` | `RELIGHT_OPEN` is false by default, true only for `true`, and refuses other words; **`test_relight_open_is_refused_outside_production`** (`true` with `APP_ENV` `local` or `preview` raises `SettingsError`; with `production` it is true); `case` is in `FLAG_NAMES` and off by default |
| `test_case_solvability.py` (card part) | `test_every_four_player_mix_finds_all_eight_cards_on_free_routes` (35 mixes, no coins, each deduction's cards from two different seats, using the pure rules through the planner of section 9) |
| `case_sql/` (opt-in) | C1 to C14; `test_case_window_open_equals_python_window_open` |

The static checks in `test_case_matches_migration.py`:
1. The RPC argument names in `case_store.py` equal the SQL parameters.
2. Every case table has RLS on and no grant to `anon` or `authenticated`, and no case table has a `delete` grant.
3. Every case function is revoked from `public`, `anon` and `authenticated`, granted to `service_role`, has `set search_path = ''` and is not SECURITY DEFINER.
4. No migration adds a wallet reason.
5. `case_store.py` calls only intent functions, never `case_begin`, `case_finish`, `finale_leave_post`, `finale_post_holds`, `npc_begin` or `npc_next_order_no`.
6. In every intent function, `case_begin(` or `npc_begin(` comes before the first `insert into`, `update public.` or `apply_wallet_transaction(`.
7. `v_revision` is assigned only from `public.case_finish(`, and every return whose status is neither `refused` nor `repeat` carries `'revision', v_revision`.
8. Every `apply_wallet_transaction` with the reason `clue_reward` or `mystery_reward` sits in a block that ends in `exception when unique_violation`.
9. `case_after_solve` in `20261106060000` is created only inside the `to_regprocedure` guard.
10. The case files carry the reserved timestamps of 3.11.

### 4.12 Order of work (each slice is one small pull request)

1. Data, checks and linter tests.
2. Clock, routes, accusation, rewards, reveal and the view builder: pure, with tests, including `test_case_view.py`.
3. The migration and the `case_sql/` package with C1 to C14.
4. Store, service, routes, the host clock route, the flag and the setting, with the route tests.
5. The nudge slice (`case_nudges.py` plus the `create_app` argument), as soon as A4 is on `main`, in whichever phase is open then.
6. Docs: INTERFACES, supabase/README, SETUP, the decision entry.

---

## 5. Phase 2: L3, the board and the Night of Three Lights

### 5.1 Scope

**Minimum:**
- Board pins with seat credit.
- Pairing (two different seats; a wrong pair waits 30 s).
- First-card and deduction rewards, with the deduction reward computed in SQL.
- `credits` (on the cut list, section 10).
- Nightfall, called by a player after D1.
- The 20-minute night and the 3-minute dawn wait.
- Posts at the Keeper's lamp, the Harbor Light and the home signal station (C19, through the L2 port).
- Bearings within 5 degrees.
- 90-second locks that must overlap, from three seats at three lights.
- The schooner, the glow and the parted target.
- Nudges through A4's broadcaster.

**Full:**
- The ruin light: a lens made at a level 1 workshop on `plot_2` (3 minutes, possible before D3), fitted in 2 minutes after D3, and manned by players only.
- Board polish.

### 5.2 Files

| File | Job |
|---|---|
| `game/board_rules.py` | `decide_pin` and `decide_pair` (using `case_board.py`), with reasons in the fixed order |
| `game/finale_geometry.py` | `bearing_to`, `angular_distance`, `on_target(sent, true, tolerance)`, `schooner_position(crew_id, chart)`, `glow_position` |
| `game/finale_rules.py` | `night_phase(snapshot, now)`, `decide_nightfall`, `decide_post`, `decide_signal`, `parting_locks` |
| `game/finale_view.py` | The `finale` part and the `credits` part of the view |
| `game/station_lookup.py` | The port, `NoStations`, and `IsletStations` (described below) |
| `routes/board.py`, `routes/finale.py` | The five routes |
| `supabase/migrations/20261106080000_case_board_and_night.sql` | 5.4 and 5.5 |

`game/station_lookup.py` in detail:
- The port is `StationLookup`, with `players_with_signal_station(admin, player_ids) -> frozenset[str]` and `timber(admin, player_id) -> int | None`.
- `NoStations` is the default: an empty set and `None`.
- `IsletStations` arrives when L2 is on `main`. It wraps L2's `islet_store.players_with_signal_station` and `islet_store.read_timber`, and maps `read_timber`'s `None` (no islet row yet) to `catalogue.starter_timber` from `load_buildings()`.

**Change:**
- `case_snapshot.py` and `case_store.py`: embed `board_pins`, the open `finale_posts` (`ended_second=is.null`) and `finale_signals` (`.order=id.desc&.limit=40`).
- `case_view.py`: pins, the state `used`, and credits.
- `case_service.py`, INTERFACES, supabase/README.

### 5.3 Rules (pure)

**Pin** (`decide_pin`):
1. The seat holds the card (`ready_second <= now`), otherwise `card_not_held`.
2. The seat has not pinned it, otherwise `already_pinned`.

When accepted, the pin takes effect at once and pays 50 once per player.

**Pair** (`decide_pair`). The order matches the G6 fake, so a single seat learns nothing:
1. `pair_cooldown`, with `seconds`.
2. Both cards pinned, otherwise `not_pinned` (`board.lines.not_pinned`).
3. Two different seats, otherwise `different_seats_required` (`board.lines.same_seat`).
4. The cards form a deduction, otherwise `wrong_pair` (`lines.wrong_pair` plus `lines.wait`) and a 30 s crew wait.
5. Not formed yet, otherwise `already_deduced`.

When the deduction forms, SQL pays 200 to every player who is part of it (3.6, C17). `deduction_rewarded_players` is the Python model, used by the view and the planner.

**Geometry:**
- `bearing = degrees(atan2(dx, dy)) % 360`, with `dx = sx - lx` and `dy = ly - sy` (chart y grows to the south).
- The sent bearing is normalised to `round(b, 1) % 360` before it is checked or stored.
- On target means `angular_distance <= 5`, where `angular_distance = min(d, 360 - d)` and `d = abs(a - b) % 360`.
- The schooner:

  ```python
  digest = sha256(f"false_light:schooner:{crew_id}".encode()).digest()
  angle = int.from_bytes(digest[0:4], "big") / 2**32 * 360
  r = 20 * sqrt(int.from_bytes(digest[4:8], "big") / 2**32)
  x = 250 + r * sin(radians(angle))
  y = 40 - r * cos(radians(angle))
  ```

  The position is rounded to 0.01. The fog centre and the 20-unit offset come from `case.json`. The seed varies the picture per crew. It does not hide the answer (C8).
- The glow is the same point rounded to whole units, sent only while `phase == "night"`.

**Night:**
- Phases:
  - `waiting`: no night yet;
  - `night`: `now < night_started + 1200` and no schooner;
  - `dawn`: within 180 s after a failed night;
  - `waiting` again after that;
  - `success`: once the schooner is found.
- Nightfall reasons: `schooner_found`, `deduction_required` (`night.lines.not_yet`), `night_in_progress`, `dawn_wait` (with `seconds`).

**Post** (`decide_post`, players only):
- Order of checks: `night_required`, unknown light (404), `light_not_ready`, `already_on_post`, `post_taken`.
- **`islet_signal_station` is ready when at least one player seated in the crew owns a level 1 station** (`players_with_signal_station(crew player ids)` is not empty, C19). Any player of the crew may take that post. The public lights are always ready.
- The climb is 60 s. Taking a new post ends the seat's old post, and its lock ends.

**Signal** (`decide_signal`):
- Order of checks: `schooner_found`, `night_required`, `post_not_ready`, `post_not_owned`, `aim_cooldown`, then `off_target`.
  - `post_not_ready` (`night.lines.not_manned`): nobody is on post, the seat is still climbing or travelling, or the partner was replaced.
  - `post_not_owned`: another player holds the light.
  - `aim_cooldown`: 5 s after a miss on that light.
  - `off_target` (`night.lines.off_target`): the miss is stored.
- On target, the lock holds 90 s and replaces the light's earlier lock.
- The fog parts when valid locks are held at once from three or more distinct seats at three or more distinct lights. Those locks are marked `parted`, and `schooner_found_second` is set.

### 5.4 Tables (`20261106080000_case_board_and_night.sql`)

```sql
alter table public.case_state add column if not exists night_no integer not null default 0;
alter table public.case_state add column if not exists night_started_second integer;
alter table public.case_state add column if not exists night_called_by uuid references public.profiles (id) on delete set null;
alter table public.case_state drop constraint if exists case_state_night_is_complete;
alter table public.case_state add constraint case_state_night_is_complete
  check ((night_no = 0) = (night_started_second is null) and night_no >= 0);

create table if not exists public.board_pins (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  card_id        text not null,
  seat_no        smallint not null,
  ordered_second integer not null,
  pinned_second  integer not null,
  pinned_by      uuid references public.profiles (id) on delete set null,
  by_partner     boolean not null default false,
  order_no       integer,
  coins_rewarded integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (crew_id, card_id, seat_no),
  constraint board_pins_card_id_format check (card_id ~ '^C[1-8]$'),
  constraint board_pins_seat_no_range check (seat_no between 1 and 4),
  constraint board_pins_seconds check (ordered_second >= 0 and pinned_second >= ordered_second),
  constraint board_pins_partner_has_order check (by_partner = (order_no is not null)),
  constraint board_pins_player_pin_is_at_once check (by_partner or pinned_second = ordered_second),
  constraint board_pins_reward_not_negative check (coins_rewarded >= 0)
);
create index if not exists board_pins_pinned_by_idx on public.board_pins (pinned_by);

-- Light posts are history: a post ends by setting ended_second, and no row is ever deleted.
create table if not exists public.finale_posts (
  id             bigint generated always as identity primary key,
  crew_id        uuid not null references public.crews (id) on delete cascade,
  light_id       text not null,
  seat_no        smallint not null,
  player_id      uuid references public.profiles (id) on delete cascade,
  npc_id         text,
  taken_second   integer not null,
  on_post_second integer not null,
  ended_second   integer,
  order_no       integer,
  created_at     timestamptz not null default now(),
  constraint finale_posts_light_allowed check (light_id in ('keepers_lamp', 'harbor_light', 'islet_signal_station', 'ruin_light')),
  constraint finale_posts_seat_no_range check (seat_no between 1 and 4),
  constraint finale_posts_player_or_npc check (num_nonnulls(player_id, npc_id) = 1),
  constraint finale_posts_times check (taken_second >= 0 and on_post_second >= taken_second),
  constraint finale_posts_end_after_start check (ended_second is null or ended_second >= taken_second)
);
-- At most one open post per light, and one open post per seat.
create unique index if not exists finale_posts_one_open_per_light
  on public.finale_posts (crew_id, light_id) where ended_second is null;
create unique index if not exists finale_posts_one_open_per_seat
  on public.finale_posts (crew_id, seat_no) where ended_second is null;
create index if not exists finale_posts_crew_idx on public.finale_posts (crew_id, id desc);

create table if not exists public.finale_signals (
  id                 bigint generated always as identity primary key,
  crew_id            uuid not null references public.crews (id) on delete cascade,
  night_no           integer not null,
  light_id           text not null,
  post_seat_no       smallint not null,
  aimed_by           uuid references public.profiles (id) on delete set null,
  aimed_seat_no      smallint not null,
  bearing            numeric(4, 1) not null,
  on_target          boolean not null,
  case_second        integer not null,
  holds_until_second integer,
  ended_second       integer,
  parted             boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint finale_signals_night_positive check (night_no >= 1),
  constraint finale_signals_bearing_range check (bearing >= 0 and bearing < 360),
  constraint finale_signals_seats_range check (post_seat_no between 1 and 4 and aimed_seat_no between 1 and 4),
  constraint finale_signals_hold_only_on_target check (on_target = (holds_until_second is not null)),
  constraint finale_signals_parted_only_on_target check (on_target or not parted)
);
create index if not exists finale_signals_crew_night_idx on public.finale_signals (crew_id, night_no, id desc);
```

- RLS is on for all three tables, with no policy. Revoke everything, including `finale_posts_id_seq` and `finale_signals_id_seq`.
- `service_role` gets:
  - `board_pins`: select and insert;
  - `finale_posts`: select and insert, plus `grant update (ended_second)`;
  - `finale_signals`: select and insert, plus `grant update (ended_second, parted)`.
- No delete grant on any of them.

### 5.5 Functions

```sql
create or replace function public.finale_post_holds(p_crew_id uuid, p_light_id text, p_seat_no smallint)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- An open post counts only while its seat still has the same holder (an A6 takeover ends a
  -- partner's duty).
  select exists (
    select 1
      from public.finale_posts as p
      join public.crew_seats as s on s.crew_id = p.crew_id and s.seat_no = p.seat_no
     where p.crew_id = p_crew_id and p.light_id = p_light_id and p.seat_no = p_seat_no
       and p.ended_second is null
       and (p.player_id = s.player_id or p.npc_id = s.npc_id)
  );
$$;

create or replace function public.finale_leave_post(p_crew_id uuid, p_seat_no smallint, p_night_no integer, p_now integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- A lock ends as soon as the seat at that light leaves it.
  update public.finale_signals as fs
     set ended_second = p_now
    from public.finale_posts as p
   where p.crew_id = p_crew_id and p.seat_no = p_seat_no and p.ended_second is null
     and fs.crew_id = p_crew_id and fs.night_no = p_night_no and fs.light_id = p.light_id
     and fs.on_target and fs.ended_second is null and fs.holds_until_second > p_now;
  -- The post ends too. Its row stays: posts are history, never deleted.
  update public.finale_posts
     set ended_second = p_now
   where crew_id = p_crew_id and seat_no = p_seat_no and ended_second is null;
end;
$$;

create or replace function public.board_pin(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_id text, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_paid     integer := 0;
  v_revision bigint;
begin
  if p_card_id is null or p_reward_coins is null or p_reward_coins < 1
     or p_reward_ref is null or btrim(p_reward_ref) = '' then
    raise exception 'bad_pin';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  if not exists (select 1 from public.case_finds as f
                  where f.crew_id = p_crew_id and f.seat_no = v_seat
                    and f.card_id = p_card_id and f.ready_second <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'card_not_held');
  end if;
  if exists (select 1 from public.board_pins as b
              where b.crew_id = p_crew_id and b.card_id = p_card_id and b.seat_no = v_seat) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_pinned');
  end if;
  begin
    perform public.apply_wallet_transaction(p_player_id, p_reward_coins, 'clue_reward', p_reward_ref);
    v_paid := p_reward_coins;
  exception when unique_violation then
    v_paid := 0;  -- this player pinned this card before, in this crew or another one
  end;
  insert into public.board_pins (crew_id, card_id, seat_no, ordered_second, pinned_second, pinned_by,
                                 coins_rewarded)
  values (p_crew_id, p_card_id, v_seat, v_now, v_now, p_player_id, v_paid);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pin', p_card_id, 'pinned', v_now);
  return jsonb_build_object('status', 'done', 'coinsPaid', v_paid, 'revision', v_revision);
end;
$$;

create or replace function public.board_pair(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_a text, p_card_b text, p_deduction_id text,
  p_wrong_wait_seconds integer, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin     jsonb;
  v_seat      smallint;
  v_now       integer;
  v_wait      integer;
  v_player    uuid;
  v_paid      integer;
  v_paid_list jsonb := '[]'::jsonb;
  v_revision  bigint;
begin
  if p_card_a is null or p_card_b is null or p_card_a = p_card_b
     or p_wrong_wait_seconds is null or p_wrong_wait_seconds < 1
     or p_reward_coins is null or p_reward_coins < 1
     or p_reward_ref is null or btrim(p_reward_ref) = '' then
    raise exception 'bad_pair';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select pair_wait_until into v_wait from public.case_state where crew_id = p_crew_id;
  if v_now < v_wait then
    return jsonb_build_object('status', 'refused', 'reason', 'pair_cooldown', 'seconds', v_wait - v_now);
  end if;
  if not exists (select 1 from public.board_pins as b
                  where b.crew_id = p_crew_id and b.card_id = p_card_a and b.pinned_second <= v_now)
     or not exists (select 1 from public.board_pins as b
                     where b.crew_id = p_crew_id and b.card_id = p_card_b and b.pinned_second <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_pinned');
  end if;
  -- Two different seats: some seat pinned card a, and another seat pinned card b.
  if not exists (
    select 1
      from public.board_pins as a
      join public.board_pins as b
        on b.crew_id = a.crew_id and b.card_id = p_card_b and b.seat_no <> a.seat_no
     where a.crew_id = p_crew_id and a.card_id = p_card_a
       and a.pinned_second <= v_now and b.pinned_second <= v_now
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'different_seats_required');
  end if;
  if p_deduction_id is null then
    update public.case_state set pair_wait_until = v_now + p_wrong_wait_seconds
     where crew_id = p_crew_id;
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pair',
                                     p_card_a || '+' || p_card_b, 'wrong_pair', v_now);
    return jsonb_build_object('status', 'wrong_pair', 'seconds', p_wrong_wait_seconds, 'revision', v_revision);
  end if;
  if exists (select 1 from public.case_deductions as d
              where d.crew_id = p_crew_id and d.deduction_id = p_deduction_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_deduced');
  end if;
  insert into public.case_deductions (crew_id, deduction_id, formed_second, formed_by, formed_seat)
  values (p_crew_id, p_deduction_id, v_now, p_player_id, v_seat);
  -- Part of a deduction (case.json, rewards.part_of_a_deduction): pinned one of its cards, or
  -- ordered a partner's pin of it, before it formed. Every pin row here was placed before now.
  for v_player in
    select distinct b.pinned_by
      from public.board_pins as b
     where b.crew_id = p_crew_id and b.card_id in (p_card_a, p_card_b)
       and b.pinned_by is not null and b.ordered_second <= v_now
  loop
    begin
      perform public.apply_wallet_transaction(v_player, p_reward_coins, 'mystery_reward', p_reward_ref);
      v_paid := p_reward_coins;
    exception when unique_violation then
      v_paid := 0;  -- part of this deduction before, in another crew
    end;
    v_paid_list := v_paid_list || jsonb_build_object('playerId', v_player, 'paid', v_paid);
  end loop;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pair', p_deduction_id, 'formed', v_now);
  return jsonb_build_object('status', 'formed', 'payouts', v_paid_list, 'revision', v_revision);
end;
$$;

create or replace function public.finale_nightfall(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_needs_deduction text,
  p_night_seconds integer, p_dawn_wait_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_ends     integer;
  v_revision bigint;
begin
  if p_needs_deduction is null or p_night_seconds is null or p_night_seconds < 1
     or p_dawn_wait_seconds is null or p_dawn_wait_seconds < 0 then
    raise exception 'bad_nightfall';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_found');
  end if;
  if not exists (select 1 from public.case_deductions as d
                  where d.crew_id = p_crew_id and d.deduction_id = p_needs_deduction) then
    return jsonb_build_object('status', 'refused', 'reason', 'deduction_required');
  end if;
  if v_state.night_no > 0 then
    v_ends := v_state.night_started_second + p_night_seconds;
    if v_now < v_ends then
      return jsonb_build_object('status', 'refused', 'reason', 'night_in_progress');
    end if;
    if v_now < v_ends + p_dawn_wait_seconds then
      return jsonb_build_object('status', 'refused', 'reason', 'dawn_wait',
                                'seconds', v_ends + p_dawn_wait_seconds - v_now);
    end if;
  end if;
  update public.case_state
     set night_no = night_no + 1, night_started_second = v_now, night_called_by = p_player_id
   where crew_id = p_crew_id;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'nightfall', null, 'night', v_now);
  return jsonb_build_object('status', 'done', 'nightNo', v_state.night_no + 1,
                            'endsSecond', v_now + p_night_seconds, 'revision', v_revision);
end;
$$;

create or replace function public.finale_take_post(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_light_id text, p_light_ready boolean,
  p_climb_seconds integer, p_night_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_post     public.finale_posts%rowtype;
  v_revision bigint;
begin
  if p_light_id is null or p_light_ready is null or p_climb_seconds is null or p_climb_seconds < 0
     or p_night_seconds is null or p_night_seconds < 1 then
    raise exception 'bad_post';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null or v_state.night_no = 0
     or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'night_required');
  end if;
  if not p_light_ready then
    return jsonb_build_object('status', 'refused', 'reason', 'light_not_ready');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if found then
    if public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
      if v_post.seat_no = v_seat then
        return jsonb_build_object('status', 'refused', 'reason', 'already_on_post');
      end if;
      return jsonb_build_object('status', 'refused', 'reason', 'post_taken');
    end if;
    -- A stale post (its seat changed hands): end it so the light is free.
    perform public.finale_leave_post(p_crew_id, v_post.seat_no, v_state.night_no, v_now);
  end if;
  perform public.finale_leave_post(p_crew_id, v_seat, v_state.night_no, v_now);
  insert into public.finale_posts (crew_id, light_id, seat_no, player_id, taken_second, on_post_second)
  values (p_crew_id, p_light_id, v_seat, p_player_id, v_now, v_now + p_climb_seconds);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'post', p_light_id, 'climbing', v_now);
  return jsonb_build_object('status', 'done', 'onPostSecond', v_now + p_climb_seconds, 'revision', v_revision);
end;
$$;

create or replace function public.finale_signal(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_light_id text, p_bearing numeric, p_on_target boolean,
  p_lock_seconds integer, p_relock_wait_seconds integer, p_night_seconds integer, p_lights_needed integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin     jsonb;
  v_seat      smallint;
  v_now       integer;
  v_state     public.case_state%rowtype;
  v_post      public.finale_posts%rowtype;
  v_last_miss integer;
  v_seats     integer;
  v_lights    integer;
  v_parted    boolean := false;
  v_revision  bigint;
begin
  -- Python sends the bearing normalised to one decimal in [0, 360).
  if p_light_id is null or p_bearing is null or p_bearing < 0 or p_bearing >= 360
     or p_bearing <> round(p_bearing, 1)
     or p_on_target is null or p_lock_seconds is null or p_lock_seconds < 1
     or p_relock_wait_seconds is null or p_relock_wait_seconds < 0
     or p_night_seconds is null or p_night_seconds < 1
     or p_lights_needed is null or p_lights_needed < 1 then
    raise exception 'bad_signal';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_found');
  end if;
  if v_state.night_no = 0 or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'night_required');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if not found or v_post.on_post_second > v_now
     or not public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
    return jsonb_build_object('status', 'refused', 'reason', 'post_not_ready');
  end if;
  if v_post.player_id is not null and v_post.player_id <> p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'post_not_owned');
  end if;
  select max(fs.case_second) into v_last_miss
    from public.finale_signals as fs
   where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
     and fs.light_id = p_light_id and not fs.on_target;
  if v_last_miss is not null and v_now < v_last_miss + p_relock_wait_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'aim_cooldown',
                              'seconds', v_last_miss + p_relock_wait_seconds - v_now);
  end if;
  if not p_on_target then
    insert into public.finale_signals (crew_id, night_no, light_id, post_seat_no, aimed_by, aimed_seat_no,
                                       bearing, on_target, case_second)
    values (p_crew_id, v_state.night_no, p_light_id, v_post.seat_no, p_player_id, v_seat,
            p_bearing, false, v_now);
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'signal', p_light_id, 'off_target', v_now);
    return jsonb_build_object('status', 'off_target', 'seconds', p_relock_wait_seconds, 'revision', v_revision);
  end if;
  -- A new lock on this light replaces the one it held before.
  update public.finale_signals
     set ended_second = v_now
   where crew_id = p_crew_id and night_no = v_state.night_no and light_id = p_light_id
     and on_target and ended_second is null and holds_until_second > v_now;
  insert into public.finale_signals (crew_id, night_no, light_id, post_seat_no, aimed_by, aimed_seat_no,
                                     bearing, on_target, case_second, holds_until_second)
  values (p_crew_id, v_state.night_no, p_light_id, v_post.seat_no, p_player_id, v_seat,
          p_bearing, true, v_now, v_now + p_lock_seconds);
  -- Do enough locks hold at this moment, from different seats at different lights?
  select count(distinct fs.post_seat_no), count(distinct fs.light_id)
    into v_seats, v_lights
    from public.finale_signals as fs
   where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
     and fs.on_target and fs.ended_second is null and fs.holds_until_second > v_now
     and public.finale_post_holds(p_crew_id, fs.light_id, fs.post_seat_no);
  if v_seats >= p_lights_needed and v_lights >= p_lights_needed then
    update public.finale_signals as fs
       set parted = true
     where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
       and fs.on_target and fs.ended_second is null and fs.holds_until_second > v_now
       and public.finale_post_holds(p_crew_id, fs.light_id, fs.post_seat_no);
    update public.case_state set schooner_found_second = v_now where crew_id = p_crew_id;
    v_parted := true;
  end if;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'signal', p_light_id,
                                   case when v_parted then 'parted' else 'locked' end, v_now);
  return jsonb_build_object('status', 'locked', 'parted', v_parted, 'revision', v_revision);
end;
$$;
```

Grant signatures:
- `finale_post_holds(uuid, text, smallint)`
- `finale_leave_post(uuid, smallint, integer, integer)`
- `board_pin(uuid, uuid, text, text, integer, text)`
- `board_pair(uuid, uuid, text, text, text, text, integer, integer, text)`
- `finale_nightfall(uuid, uuid, text, text, integer, integer)`
- `finale_take_post(uuid, uuid, text, text, boolean, integer, integer)`
- `finale_signal(uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer)`

### 5.6 Routes

| Route | Body | Accepted answer extras | Game reasons |
|---|---|---|---|
| `POST /api/board/pin` | `{"cardId": "C3", "actionUid"}` | `coinsPaid` (50 or 0); message from `UI_MESSAGES.pinned` | `card_not_held`, `already_pinned` |
| `POST /api/board/pair` | `{"cards": ["C3", "C4"], "actionUid"}` (two distinct `^C[1-8]$`) | `deduction: {id, name, finding, clearLine, opens, opensLine}` and `coinsPaid` (the caller's entry in the SQL `payouts`); message = finding | `pair_cooldown` (`seconds`), `not_pinned`, `different_seats_required`, `wrong_pair` (`seconds`), `already_deduced` |
| `POST /api/finale/nightfall` | `{"actionUid"}` | `endsIn: 1200`; message = `night.lines.nightfall` | `schooner_found`, `deduction_required`, `night_in_progress`, `dawn_wait` (`seconds`) |
| `POST /api/finale/post` | `{"light": "islet_signal_station", "actionUid"}` | `onPostIn: 60`; message = `night.lines.on_post` with `{light}` | `night_required`, `light_not_ready`, `post_taken`, `already_on_post` |
| `POST /api/finale/signal` | `{"light": "harbor_light", "bearing": 14.2, "actionUid"}` (bearing is a finite number in [0, 360)) | `holdsFor: 90`, `parted`; when parted also `lights` and `target {x, y}`; message = `lines.locked` or `lines.parted` | `schooner_found`, `night_required`, `post_not_ready`, `post_not_owned`, `aim_cooldown` (`seconds`), `off_target` (`seconds: 5`) |

An unknown card or light gives 404 `no_such_card` or `no_such_light`. Each route checks the flag and requires a signed-in player. Repeats answer as in 3.3.

### 5.7 Live events

`pin`, `pair`, `nightfall`, `post` and `signal` send `board_changed` with `{"version": writeRevision}` (3.9), on every accepted or state-changing write.

### 5.8 The `finale` and `credits` view parts

```json
"finale": {"phase": "night", "nightNo": 1, "canCall": false, "remaining": 734, "dawnRemaining": 0,
  "status": "Aim toward the glow. Lock three lights from three seats at once.",
  "glow": {"x": 251, "y": 38}, "parted": null,
  "lights": [{"id": "keepers_lamp", "name": "the Keeper's lamp", "x": 95.5, "y": 168.75, "ready": true, "partnersMayMan": true,
              "post": {"seat": 2, "label": "the Deckhand", "holder": "partner", "onPost": true, "remaining": 0},
              "lock": {"remaining": 61, "aimedBySeat": 1}, "lastBearing": 50.2, "canTake": false, "canAim": true}]},
"credits": [{"seat": 1, "name": "Brave Puffin 17", "isMe": true, "pins": 5, "deductionParts": 3, "locks": 2, "accused": false, "share": null, "paid": null}]
```

- After success, `parted` is `{"second": 3412, "lights": [...], "target": {"x": 250.73, "y": 37.91}}`. This is the G4 `three_lights` target (CASE-FILE 10.7). `second` is `schooner_found_second`, which the adapter uses to play the effects once (8.1).
- `lastBearing` is the last bearing locked or missed on that light this night, so every seat's screen shows a moved beam.
- `post` comes from the light's open post only. Ended posts are history and appear in no view part.
- For the station:
  - `ready` means at least one player of the crew owns a station (C19).
  - `canTake` for any light means: the phase is `night`, the viewer is a player seat, the light is `ready`, no open post holds it, and the viewer is not on it. Partners never man the station.
- `me.timber` (added to `me` in this phase) is `stations.timber(viewer)`: L2's `read_timber`, or the starter timber from `load_buildings()` when L2 has no row. It is `null` only while L2 is not on `main`, and then the adapter hides materials.
- `credits[].pins` and `deductionParts` follow C17, so a partner pin counts from its order.

### 5.9 Database checks N1 to N15 (in `case_sql/`)

1. The migration applies twice.
2. A pin needs a landed find. Pinning twice gives `already_pinned`.
3. The first pin pays 50. The same card pinned by the same player in a second crew pays 0, and the pin is stored.
4. A pair of pins from one seat gives `different_seats_required`.
5. A wrong pair sets a 30 s wait: 29 s later `pair_cooldown`, 30 s later accepted.
6. A formed pair pays 200 once to every player with a pin row of either card, including the orderer of a partner pin that has not landed yet (C17). It pays nobody else. The result equals the Python model.
7. Nightfall before D1 gives `deduction_required`. A second nightfall at 1199 s gives `night_in_progress`, at 1200 s `dawn_wait`, and at 1380 s it is accepted with `night_no` 2.
8. A lock at a light during the 60 s climb gives `post_not_ready`.
9. A lock of another player's light gives `post_not_owned`. A partner's light is accepted.
10. A miss, then a lock 4 s later, gives `aim_cooldown`. 5 s later it is accepted.
11. Three locks at seconds 0, 45 and 89 from three seats part the fog. Rerun with 0, 45 and 90: they do not.
12. A seat that leaves its light ends that light's lock. The post row gets `ended_second` and stays.
13. After an A6 takeover of a partner seat, its post no longer holds.
14. As `authenticated`: no access to anything.
15. A second open post for one light, or for one seat, is refused by the partial unique indexes: a direct insert raises 23505. A third post after an ended one is accepted.

### 5.10 Tests (write first)

| File | Tests |
|---|---|
| `test_board_rules.py` | `test_one_seat_can_never_form_a_deduction` (refused, nothing changes); `test_a_pair_needs_both_cards_pinned`; `test_a_pending_partner_pin_does_not_count_for_a_pair`; `test_wrong_pair_starts_a_30_second_crew_wait_and_changes_nothing_else`; `test_pair_checks_run_in_the_fixed_order`; `test_pinning_needs_the_card_in_the_seat_journal`; `test_pinning_twice_is_refused`; `test_deduction_pays_200_to_every_player_part_of_it` (the Python model, and the store sends no player list and reads the payouts from the reply); **`test_rewards_are_paid_once_per_player`**, extended: the same pin and deduction in a second crew pay nothing, and the pin and deduction still happen |
| `test_finale_geometry.py` | `test_bearing_follows_the_compass_rule` (north 0, east 90, chart y grows to the south); `test_off_target_lock_is_refused_and_changes_nothing` (5.0 off accepted; 5.1 and 6 refused; wrap around 359 and 1); `test_bearings_are_normalised_to_one_decimal_below_360` (359.96 becomes 0.0); **`test_schooner_is_seeded_by_the_crew_id_and_stays_within_20_units`** (the same id gives the same point, two ids give different points, and the distance from the fog centre is at most 20 for 200 ids); `test_glow_is_sent_only_during_the_night_and_the_exact_spot_only_after_the_fog_parts` |
| `test_finale_rules.py` | `test_gated_cards_wait_for_their_deduction` gains the nightfall case (before D1: `deduction_required`), so the CASE-FILE test proves its whole row; `test_night_lasts_20_minutes_and_dawn_waits_3`; `test_fewer_than_three_seats_never_part_the_fog` (two seats; one seat hopping between lights); `test_one_player_can_hold_three_locks_for_partner_lights` (aims every beam first, then locks one after another inside 90 s; a beam stays aimed after its lock ends; a lock at a light nobody has reached is refused with "Nobody is at that light yet."); `test_locks_must_overlap` (0, 45, 89 part; 0, 45, 90 do not); `test_a_lock_ends_when_its_seat_leaves_the_light`; `test_a_player_cannot_lock_another_players_light`; `test_relock_waits_5_seconds_after_a_miss`; the three L2 tests: **`test_one_station_built_by_any_player_readies_the_light_for_the_whole_crew`**, `test_with_no_station_the_home_post_is_refused_and_nothing_changes` and `test_a_partner_cannot_man_the_home_station`; `test_a_failed_night_keeps_cards_deductions_and_posts` |
| `test_board_finale_routes.py` | Route shapes and status codes; a repeat answers 200 with `repeat: true`; refusals call no write; extra fields give 422; flag off gives 404 |
| `test_case_live_events.py` | `test_every_accepted_or_state_changing_write_sends_one_nudge_of_its_kind` (`board_changed` for pin, pair, nightfall, post and signal, `case_changed` for search, accuse and clock; Phase 4 adds `partner_changed` for orders); `test_refusals_repeats_and_reads_send_nothing`; `test_a_failed_or_slow_broadcast_never_fails_the_request` (send raises, returns False, or takes 2 s and is cut at 1 s); `test_the_nudge_data_holds_only_the_version`; `test_every_case_kind_is_one_of_a4s_crew_event_kinds` (imports `CREW_EVENT_KINDS`) |
| `test_case_view.py` (extended) | The post move, lock expiry, night end and dawn end cases of `test_revision_never_decreases_and_changes_on_every_write_and_every_landing` |
| `test_case_solvability.py` (night part) | `test_every_four_player_mix_parts_the_fog_and_solves` (35 mixes plus the 4 identical ones; a fake `StationLookup` gives one player seat a station; the price and the starter timber come from L2's `load_buildings()`, so this part lands with the L2 port slice) |
| `test_case_matches_migration.py` (extended) | The same checks for the new tables and functions, plus: no migration deletes from `finale_posts` |
| `case_sql/` | N1 to N15 |

### 5.11 Order of work

1. Geometry and the pure rules, with tests. This pull request also carries the two corrected story sentences, with the story owner's OK:
   - CASE-FILE 10.7: "The schooner's spot is chosen per crew, seeded by the crew id, within 20 units of the fog's centre. The spot varies the picture, not the difficulty: seen from 120 to 200 units away, the whole disc spans about 6 to 10 degrees, so a copied bearing often still hits. Copying gains nothing, because every crew sees its own glow."
   - `backend/content/README.md`, the `chart` row: "`seeded_by`: the crew id, so each crew's schooner sits at its own spot".
2. The migration and N1 to N15.
3. Store, service and routes. Then the L2 port slice once L2 is on `main`: `IsletStations` and the night part of the solvability test.
4. Nudges for this phase's kinds, if the nudge slice landed earlier. Otherwise the nudge slice itself.
5. Docs.

---

## 6. Phase 3: the Relighting switch

### 6.1 Scope

**Minimum:**
- `world_state`, moved from `dark` to `relit` **exactly once** by the first accepted accusation in the live world. It is one conditional update, and it happens only while `RELIGHT_OPEN` is true (decision 19 as changed by Nils: no demo world, one server setting).
- `world_solves`.
- The Wall of Lights: contributors' captain names and solve order, once per player (C16, decided by Nils on 6 Nov 2026).
- Each later solve adds one more light (at most 12 extra) and its names.
- `GET /api/world`, behind the flag `case`.
- `world_outcome` for every solver (`reveal.world`).

The 12 extra lamps are drawn by G later. The counter costs one line, and CASE-FILE test `test_world_relights_exactly_once` needs it.

**Full:**
- The festival (`festival_until`, 48 hours), free lantern colours (`POST /api/world/lantern {colour, actionUid}`, a `world_lanterns` table), the Keeper's Star, the Relighter title and the epilogue lines.
- Greyfathom's delisting and the 1% fee belong to L4, which reads `world_state.stage`.

### 6.2 Files

- `game/world_state.py` (reads and the view)
- `routes/world.py`
- `supabase/migrations/20261106120000_relighting.sql`

**Change:** `case_service.py` (the accuse answer carries `world`, and the reveal carries `world`), INTERFACES, supabase/README.

### 6.3 Tables

```sql
create table if not exists public.world_state (
  id            smallint primary key default 1,
  stage         text not null default 'dark',
  relit_at      timestamptz,
  first_crew_id uuid references public.crews (id) on delete set null,
  solves        integer not null default 0,
  extra_lights  integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint world_state_one_row check (id = 1),
  constraint world_state_stage_allowed check (stage in ('dark', 'relit')),
  constraint world_state_relit_has_a_time check ((stage = 'relit') = (relit_at is not null)),
  constraint world_state_extra_lights_range check (extra_lights between 0 and 12),
  constraint world_state_solves_not_negative check (solves >= 0)
);
insert into public.world_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.world_solves (
  crew_id   uuid primary key references public.crews (id) on delete cascade,
  solve_no  integer not null,
  solved_at timestamptz not null default now(),
  constraint world_solves_solve_no_positive check (solve_no >= 1)
);
create unique index if not exists world_solves_one_per_number on public.world_solves (solve_no);

create table if not exists public.wall_of_lights (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  solve_no  integer not null,
  crew_id   uuid references public.crews (id) on delete set null,
  added_at  timestamptz not null default now(),
  constraint wall_of_lights_solve_no_positive check (solve_no >= 1)
);
create index if not exists wall_of_lights_order_idx on public.wall_of_lights (solve_no, added_at);
```

- RLS is on for all three tables, with no policy.
- `service_role` gets select and update on `world_state`, and select and insert on `world_solves` and `wall_of_lights`.
- "Delete my data" removes a player's Wall entry (cascade, the A2 rule).

### 6.4 The hook, replaced

This file replaces the hook with `create or replace`. The Phase 1 file creates its own version only when the function is missing, so running Phase 1's file again keeps this one (W9). Say so in this file's header.

```sql
create or replace function public.case_after_solve(p_crew_id uuid, p_relight_open boolean, p_contributors uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_world    public.world_state%rowtype;
  v_solve_no integer;
  v_first    boolean;
begin
  -- The relight lock: while RELIGHT_OPEN is off, a solve stays inside its crew (decision 19).
  if not coalesce(p_relight_open, false) then
    return jsonb_build_object('world', 'locked');
  end if;
  select * into v_world from public.world_state where id = 1 for update;
  if not found then
    raise exception 'world_state_missing';
  end if;
  if exists (select 1 from public.world_solves where crew_id = p_crew_id) then
    return jsonb_build_object('world', 'already_recorded');
  end if;
  v_solve_no := v_world.solves + 1;
  insert into public.world_solves (crew_id, solve_no) values (p_crew_id, v_solve_no);
  -- The one conditional update: only if the coast is still dark.
  update public.world_state
     set stage = 'relit', relit_at = now(), first_crew_id = p_crew_id,
         solves = v_solve_no, updated_at = now()
   where id = 1 and stage = 'dark';
  v_first := found;
  if not v_first then
    -- 12 = relighting.later_crews.extra_light_spots in case.json (a test compares).
    update public.world_state
       set solves = v_solve_no, extra_lights = least(extra_lights + 1, 12), updated_at = now()
     where id = 1;
  end if;
  insert into public.wall_of_lights (player_id, solve_no, crew_id)
  select contributor, v_solve_no, p_crew_id from unnest(coalesce(p_contributors, '{}')) as contributor
  on conflict (player_id) do nothing;
  return jsonb_build_object('world', case when v_first then 'relit' else 'added' end, 'solveNo', v_solve_no);
end;
$$;
```

- Revoke and grant again for `(uuid, boolean, uuid[])`, and set this version's `comment on function`.
- It runs inside `case_accuse`, so the solve, the rewards, the world change and `case_state.world_outcome` are one transaction.
- The `world_state` row lock serialises two crews that solve at the same moment: exactly one gets `relit`.

### 6.5 Route: `GET /api/world`

- No sign-in. It answers only while the flag `case` is on (C11). With the flag off it gives `404 feature_off`, which the adapter reads as the dark world.
- It takes no query parameters (422), like the market board.
- `Cache-Control: public, max-age=30, s-maxage=30`. The adapter calls it **without** an `Authorization` header, so the edge can cache it. Confirm `x-vercel-cache: HIT` on a preview.

```json
{"stage": "relit", "lightsOn": true, "fogBankGone": true, "gullsRestOpen": true, "extraLights": 2, "solves": 3,
 "relitAt": "2026-11-20T11:42:10Z", "wall": [{"name": "Brave Puffin 17", "order": 1}],
 "line": "The false light is out. A crew found it."}
```

- Before the first solve, `stage` is `dark`, every flag is false, `wall` is `[]` and `line` is null.
- `wall` is read with `wall_of_lights?select=solve_no,added_at,profiles(display_name)&order=solve_no.asc,added_at.asc&limit=200`. It carries names and order only (the spoiler rule). `line` comes from `relighting.spoiler_rule.everyone_else_sees`.
- With no database configured (a laptop), it answers the dark world. With the database down, `503 database_unavailable`.

### 6.6 Live events

The Relighting has no crew event of its own.
- The solving crew's accusation sends `case_changed`, and every solver's refetched view carries `reveal.world`.
- The adapter shows that outcome on its world view until `GET /api/world` catches up.
- Everyone else polls `GET /api/world` every 60 s (edge cached).

### 6.7 Database checks W1 to W9 (in `case_sql/`)

1. The migration applies twice, and there is still one row.
2. Locked: the stage stays `dark`, the Wall and `world_solves` are empty, the rewards were paid, and `world_outcome` is `locked`.
3. Open: the first solve relights, with `solve_no` 1 and `world_outcome` `relit`.
4. A second crew's solve gives `added` and `extra_lights` 1, and its names are on the Wall.
5. The same crew twice gives `already_recorded`.
6. Two sessions solving at once: one `relit`, one `added`.
7. 13 later solves: `extra_lights` stays at 12.
8. Deleting a player removes their Wall row.
9. Run `20261106060000_case_rules.sql` again after this file. A solve with `p_relight_open` true still relights (the hook is still Phase 3's), and its comment is still Phase 3's.

### 6.8 Tests (write first)

- `test_world_relights_exactly_once` (two solves in a row move the stage once; the second adds names and one light)
- `test_a_solve_while_the_relight_lock_is_on_pays_its_rewards_and_leaves_the_world_dark` (and with the lock off the same solve relights once)
- `test_solves_made_while_locked_never_reach_the_wall_later` (C9)
- `test_later_crews_add_one_light_up_to_12`
- `test_the_wall_shows_names_and_order_only`
- `test_world_route_needs_no_sign_in_is_cached_30_seconds_and_takes_no_query_parameters`
- `test_world_route_is_behind_the_case_flag`
- `test_the_world_answer_never_names_the_culprit`
- `test_every_solver_gets_the_world_outcome` (`reveal.world`)
- `test_extra_light_spots_in_the_data_match_the_sql_constant`
- `test_relight_open_comes_only_from_the_setting`, with `test_relight_open_is_refused_outside_production` from Phase 1
- `case_sql/`: W1 to W9

### 6.9 Order of work

1. The migration and W1 to W9.
2. The route and the view.
3. Tests and docs.

---

## 7. Phase 4: S4, NPC partners

### 7.1 Scope

**Minimum** (the NPC-PARTNERS box):
- One order, `fetch`, that fetches a card **and** pins it: 10 minutes for the errand plus 5 for the pin, with arrival after 4. A Witness partner already holds C2, so the same order only pins it (5 minutes).
- `man_light`: 10 minutes; only the Keeper's lamp and the Harbor Light; only during a night.
- The kit rule: A6 seats partners at the muster in the order informant, stranger, true_keeper, witness, and Phase 4 proves it.
- The Witness partner's C2 (Phase 1's `case_open`).
- Four refusals: `busy`, `wrong_kit`, `locked_window`, `not_ready`. Every other reason answers `not_ready`.
- `allowPaid` stays off: it gives 422 `paid_errands_off`, and there is no wallet call except the pin's reward.
- Pins are credited to the ordering player (`pinned_by`), from the order (C17).
- The line bank with `pick_line`.
- **The 27 tests marked "23 Nov" in NPC-PARTNERS 10.8**, adapted (7.10), plus the two CASE-FILE solvability tests that need partners.

**Full:**
- `search` (with decoys, and "not a lead yet" finding nothing), a separate `pin` order, and `wait`.
- The other refusals (`already_have`, `no_coins`, `no_lead`, `not_carrying`, `not_nightfall`, `light_taken`, with their own line groups).
- `payPrice` on a locked fetch, and `allowPaid` with `clue_purchase` and the ref `false_light:{crew_id}:npc:{order_uid}` (N17 to N19).
- The `takeover` line in A6's join answer. Duty ending at takeover is already true through `finale_post_holds`. A leaving player is replaced by a partner (A6, later).

### 7.2 Settlement (C5)

At acceptance the order stores:
- `ordered_second`, `arrive_second` (+240), `found_second` (+600), `pin_second` (+900, or +300 for pin only), and `ready_second` = `pin_second`;
- a `case_finds` row for the partner seat, ready at `found_second`;
- a `board_pins` row: `ordered_second` = the order second, `pinned_second` = `pin_second`, `pinned_by` = the ordering player, `by_partner`, `order_no`.

"Settled" means the second has passed. Settling twice changes nothing, and a clock jump (the host clock route) finishes every due order at once (N4). The result and the route are fixed at acceptance (N5). A partner never pays (N19). The pin's 50 coins go to the ordering player at acceptance (C6, decided by Nils on 6 Nov 2026).

### 7.3 Rules (pure, `game/npc_orders.py`)

**Constants (NPC-PARTNERS owns them):** `ERRAND_MINUTES = 10`, `ARRIVE_AFTER_MINUTES = 4`, `PIN_MINUTES = 5`, `WAIT_MINUTES = 5`.

**Route choice** (5.4):
1. Keep `open` routes, the partner's own `kit` route, and `timed` routes (`paid` only with `allowPaid`, full version). Drop `players_only`, `share`, `world` and `log_reader`. If nothing is left: `wrong_kit`.
2. Keep the routes that are open at minute + 4. If nothing is left: `locked_window`, with `minutes` = the smallest k ≥ 1 so that the window is open at minute + 4 + k.
3. Take the cheapest. On a tie, take the first in the file.

**Fetch checks** (6.2): `busy` (`minutes` = the seconds left divided by 60, rounded up), `no_lead`, `already_have` (this seat already has a pin row of the card), `wrong_kit`, `locked_window`.

**man_light checks:** `busy`, `light_not_for_partners` (`partners_may_man` is false; line group `wrong_kit`), `not_nightfall`, `already_have` or `light_taken`.

Any new order ends a partner's duty: its post gets `ended_second`, and its lock ends.

### 7.4 Files

| File | Job |
|---|---|
| `game/npc_lines.py` | Loads `partners.json` and checks it: 80 characters, ASCII, banned words, known placeholders, no dashes, no C or D ids. `pick_line(bank, event, variant, salt, values)` takes `lines[variant][salt mod len]`, with no randomness. It is the only way to get partner text. |
| `game/npc_orders.py` | Constants, route choice, decisions, line groups |
| `game/npc_view.py` | The `partners` view part |
| `routes/crew_orders.py` | `POST /api/crews/me/orders` |
| `supabase/migrations/20261106130000_npc_partners.sql` | 7.5 |

The kit rule is not re-implemented: import `crews.seats.partner_seats` and `NPC_KIT_ORDER`.

### 7.5 Tables and functions

**G10 implementation amendment, 6 Nov 2026:** an NPC action receipt uses its unique order number as the internal `case_actions.target`. A card/light target cannot distinguish two orders by one player to different partners in the same second. The server recovers the exact player-scoped order row for its original bank variant and salt, including when the row is older than the bounded view. Public intent targets remain card/light ids; function signatures and earlier migrations are unchanged. See D027.

```sql
alter table public.case_state add column if not exists orders_count integer not null default 0;

create table if not exists public.npc_orders (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  order_no       integer not null,
  seat_no        smallint not null,
  npc_id         text not null,
  kind           text not null,
  target         text not null,
  ordered_by     uuid references public.profiles (id) on delete set null,
  route_id       text,
  result_card    text,
  price          integer not null default 0,
  ordered_second integer not null,
  arrive_second  integer,
  found_second   integer,
  pin_second     integer,
  ready_second   integer not null,
  created_at     timestamptz not null default now(),
  primary key (crew_id, order_no),
  constraint npc_orders_order_no_positive check (order_no >= 1),
  constraint npc_orders_seat_no_range check (seat_no between 1 and 4),
  constraint npc_orders_npc_id_format check (npc_id ~ '^[a-z0-9_]{2,40}$'),
  constraint npc_orders_kind_allowed check (kind in ('fetch', 'search', 'pin', 'man_light', 'wait')),
  constraint npc_orders_price_not_negative check (price >= 0),
  constraint npc_orders_times check (ordered_second >= 0 and ready_second >= ordered_second)
);
create index if not exists npc_orders_seat_idx on public.npc_orders (crew_id, seat_no, order_no desc);
```

- RLS is on, with no policy. `service_role` gets select and insert.
- NPC-PARTNERS 10.7's `settled` column and partial unique index are replaced by effective seconds plus the crew lock. A busy partner is refused under the lock.

```sql
create or replace function public.npc_begin(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_seat_no smallint, p_npc_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin      jsonb;
  v_now        integer;
  v_busy_until integer;
begin
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  if not exists (select 1 from public.crew_seats as s
                  where s.crew_id = p_crew_id and s.seat_no = p_seat_no and s.npc_id = p_npc_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'seat_changed');
  end if;
  select max(o.ready_second) into v_busy_until
    from public.npc_orders as o where o.crew_id = p_crew_id and o.seat_no = p_seat_no;
  if v_busy_until is not null and v_now < v_busy_until then
    return jsonb_build_object('status', 'refused', 'reason', 'busy', 'seconds', v_busy_until - v_now);
  end if;
  return v_begin;
end;
$$;

create or replace function public.npc_next_order_no(p_crew_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_order_no integer;
begin
  update public.case_state set orders_count = orders_count + 1
   where crew_id = p_crew_id
  returning orders_count into v_order_no;
  return v_order_no;
end;
$$;

create or replace function public.npc_fetch_pin(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_seat_no smallint, p_npc_id text, p_card_id text,
  p_route_id text, p_needs_deductions text[], p_window jsonb, p_errand_seconds integer, p_arrive_seconds integer,
  p_pin_seconds integer, p_price integer, p_purchase_ref text, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_night_no integer;
  v_holds    boolean;
  v_found_at integer;
  v_pin_at   integer;
  v_order_no integer;
  v_paid     integer := 0;
  v_revision bigint;
begin
  if p_card_id is null or p_needs_deductions is null or p_errand_seconds is null or p_errand_seconds < 1
     or p_arrive_seconds is null or p_arrive_seconds < 0 or p_arrive_seconds > p_errand_seconds
     or p_pin_seconds is null or p_pin_seconds < 1 or p_price is null or p_price < 0
     or (p_price > 0 and (p_purchase_ref is null or btrim(p_purchase_ref) = ''))
     or p_reward_coins is null or p_reward_coins < 1 or p_reward_ref is null then
    raise exception 'bad_order';
  end if;
  v_begin := public.npc_begin(p_crew_id, p_player_id, p_action_uid, p_seat_no, p_npc_id);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'no_lead');
  end if;
  if exists (select 1 from public.board_pins as b
              where b.crew_id = p_crew_id and b.card_id = p_card_id and b.seat_no = p_seat_no) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_have');
  end if;
  v_holds := exists (select 1 from public.case_finds as f
                      where f.crew_id = p_crew_id and f.seat_no = p_seat_no and f.card_id = p_card_id);
  if not v_holds then
    if p_route_id is null then
      raise exception 'bad_order';
    end if;
    if p_window is not null and not public.case_window_open(
         (v_now + p_arrive_seconds) / 60, (p_window ->> 'every')::integer,
         (p_window ->> 'from')::integer, (p_window ->> 'open')::integer) then
      return jsonb_build_object('status', 'refused', 'reason', 'locked_window', 'minute', v_now / 60);
    end if;
  end if;
  v_order_no := public.npc_next_order_no(p_crew_id);
  if v_holds then
    v_found_at := null;
    v_pin_at := v_now + p_pin_seconds;
  else
    v_found_at := v_now + p_errand_seconds;
    v_pin_at := v_found_at + p_pin_seconds;
    insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second,
                                   coins_paid, started_by, by_partner, order_no)
    values (p_crew_id, p_seat_no, p_card_id, p_route_id, v_now, v_found_at,
            p_price, p_player_id, true, v_order_no);
  end if;
  if p_price > 0 then
    perform public.apply_wallet_transaction(p_player_id, -p_price, 'clue_purchase', p_purchase_ref);
  end if;
  -- The outcome is fixed now (NPC-PARTNERS N5), so the ordering player's first-pin reward is paid now (C6).
  begin
    perform public.apply_wallet_transaction(p_player_id, p_reward_coins, 'clue_reward', p_reward_ref);
    v_paid := p_reward_coins;
  exception when unique_violation then
    v_paid := 0;
  end;
  insert into public.board_pins (crew_id, card_id, seat_no, ordered_second, pinned_second, pinned_by,
                                 by_partner, order_no, coins_rewarded)
  values (p_crew_id, p_card_id, p_seat_no, v_now, v_pin_at, p_player_id, true, v_order_no, v_paid);
  -- A new order ends light duty.
  select night_no into v_night_no from public.case_state where crew_id = p_crew_id;
  perform public.finale_leave_post(p_crew_id, p_seat_no, v_night_no, v_now);
  insert into public.npc_orders (crew_id, order_no, seat_no, npc_id, kind, target, ordered_by, route_id,
                                 result_card, price, ordered_second, arrive_second, found_second,
                                 pin_second, ready_second)
  values (p_crew_id, v_order_no, p_seat_no, p_npc_id, 'fetch', p_card_id, p_player_id,
          case when v_holds then null else p_route_id end, p_card_id, p_price, v_now,
          case when v_holds then null else v_now + p_arrive_seconds end, v_found_at, v_pin_at, v_pin_at);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'order', v_order_no::text, 'fetch', v_now);
  return jsonb_build_object('status', 'done', 'orderNo', v_order_no, 'foundSecond', v_found_at,
                            'pinSecond', v_pin_at, 'coinsPaid', v_paid, 'revision', v_revision);
end;
$$;

create or replace function public.npc_man_light(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_seat_no smallint, p_npc_id text, p_light_id text,
  p_travel_seconds integer, p_night_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_post     public.finale_posts%rowtype;
  v_order_no integer;
  v_revision bigint;
begin
  if p_light_id is null or p_travel_seconds is null or p_travel_seconds < 1
     or p_night_seconds is null or p_night_seconds < 1 then
    raise exception 'bad_order';
  end if;
  v_begin := public.npc_begin(p_crew_id, p_player_id, p_action_uid, p_seat_no, p_npc_id);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null or v_state.night_no = 0
     or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'not_nightfall');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if found then
    if public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
      if v_post.seat_no = p_seat_no then
        return jsonb_build_object('status', 'refused', 'reason', 'already_have');
      end if;
      return jsonb_build_object('status', 'refused', 'reason', 'light_taken');
    end if;
    perform public.finale_leave_post(p_crew_id, v_post.seat_no, v_state.night_no, v_now);
  end if;
  perform public.finale_leave_post(p_crew_id, p_seat_no, v_state.night_no, v_now);
  v_order_no := public.npc_next_order_no(p_crew_id);
  -- The light is reserved now; the partner is on post after the trip (a player may aim it meanwhile).
  insert into public.finale_posts (crew_id, light_id, seat_no, npc_id, taken_second, on_post_second, order_no)
  values (p_crew_id, p_light_id, p_seat_no, p_npc_id, v_now, v_now + p_travel_seconds, v_order_no);
  insert into public.npc_orders (crew_id, order_no, seat_no, npc_id, kind, target, ordered_by,
                                 ordered_second, ready_second)
  values (p_crew_id, v_order_no, p_seat_no, p_npc_id, 'man_light', p_light_id, p_player_id,
          v_now, v_now + p_travel_seconds);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'order', v_order_no::text, 'man_light', v_now);
  return jsonb_build_object('status', 'done', 'orderNo', v_order_no, 'onPostSecond', v_now + p_travel_seconds,
                            'revision', v_revision);
end;
$$;
```

Grant signatures:
- `npc_begin(uuid, uuid, text, smallint, text)`
- `npc_next_order_no(uuid)`
- `npc_fetch_pin(uuid, uuid, text, smallint, text, text, text, text[], jsonb, integer, integer, integer, integer, text, integer, text)`
- `npc_man_light(uuid, uuid, text, smallint, text, text, integer, integer)`

### 7.6 Route: `POST /api/crews/me/orders`

The examples use partner seat 2, the Deckhand, with the Stranger kit. For C4 that partner may use only `C4.low_tide_cave`: the kit route belongs to the Informant, and paid and world routes are off. So the low tide window (minutes 12 to 19 of every 20) must be open on arrival.

```
At second 2880 (minute 48; arrival at minute 52, inside low tide), order number 3:
{"seat": 2, "order": "fetch", "target": "C4", "allowPaid": false, "actionUid": "o7x2k9m4"}
200 {"accepted": true, "reason": null, "message": "Aye aye! Off I go. Back in about 10 minutes.", "line": "Aye aye! Off I go. Back in about 10 minutes.",
     "order": {"number": 3, "seat": 2, "order": "fetch", "target": "C4", "orderedAt": 2880, "arriveAt": 3120,
               "foundAt": 3480, "pinAt": 3780, "readyAt": 3780, "price": 0}, "coinsPaid": 50, "case": {…}}

At second 2400 (minute 40; arrival at minute 44, low tide shut until minute 52):
200 {"accepted": false, "reason": "locked_window", "message": "Shut when I'd get there, Captain. Ask me again in about 8 minutes.", "line": "…", "minutes": 8, "case": {…}}
```

- `seat` is a StrictInt from 1 to 4.
- `order` is `fetch` or `man_light` in the minimum (later also `search`, `pin` and `wait`).
- `target` is a card id or a light id.
- `allowPaid` is a bool. `true` gives 422 `paid_errands_off` in the minimum. Extra fields are forbidden.
- **The lines:**
  - `message` and `line` are the bank line, filled in by the server (N25).
  - A fetch that has to find the card uses the `order_accepted` variant `go`, with `{minutes}` = 10.
  - A fetch that only pins (the Witness partner's C2) uses the variant `pin`, with `{minutes}` = 5.
  - The salt is the order number for accepted orders (3 mod 2 = 1, the second `go` line), and `orders_count` for refusals.
- **HTTP errors:** 404 `no_crew`, 409 `not_a_partner`, 409 `crew_busy` (`seat_changed`), 404 `no_such_card` or `no_such_light`, plus the shared table. A repeat answers as in 3.3.
- Only a signed-in player of the crew can give orders. No order kind pairs, accuses, calls nightfall or aims (N26), and those routes need a player sign-in anyway.

### 7.7 Live events

Orders send `partner_changed` with `{"version": writeRevision}` **at order acceptance**. Arrivals, finds and pins land by time with no event; clients see them through the countdown refetch (3.9).

### 7.8 The `partners` view part

The example is at second 3368, after the accepted order of 7.6.

```json
"partners": [{"seat": 2, "name": "the Deckhand", "partnerId": "deckhand", "kit": "stranger", "kitName": "Stranger",
  "status": "busy", "canOrder": false,
  "orders": [{"id": "fetch", "label": "Fetch and pin a card (15 min)"}, {"id": "man_light", "label": "Man a light (10 min)"}],
  "targets": {"fetch": [{"id": "C7", "label": "The coastguard night log"}],
              "man_light": [{"id": "keepers_lamp", "label": "the Keeper's lamp"}, {"id": "harbor_light", "label": "the Harbor Light"}]},
  "satchel": [],
  "job": {"orderNo": 3, "order": "fetch", "target": "C4", "total": 900, "remaining": 412, "done": false,
          "arrived": true, "line": "Made landfall. Having a good look around."}}]
```

The numbers check out:
- The order was placed at 2880, so it is ready at 3780 and has 412 of 900 seconds left.
- The partner arrived at 3120, so the line is the `arrived` line.
- The card is found at 3480, so the satchel is still empty.

The rules of this part:
- `status` is one of:
  - `idle`;
  - `busy`: `ready_second > now`;
  - `on_duty`: the latest order is `man_light`, it is over, and the post still holds.
- `arrived` is true once `arrive_second` (for a fetch) or `on_post_second` (for `man_light`) has passed. A pin-only order has no trip, so it is true at once.
- `canOrder` is false only while the partner is busy. Other refusals are found by trying, so the buttons never hint where a card is (NPC 6.3).
- `targets.fetch` lists every open lead for which this seat has no pin row. The labels are card titles.
- `satchel` lists the cards this seat holds (`holds(find, now)`), each with `pinned` (a pin in effect).
- `job.line` is the latest bank line whose second has passed: `order_accepted`, then `arrived`, `found_card`, `pinned_card`, or `manning_light` (salt = the order number). In the minimum the lines beyond `order_accepted` and `pinned_card` are on the cut list.
- A beam lock on a partner's light adds that partner's `beam_locked` line to the signal answer (salt = seat). A solve adds every partner's `case_solved` line to the accuse answer. Both are on the cut list.

### 7.9 Database checks P1 to P10 (in `case_sql/`)

1. The migration applies twice.
2. A fetch at minute 3 for a card reachable only at low tide gives `locked_window`. At minute 8 it is accepted, with the find at +600 and the pin at +900.
3. A second order to that partner gives `busy`, until exactly `ready_second`.
4. A Witness partner's C2: pin only, at +300.
5. The pin row has `pinned_by` = the ordering player and `ordered_second` = the order second, and it pays 50 once.
6. `man_light` before nightfall gives `not_nightfall`. A light that another seat holds gives `light_taken`.
7. A fetch ends the partner's duty: its post gets `ended_second`, and its lock ends.
8. After an A6 takeover the answer is `seat_changed`. The running find and pin still land in the seat.
9. Any 25 orders get `order_no` 1 to 25 with no gap.
10. As `authenticated`: nothing.

### 7.10 Tests (write first)

**The 27 rows marked "23 Nov" in NPC-PARTNERS 10.8, adapted to fetch-and-pin and to seconds:**
- `test_npc_kits.py` (these run against A6's `partner_seats`):
  - `test_partners_get_the_kits_in_the_examples_table`
  - `test_partners_hold_the_first_missing_kits_for_all_69_kit_mixes`
  - `test_empty_seats_are_filled_from_the_lowest_seat_number`
  - `test_a_witness_partner_starts_with_card_c2_in_its_satchel`
- `test_npc_orders.py`:
  - `test_fetch_arrives_after_4_minutes_finds_after_10_and_pins_after_15` (row: search arrives after 4 and is ready after 10)
  - `test_man_light_takes_10_minutes_and_a_witness_pin_takes_5` (row: fetch and man_light take 10, pin and wait take 5)
  - `test_an_order_is_still_running_one_second_before_ready_at`
  - `test_settling_twice_changes_nothing`
  - `test_the_outcome_is_fixed_when_the_order_is_accepted`
  - `test_only_a_player_of_the_crew_can_give_an_order_to_a_partner_seat`
  - `test_a_busy_partner_refuses_a_second_order`
  - `test_the_same_action_uid_twice_acts_once` (the repeat answers 200 with `repeat: true`)
  - `test_fetch_needs_a_lead`
  - `test_a_partner_never_uses_share_world_or_log_reader_routes`
  - `test_a_timed_route_is_used_only_when_its_window_is_open_on_arrival`
  - `test_pin_files_the_card_under_the_partner_seat_with_ordered_by`
  - `test_a_light_is_reserved_from_the_moment_man_light_is_accepted`
- `test_npc_refusals.py`:
  - `test_wrong_kit_is_refused_with_its_reason`
  - `test_a_shut_place_is_refused_with_the_exact_minutes_until_an_order_would_arrive_inside_the_window`
  - `test_ordering_again_after_those_minutes_is_accepted_and_one_minute_sooner_is_refused`
  - `test_man_light_is_refused_before_nightfall_and_for_home_lights`
  - `test_a_refusal_creates_no_order_and_costs_no_minutes_or_coins`
- `test_npc_money.py`: `test_a_partner_never_pays_unless_the_order_allows_paying` (minimum: no `clue_purchase` call, and `allowPaid` gives 422)
- `test_npc_never.py`: `test_pair_accuse_and_nightfall_refuse_a_request_without_a_player_sign_in`
- `test_npc_lines.py`: `test_no_line_has_a_dash_a_card_or_deduction_id_or_a_banned_word`
- `test_case_solvability.py`:
  - `test_every_kit_mix_can_pin_all_eight_cards_with_two_seats_for_each_deduction`
  - `test_every_kit_mix_can_man_three_lights_with_three_seats`

**CASE-FILE section 17 tests that need partners (minimum):**
- `test_case_solvability.py`:
  - `test_every_player_mix_solves_on_starting_coins` (all 69 mixes, partners by the kit order, the `market` flag off, no world events, no coins beyond one building)
  - `test_four_identical_endings_can_solve`
- `test_case_spoilers.py`: the partner fetch case of `test_a_card_text_is_not_sent_one_second_before_it_lands`.
- `test_case_view.py`: the partner arrival and duty-ending cases of `test_revision_never_decreases_and_changes_on_every_write_and_every_landing`.
- `case_sql/`: P1 to P10.

**Beyond the 27, written only if time allows (on the cut list, section 10):**
- `test_a_new_order_ends_light_duty` (P7 covers the SQL)
- `test_other_reasons_answer_not_ready_in_the_minimum`
- `test_a_partner_pin_reward_goes_to_the_ordering_player_once` (the pure rewards test and P5 cover it)
- `test_a_solo_player_earns_deduction_rewards_through_ordered_pins`
- `test_partners_alone_never_create_a_deduction_or_solve_the_case` (step 5 of NPC-PARTNERS 10.9)
- `test_a_partner_without_an_order_does_nothing_however_much_time_passes`
- `test_line_choice_follows_the_salt_rule`
- `test_partner_text_always_comes_from_the_bank`
- `test_the_skeleton_line_for_c4_is_there_word_for_word`
- `test_no_kit_mix_spends_a_coin_on_a_card` (covered by `test_every_player_mix_solves_on_starting_coins`)

### 7.11 Order of work

1. The line bank and its lint.
2. The pure order rules.
3. The migration and P1 to P10. This starts once Phase 2's migration file is final, because Phase 4 writes `board_pins` and `finale_posts`.
4. Store, service and route, plus the partners view.
5. The solvability proof.
6. Docs.

---

## 8. The real adapter: what maps to what

The real adapter is Claude's: `frontend/src/online/case-adapter/`.
- It must pass G7's conformance suite (`defineAdapterConformance`). That suite requires every refusal `reason` to be one of `caseReasons` in `contract.js`. The adapter runs it from day one on recorded server answers, which come from the pytest fixtures (`case_fixtures.py`), until G7's fixture harness exists.
- It implements G6's contract exactly:
  - `read`, `subscribe`, `dispose` and `tick` (a no-op);
  - every intent returns `{accepted, reason, message, view}`;
  - views have `schema: 1`.
- It owns the polling, the crew-room listener (A4's `live_crew_updated`), the countdown refetches and their cleanup. It must not expose `dev` helpers.

### 8.1 View parts

| G6 view part | Source | Notes |
|---|---|---|
| `mode` | adapter-made | `'online'` |
| `revision` | adapter-made | Starts at 1 and grows by 1 whenever the combined view's structure changes: the case, world, me and crew inputs with the clock keys of 3.8 removed. It never decreases. It is reset on a reload, which is fine because screens use it only within one lifetime. |
| `now` | `case.now` | |
| `captain {name, coins, save}` | A2: `GET /api/me` (`captainName`, `coins`) and A2's save routes | `coins` also comes from `case.me.coins` after a money intent |
| `arrival` | A3: the `POST /api/intro/complete` answer, then `GET /api/me` (`kit`, `place`) | The log card text from `readLog` |
| `crew`, `permissions` | A6: `GET /api/crews/me`; while the crew is active, `case.seats` | `joinPreview`: A6 has no preview step (open point 9) |
| `board.cards[]` | `case.board.cards` | `body` = `text`; `title`, `state`, `holders`, `pinnedBy` and `canPin` 1:1; `canPair` = the viewer may pair (a player seat in an active crew) **and** the card has a pin in effect. `foundSecond`, `routeId` and `hotspot` feed G7's log. |
| `board.deductions[]` | `case.board.deductions` | `title` = `name`; `complete` and `finding` 1:1; `clearedTitles` comes from `clears` plus the suspect titles, for complete deductions only, otherwise `[]`. `opens` maps the ids to labels: card ids to card titles, `nightfall` to "Nightfall", `accusation` to "The accusation". `ruin_light` is dropped while the ruin is not offered (the minimum). |
| `board` other fields | `case.board` | `suspects`, `canPair` and `pairWait` 1:1; `logLead` = `!!logLead`; `pairHelp` = adapter UI text "Pair two pinned cards. Two different seats must have pinned them." |
| `search` | `case.search` plus the spot map (8.3) | `activeSpot` is adapter-local (`inspectSpot` or the world interaction). `label` is the 8.3 label of the active spot. `clockLabel` is adapter-made, for example "Case minute 35". `allowSpotPicker` is false. `spots[]` are `{id, label}` from 8.3. `routes[]` for the active spot: `id`, `title`, `label`, `seconds` = `timerSeconds`, `price`, `kitName`, `canStart`, `statusText`. `jobs[]`: `id` = `routeId`, `title`, `total`, `remaining`, `done`, `report` = `foundLine`. |
| `partners[]` | `case.partners` | `seat` and `name` (the title); `archetype` is adapter-local art by kit (true_keeper navigator, witness cook, informant salvager, stranger deckhand). The status labels: `busy` and not `arrived` is "Travelling"; `busy` and `arrived` is "Working"; `on_duty` is "On duty"; `idle` is "Idle". `canOrder`, `orders` and `targets` 1:1; `job` = `{id: orderNo, order, total, remaining, done, report: line}`; `cards` = `satchel` as `{id, label: "C4 · Sealed crates"}`. |
| `finale` | `case.finale` and `case.me` | `phase`, `remaining`, `dawnRemaining`, `status`, `canCall` and `glow` 1:1. `chartDescription` is adapter-built ("Chart coordinates: north is up. Gold glow at x 251, y 38. The Keeper's lamp: x 95.5, y 168.75; …"). `materials` = `{coins: me.coins, timber: me.timber}`. `buildJobs` = `[]`, because L2 builds are instant. `lights[]`: `id`, `name`, `x`, `y` and `ready` 1:1; `bearing` = `lastBearing` until the player drags; `post` = `{seat, label, reserved: !onPost, remaining}`; `lock` = `{remaining}`; `canTake` and `canAim` 1:1; for the station, `canBuild` comes from L2's `GET /api/islet` (`canBuild` of the `islet_signal_station` spot); `buildLabel` = "Build signal station · 300 coins + 10 timber" from L2's cost. |
| `accusation` | `case.accusation` | `aboard` and `canBoard` are adapter-local (`boardSchooner`, C18). `allowed` = `case.accusation.allowed && aboard`. `evidence[].title` = `name`. |
| `reveal` | `case.reveal` (solvers only) | `index`, `total`, `canAdvance` and `done` are adapter-local. `line` = `{id, kind, title from kind, text, cites}`. `cards` are the crew's cards `{id, title}` from the board. |
| `world` | `GET /api/world` without `Authorization`; `404 feature_off` is the dark world | `stage`, `lightsOn`, `fogBankGone`, `gullsRestOpen` and `wall` 1:1. While `case.reveal.world` is `relit` and the fetched world is still `dark` (the 30 s cache), the adapter shows the relit stage for this player until the fetch catches up. `festivalRemaining`, `lanternColour`, `canClaimLantern` and `colours` are full version (Phase 3); until then 0, null, false and `[]`. |
| `effects` | adapter-made; ids grow per adapter lifetime | When `finale.phase` turns `success`: `three_lights {lights, target}` (from `finale.parted`), then `fog_lift` and `schooner_reveal`. The first `nextReveal` gives `unmask`. The last gives `relighting`, only if `reveal.world` is `relit` or `added`. Played effects are remembered as `{crewId}:{name}:{second}` (the second is `finale.parted.second` or `reveal.solvedSecond`) in `localStorage`, wrapped in try/catch, so a reload does not replay them. If storage fails, a replay is harmless. |
| `notice` | the last intent answer | |
| G7 `presence` | A4 | |
| G7 `account` | A2 | |
| G7 `rewards` | recent coins from the player's own `wallet_transactions` (supabase-js under RLS, or a later `GET /api/me/ledger`); credits from `case.credits` and `reveal.credits`; the Wall from `GET /api/world` | |
| G7 `log` | `case`: cards with `foundSecond`, `routeId` and `hotspot` (the 8.3 label names the place); deductions; nights from `finale`; and the reveal after the solve | |
| G7 `hints` ("What next?") | derived from the view only | |

### 8.2 Intents and reasons

| G6 intent | Route | Body |
|---|---|---|
| `completeIntro({ending, actions})` | A3 `POST /api/intro/complete` | `{actions}` |
| `createCrew()` | A6 `POST /api/crews` | |
| `joinCrew(code, {confirm})` | A6 `POST /api/crews/join` | `{code}` (preview: open point 9) |
| `muster()` | A6 `POST /api/crews/me/start` | |
| `pin(cardId)` | `POST /api/board/pin` | `{cardId, actionUid}` |
| `pair(a, b)` | `POST /api/board/pair` | `{cards: [a, b], actionUid}` |
| `search(routeId, {paidConfirmed})` | `POST /api/case/search` | `{routeId, paidConfirmed, expectedPrice, actionUid}` |
| `inspectSpot(spotId)` | adapter-local | sets the active spot through 8.3 |
| `orderPartner(seat, order, target, {allowPaid})` | `POST /api/crews/me/orders` | `{seat, order, target, allowPaid, actionUid}` |
| `buildLight('islet_signal_station')` | L2 `POST /api/islet/build` | `{plot: 'islet_signal_station', type: 'signal_station', actionUid}`, then re-read `GET /api/case` and `GET /api/islet` |
| `buildLight('ruin_light')` | Phase 2, full version | |
| `callNightfall()` | `POST /api/finale/nightfall` | `{actionUid}` |
| `takePost(lightId)` | `POST /api/finale/post` | `{light, actionUid}` |
| `aim(lightId, degrees)` | `POST /api/finale/signal` | `{light, bearing, actionUid}` |
| `boardSchooner()` | adapter-local (C18) | requires `case.accusation.schoonerFound`, otherwise `schooner_required` |
| `accuse(suspectId)` | `POST /api/case/accuse` | `{suspect, actionUid}` |
| `nextReveal()` | adapter-local | pages `case.reveal.lines`; `reveal_unavailable` and `reveal_complete` locally |
| `claimLantern(colour)` | Phase 3 full: `POST /api/world/lantern` | until then refused locally as `festival_closed` |

**Repeats and unknown outcomes:**
- A case route's `200` with `repeat: true` is passed on as it is: `accepted` and `reason` come from the stored outcome. So a retried wrong accusation stays a refusal. The adapter's own test is "a repeat of a wrong accusation is still a refusal".
- A2's, A6's and L2's `409 already_applied`, `already_seated` or `already_started` becomes `accepted: true` plus a re-read. That is correct there, because they log only accepted actions.
- A 503 on a write: resend the same `actionUid` once after 1 to 2 s. A second 503 becomes `not_connected`.

**Reason mapping** (every refusal leaves the adapter as one of `caseReasons`):

| Server | Adapter reason |
|---|---|
| 404 `no_crew`, 409 `crew_not_started` | `crew_required` |
| 409 `crew_finished` | `already_solved` (re-read; the view shows the reveal) |
| 409 `crew_busy` | one silent retry with the same `actionUid`, then `not_ready` with the server's message |
| 409 `not_a_partner` | `npc_required` |
| 422 `paid_errands_off` | `order_not_allowed` |
| 422 `validation_error`, 404 `no_such_route`, 404 `no_such_card` | `invalid_request` |
| 404 `no_such_light` | `unknown_light` |
| 404 `no_such_suspect` | `unknown_suspect` |
| 404 `feature_off` | `feature_off` |
| 401 | `session_expired` (the G7 path) |
| 429 | `rate_limited` |
| 502 | `internal_error` |
| 503 (any code) | `not_connected` |
| `schooner_found` | `night_in_progress` for nightfall; `night_required` for post and signal |
| `price_changed` (full version) | `payment_confirmation_required` |
| L2: `plot_occupied`, `not_enough_timber`, `insufficient_funds`, `not_buildable_yet` | `already_built`, `materials_required`, `no_coins`, `not_ready` |
| every other case reason in this spec | the same name. They are all in `caseReasons`: `lead_locked`, `already_have`, `wrong_kit`, `locked_window`, `card_not_held`, `already_pinned`, `pair_cooldown`, `not_pinned`, `different_seats_required`, `wrong_pair`, `already_deduced`, `deduction_required`, `night_in_progress`, `dawn_wait`, `night_required`, `light_not_ready`, `post_taken`, `already_on_post`, `post_not_ready`, `post_not_owned`, `aim_cooldown`, `off_target`, `schooner_required`, `evidence_required`, `accusation_cooldown`, `accusation_refused`, `already_solved`, `busy`, `not_ready`, and the full-version route reasons |

Screens must branch only on documented G6 reasons. Partner reasons are shown as text.

### 8.3 Spot map

The registry holds G6 spots, and `case.json` holds hotspots. The labels are the hotspot names from `case.json`; the decoys have short labels.

| G6 spot (registry zone) | Case hotspot | Label | Routes shown there |
|---|---|---|---|
| `notice_board` | `saltreach_harbor.notice_board` | The reward notice board outside the Harbor Office | C1 |
| `ferry_pier` | `saltreach_harbor.ferry_pier` | The ferry pier, and the ferry clerk | C2 timed (paid later) |
| `satchel` | `anywhere.satchel` | Your satchel (inspect the brass key) | C3 |
| `back_room` | `smugglers_cove.back_room` | The smugglers' back room, and the doorman who guards it | C4 kit (paid later) |
| `low_tide_cave` | `smugglers_cove.low_tide_cave` | The cave under the cove, dry only at low tide | C4 timed |
| `salvage_yard` | `wreck_point.salvage_yard` | Greyfathom's salvage yard and its office | C5 kit |
| `yard_gate` | `wreck_point.yard_gate` | The salvage-yard gate | C5 timed |
| `beach` | `wreck_point.beach` | The wreck beach, where a dockhand copies manifests | C5 paid (later) |
| `keepers_post_room` | `saltreach_harbor.keepers_post_room` | The keepers' post room behind the Harbor Office | C6 kit |
| `harbor_office` | `saltreach_harbor.harbor_office` | The Harbor Office counter, and its day clerk | C6 timed (paid later) |
| `market_hall` | `saltreach_harbor.market_hall` | The market hall, with the Island Exchange board | C6 share (later, pending the Exchange rework) |
| `signal_station` | `saltreach_harbor.signal_station` | The coastguard's signal station | C7 |
| `watchtower_ruin` | `the_teeth.watchtower_ruin` | The old watchtower ruin | C8 (log reader later) |
| `home_driftline` | `home_islet.home_driftline` | Your driftline beach, where a sealed crate can wash up | C4 world (later) |
| `jail` | `saltreach_harbor.jail` | The harbor jail | continuity line |
| `harbor_office_window` | none | The Harbor Office window | decoy: "Nothing to find here." |
| `reef` | none | The reef | decoy: "Nothing to find here." |

- Light ids are the same in both places. `fog_bank` opens the accusation screen.
- The committed `case.json` already moved `C6.back_room` to `keepers_post_room` and `C5.yard_gate_timed` to `yard_gate`, so no adapter filter is needed any more.

---

## 9. Solvability proof and the negative test catalogue

### 9.1 The planner

`backend/server/tests/case_playthrough.py` is test code. It uses the **production pure rules** (`decide_route`, `decide_pin`, `decide_pair`, `decide_nightfall`, `decide_post`, `decide_signal`, `decide_accusation` and the npc decisions) on an in-memory snapshot. A tiny test-only `apply` mirrors each SQL write. If a rule refuses a planned step, the proof fails.

1. Fill the seats with A6's `partner_seats`, players first.
2. For D1 to D4 in order, give the two cards to two different seats. Try every ordered pair of seats and keep the earliest finish.
   - A player takes its own kit route, else an open route, else a timed route at the next open start minute. It pins when the card lands.
   - A partner gets `fetch` at the first minute whose window is open on arrival. Its pin lands at +15, or at +5 for a Witness partner's C2.
   - A player pairs as soon as both pins are in effect.
3. After D4:
   - One player seat owns a station (the fake `StationLookup`). The station price and the starter timber come from L2's `load_buildings()` (`building.level_one_cost(...)` and `catalogue.starter_timber`), never from copied numbers. The spend never exceeds the seat's kit coins or the starter timber.
   - Call nightfall.
   - Public lights: partners by `man_light`, or players by `takePost` when there are no partners. The station: any player.
   - When all are on post, lock exact bearings (from `schooner_position`) at t, t+10 and t+20.
4. Board the schooner and accuse the culprit from the data.
5. Assert:
   - the case is solved;
   - all 8 cards were found on kit, open or timed routes only;
   - each deduction's pins came from two different seats;
   - there was no `clue_purchase`;
   - coins went only to the station;
   - the `market` flag was off, and there were no world events.

### 9.2 Negative tests: each one fails a specific wrong implementation

| Test | Fails an implementation that… |
|---|---|
| `test_one_seat_can_never_form_a_deduction` | checks only "both cards pinned" |
| `test_a_pending_partner_pin_does_not_count_for_a_pair` | ignores `pinned_second` |
| `test_window_routes_open_only_inside_their_window` (boundary minutes) | is off by one at a window edge, or uses `<=` for the closing minute |
| `test_case_window_open_equals_python_window_open` (opt-in) | encodes the window differently in SQL and Python |
| `test_off_target_lock_is_refused_and_changes_nothing` (5.0 against 5.1 and 6; wrap at 0/360) | uses `<`, forgets the wrap, or forgets that chart y grows to the south |
| `test_schooner_is_seeded_by_the_crew_id_and_stays_within_20_units` | ignores the crew id, or places the schooner outside the 20-unit disc |
| `test_locks_must_overlap` (0/45/89 against 0/45/90) | counts every lock of the night |
| `test_a_lock_ends_when_its_seat_leaves_the_light` and `test_fewer_than_three_seats_never_part_the_fog` | lets one seat hop between lights, or counts lights without seats |
| `test_a_player_cannot_lock_another_players_light` | lets anyone lock any light |
| `test_one_station_built_by_any_player_readies_the_light_for_the_whole_crew` | lets only the station's owner man it (C19) |
| `test_wrong_accusation_only_costs_a_minute` (59 s against 60 s) | charges coins, clears cards, or forgets the wait |
| `test_gated_cards_wait_for_their_deduction` (with nightfall) | checks gates only in the browser, lets the log card skip D3, or allows nightfall before D1 |
| `test_rewards_are_paid_once_per_player` (pin, deduction and solve) | puts the crew id in a reward ref, or fails the pin, deduction or solve when the reward is a repeat |
| `test_world_relights_exactly_once` and scratch check W6 | updates the stage without `where stage = 'dark'`, or without the row lock |
| `test_a_solve_while_the_relight_lock_is_on_pays_its_rewards_and_leaves_the_world_dark` and `test_solves_made_while_locked_never_reach_the_wall_later` | reads the setting late, or replays locked solves |
| `test_relight_open_is_refused_outside_production` | trusts a convention instead of failing closed on preview or local |
| W9 (opt-in) | creates the Phase 1 hook with `create or replace` |
| `test_culprit_is_never_sent_before_the_solve` and `test_no_view_lets_a_client_find_the_culprit_by_elimination` | spreads data objects into the view (the G6 fake's shape), sends the `clears` of unformed deductions, or sends suspects' `refusedLine` |
| `test_a_card_text_is_not_sent_one_second_before_it_lands` | treats "has a `case_finds` row" as "holds" |
| `test_the_same_action_uid_twice_acts_once` and `test_a_repeat_is_answered_before_any_rule` | checks rules before the repeat, or relies on a wallet ref alone |
| `test_a_repeat_of_a_wrong_accusation_is_still_a_refusal` | answers every repeat as a success |
| `test_revision_never_decreases_and_changes_on_every_write_and_every_landing` and `test_time_alone_changes_only_the_clock_keys` | counts deletable rows, misses timed landings, or hides a countdown outside the clock keys |
| `test_a_stale_accusation_snapshot_is_read_again_and_retried_once` and C13 | pays a list built outside the crew lock |
| `test_a_refusal_calls_no_write_function` | writes a refused intent |
| `test_a_unique_violation_from_the_database_becomes_502` | lets A2's 23505 trap report a bug as `already_applied` |
| `test_partners_alone_never_create_a_deduction_or_solve_the_case` (beyond the 27) | gives partners a pair or accuse path |
| `test_a_partner_never_pays_unless_the_order_allows_paying` | calls `clue_purchase` without `allowPaid` |
| The linter mutations (4.11) | weaken any of L1 to L19 |

---

## 10. The 23 Nov minimum, the schedule and the cut list

| Phase | Minimum (by the freeze, Wed 18) | Full (after the M1 cut rule, or later) |
|---|---|---|
| 1 S3 | 12 routes (kit, open, timed), gates, journal, the accusation with the 60 s wait and the snapshot check, the solve share, the full reveal with four closing lines, the log line and `world`, the log lead, `GET /api/case`, **the host clock route**, the flag, the fail-closed `RELIGHT_OPEN`, linter L1 to L8, L10 to L12, L14, L15, L18 and L19, the opt-in database tests | Paid routes (`clue_purchase`), the log-reader route, the share route (pending the Exchange rework), the world route, epilogue lines, the Relighter title, `GET /api/case?crew=`, L13, L16 |
| 2 L3 | Pins with seat credit, pairing, first-card and deduction rewards (SQL), credits, nightfall, the 20-minute night and dawn, three lights (the L2 station, C19), 5-degree bearings, 90-second overlapping locks, the schooner, glow and target, nudges | The ruin light with its lens, board polish |
| 3 Relighting | `world_state` changed once, the lock, `world_solves`, the Wall of Lights, extra lights (a counter), `GET /api/world` behind the flag, `world_outcome` | The festival and lantern colours, the Keeper's Star; delisting and fees in L4 |
| 4 S4 | Fetch-and-pin (15 min), `man_light`, the kit rule proof, the Witness C2, four refusals, the line bank, `allowPaid` off, pins credited to the orderer, the 27 marked tests, the 69-mix proof | `search`, `pin`, `wait`, the other refusals, `payPrice`, paid errands, the takeover line |

**Schedule.** The phases must overlap; this plan is built on the review dates of roadmap v0.3.

| When | Work | Review | Migration batch applied after the review |
|---|---|---|---|
| Fri 6 | A2, A3 and A6 merge with their migrations. Phase 1 slices 1 and 2 start (pure; they need only `case.json` and A6's `seats.py`). The adapter starts on G7's conformance suite with recorded answers. | | |
| Sat 7 to Tue 10 | Phase 1 slices 3 to 5: migration, database tests, store, service, routes, the host clock route, and nudges if A4 merges. **Phase 2 and Phase 3 start in parallel** as soon as Phase 1's pure rules and migration file are final. They need the file on scratch Postgres, not on the project. | | |
| Wed 11 | | Part 1: S3 and L3 rules (Nils, 75 min) | Batch 1: `060000` (plus A4's `050000` if reviewed). Phase 1 code merges after it is applied. |
| Wed 11 to Fri 13 | Phase 2 and Phase 3 stores and routes; the L2 port slice once L2 merges. **Phase 4 starts once Phase 2's migration file is final.** | | |
| Sat 14 | | Part 2: routes, finale, world and rewards (Nils, 1.75 to 2.75 h) | Batch 2: `080000` and `090000` (and L2's `070000` if reviewed). Phase 2 and Phase 3 code merges after. |
| Sun 15 | | S4 and L2 (Nils, 2 h) | Batch 3: `100000` (and `070000` if not yet). Phase 4 code merges after. |
| Mon 16 | The case on the real routes: the adapter switches from recordings to the deployed build (flag `case` on there, `RELIGHT_OPEN` off). | The case on real routes (Nils, 1 to 2 h); X1 and G7 | |
| Tue 17 | The timed playtest with a crew of four (2.5 h, real time). The solo run with three partners on the deployed build, fast-forwarded with the host clock route. | | |
| Wed 18 | The freeze check at 17:00; the freeze at 18:00 | | |

**The Relighting at M2** is shown by W1 to W9 and the Phase 3 tests, never on the live project.

**The cut list, in this order, before anyone touches the three-light finale:**
1. The cinematics: the effects other than the reveal lines (Nils at S0: "cut the cinematics first").
2. The live `credits` view part (`reveal.credits` stays).
3. Partner job lines beyond `order_accepted` and `pinned_card` (`arrived`, `found_card`, `manning_light`, `beam_locked`, `case_solved`).
4. The Phase 4 tests beyond the 27 marked rows (the list in 7.10).
5. The log lead (`board.logLead`). The reveal's log line stays.

Never cut the three lights, the 12 routes, the accusation, the reveal, the rewards or the relight switch. A two-light finale needs Nils' OK (CASE-FILE section 1).

---

## 11. Docs and the decision entry

- **INTERFACES:**
  - routes in section 2 (and section 9 marked built);
  - the C3 changes for D009;
  - tables in section 4;
  - the flag `case` in section 8, now gating `GET /api/world` too;
  - the setting `RELIGHT_OPEN` (production only);
  - the case refusal reasons, the repeat answer (C2) and the new HTTP codes in the status table;
  - section 7: one paragraph next to A4's on the case's kinds (`case_changed`, `board_changed`, `partner_changed`), `{"version": writeRevision}`, the 1 s cut-off and the budget.
- **supabase/README:** the matrix rows, the function rows, and checks C1 to C14, N1 to N15, W1 to W9 and P1 to P10 as manual steps. Also how to run `case_sql/`.
- **docs/SETUP.md:** the relight step (3.10).
- **One decision entry**, "Case backend contracts", recording C1 to C20 and marking the pending ones.
  - Its number comes from the shared reservation list. D018 is claimed four times: by A2, A4, the story round (`dd2f1f2`) and the open-world worktree. A3 has D019, A6 D020, and L2 proposes D021. This spec uses **D027**, reserved by the binding G10 handoff on 6 Nov 2026.
- **The reservation lists:** Claude keeps the decision numbers and the migration timestamps (3.11) side by side, for example as a table under "Next entry" in `docs/DECISIONS.md`. Builders read them before they pick a number.
- **`backend/content/README.md`:**
  - a paragraph "How the server reads the case": the loader, the active route kinds, the load-time checks and the optional route `label`;
  - the corrected `chart` row (5.11).

---

## 12. Open points and contradictions found in the sources

1. **Decision numbers:** see section 11. One shared list fixes this for good.
2. **`GET /api/board`:** ROADMAP L3 still provides `GET /api/board`. This spec proposes `GET /api/case` (C3), and the team decides on Mon 9.
3. **The glow (C8):** CASE-FILE 10.5 says "the browser gets it only when the fog parts", while G6 draws `finale.glow` during the night. The fact for Nils is in C8: the glow is the answer either way, and copying gains nothing.
4. **The story text to correct:** CASE-FILE 10.7 and the content README still say a copied bearing "usually misses". The corrected sentences are in 5.11. The story owner approves them in the Phase 2 geometry pull request.
5. **The registry test:** only `anywhere` (with `journal` and `satchel`) is exempt now. The committed `case.json` already uses `keepers_post_room`, `yard_gate` and `home_islet.home_driftline`, which closes the earlier point.
6. **The G6 fake's leaks:** the fake sends deduction card pairs and the `clears` of unformed deductions, which lets a client find the culprit by elimination. The security audit also flags this (medium; the fix is in Codex's area, with G7). It has a player `busy` rule too. Neither is copied (3.7, C7).
7. **The share route:** pending the Exchange rework (D017 positions). Ask L4 for a "holds a position in company X" read. The data already uses `greyfathom-salvage`.
8. **Extra lamps:** CASE-FILE's minimum box puts "the 12 extra lamps" under "later", but the minimum test `test_world_relights_exactly_once` needs "one more light". This spec builds the counter in the minimum; the drawn lamps come later.
9. **The culprit's id:** CASE-FILE test 14 says no answer contains "the culprit's id". The accusation must list all four suspect ids, so the test checks that nothing marks the culprit (3.7).
10. **A6 join preview:** A6 has no preview step, but G6's `joinCrew(code, {confirm})` and NPC-PARTNERS 7.1 step 3 expect one. A6 could add `{"code", "preview": true}`.
11. **The L2 dependency:** without L2 on `main`, production cannot finish the finale. L2's code is done in its worktree; its migration was still changing at 23:49.
12. **Decided by Nils on 6 Nov 2026:** C4 (no clock pause), C6 (partner pin reward at acceptance), C9 (locked solves never reach the Wall), C16 (contributors on the Wall), C18 (boarding is presentation). C8 (the glow) retains the built default pending Nils or the story owner.
13. **For the team on Mon 9:** C1, **C2 with its consequence** (a 409-style repeat turns a retried refusal into a success), C3 and C11.
14. **A4:** its spec and code exist. Ask the A4 owner to correct "Who calls it later":
    - S3 sends `case_changed` for searches, accusations and host clock moves;
    - L3 sends `board_changed` for pins, pairs, nightfall, posts and locks;
    - S4 sends `partner_changed` **at order acceptance, not when an errand finishes**;
    - timed landings and the Relighting send no crew event (no background job; the world is polled), so `finale_changed` is unused by the case.
15. **A4's timeout:** the case cuts each send at 1 s (`asyncio.wait_for`) inside A4's own 2 s HTTP timeout.
16. **The station's reads:** `GET /api/case` makes up to two extra L2 reads (stations and timber) per poll for an active crew. That is acceptable at the budgets of 3.9. Revisit only if the function budget gets tight.

---

## 13. What each builder reports

- **Changed:** every file.
- **Verified:** the exact gate commands and their result lines, the pglast parse, and the `case_sql/` PASS lines of the phase.
- **Not verified:**
  - live PostgREST embeds and the RPC array arguments;
  - the deployed nudges;
  - the edge cache hit on `GET /api/world`;
  - the registry Node test, if it was skipped;
  - anything Claude checks after applying.
- **Remaining.**
- **Branch.**
- Confirm that no file outside the phase's scope was touched, that no migration adds a wallet reason, and that no timestamp or decision number was taken outside the reservation lists.

---

## 14. Process notes (for the controller)

- **Rules followed:**
  - No skill was used. Per the brief I did not run task-observer and wrote nothing under `~/Claude/task-observer`.
  - Nothing in any repository or project folder was created or changed.
  - My computations were an in-memory Python simulation (copied bearings, glow error) and a pglast parse with `uv run --no-project --with pglast python -`, with the SQL on stdin. No files were written, and no database was run.
- **Sources moved while I worked:**
  - The story round was committed as `dd2f1f2` at 00:08. CASE-FILE and `case.json` changed until 00:05, and I re-read every number from the committed files.
  - A2/A3 and A6 were committed at 23:48.
  - `main` moved to `606ee4a`, and G7's branch to `acdfbf8`.
  - L2's migration changed at 23:49, so it is mid-edit. Re-check its function names before the L2 port slice.
- **Possibly worth logging:**
  1. The review's process notes held up. Before numbering anything I ran `git worktree list` and checked every sibling's `specs/` and `supabase/migrations/`. That check found that D018 is claimed by four branches. Decision numbers and migration timestamps need one shared reservation list.
  2. A consumer-side contract that no reviewer named mattered. G7's conformance suite requires every refusal reason to be in `caseReasons`, and several server reasons were not. A spec that maps a server onto a client contract should run the client's own conformance rules against its reason list.
  3. Numbers in a review also need the quick recheck. The review quoted A4's send timeout as 5 s, while the code and spec say 2 s. Its "at most 0.27 degrees" holds for its 200-crew sample, while anywhere in the disc the error reaches about 0.35. Neither changes a conclusion.
  4. Following the data beat following the review's SQL in one place: `case.json` counts a partner pin for credit from its order, not from its landing (C17). The review's suggested filter `pinned_second <= now` would have under-paid the orderers of pending partner pins.

---

## 15. Rejected or adjusted review items

None was rejected outright. Where the review offered two fixes, or where a detail needed correcting:

1. **Revision (high):** I took the adapter-made view revision plus the server `writeRevision`, and did not build the server-side count of boundaries. Pair and accusation waits are overwritten in place, so a count over them could stay equal across a write unless more history were stored. Append-only posts and the boundary test were applied as asked.
2. **Repeats (medium):** I took `200` rebuilt from the stored outcome (N8). The alternative was a 409 carrying the outcome, but the standard error shape carries only `code` and `message`, so that would mean changing a shared module.
3. **`GET /api/world` before its migration (medium):** I took the flag gate, plus the section 0 rule. The other option was a fallback on "relation not found", but `supabase_admin` raises `SupabaseRejected` without the database code, and teaching it that code touches a shared module.
4. **`board_pair` rewards (low):** computed in SQL as asked, but from `ordered_second` instead of `pinned_second <= now`, to match `case.json`'s `part_of_a_deduction` (C17).
5. **`case_accuse` payouts (low):** I took the snapshot check (`state_changed`, retried once). Recomputing in SQL was the other option, but Phase 1's function cannot read Phase 2's tables. The check is exact because credit now depends on rows only (C17).
6. **The A4 timeout detail:** the code says 2 s, not 5 s. The case's 1 s cut-off applies either way.
7. **The glow bound:** 0.27 degrees holds for the 200 sampled crews. Anywhere in the disc it reaches about 0.35 (bound 0.41). The conclusion for C8 stands.
