# T26 · Island Harbor weather access

What this is: the agreed small UI task for PR #8. Used by Ianno and the peer reviewer.

- Responsible teammate: Ianno Hollensteiner (`Iannomh123456`).
- Branch: existing `docs/t26-weather-board-todo`; [PR #8](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/8).
- Goal: make the existing weather card reachable from the island Harbor after wave 4.
- Scope: Harbor model, game callback, narrow Harbor layout, regression tests and handover docs.
- Contract: reuse `openHarborStall('weather')` and `harbor.openWeather()`; weather is read from the existing fetcher. No API, table, wallet or dependency change.
- Acceptance: wave 3 locked / wave 4 available; weather, pirate effects and fallback visible; one dialog; Escape, focus and cleanup work; desktop/phone screenshots; documented frontend checks.
- Limits: no refresh while the card stays open; no live provider or physical-phone claim.
- Reviewer proposed: Johannes (`frcola`), a different human teammate.
