# Authenticated provider origin and wager accounting scenario

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). Addresses the bounded
`settlement-source-account` and `unrestricted-bets` portions of #505.

## Scope and layers

Use fresh real local GoTrue registrations and their actual bearer tokens with the
unmodified production API. Ordinary game creation, membership, reads, reset and
original-request retries use authenticated HTTP. An independent committed-state
PostgreSQL observer checks exact account/epoch, ledger and wallet effects.

Opening admission, advanced Harbor unlock and trusted market evidence are explicit
disposable installer fixtures. They are not naturally earned progress, a live market
feed, rendered Harbor actions or production conversion. First record the actual
HTTP market opener; a closed source is not rewritten into a successful live opener.
Fixture-backed transaction coverage remains separately labeled.

## Assertions

On one account reserve one coin and then all remaining available funds as separate
same-event bets. Identical authenticated retries return the original receipt;
changed retries are rejected. Additional stake cannot exceed available money.
Wait the actual five-minute due time, settle the one-coin bet using an explicitly
synthetic trusted winning reading, then reinvest its two-coin payout. Reset through
the owner API while the other commitments remain. The reset creates exactly one
new run and preserves personal wallets/progression. Settlement and settlement retry
affect only the retired original account/epoch. A fresh new-run wager page contains
no old wagers and the replacement grant remains unchanged. No immutable row,
clock, outcome column, HP or time value is edited.

## Execution and evidence

Run `frontend/scripts/check-economy-origins-provider.mjs` with `--runtime` pointing
only to the generated local provider configuration and `--output` outside the
repository. Helper override paths allow reuse of the owned isolated-provider
installer/observer without changing product source. Never log runtime contents,
tokens, email/passwords or provider keys. Record source/harness hashes, exact
transport statuses, fixture purposes, due times and before/after account facts.
Evidence establishes these bounded observations only; the complete fifteen-scenario
matrix and natural-provider market outcomes need their own evidence.

Before future provider operations, reuse the shared `sourceEvidence` helper from
the configured provider helper root. Require actual tracked production working-tree
bytes to match the declared baseline and reject untracked production files. A
test-only branch commit is allowed; a clean committed-head comparison alone is not
sufficient source qualification. Record the guard result in the scenario report.

No hosted migration, deployment or public activation is included in this contribution.
