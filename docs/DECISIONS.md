# Decision log

Record choices that affect other contributors: game behavior, architecture, shared interfaces, dependencies, data storage or deployment. Routine implementation details belong in the PR.

Add short entries; keep the original rationale when superseding a decision.

## D001 · Shared collaboration workflow · 2026-11-05

**Status:** Proposed in the collaboration setup PR; accepted when reviewed by another teammate and merged.

**Decision:** Equal teammate authority; task branches; small PRs; one independent human review; explicit agent handovers. See [CONTRIBUTING.md](../CONTRIBUTING.md).

**Why:** Allow parallel human/agent work while keeping changes understandable and protecting each person’s contributions.

**Alternative:** Direct shared pushes to main. Rejected for the proposed workflow because overlapping changes would be harder to review and reconcile.

## D002 · Hosting: Vercel Hobby with two Services, Supabase Free in Ireland · 2026-11-05

**Status:** Proposed in the foundation PR; accepted when reviewed by another teammate and merged.

**Decision:** One Vercel project on the free Hobby plan runs two Vercel Services: the game in `frontend/` (a static Vite build) and the Python API in `backend/` (FastAPI, entry `main:app`). `vercel.json` sends every `/api/...` address to the backend and everything else to the frontend, so both share one address. Functions run in one region, Dublin (`dub1`). The database, the GitHub sign-in and realtime come from one Supabase Free project in West EU (Ireland, `eu-west-1`), set up with the Data API on, "Automatically expose new tables" off, "Enable automatic RLS" on, GitHub as the only sign-in and no Supabase GitHub integration. The build stays portable, a static site plus a separate Python API, because the course may still publish deployment rules. We do not email the teaching team about hosting.

**Why:** Both services have free plans. One address for the game and the API needs no cross-origin setup. Rules in Python can be tested with pytest, as in the course. The functions run next to the database. A portable build makes a later move cheap.

