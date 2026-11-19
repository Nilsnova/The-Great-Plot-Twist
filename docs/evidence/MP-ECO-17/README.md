# MP-ECO-17 offline conversion evidence

Used by maintainers reviewing the supplied-facts auditor and disposable conversion
rehearsal. Responsible teammate: Ianno Hollensteiner (`Iannomh123456`).

## Synthetic example

The three JSON files here contain invented identities and amounts. They are not
player data, authenticated provider evidence or an approved production opening policy.
The example chooses 200 coins explicitly for one island, keeps two personal wallets
at 900/500, retains a pending personal wave claim, an actual 90-coin payment/refund
right of 45, retired `quick_fix`/Mason Drill/Carpenter facts and 22 distinct copies.
No compensation, extra copy, personal coin transfer or payout is proposed.

From `backend/`:

```sh
uv run --no-sync python -m tools.economy.conversion \
  ../docs/evidence/MP-ECO-17/synthetic-snapshot.json \
  ../docs/evidence/MP-ECO-17/synthetic-policy.json
```

The result must match `synthetic-preview.json` byte for byte. Reported hashes bind
canonical supplied records and the explicit policy, not a live source collection or
authenticated human approval. Unknown or incomplete input blocks the proposed plan.

## Executed checks

The executable and test sources at `3e231a9061f1fd8ecba7f0bdd6dceb545fab02d8`
were checked on 2026-11-19. The following command ran from `backend/` with
`UV_CACHE_DIR=/workspace/.cache/uv` and `CASE_PG_SCRATCH=1`:

```sh
uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast \
  python -m pytest -q --tb=short \
  server/tests/test_conversion_preview.py \
  server/tests/island_sql/test_conversion_rehearsal_sql.py \
  server/tests/island_sql/test_legacy_wave_fences_sql.py::test_closed_personal_protocol_two_reward_survives_adoption_and_replays_once \
  server/tests/island_sql/test_shared_arsenal_sql.py::test_valid_legacy_twenty_stored_four_carried_converts_and_all_returns_commit \
  server/tests/test_demo_host_routes.py::test_cleanup_preserves_shared_owners_without_starving_later_deletions
```

Result: **69 passed in 37.88 seconds**, with no skipped cases. This includes
50 pure preview cases, 15 populated conversion cases and four existing regression
cases for closed personal claims, excess-copy returns and guest cleanup.
`uv run --no-sync ruff check .` from `backend/` passed, as did `git diff --check`.
The example command above produced an exact byte match with `synthetic-preview.json`
(SHA-256 `38c2f5042a773dbd1eb7777348c095129b72098494eb65857e7f3d77351afcdc`).
All 26 local links in the owned spec/evidence note resolved. The documented
credential-pattern scan of committed changes found zero matches. The optional
`detect-secrets` diff scan reported four reviewed high-entropy values: the public
base commit and the synthetic report's manifest, policy and snapshot SHA digests.
These are non-secret identifiers; no scanner exclusion or broad allowlist was added.

Earlier failed fixture setups remain development diagnostics, not successful
rehearsal evidence. No full backend/frontend or authenticated provider suite is claimed
for this component.

## Verification boundaries

The command has no database connection, environment-file reader, HTTP client or
write/apply mode. The strict input contract is in `conversion_models.py` and the
implementation/requirements are in [the owned spec](../../../specs/MP-ECO-17-save-conversion.md).

The populated SQL composition is **TEST ONLY**. Its opt-in fixture uses local Unix
sockets, installs the complete existing migration chain twice, and creates its
receipt table only inside the disposable `conversion_rehearsal` schema. It exercises
actual admission/Captain/treasury/copy constraints and forced rollback; no production
conversion procedure or installed schema is delivered.

Private wager, closed-wave and ship terms in the offline examples are supplied
facts. The selected existing protocol-two regression separately executes old personal
reward recovery after admission. The new old-shared-hold test executes actual
settlement against a retired account. Neither substitutes for natural-provider wager
or ship gameplay acceptance.

Production export/admission, a reviewed opening amount/policy, blocked historical
weapon/refund/ship mappings and operational cutover/recovery remain separate gates.
No migration was applied to a hosted database and no feature was activated.
