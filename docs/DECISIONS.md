# Decision log

Record choices that affect other contributors: game behavior, architecture, shared interfaces, dependencies, data storage or deployment. Routine implementation details belong in the PR.

Add short entries; keep the original rationale when superseding a decision.

**Spoiler warning.** Decision D013 (item 5) names the culprit of the case. The repository is public, so anyone can read it here. In the game, the culprit's name reaches only crews that solved the case.

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

**Spoiler warning.** Item 5 of this entry names the culprit.

**Status:** Decided by Nils on 5 Nov 2026 when he approved the story skeleton ([docs/STORY.md](STORY.md)).

**Decision:** (1) Each crew plays its own copy of the case; the first solve anywhere relights the coast for everyone. (2) Story v2 makes small `story.json` edits only. (3) NPC partners v1 are scripted errand runners. (4) The class demo is very short and shows highlights only. (5) The culprit is the harbor master; characters have titles, not personal names (Elena Vos stays the only named character).

**Why:** These five choices meet Nils' rules at once: a joint puzzle for four players in about two hours, playable alone, a world that changes and keeps going, and a fair twist built on lines that are already in the original game.

**Alternatives and trade-offs:** One global case solved once (later players could only read about it); a bigger rewrite of the intro; NPC partners with free hints or an AI voice; the demo as a live first solve. Trade-off: copies per crew need a clear rule for what the first solve changes for everyone (detailed in the story detail round).

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Affects S0 to S4, L3 and A6.

## D015 · Coordination merges by Claude under the owner's authorization · 2026-11-05

**Status:** Decided by Nils (repository owner) on 5 Nov 2026; extended by Nils on 6 Nov 2026 (below).

**Decision:** Claude may push branches and merge its own verified coordination work into `main` without a teammate's approval (merge commits; tests, build and a secret scan first), and records each such merge in [docs/STATUS.md](STATUS.md). The first one was the bootstrap merge `a0e501a`. Teammates' changes keep the peer-review rule of D001.

**Extended on 6 Nov 2026:** the rule now covers every package that Claude and Codex build, not only coordination work. Such work merges after Claude's gates: all tests, the style check, the build, a secret scan and an independent agent review. A database change also gets an Opus review and a check against the live database, and Claude reports each one. No human review is needed per merge: Nils reviews at the end, or ad hoc when he chooses ("no review until it's done, in the end or ad hoc we do review"). The team does not wait for teammates and holds no check-ins; teammates join when they start and add their own ideas ("we do not wait for them ... we just let them expand with their own ideas"). Teammates' own pull requests keep the peer review of D001.

**Why:** Nils wanted the team to start from a working `main` the same day, before the teammates had joined, and authorized Claude to push and merge without asking, keeping questions for important decisions.

**Alternatives and trade-offs:** Wait for a teammate's review of every early change (slower start). Trade-off: agent-built work reaches `main` without a human review at merge time, so Nils reviews it at the end or ad hoc (extension of 6 Nov; the review at a kickoff is dropped).

**Agreed by, PR and impact:** Nils, 5 Nov 2026, extended 6 Nov 2026. Affects how `main` gets coordination and integration work and every package that Claude and Codex build; it never replaces review for teammates' own packages.

## D007 · Plot Twist imported as an unchanged copy · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026 (the team brings the story into this repository, so nobody needs the private solo repository). Proposed in the S1 pull request; accepted when reviewed by another teammate and merged.

