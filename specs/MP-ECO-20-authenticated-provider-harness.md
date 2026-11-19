# Isolated authenticated economy acceptance harness

Provides reproducible local-provider setup and source-qualified scenario evidence
for #505. Responsible teammate: Ianno Hollensteiner (`Iannomh123456`).

## Scope

Run pinned official Auth, PostgreSQL, PostgREST and private Realtime containers,
the unmodified production API and frontend, and registered ephemeral local users.
Generate credentials in a private external directory and bind every service to
loopback. Never read an existing environment file, configure a hosted project,
replace provider responses or install test authority. Existing migrations are
applied only to this disposable database. Shared test-island admission is explicit
installer setup; it does not prove legacy-save conversion or public rollout.

The fifteen scenario IDs in `docs/economy/ACCEPTANCE.md` remain authoritative.
Record actual SQL and authenticated-browser results separately, including precise
source, assertions, artifacts and incomplete observations. Reuse existing valid
source-matched evidence without claiming another broad regression run. Genuine
provider HTTP/SDK calls alone are not rendered gameplay; test-seeded source facts
and accelerated outcomes cannot become natural gameplay evidence.

## Validation

Test private configuration permissions, localhost-only endpoints and generated key
roles without logging their values. Verify provider health, normal signup/login,
the production API token verifier and private Realtime authorization. Observe
financial receipts/ledger through an independent committed-state connection.
Keep unsuccessful setup and scenario results with their exact boundaries.

Hosted migration, deployment and feature activation are outside this harness.

## Reproduction

Prerequisites are Docker Compose, Python/uv, Node 24 with the locked frontend
dependencies, Chromium at `/usr/bin/chromium`, and OpenSSL. From the repository
root, start a fresh isolated provider and install this checkout's migrations:

```bash
cd backend
uv run --with 'psycopg[binary]' python -m tools.authenticated_economy.stack up
uv run --with 'psycopg[binary]' python -m tools.authenticated_economy.stack migrate
uv run --with 'psycopg[binary]' python -m tools.authenticated_economy.application
```

In separate terminals, serve the actual frontend and run a bounded scenario:

```bash
cd frontend
node scripts/authenticated-economy/serve.mjs
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt node scripts/authenticated-economy/core.mjs
```

The generated `/tmp/mp505-provider/runtime.json` and Compose configuration contain
only ephemeral local secrets and have mode 600 inside a mode 700 directory. Never
commit or print them. The observer uses `uv --offline` after dependencies are
installed; a prepared environment can set `pythonEnvironment` and `uvCacheDir` in
that private runtime file. Each scenario writes a credential-free report and
screenshots under its own `/tmp/mp505-*` output directory. `MP_ECO_OUTPUT` changes
the output directory. These tools reject edited nonlocal endpoints before use.

The default scenario mode exercises actual browser Auth/SDK and production HTTP
without entering the WebGL game. `MP_ECO_RENDERED=1` requests normal frontdoor and
rendered-card interaction; its initial setup failures are kept separately and are
not implied passes. `personal-arsenal.mjs` labels its saved earned-state
preconditions; they are not naturally earned progression. Native session attachment can
finish after the first shared read: wait for the real personal profile and exact
quote rather than manufacturing a Captain or selecting a personal-wallet path.

Stop the API/frontend terminals and remove only these disposable services with
`cd backend && uv run python -m tools.authenticated_economy.stack down`.

## Provider fidelity and readiness

Official GoTrue 2.197.0, PostgREST 14.18, Realtime 2.148.3 and Caddy 2.10.2 images
are pinned by digest. PostgreSQL uses official 17 Alpine, also pinned by digest,
instead of the larger Supabase PostgreSQL image. This environment supports the
application's current migrations, pgcrypto and uuid-ossp; it does not establish
parity for unused Supabase extensions, hosted routing or hosted operational limits.

GoTrue installs actual Auth tables and issues all user access tokens. Realtime
installs its own real tenant schema, policies execute against that service, and
readiness requires its final pinned tenant migration 20261009120000 plus actual
message partitions. Standard provider roles and JWT claim readers are installed
before those services; neither `auth.users` nor `realtime.messages` is stubbed.
The local TLS CA is explicitly trusted by Python/Node, and Chromium pins the
generated server certificate's public key. Broad certificate bypass is not used.

Initial preparation failures are distinct from product assertions. A missing
standard dashboard role stopped real Realtime tenant migrations after the messages
table existed; the bootstrap now checks the complete pinned migration boundary.
Other initial attempts raced normal Captain adoption or frontdoor transitions.
Their failure reports remain failures and do not become scenario passes. The
private SDK probe reads the accepted canonical nonce and topic generation, then
awaits actual provider-token installation before subscribing. An immediate
pre-auth subscription and a legacy bare topic are distinct failed probe setups;
the production application was not patched to accommodate them.
