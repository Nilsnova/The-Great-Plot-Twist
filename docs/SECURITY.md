# Security process

Used by players, maintainers and reviewers to report problems and check releases. G27 source/dependency review: 6 November 2026. [Threat model and findings](THREAT-MODEL.md) · [licences and audit results](LICENSES-THIRD-PARTY.md).

## Report a problem privately

Use the repository's **Security → Advisories → Report a vulnerability** option if the owner has enabled private reporting. Its availability was not checked. If unavailable, contact a known project teammate or repository owner **Nilsnova** privately through an existing trusted channel and ask for a secure reporting route. No dedicated security email, response SLA or bounty is established by this document. Do not open a public issue containing an exploit, personal data, a token or a case reveal.

Include the affected commit/component, a short impact description, prerequisites and minimal reproduction using local/fake accounts and data. State whether any real data was touched; redact all tokens, keys, user identifiers and sensitive content. Do not send secret values or database exports to an agent or into Git. Stop when impact is demonstrated; do not enumerate other players or keep their records. A maintainer should acknowledge privately, agree the scope, assign severity and a fix owner, and coordinate disclosure after a fix or an agreed mitigation. These are process recommendations, not a promise of response times.

For a suspected credential leak, report **where** it appeared without repeating its value. An authorised human rotates/revokes the credential through the provider, checks affected access/logs privately, and follows up on exposed history/artifacts. Removing a line from a branch alone does not revoke a leaked credential. No agent should read live secrets to confirm a report.

## Scope and safe testing

In scope: repository source and built static files; Python API auth/authorization/validation; grants/RLS/RPC definitions; play-money integrity and replay safety; crew membership/codes; local browser token handling; package/advisory/licence review; spoiler boundaries; privacy and availability threats. Source findings must name exact files/lines, distinguish demonstrated behavior from assumptions, and record severity and a separate remediation owner/task.

Default testing uses local processes, deterministic fixtures, mocked providers and disposable local databases. Production/preview deployments and the shared Supabase project are **not authorised test targets** by this policy. Do not run live scans, brute force, quota/load tests, migrations, real account deletion, OAuth probing, or secret inspection. Never trigger Actions or change workflows merely to verify security. Obtain a specific, separately authorised scope from an owner for any live investigation; a public URL is not permission. The G27 audit performed none of those actions.

Out of scope for security assurances: control of operating systems/browsers/providers; proving that unknown vulnerabilities do not exist; keeping intentionally public source spoilers secret; and real-money/payment guarantees (the game uses play money). Future Realtime/LLM/presenter features require a new threat review before enabling them. HostDep exists but currently protects no production endpoint; Realtime channels are not implemented.

## Release security checklist

Use this alongside [ENGINEERING section 6](ENGINEERING.md#6-safety-checklist), [ARCHITECTURE](ARCHITECTURE.md) and the [G27 findings](THREAT-MODEL.md#prioritised-handoff-to-claude-report-only). A checklist is a release procedure, not evidence the deployed configuration passed it.

- [ ] Assign a human release/review owner, identify the exact commit and review all open G27 findings. Document accepted residual risks; do not represent a medium gap as fixed by documentation.
- [ ] Run the committed-diff secret gate from the repository root: `python3 scripts/audit/secret_scan.py`. Require exit 0 and **empty output** for `git diff origin/main...HEAD`. Recheck amended commits. This pattern gate does not cover all history, ignored files or provider logs; follow the engineering checklist if a past leak is suspected.
- [ ] Ensure no server secret appears in public variables, static bundles, maps, screenshots, logs, issue text or saved audit evidence. Publishable key/URL are public by design; service-role/OAuth/keep-alive credentials are not.
- [ ] Re-run `npm audit --json` and pinned pip-audit over the generated Python lock inventory; preserve statuses and advisory responses. Review runtime and build/dev findings separately, then regenerate the SBOM/licence inventory when locks change. Do not run `audit fix` as part of a report-only audit.
- [ ] Use the frozen lockfiles and integrity checks; review added package scripts, provenance and licence obligations. Distribute required third-party notices; confirm the build contains them. Resolve first-party reuse permissions with the owner rather than guessing a licence.
- [ ] Run relevant offline Python tests and lint plus frontend tests/build. Keep existing negative auth, cross-player, schema-validation, replay/concurrency, insufficient-balance and crew-code tests. Never weaken tests to pass an audit. [Commands](ENGINEERING.md#3-commands).
- [ ] Build and run the spoiler guard; inspect public/demo/fake assets for broader inference/paraphrase leaks the exact-fingerprint guard cannot detect. Verify only allowlisted public content is served. Do not print protected reveal prose in reports.
- [ ] Verify protected endpoints derive IDs from PlayerDep; new host-only routes use HostDep; expensive operations have abuse limits and timeouts. Rate limits must address multiple server instances where security depends on a shared budget.
- [ ] Check strict input models, pre-decode body limits, saved-size/version bounds, idempotency refs, atomic wallet/RPC rules and no-store on personal responses. On ambiguous transaction failure reconcile the existing ref before a retry/refund.
- [ ] Review SQL as source: RLS on every application table; explicit minimum grants; own/member SELECT policies; no authenticated writes; restricted SECURITY DEFINER functions/search paths; service-role-only mutation RPCs. A separately authorised human checks deployed policy and the two-user test plan; G27 does not connect to Supabase.
- [ ] An authorised owner verifies GitHub-only Auth, exact redirect allowlist, no preview wildcard redirects, least-privilege secret access and preview isolation/protection. Preview and production currently share a database; APP_ENV does not isolate it. No live verification was performed here.
- [ ] Verify HTTPS and application/static response headers in an approved staging environment, including CSP, frame-ancestors, content-type sniffing and referrer policy. Review all entry pages, not only auth-check. These controls are not established globally by current tracked config.
- [ ] Check token memory handling/PKCE and document expiry/revocation cache behavior. Review account deletion, audit-log retention and logging of identifiers without disclosing user data.
- [ ] Before enabling Realtime, define private channel membership, broadcast/presence policy, reconnect behavior and connection/message budgets. Current SQL table RLS alone is not a completed channel authorization design.
- [ ] Keep external-feed licences/attribution visible, label recorded/demo/stale data, and keep demo outcomes from real rewards/rankings. Check offline tour credit as well as the live-weather path.
- [ ] Retain audit evidence, source commit, exact passed/failed/unrun results and owner follow-ups in a handoff. A different human reviewer approves the release; this report neither merges nor deploys anything.

## Current review status

See [G27 checkpoint 1](handoff/g27-checkpoint-1.md). Dependency advisory scans passed at the recorded time; the report leaves medium abuse/header/preview and licence-distribution work for separate tasks. Deployed Auth/RLS/headers/provider settings remain unverified. No code changes or live tests are claimed.
