# Authenticated HTTP island wagers

The supported application factory runs a separate local API with the unmodified
production wager handlers, real GoTrue verification, real Supabase/PostgREST and
actual committed PostgreSQL accounting. Only the external Binance quote transport
is a declared increasing-price fixture. This closes the successful HTTP opening
boundary left separate from earlier trusted-domain RPC evidence; it does not
claim natural feed observations, rendered controls or the complete #505 matrix.

The final case completes five assertion groups. Public HTTP accepts a one-coin
stake, a second independent same-event position and all remaining 198 coins, then
supports exact/conflicting replay and unrestricted reinvestment of winnings.
The ordinary secret-authenticated scheduler settles actual stored five-minute
deadlines. An actual owner reset before later maturity keeps settlement in the
original retired account.

| Actual stage | Observed result |
|---|---|
| Fresh shared setup | Real registered owner/member; explicit initial saved Harbor record 4 and normal 200 grant admission. |
| Public wager opens | Member 1 up, owner 1 down, member 198 up on the same asset; all 200 committed, available 0. |
| Retry and funds guards | Exact opening receipt replays; changed input conflicts 409; an extra 1 is refused for insufficient funds without another effect. |
| First real maturity | Normal CRON HTTP yields 2/0/396, total available 398; another scheduler call adds nothing. |
| Reinvestment and reset | Entire 398 reinvested through public HTTP; owner reset creates replacement 200; historical receipt stays immutable and fresh old scope is refused. |
| Second real maturity | Gross 796 pays only the retired original account; replacement stays 200 with one grant. |
| Private money | Registered owner/member wallet balances, ledger counts and sums stay unchanged; original and replacement shared ledgers reconcile. |

The scheduler endpoint discovers a global disposable queue. Aggregate considered/
settled/retried counts can include other fixture origins; assertions select only
this case's wager IDs/accounts. No shared queue, immutable wager, history, outcome
or clock was edited. The price fixture uses real UTC time; price direction is
controlled test data rather than a natural-return claim.

## Real anonymous guest

A separately prepared official anonymous GoTrue identity supplies a private
session file that is never printed or committed. The demo-enabled side API
verifies the real subject. The invited guest opens one coin through the same
public HTTP handler: available 1085→1084, exact receipt replay, no private wallet
history changes. This bounded guest case claims opening/replay only, not a
settlement or rendered flow. Its own/factory hashes are captured before/after;
its standalone production source snapshot is before-only. The enclosing
registered case separately captures the protected side/primary sources around
its longer interval. Do not treat that as a standalone guest after-snapshot.

## Source and fixture boundaries

Production candidate: `64ee02b360d68836b2de9247121ab47dc6a3ecbf`.
Existing API 58005, frontend 55105 and canonical worker remain unchanged. The
separate 58006 instance enables only the existing local demo feature flag and
keeps demo_mode false. It uses default real UTC clocks, production calendars,
relit reader, verifier, admin and financial transactions. The supplied saved
record is an eligibility fixture, not earned wins. Fresh admission is setup,
not conversion or public rollout. No hosted operation, deployment or migration.

Source manifests identify the running side process, factory/transport bytes,
scenario and prepared helper hashes. The recorded production comparisons are
empty against the candidate before/after. Original measured receipts/hashes
retain their source; a later line-wrapping cleanup is qualified by identical
Python ASTs and is not labeled a ten-minute rerun.

## Reproduce

With the prepared local-provider harness available:

```sh
cd backend
uv run --no-sync python -m tools.authenticated_economy.wager_http_fixture \
  --runtime /tmp/mp505-provider/runtime.json --directory /tmp/mp505-wager-side
```

In another terminal from the repository root:

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
  node frontend/scripts/authenticated-economy/http-wagers.mjs \
  --harness-root /path/to/prepared-harness --runtime /tmp/mp505-provider/runtime.json \
  --side-directory /tmp/mp505-wager-side --output /tmp/mp505-http-wagers
```

The side instance generates its own private scheduler token. It never changes
existing services. The quote source is a supported `market_service`/PriceFeed
transport injection; neither Auth nor financial responses are replaced.
The anonymous guest helper additionally requires an explicitly supplied private
local guest session file. Credentials remain outside the repository.

Data and exact checks: [summary](summary.json), [registered full report](report.json.gz),
[guest report](guest.json.gz) and [format qualification](format-qualification.json).

## Focused checks

The actual registered HTTP case passed five groups; the separate real anonymous
guest opening/replay also passed. Full backend Ruff, both Node syntax checks,
Python compilation and relative documentation/diff checks pass. A focused
transport probe validates Binance quote schema, strictly increasing real-time
prices and refusal to answer an Auth-host request. No broad application or balance
suite was rerun. The final formatting qualification preserves the original
measured source SHA and identical Python AST.

The observer report's `available` field subtracts committed from recorded balance.
For the retired account it describes archived uncommitted money, not permission
to spend; stale-origin HTTP intents remain refused and the replacement account
remains separate.

A [supplemental read-only observation](observed-quotes.json) independently reads
all four registered wagers and the guest wager after the cases. Every stored
`settle_at - opened_at` is exactly 300 seconds and every actual settlement occurs
after maturity. Original/closing prices and their production source fields are
retained as committed quote evidence under the explicitly declared transport
fixture. This observation does not relabel the guest opening script as a
standalone settlement driver.

The measured side API was stopped after the final observations. Primary services
and the separate guest API remain unchanged.
