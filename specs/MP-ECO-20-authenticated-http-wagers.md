# MP-ECO-20 Authenticated HTTP wager opening and original settlement

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). Branch:
`test/mp-eco-provider-http-wagers`; bounded #505 money/domain evidence.

Use the supported `create_app(market_service=...)` seam on a separate loopback
API at 58006. Production MarketService/PriceFeed, calendars, relit reader, UTC
clock, GoTrue verifier, Supabase admin, HTTP routes and financial RPCs stay
unchanged. Only the external Binance quote transport supplies a declared,
monotonically increasing fixture price. It is not a natural feed observation.
Existing API 58005, frontend and canonical worker remain untouched.

Real registered users create/join a fresh island. A saved Harbor record 4 before
admission is an explicit eligibility fixture, not earned wins. Authenticate
actual public HTTP stake 1, another same-event stake 1, the entire remaining 198,
exact/conflicting retries and unaffordable extra intent. Let actual five-minute
deadlines elapse, then call the existing CRON-secret-only settlement endpoint
without a body. Observe own origins independently; the global durable queue can
also contain other disposable fixture wagers, so its aggregate counts are not
assumed to describe only this case.

After the declared up/down/up outcomes return 398, reinvest all 398, reset through
actual owner HTTP before another real five-minute deadline, and verify old 796
settles only to the retired account while the replacement stays 200. Do not edit
clocks, immutable wagers, outcomes, financial history or authority. Keep private
wallet balances/history unchanged. Source-fence the fixture factory/transport,
scenario, pinned common helpers and both served API instances before/after.

This demonstrates authenticated product transport with a trusted quote fixture,
not rendered UI, naturally earned progression, natural returns or deployment.
No production/common source or migration changes; local commits only.

## Recorded verification

The [actual HTTP evidence](../docs/evidence/MP-ECO-20-http-wagers/README.md)
records both real five-minute maturities, actual full-budget reinvestment/reset
and old-origin-only settlement, plus one actual anonymous guest opening.
Only trusted quote inputs and saved Harbor eligibility are fixtures. Full backend
Ruff, compilation, Node syntax, quote-boundary and documentation/diff checks pass.
The measured source is pinned before a separately qualified AST-identical line
wrapping cleanup; it is not reported as a long case rerun.
