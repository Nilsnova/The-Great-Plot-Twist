# Implementation spec: A2, A3 and A6 (M1 backbone)

**For:** the Sonnet builders (A2, then A3, in worktree W1 `/Users/nilslenke/Developer/The-Great-Plot-Twist-a2a3`; A6 in parallel in W2 `/Users/nilslenke/Developer/The-Great-Plot-Twist-a6`, both from `main` 8d0a718), and Claude, who merges.
**M1 target (Fri 13):** Act 1 plays to an ending, the referee grants a kit, and a crew forms with an NPC partner in an empty seat.
**Written from:** ROADMAP.md (A1, A2, A3, A6, S3, S4, L3, milestones, decision log), AGENTS.md, CONTRIBUTING.md, docs/ENGINEERING.md, INTERFACES.md, ARCHITECTURE.md, DECISIONS.md, STORY.md, supabase/README.md, both migrations, backend/server (app, auth, supabase_admin, wallet, errors, flags, settings, routes/me.py and its tests, routes/market.py, market/store.py), backend/plot_twist/engine.py, backend/content/story.json, and the story drafts (CASE-FILE.md section 3, STORY-V2-CHANGES.md, NPC-PARTNERS.md sections 4 and 7, content/case/case.json).

**What I checked while writing (nothing in the repo was changed):**
- The SQL in this spec parses with pglast, including the PL/pgSQL bodies.
- In my scratchpad I ran a throwaway Postgres: 16.2 from the PyPI wheel `pgserver`, because this machine has no `psql` and no Postgres 17 of its own. On it I applied foundation, exchange and the three migrations of this spec twice, then ran 41 behaviour checks. All passed: names, re-roll, save versions, save size, kit paid once, crew create, code guessing limit, joining, the muster, the draft give-up, the delete with crew handover, and that players cannot run the functions. The server and its data folder were removed afterwards.
- Every Act 1 route and claim below was replayed on the real `engine.py` and `story.json`. That covers 122 reachable states and 8 end states, the same with `keep_quiet` added; `keep_quiet` is refused on today's story; a 300-move log is accepted.
- The partner kit rule matches the NPC-PARTNERS.md 4.4 examples table and holds for all 69 kit mixes and all 256 takeover chains.

---

## 0. Rules for the builders (recap)

- **Git:** never commit, push, stash, reset, switch or create branches. Leave every change uncommitted. Work only inside your worktree.
- **Safety:** never connect to the real Supabase project and never open `.env`. Tests use fakes, and `backend/server/tests/conftest.py` keeps refusing network connections. A migration is applied only on a private scratch Postgres (section 7) that you stop afterwards.
- **Out of scope, never touch:** `vercel.json` (never add `crons`), `docs/STATUS.md`, `ROADMAP.md`, any existing file in `supabase/migrations/`, and `frontend/`. The one exception is W1/A2: `frontend/src/online/` plus two new test files (see flag F1). Do not build a sign-in button or any sign-in UI.
- **Conventions:**
  - One job per file, and a plain-English header comment in every file.
  - Functions of about 20 lines.
  - Errors through `ApiError(status, code, message)`, so every error has the shape `{"error": {"code", "message"}}`.
  - JSON in camelCase.
  - No em or en dashes anywhere you write: code, comments, docs, SQL.
  - Row-level security and explicit grants on every new table. Only the server writes.
  - Coins move only through `apply_wallet_transaction`. The ledger is unique on (player, reason, ref).
  - `create_app` takes new services by keyword only. **No package in this spec needs a new `create_app` parameter**, so leave the signature as it is.
- **ruff B008:** a function call in an argument default is refused. Write `SYSTEM_RANDOM = secrets.SystemRandom()` as a module constant and use `rng: random.Random = SYSTEM_RANDOM`.
- **Wallet-reason test traps:** `backend/server/tests/test_wallet_matches_migration.py` scans every migration.
  - Never write the text `insert into public.wallet_reasons` in a new migration, not even in a comment.
  - Never write `update`, `delete from` or `truncate` followed by `wallet_reasons`.
  - None of the three migrations adds a wallet reason.
- **Gates before you report:**
  - `cd backend && uv run pytest -q`: all pass.
  - `uv run ruff check .`: clean.
  - `uv run ruff format --check <every Python file you changed>`.
  - The pglast parse from ENGINEERING.md 4.2 step 9.
  - The scratch apply twice, plus your behaviour checks (section 7).
  - W1 only: `cd frontend && npm ci` once if `node_modules` is missing (locked versions, nothing new), then `npm test`.

---

## 1. Decisions this spec makes, and what waits for Nils

Each item is built as the recommended default. Builders mark the "pending" items in code (a `# PENDING Nils' decision (...)` comment next to the constant or rule) and in docs (the decision entry says "pending").

