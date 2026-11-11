# Recorded sports data

Real league results for the sports desk's offline simulation. Used by `server/sports/recorded.py`.
These are historical results, never pretend upcoming fixtures or authoritative updates to live pools.

`recorded/epl-2023-opening.json` preserves the first three match objects and competition name from
[OpenFootball football.json, 2023-24/en.1.json](https://github.com/openfootball/football.json/blob/e6744429ee395bc86f247348c6184bb08d4eb361/2023-24/en.1.json).
Whitespace was reformatted; fields and values were not changed. This is an excerpt of a real public
JSON response, not a captured football-data.org or balldontlie answer. The complete upstream response
had SHA-256 `03e13eafbf78dfe00d7e89dd3bf6643986eb6e8fd86c7664aeb8c5bc0bed88d0` when retrieved
on 6 Nov 2026. The upstream revision above pins both the data and its CC0 1.0 Universal licence;
the complete licence is retained in `recorded/LICENSE-OpenFootball.md`.

The records are Burnley-Manchester City (0-3), Arsenal-Nottingham Forest (2-1), and
Bournemouth-West Ham (1-1), all from the opening round of the 2023/24 Premier League.
Their six team names are the team's text labels; no crests, player information or remote assets
are included. OpenFootball's raw date/time fields have no timezone. The loader interprets these
English league kickoff times in `Europe/London`, explicitly, rather than labelling them UTC.
It assigns separate `recorded-epl-...` identifiers, never invented upstream provider identifiers.

The adapter tests contain **synthetic** provider-shaped HTTP responses, with fake ids and a
test-only authentication string. They are schema tests, not claims of captured real responses.
No test contacts a provider or uses an account. The balldontlie endpoint and authorization header
follow its [official TypeScript SDK](https://github.com/balldontlie-api/typescript/blob/84d69418282d2ce4699460cdc359fabe5009855f/src/nba.ts),
`/nba/v1/games/{id}`. A date-only NBA answer cannot establish a safe tipoff cutoff and is refused;
an aware `datetime` or `date` is required. Live API compatibility and account permissions have
not been verified with credentials.

`SPORTS_API_PROVIDER` accepts empty, `football-data.org`, or `balldontlie`.
`SPORTS_API_KEY` is server-only. Either empty setting, `DEMO_MODE=true`, or the `sports` flag off
selects no live adapter and makes no provider request. Keys travel only in HTTPS headers to fixed
provider hosts. Football settles on the 90-minute result; optional NBA is regular season. A cancelled,
postponed or suspended fixture refunds; unknown/incomplete results cannot settle. Picking closes
one hour before kickoff, matching L5's minimum event lead time.

Checkpoint 1 deliberately adds no routes or coin movement. The generic L5 pool arithmetic and
stake caps must be reused when its prediction desk is merged into `origin/main`. Subsequent work
must cache provider requests, distinguish recorded/stale/live data, enforce caps in atomic SQL,
and put data attribution only under Settings > Credits, as required by G15.

## Live pools (checkpoint 2)

Live sports now requires `SPORTS_API_PROVIDER` and its server-only `SPORTS_API_KEY`.
Missing configuration answers `503 sports_unavailable`; it does not silently substitute the
recording. Only explicit `DEMO_MODE=true` displays the unchanged 2023 historical results, with
`source: recorded`, original dates and staking disabled. No real provider account was used to
validate this package; provider-shaped HTTP fixtures are synthetic and labelled in the tests.

The default football board discovers up to 40 fixtures within the next seven days of the
competitions in `SPORTS_COMPETITIONS` (default `PL,PPL,CL`), with one request to football-data.org's
fixed `/v4/matches?competitions=...` endpoint (D033). The alternative NBA board
uses one bounded page from balldontlie's `/nba/v1/games`. Discovery and individual readings are
cached for 60 seconds; settlement always requests a fresh result and never falls back on stale
or recorded scores. Requests are limited per server instance to 10/minute for football-data.org
and 5/minute for balldontlie. Unknown statuses, incomplete scores, wrong identities, competitions
outside the free plan and ambiguous NBA timestamps fail closed. Football settles on the
90-minute score (`regularTime` after extra time or penalties). The provider credit is supplied as `attribution` for
Settings > Credits; match names remain plain text without team crests.

A player stakes 1-50 play coins once per fixture, with a separate 200-coin sports cap per Lisbon
day. The earliest known cutoff is binding, one hour before kickoff; a reschedule cannot reopen
it. The prediction desk's shared integer pool rules distribute the pool, deducting 5% of the
losing side rounded down. Void, winnerless and one-sided pools refund in full. The two existing
wallet reasons are reused with distinct `sports:stake:<stakeId>` and `sports:pool:<fixtureId>`
references, so sports receipts cannot collide with prediction desk receipts.

Opening My Stakes or sending `{fixtureId}` to the settlement route verifies the result and
settles atomically. Clients never submit an outcome or score. The database independently checks
provider/fixture identity, terminal status, final scores, exact stake membership, all payout
amounts and conservation before it touches wallets. Settled results cannot be reopened. A
provider outage leaves stakes pending; the same stake id safely retries an unknown outcome.

Configure live credentials directly in Vercel, never in chat, GitHub or a browser-prefixed
variable. Leave `STOCK_API_PROVIDER=finnhub` and all existing settings intact. Redeploy and run
credentialed provider smoke checks before adding `sports` to `FEATURE_FLAGS`. No cron is needed.
