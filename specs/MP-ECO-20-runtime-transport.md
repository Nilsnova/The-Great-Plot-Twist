# MP-ECO-20: shared capability transport integration

> **What this is:** the HTTP negotiation and browser transport seam for the shared economy runtime.
>
> **Who uses it:** versioned island feature routes, browser adapters and integration tests.

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Coding assistance: Codex.
- **Issue:** [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505).
- **Branch:** `feat/shared-economy-runtime-wiring`.

## Bounded change

Add the exact `X-Island-Economy-Version: 1` compatibility check as a small HTTP
helper. It grants no membership, chooses no account and performs no mutation;
callers still use the existing persisted context/permission APIs. Legacy handlers
invoke it only after identifying a shared target, preserving legacy compatibility.

Extend the existing browser transport with optional request headers for this
capability. Only this named header is allowed; callers cannot override bearer
authorization, content type, URL or credentials. Existing call signatures retain
their behavior. Token renewal keeps the capability header and identical body.

The existing deferred panel service forwards these optional request options to
the authenticated transport. Its readiness and session checks still run before
every call, and its existing public reads keep the anonymous client.

Private feature adapters also receive the authenticated actor ID from the
accepted `/api/me` response through the panel service. The existing scope-based
identity and lifetime checks remain unchanged. A missing profile, signed-out
session, disposed provider or invalid ID returns no actor; identifiers remain
outside the public game view and tokens are never decoded for identity.

The runtime feature adapters consume this transport while canonical context
comes from the established island projection. No competing treasury or global
client context store is introduced. Common island/game wiring follows the actual
integration contracts as their implementations become available.

## Tests and completion

Write focused header negotiation and transport tests before implementation.
Verify missing/unsupported capability errors, unchanged authorized bearer token,
all supported methods, immutable header options, renewal and header injection
rejection. Run affected pytest, Ruff and Vitest checks. These checks do not prove
authenticated game acceptance; the latter requires the real local provider,
database and completed domain integration.

No deployment, live migration, admission or production feature activation occurs.

## Runtime route registration

Register the shared Harbor and durable settlement routers in the production app
factory. Their routes, authorization and queue contracts remain owned by
[the Harbor runtime spec](MP-ECO-14-harbor-runtime.md). The protected route tests
must use ordinary `create_app()` registration rather than installing routers
only inside a test fixture. Missing login/capability and unauthorized scheduler
calls must still refuse before any domain mutation.