| # | Topic | Built default | Who decides |
|---|---|---|---|
| N1 | Story decision 10: which kit a seat carries after a friend takes over a partner | The friend keeps their own kit (`crew_seats.kit` becomes the friend's kit) | Nils (pending; decided as built in the story round: D018, decision 10) |
| N2 | Story decision 12: the order in which partners fill missing kits | `informant, stranger, true_keeper, witness` (NPC-PARTNERS.md 4.2). **CASE-FILE.md sections 3 and 9 still say True Keeper, Informant, Stranger, Witness.** The story branch must fix CASE-FILE (NPC-PARTNERS.md section 11 already asks for it). | Nils (pending; decided as built in the story round: D018, decision 12, a team call confirmed at kickoff. The story round also fixed CASE-FILE.md) |
| N3 | When partners are seated | At the muster: a new route `POST /api/crews/me/start` moves the crew from `forming` to `active` and fills every empty seat. Partners at crew creation were rejected (no open seat would ever exist, so "open seat first" would be meaningless, and S4 7.1 assumes a forming crew has no partners). Partners at case start were rejected (S3 is M2, but M1 needs a partner). | Nils (recommendation; adds a 4th A6 route) |
| N4 | `DELETE /api/me` | Deletes the login and every row of the player, ledger included. Crews the player started that have other players are handed to the player in the lowest seat. Details in A2.5. Touches personal data, so per ENGINEERING section 1 the team must agree. | Nils (pending) |
| N5 | Kit coins | true_keeper 1000, witness 1000, informant 1000, stranger 1600, from the S0 drafts (CASE-FILE.md section 3). `entry_kits.json` becomes the source of truth. | Nils, with the S0 approval |
| N6 | The first Act 1 ending counts | A second playthrough never changes the kit, and pays nothing | Nils (recommendation) |
| N7 | A kit before a crew | Creating or joining a crew needs an entry profile (Act 1 finished) | Nils (recommendation) |
| N8 | Crew codes and the guessing limit | 6 characters from a 31-symbol alphabet (no 0 O 1 I L); at most 10 wrong codes per player in 10 minutes, counted in the database | Team (D020) |
| N9 | Captain names | Adjective, noun and a number from 10 to 99; one re-roll. **The word lists (A2.3) need a human look**, because names appear on a projector. | Nils or the S lane |
| N10 | Hosts | `HOST_PLAYER_IDS` (Supabase user ids, comma separated). Nils puts his own id in the Vercel settings. | Nils (sets the value) |
| N11 | Sign-in approach | Not built. `session.js` keeps the token in memory only, so a reload means signing in again; the sign-in package decides about persistence. D006 says the sign-in part is pending. | Nils (pending, already open) |
| N12 | Save size | 100,000 bytes of compact JSON checked in Python, plus an exact check in the database at the existing 200,000-byte limit | Team |

**Flags for the controller (not Nils):**

- **F1.** Vitest only finds `frontend/tests/**/*.test.js` (`frontend/vite.config.js`). The A2 tests therefore have to be two **new** files outside `frontend/src/online/`: `frontend/tests/online-api.test.js` and `frontend/tests/online-session.test.js`. No existing frontend file is touched. Please allow it, or accept untested modules.
- **F2.** `frontend/src/net/` already exists (`weather.js`). The brief says `frontend/src/online/`, so this spec uses that. The two folders can merge later.
- **F3.** `test_me.py` asserts the exact answer and the exact list of reads, so A2 and A3 must change some of its expectations on purpose (listed in A2.8 and A3.8). Every change only **adds** expectations; none is removed or loosened. Each carries a `# Changed on purpose (A2|A3): ...` comment.
- **F4.** A6 (in W2) reads `public.entry_profiles`, a table A3 creates in W1. The contract is fixed in section 2.3. A6 tests use fakes. The crew routes only work on the project once both migrations are applied.
- **F5.** The routes added here that change state have no `actionUid` where state already makes a repeat harmless (name assignment, intro, crews). The re-roll does carry one. Section 2.5 lists the behaviour of each. Worth a line in INTERFACES section 11 at the Mon 9 review.
- **F6.** Not verifiable by builders: that `delete_player()` may delete from `auth.users` on Supabase (it runs as `postgres`, SECURITY DEFINER), PostgREST's nested embed used by A6, and A3's "works on a preview". Claude checks these after applying (A2.10 step N6, A3 acceptance, A6 step C8).

---

## 2. Cross-package contracts

### 2.1 Migrations

| File | Package | Depends on | Adds |
|---|---|---|---|
| `20261106020000_accounts.sql` | A2 | foundation | table `captain_name_rerolls`; functions `assign_captain_name()`, `reroll_captain_name()`, `save_progress()`, `delete_player()`; new comment on `saves.version` |
| `20261106030000_entry_profiles.sql` | A3 | foundation | table `entry_profiles`; function `grant_entry_kit()` |
| `20261106040000_crew_codes.sql` | A6 | foundation | columns `crews.code`, `crews.version`, `crews.started_at`; check `crew_seats_kit_allowed`; unique indexes for one seat per player and one per partner; table `crew_join_failures`; functions `crew_create()`, `crew_find_by_code()`, `crew_take_seat()`, `crew_start()` |

Each one applies on foundation plus exchange alone. None references another's objects (A6 receives the kit from Python, see 2.3). All three are safe to run twice.

### 2.2 Decision numbers (pre-assigned to avoid renumbering)

| ID | Title | Written by | Where in `docs/DECISIONS.md` |
|---|---|---|---|
| D006 | Identity: generated captain names, no free text | A2 (W1) | directly above `## Next entry` |
| D022 | Account data: cloud save versions, delete my data, hosts | A2 (W1) | after D006 |
| D019 | Referee and entry kits | A3 (W1) | after D022 |
| D020 | Crews: codes, guessing limit, partners at the muster | A6 (W2) | directly after the D012 entry (before `## D005 · Look`) |

D006 is the number ROADMAP.md reserves for A2. D018 to D020 are "the next free numbers after D017". If another branch takes them first, Claude renumbers at merge. The story round took D018, so the account entry became D022 at merge; D019 and D020 kept their numbers.

### 2.3 Shared ids and the entry_profiles contract

- **Kit ids:** `true_keeper`, `witness`, `informant`, `stranger`. They live in `backend/content/entry_kits.json` (A3), `KITS` in `backend/server/crews/seats.py` (A6), and the SQL checks `entry_profiles_kit_allowed` (A3) and `crew_seats_kit_allowed` (A6). Claude adds a merge-time parity test (section 6.3).
- **Decisions:** `warned` (flag `warned_harbor`), `trusted` (flag `trusted_fisherman`), `none`. **Endings** are scene ids: `ending_rescue`, `ending_trapped`. **Start places** are ids of `frontend/src/world/places/registry.js`: `lighthouse_isle`, `saltreach_harbor`.
- **`public.entry_profiles`** (A3 creates it, A6 and A2's `GET /api/me` read it): primary key `player_id uuid` (references `profiles(id)` on delete cascade); `kit text not null` (one of the four ids); `start_place text not null`; `service_role` has `select`. A6 reads exactly `entry_profiles?select=kit&player_id=eq.<id>&limit=1`. A3's `GET /api/me` reads `select=kit,start_place`.

### 2.4 How the new database functions answer

They follow the pattern of `market_trade()`: they **return** `jsonb` with `{"status": ...}`, and `{"status": "refused", "reason": ...}` when a rule says no and nothing changed. They **raise** only for server bugs (bad arguments), which come back as `502 database_error`.

One trap: `supabase_admin.read_reply()` turns **any** Postgres 23505 (unique violation) into `409 already_applied`. In every new store module, catch `AlreadyApplied` around these calls and re-raise `SupabaseRejected` (502), with a comment saying so. In these functions a unique violation can only mean a server bug, never a repeat.

Times returned by the database (`updatedAt`, `startedAt`) are converted to UTC and whole seconds in Python (`moment.astimezone(UTC).replace(microsecond=0)`). The scratch server returned `+01:00` local time.

### 2.5 Safe repeats per route

| Route | A repeat |
|---|---|
| `POST /api/me/name` | Changes nothing: the name is assigned only while the placeholder is there. Answers 200 with the same name. |
| `POST /api/me/name/reroll {actionUid}` | Same `actionUid`: `409 already_applied`. Any later re-roll: `409 no_rerolls_left`. |
| `PUT /api/save {version, data}` | The version is the guard. A repeat finds the version moved on: `409 stale_save`, nothing changed. |
| `DELETE /api/me {confirm}` | 200 again while the token still works (the deletion is already done); afterwards 401 or 404. |
| `POST /api/intro/complete` | 200 with the stored profile, `coinsPaid: 0`, `alreadyGranted: true`. |
| `POST /api/crews` | 200 with the same draft crew (the player sits alone in a forming crew they started). |
| `POST /api/crews/join` | `409 already_seated` (treat as done). |
| `POST /api/crews/me/start` | `409 already_started` (treat as done). |

### 2.6 New error codes (all in the standard shape)

| Status | Codes |
|---|---|
| 403 | `forbidden` (require_host) |
| 404 | `player_not_set_up` (existing; reused), `wrong_code`, `no_crew` |
| 409 | `stale_save`, `already_applied`, `no_rerolls_left`, `no_name_yet`, `kit_needed`, `already_in_crew`, `crew_full`, `crew_finished`, `already_seated`, `already_started`, `crew_busy` |
| 422 | `validation_error` (existing), `save_too_big`, `save_not_json`, `move_refused`, `no_ending` |
| 429 | `too_many_requests` with `Retry-After` (wrong crew codes) |
| 503 | `intro_unavailable`, `crew_codes_busy`, plus the existing `database_unavailable` |

---

## 3. Package A2: captain names, cloud progress, delete my data, hosts, the API client

### 3.1 Scope

- **Minimum (first):**
  - Generated captain names, without re-roll.
  - `GET /api/me` gains `captainName`, `kit` and `place`. `kit` and `place` are `null` until A3 wires them.
  - `GET /api/save` and `PUT /api/save`.
  - `require_host` with `HOST_PLAYER_IDS`.
  - `frontend/src/online/api.js` and `session.js` with Vitest tests.
  - The migration (complete from the start: a migration is never edited after merging).
  - D006.
- **Full (cheap, same worktree):** one re-roll, `DELETE /api/me`, D022.
- **Not built:** the sign-in button, any sign-in UI, the "Saved" indicator, a delete button (all UI), and the Supabase JS library.

`GET /api/save` is added beyond the reserved names, because "resume on a second device" needs a way to read the save without the Supabase JS library.

### 3.2 Files

**Create:**

| File | Job |
|---|---|
| `backend/content/names.json` | the word lists (A2.3) |
| `backend/server/hosts.py` | `require_host(player, settings)`, `get_current_host`, `HostDep` |
| `backend/server/account/__init__.py` | package docstring listing the four files below |
| `backend/server/account/names.py` | pure rules: load and check the word lists, placeholder, pick a name, pick a different name |
| `backend/server/account/name_store.py` | database calls: `read_current_name`, `assign_name`, `reroll_name` |
| `backend/server/account/saves.py` | the save size rule plus `read_save` and `write_save` |
| `backend/server/account/deletion.py` | `delete_player(admin, player_id)` |
| `backend/server/routes/captain_name.py` | `POST /api/me/name`, `POST /api/me/name/reroll` |
| `backend/server/routes/save.py` | `GET /api/save`, `PUT /api/save` |
| `backend/server/routes/delete_me.py` | `DELETE /api/me` |
| `supabase/migrations/20261106020000_accounts.sql` | A2.6 |
| `frontend/src/online/session.js`, `frontend/src/online/api.js` | A2.7 |
| `backend/server/tests/account_helpers.py` | a fake database that answers table reads (`column=eq.value`) and `POST /rest/v1/rpc/<name>` from a dict of reply functions |
| `backend/server/tests/test_host_settings.py`, `test_hosts.py`, `test_captain_names.py`, `test_captain_name_routes.py`, `test_saves.py`, `test_delete_me.py`, `test_accounts_match_migration.py` | tests (A2.8) |
| `frontend/tests/online-session.test.js`, `frontend/tests/online-api.test.js` | flag F1 |

**Change:**
- `backend/server/routes/me.py` (three new fields and its header comment)
- `backend/server/tests/test_me.py` (A2.8)
- `backend/server/settings.py`
- `backend/server/app.py`
- `backend/server/__init__.py`, `backend/server/routes/__init__.py`
- `.env.example`
- `backend/content/README.md`
- `docs/INTERFACES.md`, `docs/DECISIONS.md`, `supabase/README.md`

### 3.3 Hosts and names

**`HOST_PLAYER_IDS`** (settings.py):
- New field `host_player_ids: frozenset[str] = field(default_factory=frozenset)`, a docstring line after `MARKET_MULTIPLIER`, a reader `read_host_player_ids(env)` after `read_market_multiplier`, and one line in `load_settings`.
- The value is comma separated. Empty pieces are ignored. Each piece must parse as `uuid.UUID` and is stored as `str(uuid.UUID(piece))` (lowercase).
- A bad piece stops the server: `SettingsError("HOST_PLAYER_IDS item 2 is not a player id. Copy the User UID from Supabase, Authentication > Users.")`. The value itself is not echoed.
- `.env.example`: a new block after the `MARKET_MULTIPLIER` block, before `VITE_SUPABASE_URL`:
  ```
  # [SERVER ONLY] Player ids (Supabase User UIDs, comma separated) of the hosts who may use presenter routes. Not a password, but the browser never needs it, so it stays on the server. Empty means nobody is a host and every presenter route answers 403.
  HOST_PLAYER_IDS=
  ```

**`hosts.py`:**
- `require_host(player: Player, settings: Settings) -> Player` raises `ApiError(403, "forbidden", "Only a host can do this.")` unless `player.id in settings.host_player_ids`.
- `async def get_current_host(player: PlayerDep, settings: SettingsDep) -> Player` calls it.
- `HostDep = Annotated[Player, Depends(get_current_host)]`. Login is checked first, so a missing token is 401, not 403.
- No production route uses it yet; L3's presenter routes will.

**`backend/content/names.json`** (camelCase keys like `companies.json`; server only, never on `PUBLIC_CONTENT`):
```json
{
  "about": "Word lists for generated captain names (package A2, D006). A name is an adjective, a noun and a number from 10 to 99, for example Brave Puffin 17. Names appear on a projector: every word must be kind and plain. One word each, letters A-Z only, first letter capital. Changing a list never renames a player.",
  "adjectives": ["Bold", "Brave", "Bright", "Calm", "Clever", "Daring", "Eager", "Fair", "Fearless", "Gentle", "Golden", "Hardy", "Honest", "Jolly", "Keen", "Kind", "Lucky", "Merry", "Mighty", "Misty", "Nimble", "Noble", "Patient", "Plucky", "Quick", "Quiet", "Silver", "Steady", "Stormy", "Sturdy", "Sunny", "Swift", "Tidy", "Trusty", "Valiant", "Wandering", "Windy", "Wise", "Witty", "Zesty"],
  "nouns": ["Albatross", "Anchor", "Barnacle", "Beacon", "Buoy", "Compass", "Coral", "Cormorant", "Crab", "Dolphin", "Driftwood", "Gannet", "Gull", "Heron", "Herring", "Keel", "Kelp", "Kittiwake", "Lantern", "Lighthouse", "Lobster", "Mackerel", "Mast", "Narwhal", "Oar", "Otter", "Pearl", "Pelican", "Petrel", "Puffin", "Rudder", "Sail", "Seal", "Shell", "Starfish", "Tern", "Tide", "Walrus", "Whale", "Wave"]
}
```
40 × 40 × 90 = 144,000 names. The longest is "Wandering Lighthouse 99", 23 characters, inside the 24-character limit of `profiles.display_name`. Bird names with slang meanings (booby, shag) are left out on purpose.

**`account/names.py`:**
- Constants: `NAMES_PATH = CONTENT_DIR / "names.json"`, `PLACEHOLDER_PREFIX = "Captain-"`, `PLACEHOLDER_ID_LENGTH = 6` (equal to `c_id_length` in `handle_new_user()`), `LOWEST_NUMBER = 10`, `HIGHEST_NUMBER = 99`, `MAX_REROLLS = 1`, `WORD_PATTERN = r"[A-Z][a-z]{1,11}"`, the display-name rules (2 to 24 characters, `[A-Za-z0-9 _.-]+`, trimmed), `SYSTEM_RANDOM = random.SystemRandom()`.
- Frozen dataclass `WordLists(adjectives, nouns)`.
- `load_word_lists(path=NAMES_PATH) -> WordLists` raises `ValueError` with a clear message for a bad word, a duplicate, or fewer than 32 words per list.
- `placeholder_name(player_id) -> str` returns `"Captain-" + player_id[:6]`. `is_placeholder(name, player_id) -> bool`. `is_valid_display_name(name) -> bool`.
- `pick_name(words, rng=SYSTEM_RANDOM) -> str`.
- `pick_new_name(words, current, rng=SYSTEM_RANDOM) -> str` picks a name and, if it equals `current`, moves the number on by one (99 wraps to 10). The result is never `current` and needs no loop.

### 3.4 Routes

All routes below need sign-in (`PlayerDep`). The player id always comes from the verified token. Every answer carries `Cache-Control: private, no-store`. 503 answers `auth_*` and `database_*` and 502 `database_error` behave as in `routes/me.py`.

**`GET /api/me`** (extended; the existing fields and behaviour stay exactly as they are):
```
200 {"id": "3fa85f64-...", "displayName": "Brave Puffin 17", "coins": 0, "crews": [],
     "captainName": "Brave Puffin 17", "kit": null, "place": null}
```
- `captainName` is `displayName` unless that is still the placeholder (then `null`). Worked out in Python with no extra read.
- `kit` and `place` stay `null` until A3.
- GET makes **no write**: no lazy naming.

**`POST /api/me/name`** (no body; idempotent):
```
200 {"captainName": "Brave Puffin 17", "rerollsLeft": 1}
```
Flow:
1. `name = pick_name(words)`.
2. `assign_name(admin, player.id, placeholder_name(player.id), name)` calls `assign_captain_name()`.
3. Answer with the name the database returns: the new name, or the existing one if the player had one already.

`rerollsLeft = MAX_REROLLS - rerollsUsed`. A `missing` status gives `404 player_not_set_up`.

**`POST /api/me/name/reroll`**:
```
{"actionUid": "r8x2k9m4"}      (8 to 64 characters of A-Z a-z 0-9 _ -, extra fields forbidden)
200 {"captainName": "Calm Gannet 42", "rerollsLeft": 0}
```
Flow:
1. `current = read_current_name(...)`, which gives 404 `player_not_set_up` if there is no row.
2. `new = pick_new_name(words, current)`.
3. `reroll_name(...)` calls `reroll_captain_name()`.

Reasons map to: `already_applied` → `409 already_applied`; `no_rerolls_left` → `409 no_rerolls_left` ("You already used your one re-roll."); `no_name_yet` → `409 no_name_yet` ("Get your captain name first."); `missing` → 404. A bad `actionUid` is 422 and calls nothing.

**`GET /api/save`**:
```
200 {"version": 3, "data": {...}, "updatedAt": "2026-11-06T10:15:02Z"}
```
Read: `saves?select=version,data,updated_at&player_id=eq.<id>&limit=1`. No row gives `404 player_not_set_up`.

**`PUT /api/save`**:
```
{"version": 3, "data": {"intro": {"scene": "shore"}, "settings": {"sound": true}}}
200 {"version": 4, "updatedAt": "2026-11-06T10:15:30Z"}
```
- `version` is `StrictInt`, from 1 to 2147483647 (`MAX_SAVE_VERSION`, the largest number of the database column; changed after the review of W1, finding 2): the version the browser last read.
- `data` is `dict[str, Any]`, so a list, text or null is refused with 422. Extra fields are forbidden.
- Python checks first, through `account/saves.py`:
  - `json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")`.
  - NaN or Infinity gives `422 save_not_json`.
  - More than `MAX_SAVE_BYTES = 100_000` gives `422 save_too_big`.
- Then `save_progress()` answers:
  - `saved` → 200.
  - `stale` → `409 stale_save` ("Your save changed on another device. Load the newest save, then save again."), nothing changed.
  - `too_big` → `422 save_too_big`.
  - `missing` → 404.

The database check is needed: a 5.6 KB JSON of large numbers grew past 200 KB in `jsonb` text on the scratch run.

The server never trusts the save for coins, kits, names or crews. It is the browser's own progress (local Act 1 state, settings).

**`DELETE /api/me`**:
```
{"confirm": true}               (Literal[True]; missing or false gives 422 and deletes nothing)
200 {"deleted": true}
```
`deletion.delete_player()` calls `delete_player()`; both `deleted` and `not_found` answer 200. A 503 means "outcome unknown": the message says "We could not confirm the deletion. Try again: deleting twice is safe." Log one line without the player id.

The verifier cache may accept the old token on that server instance for up to 60 seconds. During that time reads answer `404 player_not_set_up`. This is documented and accepted.

**What `DELETE /api/me` deletes, and what the ledger keeps (decision N4, D022):**
- **It deletes:**
  - The login (`auth.users`, with Supabase's own identities and sessions).
  - By `on delete cascade`: the profile, the save, the wallet, **all of the player's ledger rows**, their seats, Exchange positions and trades, the name re-roll, the entry profile (A3), the crew-code failures (A6), and every crew the player started that nobody else sits in.
  - A crew the player started that another player sits in is first **handed to the other player in the lowest seat**, so friends keep their game. The deleted player's seat becomes an open seat, and A6's join fills open seats first.
- **The ledger keeps nothing about the player.** Why:
  - The coins are play money: nothing real is owed, so no record must be kept.
  - No other player's balance depends on those rows; each row changes only its own wallet.
  - "Delete my data" must really delete. A pseudonymous ledger kept on would still be linked to an account id.
  - The foundation already chose cascade ("rows disappear only when their player is deleted", D004 and D012). Keeping rows would need a tombstone profile and break that model.
  - Shared world state (`market_bases`) holds no player data.
- **Rule for every later package** (written into D022): a table that holds a player id references `profiles(id) on delete cascade`. If a row must outlive the player, it uses `set null` on a nullable column, so `DELETE /api/me` stays complete without changes.

### 3.5 SQL: `supabase/migrations/20261106020000_accounts.sql`

Write it in the style of the foundation file:
- A header block (WHAT IT DOES, WHO USES IT, SAFE TO RUN TWICE, HOW THE FILE IS ORGANISED).
- A plain-English comment above every statement group.
- `comment on` for the table, every column, the policy and every function.

The core, as checked on the scratch database:

```sql
comment on column public.saves.version is
  'How many times the save was written, starting at 1 (the empty save from sign-up). PUT /api/save sends the version it last read; save_progress() writes only if the save still has that version and then adds 1, so an older copy on a second device cannot overwrite newer progress. Only save_progress() changes it. (Changed meaning, migration 20261106020000: it is no longer a format version.)';

create table if not exists public.captain_name_rerolls (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  action_uid  text not null,
  rerolled_at timestamptz not null default now(),
  constraint captain_name_rerolls_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$')
);
-- The primary key is the database's own guard for "one re-roll per player".

alter table public.captain_name_rerolls enable row level security;
drop policy if exists "Players can read their own name re-roll" on public.captain_name_rerolls;
create policy "Players can read their own name re-roll"
  on public.captain_name_rerolls for select to authenticated
  using (player_id = (select auth.uid()));

revoke all on table public.captain_name_rerolls from public, anon, authenticated, service_role;
grant select on table public.captain_name_rerolls to authenticated;
grant select, insert on table public.captain_name_rerolls to service_role;
```

`assign_captain_name(p_player_id uuid, p_placeholder text, p_name text) returns jsonb`:
- Language plpgsql, `set search_path = ''`, **not** SECURITY DEFINER.
- `update public.profiles set display_name = p_name where id = p_player_id and display_name = p_placeholder returning display_name into v_name`.
- If nothing was updated, read the current name instead. No profile returns `{"status":"missing"}`.
- Count the rows in `captain_name_rerolls`.
- Return `{"status":"named","name":v_name,"rerollsUsed":n}`.

The row lock of the update makes a second request wait and then find the name already taken.

`reroll_captain_name(p_player_id uuid, p_placeholder text, p_new_name text, p_action_uid text) returns jsonb`. The checks run in this order:
1. Lock and read the profile with `for no key update` (changed after the review of W1: `for update` would block the foreign-key checks of other tables that point at the profile); no profile gives `missing`.
2. If a re-roll row exists: same uid gives reason `already_applied`, otherwise `no_rerolls_left`. Both include the current `name`.
3. If the current name equals the placeholder: `no_name_yet`.
4. If `p_new_name` is null or equals the current name: `raise exception 'same_name'` (a server bug).
5. Insert the re-roll row, update `display_name`, and return `{"status":"named","name":p_new_name,"rerollsUsed":1}`.

`save_progress(p_player_id uuid, p_expected_version integer, p_data jsonb) returns jsonb`:
- A null or <1 version, or data that is null or not an object, raises `bad_save`.
- `octet_length(p_data::text) > 200000` returns `{"status":"too_big"}`. Keep the number equal to `saves_data_max_size`.
- `update public.saves set data = p_data, version = version + 1 where player_id = p_player_id and version = p_expected_version returning version, updated_at` gives `saved`, with `version` and `updatedAt`.
- Otherwise read the version: no row gives `missing`, else `{"status":"stale","version":v}`.

`delete_player(p_player_id uuid) returns jsonb`. This is **SECURITY DEFINER**, the only one in this migration, because deleting from `auth.users` needs the owner's rights. It also has `set search_path = ''`:
```sql
update public.crews as c
   set created_by = (select s.player_id from public.crew_seats as s
                      where s.crew_id = c.id and s.player_id is not null and s.player_id <> p_player_id
                      order by s.seat_no limit 1)
 where c.created_by = p_player_id
   and exists (select 1 from public.crew_seats as s
                where s.crew_id = c.id and s.player_id is not null and s.player_id <> p_player_id);
delete from auth.users where id = p_player_id;
if not found then return jsonb_build_object('status', 'not_found'); end if;
return jsonb_build_object('status', 'deleted');
```

For **all four** functions:
```sql
revoke all on function public.<name>(<types>) from public, anon, authenticated;
grant execute on function public.<name>(<types>) to service_role;
```
The signatures are `(uuid, text, text)`, `(uuid, text, text, text)`, `(uuid, integer, jsonb)` and `(uuid)`. The comment on `delete_player` says why it is SECURITY DEFINER and why it is safe: only `service_role` may run it, and it takes the id from the server, which takes it from the verified token.

### 3.6 Coins

A2 moves no coins. `DELETE /api/me` removes the wallet and the ledger rows by cascade only. It never calls the wallet function.

### 3.7 Browser: `frontend/src/online/`

**`session.js`** (tiny, memory only):
- `export function createSession()` returns `{ getToken(), isSignedIn(), setToken(token), clearToken(), onChange(listener) }`.
- `export const session = createSession()`.
- `setToken` throws `TypeError` for anything but non-empty text.
- Listeners receive `{ signedIn: boolean }` and **never the token**. `onChange` returns a stop function. `clearToken` while already signed out tells nobody.
- No `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` or `console`.
- The header says: the sign-in UI fills it later; persistence across reloads is the sign-in package's decision (N11).

**`api.js`:**
- `export function createApi({ session, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS })` returns `{ get(path), post(path, body), put(path, body), del(path, body) }`.
- `export const api = createApi({ session })`. `REQUEST_TIMEOUT_MS = 10000`.
- The path must start with `/api/` and contain no `//` or `://`. Otherwise it throws `TypeError` and fetch is never called, so the token can never go to another site.
- The header is `Authorization: Bearer <token>` only when signed in. A body is sent as JSON with `Content-Type: application/json`. The token is never put in the address.
- Results:
  - `{ ok: true, status, data }` (`data` is `null` for an empty or non-JSON body).
  - `{ ok: false, status, code, message, retryAfterSeconds? }`, where `code` comes from the server body, or from a status name or `network_error` or `timeout`.
- **401:** `session.clearToken()` and `MESSAGES.unauthorized` ("Please sign in again.").
- **409:** the server's message if `body.error.message` is text (it already explains, for example "This was already done."), else `MESSAGES.conflict`. `code` is kept, so callers can treat `already_applied`, `already_seated` and `already_started` as done.
- **429:** "Too many tries. Wait N seconds, then try again." with `retryAfterSeconds` from a numeric `Retry-After` header. Without the header: "Too many tries. Wait a moment, then try again."
- **Others:** the server message, or `MESSAGES.unknown`. A thrown fetch gives `MESSAGES.network`. A timeout (AbortController) gives `MESSAGES.timeout`.

### 3.8 Tests (write first)

**`test_host_settings.py`**

| Test | Asserts |
|---|---|
| `test_no_hosts_by_default` | `load_settings({}).host_player_ids == frozenset()` |
| `test_host_ids_are_trimmed_and_lowercased` | Two ids with spaces and capitals are stored in canonical lowercase |
| `test_empty_pieces_are_ignored` | `"id1,,id2,"` gives 2 ids |
| `test_a_github_login_instead_of_an_id_stops_the_server` (neg) | `"octocat"` raises `SettingsError` naming HOST_PLAYER_IDS, and the message does not contain "octocat". An implementation that accepts any text fails. |
| `test_env_example_lists_host_player_ids_empty_and_server_only` | `.env.example` has `HOST_PLAYER_IDS=` and its comment has `[SERVER ONLY]` |

**`test_hosts.py`** (mounts `GET /api/test/host-only` with `HostDep` on `create_app(...)`, as `test_app.py` does)

| Test | Asserts |
|---|---|
| `test_a_host_gets_200` | the host's token reaches the route |
| `test_a_player_who_is_not_a_host_gets_403_forbidden` | `assert_error(403, "forbidden")` |
| `test_without_a_token_it_is_401_not_403` | the login is checked first |
| `test_with_no_hosts_configured_everybody_gets_403` | |
| `test_a_header_or_query_naming_the_host_does_not_help` (neg) | `X-Player-Id: <host id>` and `?playerId=<host id>` with a non-host token give 403 |

**`test_captain_names.py`** (pure, `random.Random(42)`)

| Test | Asserts |
|---|---|
| `test_the_word_lists_load_with_at_least_32_words_each` | |
| `test_every_word_is_one_capitalised_word_of_letters` | `WORD_PATTERN` fullmatch |
| `test_no_word_appears_twice` | |
| `test_the_longest_possible_name_fits_the_profile_rules` | max adjective + max noun + 4 is at most 24 |
| `test_a_thousand_generated_names_pass_the_profile_rules` | length, characters, trimmed |
| `test_a_name_is_adjective_noun_and_a_number_from_10_to_99` | the parts come from the lists, the number is in range |
| `test_the_same_seed_gives_the_same_names` | |
| `test_a_new_name_is_never_the_current_name` (neg) | With one adjective and one noun, `pick_new_name(..., "Brave Puffin 99")` differs ("Brave Puffin 10"). A naive re-pick fails. |
| `test_the_placeholder_matches_the_sign_up_function` | Reads the foundation: `c_id_length constant integer := 6` and `'Captain-' \|\| left(new.id::text, c_id_length)`, and equals `placeholder_name()` |
| `test_a_generated_name_is_never_a_placeholder` | |
| `test_a_broken_word_list_is_refused` | A tmp file with `"Sea-Dog"`, a duplicate, or too few words raises `ValueError` |

**`test_captain_name_routes.py`**

| Test | Asserts |
|---|---|
| `test_a_new_player_gets_a_generated_name` | `rpc/assign_captain_name` body `{"p_player_id": <verified>, "p_placeholder": "Captain-111111", "p_name": <from lists>}`; 200 `{captainName, rerollsLeft: 1}`; no-store |
| `test_asking_twice_keeps_the_first_name` | A stateful fake: the second call returns the same name |
| `test_the_name_never_comes_from_the_login` (neg) | The fake login has `user_name: "octocat"` and an email; neither appears and the words are from the lists |
| `test_without_a_token_it_is_401_and_calls_nothing` | |
| `test_a_player_without_a_profile_gets_404_player_not_set_up` | |
| `test_reroll_gives_a_different_name_once` | `rerollsLeft: 0` |
| `test_a_second_reroll_is_409_no_rerolls_left` | |
| `test_the_same_reroll_sent_twice_is_409_already_applied` | |
| `test_reroll_before_a_name_is_409_no_name_yet` | |
| `test_a_bad_action_uid_is_422_and_calls_nothing` | `"abc"`, `"a b c d e f g h"`, 65 characters |
| `test_a_player_id_in_the_body_is_refused` (neg) | `{"actionUid": ..., "playerId": <other>}` gives 422 and nothing is called |

**`test_saves.py`**

| Test | Asserts |
|---|---|
| `test_100000_bytes_are_accepted_and_one_more_is_refused` | the boundary |
| `test_the_size_counts_utf8_bytes_not_characters` | `"é"` counts 2 bytes |
| `test_nan_and_infinity_are_refused` | `save_not_json` |
| `test_the_python_limit_leaves_room_under_the_database_limit` | `MAX_SAVE_BYTES * 1.5 < 200000`, with 200000 read from the foundation's `saves_data_max_size` and from `save_progress()` |
| `test_get_save_reads_only_the_players_row` | the exact params; the other player's row comes first in the fake |
| `test_put_save_with_the_current_version_returns_the_next` | the RPC args, 200 `{version: 4, updatedAt: "...Z"}` |
| `test_a_stale_version_is_409_stale_save_and_changes_nothing` (neg) | A stateful fake; the data is unchanged afterwards |
| `test_two_devices_from_the_same_version_only_the_first_wins` | |
| `test_a_save_written_on_one_device_is_read_on_another` | PUT then GET returns the data |
| `test_a_save_that_is_too_big_is_422_and_calls_nothing` | |
| `test_a_database_too_big_answer_is_422_save_too_big` | |
| `test_data_that_is_not_an_object_is_422` | list, text, null |
| `test_a_version_that_is_not_a_whole_number_from_1_to_2147483647_is_422` | `0`, `-1`, `"3"`, `2.5`, `true`, `2147483648` (renamed after the review of W1) |
| `test_extra_fields_are_refused` | |
| `test_without_a_token_it_is_401_and_calls_nothing` | |
| `test_a_player_without_a_save_row_is_404` | |

**`test_delete_me.py`**

| Test | Asserts |
|---|---|
| `test_delete_calls_delete_player_once_with_the_verified_id` | 200 `{deleted: true}`, no-store |
| `test_delete_needs_confirm_true` | no body, `{"confirm": false}` and `{"confirm": "yes"}` each give 422 and nothing is called |
| `test_without_a_token_it_is_401_and_deletes_nothing` | |
| `test_an_account_that_is_already_gone_still_answers_200` | |
| `test_the_route_never_deletes_rows_itself` (neg) | The only request is `POST /rest/v1/rpc/delete_player`; there is no `DELETE /rest/v1/...`. A table-by-table implementation fails. |
| `test_the_log_never_holds_the_player_id` | caplog |
| `test_a_database_timeout_is_503_and_says_deleting_twice_is_safe` | |

**`test_me.py`** (deliberate changes, F3)

| Test | Change |
|---|---|
| `test_a_signed_in_player_gets_their_name_coins_and_crews` | **Changed on purpose:** the expected dict gains `"captainName": None, "kit": None, "place": None`. The four old values are unchanged. |
| `test_captain_name_is_null_while_the_name_is_the_placeholder` | new |
| `test_captain_name_is_the_display_name_once_generated` | new: profile `"Brave Puffin 17"` |
| `test_kit_and_place_are_null_before_act_1` | new (A3 replaces it with read-based tests) |
| `test_get_me_only_reads` (neg) | new: every request is a GET. Lazy naming inside GET fails. |

**`test_accounts_match_migration.py`** (a local `declared_parameters()` as in `test_wallet_matches_migration.py`)

| Test | Asserts |
|---|---|
| `test_the_accounts_migration_sorts_after_the_exchange` | |
| `test_<each of the four functions>_takes_exactly_the_arguments_the_server_sends` | The SQL parameter names in order equal the Python dict keys |
| `test_every_new_function_is_for_the_server_only` | The revoke and grant patterns for all four |
| `test_delete_player_is_the_only_security_definer_function_here` | |
| `test_the_rerolls_table_has_rls_one_read_policy_and_revokes_before_grants` | |
| `test_the_action_uid_rule_in_sql_matches_the_route` | `{8,64}` and the character set |
| `test_one_reroll_per_player_is_the_primary_key` | |

**`frontend/tests/online-session.test.js`**
- starts signed out
- set and get
- clear
- refuses an empty or non-text token, and the state is unchanged
- listeners get `{ signedIn }` only, never the token
- unsubscribe works
- clearing twice tells nobody
- two sessions do not share a token
- the source file never contains `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` or `console.` (read as text)

**`frontend/tests/online-api.test.js`**
- `get` sends `Authorization: Bearer tok`
- no header when signed out
- `post` sends JSON and Content-Type
- `put` and `del` send their method and body
- 200 gives `{ok: true, data}`
- 401 gives the sign-in message **and clears the session**
- 409 keeps the server message and `code` (`already_applied`)
- 409 without a usable body gives the default message
- 429 uses `Retry-After: 30`, giving `retryAfterSeconds: 30` and the message mentions 30
- other errors use the server message, or the plain message
- a network failure gives `network_error`
- a timeout gives `timeout` (fake timers)
- (neg) `https://evil.example/api/me`, `//evil.example/api` and `api/me` throw and fetch is never called
- the token never appears in the URL
- the source has no storage or console access

### 3.9 Docs (A2)

- **INTERFACES.md:**
  - Section 1: the 403 row now says `require_host` (`HostDep`, hosts in `HOST_PLAYER_IDS`). The 409 row gains `stale_save`, `no_rerolls_left` and `no_name_yet`, and replaces "Package A2 plans a 409". The 422 row gains `save_too_big` and `save_not_json`.
  - Section 2: `GET /api/me` gets its new fields and example. New subsections right after it, before `### POST /api/auth/exchange`: `POST /api/me/name and /reroll`, `GET and PUT /api/save`, `DELETE /api/me`.
  - Section 3: a new subsection `### Talking to the API: api.js and session.js (package A2)` after `### Reserved events`.
  - Section 4: the "Saves" bullet gets the new version meaning, plus a paragraph and table row for the A2 migration after the Exchange paragraph ("`market_trade()` is the only way a trade happens ...").
  - Section 9: the A2 row is marked built, with the sign-in pending.
- **DECISIONS.md:** D006 and D022 (section 2.2). D006 covers the names, one re-roll, no free text, preset emotes later, and the sign-in approach pending. D022 covers save versions and limits, the delete rules and their reasons, the cascade rule for later tables, and hosts.
- **supabase/README.md** (anchors in section 6):
  - A file row.
  - A section "## The accounts migration (package A2)".
  - Option A step 6.
  - Matrix rows:

    | Table | Action | Visitor | Player | Server |
    |---|---|---|---|---|
    | `captain_name_rerolls` | read | no access | own row | yes |
    | `captain_name_rerolls` | insert | no access | no access | yes (through `reroll_captain_name()`) |
    | `captain_name_rerolls` | update | no access | no access | no access (a re-roll is final) |
    | `captain_name_rerolls` | delete | no access | no access | no access (goes with its player, by cascade) |

  - Function rows: `assign_captain_name()`, `reroll_captain_name()`, `save_progress()` and `delete_player()` are no access for visitors and players and yes for the server. `delete_player()` gets a new footnote: SECURITY DEFINER because it deletes the login in `auth.users`, run only by `service_role`, hands crews over first.
  - A bullet in "What the server's secret key may do".
  - Manual checks N1 to N6:
    - N1: assign twice keeps the first name.
    - N2: re-roll once, and a second re-roll is refused.
    - N3: a stale save is refused and changes nothing.
    - N4: `too_big`.
    - N5: a player cannot run any of the four functions (`permission denied`).
    - N6: **on a throwaway test user only**, `delete_player` removes every row, hands the crew over, and the second call answers `not_found`. This also proves on Supabase that `postgres` may delete from `auth.users` (F6).
- **backend/content/README.md:** a "What lives here" row and a section "## The format of names.json" at the end.
- **Docstrings:** `backend/server/__init__.py` (insert `hosts.py` and `account/` after the `wallet.py` line); `routes/__init__.py` (insert `captain_name.py`, `save.py` and `delete_me.py` rows after the `me.py` row).

### 3.10 Order of work (A2)

1. Write the contracts first: the route header comments (copy A2.4) and the migration skeleton.
2. `HOST_PLAYER_IDS` and `hosts.py`, tests first.
3. `names.json` and `account/names.py`, tests first.
4. The migration and its parity tests, the pglast parse, and the scratch apply twice with the A2 behaviour checks.
5. `GET /api/me` fields and the `test_me.py` changes.
6. `POST /api/me/name`.
7. `GET` and `PUT /api/save`.
8. `session.js` and `api.js` with Vitest. **(Minimum done here.)**
9. Re-roll.
10. `DELETE /api/me`.
11. Docs.
12. All gates.

---

## 4. Package A3: referee and entry kits

### 4.1 Scope

- **Minimum:** kits give the start place, the coins and the cheap-card data (S3 builds the card route itself).
- **Full acceptance, all built here:**
  - All 8 end states map to the right kit.
  - Forged logs are refused and store nothing.
  - A resubmission returns the stored profile and pays nothing.
  - It works with today's `story.json` and after Story v2 (`keep_quiet` sets no flag; still 8 end states).
- **Not verifiable by the builder:** "works on a preview". Claude checks `GET /api/content/intro-story` and `POST /api/intro/complete` on a preview after the merge (F6).

### 4.2 Files

**Create:**

| File | Job |
|---|---|
| `backend/content/entry_kits.json` | the content in A3.3 |
| `backend/server/game/__init__.py` | package docstring (later also S3 `case.py` and S4 `partners.py`) |
| `backend/server/game/entry_kits.py` | load and check the kits; `kit_for(ending, decision)`, `kit_by_id(id)` |
| `backend/server/game/referee.py` | the pure replay: `judge(story, kits, actions) -> Verdict`; `story_fingerprint()` |
| `backend/server/game/entry_profile_store.py` | `grant_entry_kit(...)` (the RPC) and `read_kit_and_place(...)` |
| `backend/server/routes/intro.py` | `POST /api/intro/complete` |
| `supabase/migrations/20261106030000_entry_profiles.sql` | A3.6 |
| `backend/server/tests/story_states.py` | helpers: the 8 routes, the end-state search, `story_v2_fixture()` |
| `backend/server/tests/test_entry_kits.py`, `test_referee.py`, `test_intro_route.py`, `test_entry_profiles_match_migration.py` | tests (A3.8) |

**Change:** `routes/me.py` (kit and place); `test_me.py`; `app.py`; `backend/server/__init__.py` (the `game/` line after A2's lines); `routes/__init__.py` (an `intro.py` row after A2's rows); `backend/content/README.md`; INTERFACES, DECISIONS (D019), supabase/README.

### 4.3 Content: `backend/content/entry_kits.json` (server only, not on `PUBLIC_CONTENT`)

```json
{
  "about": "The four entry kits of the case and how an Act 1 ending maps to one (package A3, D019). Server only, never served. Coins and texts come from the S0 drafts (CASE-FILE.md section 3) and wait for Nils' approval of S0. This order is the case-file order, not the partner kit order.",
  "decisionFlags": {"trusted": "trusted_fisherman", "warned": "warned_harbor"},
  "logFlag": "read_log",
  "kits": [
    {"id": "true_keeper", "name": "True Keeper", "ending": "ending_rescue", "decision": "warned",
     "startPlace": "lighthouse_isle", "coins": 1000, "cheapCard": "C6",
     "item": {"id": "keeper_permit", "name": "Keeper's permit", "text": "Opens the keepers' post room behind the Harbor Office."}},
    {"id": "witness", "name": "Witness", "ending": "ending_trapped", "decision": "warned",
     "startPlace": "saltreach_harbor", "coins": 1000, "cheapCard": "C2",
     "item": {"id": "radio_words", "name": "Words through the door", "text": "What you heard the fisherman say into his radio, through the locked tower door. C2 is in your journal from the start."}},
    {"id": "informant", "name": "Informant", "ending": "ending_trapped", "decision": "trusted",
     "startPlace": "saltreach_harbor", "coins": 1000, "cheapCard": "C4",
     "item": {"id": "red_token", "name": "The fisherman's red token", "text": "Opens the smugglers' back room at Smugglers' Cove."}},
    {"id": "stranger", "name": "Stranger", "ending": "ending_trapped", "decision": "none",
     "startPlace": "saltreach_harbor", "coins": 1600, "cheapCard": "C5",
     "item": {"id": "unknown_face", "name": "A face nobody knows", "text": "Greyfathom's yard hires people who took no side. This kit also brings 600 extra coins."}}
  ]
}
```

The 8 end states (decision N6: the first one counts):

| Ending | Flags at the end | decision | kit | readLog |
|---|---|---|---|---|
| `ending_rescue` | `warned_harbor` (+`read_log`) | warned | true_keeper | no (yes) |
| `ending_trapped` | `warned_harbor` (+`read_log`) | warned | witness | no (yes) |
| `ending_trapped` | `trusted_fisherman` (+`read_log`) | trusted | informant | no (yes) |
| `ending_trapped` | neither (+`read_log`) | none | stranger | no (yes) |

The log card is `readLog: true` on the profile. S3 shows its board lead. Partners never carry it.

### 4.4 The referee (`game/referee.py`, pure)

- `MAX_MOVES = 300`. Frozen dataclass `Verdict(ending, decision, read_log, move_count)`.
- `MoveLogRefused(ApiError)` with status 422 and code `move_refused`, `no_ending` or `too_many_moves`.
- `judge(story, kits, actions)`, in this order:
  1. `len(actions) > MAX_MOVES` gives `too_many_moves`. This is a defence for direct callers; the route already refuses it with Pydantic.
  2. Replay on `Game(story=story, save_path=None)`. The first move the engine does not accept is refused as `move_refused`: "Move {n} is not possible at that point of the story. Reload the page and play Act 1 again." An unknown id, an id from another scene, a blocked action and any move after the ending are all refused this way.
  3. If the state has not ended: `no_ending` ("The moves stop before an ending.").
  4. Decision from the flags named in `entry_kits.json`. Both flags set raises `ValueError` (a content bug, so 500, never a kit).
  5. `read_log = logFlag in flags`.
- `story_fingerprint()` is `hashlib.sha256(STORY_PATH.read_bytes()).hexdigest()`. It is stored with the profile for audits. The request carries no story version: Story v2 changes no rule, so old logs replay to the same end state (STORY-V2-CHANGES.md section 4). A log that only a newer story allows (`keep_quiet` before v2 is deployed) is refused as `move_refused`, and the message tells the player to reload.

### 4.5 Route: `POST /api/intro/complete`

```
POST /api/intro/complete
Authorization: Bearer <token>
{"actions": ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern", "warn_harbor",
             "shore_back", "to_tower", "unlock_door", "climb", "untie"]}

200 OK   (Cache-Control: private, no-store)
{"ending": "ending_trapped", "decision": "warned", "readLog": false,
 "kit": {"id": "witness", "name": "Witness", "startPlace": "saltreach_harbor", "coins": 1000,
         "item": {"id": "radio_words", "name": "Words through the door", "text": "..."},
         "cheapCard": "C2"},
 "coinsPaid": 1000, "alreadyGranted": false}
```

- Request model: `actions: list[ActionId]` with `min_length=1` and `max_length=300`, where `ActionId` is 1 to 40 characters of `[a-z0-9_]`. Extra fields are forbidden, so a client cannot send a kit.

Flow:
1. Validate.
2. Load the story, the kits and the fingerprint per request (small files). An `OSError` or `ValueError` gives `503 intro_unavailable`.
3. `judge(...)`.
4. `kit = kit_for(...)`.
5. `wallet.validate_transaction(kit.coins, "kit_grant", "kit")`, so a bad amount is refused before any database call.
6. `grant_entry_kit(...)`.
7. Build the answer from the **returned profile** (the stored values on a resubmission) and `kit_by_id(profile.kit)`, with `kit.coins = profile.kitCoins`.

| Case | Answer |
|---|---|
| A good log, first time | 200, `coinsPaid` = kit coins, `alreadyGranted: false` |
| A good log, profile already stored | 200 with the **stored** ending, decision, readLog and kit; `coinsPaid: 0`, `alreadyGranted: true` |
| More than 300 moves, an empty list, a bad id, an extra field | `422 validation_error`, nothing stored |
| A move the engine refuses | `422 move_refused`, nothing stored |
| The log stops before an ending | `422 no_ending`, nothing stored |
| No token | 401 |
| No profile (`missing`) | `404 player_not_set_up` |
| Content files unreadable | `503 intro_unavailable` |
| Database down | `503 database_unavailable`: the outcome is unknown; `GET /api/me` shows `kit` once granted |

### 4.6 SQL: `supabase/migrations/20261106030000_entry_profiles.sql`

```sql
create table if not exists public.entry_profiles (
  player_id    uuid primary key references public.profiles (id) on delete cascade,
  ending       text not null,
  decision     text not null,
  read_log     boolean not null,
  kit          text not null,
  start_place  text not null,
  kit_coins    bigint not null,
  move_count   integer not null,
  story_sha256 text not null,
  created_at   timestamptz not null default now(),
  constraint entry_profiles_ending_format      check (ending ~ '^[a-z0-9_]{2,40}$'),
  constraint entry_profiles_decision_allowed   check (decision in ('warned', 'trusted', 'none')),
  constraint entry_profiles_kit_allowed        check (kit in ('true_keeper', 'witness', 'informant', 'stranger')),
  constraint entry_profiles_start_place_format check (start_place ~ '^[a-z0-9_]{2,40}$'),
  constraint entry_profiles_kit_coins_range    check (kit_coins between 1 and 1000000),
  constraint entry_profiles_move_count_range   check (move_count between 1 and 300),
  constraint entry_profiles_story_sha256_format check (story_sha256 ~ '^[0-9a-f]{64}$')
);
alter table public.entry_profiles enable row level security;
drop policy if exists "Players can read their own entry profile" on public.entry_profiles;
create policy "Players can read their own entry profile"
  on public.entry_profiles for select to authenticated
  using (player_id = (select auth.uid()));
revoke all on table public.entry_profiles from public, anon, authenticated, service_role;
grant select on table public.entry_profiles to authenticated;
grant select, insert on table public.entry_profiles to service_role;   -- write once: no update, no delete
```

`grant_entry_kit(p_player_id uuid, p_ending text, p_decision text, p_read_log boolean, p_kit text, p_start_place text, p_kit_coins bigint, p_move_count integer, p_story_sha256 text) returns jsonb`:
- Language plpgsql, `set search_path = ''`, not SECURITY DEFINER. Revoke from `public, anon, authenticated`; grant execute to `service_role`.
- Body as checked on the scratch database:
  1. `perform 1 from public.profiles where id = p_player_id for no key update` (one grant per player at a time; changed after the review of W1: `for update` blocks the foreign-key checks of `market_trade()`, which locks the wallet first, so the two could deadlock); not found returns `{"status":"missing"}`.
  2. `select * into v_profile from public.entry_profiles where player_id = p_player_id`.
  3. If not found:
     - Insert the row, `returning * into v_profile`, and set `v_status := 'granted'`.
     - Unless a ledger row (`kit_grant`, `kit`) already exists for the player (only test users from the manual plan, who were paid by hand): `perform public.apply_wallet_transaction(p_player_id, p_kit_coins, 'kit_grant', 'kit')` and `v_paid := p_kit_coins`.
  4. Return `{"status": v_status (granted or stored), "paid", "ending", "decision", "readLog", "kit", "startPlace", "kitCoins"}` from `v_profile`.

### 4.7 Coins

The kit coins move once, inside `grant_entry_kit()`, through `apply_wallet_transaction` with reason **`kit_grant`** (exists since the foundation, direction `earn`, so no new reason is added) and the fixed ref **`kit`**. The ledger's unique index (player, reason, ref) is the last guard.

Python never calls `apply_transaction` for the kit. The profile and the payment must be one transaction; this is the same pattern as `market_trade()`. Python still runs `validate_transaction` first.

### 4.8 Tests (write first)

**`story_states.py`** (test helpers):
- Routes, as replayed on the real engine:
  - `TO_SHORE = [to_desk, take_key, desk_back, to_shore, take_lantern]`
  - `TO_LAMP = [shore_back, to_tower, unlock_door, climb]`
  - `WARNED_RESCUE = TO_SHORE + [warn_harbor] + TO_LAMP + [signal]` (11 moves)
  - `WARNED_TRAPPED`, `TRUSTED_TRAPPED` (11 moves each)
  - `SILENT_TRAPPED = TO_SHORE + TO_LAMP + [untie]` (10 moves)
  - The `_LOG` variants insert `read_log` after `take_key`.
- `end_states(story)` is a breadth-first search; today's story has 122 states and 8 end states.
- `story_v2_fixture()` is a deep copy of today's story with `keep_quiet` (STORY-V2-CHANGES.md change 5) inserted after `warn_harbor`.

**`test_entry_kits.py`**

| Test | Asserts |
|---|---|
| `test_there_are_four_kits_with_the_agreed_ids` | |
| `test_each_ending_and_decision_belongs_to_exactly_one_kit` | |
| `test_the_coins_are_1000_and_1600_for_the_stranger` | pins N5 (pending) |
| `test_every_kit_ending_is_an_ending_scene_of_the_story` | |
| `test_the_decision_and_log_flags_are_flags_the_story_sets` | |
| `test_every_start_place_is_a_place_of_the_browser_registry` | `lighthouse_isle:` and `saltreach_harbor:` appear in `frontend/src/world/places/registry.js` (read as text) |
| `test_a_broken_kit_file_is_refused` | Tmp files: a missing field, an unknown decision, a duplicate pair, coins 0 |

**`test_referee.py`**

| Test | Asserts |
|---|---|
| `test_each_of_the_eight_end_states_maps_to_its_kit` (8 routes, parametrized) | ending, decision, readLog, kit, move_count |
| `test_todays_story_has_eight_end_states_and_all_map_to_one_kit` | |
| `test_an_unknown_action_id_is_refused_with_its_move_number` (neg) | `["to_desk", "fly_away"]` gives `move_refused` with "Move 2" |
| `test_an_action_from_another_scene_is_refused` | `["take_key"]` |
| `test_a_blocked_action_is_refused` (neg) | `["to_tower", "unlock_door"]` without the key. A replay that skips refused moves fails. |
| `test_moves_after_the_ending_are_refused` | `WARNED_RESCUE + ["to_desk"]` fails at move 12 |
| `test_a_log_that_stops_before_an_ending_is_refused` | `["to_desk"]` gives `no_ending` |
| `test_an_empty_log_is_no_ending` | |
| `test_301_moves_are_refused_before_any_replay` | |
| `test_exactly_300_moves_are_accepted` | `["to_desk", "desk_back"] * 145 + SILENT_TRAPPED` gives stranger |
| `test_keep_quiet_is_refused_on_todays_story` | move 6 |
| `test_story_v2_keep_quiet_ends_as_a_stranger` | |
| `test_story_v2_still_has_eight_end_states_with_the_same_kits` | |
| `test_old_logs_replay_to_the_same_kit_on_story_v2` | all 8 routes |
| `test_both_decision_flags_at_once_is_a_content_error` (neg) | A fabricated story gives `ValueError`, never a kit |

**`test_intro_route.py`**

| Test | Asserts |
|---|---|
| `test_a_complete_log_grants_the_kit` | RPC body: all 9 `p_*` arguments (with `p_story_sha256` = the file hash); the 200 answer; no-store |
| `test_the_coins_move_only_inside_grant_entry_kit` (neg) | Exactly one RPC (`grant_entry_kit`), none to `apply_wallet_transaction`. A Python-side payment fails. |
| `test_a_resubmission_returns_the_stored_profile_and_pays_nothing` | The fake returns `stored` with a different kit than the new log; the answer shows the stored one, `coinsPaid: 0`, `alreadyGranted: true` |
| `test_a_forged_log_is_422_and_stores_nothing` (neg; unknown id, blocked move, no ending; parametrized) | No RPC request at all |
| `test_more_than_300_moves_is_422_validation_error_and_stores_nothing` | |
| `test_odd_move_ids_are_422` | `"To Desk"`, `"../x"`, 41 characters |
| `test_a_kit_in_the_request_is_refused` (neg) | `{"actions": [...], "kit": "true_keeper"}` gives 422 |
| `test_without_a_token_it_is_401_and_stores_nothing` | |
| `test_a_player_without_a_profile_is_404` | |
| `test_unreadable_content_is_503_intro_unavailable` | monkeypatch `ENTRY_KITS_PATH` |
| `test_a_database_timeout_is_503` | |

**`test_entry_profiles_match_migration.py`**

| Test | Asserts |
|---|---|
| `test_grant_entry_kit_takes_exactly_the_arguments_the_server_sends` | |
| `test_the_kit_is_paid_with_kit_grant_and_the_fixed_ref_kit` | the text `public.apply_wallet_transaction(p_player_id, p_kit_coins, 'kit_grant', 'kit')` |
| `test_kit_grant_is_an_earn_reason_and_this_migration_adds_none` | |
| `test_the_kit_ids_in_sql_are_the_kit_ids_in_entry_kits_json` | |
| `test_the_decisions_in_sql_are_warned_trusted_none` | |
| `test_the_move_limit_in_sql_is_max_moves` | |
| `test_the_coin_limit_in_sql_is_max_delta` | |
| `test_entry_profiles_has_rls_one_read_policy_and_no_write_grant_for_players` | |
| `test_the_function_is_for_the_server_only_and_not_security_definer` | |

**`test_me.py`** (deliberate changes, F3):
- Add `entry_profiles` to `make_tables()`: the other player first (`stranger`, `saltreach_harbor`), then this player (`true_keeper`, `lighthouse_isle`).
- **Changed on purpose:** the exact answer has `kit: "true_keeper"` and `place: "lighthouse_isle"`. The reads test gets 4 GETs, the last on `/rest/v1/entry_profiles`. The filter test gets a 4th params dict `{"select": "kit,start_place", "player_id": "eq.<id>", "limit": "1"}`. The secret-key test becomes `* 4`.
- `test_a_refused_seats_read_gives_502...` keeps `len(seen) == 3`, because the entry read is **last**.
- New tests: `test_kit_and_place_are_null_before_act_1`; `test_the_kit_is_never_another_players_kit` (neg); strange `entry_profiles` rows added to the 502 parametrize.

### 4.9 Docs (A3)

- **INTERFACES.md:** a new subsection `### POST /api/intro/complete` after A2's subsections; the 422 row gains `move_refused` and `no_ending`; the 503 row gains `intro_unavailable`; `GET /api/me` says kit and place come from `entry_profiles`; a section 4 paragraph and row for `entry_profiles`; the section 9 A3 row is marked built.
- **DECISIONS.md:** D019. It covers the replay rules, the 8-to-4 mapping with the log card, the first ending counting, the coins paid once inside `grant_entry_kit()`, forged logs storing nothing, the story hash stored but not required, and the coins pending S0.
- **supabase/README.md:**
  - A file row, a section "## The entry kits migration (package A3)" and Option A step 7.
  - Matrix rows:

    | Table | Action | Visitor | Player | Server |
    |---|---|---|---|---|
    | `entry_profiles` | read | no access | own row | yes |
    | `entry_profiles` | insert | no access | no access | yes (through `grant_entry_kit()`) |
    | `entry_profiles` | update | no access | no access | no access (the first ending counts) |
    | `entry_profiles` | delete | no access | no access | no access (goes with its player, by cascade) |

  - Function row: `grant_entry_kit()` yes for the server only.
  - Manual checks K1 to K5, with **fresh** users (not the ones paid `kit` in step 2):
    - K1: the first grant pays.
    - K2: the second grant pays nothing and returns the stored kit.
    - K3: the ledger has one `kit_grant`/`kit` row.
    - K4: a player cannot run the function or insert.
    - K5: a bad kit id is refused by `entry_profiles_kit_allowed`.
- **backend/content/README.md:** a row and "## The format of entry_kits.json".

### 4.10 Order of work (A3)

1. `entry_kits.json` and `game/entry_kits.py`, tests first.
2. `story_states.py` and `game/referee.py`, tests first, on the real story and the v2 fixture.
3. The migration, its parity tests, the parse and the scratch apply with the K checks.
4. `entry_profile_store.py` and `routes/intro.py`, tests first.
5. The `GET /api/me` kit and place.
6. Docs.
7. Gates.

---

## 5. Package A6: crews and seats (worktree W2)

### 5.1 Scope

- **Minimum (ROADMAP):** start and join by code; no leaving, no kicking.
- **Also built, because M1 needs it:** the muster (N3) that seats partners, so "a crew forms with an NPC partner in an empty seat".
- **Full acceptance built:**
  - At most 4 seats.
  - Never two seats for one player in one crew.
  - A wrong code changes no crew and no seat.
  - Code guessing is rate limited.
  - Open seat first, then a partner's seat.
  - Partner kits fill the missing kits in the N2 order.
  - A friend keeps their own kit (N1).
  - Only members read their crew; only the server writes.
- **Not built:**
  - Leaving and kicking.
  - Partner orders and satchels (S4). Note for S4: a Witness partner starts with C2 in its satchel.
  - Per-seat credit for pins, bearings and accusations (L3 and S3 stamp `seat_no` on their own rows; A6's `read_open_crew_seat()` gives them the seat).
  - Finishing a crew (S3 and L3).

**One escape hatch:** joining another crew gives up the player's own **draft**, a forming crew they started and sit in alone. That way a player who pressed "start a crew" by mistake is never stuck. It is done atomically inside `crew_take_seat()`.

**Files live in `backend/server/crews/`, not in `backend/server/game/`.** W1 creates `game/__init__.py`, and two worktrees adding the same file would conflict.

### 5.2 Files

**Create:**

| File | Job |
|---|---|
| `backend/server/crews/__init__.py` | package docstring |
| `backend/server/crews/codes.py` | `CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"` (31 symbols: no 0 O 1 I L), `CODE_LENGTH = 6`, `SYSTEM_RANDOM = secrets.SystemRandom()`, `make_crew_code(rng=SYSTEM_RANDOM)`, `normalize_code(text) -> str \| None` (strip, upper, drop spaces and hyphens, then check), `MAX_WRONG_CODES = 10`, `WRONG_CODE_WINDOW_SECONDS = 600` |
| `backend/server/crews/seats.py` | pure rules (A6.4) |
| `backend/server/crews/store.py` | reads and the four RPCs; reply parsing; AlreadyApplied becomes 502 (section 2.4) |
| `backend/server/crews/service.py` | create, join, start and my-crew flows with retries |
| `backend/server/routes/crews.py` | four thin routes |
| `supabase/migrations/20261106040000_crew_codes.sql` | A6.6 |
| `backend/server/tests/crew_helpers.py` | a fake database with scripted RPC replies and recorded requests |
| `backend/server/tests/test_crew_codes.py`, `test_crew_seat_rules.py`, `test_crew_store.py`, `test_crew_routes.py`, `test_crews_match_migration.py` | tests (A6.8) |

**Change:** `app.py`; `backend/server/__init__.py` (a `crews/` line after the `adapters/` line); `routes/__init__.py` (a `crews.py` row after the `keepalive.py` row); `docs/INTERFACES.md`; `docs/DECISIONS.md` (D020); `supabase/README.md`. Never touch `routes/me.py`, `settings.py` or `.env.example`.

### 5.3 Routes

All need sign-in, answer with `Cache-Control: private, no-store`, and answer with the **crew view**:

```json
{"crew": {
  "id": "6fcdad72-8fec-4111-9929-9bad39fd435b", "code": "K7QF2M",
  "status": "active", "mode": "crew", "mySeat": 1, "startedAt": "2026-11-13T10:02:00Z",
  "seats": [
    {"seatNo": 1, "holder": "player",  "name": "Brave Puffin 17", "kit": "witness",     "partnerId": null,    "isMe": true},
    {"seatNo": 2, "holder": "player",  "name": "Calm Gannet 42",  "kit": "stranger",    "partnerId": null,    "isMe": false},
    {"seatNo": 3, "holder": "partner", "name": "the Bosun",       "kit": "informant",   "partnerId": "bosun", "isMe": false},
    {"seatNo": 4, "holder": "partner", "name": "the Cook",        "kit": "true_keeper", "partnerId": "cook",  "isMe": false}]}}
```

- Always 4 seats. An open seat is `{"holder": "open", "name": null, "kit": null, "partnerId": null}`.
- **No player ids** in any answer. Player names are `profiles.display_name`; partner names are titles.
- `mode` is `solo` while one player sits in the crew and `crew` with more.

| Route | Body | Flow and answers |
|---|---|---|
| `POST /api/crews` | none | 1. Kit read; none gives `409 kit_needed` ("Finish Act 1 first: your kit comes from your ending."). 2. Up to 5 tries: a fresh code, then `crew_create`: `created` or `existing` gives 200 view (status `forming`, me in seat 1); `code_taken` means the next try; `already_in_crew` gives 409; `missing` gives 404. 3. Five taken codes give `503 crew_codes_busy`. |
| `POST /api/crews/join` | `{"code": "k7q-f2m"}` (1 to 20 characters, extra forbidden) | 1. `normalize_code`; None gives `422 validation_error` ("A crew code has 6 letters and digits, for example K7QF2M."), **no database call, no guess counted**. 2. Kit read; none gives `409 kit_needed` (no guess counted). 3. Up to 3 tries: `crew_find_by_code(player, code, 10, 600)`: `wrong_code` gives `404 wrong_code`; `too_many_attempts` gives `429 too_many_requests` with `Retry-After: <retryAfterSeconds>`; `found` checks a finished crew (`409 crew_finished`), the player already in the seats (`409 already_seated`), and `seat_for_friend(seats, kit)` None (`409 crew_full`). Then `crew_take_seat(crew, player, seat, kit, version)`: `joined` gives 200 view; `changed` means try again; the other reasons map to their 409s. 4. Three changes give `409 crew_busy` ("The crew changed while you joined. Try again."). |
| `POST /api/crews/me/start` | none | 1. Read my open seat; none gives `404 no_crew`. 2. Up to 3 tries: read the crew; `active` gives `409 already_started`; `partners = partner_seats(seats)`; `crew_start(crew, player, partners, version)`: `started` gives 200 view (status `active`, all 4 seats); `changed` means try again; `not_in_crew` gives 404 `no_crew`. 3. Gives `409 crew_busy`. |
| `GET /api/crews/me` | | `{"crew": null}` when the player sits in no forming or active crew; otherwise the view. |

**The reads**, with exact params so tests can assert them:
- (1) `crew_seats?select=crew_id,seat_no,crews(status)&player_id=eq.<id>&order=joined_at.desc&limit=20`. Pick the first whose crew status is `forming` or `active`.
- (2) `crews?select=id,code,status,mode,version,started_at,crew_seats(seat_no,player_id,npc_id,kit,profiles(display_name))&id=eq.<crew>&limit=1`.
- (3) `entry_profiles?select=kit&player_id=eq.<id>&limit=1`.

### 5.4 The rules (`crews/seats.py`, pure)

- `KITS = ("true_keeper", "witness", "informant", "stranger")`.
- `NPC_KIT_ORDER = ("informant", "stranger", "true_keeper", "witness")`, marked `# PENDING Nils' decision (story decision 12)`.
- `PARTNERS = {1: ("lookout", "the Lookout"), 2: ("deckhand", "the Deckhand"), 3: ("bosun", "the Bosun"), 4: ("cook", "the Cook")}` (NPC-PARTNERS.md section 3). `SEAT_NUMBERS = (1, 2, 3, 4)`.
- Frozen dataclass `Seat(seat_no, player_id, npc_id, kit, name)`.
- `open_seat_numbers(seats) -> list[int]`.
- `first_missing_kit(covered) -> str` raises `ValueError` if none is missing; this cannot happen with at most 4 seats.
- `partner_seats(seats) -> list[Seat]`, for the muster: start from the kits of the **players**, then for each open seat in ascending order take the first kit in `NPC_KIT_ORDER` not covered, using that seat's partner id.
- `seat_for_friend(seats, friend_kit) -> int | None`: the lowest open seat first; else the partner seat whose kit equals the friend's kit; else the partner whose kit is **last** in `NPC_KIT_ORDER`; else `None` (4 players). Write it as plain loops, no `max(key=lambda)`.
- The seat then takes the friend's **own** kit: `# PENDING Nils' decision (story decision 10)`.

### 5.5 Rate limiting code guesses (serverless instances)

An in-memory counter like `market/limits.py` is not enough here:
- Every Vercel instance has its own memory.
- A cold start empties it.
- A guesser who spreads requests over instances gets many times the limit.

So the count lives in the database, the one thing every instance shares:
- `crew_find_by_code()` locks the player's profile row (a burst of parallel guesses is counted exactly) and deletes the player's failures older than the window.
- It refuses with `too_many_attempts` **before it looks at the code**. So after 10 wrong codes even a right code is refused: a guesser cannot confirm a hit. This was checked on the scratch database.
- A miss inserts one `crew_join_failures` row. This is the only change a wrong code causes; no crew or seat changes.

The numbers live in Python (`MAX_WRONG_CODES = 10`, `WRONG_CODE_WINDOW_SECONDS = 600`) and are passed as arguments, like the market limits.

With 31^6 ≈ 8.9 × 10^8 codes and, say, 200 open crews, one guess hits with chance about 2 × 10^-7. At 1,440 guesses a day per account that is about 3 × 10^-4 a day per account. Each account is a GitHub sign-in, and Supabase also limits sign-ins per address.

### 5.6 SQL: `supabase/migrations/20261106040000_crew_codes.sql`

Write the foundation-style header and `comment on` for every new column, table, index and function. Explain `not valid` in a comment: "the rule holds for every new or changed row; rows written before this migration (only test rows) are not checked again, so this file cannot fail on old test data".

```sql
alter table public.crews add column if not exists code text;
alter table public.crews add column if not exists version integer not null default 1;
alter table public.crews add column if not exists started_at timestamptz;
alter table public.crews drop constraint if exists crews_code_format;
alter table public.crews add constraint crews_code_format
  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');          -- null passes: old crews have no code
alter table public.crews drop constraint if exists crews_version_positive;
alter table public.crews add constraint crews_version_positive check (version >= 1);
create unique index if not exists crews_code_unique on public.crews (code);

alter table public.crew_seats drop constraint if exists crew_seats_kit_allowed;
alter table public.crew_seats add constraint crew_seats_kit_allowed
  check (kit is not null and kit in ('true_keeper', 'witness', 'informant', 'stranger')) not valid;
create unique index if not exists crew_seats_one_seat_per_player
  on public.crew_seats (crew_id, player_id) where player_id is not null;
create unique index if not exists crew_seats_one_seat_per_partner
  on public.crew_seats (crew_id, npc_id) where npc_id is not null;

create table if not exists public.crew_join_failures (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists crew_join_failures_player_time_idx
  on public.crew_join_failures (player_id, attempted_at);
alter table public.crew_join_failures enable row level security;   -- no policy at all: players never see it
revoke all on table public.crew_join_failures from public, anon, authenticated, service_role;
revoke all on sequence public.crew_join_failures_id_seq from public, anon, authenticated, service_role;
grant select, insert, delete on table public.crew_join_failures to service_role;
```

The four functions are all plpgsql, `set search_path = ''`, **not** SECURITY DEFINER. For each: revoke from `public, anon, authenticated` and grant execute to `service_role`. The bodies were checked on the scratch database; copy their logic exactly:

- **`crew_create(p_player_id uuid, p_code text, p_kit text) returns jsonb`:**
  1. Lock the profile (`for update`); none returns `missing`.
  2. Find the player's open crew (`forming` or `active`) with its status, creator and seat count. A forming crew created by the player with 1 seat returns `{"status":"existing","crewId"}`. Any other open crew returns refused `already_in_crew`.
  3. If the code exists, return refused `code_taken`.
  4. Insert the crew (`created_by`, mode `'solo'`, status `'forming'`, code) and seat 1 (player, `p_kit`). Return `{"status":"created","crewId"}`.

- **`crew_find_by_code(p_player_id uuid, p_code text, p_max_wrong_codes integer, p_window_seconds integer) returns jsonb`:**
  1. Bad limits raise `bad_limits`.
  2. Lock the profile.
  3. Delete this player's failures older than `make_interval(secs => p_window_seconds)`.
  4. If the count is at least the maximum, return refused `too_many_attempts` with `retryAfterSeconds = greatest(1, ceil(extract(epoch from (oldest + window - now())))::integer)`.
  5. In **one** select, build `{"status":"found","crewId","crewStatus","version","seats":[{"seatNo","playerId","npcId","kit"} ordered by seat_no]}` for `code = p_code`.
  6. Not found: insert one failure row and return refused `wrong_code`.

- **`crew_take_seat(p_crew_id uuid, p_player_id uuid, p_seat_no integer, p_kit text, p_expected_version integer) returns jsonb`:**
  1. A bad seat or version raises `bad_seat`.
  2. Lock the profile; none returns `missing`.
  3. The player already sits in this crew: `already_seated`.
  4. Find the player's other open crew. If it is anything but a forming crew they created: `already_in_crew`. Otherwise it is the draft.
  5. **Lock both crews in id order** (`perform 1 from public.crews where id = p_crew_id or id = v_draft_id order by id for update`), so two requests never wait for each other in a circle.
  6. Recount the draft's seats; anything but 1 gives `already_in_crew`.
  7. Read the target's status and version: missing gives `changed`; `finished` gives `crew_finished`; a version mismatch gives `changed`.
  8. Delete the draft.
  9. An empty seat gets a new row with `p_kit`. A partner seat is updated: `player_id = p_player_id, npc_id = null, kit = p_kit, joined_at = now()`. A seat held by a player gives `changed`.
  10. `update crews set mode = 'crew', version = version + 1`.
  11. Return `{"status":"joined","seatNo","replacedPartner"}`.

- **`crew_start(p_crew_id uuid, p_player_id uuid, p_partners jsonb, p_expected_version integer) returns jsonb`:**
  1. A bad version or a non-array raises `bad_muster`.
  2. Lock the crew (`for update`); missing gives `changed`.
  3. The caller does not sit in the crew: `not_in_crew`.
  4. `active` gives `already_started`; `finished` gives `crew_finished`; a version mismatch gives `changed`.
  5. Insert the partners from `jsonb_array_elements(p_partners) as partner`, using `(partner ->> 'seatNo')::smallint`, `partner ->> 'npcId'` and `partner ->> 'kit'`.
  6. Fewer or more than 4 seats raises `bad_muster` (the case always runs with four seats).
  7. Set `status = 'active', started_at = now(), version = version + 1`.
  8. Return `{"status":"started"}`.

What the database now guards by itself:
- At most 4 seats (the existing primary key and check).
- One seat per player per crew, and one per partner (the unique indexes).
- Kit ids.
- Code format and uniqueness.
- At most one open crew per player (the functions, under the profile lock).
- Exact guess counting.

What the server decides:
- Which seat a friend takes.
- Which kit each partner gets.

The version check makes sure the server decided on the crew it actually read.

### 5.7 Coins

A6 moves no coins.

### 5.8 Tests (write first)

**`test_crew_codes.py`**

| Test | Asserts |
|---|---|
| `test_a_code_has_six_symbols_from_the_alphabet` | |
| `test_the_alphabet_has_no_easily_confused_symbols` | no 0, O, 1, I or L, and 31 symbols |
| `test_the_same_seed_gives_the_same_code` | |
| `test_codes_use_the_system_random_by_default` (neg) | The default `rng` is a `secrets.SystemRandom`. A plain `random.Random` default fails. |
| `test_normalize_accepts_lowercase_spaces_and_hyphens` | `"k7q-f2m "` gives `"K7QF2M"` |
| `test_normalize_refuses_wrong_length_or_symbols` | `"K7QF2"`, `"K7QF2MM"`, `"K7QF2O"`, `""` |
| `test_the_guess_limit_is_10_wrong_codes_in_10_minutes` | |

**`test_crew_seat_rules.py`**

| Test | Asserts |
|---|---|
| `test_partners_get_the_kits_in_the_examples_table` (8 rows of NPC-PARTNERS.md 4.4) | For example, a lone true_keeper gets 2 informant, 3 stranger, 4 witness |
| `test_partners_hold_the_first_missing_kits_for_all_69_kit_mixes` | |
| `test_empty_seats_are_filled_from_the_lowest_number` | |
| `test_partner_ids_follow_the_seat_number` | |
| `test_a_friend_takes_the_lowest_open_seat_first` (neg) | Open seat 3 wins even though a partner has the friend's kit |
| `test_a_friend_replaces_the_partner_with_the_same_kit` | |
| `test_a_friend_replaces_the_last_partner_in_the_order_when_no_kit_matches` | |
| `test_four_players_leave_no_seat` | |
| `test_the_seat_takes_the_friends_own_kit` | pins N1 (pending) |
| `test_partners_hold_the_first_missing_kits_after_every_chain_of_takeovers` | 4 solo kits × 4^3 friend kits = 256 chains |
| `test_the_kit_order_is_informant_stranger_true_keeper_witness` | pins N2 (pending) |

**`test_crew_store.py`**
- `read_player_kit` sends the exact params and gives None without a row.
- `find` sends `p_max_wrong_codes: 10` and `p_window_seconds: 600`.
- Every reply status and reason parses.
- An unknown reply is 502.
- A 23505 from a crew function is `502 database_error`, not `already_applied` (neg).

**`test_crew_routes.py`**

| Test | Asserts |
|---|---|
| `test_create_gives_a_code_and_seats_me_in_seat_1` | the RPC args (`p_kit` from the entry profile, a 6-symbol code); the view: forming, `mySeat` 1, seats 2 to 4 open |
| `test_create_without_a_kit_is_409_kit_needed_and_creates_nothing` | |
| `test_create_tries_another_code_when_taken` | two calls with different codes |
| `test_create_gives_up_after_five_taken_codes_with_503` | |
| `test_create_again_returns_my_draft` | |
| `test_create_while_in_another_open_crew_is_409` | |
| `test_a_wrong_code_is_404_and_changes_nothing` (neg) | Only the kit read and `rpc/crew_find_by_code`; no `crew_take_seat` |
| `test_too_many_wrong_codes_is_429_with_retry_after` | |
| `test_a_badly_formed_code_is_422_and_costs_no_guess` | no find call |
| `test_join_without_a_kit_is_409_and_costs_no_guess` | |
| `test_join_takes_the_lowest_open_seat_of_a_forming_crew` | `p_seat_no` 2 |
| `test_join_takes_the_partner_seat_with_my_kit_after_the_muster` | |
| `test_join_keeps_my_own_kit` (neg) | `p_kit` is the friend's kit, not the partner's |
| `test_join_a_full_crew_is_409_and_takes_no_seat` | |
| `test_join_a_finished_crew_is_409` | |
| `test_joining_my_own_crew_again_is_409_already_seated` | no take call |
| `test_join_retries_when_the_crew_changed` | |
| `test_join_gives_up_after_three_changes_with_409_crew_busy` | |
| `test_start_seats_partners_in_every_empty_seat` | `p_partners` equals `partner_seats(...)` for the player kits |
| `test_start_twice_is_409_already_started` | |
| `test_start_without_a_crew_is_404_no_crew` | |
| `test_start_retries_when_the_crew_changed` | |
| `test_my_crew_is_null_without_an_open_crew` | |
| `test_my_crew_shows_four_seats_with_names_kits_and_titles` | |
| `test_my_crew_never_shows_player_ids_or_another_crew` (neg) | No uuid of any player in the answer; the reads filter on the verified id |
| `test_every_crew_route_needs_sign_in` (4 routes) | 401, no database call |
| `test_a_player_id_in_the_body_is_refused` | |
| `test_crew_answers_are_never_cached` | |

**`test_crews_match_migration.py`**
- Each of the four functions takes exactly the arguments the server sends.
- The SQL code pattern equals the alphabet and length.
- The SQL kit ids equal `KITS`.
- The partner ids fit the foundation's `npc_id` rule.
- The two unique indexes exist.
- `crew_join_failures` has RLS, no policy and no grant to `authenticated`.
- The functions are for the server only and not SECURITY DEFINER.
- Every right is revoked before grants, including the counter.
- No new policy lets players write.

### 5.9 Docs (A6, W2)

- **INTERFACES.md:**
  - Section 2: a new subsection `### Crews and seats (package A6)` directly before `### GET /api/docs`. It holds the four routes, the view, all error codes (Claude copies them into section 1 at merge) and the safe-repeat lines.
  - Section 6: edit the bullet "The server, not the database, makes sure ..." (the database now guards one seat per player and per partner; the crew functions guard one open crew). Add `crews.code`, `version` and `started_at` to the column table, and the kit rule for `crew_seats.kit`. Append `### Crew codes, the muster and partners (package A6)` at the end of section 6: the muster, the join order, decisions N1 and N2 pending, the draft give-up, and guessing.
  - Do **not** touch sections 1, 4 or 9.
- **DECISIONS.md:** D020, directly after the D012 entry.
- **supabase/README.md:**
  - Append `### Crew codes, the muster and partners (migration 20261106040000, package A6)` at the end of `### Crews and seats`, and edit its two bullets.
  - Insert matrix rows right after the `crew_seats | delete` row:

    | Table | Action | Visitor | Player | Server |
    |---|---|---|---|---|
    | `crew_join_failures` | read | no access | no access | yes |
    | `crew_join_failures` | insert | no access | no access | yes (through `crew_find_by_code()`) |
    | `crew_join_failures` | update | no access | no access | no access |
    | `crew_join_failures` | delete | no access | no access | yes (through `crew_find_by_code()`, rows older than the window) |

  - Add the note "crews and crew_seats: the server writes them through the four crew functions (a team rule, as with the wallet)".
  - Insert function rows right after the `is_crew_member()` row: `crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()` are yes for the server only; `crew_join_failures_id_seq` is no access for everyone.
  - **Fix foundation steps 3 and 12**, which the new kit rule would break:
    - Step 3: kits become `witness`, `informant`, `stranger`, `true_keeper` for crew A seats 1 to 4, and `stranger`, `informant` for crew B.
    - Step 12: the server insert uses `'witness'`, and **every** "guards" row gets a valid kit. Check constraints run in name order and `crew_seats_kit_allowed` would otherwise fire before the constraint each row tests.
  - Insert `### Crew checks (steps C1 to C8)` right after step 17, before `### Island Exchange checks`:
    - C1: create, and the same request again.
    - C2: a wrong code adds one failure row and changes no crew.
    - C3: 10 wrong codes, then a right code is refused.
    - C4: join seat 2; an old version gives `changed`.
    - C5: a second seat is refused.
    - C6: start fills 4 seats; start twice is refused.
    - C7: a friend with a draft takes a partner seat with their own kit, and the draft is deleted.
    - C8: a player cannot run the functions; and with A3 applied, check the PostgREST embed read of A6.3 once with the secret key (F6).
  - Do **not** touch the top file table, the "Apply" steps or the totals.

### 5.10 Order of work (A6)

1. `codes.py`, tests first.
2. `seats.py`, tests first (69 mixes, 256 chains).
3. The migration, its parity tests, the parse and the scratch apply twice with the C checks.
4. `store.py`.
5. `service.py`.
6. `routes/crews.py`.
7. Docs.
8. Gates.

---

## 6. Shared files and the merge plan

### 6.1 How each builder edits a shared file

| File | W1 (A2, then A3) | W2 (A6) | Merge |
|---|---|---|---|
| `backend/server/app.py` | Add names to the `from server.routes import` list; insert include lines **directly after** `app.include_router(me.router, prefix="/api")`, in the order captain_name, save, delete_me, intro. No signature change. | Add `crews` to the import list; insert one include line **directly after** `app.include_router(market.router, prefix="/api")`. | The import block conflicts. Take the union, sorted, then `uv run ruff format server/app.py && uv run ruff check .`. The include lines merge cleanly. |
| `backend/server/settings.py`, `.env.example`, `routes/me.py`, `tests/test_me.py`, `backend/content/README.md` | yes | never | clean |
| `backend/server/__init__.py` | insert `hosts.py`, `account/` and `game/` after the `wallet.py` line | insert `crews/` after the `adapters/` line | clean (2 lines apart) |
| `backend/server/routes/__init__.py` | insert rows after the `me.py` row | insert a row after the `keepalive.py` row | clean |
| `docs/INTERFACES.md` | sections 1, 2 (after `GET /api/me`), 3, 4 and 9 (A2 and A3 rows only) | section 2 (before `### GET /api/docs`) and section 6 only | clean |
| `docs/DECISIONS.md` | D006, D022, D019 above `## Next entry` | D020 after the D012 block | clean |
| `supabase/README.md` | top file table, new `##` sections after the Exchange section, Option A steps 6 and 7, matrix rows at the table end, function rows at the end, a footnote, N and K checks after the Exchange checks | the `### Crews and seats` subsection, matrix rows after `crew_seats` delete, function rows after `is_crew_member()`, foundation steps 3 and 12, C checks after step 17 | clean |
| `backend/server/tests/helpers.py`, `supabase_admin.py`, `auth.py`, `wallet.py` | never | never | |
| New helper modules | `account_helpers.py`, `story_states.py` | `crew_helpers.py` | distinct names, no conflict |

### 6.2 Merge order

**Changed after the review of W1 (finding 1, major): apply the migrations BEFORE the merge.** Every push to `main` deploys to production at once, and previews use the same Supabase project. `GET /api/me` already exists and is live, and A3 makes it read `entry_profiles`. If W1 reaches `main` before `20261106030000_entry_profiles.sql` is applied, every player gets `502 database_error` on `GET /api/me`, and the check page and deploy check 5 fail. Nothing in the code enforces the order; it is written down here and in `supabase/README.md` ("Apply before you merge").

The order:
1. Nothing is merged into `main` yet. Nils says OK to apply the migrations of the branch.
2. Apply `20261106020000_accounts.sql` and `20261106030000_entry_profiles.sql` to Supabase, in that order. Both need only the foundation and are safe to run twice (checked on Postgres 17.10 with the Exchange migration still unapplied; `20261106010000` applies cleanly afterwards). With the Supabase CLI's migration history, a later `supabase db push` then needs `--include-all` for the older Exchange file.
3. Check A3 on a preview of the branch (section 6.3, step 6), and run N6 and the audit log count.
4. Merge W1 (A2, then A3) into `main`.
5. Do the same for W2: apply `20261106040000_crew_codes.sql` (with Nils' OK), run C8, then merge W2. No live route reads the A6 columns, so the order matters less than for A3, but the same rule keeps it simple.

**If a merge has to come first:** keep the `entry_profiles` read in `routes/me.py` (and the matching expectations in `test_me.py`) out of that merge, so `kit` and `place` stay `null`, and merge it after the apply. Do not change `supabase_admin.py` to hide a missing table: the spec does not allow it, and it would hide real database errors.

Migrations still sort 020000, 030000, 040000.

### 6.3 Claude's merge-time tasks

1. Resolve the `app.py` import block (6.1).
2. **INTERFACES.md:**
   - Rewrite the sentence "Seven routes exist ...".
   - Add A6's codes to the section 1 rows (404 `wrong_code`, `no_crew`; 409 crew codes; 429 crew-code guessing; 503 `crew_codes_busy`).
   - Mark the section 9 A6 row as built.
   - Optionally add F5 to section 11.
3. **supabase/README.md:**
   - Add the 040000 row to the top file table and an Option A step 8.
   - Update the counts in "Three quick checks": tables become 13 (+`captain_name_rerolls`, `entry_profiles`, `crew_join_failures`), read policies 12, and authenticated grant rows 12, since `crew_join_failures` has no player grant.
   - Fix the "all ten tables" sentence.
4. Add `backend/server/tests/test_kits_agree.py`. It asserts that `crews.seats.KITS` equals the ids in `entry_kits.json`, that both SQL kit checks list the same four ids, and that `crews/store.py` reads `entry_profiles` and `kit` exactly as A3 created them.
5. Run all gates on the merged tree: pytest, ruff, `npm test`, and a scratch apply of all five migrations twice.
6. **Only with Nils' approval, and BEFORE the merge of the branch that needs them (section 6.2):** apply 020000 and 030000 to Supabase in that order, and 040000 before W2 is merged. Then run N6 (delete on a throwaway user, with the audit log count) and C8 (the embed read), and check A3 on a preview: `GET /api/me`, `GET /api/content/intro-story` and one `POST /api/intro/complete` with a test account. A preview shares the Supabase project, so this check works only after the apply.

---

## 7. Scratch Postgres recipe (no psql on this machine)

What worked for me (Postgres 16.2; nothing in our SQL needs a 17-only feature):
- `uv run --no-project --python 3.12 --with pgserver --with "psycopg[binary]" python -I your_script.py`, with the script in your own scratchpad, not the repo.
- `pgserver.get_server(<scratchpad>/pgdata, cleanup_mode="delete")` listens on a Unix socket only (no TCP port at all), and `server.cleanup()` stops it and removes the data.
- If the controller wants Postgres 17 exactly: the only PG 17.10 binary I found is inside another project (`/Users/nilslenke/Developer/rth-localdb/node_modules/@embedded-postgres/darwin-x64/native/bin/`). Use it only with the controller's OK: `initdb` into the scratchpad, then `pg_ctl -o "-p <random 50000..59999> -k <socket dir> -c listen_addresses=''" start`, then `pg_ctl stop`.

Stand-ins for what every Supabase project already has. Run them once before the migrations:
```sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
```

Then:
- Apply foundation, exchange and your migration, **twice**.
- Create players with `insert into auth.users (id) values (gen_random_uuid())`; the trigger makes their rows.
- Run your checks with `set local role service_role` (and `authenticated` for the refusals) in a transaction per call.
- Report the PASS lines. W2 cannot apply A3's migration, and does not need to.

---

## 8. What each builder reports

- **Changed:** every file.
- **Verified:** the exact gate commands and result lines, and the scratch PASS lines.
- **Not verified:** at least F6, and the merge-time items.
- **Remaining:** anything left.
- **Branch:** the worktree branch, with nothing committed.
- Also list every test of `test_me.py` that was changed on purpose (F3), and confirm that no file outside the scope was touched.

---

## 9. Process notes (for the controller)

- No skill was used, and nothing about a skill needs logging. Nothing in the repo was written. My scratch files are in `/private/tmp/claude-501/-Users-nilslenke-Desktop-02-University-Nova-Classes-Intro-to-Programming-Group-Project/569201b0-f556-4177-bafd-264473fb70ab/scratchpad/specsql/`: the three draft migrations, `run_scratch.py` (41 database checks), `routes_check.py` (engine routes) and `kits_check.py` (the kit rule).
- "Story decision 10" and "story decision 12" appear in no repo document under those numbers. This spec names them by content (the seat-takeover kit and the partner kit order). The kit-order mismatch between CASE-FILE.md (sections 3 and 9) and NPC-PARTNERS.md (section 4) is in the story drafts; the story branch should fix it. Since the story round (D018), both decisions appear under these numbers in D018 and in `docs/story/`, and CASE-FILE.md uses the NPC-PARTNERS.md order.
- Worth a line in the observation log: on this machine a scratch Postgres for migration checks is easiest through the `pgserver` wheel under Python 3.12 (`uv run --no-project --python 3.12 --with pgserver ...`). It needs no `psql`, no TCP port and no files from other projects. There is no system Postgres or `psql` here.
