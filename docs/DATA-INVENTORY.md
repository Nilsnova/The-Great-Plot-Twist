# Data inventory

What the game can store, send and log, for players and the course team. **student project, not legal advice**.

Reviewed on 6 November 2026 against all five migrations and the application at `c26f303`. This is an inventory of the repository, not proof of the deployed database or provider settings. Generated captain names and random player IDs still link activity to an account; they are not anonymous data.

## Sources and reading rules

Schema sources, in order:

- [Foundation](../supabase/migrations/20261106000000_foundation.sql): profiles, saves, wallets, reasons, ledger, crews and seats.
- [Island Exchange](../supabase/migrations/20261106010000_island_exchange.sql): shared prices, positions and trades.
- [Accounts](../supabase/migrations/20261106020000_accounts.sql): name re-rolls, save versions and deletion.
- [Entry profiles](../supabase/migrations/20261106030000_entry_profiles.sql): intro outcome and kit.
- [Crew codes](../supabase/migrations/20261106040000_crew_codes.sql): extra crew columns and failed-join counters.

The sections below cover **all 13 application tables and all 75 current columns**, including the two tables with no player link. Each table's readers and lifetime apply to every column in it. RLS means the database's row filters. All these tables have RLS enabled; visitors who are not signed in have no direct table access. Signed-in players have read access only, subject to the filters below, and cannot write tables directly. The server's privileged role can read all 13 tables and bypasses RLS; team members with appropriate database administration access can also inspect data. Server routes still check the caller's login before returning private records.

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

### public.market_bases

Source: Island Exchange. Purpose: give all server instances the same price bases and trading pauses. Readers: every signed-in player. Lifetime: updated by rebasing and pauses; retained independently of account deletion. **No player link or personal data.** These are shared game-market values, not real investments.

| Column | What it holds and why |
|---|---|
| `company_id` | Fictional game company ID. |
| `base_game_price` | Game-coin price at the base time. |
| `base_real_price` | Public feed price used to calculate game changes. |
| `base_at` | Time the base was set. |
| `base_source` | Live or recorded price source; keeps different sources apart. |
| `halted_until` | End of a temporary trading pause, if any. |
| `frozen_price` | Fixed game price during that pause. |
| `version` | Update counter; prevents conflicting writes. |

### public.market_positions

Source: Island Exchange. Purpose: track fictional holdings and holding-time rules. Readers: the owner. Lifetime: a position disappears when all its units are sold, or when the account is deleted.

| Column | What it holds and why |
|---|---|
| `player_id` | Player holding the units. |
| `company_id` | Fictional company held. |
| `units` | Number of game units owned. |
| `avg_price` | Average purchase price in game coins. |
| `opened_at` | First purchase time for the current position. |
| `last_buy_at` | Latest buy time; starts the minimum holding period. |

### public.market_trades

Source: Island Exchange. Purpose: explain trades, apply daily limits and prevent duplicates. Readers: the owner. Lifetime: history is not edited during normal play; all of the player's rows go on account deletion.

| Column | What it holds and why |
|---|---|
| `id` | Running trade number for ordering. |
| `player_id` | Player who traded. |
| `company_id` | Fictional company traded. |
| `side` | Buy or sell. |
| `units` | Game units traded. |
| `price` | Game-coin price per unit. |
| `gross` | Whole play coins before the fee. |
| `fee` | Fee in play coins, not a real charge. |
| `ref` | Request reference tied to the wallet ledger; stops a repeated click trading twice. |
| `created_at` | Trade transaction time; supports history and daily limits. |

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

## Access beyond direct table reads

The [crew join route](../backend/server/routes/crews.py) uses the [crew service](../backend/server/crews/service.py) and server-only `crew_find_by_code()` to look up a code and choose a seat internally. The lookup includes crew ID/status/version and seat/player/NPC/kit details for the server; it is not exposed as a browser preview endpoint. After joining, the API returns a crew view with names, kits and seat details, omitting player UUIDs and the version counter. Direct database RLS still lets members read every column of their crew and seats, including player UUIDs, codes and timestamps.

