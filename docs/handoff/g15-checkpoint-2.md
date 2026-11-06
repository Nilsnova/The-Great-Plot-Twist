# G15 checkpoint 2: live sports pools

Owner: Nils. Runtime branch: `feat/sports-live-v2`; SQL branch: `feat/sports-sql`.
The original provider/rule/data checkpoint is preserved with its author and CC0 licence.

## Root wiring

Import `sports_from_settings` from `server.sports.service` and route module `sports`.
Store `app.state.sports = sports_from_settings(settings, clock=clock)` and register
`sports.router` with `/api`. Existing injected/custom services can be retained by making this
an optional `create_app` argument. Do not change market, predictions, case, flags or crons.

For the guarded local API tool, extend only its allowlists with tables `fixtures`,
`sports_stakes` and functions `sports_place_stake`, `sports_settle_fixture`; its existing
fixed-schema PostgREST subset supports every sports query. Tests explicitly add those ports
without modifying the tool. Migration `20261106180000_sports_desk.sql` must precede runtime code.

## HTTP contract

Every route is behind `sports`; off answers `404 feature_off`. Input objects forbid extra
fields. Public board takes no query parameters and caches successful responses for 30 seconds.
All player routes are signed in and private/no-store; player identity comes only from login.

- `GET /api/sports`: `{fixtures, source, provider, fetchedAt, attribution, rules, simulationNote}`.
  Each fixture has `id`, `sport`, `competition`, `home`, `away`, `kickoff`, `closesAt`, provider
  `status`, `source`, nullable scores, `picks`, `canStake`, and `pool`. Provider status is
  `scheduled|playing|finished|postponed|cancelled|suspended|unknown`. Source is `live|recorded`.
  Pool has `status: open|settled`, nullable `outcome`, `settlement`, `paidCoins`, `cutCoins`,
  `settledAt`, plus `total` and sparse `sides: {pick: {players, coins}}`.
- `GET /api/sports/mine`: `{coins, stakedToday, coinsLeftToday, stakes, checksUnavailable,
  rules, simulationNote}`. Each own stake has `id`, `fixtureId`, `pick`, `amount`, nullable
  `payout`, `createdAt`, fixture labels/sport/competition/kickoff/closesAt, pool `status`,
  nullable `outcome`, `settlement`, `settledAt`. Refresh verifies and settles terminal matches;
  unavailable checks leave pending stakes intact and set `checksUnavailable`.
- `POST /api/sports/stake`: `{fixtureId, pick, amount, stakeId}`. Picks are football
  `home|draw|away` or NBA `home|away`; whole amount 1–50, stakeId 8–64 ASCII letters/digits/`_-`.
  Success has `accepted:true`, `repeat`, `id`, `fixtureId`, `pick`, `amount`, `coins`,
  optional `stakedToday`, `simulationNote`. Exact retries survive provider outages and
  settlement. Reusing a stakeId with different intent gives `409 stake_id_conflict`.
- `POST /api/sports/settle`: `{fixtureId}` for a fixture in which the caller has a stake.
  Never send a result. Success has `settled:true`, `repeat`, `fixtureId`, `settlement`,
  optional `paidPlayers`, `paidCoins`, `cutCoins`, `settledAt`.

All times are aware ISO timestamps. Rules: minStake 1, maxStake 50, dailyCap 200,
poolCutPercent 5 (losing side), pickLeadMinutes 60. Refund reasons are `refund_void`,
`refund_no_winners`, `refund_one_sided`; other settlement is `winners`.

Errors use the normal API shape: 401 unauthorized; 404 feature_off/no_such_fixture or
player_not_set_up; 409 pool_closed/already_staked/daily_cap/stake_id_conflict/fixture_changed/
result_pending/stakes_changed/insufficient_funds; 422 validation_error/invalid_amount/invalid_pick;
502 database_error; 503 sports_unavailable/database errors. Retain stakeId after uncertain
502/503 responses; do not manufacture a new one when retrying. Provider credit belongs in
Settings > Credits. Display source, freshness and the play-money note in the sports flow.

## Configuration and remaining external proof

Required for live football: `SPORTS_API_PROVIDER=football-data.org`, server-only `SPORTS_API_KEY`.
Alternative: `SPORTS_API_PROVIDER=balldontlie` with its matching key. Root's metadata-only Vercel
check found no sports credentials. Nils must enter a provider key directly in Vercel; no account,
subscription, billing or secret access was performed by an agent. Do not activate until the
configured provider has passed a real credentialed fixture/result smoke check. OpenLigaDB is
not an automatic payout fallback: the inherited contract requires a second-source confirmation.
Missing configuration is unavailable; recorded data remains historical/read-only in demo mode.
No claim of credentialed provider compatibility is made by the synthetic HTTP tests.

SQL hash/review and exact gates are reported with the commits. No live writes, flags, Vercel
settings, pushes or GitHub Actions were performed by this package's agents.
