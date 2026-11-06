# A — accounts and multiplayer

Used by the account/crew presenter and [A drills](../drills/A.md). Distinguish implemented server behavior from the currently disconnected game UI.

## What it provides

The backend verifies GitHub-backed identity through Supabase, generates captain names, supports a bounded one-time reroll, versioned cloud-save intents, account deletion, verified introductory entry kits and four-seat crews with NPC partners. Browser session/API infrastructure exists. The normal game does not yet integrate sign-in or an authoritative online case adapter; do not promise that pressing Continue loads a cloud account.

## Files and data flow

| Responsibility | Files |
| --- | --- |
| Identity and code exchange | `backend/server/auth.py`, `backend/server/routes/auth_exchange.py`, `routes/me.py` |
| Names, saves, deletion | `backend/server/account/`, `backend/server/routes/captain_name.py`, `routes/save.py`, `routes/delete_me.py` |
| Trusted intro/kit | `backend/server/game/referee.py`, `entry_kits.py`, `backend/server/routes/intro.py` |
| Crew codes, seating, RPC/storage | `backend/server/crews/`, `backend/server/routes/crews.py` |
| Browser infrastructure | `frontend/src/online/session.js`, `online/api.js`, `frontend/src/screens/crew.js` |
| Data constraints | `supabase/migrations/20261106000000_foundation.sql`, `20261106020000_accounts.sql`, `20261106030000_entry_profiles.sql`, `20261106040000_crew_codes.sql` in that directory |

Same-origin intent → identity dependency verifies the player → Python validates rules → server-only Supabase RPC → atomic database constraints/version checks → response → view. The browser may supply an intent, not its own balance, verified kit, membership or authorization. Authentication parsing alone is not identity verification.

Cloud saves hold untrusted progress, not authoritative money or membership. A strict version prevents an old device overwriting a newer save; compact UTF-8 JSON is limited to 100,000 bytes. Crew lookup normalizes six-symbol codes, throttles repeated wrong guesses, and retries optimistic conflicts at most three times. A friend takes an empty seat first; partner replacement follows deterministic kit/priority rules.

Database grants limit operation types and RLS limits readable rows. Players cannot directly write game state. Wallet changes require a stable reference: the database uniqueness rule makes a repeated intent safe. Scratch SQL tests exercise role/transaction boundaries, and the completed case release records actual API-to-SQL journeys. A real production OAuth/browser session and two-user live permissions check remain distinct proofs.

## Evidence

From `backend/`:

```bash
uv run --locked pytest server/tests/test_auth.py server/tests/test_auth_exchange.py server/tests/test_me.py server/tests/test_captain_names.py server/tests/test_captain_name_routes.py server/tests/test_saves.py server/tests/test_delete_me.py server/tests/test_referee.py server/tests/test_entry_kits.py server/tests/test_crew_codes.py server/tests/test_crew_seat_rules.py server/tests/test_crew_routes.py server/tests/test_crew_store.py server/tests/test_accounts_match_migration.py server/tests/test_crews_match_migration.py server/tests/test_wallet_matches_migration.py
```

From `frontend/`:

```bash
npm test -- tests/online-session.test.js tests/online-api.test.js
```

These prove local rules, transport boundaries, optimistic conflicts and SQL-contract agreement. They do not connect to a hosted database or establish a successful live sign-in. Follow the two-user plan in [supabase/README.md](../../supabase/README.md) for actual RLS behavior; private project access is a separate prerequisite.

## Known limits

- `frontend/src/adapter/select.js` selects the local fake only with `?case=local` in development or explicit `demo=1` rehearsal; otherwise it uses `unavailable.js` and invents no kit/save/solve.
- Current frontend partner portraits use Deckhand/Navigator/Cook/Salvager roles; server crew partners use Lookout/Deckhand/Bosun/Cook. These are different layers, not evidence of integrated live crews.
- Successful identity verification is cached briefly; revocation need not appear immediately. In-memory browser sessions disappear on reload.
- An ambiguous database timeout is not proof that a write failed. Read state before retrying and preserve the action reference.
