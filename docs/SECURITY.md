# Security process

For players and maintainers reporting a problem or preparing a release. Updated for the integrated source on 6 November 2026. [Threat model](THREAT-MODEL.md) · [dependency and licence evidence](LICENSES-THIRD-PARTY.md).

## Report privately

Use the repository's **Security → Advisories → Report a vulnerability** if enabled. Otherwise contact repository owner **Nilsnova** or a known teammate through an existing private channel. This document does not establish a security email, response deadline or bounty. Keep exploit details, player data, tokens and case reveals out of public issues.

Include the affected commit, impact, prerequisites and the smallest local reproduction. Redact credentials and identifiers. For a suspected leak, identify its location without repeating the value; the owner rotates or revokes it with the provider. Removing source text alone does not revoke a credential.

## Testing and release ownership

Default verification uses fixture accounts, mocked feeds and disposable PostgreSQL. Nils has separately authorised Codex to integrate, push main and apply reviewed migrations under the recorded per-file protocol. That standing instruction governs this release; it does not authorise unrelated destructive tests, production load tests or reading secret values. The G27 audit tools contact only public package/advisory/schema services and do not connect to the game or Supabase.

Preserve existing auth, cross-player, replay, concurrency and spoiler checks. Run checks relevant to the changed code; the [engineering commands](ENGINEERING.md#3-commands) and [audit commands](../scripts/audit/README.md) give reproducible entry points. Never dispatch GitHub Actions for these checks or add Vercel crons. Migration source is immutable after application: fixes use a new timestamp and independent review, scratch tests, live read-only preflight, one-file apply, exact checksum/history proof and security-advisor review before consuming code ships.

The release owner records the exact commit, observed checks and any operational prerequisites in the handoff. Source review does not establish deployed settings. Current releases use one Supabase project for preview and production, so APP_ENV alone is not data isolation.

## Current boundaries

Verified identity comes from Supabase and server dependencies, with host allowlisting on host APIs. Sign-in is GitHub OAuth (PKCE) or, when `AUTH_PROVIDERS` lists `email`, a 6-digit email code checked by Supabase (email OTP); the browser sends the address and code only to the Supabase origin the CSP already allows, and shows only fixed messages, never SDK error text. Email users get ordinary Supabase tokens and the same server checks as GitHub users. Abuse limits are Supabase's: one code per address a minute and the project email rate limit (answered with 429). A guest confirms an email with a code before it counts (`email_change`), so a guest cannot claim an address it does not receive. Google sign-in was dropped and its consent page is no longer a reviewed navigation target. RPCs enforce durable repeats and atomic play-money changes. Case data and action receipts stay server-only; live crew presence has private channel policies. Default API responses and errors are no-store; case/festival/host and personal sports responses also receive private cache policies. Tracked HTML headers include CSP and framing protections. See the threat model for precise source references and the complete route inventory.

**Class demo guests (D030).** Supabase anonymous sign-ins stay switched on. Anyone can create an anonymous user with the public publishable key, so the projector QR and its class code are **not** a lock: they are only how a guest gets the code. The locks are the server's guest gate ([gate.py](../backend/server/demo/gate.py): a guest who is not in `demo_guests` gets `403 demo_closed` on every gated route) and row-level security ([20261109020000_class_code.sql](../supabase/migrations/20261109020000_class_code.sql): every browser policy, the five Realtime room policies included, lets a token that is not explicitly `is_anonymous: false` pass only when `is_admitted_guest()` is true). `POST /api/demo/join` compares the code in constant time and allows 10 tries per 10 minutes per player and per network address on each server instance. A new code stops the old one for new joins at once. What an anonymous user without the code can still do: create the Supabase user itself (Supabase's per-address rate limit applies), call `GET /api/config` and the other public routes, call `POST /api/demo/join` within its budget, and delete their own data (`DELETE /api/me`). The code is stored as plain text, readable only with the secret key, so the host can show it again; it is never logged and never in `/api/config`.

Festival and sports remain release-gated. Live sports needs the provider credential and a verified current-provider proof before enabling; recorded examples cannot accept stakes. The AI companion proposal and its unused context code/flag were removed at Nils' request.

The original G27 checkpoints remain historical evidence. The integration handoff records the refreshed source and dependency scope; old findings already fixed by later packages are identified there rather than presented as current defects.
