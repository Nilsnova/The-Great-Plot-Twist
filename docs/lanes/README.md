# Lane handover pages

Used for the course walkthrough and explain-back. These pages describe implemented code on the release candidate `94a48ad`, not a promise that every backend route has a connected game screen.

| Lane | Player-facing responsibility | Walkthrough |
| --- | --- | --- |
| G | World, graphics, input, travel, presentation | [G — world and graphics](G.md) |
| S | Intro, mystery rules and story presentation | [S — story and mystery](S.md) |
| A | Accounts, identity, cloud state and crews | [A — accounts and multiplayer](A.md) |
| L | Weather, Exchange, predictions, duels, islets and optional festival/sports | [L — live systems](L.md) |

Pair each page with its [drill cards](../drills/README.md). Commands start in the directory stated. Browser checks need an installed Chrome/Chromium and `CHROME_PATH`; run GPU checks sequentially. Pure tests and mocked API tests do not establish live Supabase permissions or a deployed integration.

Read [ARCHITECTURE.md](../ARCHITECTURE.md), [ENGINEERING.md](../ENGINEERING.md) and [INTERFACES.md](../INTERFACES.md) for shared contracts. Do not open server-only case content on the projector.
