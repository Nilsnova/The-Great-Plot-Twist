# Isolated registered-provider acceptance

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

This bounded checkpoint supports #505. It provides reproducible real local Auth,
PostgREST, PostgreSQL and private Realtime infrastructure and new authenticated
transport observations. It does not complete the fifteen-scenario matrix.

## Source and execution

The production baseline is
`3bdd8eda16470795fdedd68c42fffab54e5f2ced`. Both scenarios assert an empty diff
for production server/frontend/catalogue/migrations/dependency source before and
after execution. Committed test-only changes are excluded; changed or untracked
production source is refused. Exact loaded scenario/helper hashes and actual
checkout heads are recorded. Before/after helper hashes match. Git HEAD itself
need not remain unchanged when protected source and helper bytes do.

[Provider provenance](provider.json) records observed image digests, PostgreSQL
17.12, actual Realtime tenant migrations/partitions and all 107 application
migration hashes. Official PostgreSQL Alpine replaces the larger Supabase image;
this proves only the extensions used here, not hosted extension/service parity.
GoTrue issues real user tokens; Auth tables and Realtime messages are not stubs.
The production verifier, real PostgREST role switching, SDK and WebSocket service
are used. Local TLS is verified and the browser pins the server public key.

From `frontend/`, after the [documented local setup](../../../specs/MP-ECO-20-authenticated-provider-harness.md):

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt node scripts/authenticated-economy/core.mjs
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt node scripts/authenticated-economy/personal-arsenal.mjs
node --test scripts/authenticated-economy/runtime.test.mjs scripts/authenticated-economy/source.test.mjs
```

Both provider commands exited zero in the final recorded runs on 19 November
2026. Reports contain no credentials or account emails. The default cases use
browser SDK signup and authenticated production HTTP. They do not enter the
rendered WebGL game or establish ordinary pointer interaction. Separate current
zero-funds and session evidence documents those rendered observations.

## Actual bounded results

- [Core report](core.json): nine assertions passed. Real owner/member/outsider
  identities, accepted canonical private topic, owner/member subscriptions and
  actual message delivery, outsider channel refusal; old-client/forged-field
  refusal; invited exact quoted purchase; same/changed retry; free personal
  respec; retired Carpenter refusal; three construction requests racing for the
  final 20 coins, with two successes and one refusal; independent balance/hold
  reconciliation and unchanged personal wallets. Fresh admission used an
  explicit 30-coin last-funds fixture instead of the configured 200; no later
  financial/combat/clock/outcome state was overwritten.
- [Personal/arsenal report](personal-arsenal.json): two combined scenarios
  passed. With explicit saved Captain eligibility, free Engineer role/respec,
  two nine-coin buys sharing one pending generation, role/legacy-route fences
  and unchanged wallets. With explicit island-unlock setup, an initially locked
  weapon becomes island-eligible; exact 60-coin buy/replay creates one copy, two
  members compete for it, and a stale tenure cannot return the winner's copy.
  Capacity 20 is read but not filled. No earned milestone, frozen-combat loadout,
  captured-generation delayed completion or autonomous grace cleanup is claimed.

[Preparation failures](preparation-failures.json) preserve failed/partial earlier
attempts. These include initial Captain loading, ordinary frontdoor transitions,
an incomplete provider tenant migration, a refused legacy topic and an immediate
SDK subscription before authentication bootstrap completed. The final private
probe reads actual canonical metadata and awaits actual SDK token installation.
Earlier failures are not relabeled passes and did not justify a production patch.

Seven Python harness-boundary tests passed, Ruff passed, two Node endpoint/source
guard tests passed, and all added scripts passed syntax checks. The temporary-Git
regression proves a committed test-only change remains eligible while a real
production change is refused. No broad backend/frontend suite or production
build was rerun for these tool/test/documentation additions; retained regression
results keep the separate sources listed in [TEST-MAP](../../TEST-MAP.md).

The [complete per-scenario accounting](../../TEST-MAP.md#reproducible-local-provider-follow-up)
keeps current rendered cases, authenticated transport, direct SQL and retained
historical evidence distinct. No hosted database, deployment, public conversion
or shared-mode activation is covered by this checkpoint.
