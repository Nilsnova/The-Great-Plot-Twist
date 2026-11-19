# Authenticated ship reward cap

The `ship-reward-cap` financial scenario in [the acceptance matrix](../../economy/ACCEPTANCE.md#required-scenarios)
passed against actual local GoTrue, the production token verifier/API and committed
PostgreSQL transactions. Ten real members share each game's reward bucket;
replays and score improvements do not multiply its maximum. This supplies bounded
authenticated transport evidence for #505, not the complete scenario matrix.

## Results

The final reproducible CLI completed all seven assertion groups with exit 0.
See [summary](summary.json) and the [complete pseudonymized report](report.json.gz).
Temporary identifiers are consistently replaced after execution; amounts,
receipts, source hashes and assertions are preserved. The original report's
SHA-256 remains recorded in both artifacts.

| Actual observation | Result |
|---|---|
| Primary island: owner plus nine invited members | All ten authenticated status reads identify the same island account and record 30. |
| Both games: ten parallel claims at each of 1, 2 and 3 stars | Each improvement stage credits 12 total; each game caps at 36, independent of the ten claimants. |
| Ten further duplicate/lower rounds per game | 20 completed rounds add zero money. |
| Exact claim replays and changed payload | 60 original requests return their immutable receipts and no fresh treasury projection; no added money. Changed stars with the original UID return 409. |
| Different island and frozen record | An original round cannot be claimed for the other island (409). That island's own record-35 round pays its own 39, leaving its balance 239. |
| Actual owner reset | Original account is retired at 272; replacement has one 200 grant. Repeating reset does not add another grant. |
| Old round with old or replacement context | Both fail without creating an operation root or changing either ledger. Exact committed old receipts still replay with `currentEconomy: null`. |
| Independent accounting | Primary 272/7 ledger entries, foreign 239/2, replacement 200/1. Balances, commitments and revisions reconcile; eleven private wallet balances and ledger counts/sums remain unchanged. |

A new retired-account intent returns `409 economy_path_unavailable` from the
common operation guard in
`supabase/migrations/20261118050150_island_economy_operations.sql:137`.
Rebinding that old round to the new epoch returns `409 economy_epoch_mismatch`.
The scenario records these actual distinct boundaries, verifies no operation
roots/effects, and confirms healthy current/foreign status reads. It does not
interpret the retired-scope refusal as a successful settlement or service outage.

## Exact boundaries

Initial saved records 30/35 and a completed wreck are labeled pre-admission
eligibility fixtures. They were not earned victories or repair payments. Every
later round, score claim, treasury effect and reset goes through actual
authenticated product HTTP. Submitted stars retain the existing trusted-score
contract; this does not establish naturally played ship scores, rendered controls,
Realtime behavior, physical devices or human performance. The record-35 comparison
uses a separate saved island, not a naturally played same-island record transition.
No clock, authority, history, outcome, receipt or account balance was edited to
make an assertion pass.

The prepared provider applied 108 application migrations; this scenario did not
rerun installation or broad suites. It uses the unchanged canonical worker.
No hosted service, production migration, deployment, conversion or activation
was performed. Earlier unsuccessful attempts remain failures; they are not part
of this passing result.

## Sources and reproduction

Measured scenario/launcher commit: `e9d33f7f39876ef8bbd8f51a664c5a3fafd7a9b6`.
Protected production candidate: `64ee02b360d68836b2de9247121ab47dc6a3ecbf`.
The prepared harness supplies its separately pinned helper commit `68497043`;
all 20 helper file hashes match before and after. API, frontend and worker source
comparisons remain empty against the production candidate, and both scenario and
launcher hashes remain unchanged. Actual checkout HEADs are preserved as metadata;
unrelated test commits do not change measured production/helper inputs.

With the isolated provider already prepared as described in the
[harness specification](../../../specs/MP-ECO-20-authenticated-provider-harness.md):

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
  node frontend/scripts/authenticated-economy/ship-cap-provider.mjs \
  --harness-root /path/to/the/prepared-harness-checkout \
  --runtime /tmp/mp505-provider/runtime.json \
  --output /tmp/mp505-ship-cap
```

The harness root must contain the exact files in the private prepared
`helper-freeze.json`; runtime endpoints are restricted to the generated loopback
services. The launcher refuses an unavailable/changed candidate instead of
manufacturing a pass. Credentials remain private in memory/runtime configuration
and are excluded from the committed evidence.

Focused source-scope regression command:

```sh
node --test frontend/scripts/authenticated-economy/ship-cap.test.mjs
```

**4 passed**: unrelated test HEAD accepted; changed production candidate, missing
protected scope and changed production-diff evidence refused. Both new executable scripts
pass `node --check`; `git diff --check` and relative documentation targets pass.
No backend, frontend build or general balance suite was rerun for these test-only
scenario/evidence additions.
