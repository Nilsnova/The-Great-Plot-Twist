# A explain-back cards

Used with the [A lane page](../lanes/A.md) for Thu 19 and Sat 21 November 2026. Open source locally; line ranges are orientation aids for audited main and may move after integration. Explain the named function/test before opening the back. Do not project server-only case data.

## 1. A session is not a disk save — Easy

Open [frontend/src/online/session.js](../../frontend/src/online/session.js), lines 24–61 (`export function createSession`).

**Front:** Explain these lines. Why does reload forget sign-in, and what do subscribers receive?

<details>
<summary>Back — check your explanation</summary>

Session credentials stay in closure memory, not browser storage. Subscribers receive signed-in status rather than private credential material. Reloading loses that memory; game progress persistence is a separate concern.

</details>

## 2. Keep authenticated requests same-origin — Safety / testing

Open [frontend/src/online/api.js](../../frontend/src/online/api.js), lines 50–61 (`function checkPath`).

**Front:** Explain these lines. Why reject external or protocol-relative paths? Compare tests/online-api.test.js.

<details>
<summary>Back — check your explanation</summary>

Only approved /api/ paths are accepted, excluding // forms. This prevents accidentally sending authenticated requests to another origin. Tests inject transport and inspect requests without real credentials.

</details>

## 3. Parsing is not authentication — Medium

Open [backend/server/auth.py](../../backend/server/auth.py), lines 137–171 (`async def verify`).

**Front:** Explain these lines. Where is ownership verified, and what does the short success cache imply?

<details>
<summary>Back — check your explanation</summary>

Supabase verifies identity; header parsing only extracts a candidate credential. Successful verification caches a hash-indexed result briefly. Revocation can therefore take time to appear; a cache hit is not a new provider verification.

</details>

## 4. Guarantee a different captain name — Easy

Open [backend/server/account/names.py](../../backend/server/account/names.py), lines 166–175 (`def pick_new_name`).

**Front:** Explain these lines. What happens if random selection repeats the current name?

<details>
<summary>Back — check your explanation</summary>

The server selects approved adjective/noun/number components. If they all match, it advances the number with wraparound. The server limits rerolls; login-derived or arbitrary free-text names are not accepted as the naming rule.

</details>

## 5. Measure saves in bytes — Medium

Open [backend/server/account/saves.py](../../backend/server/account/saves.py), lines 61–82 (`def save_size`).

**Front:** Explain these lines. Why use compact UTF-8 bytes? Also inspect routes/save.py SaveRequest.

<details>
<summary>Back — check your explanation</summary>

Multibyte characters make character counts inaccurate. Compact encoded JSON is bounded; non-JSON numeric values are refused. Strict version validation prevents booleans/coercions masquerading as integer save versions.

</details>

## 6. Two devices save the same version — Hard / testing

Open [backend/server/tests/test_saves.py](../../backend/server/tests/test_saves.py), lines 229–261 (`def test_a_stale_version_is_409_stale_save_and_changes_nothing`).

**Front:** Explain these lines. Find stale-save tests and trace save_progress in the accounts migration. Which write wins?

<details>
<summary>Back — check your explanation</summary>

One version-matched write advances state. A competing stale version gets 409 stale_save and must not overwrite the winner. Read current state before choosing how to retry; do not blindly increment a stale client version.

</details>

## 7. Two locks on database reads and writes — Safety / testing

Open [supabase/migrations/20261106000000_foundation.sql](../../supabase/migrations/20261106000000_foundation.sql), lines 523–584 (`create policy "Players can read their own save"`).

**Front:** Explain these lines. Explain grants, RLS and the is_crew_member helper earlier in this file. What still needs a live test?

<details>
<summary>Back — check your explanation</summary>

Grants permit operation types; RLS filters rows. Players read authorized data but cannot write authoritative game state. The helper avoids recursive seat-policy lookup. SQL-text/unit checks cannot replace two-user live RLS and privilege validation.

</details>

## 8. Derive the kit from trusted moves — Medium

Open [backend/server/game/referee.py](../../backend/server/game/referee.py), lines 74–113 (`def replay`).

**Front:** Explain these lines. Why accept action identifiers rather than a browser-supplied ending or kit?

<details>
<summary>Back — check your explanation</summary>

A client can edit its claims. The server replays bounded legal moves and derives completion/kit from trusted content. Account identity and safe-repeat database granting are separate checks; no browser view can award the kit (D003).

</details>

## 9. Replace the right partner — Hard

Open [backend/server/crews/seats.py](../../backend/server/crews/seats.py), lines 123–142 (`def seat_for_friend`).

**Front:** Explain these lines. Which seat does an arriving friend take, and whose kit is retained?

<details>
<summary>Back — check your explanation</summary>

Use the lowest empty seat, then a matching-kit partner if possible, then the deterministic lowest-priority partner choice. Four humans means full. The incoming friend retains their own verified kit.

</details>

## 10. Retry without paying twice — Hard / safety / testing

Open [backend/server/wallet.py](../../backend/server/wallet.py), lines 141–183 (`def validate_transaction`).

**Front:** Explain these lines. Why must a retry keep its reference? Open server/tests/test_wallet_matches_migration.py.

<details>
<summary>Back — check your explanation</summary>

The database uniqueness key is player, reason and reference. A new retry reference can look like a new action; the same reference returns already-applied without another change. Validation checks amount/direction/reference, while SQL provides atomicity. A timeout may have committed: inspect state first.

</details>