**Decision:** Nils' solo game Plot Twist (*The Keeper's Last Log*, his private repository `Plot-Twist`, branch `main` at commit `e235ee4`) is brought into this repository as a copy. The story file is byte for byte the original (SHA-256 `3713d17a778d7ad3cfe8a8f24e33810bc96a54e1f8be90f3babf15d5698c66a2`). The Python engine, the JavaScript engine and the 11 original tests (9 acceptance and content tests, 2 parity tests) are ported with the same rules and the same assertions. Only what the web game needs changed: where the files live, a `save_path=None` option so the server never writes files, ES-module syntax and an injectable storage in the browser engine. The terminal game (`cli.py`) and the old web interface are not imported. The solo repository is never changed. The provenance note is in [backend/content/README.md](../backend/content/README.md#where-this-story-came-from). Where the content folder lives is a separate decision, D016.

**Why:** Nils decided that the team writes the next version of the story itself, so everything it needs must be in this repository. A copy with a provenance note keeps the original traceable, and unchanged rules mean the 11 original tests still prove that the game works.

**Alternatives and trade-offs:** Keep the game in the private solo repository and copy files when needed: Nils decided against it. Rewrite the engines: not needed, because the original rules and tests work, and decision 2 in D013 keeps the engines frozen. Trade-off: there are now two engines, one in Python and one in JavaScript, that must stay equal rule for rule. The parity test (`backend/plot_twist/tests/test_web_parity.py`) fails when they differ.

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Proposed in the S1 pull request (`feat/s1-import-plot-twist`). Affects S2 (the story in the browser) and A3 (the referee replays the move log with the Python engine).

**Amendment, 6 Nov 2026 (Nils, G10):** Story v2 changed `backend/content/story.json`. The byte-for-byte claim and hash above describe the original import, not the current story file. The engine rules and provenance remain separate from those content edits.

## D016 · Server content lives in backend/content/; the browser gets public content through the API · 2026-11-05

**Status:** Proposed in the S1 pull request. It stays proposed until Nils accepts it and a different teammate has reviewed it, because it moves the content paths of S3, S4, A2, A3, L2, L4 and L5.

**Decision:** Game content that the server uses (the story, the case, names, buildings, companies, questions) lives in `backend/content/`, not in a `content/` folder at the repository root. The format of each file is written in [backend/content/README.md](../backend/content/README.md). Public content, which the browser needs in order to play, is served by `GET /api/content/{name}`, and only for the names on a fixed list in `backend/server/routes/content.py` (today `intro-story`). Secret content, for example the real solution of the case, lives in `backend/content/secret/` and is never served. Data that only the browser uses, such as the place registry `frontend/src/world/places/registry.js`, stays in `frontend/`.

**Why:** Vercel builds each service from its own folder only (D002): the API from `backend/` and the game from `frontend/`. The Python runtime bundles the service folder, so files inside `backend/` reach the API, while files in a root `content/` folder may not (the roadmap flagged this risk for S1). The game is built from `frontend/` only, so a secret file in `backend/` cannot end up in the game by accident. That matters for the case solution.

**Alternatives and trade-offs:** A root `content/` folder read by both services (the first proposal in the roadmap): the API may not see it on Vercel, and the game build could pick up a secret file by accident. Two copies of each file, one per service: the copies would drift apart. Trade-offs: the browser downloads public content with one API call instead of having it inside the bundle. The route sends `Cache-Control: public, max-age=300`, which only browsers obey. So a changed story takes up to five minutes to reach a page that is already open, and every new visitor still starts the API function. Whether to add `s-maxage=300` for Vercel's network is open; if we do, check on a preview that the header `x-vercel-cache` says HIT. Not checked yet: that the deployed API finds `backend/content/story.json` (A3 checks it on a preview).

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the S1 pull request (`feat/s1-import-plot-twist`). Not accepted yet. If it is accepted, these content files go under `backend/content/`: `secret/case.json` for S3, `partners.json` for S4, `names.json` for A2, `entry_kits.json` for A3, `buildings.json` for L2, `companies.json` for L4 and `questions.json` for L5. The roadmap, the interfaces page, the status page and the engineering rules already use these paths. If it is not accepted, revert those paths.

## D017 · Island Exchange rules · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026 (his answers to the Exchange questions, items 1 to 7; item 2c, 10x positions, replaces the x100 price amplification of items 1 and 2a). The points marked "chosen here" are defaults Claude took for the rework and told Nils; they stand unless he objects. This version replaces v1 (see "History"), which was merged but never went live: its migration was never applied.

**Decision:**
1. **Real prices, 1:1.** Seven invented island companies follow seven real instruments at their real Binance prices (BTC, ETH, SOL, XRP, BNB, EUR/USD as EURUSDT, gold as PAXG; around the clock; no key). Real stock companies, shown with their real names, follow their real share prices through a stock-price API with a free key that Nils creates (agents never sign up), chosen by the settings `STOCK_API_PROVIDER` and `STOCK_API_KEY` and off until the key exists. Chosen here, from the research memo of 5 Nov: Finnhub for five US companies, switched on only once Finnhub has agreed in writing that the prices may be shown. No floor, no ceiling, no pauses.
2. **Every investment is a 10x position,** rising or falling, with a stake of coins. Each 1 % the price moves for the position adds 10 % of the stake, each 1 % against takes 10 % away.
3. **Closed at zero.** A position whose stake is used up (price at 90 % of the entry for a rising position, 110 % for a falling one) closes automatically at zero; a jump past that point also closes it at zero. A player never loses more than the stake and the opening fee and never owes coins.
4. **Market hours.** A stock trades only while its market is open (New York, Euronext or Xetra, from a calendar file with the holidays from 6 Nov to 31 Dec 2026). While its market is closed or a price source is away, a company shows its last price with a label and cannot be traded, and its positions are neither closed nor used up until fresh prices arrive. Island companies never close.
5. **Demo mode** plays the recorded Binance Vision day, clearly labelled, and trading on it is allowed; those trades change players' real coins, and the recording is public. Chosen here: stocks are not part of it.
6. **No price protection.** A trade goes through at the server price of that moment.
7. **Brakes.** A trade uses a price at most 5 seconds old (fetched fresh if older); a player makes at most 10 trades in 30 seconds.
8. **Fee:** 2 % of the stake, rounded up, at opening and again at closing; 1 % after the Relighting. The closing fee comes out of the value and is never more than it.
9. **Limits:** at most 500 coins per position and 2,000 coins of new stakes per game day (from 08:00 Lisbon time). At least 10 coins per position. Decided by Nils on 6 Nov 2026: at most 20 open positions per player, with no extra 300-coin reserve.
10. **Positions stay open across days.** No minimum holding time.
11. **Chosen here:** the automatic close runs whenever the server looks at prices (every board look, every trade, every portfolio look) and uses only prices it fetched; positions opened on live prices close only on live prices, recording positions only on the recording; after the Relighting Greyfathom Salvage takes no new positions; an open rising position in Greyfathom Salvage is the "Greyfathom share" of card C6.
12. **Database:** migration `20261106090000_exchange_leverage.sql` removes the v1 Exchange tables and functions and adds `exchange_positions`, `exchange_events`, the reasons `market_stake` and `market_payout` (v1's `market_fee` is reused; `market_buy` and `market_sell` stay unused, because a reason is never removed) and three server-only functions that move the coins and change the positions in one step.

**Why:** Nils wants real companies and real prices, and investments that can end at zero within a class: at 10x, a real move of 1 % is 10 % of the stake, and a real move of 10 % against a position ends it. Real prices need no amplification rule, so nothing can drift away from reality or sink toward one cent (the v1 problems). A stake can be lost but nothing more, so no balance goes below zero and nobody owes coins. One shared server price, fresh for trades, and no trading on closed or stale companies stop players from trading on prices they know are out of date.

**Trade-offs:**
- Real prices move slowly: in a 90-minute class crypto often moves under 1 %, so a position moves by a few percent to about 10 % of its stake; on a volatile day a position can end at zero.
- The automatic close sees only prices the server fetched; a dip past the zero point between two looks is missed (in the player's favour). No timer is available (Vercel Cron breaks our deploys while we use Services, GitHub Actions is too slow and limited, a database timer would have to fetch prices and hold the key).
- No price protection: a trade can get another price than the screen showed (the board may be 30 s old).
- Prices up to 5 s old leave a fast player who watches the live market a small edge; the 2 % fee each way makes it rarely worth it.
- Real prices are shown as they are, so display rights matter: Binance's terms do not say whether a class game may show its prices; Finnhub's free plan allows it only with written approval; no free source covers European shares.
- At the 11:00 class the US stocks are closed; only the island companies trade.
- Stocks can open far from their last close, which closes rising or falling positions at zero at the open.
- Each server instance holds its own prices in memory, so a fresh instance during an outage shows "no price yet".
- Demo-mode trades change real coins on a public recording (Nils accepted it).

**Alternatives:** amplified prices with a floor, ceiling and pauses (v1); x100 that never reaches zero with daily rounds (item 2a, replaced by 2c); 10x on top of x100 (would end a position after a 0.1 % move); price protection with a tolerance (item 5, not chosen); a timer for the automatic close (not available); per-symbol candles to catch dips (one request per symbol); a shared table of last prices (later).

**History: v1 (superseded).** v1 amplified real moves (game price = base x (1 + multiplier x real change), multiplier 20 to 100), held prices between 25 % and 400 % of a start price, paused a company for 15 minutes after a 30 % move, re-based every day at 08:00 Lisbon, traded whole units with a 10-minute holding time, and limited purchases to 500 coins and 2,000 a day. An independent review found trades on old prices, a predictable public replay and prices sinking toward one cent; the fixes that still apply carry over (prices at most 5 s old for trades, no replay in live mode, the daily cap, 10 trades in 30 s). Its simulations showed that at x100 prices spent most of a multi-day run near their floor. The full v1 text is in git history (`docs/DECISIONS.md` at `3d59b6a`).

**Agreed by, PR and impact:** Nils, 5 Nov 2026. Built on `feat/l4-exchange-v2`. Affects the Exchange panel, card C6 (the Greyfathom share), the Relighting (fees drop, Greyfathom delisted; L3 provides the switch), D014 (Nils owns the Finnhub key) and every package that adds wallet reasons (the list now has 13).

## D018 · Story round: 19 story decisions and two scope decisions · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026, when he approved the story approval sheet and later that evening made two scope decisions. Written with the story round (package S0, branch `docs/s0-story-round`). It records what Nils decided and changes no code. It counts as an entry once a different teammate has reviewed it and it is merged (D001).

**Decision:** Nils approved all 19 recommendations of the approval sheet as written ("I approve 19 story recommendations let's go"). He changed the last one that evening and added one more decision. Three changes that the review made to the text of the sheet (a home islet for the True Keeper, the third light as a home signal station, and solo at 121 to 124 minutes) are not part of this decision until Nils says yes ([docs/story/README.md](story/README.md#changes-to-the-approval-sheet-after-the-review)).

*Story*

1. New Act 1 lines: the Witness ending hears "No fog tonight. We wait for the next one." and then "The harbor master never came."; the Stranger ending hears "Whoever you are, nobody knows you're up there."; Elena's log points to the "old watchtower".
2. A third-path button, "Tell no one what you know": visible but not final. Still exactly 8 endings.
3. Chapter 2 is planted now: one line in Elena's logbook, a lamp and a row of long and short flashes with a question mark (Story v2 change 13, the old optional edit A).
4. The lantern-hook mismatch is fixed (Story v2 change 14, the old optional edit B).
5. The night clerk stays: a title only, who keeps the harbor master's window lit.
6. Every crew builds one light for the finale: 300 coins and 10 timber, which every kit can afford.
7. Players call nightfall after D1. Night never falls by itself.
8. Reading Elena's log helps a little: the torn page's lead shows from the start and saves a search of 5 minutes.

*Rules*

9. Partner pins pay the player who ordered them.
10. A friend who takes over a partner's seat keeps their own kit.
11. Partners spend a player's coins on a shortcut only when the player allows it for that order. It is off by default. It touches money, so the team confirms it at kickoff.
12. Partners fill missing kits in the order Informant, Stranger, True Keeper, Witness. It is also a team call, confirmed at kickoff.
13. The salvage-yard shift change window is 8 minutes wide, not 5, so every crew of four fits 120 minutes.
14. A lens can be made before D3. Only fitting it waits for D3.
15. Coin entries use the foundation's wallet reasons `clue_reward`, `mystery_reward` and `clue_purchase`, with the case id in every `ref`, so later chapters never collide.

*Open world*

16. No fast-travel fee for now. The chart skip is free, and the numbers are kept for later.
17. The Exchange fee is 2% each way, and 1% after the Relighting. The roadmap's old 3% example is fixed.
18. The prediction desk and the sports pools stay switched off until Nils is sure that play-money bets on real matches are fine for class.
19. Our own crew does not relight the live coast before the demo. **Changed by Nils later that evening:** there is no separate demo world for now. Rehearsals use the existing `?demo=1` tour, which runs on the browser-side stand-in and never touches the live world. One server setting keeps the relight switch locked until the game opens, so the team's own test solves cannot relight the coast.

*Two scope decisions, late evening*

- **No demo world for now** ("maybe we add later, for now we just build the game"). This is the change to decision 19.
- **Live multiplayer is core** ("the game needs to be a multiplayer game, so we need to see everyone live; push that up"). Package A4 (live presence) moves from Later into core. It runs on Supabase Realtime, which the free Supabase plan includes: small rooms (one private room for each crew and one for each place), positions sent only while a player moves (at most 2 a second), presence for who is here, and the server pushing rule changes into the crew room. The server stays the referee. Target: the Fri 13 vertical slice shows two players seeing each other live.

*Confirmed on 6 Nov 2026*

- **The case solution may stay in this public repository, labelled as a spoiler** ("Yes, label it"). It sits in [STORY.md](STORY.md), [story/CASE-FILE.md](story/CASE-FILE.md), [story/STORY-V2-CHANGES.md](story/STORY-V2-CHANGES.md), D013 in this log and `backend/content/secret/case.json` with its data page, and each carries a spoiler warning at the top. The rule for the game does not change: the culprit's name never reaches the browser bundle, and reveal lines go only to crews that solved the case ([STORY.md](STORY.md), rule 3).

**D016 and the files:** the case data, the partner lines and the timing program now sit at the paths D016 names (`backend/content/secret/case.json`, `backend/content/partners.json`, `backend/tools/simulate_case.py`). D016 itself stays proposed until a teammate has reviewed it (D001).

**Why:** The skeleton (D013) fixed the shape of the story. The detail round needed 19 small choices to finish it: text, rules and open-world numbers. Nils decided them in one pass, so S1, S3 and S4 can start from their minimum boxes. The two scope decisions follow from "for now we just build the game" and "the game needs to be a multiplayer game". Decisions 3 and 4 pull the two optional Story v2 edits into the list because each costs one small note and no new state.

**Alternatives and trade-offs:** Each decision has its recommendation and its alternatives in the approval sheet and in [docs/story/](story/README.md). Examples: a binding third path with a `kept_quiet` flag and 10 end states; partners that spend coins on their own; the old kit order; a separate demo world that rehearsals can relight. Trade-offs: a visible but non-final third path may not read as a real choice, so watch the first playtest. A relight lock means the first real solve cannot happen before the game opens. A4 at its proposed 1.5 days of minimum size takes the minimum core to about 26.5 days, so the recount of the spare days at the Fri 13 Nov check matters. With the pools off, L5 and L6 can be built but not shown.

**Agreed by, PR and impact:** Nils, 5 Nov 2026; the spoiler labels on 6 Nov 2026. Written in the S0 pull request (`docs/s0-story-round`). Affects S1 (14 edits and 19 tests), S3 and S4 (minimum versions), L3 (three lights, the relight lock), L4 (the fee text), L5 and L6 (flags stay off), A4 (a new core package), the roadmap, `docs/STORY.md` and every page in `docs/story/`. Decisions 11 and 12 are also team calls, so the team confirms them at kickoff.

## D006 · Identity: generated captain names, no free text · 2026-11-05

**Status:** Proposed in the A2 pull request (`feat/a2-a3-signin-referee`); accepted when reviewed by another teammate and merged. **The sign-in approach is pending Nils' decision** (see point 5), and **the word lists need a human look** (point 4).

**Decision:** (1) Players sign in with GitHub only (D002). The name other players see is never taken from the login and never typed in. (2) At sign-up the database gives every player a neutral placeholder (`Captain-` and 6 characters of their id, D003). `POST /api/me/name` gives a real **captain name** once: an adjective, a noun and a number from 10 to 99 from the word lists in `backend/content/names.json`, for example `Brave Puffin 17` (40 x 40 x 90 = 144,000 names). Asking again changes nothing. (3) The player may **re-roll once** (`POST /api/me/name/reroll {actionUid}`). A re-roll always gives a different name and is final. Both steps are one database function each, so two requests at the same moment cannot give a player two names or two re-rolls. Names are not unique. (4) **No free text** anywhere: no typed names and no chat. Players will talk through preset emotes and short phrases from a list, in a later package. The words in `names.json` must be kind and plain, because names appear on a projector; a human reads every word (pending, N9: `backend/content/README.md` lists the pairs to look at first). (5) The **sign-in screen is not built** in A2. The browser has `frontend/src/online/session.js` (the login token in memory only) and `api.js` (adds the token to calls and turns 401, 409 and 429 into messages). A page reload means signing in again until the sign-in package decides about remembering the sign-in. Open for Nils: whether the screen uses Supabase's client library in the browser (a new browser package, to be agreed in an issue first) or the temporary route `POST /api/auth/exchange`; either way it must use the PKCE flow.

**Why:** Names appear on a projector, and a player controls their own login details (D003), so a name can only come from lists we wrote. A generated name needs no moderation and cannot be rude. One re-roll gives a little choice without letting players cycle until they find a name that suits a joke. A database function for each step makes the rule hold even when two requests arrive together.

**Alternatives and trade-offs:** Free text with a filter: rejected, because a filter always misses something and the name goes on a projector. The GitHub login as the name: rejected in D003. Unlimited re-rolls: rejected, see above. A unique name per player: not needed with 144,000 names, and it would need a retry loop. Choosing the sign-in approach now: left open on purpose, it needs a decision by Nils and possibly a new browser package. Trade-off: until the sign-in screen exists, nobody can use the routes from the game, only from tests and the check page.

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the A2 pull request. Pending Nils: the sign-in approach, and the word lists (N9 in `specs/M1-backbone.md`). Affects A3 (a kit needs a signed-in player), A6 (names appear in crews), L3 (names on the projector) and every package that shows a player.

## D022 · Account data: cloud save versions, delete my data, hosts · 2026-11-05

**Status:** Proposed in the A2 pull request (`feat/a2-a3-signin-referee`); accepted when reviewed by another teammate and merged. **"Delete my data" is pending Nils' decision** (point 2), because it touches personal data, deletes the ledger, and leaves Supabase Auth's audit log behind. The number was D018 on its branch (`specs/M1-backbone.md`); the story round took D018 first, so it became D022 at merge.

**Decision:** (1) **Cloud save.** `GET /api/save` and `PUT /api/save {version, data}` keep the browser's own progress (the local Act 1 state, settings) so a player can go on at a second device. The server never trusts it for coins, kits, names or crews. `saves.version` now **counts the writes**, starting at 1 (before, its comment said "format version", and nothing used it). The browser sends the version it last read, and `save_progress()` writes only if the save still has that version and then adds 1. Otherwise the answer is `409 stale_save` and nothing changes, so an old copy on a second device can never overwrite newer progress. A repeated `PUT` gets the same 409. The version is a whole number from 1 to 2147483647, the largest number the database column holds; a bigger one is a `422`, not a database error. Size: Python accepts at most **100,000 bytes of compact JSON** (UTF-8 bytes, no NaN or Infinity), and the database checks **200,000 bytes** of its own JSON text again before it writes. The second check is needed: a 5.6 KB JSON of large numbers grew past 200 KB as `jsonb` text on the scratch database. (2) **Delete my data** (`DELETE /api/me {"confirm": true}`, pending Nils) deletes the login in `auth.users` and, by `on delete cascade`, every row of the player: the profile, save, wallet, **all ledger rows**, seats, Exchange positions and trades, the name re-roll and the tables later packages add. **The ledger keeps nothing about the player.** The coins are play money, so nothing real is owed and no record must be kept. No other player's balance depends on those rows, because each row changes only its own wallet. "Delete my data" must really delete, and a pseudonymous ledger kept on would still be tied to an account id. The foundation already chose cascade (D004 and D012). A crew the player started that other players sit in is **handed to the player in the lowest seat first**, so friends keep their game; the deleted player's seat is open again. A crew nobody else sits in goes with the player. The handover happens only in `delete_player()` (`DELETE /api/me`): deleting a user in the Supabase dashboard skips it and deletes the crews they started. One `SECURITY DEFINER` database function (`delete_player()`) does all of it in one step, because deleting from `auth.users` needs the rights of the function owner; only the server may run it, with the id of the verified player. **Not deleted:** Supabase Auth's audit log (`auth.audit_log_entries`, which can hold the login e-mail address and an IP address, and has no foreign key to `auth.users`) and Supabase's platform logs, which expire on Supabase's own schedule. Whether to purge those audit rows, or to stop Auth writing its audit log to the database in the Auth settings, is part of this pending decision (N4); step N6 of the manual test plan counts the audit rows that a deleted test user leaves. (3) **Rule for every later package:** a table that holds a player id references `profiles(id) on delete cascade`. If a row must outlive the player, it uses `on delete set null` on a nullable column. Then `DELETE /api/me` stays complete without changes. (4) **Hosts.** The setting `HOST_PLAYER_IDS` (Supabase User UIDs, comma separated; a mistake stops the server at start-up) lists the players who may use presenter routes. `require_host` and `HostDep` (`backend/server/hosts.py`) answer `403 forbidden` to everybody else, and `401` to a visitor who is not signed in. Nils puts his own id in the Vercel settings (pending Nils). No route uses it yet; the presenter routes of L3 will.

**Why:** A player on two devices must never lose progress to a stale copy, and the database is the only place that sees two requests at the same moment. A deletion that leaves rows behind is not a deletion, and the foundation's cascade rule already makes the complete version the simple one. Hosts need an allow-list that no request can change, so it comes from the environment.

**Alternatives and trade-offs:** Last write wins for saves: loses progress without a word. Comparing `updated_at` instead of a version: breaks when two clocks differ. Keeping ledger rows without the player (a tombstone profile): rejected above; it would break the cascade model and keep a trace. Soft delete (a flag): the data would still exist. A table of hosts: one more table for a list of two or three people. Trade-offs: after a deletion the old token still passes the login check for up to 60 seconds on the same server instance (auth.py remembers it), and reads in that time answer `404 player_not_set_up`; `delete_player()` is the one `SECURITY DEFINER` function we run for the server, and whether the `postgres` role may delete from `auth.users` on Supabase is checked once with step N6 of the manual test plan, on a throwaway user.

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the A2 pull request. Pending Nils: "delete my data" (N4), the value of `HOST_PLAYER_IDS` (N10), and the save size (N12, a team choice). Affects every package that adds a table with a player id (rule in point 3), L3 (presenter routes), and the game client (the save and delete buttons).

## D019 · Referee and entry kits · 2026-11-05

**Status:** Proposed in the A3 pull request (`feat/a2-a3-signin-referee`); accepted when reviewed by another teammate and merged. **One point is pending Nils:** "the first ending counts" is the recommended default (point 3). The other point that waited for him, the coins and texts of the kits (point 5, N5), came from the S0 story drafts and waited for his approval of S0; the story round settled it (D018), and the kits of `backend/content/secret/case.json` are the same as those of `entry_kits.json`.

**Decision:** (1) **The server replays the move log.** At the end of Act 1 the browser sends `actions[]`, 1 to 300 action ids (`POST /api/intro/complete`). The server plays them with the original Python engine (`plot_twist/engine.py`) on its own copy of `story.json`. Every move must be accepted by the engine. The first move it does not accept (an unknown id, a move of another scene, a blocked move, a move after the ending) refuses the whole log as `422 move_refused`, and the message names that move. A log that stops before an ending is `422 no_ending`. A refused log stores nothing: the database is not called. The browser never sends an ending, a decision, a kit or a player id; any such field is refused. (2) **Eight end states, four kits.** The ending scene and the decision (read from the story flags `warned_harbor` and `trusted_fisherman`, neither meaning `none`) pick the kit: `ending_rescue` with `warned` is the True Keeper, `ending_trapped` with `warned` the Witness, with `trusted` the Informant, with `none` the Stranger. Reading the logbook (flag `read_log`) does not change the kit: it sets `readLog`, which gives the log card on the case board. The kits, the flag names and the start places are data in `backend/content/entry_kits.json`. Both decision flags set at once cannot happen in the story; if it ever did, the referee raises an error (a 500) and never picks a kit. (3) **The first ending counts** (pending Nils, N6). The table `entry_profiles` has one row per player, written once and never changed. A second playthrough returns the stored profile (the stored ending, decision, kit, start place and coins), pays nothing, and says `alreadyGranted: true`. (4) **The coins move once, inside the database.** `grant_entry_kit()` locks the player, stores the profile and calls `apply_wallet_transaction()` with the reason `kit_grant` and the fixed ref `kit`, in one transaction. Python checks the amount with the wallet rules first but never moves the coins. A player who was paid the kit by hand earlier (the manual test plan does that) gets a profile and no second payment. (5) **The kits** (pending S0, N5): True Keeper, Witness and Informant 1000 coins each, Stranger 1600; the start place is `lighthouse_isle` for the True Keeper and `saltreach_harbor` for the others; each kit has a clue card (C6, C2, C4, C5) and a small item. (6) **The story file is identified, not required.** The SHA-256 of `story.json` is stored with each profile, for audits. The request carries no story version, because Story v2 only adds actions and changes no rule, so an old log replays to the same end state. A log that only a newer story allows is refused as `move_refused`, and the message tells the player to reload. This replaces the note in the content README that suggested a `409` for a different story.

**Why:** The browser can be changed by anybody, and a kit pays coins, so the ending has to be re-played where the player cannot touch it. The engine is the same code that wrote the story's rules, so no second set of rules can drift. Putting the profile and the payment into one database function means a crash, a double click or two requests at the same moment can never leave a profile without coins or pay twice, and the ledger's unique index is the last guard. Storing the first profile makes the route safe to repeat without an `actionUid`.

**Alternatives and trade-offs:** Trusting the ending in the request: rejected, a player could pick the best kit. Requiring the story hash and refusing a different story with `409` (the note that backend/content/README.md used to carry): rejected, because an old page would be sent into an error for no reason when the rules are the same. Letting a later playthrough replace the kit: rejected as the default, because the coins differ (1000 and 1600), so a second payout rule would be needed and players could farm kits. A mistaken ending can only be undone by hand: delete the row in the SQL editor (no role has a delete right on the table), and the next submission stores a new profile, but pays nothing, because the ledger already has the kit row. Paying from Python after storing the profile: rejected, two steps can break in between. Trade-offs: the route reads three small files per request (the story, the kits and the story's hash); `GET /api/me` now needs the table `entry_profiles`, so the migration must be applied before the server that reads it is deployed. That means before the branch is merged into `main` (a push to `main` deploys to production at once, and `GET /api/me` is live today) and before a preview of the branch is tested (previews share the one Supabase project). If the merge has to come first, the read of `entry_profiles` in `routes/me.py` is held back (`kit` and `place` stay `null`) and merged after the apply; a server error between the replay and the database call leaves nothing stored, which is why a `503` is safe to repeat.

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the A3 pull request. D019 was the next free number when A3 was written; the account entry it followed became D022 at merge, because the story round took D018 (no number is reserved for A3 in the roadmap). Pending Nils: N6 (the first ending counts). N5 (the coins and texts of the kits) waited for the S0 approval and was settled by the story round (D018). Affects A6 (a seat carries the entry kit, so the crew routes read `entry_profiles`), S2 (the browser sends the move log), S3 (the start place, the cheap card and the log card), S4 (the kits that NPC partners fill in), and `GET /api/me`.

## D020 · Crews: codes, the guessing limit and partners at the muster · 2026-11-05

**Status:** Proposed in the A6 pull request (`feat/a6-crews`); accepted when reviewed by another teammate and merged. Two choices waited for Nils and were marked "pending" on the branch; the story round decided both as built (D018, decisions 10 and 12; decision 12 is also a team call, confirmed at kickoff), so they are marked decided below. The number D020 was handed out in advance by the M1 spec (`specs/M1-backbone.md`), together with D018 and D019 for the account and referee packages, so the entries do not collide (the story round took D018 first, so the account entry became D022 at merge). If another branch took it first, the coordinator renumbers at merge.

**Decision:** Crews follow D012 (up to four seats, each a player or an NPC partner). On top of it:

1. **Crew codes.** A crew gets a code of 6 symbols: `A-Z` without `I`, `L` and `O`, and `2-9` (31 symbols, about 890 million codes), made on the server with the system's secure random generator. A code is unique. A player needs an entry kit (Act 1 finished) to start or join a crew, because every seat carries a kit.
2. **Guessing limit.** A player may type at most **10 wrong codes in 10 minutes**. The count is kept in the database (table `crew_join_failures`), not in the server's memory: every Vercel instance has its own memory and a cold start empties it, so a guesser who spreads requests over instances would get many times the limit. After the limit even a right code is refused (`429` with `Retry-After`), because the refusal comes before the code is looked at, so a guesser cannot confirm a hit. A typing mistake (not 6 symbols) is a `422` and costs no guess.
3. **The muster.** NPC partners are seated when the crew sails: `POST /api/crews/me/start` makes the crew `active` and fills every empty seat in one step. Any player of the crew may call it.
4. **Joining.** A friend takes the lowest open seat. A crew that has sailed has none, so the friend takes over the NPC partner who carries the friend's own kit, or else the partner whose kit comes last in the partner order, so the partners who stay keep the kits that are still missing. A crew of four players is full.
5. **Partner kits.** Each partner carries the first kit that nobody in the crew has yet, in the order **informant, stranger, true_keeper, witness**. A partner follows the seat number (Lookout, Deckhand, Bosun, Cook).
6. **A draft.** A crew that a player started and sits in alone gives way: joining another crew deletes it in the same step. Any other open crew stops the player from joining a second one. A player sits in at most one open crew.
7. **Only through four functions.** The server creates, joins and sails a crew only through the database functions `crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()` (a team rule, as with the wallet). Each checks the version of the crew that the server read and answers "changed" if it moved on, so the server never acts on an old picture of a crew. The database itself guards one seat per player and per partner in a crew, the kit ids, and the code format and uniqueness.
8. **Not in this version.** Leaving a crew and kicking a player. Partner orders and errands are package S4.

**Decided by Nils in the story round (story decision 10, D018).** Which kit a seat carries after a friend takes over a partner's seat: **the friend keeps their own kit**, as built. The alternative was that the seat keeps the partner's kit. It is one switch (`FRIEND_KEEPS_OWN_KIT`) in `backend/server/crews/seats.py`.

**Decided by Nils in the story round (story decision 12, D018).** The order in which partners fill the kits the players are missing: **informant, stranger, true_keeper, witness** (`NPC-PARTNERS.md`, section 4.2), as built. It is also a team call, so the team confirms it at kickoff. When this entry was written, `CASE-FILE.md` (sections 3 and 9) still listed true_keeper, informant, stranger, witness; the story round fixed it. It is one constant (`NPC_KIT_ORDER`) in `seats.py`.

**Why:** The first milestone needs a crew that forms with an NPC partner in an empty seat, and the case needs all four kits in a crew (a solo player gets the other three from partners). Seating the partners at the muster, and not earlier, keeps "open seat first" meaningful and lets a friend join a forming crew without taking a partner's place. A guess limit in the database holds for every server instance. A version check on every change means two friends who join at the same moment, or a join during the muster, cannot corrupt a crew: the second request is told "changed" and reads the crew again.

**Alternatives and trade-offs:**

- *A speed limit in memory* (like the trade limit of the Exchange): rejected. It cannot see a second server instance and a cold start empties it.
- *Partners seated when the crew is created:* rejected. No seat would ever be open, so "open seat first" would mean nothing, and S4 assumes that a forming crew has no partners.
- *Partners seated when the case starts (package S3):* rejected for the first milestone. S3 belongs to the second milestone, but the first one needs a partner.
- *A table rule for "one open crew per player":* not possible, because the status lives in `crews` and the seats in `crew_seats`. The four functions keep the rule under a lock on the player's profile. The price is that a direct write to the tables would skip it, as a direct write to `wallets` would skip the ledger. Only the server holds that right.
- *Known limits:* the limit counts per account, and each account is a GitHub sign-in (Supabase limits sign-ins per address as well). With about 200 open crews one guess hits with a chance of about 2 in 10 million, and the most a player can try in a day is about 1,440 guesses, so about 3 in 10,000 per account and day. A crew keeps its code after the muster, so a friend can still take over a partner. A player who is deleted leaves an empty seat, and a friend fills it first. In an active crew that seat stays open until a friend joins, because the muster runs only once (S3 and L3 must allow three seats), and the crew's mode stays `crew` even when only one player is left.

**Agreed by, PR and impact:** Not yet agreed. Proposed from `specs/M1-backbone.md` (its choices N3, N7 and N8). Affects A3 (the crew routes read the kit from `entry_profiles`), A2 (the delete route will hand a crew with other players to the player in the lowest seat, which leaves an open seat), S3 and L3 (they find the crew and the seat of a player with `read_open_crew_seat()`) and S4 (partners; a Witness partner starts with card C2).

## D023 · Live presence on Supabase Realtime · 2026-11-05

**Status:** Decided by Nils on 5 Nov 2026 in its core: live multiplayer must exist, it must stay free, and the library `@supabase/supabase-js` is approved. The details marked "chosen here" are proposed in the A4 pull request (`feat/a4-live-presence`) and need a different teammate's review.

**Decision:** Players see each other's captains move in real time and can send preset emotes, and the server can tell a crew the moment something changed. It runs on Supabase Realtime's free plan, in private rooms only (full design: [specs/A4-live-presence.md](../specs/A4-live-presence.md), contract: [INTERFACES.md, section 7](INTERFACES.md#7-realtime-budget)).

- *Three kinds of room (chosen here).* `live:world` is presence only and shows who is online, in which place and room, with which kit. `live:place:<place>:<room>` is broadcast only and carries moves and preset emotes. `live:crew:<crew id>` is broadcast that players can only receive: only the server sends into it, with the secret key and one HTTP request per event (`backend/server/crew_broadcast.py`).
- *Numbered place rooms that shrink (chosen here).* A room holds at most `clamp(floor(120 / online), 4, 9)` captains: 9 while 13 or fewer are online, 4 with 30 online (a crew). A newcomer joins the room of a crewmate first, otherwise the first room with space. At most 8 other captains are drawn, crewmates first, and the rest of the place is counted ("+4 more here").
- *A budget of 60 of the 100 messages a second (chosen here).* Each captain sends at most `min(2, 60 / (captains online x captains in my room))` updates a second, so even a whole class walking at once stays under the limit. A guard in the browser halves the rate for 5 minutes when its estimate of the whole game's cost passes 80, and the browser backs off when Supabase says "Too many messages per second".
- *Limits against our own bugs (chosen here).* A room of one kind (world, place, crew) starts to join at most once a second, so a place or a crew that changes in every frame cannot flood the project's 100 joins a second. The first announcement after every join of the world room waits a random 0 to 10 seconds, so a class that opens the game together, or a Realtime blip that drops everybody, does not announce itself all at once. The server sends at most 5 crew events a second over all crews (and 20 per crew in 10 seconds), and a call takes at most 2 seconds.
- *Five policies on `realtime.messages`, all for `authenticated`.* Anonymous visitors get nothing, a crew room is open only to its members (`is_crew_member`), and nobody but the server can send into a crew room. Nils switches off "Allow public access" in the dashboard, so that no public room exists.
- *Only for showing.* Positions, presence and emotes decide nothing (D003). A payload never holds free text, a name, a login or an e-mail address: names are read from `profiles`, and receivers accept only numbers, known ids and preset emotes.
- *The flag `live_presence`* switches on the browser module and the server helper. The migration is applied only when the team wants to test it.

**Why:** It is free, it needs no new account (Realtime is part of the Supabase project we already have), and its rooms reuse our crew rule `is_crew_member`. On the free plan every delivered copy of a message counts toward the limits, so the design is mostly about keeping the fan-out small.

**Alternatives and trade-offs:**

- *Cloudflare Durable Objects* on the free Workers plan: a bigger option for later. The fan-out would run in our own code, which gives full control. It needs a Cloudflare account and a second deployment. Not priced in detail.
- *Peer-to-peer WebRTC:* rejected. School and university networks often block peer connections, it needs a TURN relay (which costs money) and a signalling server, and peers learn each other's IP addresses.
- *Polling our API:* rejected. 30 players at one request a second would make 108,000 Vercel function calls an hour.
- *Postgres Changes:* rejected. Every move would be a database write.
- *WebSockets in Vercel Functions:* rejected. The feature is in beta and a connection is limited to 300 seconds.
- *One room per place with presence inside it* (the simpler first plan): the cost of a room grows with the square of its size, so a class of 30 in one place would get an update about every 15 seconds, a newcomer could cost up to 870 messages, and the budget could not see how many players are online.
- Trade-offs: positions are claimed by the browser, so they are cosmetic only. A flooder can shut down live presence for the whole project (the API and the game keep working), which is why there is a kill switch: Realtime > Settings > "Enable Realtime service", or dropping the five policies ([supabase/README.md](../supabase/README.md#changing-the-database-later)). At class scale rooms shrink to 4 and updates slow to every 2 seconds. Every announcement is delivered to everyone online, so the start of a class is a burst of its own (about 60 deliveries a second for 30 captains, spread over 15 seconds; our arithmetic, not measured: read Realtime > Reports after the first class). 2 million messages a month are about 8 class sessions. Every signed-in player can see which place each online captain is in. A2 must renew the login token before it ends, or the rooms close after about an hour.

**Agreed by, PR and impact:** Nils, 5 Nov 2026 (core, free, library). The "chosen here" numbers and the room design are proposals for Nils and the team. Proposed in the A4 pull request. Affects A2 (provides the player id and the login token), A6 (provides the crew members), L3, S3 and S4 (call the broadcast helper after a change), G6 (draws the captains from the `live_*` events) and the integrator who wires the module into `game.js`. The package ships with the flag off and the migration unapplied.

## D021 · Home islet rules · 2026-11-05

**Status:** Proposed in the L2 pull request (`feat/l2-home-islet`); accepted when reviewed by another teammate and merged. The number is the next free one when this was written (A2/A3 hold D006, D018 and D019, A6 holds D020, and the A4 spec also claims D018); the controller renumbers it at merge. (At merge the two branch entries numbered D018 became D022 and D023, and D021 kept its number.) The design comes from the open-world design (`docs/story/OPEN-WORLD.md`, sections 1 to 6 and 13 to 15) and the case file (`docs/story/CASE-FILE.md`, sections 1, 3, 9, 10 and 17), which are not on `main` yet. The choices that the design did not settle are marked "chosen here" and need Nils' OK.

**Decision:** Every player has a home islet, saved to their account. The server decides everything and the database guards it (D003, D004). Play money only. Rules:

1. **Five spots, one building each.** The spots are the hotspots of the home islet in the place registry: `plot_1` (cabin), `plot_2` (workshop), `plot_3` (windmill), `plot_4` (greenhouse) and `islet_signal_station` (signal station). Each spot holds only its own building. *Chosen here:* the build request still carries `type`, as a confirmation, and a mismatch is `422 wrong_plot`. This replaces the roadmap's "3 plots".
2. **The cabin is there from the start.** It is free, has no levels, no row and no ledger row. A build on `plot_1` is `409 plot_occupied`.
3. **For 23 Nov only the workshop and the signal station can be built.** The windmill and the greenhouse show as "coming later" (`409 not_buildable_yet`) until timber has a second source, the driftline. Opening them later is one line in `buildings.json`.
4. **Prices.** Level 1 of every building costs 300 coins and 10 timber, from one price list in `backend/content/buildings.json`. Every player gets 20 timber once, the starter pack, stored with the islet. 20 timber buys exactly the signal station and the workshop in either order, so nobody can spend the starter timber in a way that blocks the finale (the crew's third light is a home signal station). Levels 2 and 3 come later with their materials.
5. **The server takes every price from the file, never from the request.** The prices and the starter pack are arguments of the database function, like the price of an Island Exchange trade.
6. **Ledger refs are `islet:<actionUid>`.** The same pattern as the Exchange (`market:<actionUid>`). A repeated `actionUid` is `409 already_applied` and the first thing the server checks. A building cannot be paid twice, because the primary key `(player_id, plot)` and the charge are in one transaction under the wallet lock.
7. **Database.** No new wallet reason: a build is paid with `building_purchase`. Tables `islets` (one row per player: the timber) and `islet_buildings` (one row per standing building), both with row-level security, read-only policies for the owner and explicit grants. The function `islet_build()` locks the wallet, refuses a repeated ref, makes the islet row with the starter pack on the first build, checks the plot and the timber, charges the coins through `apply_wallet_transaction()` and records the building, all or nothing. It always locks the wallet before the islet, like `market_trade()`, so a trade and a build never wait for each other in a circle. It returns the refusals that depend on saved state (`player_not_set_up`, `plot_occupied`, `not_enough_timber`) and raises only for missing coins and a repeat.
8. **A building is never edited or deleted** in this version (no role has the right). So a signal station, once built, stays, and the finale can check for it before its own transaction without a race (`players_with_signal_station()` in `backend/server/game/islet_store.py`, or one `exists` over `islet_buildings` in SQL).
9. **No feature flag and no speed limit.** The islet is core. At most two builds can succeed per player, and a refusal costs one read and one function call. Add the Exchange's speed limit if abuse shows up. Islets are private: other players cannot read yours.

**Why:** The roadmap makes the islet core for the second milestone, and the case needs it: without a home signal station no crew can finish the finale. One shared price list and one atomic function keep every number in one place and every build all or nothing. Reusing the Exchange pattern (wallet lock first, a repeated ref refused, returned refusals) means a retry or a double click can never charge twice and the server needs no new error handling.

**Alternatives and trade-offs:**

- *Fixed refs `build:<line>:<level>`* (the design's first idea): a level could then never be paid twice by the ledger alone, but a rebuild would be blocked forever and the pattern differs from the Exchange. The primary key and the wallet lock give the same safety.
- *A "keep 10 timber for the station" rule* so that nobody can lock themselves out: rejected, because it needs another argument and another branch in the SQL function. Allowing only two buildable buildings for now has the same effect.
- *All buildings as one JSON column in one row:* rejected, because a table check rule can then not keep a plot and its building together, and the finale could not ask one plain question of the database.
- *The starter pack at the entry kit grant* (package A3): rejected for now. The pack is made with the islet row at the first build, so the islet does not depend on A3. The result is the same: 20 timber once per player, guarded by the primary key.
- *Known limits:* timber has no ledger. `islet_buildings.timber_paid` is the only record of it. Until the home islet migration is applied, `GET /api/islet` answers `502 database_error`, so do not pass the live transport (`transport: api` in `frontend/src/game.js`) before the migration is applied. Until then the panel runs in unavailable mode and sends no request.

**Agreed by, PR and impact:** Pending Nils. Affects the islet panel (`frontend/src/screens/islet/`), the world drawing of the home islet (a building is drawn only when it stands), the case finale (packages S3 and L3 read the signal station), the roadmap line "3 plots", the policy matrix in [supabase/README.md](../supabase/README.md#who-may-do-what) and [INTERFACES.md](INTERFACES.md#your-home-islet-package-l2).

## D024 · Open-world must: weather states, fog-night rule, Lisbon day, bulletin and Chapter 2 hook · 2026-11-06

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

## D025 · Prediction desk rules · 2026-11-06

**Status:** Proposed in the L5 pull request (`feat/l5-prediction-desk`); accepted when reviewed by another
teammate and merged. The number is provisional: the controller renumbers it at merge. Base: the roadmap (L5)
and OPEN-WORLD section 8. Points marked "chosen here" need Nils' OK. The flag `predictions` stays off (Nils'
decision 18).

**Decision:**
1. Play-coin pools only: the winners share the pool. No outside odds, no link to a betting site; Manifold's
   own probability is never shown, only coins and captains per side and a rough payout per coin.
2. Questions: a hand-picked allow-list in `backend/content/predictions/questions.json` (one folder per feature;
   D016 and the roadmap said `backend/content/questions.json`), Manifold only, each read by a person
   (`reviewedBy`); a `pending` question is hidden.
3. Stakes (chosen here): one per player and question, 1 to 50 coins, at most 200 per Lisbon day. Staking closes
   at the question's own time, at least 60 minutes before the deciding moment, earlier if Manifold closes or
   decides. The database keeps the closing time it was given at the first stake and never changes it; at every
   stake the earlier of that stored time and the time the server knows at that moment counts, so a stored
   closing time never moves later (two server instances with different readings of Manifold can disagree for a
   short while).
4. Payout (chosen here; changed from OPEN-WORLD 8.1): the cut is 5 % of the LOSING side, rounded down, so a right
   forecast never loses coins (with the old rule of 5 % of the whole pool, 99 coins on YES against 1 on NO would
   pay the winners only 95). Largest-remainder rounding, ties to the earliest stake: payouts plus cut equal the
   coins staked. Full refund when void (Manifold CANCEL, MKT or anything else, or the host), when nobody picked
   the winner, and when everybody picked the same side.
5. Settlement: a host button in the minimum (yes or no only after closing and only matching a decided Manifold;
   void any time). Final, even if Manifold changes its mind later. Automatic settlement later: Manifold decided,
   then a 60-minute grace, on the first request that touches the pool (no cron, D002).
6. Database: reasons `prediction_stake` (spend, ref `stake:<stakeId>`) and `prediction_payout` (earn, ref
   `pool:<questionId>`); tables `prediction_pools` and `prediction_stakes`, view `prediction_pool_sides`;
   functions `prediction_place_stake()` and `prediction_settle_pool()`, each one transaction, pool lock first,
   then wallets by player id. The server computes the payouts (`pools.py`); the database checks that they cover
   exactly the paid stakes, add up and stay within one coin of the exact share. Update rights per column. A
   trigger (`prediction_pools_keep_settled()`) makes a settled pool final in the table itself: it refuses every
   update of a settled pool, so even a server bug cannot reopen a pool and pay it a second time (the ledger
   ref `pool:<questionId>` alone would only stop a second payout to the same player).
7. Data: Manifold, no key, cached 120 s per question per server instance, a recorded answer as the fallback;
   demo mode never calls it. Polymarket later. Never Kalshi or Metaculus. A stake needs a real reading, and
   (chosen here) a `stale` reading (the last good answer, kept because Manifold cannot be reached) must not be
   older than 15 minutes: an older one is still shown and still limits a host's settlement, but nobody can
   stake on it, because a market that was decided meanwhile would be news that only some captains know.
8. API: `404 feature_off` while the flag is off; a repeat answers `409 already_applied` first; settle is host-only
   (`HOST_PLAYER_IDS`, A2's contract).

**Why:** forecasting fun with no money; numbers a student can explain line by line; no right forecast loses
coins; no coin is ever created; a double click or a retry never pays twice.

**Alternatives and trade-offs:** cut on the whole pool (rejected, see 4); rounding down with the leftovers in the
cut (rejected: it rounds against the winners); several stakes or switching sides (not in the minimum); the split
computed in SQL (rejected: the rule would be written twice in full); one stake table shared with L6 (left to L6);
a link to Manifold (text credit only); no age limit for a stale reading (rejected: the information edge is real,
see 7). Known limits: a player deleted while a pool is open takes their stake out of the pool; the cache is per
instance; news can reach players before Manifold resolves, which is why pools close before the deciding moment
(and why a stale reading is limited to 15 minutes).

**Agreed by, PR and impact:** proposal for Nils, 6 Nov 2026. Affects L6 (`pools.py`), the list of wallet reasons
(13), the kiosk screen and A2 (`hosts.py`).

## D026 · Lantern Duels rules · 2026-11-06

**Status:** Proposed in the A7 pull request (`feat/a7-lantern-duels`); accepted when reviewed by another teammate and merged. The number D018 is a placeholder: the controller renumbers it at merge if another entry took it first (OPEN-WORLD on `s0final` also mentions a D018). The full spec is [specs/A7-lantern-duels.md](../specs/A7-lantern-duels.md).

**Decision:** Lantern Duels, the PvP arena (package A7), is a duel of **sealed signals** between two captains, behind the flag `arena`, which stays off.

- *The duel.* Each captain seals a sequence of lantern signals, one per round (3 or 5 rounds): Flash outshines Shade, Shade leaves Mirror nothing to throw back, Mirror throws Flash back, and the same signal twice scores for nobody. Each captain has as much lantern oil as the duel has rounds: Flash burns 2, Mirror 1, Shade 0. More rounds won wins; equal is a draw. The challenger seals with the challenge, the other captain with the answer, and answering *is* accepting: in one database transaction the server stores the answer, opens both envelopes, decides every round and settles the coins. The browser sends only signals, never a result or an amount (D003).
- *Challenges.* By captain name (the exact display name, in any letter case) or open to any captain, where the first answer wins. Withdraw (the challenger) and decline (the named captain) are one extra route, `POST /api/duels/{id}/cancel`, and the list is `GET /api/duels`; both are new names for the Mon 9 contract review.
- *Money.* Stakes of 0 (friendly), 10, 25, 50 or 100 coins from each captain. The challenger's stake is held when the challenge is sent, the answerer's when they answer. The winner takes the pot minus a **cut of 5 %**, rounded down (19, 47, 95 or 190); the cut has no ledger row and is simply not paid out. A draw, a withdrawal, a decline and an expiry give every stake back. Two new wallet reasons, `arena_stake` (spend) and `arena_payout` (earn), with the ref `duel:<duel id>`, so the ledger's unique index stops a double stake or a double payout. Each money change is one atomic database function (`duel_create()`, `duel_answer()`, `duel_void()`), like `market_trade()`. Caps are checked inside the functions while the locks are held: 3 waiting challenges per captain, and 3 staked duels per day between the same two captains (the day starts at 00:00 Lisbon time).
- *Time.* A challenge can be answered for 24 hours. The deadline is checked lazily, on the next request that touches the duel (no cron, no timer), and the database clock decides. A sealed duel has no forfeits: nobody can lose by being offline.
- *Sealed means sealed.* A captain's signals reach the other captain only after both envelopes are in, and only inside the stored reveal. The table `duel_moves` has no grant and no policy for players, and no role (not even the server) may update or delete a row. `views.py` is the one place that decides visibility and refuses to build a view that would show a sealed signal. A test runs two fake databases that differ only in the challenger's signals and demands byte-identical answers for the named captain and for a visitor.
- *Where the numbers live.* Python constants in `backend/server/duels/rules.py` (as D017 did for the Exchange), checked against the migration by a test.

**Why:** It is fair and explainable: both captains have the same signals, oil and rounds; swapping the two captains swaps the result (checked for all 17 x 17 pairs of 3-round sequences and all 147 x 147 pairs of 5-round ones); no allowed sequence is unbeatable, so there is no safe plan, only a guess about the other captain; and sealing first is no disadvantage because nothing about the first envelope is visible. Nobody loses by being offline, which suits a class where players are not all online together. It needs few calls (about 40 per 10 quiet minutes for one open panel, polling only), well inside the free tiers, and no Realtime. One atomic function per money change keeps the ledger honest even when two requests arrive at the same moment.

**Alternatives and trade-offs:**

- *Live round-by-round duels now* (both captains online, a 30-second timer per round, forfeits): more calls, round timers and forfeits, and nobody may be offline. Planned for after 23 Nov as a new duel style; the migration then adds a style, a current round and a round deadline.
- *A separate accept step:* a half-accepted duel needs a deadline and a forfeit. Rejected: answering is accepting.
- *Hash commitments for the sealed signals:* the server is already the trusted referee and holds both envelopes, so a commitment would add code and prove nothing. Rejected.
- *No cut:* simpler, but then duels are no coin sink and coins pass between captains without any cost. Open for Nils.
- *`duel.json` for the numbers* (OPEN-WORLD): D017 used constants and so do we. Open for Nils.
- *Known limits:* the round results and the outcome are an input from Python (`rules.resolve`), like the price of a trade; the database checks only what follows from them (one result per round, results from the three allowed words, an outcome that fits the counted points) because it never reads the challenger's envelope. A challenge that nobody touches stays open past its deadline, with the stake held, until the next request touches it (the panel shows the coins as held). The rival in the screen's practice ring is a local stand-in for development only.

**Open for Nils** (the spec's answer stands until he decides): (1) the cut, 5 % or none; (2) stakes up to 100 from the first switch-on, or friendly duels only at first (the floor is one constant away: `ROUND_CHOICES = (3,)` and `STAKE_CHOICES = (0,)`); (3) the answer window, 24 hours or shorter for class; (4) keep live duels in the plan or drop them; (5) agree the two routes beyond the reserved names at the Mon 9 freeze; (6) Python constants instead of `duel.json`.

**Agreed by, PR and impact:** Pending Nils and a different human teammate. Proposed in the A7 pull request. Affects `docs/INTERFACES.md` (five routes, the status codes, two tables, three functions, two reasons), the wallet reasons (the list now has 13 entries; keep the migration order and the Python order the same), the arena screen (browser) with a few lines in `frontend/src/game.js` (the hook at the arena gate, and the lines that make the open panel an overlay, so Escape closes it instead of opening the pause menu; these go beyond the one hook the spec first agreed and need approval), and the Mon 9 contract review. The existing test that pinned the market reasons to the end of `WALLET_REASONS` now pins them right after the first eight, because recipe 4.7 appends new reasons (the requirement changed); the arena reasons are pinned by position too (`WALLET_REASONS[11:13]`), so the next package that appends a reason breaks no test. The migration is applied to Supabase only after review, and `arena` stays off until Nils decides.

## D027 · Case backend contracts · 2026-11-06

**Status:** Phase 1 built on `feat/case-backend` for Claude's review. Later phases remain gated. Nils confirmed C4, C6, C9, C16 and C18 on 6 Nov; the other rows are the specification's built defaults.

| Decision | Contract |
|---|---|
| C1 | Game refusals are 200 with accepted=false, reason, message and a fresh view. |
| C2 | A repeated actionUid rebuilds its stored outcome first and adds repeat=true. |
| C3 | GET /api/case and POST /api/case/search replace the old board-read and free-form act reservations. |
| C4 | Decided: whole case seconds since muster, no pause; a host moves only their own crew. |
| C5 | Timed results take effect at their stored acceptance-time deadline, without a settle job. |
| C6 | Decided: a partner pin's reward is paid when its order is accepted. |
| C7 | Concurrent searches are allowed; each seat finds each card once. |
| C8 | The crew sees rounded glow during its own night. The specification's default remains pending Nils or the story owner. |
| C9 | Decided: a locked solve never later changes the world; its rewards and reveal still happen. |
| C10 | Case tables are server-only, with RLS and no player grants or policies. |
| C11 | The case flag defaults off and gates all case routes, including the later world route. |
| C12 | Light posts remain occupied after dawn. |
| C13 | A player locks their own light; any crew player may lock a partner-held light. |
| C14 | Optional route labels are data; absent labels use the card title. |
| C15 | Every state-changing refusal is logged, so retries preserve refusals. |
| C16 | Decided: only contributors with a share appear on the Wall of Lights. |
| C17 | Partner pin credit starts at order acceptance; pairing waits for the actual pin. |
| C18 | Decided: position and boarding are presentation only, never server prerequisites. |
| C19 | Any crew player's level-one station readies the crew's home light; only players man it. |
| C20 | RELIGHT_OPEN=true is accepted only in explicit production; unset is closed. |

**Migration reservations:** Phase 1 060000, Phase 2 080000, Phase 3 120000, Phase 4 130000; stream C 140000. Group 3 owns 090000, 100000 and 110000. All filenames start with 20261106. No historical or reviewed migration is edited.

**Why:** One earned crew view, exact retry outcomes and database-guarded writes keep the browser contract and shared state consistent. Secret content remains server-only, and rewards use existing once-per-player wallet reasons. See [the specification](../specs/case-backend.md) and [the published API contract](INTERFACES.md#case-phase-1-contract-for-g9).


## D008 · Grow order is moot · 2026-11-06

**Status:** Decided by Nils; recorded by G10 on 6 Nov 2026.

**Decision:** The earlier proposed grow order is moot. Work is already split into the browser task G9, server task G10 and Claude's integration checkpoints. Follow the dependencies of those tasks rather than waiting for a kickoff to choose the old order.

**Impact:** The old grow-order question in the roadmap is historical. Group 3 still waits for Claude's group 2 confirmation; this decision does not waive that checkpoint.

## D009 · Interfaces v1 as built · 2026-11-06

**Status:** Decided by Nils; recorded by G10 on 6 Nov 2026.

**Decision:** Accept the v1 contracts in [INTERFACES.md](INTERFACES.md) as built. Later server and browser work updates those contracts together rather than inventing a second interface.

## D010 · Backbone go; deployment check 1 remains open · 2026-11-06

**Status:** Go, decided by Nils; recorded by G10 on 6 Nov 2026.

**Decision:** Continue building on the backbone. Deployment check 1 in [SETUP.md](SETUP.md) remains open; it does not block the work. This entry records the decision and does not claim a new live deployment check.

## D014 · Finnhub ownership and key location · 2026-11-06

**Status:** Decided by Nils; recorded by G10 on 6 Nov 2026.

**Decision:** Nils owns the Finnhub key. Keys live only in Vercel settings, never in the repository, a local file, a prompt or a report. G10 does not read or change them.

## D031 · The mystery leaves the game (10 Nov) · 2026-11-10

**Status:** Decided by Nils on Tue 10 Nov 2026 with the new direction in [PITCH.md](PITCH.md);
implemented on branch `feat/g30-remove-mystery`. Changes D013 (story skeleton), D012 (crews) and the
"Full mystery" path of D029/D030.

**Decision:** The 2-hour mystery leaves the game and the browser code. Removed: the Lighthouse prologue
(the story engine, the intro screens, the cottage, boathouse and lighthouse rooms, the intro journal and
cloud saves of it), every case screen (crew, board, searches, partners, finale, accusation, reveal,
relighting, arrival, log, hints and the onboarding tips), the case adapters (fake and online: case,
crew, save, ledger and bulletin reads), the case world (case hotspots, Gull's Rest, the Chapter 2 hook,
NPC partners, the case cinematics), the "Full mystery" and "Lighthouse prologue" menu entries, the
highlights tour and the presenter tour panel, and the host console's case clock. In the same removal,
from the UX audit: the festival gameplay (it could only start after the case's Relighting), the
bulletin and rewards pages, and the arena gate with its duel panel, so the class demo's duel shortcut
(tap a captain) is the one way to start a duel. The HUD wordmark no longer reloads the page.

Kept: the islands and the sea chart, the title (Play, Join, Settings), the lore and class-demo
cutscenes, the class demo, live presence, the Home islet build panel (it now also opens at the signal
station), Exchange, predictions, sports, weather, account and sign-in (GitHub, email, guests),
settings, audio and the host console. Shared pieces: the coin counter stays (it reads
`captain.coins`); the crew rows, crew codes and crew Realtime room are no longer read by the browser
(the Join page accepts only the class code), so the coming island/Harbor code can replace them; the
festival lamp art and sound cues stay because the class demo uses them. The adapter contract keeps
`schema, mode, revision, now, captain, account, presence, notice` and the intents `signIn, signOut,
rerollName, deleteMyData, reportPosition, setEmote`; `online/case-adapter` is now `online/adapter`.

The backend case code, its routes and its tables stay for a later cleanup; the browser no longer calls
`/api/case*`, `/api/board/*`, `/api/finale/*`, `/api/crews*`, `/api/save`, `/api/intro/complete`,
`/api/content/intro-story`, `/api/world`, `/api/bulletin` or `/api/host/case/clock`. The `case`
flag is off in the default and local configuration; the owner switches it off on Vercel later.

**Why:** Three teammates start the island, Harbor and Pirate Point features today on a smaller, simpler
codebase. The mystery's screens, adapters and checks were about half of the browser code and every new
feature had to route around them.

**Limits:** The intro used to grant the only starting coins (the entry kit); until the new economy
adds a starting grant, a new player starts with 0 coins. Existing local intro saves stay in the
browser's storage unread. The `case`, crew and save routes still answer if the flag is turned on.

## D032 · Islands and pirate waves (10 Nov) · 2026-11-10

**Status:** Built by lane 0 (tasks 0.2 and 0.3) on branch `feat/g30-core-api`, following [PITCH.md](PITCH.md) and the contracts of [BUILD-PLAN.md section 3](BUILD-PLAN.md#3-contracts-the-only-things-lanes-share). Migration `20261110010000_islands_and_waves.sql`, behind the new flag `islands`. Applied to the live database on 10 Nov 2026 (and `20261110020000_wave_crews.sql` after it); merged to `main`, the flag `islands` stays off until the pirate frontend is wired in.

**Decision:**

- **One island per player, with a code.** `islands` holds the code (5 symbols of the class-code alphabet, shown as `ISLE-K7Q2M`, unique, made by the server at random), the best wave and the flags. The first `GET /api/island` (or build, or bell on `"own"`) makes it. The code is not a secret: it lets another signed-in player look at the island and help defend it; visits are rate limited so guessing stays slow.
- **The economy of BUILD-PLAN 3.2, coins only.** `backend/content/islands.json` holds the prices (wall 10, cannon 30, watchtower 40, house 50), the eleven spots, the starting coins (100), the loot rule and the wave timing. Builds reuse the home islet's atomic `islet_build()` with a timber price of 0, so the island and the old islet share `islet_buildings`; its check rule now lists the 4 old and the 11 new spot pairs. The old `/api/islet` and its `buildings.json` stay, because the islet screen and the case finale still read them; they retire with the case cleanup.
- **Starting coins.** A brand-new player (a wallet that never moved) gets 100 coins once when their island opens (reason `starting_coins`, fixed ref). An admitted class-demo guest still gets the Stranger kit (profile, start place, item) but is paid 100 instead of 1600, so guests and players start alike. Players who already hold coins keep them until the fresh start.
- **Waves are started and finished by the server; the fight runs in the browsers.** `POST /api/waves/start` hands out the wave number (best + 1, at most 50), a seed and `startsAt` (bell + 10 s) to the shared simulation, with the real weather of the default place (storm: 1.5x ships; fog: fog 0.4; down: calm). One running wave per island; an unfinished wave expires after 900 s. `POST /api/waves/finish` was at first accepted only from the player who rang the bell (since `20261110020000_wave_crews.sql` every participant finishes for themselves, see the next paragraph), not earlier than 15 s after `startsAt` (refused, the wave keeps running), and pays at most 10 + 5 × wave + 5 × houses for a survived wave, 0 for a lost or expired one (reason `pirate_loot`, ref `wave:<id>`). A survived island wave raises that island's best wave and adds a flag. Both routes are safe to repeat.
- **Fresh start.** `scripts/admin/fresh_start.sql` (not a migration) sets every wallet to 100 through the wallet function (reason `fresh_start`), clears cloud saves, removes buildings, best waves, flags and wave runs, and keeps accounts, names and island codes. It is a dry run unless one constant is switched.

**Why:** The server keeps the rules it can check (who, when, how much), and the browsers run the same deterministic simulation from one seed, so friends see the same wave without a server game loop. The browser's `survived` cannot be proven; the loot cap, the minimum length, one wave at a time and the per-player budget bound what a cheat can earn to small play-money amounts. Reusing `islet_build()` keeps one audited money path for buildings.

**Shared waves (task 0.4, migration `20261110020000_wave_crews.sql`):** friends join a running wave (`POST /api/waves/join`, found with `GET /api/waves/current`), and every participant finishes for themselves with their own loot (Pirate Point base 20 instead of 10, and `flagship: true`). The first finish closes the wave for new joins; the island's best wave and one flag count once, at the first survived finish. The weather comes from the bell-ringer's area (Vercel geo headers, never stored), else the default place, else calm.

**Limits:** The flagship and the three lamps are drawn and decided in the browsers; the server only flags the wave. The first cannon of the pitch's "first 3 minutes" is not free: it costs 30 like every cannon (BUILD-PLAN 3.2 is the contract). Budgets hold per server instance. The weather follows whoever rings the bell, not the island owner, because the server stores no place.

## D033 · Football board: Premier League, Primeira Liga and Champions League · 2026-11-11

**Status:** Built by lane 0 (task 0.6) on branch `feat/g30-sports-leagues`. No migration, no new key; nothing to set in Vercel (the default applies).

**Decision:**

- **Three competitions, one request.** The board asks football-data.org once for `GET /v4/matches?competitions=PL,PPL,CL&dateFrom=..&dateTo=..` (today and the next 7 days) instead of `/v4/competitions/PL/matches`. The list is the new setting `SPORTS_COMPETITIONS` (default `PL,PPL,CL`); it accepts only the 12 free-plan codes (PL, CL, PPL, BL1, SA, PD, FL1, DED, ELC, BSA, WC, EC), and an unknown code stops start-up like `AUTH_PROVIDERS`. A row of a competition we did not ask for makes the whole answer unusable (503), as before.
- **Every pick settles on the 90-minute result.** For `score.duration` `REGULAR` it is `fullTime`; for `EXTRA_TIME` or `PENALTY_SHOOTOUT` (Champions League knockouts) it is `score.regularTime`, never `fullTime`, which adds extra time and, after a shoot-out, the penalties. A 1-1 after 90 minutes is a draw even if a team wins later. A game beyond 90 minutes without a whole-number `regularTime` that fits `fullTime`, or a finished game with an unknown duration, never settles: the board drops that row, and a stake on it stays pending. The old "league games only" check (`competition.type == LEAGUE`) is replaced by the free-plan code check, because the Champions League has type `CUP`.
- **Bounds.** The board keeps the earliest 40 fixtures (was 20: a Champions League matchday alone has 18 games, the three competitions about 40 in a week), below the store's 50-fixture read; the provider list may hold 200 rows (was 100). The 60-second cache and the 10-calls-a-minute budget are unchanged, and three competitions still cost one call.
- **Competition name.** Each fixture already carried `competition` (the provider's name, for example "UEFA Champions League"), which the sports panel shows; the answer's shape is unchanged.

**Why:** The class is in Lisbon and the Premier League alone often leaves the board empty midweek. The Champions League rule follows the usual 1X2 convention and stays one line of code; excluding knockouts would hide the February games. Only competition codes and dates go to the provider, so the privacy page does not change.

## D034 · Simple market calls instead of leverage in the game · 2026-11-11

**Status:** Built by lane 0 on branch `feat/g31-market-calls`. Migration `20261111010000_market_calls.sql`, behind the existing flag `market`. Applied to the live database on Wed 11 Nov 2026.

**Decision:** The Harbor market stall offers one thing: "Up or down in 1 hour?" (since 11 Nov: 5 minutes) on Bitcoin, Ether, Gold (PAXG), Apple or NVIDIA, the Exchange's own company ids and price feed. A call stakes 5, 10 or 25 coins at the live price now; one hour later a right call pays 2 × stake, a wrong one 0, an unchanged price refunds, and no price within 24 hours refunds. At most 3 open calls per player; a repeated actionUid is the same call. Assets are open for calls only while the feed holds a live price (so in demo mode, and for stocks while the stock key fails, they show closed). `GET /api/market/calls` lists the assets and the player's calls and decides due calls lazily on that read; `POST /api/market/calls` opens one. Coins move only through `market_call_open()` and `market_call_settle()` (reasons `market_call_stake`, `market_call_payout`, ref `call:<id>`). The leverage Exchange routes and tables stay in the code and the database, out of the player-facing game.

**Why:** The pitch promised "real prices, no leverage jargon" and small numbers. A fixed 1-hour window and a 2× payout fit one sentence on a card and need no fees, zero points or liquidations. Lazy settlement needs no scheduler on the free hosting.

**Changed 11 Nov 2026 (owner request):** a call is decided 5 minutes after it opens, not 1 hour, because an hour is too slow to play at the stall. Migration `20261112010000_market_calls_5_minutes.sql` replaces `market_call_open()` (`c_hold` is 5 minutes); calls opened before it keep their stored `settle_at`. Stocks are offered only while their price is live; outside New York hours the stall shows them closed, since a 5-minute call on a last close would only return the stake. Everything else above stands.

**Limits:** The settle price is the first price the server reads at or after `settle_at`, not the exact price at that second; a player who looks late is decided on a later price (for a stock outside New York hours, the last close). The 2× payout has no house edge, so the expected value is about 0 for a fair coin; with only three stakes and three open calls the coin flow stays small.

## D035 · No prediction market in the game (11 Nov, owner) · 2026-11-11

**Status:** Decided by the owner on Wed 11 Nov 2026; done on the integration branch `integrate/g31`.

**Decision:** The game has no prediction market. The fortune teller (yes or no questions from Manifold, the frontend of the prediction desk, package L5) leaves the player-facing game and the frontend: its Harbor card and overview entry, the `prediction_kiosk` hotspot (the building stays as scenery), the old desk under `frontend/src/screens/predictions/`, its tests and checks, and the Manifold credit. The browser never calls `/api/predictions*`; the owner switches the flag `predictions` off at release. The backend code (`backend/server/predictions/`, its routes and migration) stays for a later cleanup. The Harbor keeps the market stall (up or down in 5 minutes, D034), the match board (football), the weather board and the duel ring; the quest goal "Place a 🪙 stake" is met at the market stall or the match board.

**Why:** The owner's call for the redesign: stakes on open-ended real-world questions read as a prediction market, which the game should not be. The market stall and the match board keep one clear, small stake each.

## D036 · Tower defense v2: levels, crew, captain, Pirate Point builds, 100 waves · 2026-11-11

**Status:** Decided by the owner on Wed 11 Nov 2026 (docs/TOWER-DEFENSE.md); backend built on branch `feat/td-backend`. Migration `20261111030000_tower_defense.sql`.

**Decision:** The island gets 16 spots: `wall_1`..`wall_6`, `cannon_1`..`cannon_7` (each takes a cannon or a mortar, chosen at the first build; the old `cannon_1`..`cannon_4` keep their ids so existing rows and scenes stay valid), `tower_1`, `house_1`, `house_2`. Buildings have levels (wall, cannon, mortar 3; watchtower, house 2), crew is bought once and kept (gunner 2, carpenter 2, lookout 1), and every captain has a level 1 to 5. Prices, maximums and unlocks live in `islands.json`; the server checks them and passes them to one atomic, repeat-safe database function per action (the wallet ledger ref is the record of a click), which checks the maximum and the unlocked level again. Unlocks follow the best wave a player won: their island's best, or any wave they fought in and won, on any island (a friend's too) or Pirate Point (`islands.won_wave_best`, from `wave_participants`), so friends on one island unlock together. Co-op building: everyone on an island builds and upgrades there with their own coins (an optional `code` on build and upgrade; `island_build()` for a visitor's build); the buildings belong to the island. Crew and the captain stay personal. Pirate Point has ten shared spots in `pirate_point_buildings`; whoever clicks pays. Waves go up to 100, every 5th is a boss wave (`boss: true`, loot × 2), house levels count for the loot, and after a lost island wave the next bell rings the best wave minus 2, at least 1 (`islands.next_wave`; a win of the same wave beats the loss). `wave_finish()` gets a new 11-argument version next to the 8-argument one, so a server from before the migration keeps working until the new code is deployed. A friend invite (`POST /api/island/invite/join`) admits an anonymous guest who presents a valid island code through the same `demo_guests` admission as the class code; no class code is needed, and any number of friends may join one island (the wave tables have no cap).

**Why:** The owner wants a deeper tower defense he can play with his brother tonight, with as little new machinery as possible: the existing islet table, ledger, guest admission and wave functions carry the new rules.

## D030 · Class code instead of the demo window · 2026-11-09

**Status:** Decided by Nils on 9 Nov 2026; implemented on branch `feat/g29-classcode`. Replaces the
demo window of D029. Migration `20261109020000_class_code.sql`.

**Decision:** Supabase anonymous sign-ins stay switched on permanently; nobody toggles anything per
lecture. A guest (anonymous user) plays only after presenting the current **class code**: 5 symbols
of `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, shown as `HARBOR-K7QXM`, carried in the projector QR as
`?join=K7QXM` and accepted under Join with or without `HARBOR-`, in any case, spaces and dashes
ignored. `POST /api/demo/join` compares it in constant time (10 tries per 10 minutes per player and
per network address, per server instance) and records the guest in `demo_guests` (player id and
time). The guest gate admits an anonymous player only with that row; every browser policy (tables and
the five Realtime room policies) adds `(not jwt_is_anonymous() or is_admitted_guest())`, so a token
not explicitly `is_anonymous: false` needs the admission. There is one current code; the host's **New
class code** (`POST /api/host/demo/code`) replaces it and the old one stops working for new joins at
once; admitted guests stay admitted. No expiry. The code is stored as plain text, readable only with
the secret key, so the host can show it again; it is never logged and never in `/api/config`, which
now says only `demo.guestsByCode`. Each host read of `GET /api/host/demo` starts a bounded background
clean-up of anonymous users older than 24 hours (at most every 10 minutes, 25 per run); **Clean up
guests** stays as the manual run. The window routes are gone; the window table and functions stay in
the database unused (no destructive migration). Admitted guests keep every Realtime room they had,
because a guest can leave the class harbor ("Full mystery", the map).

**Why:** Opening and closing a window before and after every lecture, and switching anonymous
sign-ins on and off in the dashboard, is easy to forget, and while sign-ins were on the database
policies admitted any anonymous user anyway. Anyone can create an anonymous user with the public
publishable key, so the QR cannot be the lock; the server gate and row-level security are. A short,
unambiguous code is easy to read off a projector and to type; 31^5 (about 28.6 million) codes with a
per-player and per-address budget make guessing impractical, and a new code per lecture makes an old
photo of the QR useless.

**Limits:** The join budget is per server instance (Vercel may run several) and the address is
`X-Forwarded-For` as Vercel writes it. An anonymous user without the code can still create the
Supabase user (Supabase's own per-address limit applies), read the public routes, try codes within the
budget and delete their own data. The policies trust Supabase's `is_anonymous` claim; a token without
it is treated as a guest (fail closed). Re-applying an older migration on its own (for example
`20261106000000_foundation.sql`) would restore an unguarded policy: apply the chain in order.

## D029 · Class demo: guest play, demo window, Keeper's Lock · 2026-11-09

**Status:** Decided by Nils on 9 Nov 2026 (the G29 demo journey); server part (C0) recorded by the
G29 server agent. Numbered D029 because D028 is already taken by the island redesign entry below.

**Decision:** For the class demo, phones join as Supabase anonymous users ("guests"). The API admits
a guest only while the new flag `demo` is on and a host has opened the demo window ("Demo open for N
hours", 1 to 6, stored in `demo_window`); otherwise every login route answers `403 demo_closed`.
GitHub and Google users are never gated. A host can delete anonymous users older than 24 hours
through `delete_player`. Guests skip Act 1: on the first admitted call they get a generated captain
name and the Stranger kit through the existing `assign_captain_name` and `grant_entry_kit`
(ending `ending_demo`, decision `none`, move count 1, the existing `kit_grant` reason). The Keeper's
Lock asks about the real sky at the player's place (chosen place, else Vercel's city-level IP
headers, else the default weather place), accepts an answer one step away as close enough, falls
back to the last good reading (at most 6 hours) and then to a riddle, and offers a hint path after
one wrong answer. It stores only the answer id and verdict, never the place, and pays no coins.
`AUTH_PROVIDERS` adds Google as a second ordinary sign-in.

**Amended 9 Nov 2026 (G29 email):** Nils dropped Google. `AUTH_PROVIDERS` now names `github` and
`email` (a 6-digit email code, Supabase email OTP); `google` is an unknown name and stops the
server. A guest keeps progress by linking GitHub or by confirming an email with a code on the same
user. Email users are ordinary players, never gated.

**Why:** Two players needed 45 to 50 clicks and a GitHub account; a QR join must take seconds. A
time-boxed window keeps anonymous accounts out of the game outside the class. The Stranger ("took no
side") is the kit that fits a player who never played Act 1, and reusing the two existing functions
keeps one path for names, profiles and coins. `ending_demo` passes the table rule for endings and
marks the profile as demo-made; 1 is the closest move count the table allows. The weather lock must
never block the demo, hence the cache, the riddle and the hint.

**Limits:** The gate covers this API only. While anonymous sign-in is on in Supabase, guests hold the
`authenticated` role, so the existing read policies and Realtime rooms admit them even with the
window closed: switch anonymous sign-in off after the demo. The window is cached 10 seconds per server
instance. Cleanup reads Supabase Auth's admin user list (up to 5,000 users) and deletes at most 100
per call. See [INTERFACES.md](INTERFACES.md#class-demo-guest-play-the-class-code-and-the-keepers-lock-g29-d030).

**Superseded in part by D030:** the demo window is replaced by the class code; the guest kit, the
Keeper's Lock and the clean-up stay as decided here.

## D047 · Fast-track merging for the T29–T47 sprint · 2026-11-14

- **Status:** accepted by Nils (`Nilsnova`) for this sprint only. Teammates may overturn it in the issue or chat.
- **Decision and reason:** to get Ianno's defense and shared-island roadmap onto `main` quickly, the T29–T47 lane PRs (#21–#28) are merged as soon as their checks pass, **without waiting for a prior peer approval**. This is a temporary exception to CONTRIBUTING §4 and AGENTS.md. Merge gate: `npm test`, `npm run build`, `npm run test:mp`, the GitHub sign-in checks (`check-online-auth`, `check-online-signin-gate`) and backend `pytest`/`ruff` pass. A feature that needs a new database table ships behind a new feature flag that is off by default, so the live site and existing APIs keep working. Applying a migration and switching a flag on are separate, announced steps.
- **Alternatives and trade-offs:** waiting for a peer approval on each PR is safer and keeps everyone able to explain the code, but it would delay the sprint. In exchange, review moves to after the merge: every teammate should read the merged PRs and the specs (with explain-back sections) before the walkthrough, and anything can be reverted with a normal PR.
- **Agreed by / issue or PR / impact:** Nils, 14 Nov; issues #21–#28. The design decisions D039–D046 inside the lanes stay *proposed* until the team agrees on them.

## Next entry

- **ID / date / title:**
- **Status:** proposed / accepted / superseded by Dxxx
- **Decision and reason:**
- **Alternatives and trade-offs:**
- **Agreed by / issue or PR / impact:**


## D028 · A simpler, detailed island experience · 2026-11-06

**Status:** Requested by Nils in the visual redesign session. Supersedes the low-density rendering,
position snapping and permanently visible controls in D005; original asset sources remain available.

**Decision:** Use freshly drawn high-density island art, an original illustrated title and continuous
player/camera motion. Keep world geometry and story/server IDs unchanged. Show short replacing story
passages, optional Journal history, compact controls hidden by default, and opaque full-screen rooms
when crossing cottage, boathouse or opened lighthouse doorways. Case screens use a stable frame and
progressively revealed controls. Multiplayer is visible from the title but only described as connected
once the G9 adapter has been integrated and verified. The AI companion is canceled.

**Why:** Nils's playtest showed overflowing prose, overlapping HUD panels, a distracting control strip,
small cutaway rooms and visibly coarse art. Detailed textures and a denser framebuffer improve the
actual image while short passages and optional secondary controls make the next action clearer.

**Limits:** Rules, reward receipts, original story actions and server-only mystery answers stay intact.
The detailed title has a reviewed 350 kB transfer ceiling; cold JavaScript/CSS budgets stay unchanged.
Rendering has explicit quality/DPR/pixel caps and the old textures remain fallback assets. See the
[execution plan](UX-SIMPLIFICATION.md) and the component evidence in `docs/handoff/`.

## D037 · Weekly island leaderboard · 2026-11-13

**Status:** scope approved by Ianno Hollensteiner; implementation in [PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13), independent human review pending.

**Decision:** rank the global top ten islands by their highest successful wave
finished this UTC week (Monday 00:00). A multiplayer island appears once; restarts
do not lower its score. Equal waves share rank, fewer islands mean fewer rows.
Show a Harbor noticeboard with gold/silver/bronze rank badges, short reset text,
and public host names; never return invite codes or private account fields.

**Why and limits:** reuse existing wave records and the island login gate for a
small read-only feature with no migration or rewards. Solo and multiplayer share
one ranking. At most 2,000 sorted runs per request; fail visibly if that cannot
establish the full result. Concurrent deletion can shift pages; there is no SQL
snapshot, live database proof or anti-cheat upgrade in this task. Revisit a database
aggregate/index if measured usage outgrows this bounded query. See the
[API contract](INTERFACES.md#weekly-island-leaderboard-t7).

## D038 · Personal boss practice before the shared attempt · 2026-11-14

**Status:** requested by Ianno in [T28 / issue #18](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/18); implemented in [PR #19](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/19); independent human review pending.

**Decision:** Explain Haul the chain, Aim the great cannon and Board and duel, with
optional practice or skip on first use per player, island and task. This applies
equally in solo and multiplayer, including Redtide's tasks. The actual multiplayer
attempt still has one shared crew target; Ianno explicitly confirmed that only
the introduction and practice are personal. Reuse the current cartoon stage,
parchment cards, buttons and scoring rules, with a private practice recorder.

**Why:** New players should learn the controls before their input affects the crew.
A per-browser guidance flag is sufficient; it is not authenticated progress and
must never award coins or other rewards. Scope it with the player's account id,
the defended island code and task kind. Another device or cleared storage repeats
the introduction; blocked storage must not stop play.

**Shared start:** standing participants send `finisher_ready` for the current boss
through the existing wave schedule. The scored clock waits for all participants,
up to 60 seconds with a visible automatic-start warning, so inactive/disconnected
captains cannot hold the wave forever. Finishing/skipping marks guidance seen;
an interrupted or timed-out introduction does not. Reset practice input before
scoring. Experienced players announce readiness automatically.

**Limits and alternatives:** no account-wide database storage or new service.
The existing wave-room limits on late/lost messages and late joins remain; local
browser evidence is not proof of real Supabase delivery. A fully authoritative
network barrier would need a separate design. See [the spec](../specs/T28-minigame-introduction.md)
and [message contract](INTERFACES.md#t28-boss-minigame-preparation).

## D040 · Enemy targets and wall pathing (T34/T35) · 2026-11-14

**Status:** proposed. Agreed by: pending team review. Design and pure modules on branch `feat/t34-t35-targeting-pathing`; not wired into `sim.js` yet. Work authorized by Nils (`Nilsnova`); roadmap by Ianno (`Iannomh123456`).

**Decision (proposed):**

- **Targets by enemy type.** A boarder goes for a captain or militia in reach (3), then the wall in its way, then a tower with hp (after T33) within 2.5, then the heart; reach, leash (5) and crowd (3) stay today's `CONFIG.health` numbers. A proposed `brute` profile (walls, towers, then a captain only within 1.5) stays off until the team accepts it. Ships and gunboats keep their current targets.
- **Switching and ties.** Keep the current target while valid; switch only when it is no longer valid or a kind earlier in the order turns up. Equal distances (within 1e-9) go to the lower id; input order never matters. No target through a standing wall.
- **Breach versus detour by one cost.** Boarders walk a 1-unit grid. Walking costs its distance; entering a standing wall costs the time to hack it (hp in quarter steps) as walking distance. The cheaper way wins, so gaps are used when quicker and closed rings are breached. Whole-number costs and index tie-breaks give the same route in every browser.
- **Recompute only on wall changes.** One shared distance field to the heart, rebuilt when a wall is placed, moved, removed, broken, rebuilt or passes a quarter of its hp. Every step lowers the remaining cost, so no loops; a boarder inside a wall rebuilt around it steps out; a goal cut off by water is unreachable and the boarder waits.
- **Walls as a generic list** (`cells`, a `from`/`to` segment, or a point), so T36 placement fits without spot ids.

**Why:** fixed routes cannot use gaps, react to rebuilt walls or handle flexible placement, and towers with hp (T33) need a target rule. A distance field is simple to explain, provably loop-free and measured at about 1 ms per tick for 300 boarders.

**Alternatives and trade-offs:** per-boarder A* (more work per boarder, same routes); always breaching (no gaps, today's spirit, but T36 walls would mean nothing); always detouring (walls never hacked). Lone short walls are walked round, so today's isolated spots lose value under the new rule: before T36, either keep the legacy routes (option A) or join the ring spots into a closed ring (option B); a balance decision with T3. The wiring needs a wave option `pathing` so a mixed-version room never mixes rules. See [the spec](../specs/T34-T35-targeting-pathing.md).

## D043 · Co-op permissions, spending and absent members · 2026-11-14

**Status:** proposed (T37 and T42 of [OPEN-TODOS §9](OPEN-TODOS.md#9-defense-and-shared-island-expansion-proposal-14-nov)); branch `feat/t37-t42-coop-policy`, responsible teammate Nils, plan by Ianno. Issue [#25](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/25), fast-tracked under D047. **Agreed by:** pending team review.

**Decision:** Keep today's co-op rules and write them down as one matrix ([the spec](../specs/T37-T42-coop-policy.md)), enforced in one Python module, `backend/server/island/permissions.py`, with the database functions checking again under their locks.

- **Roles:** host (the island's owner), member (active `island_members` row), outsider (never joined or left). Online is not a role: the server never knows presence.
- **Every shared island action is open to the host and every member, with no vote or approval:** look by code, ring the bell, join a wave, help a captain up, build, upgrade, research, tower skills and house roles, the wreck, tear-down, and the reserved actions persistent repair/rebuild (T31/T32) and arsenal buy/withdraw/return (T40). Outsiders get `403 not_member` with a sentence that names the action. The lobby's Start and Pause stay browser pacing: host, or any member after the host has been away 60 s.
- **Funding is personal; there is no shared wallet.** The clicker pays from their own wallet (`payer_of` answers the clicker or nobody); a tear-down refunds each payer half of what they paid. Arsenal stock is bought by the buyer personally and belongs to the island; withdrawing and returning are free.
- **Absent members (T42):** a wave may start without the full crew or the host; members join until the first finish (or 900 s); a participant who drops reconnects to the same wave and finishes once; a participant who leaves the game mid-wave still finishes their own fight but cannot rejoin or revive; a wave nobody finishes expires after 900 s with no loot and no change to the best or next wave. Wave strength does not depend on crew size; a boss finisher's goal uses the standing participants captured when it starts (D038). Loot goes only to participants who finish, each to themselves; membership alone earns nothing, and there are no offline rewards.

**Changed:** only the wording of the `403 not_member` message (it now names the action); the code and status are unchanged. No route, table or migration changes.

**Why:** crews are small friends' groups that play at different times; requiring the host or a vote would block play, and every spend already has a per-click ledger ref and a database lock. One module gives later lanes (arsenal, recovery, rescue) a single helper and keeps the "no shared wallet" rule explicit.

**Open questions for review (current behaviour kept until agreed):** (1) should a member only tear down what they paid for in full, with the host able to tear down anything? Today any member may (owner decision of 12 Nov, GAME-V3 §4.2); other payers get half back. (2) Should a host be able to remove a member, or hand the game over? Not possible today. (3) The host's personal unlocks follow their island's best wave even when members won it without them (D036); changing this would re-lock existing players. (4) Late joiners earn the full loot of a survived wave; a minimum time in the wave would need a migration.

**Limits:** the Python check and the database check are separate reads; the database's lock is the final word. Mapping tests use the fake database; the SQL rules are covered by their own migration tests. Presence-based rules (quorum, auto-pause) are not possible without a server-side presence design.