The server's privileged database role has broader rights than player RLS. Some rules such as “write only through this function” are team conventions in addition to SQL grants; they are not a promise that administrators cannot see or change data. See [the grant matrix](../supabase/README.md#who-may-do-what).

## Login, browser data, memory and logs

These are outside the 13 application tables:

| Data/place | Why and who receives it | Lifetime / deletion limits |
|---|---|---|
| Supabase-managed Auth users, identities and sessions | GitHub sign-in account details, user UUID and login/session information. The game uses the verified UUID, not the GitHub name/email as a public captain name. Supabase's internal schema is not defined by these migrations. | The implemented delete function removes the Auth user and associated identities/sessions. GitHub's own account and records remain. Hosted behavior still needs a live test. |
| Supabase `auth.audit_log_entries` | Auth events may include actor UUID, login email and IP address; accessible to authorised service/project operators. | Not removed by the game's delete function; no user foreign key triggers cleanup. Audit purge/disable settings are still pending in D022. No fixed duration is established here. |
| Vercel/Supabase platform logs and backups | Request/network metadata, service operation and diagnostics; provider and authorised project operators may have access. | Account deletion does not clear them. Provider settings/schedules govern retention; this repository sets no numeric duration or backup-erasure guarantee. |
| Application server logs | Ordinary auth/code/database warnings use status/error type or code; HTTP client INFO URLs are suppressed because database URLs may include player IDs. Unexpected errors log method, path and an exception traceback, so logs must not be described as anonymous. | Provider/runtime retention, outside account-row deletion. Successful deletion logs a generic message without the player ID. |
| Auth verification memory cache | SHA-256 token fingerprint, player UUID and expiry; recognises a verified token for up to 60 seconds. Raw tokens are not stored in this cache. | Removed lazily or on process exit, not explicitly purged by deletion. A deleted player's token may pass the same instance's check briefly. A validity window is not a guaranteed memory-erasure time. |
| Market rate-limit memory | Player UUID and recent trade timestamps; limits requests in a 30-second window. | Cleaned on reuse, when the map grows beyond 5,000 players, or process exit; deletion does not explicitly purge it. The counting window is not a maximum retention time. |
| `HOST_PLAYER_IDS` configuration | Host player UUIDs, used by the server to restrict presenter routes. | Kept in server settings until an operator changes them; account deletion does not edit configuration. |
| Browser `plot_twist_preferences_v1` (local storage) | Version, graphics quality, master/music/effects volume, reduced motion, text speed and colourblind setting. Same-origin browser code can read it. | No expiry; overwritten by preference changes, removed when site data is cleared. Not cleared by account deletion. |
| Browser `plot_twist_intro_moves_v1` (local storage) | Version and intro action IDs; replays the local story on reload. | No expiry; a new/restarted intro replaces the action list. Clear site data to remove it. Not cleared by account deletion. |
| Browser `plot-twist-save-v1` (legacy/helper local storage) | Scene, inventory, flags, ending state and message. Present in the helper, not wired to the current game's intro, which uses memory storage. | Old/helper values can remain until cleared; do not assume every player has this key. |
| Browser `auth-check-verifier` (session storage) | Temporary random PKCE secret used by the team sign-in check page. | Removed on exchange or “Forget me”; otherwise the tab session. It is not the login token. |
| Browser login-token memory | Login token used only in Bearer headers to the game's API; no token is written to cookies, local/session storage or the console by this code. | Lost on reload, forgetting or a rejected login; not the same as deleting server records or revoking provider sessions. |

The game code does not set application cookies and includes no advertising or analytics integration found in this review. GitHub/Supabase sign-in pages and hosting may use their own cookies and logs. Clearing site data removes local progress/preferences, not cloud records. The standalone privacy page writes no storage or cookies and makes no API calls.

