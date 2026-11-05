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

**Alternatives and trade-offs:** A Vite app at the root plus `api/index.py`: Vercel documents file-based Python functions for existing projects and points new apps to a FastAPI preset or to Services. Two separate Vercel projects: the fallback if Services, still a Beta, lets us down. Paris (`cdg1` with Supabase `eu-west-3`) is a little closer to Lisbon; Ireland was chosen when the project was created. Trade-offs: whether cron works together with Services is undocumented, so the daily keep-alive call waits for the first deploy; preview and production share the one Supabase project; a free Supabase project pauses after 7 days of low activity.

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

## Next entry

- **ID / date / title:**
- **Status:** proposed / accepted / superseded by Dxxx
- **Decision and reason:**
- **Alternatives and trade-offs:**
- **Agreed by / issue or PR / impact:**
