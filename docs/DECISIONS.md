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

**Status:** Proposed in the A3 pull request (`feat/a2-a3-signin-referee`); accepted when reviewed by another teammate and merged. **Two points are pending Nils:** the coins and texts of the kits come from the S0 story drafts and wait for his approval of S0 (point 5), and "the first ending counts" is the recommended default (point 3).

**Decision:** (1) **The server replays the move log.** At the end of Act 1 the browser sends `actions[]`, 1 to 300 action ids (`POST /api/intro/complete`). The server plays them with the original Python engine (`plot_twist/engine.py`) on its own copy of `story.json`. Every move must be accepted by the engine. The first move it does not accept (an unknown id, a move of another scene, a blocked move, a move after the ending) refuses the whole log as `422 move_refused`, and the message names that move. A log that stops before an ending is `422 no_ending`. A refused log stores nothing: the database is not called. The browser never sends an ending, a decision, a kit or a player id; any such field is refused. (2) **Eight end states, four kits.** The ending scene and the decision (read from the story flags `warned_harbor` and `trusted_fisherman`, neither meaning `none`) pick the kit: `ending_rescue` with `warned` is the True Keeper, `ending_trapped` with `warned` the Witness, with `trusted` the Informant, with `none` the Stranger. Reading the logbook (flag `read_log`) does not change the kit: it sets `readLog`, which gives the log card on the case board. The kits, the flag names and the start places are data in `backend/content/entry_kits.json`. Both decision flags set at once cannot happen in the story; if it ever did, the referee raises an error (a 500) and never picks a kit. (3) **The first ending counts** (pending Nils, N6). The table `entry_profiles` has one row per player, written once and never changed. A second playthrough returns the stored profile (the stored ending, decision, kit, start place and coins), pays nothing, and says `alreadyGranted: true`. (4) **The coins move once, inside the database.** `grant_entry_kit()` locks the player, stores the profile and calls `apply_wallet_transaction()` with the reason `kit_grant` and the fixed ref `kit`, in one transaction. Python checks the amount with the wallet rules first but never moves the coins. A player who was paid the kit by hand earlier (the manual test plan does that) gets a profile and no second payment. (5) **The kits** (pending S0, N5): True Keeper, Witness and Informant 1000 coins each, Stranger 1600; the start place is `lighthouse_isle` for the True Keeper and `saltreach_harbor` for the others; each kit has a clue card (C6, C2, C4, C5) and a small item. (6) **The story file is identified, not required.** The SHA-256 of `story.json` is stored with each profile, for audits. The request carries no story version, because Story v2 only adds actions and changes no rule, so an old log replays to the same end state. A log that only a newer story allows is refused as `move_refused`, and the message tells the player to reload. This replaces the note in the content README that suggested a `409` for a different story.

**Why:** The browser can be changed by anybody, and a kit pays coins, so the ending has to be re-played where the player cannot touch it. The engine is the same code that wrote the story's rules, so no second set of rules can drift. Putting the profile and the payment into one database function means a crash, a double click or two requests at the same moment can never leave a profile without coins or pay twice, and the ledger's unique index is the last guard. Storing the first profile makes the route safe to repeat without an `actionUid`.

**Alternatives and trade-offs:** Trusting the ending in the request: rejected, a player could pick the best kit. Requiring the story hash and refusing a different story with `409` (the note that backend/content/README.md used to carry): rejected, because an old page would be sent into an error for no reason when the rules are the same. Letting a later playthrough replace the kit: rejected as the default, because the coins differ (1000 and 1600), so a second payout rule would be needed and players could farm kits. A mistaken ending can only be undone by hand: delete the row in the SQL editor (no role has a delete right on the table), and the next submission stores a new profile, but pays nothing, because the ledger already has the kit row. Paying from Python after storing the profile: rejected, two steps can break in between. Trade-offs: the route reads three small files per request (the story, the kits and the story's hash); `GET /api/me` now needs the table `entry_profiles`, so the migration must be applied before the server that reads it is deployed. That means before the branch is merged into `main` (a push to `main` deploys to production at once, and `GET /api/me` is live today) and before a preview of the branch is tested (previews share the one Supabase project). If the merge has to come first, the read of `entry_profiles` in `routes/me.py` is held back (`kit` and `place` stay `null`) and merged after the apply; a server error between the replay and the database call leaves nothing stored, which is why a `503` is safe to repeat.

**Agreed by, PR and impact:** Proposed by Claude for Nils, 5 Nov 2026, in the A3 pull request. D019 was the next free number when A3 was written; the account entry it followed became D022 at merge, because the story round took D018 (no number is reserved for A3 in the roadmap). Pending Nils: N5 (the coins and texts of the kits, with the S0 approval) and N6 (the first ending counts). Affects A6 (a seat carries the entry kit, so the crew routes read `entry_profiles`), S2 (the browser sends the move log), S3 (the start place, the cheap card and the log card), S4 (the kits that NPC partners fill in), and `GET /api/me`.

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

## Next entry

- **ID / date / title:**
- **Status:** proposed / accepted / superseded by Dxxx
- **Decision and reason:**
- **Alternatives and trade-offs:**
- **Agreed by / issue or PR / impact:**