**Alternatives and trade-offs:** A Vite app at the root plus `api/index.py`: Vercel documents file-based Python functions for existing projects and points new apps to a FastAPI preset or to Services. Two separate Vercel projects: the fallback if Services, still a Beta, lets us down. Paris (`cdg1` with Supabase `eu-west-3`) is a little closer to Lisbon; Ireland was chosen when the project was created. Trade-offs: whether cron works together with Services is undocumented, so the daily keep-alive call waits for the first deploy; preview and production share the one Supabase project; a free Supabase project pauses after 7 days of low activity. Update, 5 Nov 2026: a `crons` entry in `vercel.json` stopped our production deploys (fixed in commit `409316e`), so `vercel.json` must never get one while we use Services; what calls the keep-alive once a day became an open decision, and later that evening Nils chose a scheduled GitHub Actions workflow (`.github/workflows/keepalive.yml`) (see the keep-alive section of [ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)).

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the foundation PR (`chore/foundation`). Affects everyone: `vercel.json`, `backend/main.py`, [SETUP.md](SETUP.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## D003 · Rules live on the server; the browser never writes game data · 2026-11-05

**Status:** Proposed in the foundation PR; accepted when reviewed by another teammate and merged.

**Decision:** Game rules live in Python on the server (`backend/server/`), tested with pytest. The browser shows the game and sends intents; it never decides money, progress or names. A signed-in player may only read: every profile and wallet reason, plus their own save, wallet, ledger rows and crews. Every write goes through the server with the secret key. Saves are written only by the server: the sign-up trigger creates an empty save, and the first package that saves progress adds a server route that checks the data first. Display names are written only by the server too: at sign-up every player gets a neutral placeholder (`Captain-` and 6 characters of their id), never the GitHub login. The database also guards itself, with explicit grants and row-level security on every table, constraints, and one atomic wallet function.

**Why:** Anyone can change the code that runs in their own browser, so a rule enforced there is no rule. Plain Python functions are easy to test with pytest and to explain line by line. The database refuses what is not allowed even if the Python has a bug. Names appear on a projector, and players control their own login details.

**Alternatives and trade-offs:** Letting the browser write its own save or name under row-level security: rejected, because a player could then write any progress or any name. Foundation wave 1 still took the display name from the GitHub login and let players rename themselves; wave 2 removed both. Trade-off: every action that changes something is a round trip to the server.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the foundation PR. Affects every package that changes game state: each write needs a server route ([ENGINEERING.md, recipe 4.1](ENGINEERING.md#41-add-an-api-endpoint)) and keeps the policy matrix in [supabase/README.md](../supabase/README.md#who-may-do-what) true. Generated captain names follow in package A2.

## D004 · Play-money wallet: one ledger, every balance starts at 0 · 2026-11-05

**Status:** Proposed in the foundation PR; accepted when reviewed by another teammate and merged.

**Decision:** Coins are play money only: they cannot be bought, cashed out or exchanged for real prizes. One wallet per player and one ledger (`wallet_transactions`) serve every money feature. A new wallet starts at 0 coins (`STARTING_BALANCE`) and the sign-up trigger writes no ledger row; coins arrive from the entry kit (`kit_grant`) and from rewards. Every change names a reason from the table `wallet_reasons`, and each reason has a direction: `earn` adds coins, `spend` takes them away, `either` may do both. Only the server moves coins, through one atomic database function (`apply_wallet_transaction`) that checks the reason, its direction and the balance and writes the ledger row in the same step. Every coin change needs a `ref` (Python and the database both refuse a missing or blank one), and the ledger holds each player, reason and `ref` once, so a repeated request changes nothing. The first eight reasons are `kit_grant`, `clue_reward`, `mystery_reward`, `event_reward`, `cargo_sale`, `clue_purchase`, `building_purchase` and `admin_adjust`.

**Why:** Every money-like feature shares one wallet, defined once (Nils' roadmap inputs). A ledger that only the server writes means no player can edit their own balance, and every balance can be explained row by row. One atomic function cannot spend the same coins twice. Play money with no cash-out and no prizes keeps the game clear of gambling: Supabase's acceptable use policy forbids facilitating unregulated gambling, Vercel Hobby is for non-commercial use only, and Portuguese law defines gambling around money (our reading of the sources, not legal advice).

**Alternatives and trade-offs:** Foundation wave 1 gave every new player 1000 coins with a `starting_grant` ledger row, and fixed ten reasons in a check rule on the ledger. Wave 2 replaced both: coins now come from the game, and a new reason is one new row plus one Python line ([ENGINEERING.md, recipe 4.7](ENGINEERING.md#47-add-a-wallet-reason)). Trade-offs: the sign of an amount is checked by the function and by Python, not by a table rule, because a table rule cannot look into another table; and a `503` from the wallet means the outcome is unknown.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the foundation PR. Affects every money feature: each adds its reasons by migration and says in its spec where its `ref` comes from.

## D012 · Crews and seats: up to four seats, each a player or an NPC partner · 2026-11-05

**Status:** Proposed in the foundation PR; accepted when reviewed by another teammate and merged.

**Decision:** A crew has up to four seats, numbered 1 to 4. Each taken seat holds exactly one of two: a player, or an NPC partner (a crew mate the game runs). A seat nobody holds has no row. Solo play is a crew of one player in seat 1 with NPC partners in the other seats. With friends, NPC partners fill any empty seats, and a friend can take over an NPC partner's seat. Only the server writes crews and seats, and a player reads only the crews they sit in. The server, not the database, makes sure a player has at most one active crew.

**Why:** Nils asked for a game that is also playable alone, with NPC partners in the empty seats, and for this to be in the foundation from the start. One model for solo and group play means one set of rules and tests.

**Alternatives and trade-offs:** A seat's player link set to empty (`on delete set null`) when the player is deleted: rejected, because a seat with neither a player nor an NPC partner breaks the rule "exactly one of the two", so deleting a seated player would fail. With `on delete cascade` the seat row goes with the player (tested on Postgres 17 in wave 2). Trade-offs: the database does not stop one player from holding two seats in one crew, or one NPC partner from sitting twice, so the server must; deleting the player who started a crew deletes the whole crew.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the foundation PR. The team roadmap reserves D005 to D010 for other decisions and D012 for this one. Affects A6 (crew routes and codes), S4 (NPC partners), and S3 and L3 (rules that count seats). What NPC partners do in the mystery is defined by the story package S0 (skeleton under review).

## D005 · Look: original top-down pixel art · 2026-11-05

**Status:** Decided by Nils; recorded with the graphics package G1, which is merged into `main`.

**Decision:** The game is drawn in original top-down pixel art: sprites authored by our own code (the generator in `frontend/scripts/pixel_art/`), one world unit = 16 native pixels, nearest-neighbour scaling, snapped positions, and gold kept for light, interaction and clues. Every asset and its source is listed in `frontend/ASSETS.md`.

**Why:** Nils found the first low-poly 3D diorama generic, tried an illustrated paper style, and approved the pixel-art gameplay presentation on 5 Nov 2026. Pixel art gives the game a clear identity, stays light on student laptops and lets one generator keep every new sprite in the same style.

**Alternatives and trade-offs:** Light 3D low-poly (first study) and a flat illustrated "nautical journal" paper style (second study), both kept only as superseded iteration material. Trade-off: every new place, building and character needs new sprites from the generator.

**Agreed by, PR and impact:** Nils, 5 Nov 2026, in his session with Codex; merged into `main` as `45d2d46`. Affects every visual package (G2, G3, G4, L2) and the art list in the story documents.

## D013 · Story decisions for the skeleton v1 · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026 when he approved the story skeleton ([docs/STORY.md](STORY.md)).

**Decision:** (1) Each crew plays its own copy of the case; the first solve anywhere relights the coast for everyone. (2) Story v2 makes small `story.json` edits only. (3) NPC partners v1 are scripted errand runners. (4) The class demo is very short and shows highlights only. (5) The culprit is the harbor master; characters have titles, not personal names (Elena Vos stays the only named character).

**Why:** These five choices meet Nils' rules at once: a joint puzzle for four players in about two hours, playable alone, a world that changes and keeps going, and a fair twist built on lines that are already in the original game.

**Alternatives and trade-offs:** One global case solved once (later players could only read about it); a bigger rewrite of the intro; NPC partners with free hints or an AI voice; the demo as a live first solve. Trade-off: copies per crew need a clear rule for what the first solve changes for everyone (detailed in the story detail round).

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Affects S0 to S4, L3 and A6.

## D015 · Coordination merges by Claude under the owner's authorization · 2026-11-05

**Status:** Decided by Nils (repository owner) on 5 Nov 2026.

**Decision:** Claude may push branches and merge its own verified coordination work into `main` without a teammate's approval (merge commits; tests, build and a secret scan first), and records each such merge in [docs/STATUS.md](STATUS.md). The first one was the bootstrap merge `a0e501a`. Teammates' changes keep the peer-review rule of D001.

**Why:** Nils wanted the team to start from a working `main` the same day, before the teammates had joined, and authorized Claude to push and merge without asking, keeping questions for important decisions.

**Alternatives and trade-offs:** Wait for a teammate's review of every early change (slower start). Trade-off: early `main` history was not peer-reviewed, so the team reviews it afterwards, commit by commit, at kickoff.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Affects how `main` gets coordination and integration work; it never replaces review for teammates' own packages.

## D007 · Plot Twist imported as an unchanged copy · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026 (the team brings the story into this repository, so nobody needs the private solo repository). Proposed in the S1 pull request; accepted when reviewed by another teammate and merged.

**Decision:** Nils' solo game Plot Twist (*The Keeper's Last Log*, his private repository `Plot-Twist`, branch `main` at commit `e235ee4`) is brought into this repository as a copy. The story file is byte for byte the original (SHA-256 `3713d17a778d7ad3cfe8a8f24e33810bc96a54e1f8be90f3babf15d5698c66a2`). The Python engine, the JavaScript engine and the 11 original tests (9 acceptance and content tests, 2 parity tests) are ported with the same rules and the same assertions. Only what the web game needs changed: where the files live, a `save_path=None` option so the server never writes files, ES-module syntax and an injectable storage in the browser engine. The terminal game (`cli.py`) and the old web interface are not imported. The solo repository is never changed. The provenance note is in [backend/content/README.md](../backend/content/README.md#where-this-story-came-from). Where the content folder lives is a separate decision, D016.

**Why:** Nils decided that the team writes the next version of the story itself, so everything it needs must be in this repository. A copy with a provenance note keeps the original traceable, and unchanged rules mean the 11 original tests still prove that the game works.

**Alternatives and trade-offs:** Keep the game in the private solo repository and copy files when needed: Nils decided against it. Rewrite the engines: not needed, because the original rules and tests work, and decision 2 in D013 keeps the engines frozen. Trade-off: there are now two engines, one in Python and one in JavaScript, that must stay equal rule for rule. The parity test (`backend/plot_twist/tests/test_web_parity.py`) fails when they differ.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the S1 pull request (`feat/s1-import-plot-twist`). Affects S2 (the story in the browser) and A3 (the referee replays the move log with the Python engine).

## D016 · Server content lives in backend/content/; the browser gets public content through the API · 2026-11-05

**Status:** Proposed in the S1 pull request. It stays proposed until Nils accepts it and a different teammate has reviewed it, because it moves the content paths of S3, S4, A2, A3, L2, L4 and L5.

**Decision:** Game content that the server uses (the story, the case, names, buildings, companies, questions) lives in `backend/content/`, not in a `content/` folder at the repository root. The format of each file is written in [backend/content/README.md](../backend/content/README.md). Public content, which the browser needs in order to play, is served by `GET /api/content/{name}`, and only for the names on a fixed list in `backend/server/routes/content.py` (today `intro-story`). Secret content, for example the real solution of the case, lives in `backend/content/secret/` and is never served. Data that only the browser uses, such as the place registry `frontend/src/world/places/registry.js`, stays in `frontend/`.

**Why:** Vercel builds each service from its own folder only (D002): the API from `backend/` and the game from `frontend/`. The Python runtime bundles the service folder, so files inside `backend/` reach the API, while files in a root `content/` folder may not (the roadmap flagged this risk for S1). The game is built from `frontend/` only, so a secret file in `backend/` cannot end up in the game by accident. That matters for the case solution.

**Alternatives and trade-offs:** A root `content/` folder read by both services (the first proposal in the roadmap): the API may not see it on Vercel, and the game build could pick up a secret file by accident. Two copies of each file, one per service: the copies would drift apart. Trade-offs: the browser downloads public content with one API call instead of having it inside the bundle. The route sends `Cache-Control: public, max-age=300`, which only browsers obey. So a changed story takes up to five minutes to reach a page that is already open, and every new visitor still starts the API function. Whether to add `s-maxage=300` for Vercel's network is open; if we do, check on a preview that the header `x-vercel-cache` says HIT. Not checked yet: that the deployed API finds `backend/content/story.json` (A3 checks it on a preview).

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the S1 pull request (`feat/s1-import-plot-twist`). Not accepted yet. If it is accepted, these content files go under `backend/content/`: `secret/case.json` for S3, `partners.json` for S4, `names.json` for A2, `entry_kits.json` for A3, `buildings.json` for L2, `companies.json` for L4 and `questions.json` for L5. The roadmap, the interfaces page, the status page and the engineering rules already use these paths. If it is not accepted, revert those paths.

## D017 · Island Exchange rules · 2026-11-05

**Status:** Proposed in the L4 pull request (`feat/l4-island-exchange`); accepted when reviewed by another teammate and merged. The rules Nils gave on 5 Nov are the base. The choices that Nils did not specify are marked "chosen here" and need his OK. An independent review of the first version found three problems in the price and feed rules (players could trade on old prices, the recorded prices could be predicted, and prices sank toward one cent within days). The points marked "changed after the review" are the fixes, and they need his OK too.

**Decision:** The Island Exchange is play money only, and the server decides everything (D003, D004). Seven fictional island companies follow seven real instruments (BTC, ETH, SOL, XRP, BNB, EUR/USD through the Binance pair EURUSDT, and gold through PAXG). Rules:

1. **Amplified price.** Game price = base game price x (1 + multiplier x real change since the base), rounded to cents. The multiplier is the setting `MARKET_MULTIPLIER`, a whole number from 20 to 100, default 100 as Nils asked. With 100, a real move of 0.3 % is a game move of 30 %. **We recommend 20 to 30 for the class** (see "What the multiplier does in practice").
2. **Floor and ceiling (changed after the review).** *Chosen here:* a price never falls below 25 % of the company's start price (`startPrice` in `companies.json`) and never rises above 400 % of it, so a 60.00 company stays between 15.00 and 240.00. Both are measured from the start price, which never changes. The first version used a floor of 5 % of the base, but the base moves with every pause and the 30 % breaker always fired first, so the floor never acted: every pause locked in a step of 30 %, and the prices of volatile companies sank to one cent within days, where no real move could change them any more. A start price must be from 4.00 to 125.00, so that one unit is always worth a whole coin at the floor and fits into one purchase at the ceiling. A price that sits on the floor or the ceiling stays there until the real price has moved back past the real price of the base, or until the next daily re-base.
3. **Circuit breaker.** When the game price is 30 % from its base (up or down), the company is paused for 15 minutes. *Chosen here:* the price is frozen at the 30 % limit (a jump or a wrong tick cannot push it further), nobody can trade the company, and **shares are not sold** by a pause. After the 15 minutes the company restarts from the frozen price, and real moves are measured from the real price of that moment (the moves during the pause do not count).
4. **Daily re-base at 08:00 Europe/Lisbon.** The first look after 08:00 gives every company a new base. *Chosen here:* the game price stays and only the real starting point moves, so nobody's shares change value.
5. **Trades.** *Chosen here:* whole units; whole coins, always rounded against the player (a buy up, a sell down); a fee of 2 % rounded up on every buy and sell; a **purchase** worth 1 to 500 coins; a **sale** worth at least 1 coin and **no upper limit** (changed after the review: with a 500-coin limit on sales, a holder could not sell even one unit once a price had risen); at most 2000 coins of shares bought per player per market day (from 08:00 Lisbon); shares can be sold 10 minutes after the player's latest purchase of that company (every purchase restarts the clock); at most 10 trades per player in 30 seconds (new after the review, a brake against loops; it counts in memory, per server instance).
6. **One shared price, fresh for trades (changed after the review).** Real prices come from Binance market data (`data-api.binance.vision`, no key), one request for all seven. Players never call any price service. The board accepts real prices up to 60 seconds old (one request a minute per server instance). **A trade accepts only prices at most 5 seconds old** and asks Binance again if the cache is older (a rush of trades at the same moment is one request, so at most 12 requests a minute per instance). **If Binance is away,** the board keeps showing the last prices marked `stale`, and nobody can trade (`409 prices_stale`). After a failed request an instance asks again only 10 seconds later (at most 6 requests a minute while it fails), so one dropped request does not close the Exchange for a minute. The recorded replay (90 minutes from Binance Vision, CC BY-NC-SA 4.0, credit "Binance Vision") **never plays in live mode**: it is a public file and the minute that plays comes from the clock, so a player could read the next prices and trade against them, and every switch between live and recorded prices moves every price (rule 7). The replay plays only in demo mode (`DEMO_MODE=true`), where the Exchange never calls Binance and trading on it is allowed, so a demo or a rehearsal works without internet. Demo-mode prices are public: coins won on them must never count for anything real (a leaderboard, a prize).
7. **Source change.** If the real prices come from another source than when a base was set (an operator changes `DEMO_MODE` on a server that shares the database), the two real prices cannot be compared: the company goes back to its base game price and measures from the new source, which can step a price back by up to 30 %. All servers that share one database (the Vercel preview and production projects share one, D002) must therefore use the same `DEMO_MODE`.
8. **Database.** Wallet reasons `market_buy` (spend), `market_sell` (earn) and `market_fee` (spend). Tables `market_bases` (shared by every server instance, saved with a version number), `market_positions` and `market_trades`, all with row-level security and explicit grants. The function `market_trade()` moves the coins, changes the position and writes the trade in one step, and refuses a repeated ref. It also checks the arithmetic itself (changed after the review): the coins must follow from the units and the price, the fee from the fee rate, a purchase must not be over 500 coins, the market day cannot start in the future and the company must have a base. The ref is `market:<actionUid>`.
9. **API.** A repeat answers `409 already_applied`, and that is the first thing the server checks, so it is the answer to a repeat whatever has changed since (changed after the review: before, a repeat during a pause got `market_halted`). A switched-off feature answers `404 feature_off` on the player routes. The price board works anyway but then only looks and saves nothing, so the market does not start to move before the launch, and it takes no query parameters. Routes and errors are in [INTERFACES.md](INTERFACES.md#the-island-exchange-package-l4).

**Why:** Nils wants the Exchange to be a core feature, fun in a 90-minute class, and safe: prices that move visibly in minutes, with limits that stop runaway moves. Rounding against the player and the fee mean a round trip never makes coins from nothing (a test tries 195 combinations). Keeping the game price at a re-base avoids a free profit: if a re-base snapped every price back to its starting level, anyone could buy a company that is priced below its start and gain at the next re-base without any risk. Binance market data needs no key and no account, so the feed works without a teammate signing up for anything. The review showed that "no risk" must also hold against a player who watches Binance or reads the repository: prices that a trade uses must be current, and a recorded file must never be the live market.

**What the multiplier does in practice (our simulation).** The rules were played through the recorded minutes of 4 Nov 2026 (`backend/server/tests/test_market_replay_breaker.py` freezes the first two rows):

| Multiplier | Pauses in the 90-minute class slot (BTC, ETH, SOL, XRP, BNB, EUR/USD, gold) | Pauses in the whole day, crypto companies | Gold, EUR/USD |
|---|---|---|---|
| 100 (default) | 1, 3, 2, 2, 1, 0, 1 (10 in all; ETH paused 45 of 90 minutes) | 31 to 43 (paused 32 to 45 % of the day) | 12, 1 |
| 50 | 1, 1, 1, 1, 0, 0, 0 | 11 to 18 | 3, 0 |
| 20 | none | 3 to 6 (paused 3 to 6 % of the day) | 1, 0 |

At 100 the crypto companies are open for only about 18 to 32 minutes between pauses, and a player must hold shares 10 minutes before selling, so many holdings are paused or cannot be sold.

*Over several days* (our simulation: the board looked at once a minute, recorded 1-minute moves resampled with the trend taken out, 6 paths per company; `test_market_replay_breaker.py` freezes the main result for two companies). With the floor and ceiling of rule 2, no path ever reached one cent, but at 100 the prices spend most of the time near the floor, because every pause locks in a step of +30 % or -30 % and a series of such steps loses value on average:

| Multiplier | After 1 day: median price against the start price (the five crypto companies) | After 5 days | After 10 days |
|---|---|---|---|
| 100 | x0.25 to x0.64 | x0.26 to x0.36; 3 of 6 paths per company end on the floor | x0.25 to x0.38; 2 to 4 of 6 end on the floor |
| 30 | x0.54 to x0.94 | x0.33 to x0.99; 0 to 3 of 6 end on the floor | x0.35 to x0.91; 0 to 2 of 6 end on the floor |
| 20 | x0.66 to x1.03 | x0.62 to x1.16; none end on the floor | x0.47 to x1.24; none end on the floor |

EUR/USD and gold are calmer: at 100 their medians are x0.94 and x1.45 after 1 day, and x0.46 and x0.34 after 10 days.

Before the fix (floor of 5 % of the base) the same simulation at 100 left 1 to 5 of 6 paths per crypto company at one cent after 5 days, and 2 to 6 of 6 after 10 days. **We recommend a multiplier of 20 to 30 for the class.** The default stays 100 because Nils asked for it: set `MARKET_MULTIPLIER=25` on Vercel to follow the recommendation, or change `DEFAULT_MULTIPLIER` in `rules.py`.

*Players who watch Binance.* With a 60-second old price (first version) the amplified one-minute move was larger than the 4 % round-trip fee in 25 to 52 of the 89 recorded minutes for each crypto company at 100 (and in at most 1 minute at 20): anyone with a Binance chart could buy before a rise. With prices at most 5 seconds old, the moves a player can see before the game shows them are about a third as large (price moves grow with the square root of time; this is an estimate from the one-minute data, not a measurement). At 100 a large move of more than 4 % within 5 seconds is still possible in a few percent of the moments, so a very fast player keeps a small edge; at 25 it is out of reach.

**Review findings and what was done.**

| Finding of the independent review | What we did |
|---|---|
| Major: trades used prices up to 60 seconds old, or stale ones | Trades use prices at most 5 seconds old and are refused on stale prices (`409 prices_stale`); rule 6 |
| Major: the replay is public and predictable, and the switch snapped prices | Live mode never plays the replay; demo mode is documented as public prices; rules 6 and 7 |
| Major: prices sank to one cent within days | Floor and ceiling from the start price; rule 2 |
| Minor: the database trusted every number | `market_trade()` checks the arithmetic, the purchase limit, the company and the day start; rule 8 |
| Minor: a repeat could get another error | The repeat is checked first; rule 9 |
| Minor: some docs and tests did not match the code | Fixed (instances agree on the base and the pause, not on the price; the cache header; ten tables; the tests of the source change now move the price first) |
| Minor: the price board ignored the flag, any query string skipped the cache, no limit on trades | The board only looks while the flag is off, it takes no query parameters, and a player may make 10 trades in 30 seconds |
| Minor: a holder could not sell above 500 coins | A sale has no upper limit; a start price is limited so that one unit is always tradable |
| Minor: no link to the licence on the board | `licenceUrl` while the replay plays |
| Minor: shares of a company that is removed from `companies.json` could never be sold | Not changed in code. Rule for the team: never remove a company from `companies.json` while players may hold shares (see its README) |
| Minor: the breaker was measured on the rounded price | Not changed: with a floor of at least 3.00 coins, rounding to cents moves a price by at most 0.17 %, and the problem at one cent no longer exists |

**Alternatives and trade-offs:**

- *A fee of 3 %* (the roadmap) or 2 % (this brief): 2 % is built, one named number to change. The roadmap's example "buy 5 at 12.00 leaves 38.20" has fractions of a coin, which whole coins do not allow; with 2 % and whole coins it leaves 100 - 60 - 2 = 38.
- *CoinGecko as the primary feed* (the roadmap): it needs a key that a teammate must create, and a call limit of 10,000 a month. Not built; it stays a backup (D014 is reserved for the accounts and keys).
- *Snapping the game price back to its starting level at a re-base:* rejected, see above. *A gentle pull toward the start price at each re-base* (suggested by the review): not built. It is predictable (a player can buy shortly before 08:00 whenever a price is below its start and sell after the re-base), and at a multiplier of 100 a pull of a few percent a day cannot offset the loss of value from the pauses; at 20 to 30 it is not needed. *Settling (selling) all positions at the daily re-base:* would stop prices drifting far from their start, but it sells shares nobody asked to sell; not built.
- *Playing the replay when Binance fails* (the first version): rejected after the review, see rule 6. The price is that the live Exchange shows no prices at all if Binance refuses our server (HTTP 451 from US regions) and has never answered, so test it from the deployed function before the class, and use demo mode if it does not work.
- *A secret random shift of the replay in demo mode:* not built. Anybody can find the shift from the prices on the board by comparing them with the public file, so it would only hide the problem. Demo mode is for development and rehearsals.
- *An expected price in the trade request* (a trade is refused if the price moved by more than a small tolerance since the player saw it): not built, it is a decision for Nils. Today a player trades at the shared price of that moment, which can differ from the price on their screen (the board is cached for 30 seconds and the screen may poll less often) by a few percent at a multiplier of 100. The field can be added later without breaking the contract (it would be optional).
- *Daily price limits instead of pauses with re-basing* (the price may not leave 30 % around the day's opening, with no compounding): calmer, but a different rule from the one Nils gave; not built.
- *Known limits:* at a multiplier of 100 the prices spend most of a multi-day run near the floor (see the table), and buying at the floor then has a small edge for the player, because the price cannot fall further but can still rise (the fee, the holding time and the daily cap limit it). Each server instance prices from its own copy of the real prices. The speed limit on trades is per instance. The Exchange has no opening hours: the roadmap mentions an 08:00 to 22:00 day, but the instruments trade all night and nothing in the brief asked to close the market. Between visits a price is not followed, because it is only worked out when somebody looks: after a long quiet time the first look finds a large gap and a company usually pauses at once.

**Agreed by, PR and impact:** Nils' rules, 5 Nov 2026. The "chosen here" numbers (breaker freeze, floor 25 % and ceiling 400 % of the start price, 2 % fee, 500 and 2000 coin limits, no limit on sales, 10-minute hold counted from the latest purchase, price kept at a re-base, 5-second price age for trades, 10 trades in 30 seconds, no replay in live mode) are proposals for Nils and the team. Affects the Exchange screen (browser), the story card C6 (a Greyfathom share), the economy simulation, and every package that adds wallet reasons (the list of reasons now has 11 entries; keep the migration order and the Python order the same).

## D018 · Open-world must: weather states, fog-night rule, Lisbon day, bulletin and Chapter 2 hook · 2026-11-06

**Status:** Proposed in the open-world must pull request (`feat/open-world-must`, spec `specs/open-world-must.md`); accepted when a different teammate has reviewed it and it is merged. The choices marked "chosen here" are not in the approved design (`OPEN-WORLD.md` 3.1 to 3.4, 5.4, 10.2, 10.3) and need Nils' OK.

**Decision:**

1. One pure function maps the four weather values of an hour to `storm`, `fog`, `rain` or `calm`, in that order. The thresholds 0.8, 0.5 and 0.4 are start values in `backend/content/weather_states.json`. Cloud cover never changes the state.
2. Nights run from 18:00 to 06:00 Lisbon time. A night (or a daytime) takes a state when at least 3 of its hours have it, the first of storm, fog and rain; otherwise it is calm (*chosen here*: the design gives states per hour but no rule for a whole night).
3. The fog-night rule is applied exactly as the design states it: a night is a fog night if it is in the fog state, or if neither of the last two nights was. It looks back 30 nights from tonight and assumes the almanac's every-third-night pattern, counted from 16 Nov 2026 (Day 1), for the nights before that (*chosen here*; no table). A look-back that is a multiple of 3 never stalls (a test tries one lonely real-fog night in each of the three almanac positions).
4. The single Open-Meteo call (the one `CachedSource`) adds 4 hourly variables, 31 past days and 3 forecast days, in UTC. Open-Meteo counts that as about 2.4 calls, at most about 350 a day per server instance, against a free limit of 10,000 (checked on 5 Nov 2026).
5. Game time uses `Europe/Lisbon`: the game day starts at 00:00, the bulletin day at 08:00 (the Exchange's market day, and a test checks they agree), the harbor week on Monday at 00:00. Without timezone data the server falls back to UTC, which is right until 28 Mar 2027.
6. `GET /api/bulletin` is public, computed on request and the same for everyone. Its texts come from two server-only content files. The crew's next-lead line is served signed in by package S3.
7. The Chapter 2 hook fires at 06:00 Lisbon time at the end of the first calm night among the first three nights that start after the Relighting, or at the end of the third (*chosen here*: the design names only the trigger night). It looks only at nights that are over, so it never shows and then goes away. It reads the world stage through a reader that package L3 provides (until then the coast is always dark).
8. "Calm and clear" in the design means the `calm` state, so an overcast dry night counts (*chosen here*).
9. The false-light teaser line says "Watch for the false light" (*chosen here*). The design's "The false light is out." means the opposite after the solve, and it is used there ("The coast is relit. The false light is out. A crew found it.").
10. The Exchange line of the bulletin reads "Island Exchange: live. No company is paused.", and the `cache` feed is called "recent prices" (*chosen here*). The first draft said "Every company is trading", which contradicted the words for a stale feed ("old prices (trading paused)"), and "cache" is developer talk.

**Why:** The design's "no timers" rule (3.3), no new outside source, no table and no migration. Everything is plain pure functions with tests, worked out from data the server already fetches.

**Alternatives and trade-offs:**

- A `world_nights` table written once per night, with a bulletin snapshot (a migration with a database function, row-level security with no player access, explicit grants and a memory fallback). It is stable across server instances and forecast changes, but too big for the time planned. Rejected for now.
- 92 days of history instead of 31: exact for longer, but about 6.8 Open-Meteo calls per fetch.
- A rule on real fog only: not the design's rule.
- Firing the hook at 18:00 on a forecast: it could appear and then disappear.

**Known limits:**

- Tonight's real-fog label follows the latest forecast, so it can change during the day.
- After 30 nights without real fog, one fog night can come a night early.
- Server instances can disagree for up to 10 minutes, because each has its own cache.
- A freshly started instance during an Open-Meteo outage treats nights as unknown.
- Without the hours of nights 1 to 3 (an outage on a fresh instance), the Chapter 2 hook fires only at the end of night 3, so instances can show it on different mornings.
- If the server has no timezone database, look for the log line "No timezone database" after the first preview deploy. If it appears, add the `tzdata` package before 28 Mar 2027 (a team decision about a dependency).
- The single Open-Meteo request now carries 34 days of hourly data and shares the 3-second timeout (`TIMEOUT_SECONDS` in `weather/open_meteo.py`) with the weather now. It has not been timed against the real service, because no live call was made while building. Before merge, time one call by hand; on the first preview deploy, check that `GET /api/weather` says `source` `live` and a `tonight.state` that is not `null`. If the call takes close to 1 second, raise the timeout.
- If the weather place moves to Lisbon (an open question for Mon 9; the default is Torshavn), real fog becomes rare and the almanac carries the teaser.

**Agreed by, PR and impact:** Proposed in `feat/open-world-must`. Affects `GET /api/weather` (two new fields), `GET /api/bulletin` (new), three content files, package L3 (`world_state` keeps `relit_at` and provides the reader), package S3 (the next-lead line) and package L5 (weather questions settle on real fog only).

## Next entry

- **ID / date / title:**
- **Status:** proposed / accepted / superseded by Dxxx
- **Decision and reason:**
- **Alternatives and trade-offs:**
- **Agreed by / issue or PR / impact:**
