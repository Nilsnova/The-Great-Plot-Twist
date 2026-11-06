# L explain-back cards

Used with the [L lane page](../lanes/L.md) for Thu 19 and Sat 21 November 2026. Open source locally; line ranges are orientation aids for audited main and may move after integration. Explain the named function/test before opening the back. Do not project server-only case data.

## 1. A typo must not become a rollout — Easy

Open [backend/server/flags.py](../../backend/server/flags.py), lines 37–66 (`def default_flags`).

**Front:** Explain these lines. Why reject an unknown feature name instead of ignoring it?

<details>
<summary>Back — check your explanation</summary>

Silent typos conceal incorrect rollout state. Valid but unlisted features remain off. Reserved flags and hotspots are not evidence of an implemented system.

</details>

## 2. Map measurements into weather — Easy

Open [backend/server/weather/mapping.py](../../backend/server/weather/mapping.py), lines 192–211 (`def map_reading`).

**Front:** Explain these lines. Explain provider units, normalization and missing measurements.

<details>
<summary>Back — check your explanation</summary>

Values become bounded 0–1 controls; weather-code defaults fill missing measurements and the output includes a readable summary. Rendering controls are adapted data, not the raw provider response.

</details>

## 3. Prove demo does not call the provider — Safety / testing

Open [backend/server/tests/test_weather_source.py](../../backend/server/tests/test_weather_source.py), lines 228–239 (`def test_demo_mode_never_asks_open_meteo_and_uses_the_recorded_answer`).

**Front:** Explain these lines. What assertion proves network independence rather than merely a plausible weather response?

<details>
<summary>Back — check your explanation</summary>

Inject a fake transport and assert the recorded fallback and absence of outgoing calls. Test the later cache boundary too: a rehearsal must not suddenly refresh from the real provider.

</details>

## 4. Disclose freshness — Medium

Open [backend/server/weather/source.py](../../backend/server/weather/source.py), lines 112–139 (`def make_weather_source`).

**Front:** Explain these lines. Use adapters/base.py to distinguish cache, stale and fallback.

<details>
<summary>Back — check your explanation</summary>

Cache is a recent successful response; stale is an older successful response retained during failure; fallback is a bundled recording when no newer usable answer exists. Source and timestamp let the player see the difference.

</details>

## 5. Dispose a polling loop — Medium

Open [frontend/src/net/weather.js](../../frontend/src/net/weather.js), lines 81–121 (`export function startLiveWeather`).

**Front:** Explain these lines. What happens on refresh failure or game disposal?

<details>
<summary>Back — check your explanation</summary>

Retain the last good weather rather than clearing the world. Disposal stops future refresh/update work, preventing duplicate polling loops after recreating the game.

</details>

## 6. Money arithmetic and the market day — Medium

Open [backend/server/market/rules.py](../../backend/server/market/rules.py), lines 135–186 (`def price_from_real`).

**Front:** Explain these lines. Why Decimal, bounded prices and Europe/Lisbon instead of host-local time?

<details>
<summary>Back — check your explanation</summary>

Explicit decimal arithmetic/rounding makes prices predictable. Bounds constrain the simulation. Named-timezone market days handle Lisbon daylight-saving changes independently of the machine timezone.

</details>

## 7. A circuit breaker preserves ownership — Medium

Open [backend/server/market/rules.py](../../backend/server/market/rules.py), lines 198–225 (`def pause_company`).

**Front:** Explain these lines. Does pausing sell the player’s shares or erase the position?

<details>
<summary>Back — check your explanation</summary>

No. It freezes the quoted price/trading for the pause interval and changes market state; ownership remains. Explain which state is persisted and how the later evaluation resumes.

</details>

## 8. Outage is not permission to replay — Hard / safety / testing

Open [backend/server/market/feed.py](../../backend/server/market/feed.py), lines 341–355 (`async def get(self, max_age_seconds`).

**Front:** Explain these lines. Open server/tests/test_market_feed.py. Why must a live outage not silently trade on a public recording?

<details>
<summary>Back — check your explanation</summary>

Replay is explicit demo mode. A live failure can yield stale prices, which must block trading. Public known rehearsal prices are not a safe substitute for authoritative live trading; fake-clock/transport tests distinguish these modes.

</details>

## 9. The server prices the trade — Hard / safety

Open [backend/server/routes/market.py](../../backend/server/routes/market.py), lines 198–216 (`class TradeRequest`).

**Front:** Explain these lines. Why does the request omit a trusted price or coin delta? Read post_trade and the market_trade migration.

<details>
<summary>Back — check your explanation</summary>

D003 makes the server compute price and arithmetic. The constrained database function atomically rechecks rules and updates position, trade and ledger. A repeated actionUid must not apply a second trade.

</details>

## 10. Distinguish refused, repeated and uncertain — Hard / safety / testing

Open [backend/server/tests/test_market_routes.py](../../backend/server/tests/test_market_routes.py), lines 1079–1183 (`def test_a_repeated_action_uid_is_a_409_already_applied`).

**Front:** Explain these lines. Find already_applied/prices_stale/timeout cases; compare test_market_trade_rules.py. Why different responses?

<details>
<summary>Back — check your explanation</summary>

Already-applied is a known repeat; stale prices are a refusal before mutation; a database timeout can have committed. Read portfolio/history before deciding to retry and retain the action identifier. A transport error alone is not evidence of rollback.

</details>
