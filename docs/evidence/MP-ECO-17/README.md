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

The focused commands and final source-qualified results are recorded below before
review. Earlier failed fixture setups remain development diagnostics, not successful
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
