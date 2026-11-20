# What happens when something fails

> **What this file is:** one page that answers "what happens if a key is missing, a provider is down or the
> connection drops?" for every outside part of the game, with the test that proves each answer.
>
> **Who uses it:** every member in the walkthrough (course question: *what happens when an external API is
> down?*), and whoever runs the demo. Checked against `main` on 20 Nov 2026.

**The rule behind all of it:** the browser never calls an outside service. It only calls our own server
(`/api/...`). The server wraps every outside call in one pattern, `CachedSource` in
[backend/server/adapters/base.py](../backend/server/adapters/base.py), which tries in this order and stops
at the first that works:

1. the fresh value in its cache,
2. a live call, cut off after a timeout,
3. the last good value, marked **stale**,
4. a recorded fallback saved in the repository, marked **fallback**,
5. nothing left: `503` with a plain message, in the same error shape as every other error.

After a failed call it waits before calling again, so a provider that is down is not hammered.
Proof: [test_adapters_base.py](../backend/server/tests/test_adapters_base.py)
(`test_failed_refresh_returns_the_last_good_data_marked_stale`,
`test_with_no_good_data_the_recorded_fallback_is_used`,
`test_source_unavailable_is_a_503_in_the_standard_error_shape`).

## Part by part

| What fails | What the server does | What the player gets | Proof |
|---|---|---|---|
| **Weather** (Open-Meteo, needs no key) is down | Sends the last good reading as `stale`; with none, the recorded reading as `fallback`; with neither, `503 source_unavailable` | The weather board keeps showing weather and says where it came from. A new wave is never stopped by the weather: it falls back to the default place, then to a calm sea ([wave_weather.py](../backend/server/island/wave_weather.py)) | [test_weather_route.py](../backend/server/tests/test_weather_route.py): `test_when_open_meteo_is_down_the_recorded_answer_is_sent_and_says_fallback`, `test_when_open_meteo_goes_down_later_the_last_good_answer_is_sent_as_stale`, `test_with_no_open_meteo_and_no_recorded_answer_it_answers_503_in_the_standard_shape` |
| **Crypto prices** (Binance, needs no key) are down | Keeps the old prices and marks them `stale` with their time, for as long as the source is away | Prices stay on the board with their time. **Nothing is traded or closed on a stale price**, so nobody wins or loses on old data ([states.py](../backend/server/market/states.py)) | [test_market_feed.py](../backend/server/tests/test_market_feed.py): `test_after_a_good_answer_a_failure_gives_the_old_prices_marked_stale_with_their_time`, `test_a_failure_during_a_trade_gives_stale_prices` |
| **Stock key missing** (`STOCK_API_KEY` empty) | The stock source is switched off, with one warning in the log | Stocks show as `unavailable` (`source_off`); the island companies on Binance still work | [test_market_stocks.py](../backend/server/tests/test_market_stocks.py): `test_the_source_is_off_with_one_warning_when_the_key_is_empty`; [test_market_states.py](../backend/server/tests/test_market_states.py): `test_a_stock_without_a_source_is_unavailable_with_source_off` |
| **Stock provider fails or the key is wrong** | Keeps the last price, marked `stale`. The key travels in a header, never in the address, and never reaches a log line | The stock shows its last price as stale and cannot be traded | `test_after_a_good_price_a_failing_provider_leaves_the_old_price_marked_stale`, `test_the_key_never_appears_in_a_log_line_when_a_call_fails`, `test_the_key_goes_in_a_header_and_never_in_the_address` |
| **Football key missing or provider down** (`SPORTS_API_KEY`) | Fails closed: `503 sports_unavailable`, "Current sports results are not available right now." | The match board says results are not available; no stake is settled on a guess | [test_sports_source.py](../backend/server/tests/test_sports_source.py): `test_missing_credentials_are_unavailable_and_demo_recordings_remain_historical_and_readonly` |
| **The database** (Supabase) cannot be reached | `503 database_unavailable`, "The database is not available right now. Try again soon." | The card that was open shows that sentence; nothing is half-saved, because paying and building happen in one database step | [test_supabase_admin.py](../backend/server/tests/test_supabase_admin.py): `test_server_errors_become_database_unavailable`; browser: `npm run test:outage` |
| **Sign-in** (Supabase Auth) cannot be reached | `503 auth_unavailable`; with missing settings `503 auth_not_configured` | "Login is not available right now. Try again soon." A wrong or expired token is a plain `401` | [test_auth.py](../backend/server/tests/test_auth.py): `test_supabase_down_is_503_auth_unavailable` |
| **A bug on our own server** | `500 server_error`, "Something went wrong on our side. Try again." Only the error's class name is logged, never private data | That sentence, not a stack trace | [errors.py](../backend/server/errors.py); [test_app.py](../backend/server/tests/test_app.py): `test_unexpected_error_hides_all_details` |
| **The player's connection drops, or an answer is lost** | n/a | The open card says "No connection to the server. Check your internet and try again." or "The server took too long to answer. Try again." The button works again on the next press. Every paid action carries an action id, so a repeated press after a lost answer is **paid once** | `cd frontend && npm run test:outage` ([check-outage-feedback.js](../frontend/scripts/check-outage-feedback.js)): 8 actions × 3 failures |
| **A narrator voice file is missing** | n/a (voices are made in advance with ElevenLabs and shipped as files; the game never calls ElevenLabs) | The caption still shows, without sound | [frontend/tests/narrator/](../frontend/tests/narrator/) |

## Where the keys live

`STOCK_API_KEY`, `SPORTS_API_KEY` and the Supabase secret key exist only in Vercel's settings and in a
private `.env` that Git ignores. They are never sent to the browser and never committed
([WALKTHROUGH.md](WALKTHROUGH.md), "Secrets"). Open-Meteo and Binance need no key at all.

## What this page does not prove

- The checks use fake providers and a fake server. No test switches off the real Open-Meteo, Binance,
  Finnhub, football-data.org or Supabase.
- `npm run test:outage` covers eight island actions on the fake server. It does not cover the Harbor
  stalls' own screens, sign-in in the browser, or a failure in the middle of a wave.
- Live multiplayer (Supabase Realtime) going away during a wave is not covered here; see
  [TEST-MAP.md](TEST-MAP.md), section 7.
- What to do during the demo when something is down is in [RUNBOOK.md](RUNBOOK.md).
