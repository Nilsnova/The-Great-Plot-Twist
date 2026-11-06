# L — live systems

Used by the live-systems presenter and [L drills](../drills/L.md). Play-money systems have no real-money purchase, cash-out or prizes.

## What the player gets today

Weather is wired into the world, with source/freshness information and a recorded fallback. The Island Exchange has a tested server board, portfolio and trading rules, but no connected trading screen in this revision. The prediction kiosk, sports pavilion, arena/duel hooks and home building plots are presentation/reserved features, not complete live systems.

| System | Implemented boundary |
| --- | --- |
| Weather | Browser polling, Python provider/cache/mapping, visual output and attribution |
| Island Exchange | Public board; authenticated, feature-gated portfolio/trade API; atomic database trade rules |
| Prediction desk and sports | World art/hotspots and reserved flags; no implemented corresponding backend feature routes |
| Duels/arena and raid | World hooks and flags; no implemented combat/raid rules |
| Home islet | Place art, four plots and local signal-station interaction; no server construction economy |

## Files and data flow

Weather: `frontend/src/game.js` starts `frontend/src/net/weather.js` → same-origin `/api/weather` → `backend/server/weather/open_meteo.py`, `source.py`, `mapping.py` → normalized view → `frontend/src/world/weather.js`. Provider units map to bounded cloud/rain/fog/wind controls. Per-instance source cache is ten minutes, request timeout three seconds, browser polling ten minutes and HTTP response cache five minutes. Labels distinguish live, cache, stale and fallback; explicit demo mode makes no weather-provider call.

Exchange: `backend/content/market/companies.json` defines fictional companies → `backend/server/market/feed.py` obtains live values or explicit demo replay → `rules.py` maps prices/shared bases/day boundaries → `routes/market.py` returns a board. A trade sends units and a stable action identifier, not a trusted price → server arithmetic/limits → `store.py` and `supabase/migrations/20261106010000_island_exchange.sql` atomically change trade, position and wallet state.

The public board is readable with the market flag off and then does not persist bases. Portfolio/trade require identity and the flag. Rules include amplification 20–100, a 30% move circuit breaker for 15 minutes, a 25–400% initial-price range, 08:00 Lisbon rebasing, 2% fees, ten-minute minimum holding, 500-coin buy limit and 2,000-coin daily buy cap. Stale live prices block trading; a provider outage must not silently become public replay trading.

`backend/server/flags.py` defaults optional features off and rejects unknown names. `frontend/src/world/places/registry.js` defines hooks; a hook is not a backend implementation. D003 keeps authoritative balances and game effects on the server.

## Evidence

From `backend/`:

```bash
uv run --locked pytest server/tests/test_weather_mapping.py server/tests/test_weather_source.py server/tests/test_weather_open_meteo.py server/tests/test_weather_route.py server/tests/test_market_companies.py server/tests/test_market_rules.py server/tests/test_market_feed.py server/tests/test_market_routes.py server/tests/test_market_trade_rules.py server/tests/test_market_replay_breaker.py server/tests/test_market_store.py server/tests/test_market_limits.py
```

From `frontend/`:

```bash
npm test -- tests/weather.test.js
CHROME_PATH=/usr/bin/chromium npm run test:weather:wiring
```

Injected transport/clock tests exercise cache expiration, explicit demo/no-provider behavior, stale-price refusal, arithmetic and repeat actions. The browser wiring check exercises presentation with deterministic weather; none of these establish current provider availability or live database constraints.

## Known limits

- Hosted database state, concurrency and RLS need live validation before any real group session.
- The default market multiplier is high; the configured range is a rule, not a recommendation to enable trading without rehearsal.
- The weather cache is per server instance, not a global distributed rate limiter.
- Names in the company dataset are fictional proposals awaiting Nils's name check; do not imply legal clearance.
- The presenter rehearsal records no game progress and is separate from live Exchange or multiplayer behavior.