Sources: [settings](../frontend/src/settings/logic.js), [intro journal](../frontend/src/story/intro-journal.js), [legacy storage helper](../frontend/src/story/storage.js), [session](../frontend/src/online/session.js), [sign-in check](../frontend/public/auth-check.js), [PKCE](../frontend/public/auth-check-pkce.js), [auth cache](../backend/server/auth.py), [market limiter](../backend/server/market/limits.py), [server logging](../backend/server/errors.py), [HTTP logging](../backend/server/app.py), [host configuration](../backend/server/settings.py).

## Outside services

| Service | What it receives / current use |
|---|---|
| GitHub | Browser visits for sign-in and GitHub's own account/authentication handling. GitHub and Supabase exchange provider identity information to establish a login. This is a browser redirect flow, not a server-only data feed. |
| Supabase | Authentication codes/verifiers, token checks and the game's stored account/activity data. The setup guide selects West EU (Ireland) for the database project; its actual deployed region/settings were not checked here. |
| Vercel | Browser/API requests, network metadata and backend logs. Functions are configured for Dublin (`dub1`); this does not establish that every CDN request, log or backup stays in Dublin. |
| Open-Meteo | Server-side weather calls with the configured game place's latitude/longitude and requested weather fields/units. No browser geolocation or player ID/token is sent in the parameters. Provider sees the server's network metadata. Demo mode uses a recording. |
| Binance | Server-side public price calls with instrument symbols, not a player's holdings, orders, identity or login token. No real trading account is opened. Provider sees the server's network metadata. Feature flags/demo mode can use no live feed. |
| Finnhub | Not integrated; listed among rejected share-data providers. No current call or player-data transfer found. Any future use needs a fresh review; data-feed calls must stay on the server. |
| Manifold | Reserved prediction source, not implemented. No current call or player-data transfer found. Planned public question reads must stay server-side, not send player bets/identity. |

Server-only data feeds do not mean server-only sign-in: browsers visit GitHub and Supabase to authenticate. No player IDs or tokens should be added to outside-data queries.

Sources: [setup/regions](SETUP.md), [hosting configuration](../vercel.json), [code exchange](../backend/server/sign_in_code.py), [weather request](../backend/server/weather/open_meteo.py), [market feed](../backend/server/market/feed.py), [reserved prediction contract](INTERFACES.md), [rejected market sources](story/OPEN-WORLD.md).

## What deletion actually does

The implemented authenticated `DELETE /api/me` requires `{"confirm": true}` and calls `delete_player()`:

1. A crew owned by the player is handed to the other human player in the lowest seat, if one exists.
2. The Auth user is deleted. Cascades remove the profile, save, wallet, **all wallet transactions**, market positions/trades, re-roll, entry profile, join-failure rows and the player's seats.
3. An owned crew with no other human player is deleted with its seats. Shared crews passed to another player and that other player's data remain.

Direct deletion in the Supabase Auth dashboard skips crew handover. Deleting only a profile is not the same as deleting the Auth account. The API does not clear browser site data, provider audit/platform logs/backups, GitHub records, host configuration or process caches. A timeout leaves the outcome unknown; the operation can safely be retried with support from the team.

D022 still labels deletion/audit-policy choices pending. This documents the implemented behavior, not a claim that a delete button is available, approved policy is settled, or hosted deletion has been tested. Contact **Nils through the course page** for a deletion request or a question. No email address is needed here.

Sources: [D022](DECISIONS.md), [delete route](../backend/server/routes/delete_me.py), [deletion service](../backend/server/account/deletion.py), accounts migration above and [manual database checks](../supabase/README.md).

## Keeping this inventory current

Run `python3 -m unittest discover -s docs/tests -v` from the repository root. The documentation test requires a section for every table created by any migration and a row for every declared or added column. It checks coverage, not deployed RLS, provider retention or the truth of prose. Update this inventory, the notice and the standalone page together when data handling changes.
