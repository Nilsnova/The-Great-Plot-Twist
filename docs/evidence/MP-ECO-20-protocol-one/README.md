# Actual-provider legacy protocol-one compatibility

The `wave-protocol-1` row of #505 explicitly includes the supported legacy
protocol, shared admission fence, bell races and canonical finish/expiry behavior.
This bounded follow-up adds actual registered-provider HTTP and real-time
production-controller observations for the supported legacy path. It changes no
production source, migration, outcome or economy rule.

## Configuration and source

Production baseline: `64ee02b360d68836b2de9247121ab47dc6a3ecbf`.
An independent loopback API on **58007** uses the normal `create_app`, real local
GoTrue/PostgREST/database and default production services. Its explicit local
compatibility setting omits `structure_recovery`; the primary API/provider and
their settings remain unchanged. This permits a genuinely fresh legacy island
to keep recovery version zero and wave protocol one, rather than rewriting an
already admitted recovery island or forcing a downgrade.

The final run passed **2026-11-19 17:36:23.764–17:36:49.823 UTC**.
[Raw result](protocol-one-result.json) records actual production checkout guards
before/after, matching scenario/launcher hashes, and matching four direct helper
hashes. These receipts do not claim a full transitive helper closure or a
process-memory attestation. [Launcher proof](api-launcher-proof.json) identifies
the separate local process/configuration. The actual legacy result retains its
existing client-reported-combat trust model; it is derived here by the unmodified
production controller, not recomputed by the payment route.

## Observations

- Real registered GoTrue identities passed the actual secondary API verifier.
  A fresh personal legacy game bought three cannons through normal authenticated
  build requests, spending 90 of its ordinary 200 starting coins.
- Two concurrent identical protocol-one bell requests returned the same wave.
  A different bell UID returned 409 `wave_running`, and the current-wave read
  returned that canonical wave. Recovery remained zero/protocol one. The real
  timing stayed minimum **10 seconds**, maximum **900 seconds**.
- With the actual purchased defenses, unmodified controller and real 50 ms
  updates, the natural result was a win with three ships sunk. The normal finish
  succeeded after the real minimum: private wallet **110→145**, exactly **35**
  loot, wallet ledger count **4→5**. The participant recorded the same natural
  result and `expired=false`. Exact finish retry returned the identical answer
  without another ledger row or payment. The current-wave read then returned null.
- A separately admitted shared island still rejected protocol-one bell with
  409 `client_update_required`. Its personal wallet/history remained **200/one
  entry**; no legacy wave row was created. Disabling local recovery admission
  therefore did not remove the persisted shared-economy fence.
- Two existing current-source disposable PostgreSQL expiry cases passed in
  **5.39 seconds**: abandoned-wave closure by the next bell and a late finish
  paying zero. These tests explicitly move test timestamps and seed identities;
  they are lower-layer expiry fixtures, not actual Auth or naturally elapsed
  900-second provider observations. No provider clock or deadline was edited.

## Reproduction

Prepare the isolated actual provider with the common authenticated-economy tools.
From `backend`, run the separately owned loopback API:

```sh
SSL_CERT_FILE=/path/to/local-provider-ca.crt \
uv run --offline --no-sync python -m tools.authenticated_economy.protocol_one_api
```

It reads only the standard generated `/tmp/mp505-provider/runtime.json`. From
`frontend`, using Node 24:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
MP_ECO_OUTPUT=/tmp/protocol-one \
node scripts/authenticated-economy/protocol-one.mjs
```

`MP_ECO_HELPER_ROOT` selects the directory containing the common provider
`api-clients.mjs`, `observer.mjs`, `runtime.mjs` and `source.mjs` helpers. Those
helpers are a prerequisite of this scenario and may be supplied from an existing
prepared checkout. Tokens/private provider settings are never included in reports.

The separately rerun expiry command, from `backend`, was:

```sh
CASE_PG_SCRATCH=1 uv run --offline --no-sync --with pgserver \
  --with 'psycopg[binary]' --with pglast python -m pytest -q --tb=short \
  server/tests/island_sql/test_islands_and_waves_sql.py::test_an_abandoned_wave_is_closed_as_expired_by_the_next_bell \
  server/tests/island_sql/test_islands_and_waves_sql.py::test_a_finish_after_the_maximum_length_pays_nothing
```

Exact output: [expiry-sql.txt](expiry-sql.txt). Scoped Ruff, scenario Node syntax,
source/artifact SHA-256 matching and `git diff --check` also passed. An application
build was not rerun for this isolated tooling/evidence addition.

## Boundaries and retained failures

This is actual Auth/HTTP and headless production-controller evidence, not rendered
gameplay or a human play session. The ordinary five-second legacy countdown,
ten-second minimum and 900-second maximum remain real. No HP, seed, outcome,
accepted journal, participant result or persisted time was fabricated to obtain
the provider pass. Natural expiry was not waited for; the explicitly time-shifted
disposable SQL tests establish its separate lower-layer behavior.

The first attempt queried a nonexistent `expires_at` observer column and stopped
before simulation. The corrected query uses the actual stored `starts_at`,
`minimum_seconds` and `maximum_seconds`. A subsequent pass was strengthened with
post-run launcher/helper hashes and exact idle/ledger-count assertions; the final
run above executed those assertions. Failed and earlier observations are not
relabeled as the final run. No product defect was demonstrated.
