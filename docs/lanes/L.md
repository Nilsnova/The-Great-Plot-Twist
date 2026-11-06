# L — live systems

Used by the live-systems presenter and [L drills](../drills/L.md). This is the integrated candidate at `94a48ad`. All coins are play money, with no purchase, cash-out or prizes. Candidate checks and production activation are separate evidence.

## What is implemented

| System | Implemented boundary and remaining limit |
|---|---|
| Weather | Browser polling, Python provider/cache/mapping, source labels and recorded fallback. A label is not a guarantee that the provider is reachable now. |
| Island Exchange v2 | Public board, authenticated portfolio/open/close API, 10× rising/falling positions, zero-only loss bound and atomic wallet/position receipts; browser panel is wired to the existing session transport. |
| Predictions and Lantern Duels | Screens, feature-gated services, strict intents and atomic outcomes; real signed-in browser use still depends on an actual session. |
| Home islet | Server-authoritative building costs and immutable signal-station ownership; the case proof builds a station from starting resources. |
| Festival | Server-owned 48-hour timer, exclusive lamp reservations and friendly FIFO ring, plus a separate memory-only browser rehearsal. Activation remains feature-gated. |
| Host console | Verified-host read/clock controls and dedicated UI. Browser-supplied roles never authorize a host. |
| Sports | Fixture/source/stake/settlement boundaries and pavilion screen are implemented and checked. The live provider key is missing and the feature stays off. |

G9 remains paused: these systems do not imply that the normal authenticated browser mystery and multiplayer flow is connected. The optional ChatGPT helper remains off without an approved official website client.

## Trace the implementation

Weather starts at `frontend/src/net/weather.js`, reads `/api/weather`, and maps a provider/cache/fallback response into `world/weather.js`. Timeouts and freshness labels keep a failed outside service from silently becoming live data.

The Exchange screen is `frontend/src/screens/market/`. `backend/server/market/feed.py` obtains approved prices; `positions.py` computes values and fees with Decimal/integer rounding; `routes/market.py` validates the intent; `store.py` calls the reviewed `20261106090000_exchange_leverage.sql` functions. A request supplies company, direction, stake and action id, never a trusted price or balance change.

Current v2 positions amplify a real percentage move by ten. At the zero point or beyond, a position closes at zero and can never create debt. The maximum loss is its stake plus opening fee. V1's artificial price floor/ceiling and circuit breaker are absent. US stock prices respect market hours; stale/unusable prices do not silently become public replay trading. `STOCK_API_PROVIDER` remains `finnhub`.

Festival claims never add world lights or award money. Ring pairing uses the existing three-round, zero-stake A7 rules. Unknown browser writes retain the same action UID even if a later retry is rate limited. `?demo=1&festival=1` uses an isolated memory transport and cannot enable server writes.

## Evidence and checks

The [completed case release](../handoff/case-complete-release.md) records 69 production-rule mixes and real solo/four-player API-to-SQL journeys. New-wave API/SQL cases live in `test_festival_api_pg.py`, `test_host_console_api_pg.py` and `test_sports_complete_api.py`; they use disposable data and no live provider credential.

Run focused ordinary checks from `backend/`, without logging protected story details:

```bash
uv run --locked pytest server/tests/test_market_positions.py server/tests/test_market_routes_open.py server/tests/test_market_routes_close.py server/tests/test_festival_routes.py server/tests/test_sports_api.py --tb=no -q
```

From `frontend/`:

```bash
npm test -- tests/market tests/festival tests/sports
CHROME_PATH=/usr/bin/chromium CAPTURE_DIR=/tmp/festival-review npm run test:festival:ui
```

The browser gate checks production CSP/layout/audio plus a separate DEV gamepad/lifetime fixture. It does not prove provider availability, production authentication, physical-phone behavior or Safari. Keep those limits explicit when presenting.
