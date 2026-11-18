# MP-ECO-14: Shared Harbor routes, controls and autonomous settlement

> **What this is:** Protected shared market/football endpoints, exact island-funded Harbor controls and durable server-origin settlement jobs.
>
> **Who uses it:** Island members, Harbor integration and acceptance tests.

- **Status:** In progress.
- **Branch:** `feat/shared-harbor-runtime`
- **Issue:** [#503](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/503).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

## Scope before implementation

Add dedicated shared routes under `/api/island/wagers`, using the existing authenticated island dependency, capability helper, canonical economy resolver/permissions and atomic wager services. Mutation bodies require the exact common mode/version/owner/epoch envelope and a canonical positive decimal stake. They accept no actor/account/payer, price, outcome or payout. Initial reads resolve an authorized owner; paginated source-account activity has no open-count/economic cap. Existing personal market/sports endpoints remain explicit legacy contexts. Shared adapters never fall back to them.

Add a durable job table and service-only due/retry functions in `20261118181400_shared_wager_jobs.sql`. Product insertion queues work in the same transaction; canonical settlement marks completion atomically. A CRON_SECRET-protected worker fetches trusted sources, groups identical events, retries failures and settles original accounts independently of browser presence/current membership/reset. Its finite batch size is operational pagination, never a stake/count restriction. Do not hold a queue lock while acquiring an earlier scope/account lock. All source financial effects continue through existing common treasury primitives.

Prepare GitHub Actions every-five-minute wake-up code and manual dispatch, gated by repository configuration. No Vercel cron, live scheduling, migration application, publication or deployment is performed. GitHub scheduling may be delayed; market settlement retains the existing first-server-reading-at/after-due rule, not exact-second prices.

Add separate shared Harbor cards/adapters with canonical decimal strings and BigInt arithmetic, minimum one coin, full available-funds all-in and no daily/open-count/event caps. Common origin receipts are separate from authorized current balances. Pending intents retain their original UID/body/scope on unknown outcomes and across close/reload; island/reset/identity changes never retarget them. The shared island integration provides `getEconomy`, guarded `onEconomy(envelope, expectedOrigin)`, optional `subscribeEconomy`, authoritative `getActorId`, capability-aware transport and router/card wiring. No credential or token parsing belongs in the cards.

## Verification and remaining gates

Tests cover real disposable PostgreSQL queue creation/retries/source settlement after departure/retirement, protected HTTP auth/capability/payload/scope validation, exact large amounts, concurrent funds and duplicate completion, frontend scope changes/unknown retries/multiple same-event bets, and real browser controls. Run focused Python/SQL/frontend checks, whole-backend Ruff, SQL parsing and production frontend build. Label injected authority/provider/auth fixtures separately from actual authenticated multi-client evidence. Actual production authority/client acceptance remains a gate until canonical shared session integration is available. Final verification/results are recorded after execution; human review follows CONTRIBUTING.md.

## Actual local checks

- Focused backend worker/routes/store/source/settlement checks: **71 passed in 4.48s**. Protected route checks use actual app registration with injected authentication/provider services.
- Durable queue/pages plus actual Python worker against disposable PostgreSQL: **7 passed in 21.18s**. A retired source settles after departure without browser activity; 55 same-event wagers settle across 40/15 batches with no dropped principal; unavailable prices preserve durable retry. Authority/source data are explicit fixtures, while queue, domain and treasury effects are real SQL.
- Shared Harbor frontend suites: **42 passed in 5.69s**, including two real Chromium component checks. Nested malformed choices/activity and unreadable/missing/wrong receipt identities are rejected before rendering, a balance setter or pending-UID release.
- Whole-backend Ruff passed. The documented parser read **76 migration files** successfully. No remote scheduler, migration, feature or deployment was activated.

Fresh shared snapshots still depend on the canonical persisted authority/island integration. These fixture/component checks do not establish production authentication, physical-device performance or final authenticated game acceptance.
