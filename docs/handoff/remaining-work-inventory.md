# Remaining work to "feature complete at minimum versions" (Sun 8 Nov 2026, Lisbon)

> Historical inventory from earlier on 6 Nov. Current release state and remaining blockers are in [STATUS](../STATUS.md) and [the live-extras proof](live-extras-release.md).

Read-only inventory, Fri 6 Nov 2026, 15:25 Lisbon (16:25 CET). I changed no file, ref or worktree, started nothing and used no network. Hours below are agent wall-clock per workflow, including its gates and the independent review. They come from Roadmap v0.3 and from today's measured pace, so they are estimates and not usage-limit forecasts. No case secret appears here: case routes are given by method, path, inputs and output fields only.

## 1. Answer first

1. **What is left is integration, the case server and the real browser adapter, not screens.** G1 to G8 are built, S1, S2, L1 and the foundation are live, and ten server and browser branches are built and Opus-reviewed. Four things are unbuilt: the case backend (S3, L3, Relighting switch, S4; four migrations), the real adapter U1 (online half and case half), K1 (contracts and decision entries) and the automated end-to-end proofs that replace the human playtests.
2. **Size.** Claude about 29 to 46 h (merges and database 7 to 11, security 2.5 to 4, K1 1.5 to 2.5, reviewing Codex 1 to 2, case backend 15 to 24, proofs 2 to 3). Codex about 10 to 19 h (U1a 4 to 8, U1b 3 to 5, the rest 3 to 6). Nils about 1 to 1.5 h of his own steps. About 56 h remain until Sun 23:59 Lisbon. With one Claude workflow at a time, Claude's chain is the critical path, so Sunday holds only if roughly 30 to 45 h of Claude workflows fit into the weekly limit without rework. Otherwise use the cut order in 5.4, or let Codex take named backend tasks (this needs Nils to lift "Codex never edits backend/ or supabase/" for those tasks).
3. **Nothing online reaches a player until U1a lands.** `frontend/src/adapter/select.js` returns the "unavailable" adapter in production. U1a needs group 1 and G8 on `main`. U1b needs Claude's case route contract and recorded fixtures. So push group 1 and G8 first, then start Codex.
4. **Production still lets anyone read the culprit by elimination** (the case stand-in's deduction table is in the public bundle; Medium). The fix exists only on G8 (b8a56df). Merge G8, never G7 alone: G7 adds a second way in (`?case=local&demo=1`) with no gate. G8 already contains `origin/main` 8ff24cc and overlaps `integrate/fri6` only in docs/STATUS.md and backend/server/tests/test_me.py, so it can go to `main` before group 1.
5. **Security headers are in no `vercel.json`** (checked on `integrate/fri6` and on G8). G8 only made the bundle ready for a strict CSP. Put the headers in before U1's sign-in puts a refresh token into the page.
6. **Three gaps between today's brief and the sources** (details in section 2): G8 is at 34c679a (not aa21d14) and is finished; the case spec's migration stamps 090000 and 100000 and decision number D022 are already taken; the case spec never hands the Relighting stage to the two branches that wait for it.
7. **Human steps.** Of the 22 queue items in v0.3: 3 done, 4 dropped with no replacement (invite, kickoff, contracts review, M1 check), 5 review slots dropped (their checks become automated proofs plus Nils' end review), 3 moved to the end, 4 turned into automated checks, 3 stay Nils' own steps (Realtime switch, Finnhub key, teacher question). Section 7 has every row, section 8 Nils' own steps.

## 2. Corrections to the brief, and findings the sources contain

**F1. G8 is at 34c679a and is complete.** `origin/feat/g8-islet-harbor-demo` has four commits after aa21d14 (Fri 16:09 to 16:11): merged-game checks, accessibility fixes, `frontend/HOW-IT-WORKS.md`, the verification record. STATUS line "G8 checkpoint 3" and `frontend/GRAPHICS.md` "G8 verification": 345 tests in 58 files, 31 commands pass (91 golden-path checks, 210 chaos checks, 22 accessibility contexts at 1280, 375 and 320 px, strict-CSP check on five pages), cold title 21,052 bytes. All nine G8 streams exist. The Codex worktree `~/Developer/The-Great-Plot-Twist-graphics` also holds 52 uncommitted modified files (the weather credit leaves the HUD, bulletin and shell tweaks) and an untracked "Feedback-Weather-HUD" capture. That is post-G8 feedback in progress and is not in the ref. Merge the ref or wait for Codex's commit.

**F2. Merge G8, not G7.** Counts of lines containing `clears` in `frontend/src/adapter/fake/data.js`: `origin/main` 4, none gated by `import.meta.env.DEV`; G7 tip d81d036 none gated, and its `adapter/select.js` allows the local fake in production with `demo=1`; G8 3 gated (the fourth is the empty list). The integration plan `docs/handoff/analyse_frontend-plan.json` was written for G7 and calls the leak "needs a decision". The decision is G8. Its other effects: `manifest: !process.env.VERCEL` (no public `/.vite/manifest.json`), `case-lab.html` only with `CASE_LAB=1`, the guard now rejects elimination data and fingerprints all twelve reveal, closing and last-beat lines, and the S2 ending-card fix (`story/intro-view.js` plus `tests/g8-ending-view.test.js`) is done. After the push, rerun the audit's bundle scan on the live site.

**F3. Migration stamps clash.** The case spec reserves 20261106090000 `relighting` and 20261106100000 `npc_partners` (`20261106_Case-Backend_Spec.md` lines 516 to 529). Those stamps now belong to `exchange_leverage` (L4 v2), `prediction_desk` (L5) and 110000 `lantern_duels` (A7). Stamps 060000 and 080000 are free. A version key must be unique in `supabase_migrations.schema_migrations`. Recommended: renumber all four case files to 120000 to 150000 so file order equals apply order. The spec's test "case files carry the reserved timestamps of 3.11" (line 1304), check W9 and the Phase 1 header text must follow.

**F4. Decision numbers.** The spec proposes D022 for "Case backend contracts" (line 2807), but `integrate/fri6` already has D022 (A2 account data, `docs/DECISIONS.md` line 294). Plan from `analyse_backend-docs-plan.json`: A4 becomes D023, open-world D024, L5 D025, A7 D026, L2 keeps D021 (it does not clash), the case entry takes D027. D008, D009, D010 and D014 have no entry at all. D007 still says the story is "byte for byte the original", which Story v2 made false. D015 needs the new rule (no review until done, Claude gates, migrations after Opus review plus dry run).

**F5. Missing hand-off in the case spec.** Two branches wait for the world stage. Open-world takes `WorldStageReader` through `create_app(world_stage=...)` (default `AlwaysDark`; needs `relit_at`). L4 v2 takes `relit_check` in `MarketService` (default `never_relit`; drives the 1 % fee and the Greyfathom delisting). The spec contains neither name. Add both to Phase 3 (about +0.5 h), or the bulletin never shows the relit lines and the Exchange never gets the 1 % fee.

**F6. G7 contract versus the real routes** (from `analyse_frontend-plan.json`, `contract_changes`; U1a must translate): `POST /api/crews` answers `{crew:{id,code,status,mode,seats}}` while the G7 fixture is flat; save conflict is `stale_save` on the server and `save_conflict` in G7; G7's fixtures call the reserved `GET /api/board` while the spec builds `GET /api/case` (decision C3, now Claude's call because the Mon 9 team review is gone); A4 emotes (wave, cheer, nod, shrug, follow_me, help) and facings (up/down) and coordinates (x,z) differ from G7's (wave, cheer, point, lantern, shrug; front/back; x,y). Cheapest: change A4's constants to G7's emote list (the art exists) and map facings and coordinates in the adapter.

**F7. The database plan exists and is validated on scratch only.** `analyse_migration-chain.json`: apply 010000, 020000, 030000, 040000, 050000, 070000, 090000, 100000, 110000 in one sitting (010000 first, because 090000 reuses `market_fee` and then drops v1's tables), pre-flight queries, a rolled-back dry run, re-record versions (the MCP stamps clock time), ten post-apply checks. Two position-pinned wallet-reason tests break at the L4 v2 and A7 merges (`backend/server/tests/test_wallet_matches_migration.py` lines 324 to 332, `test_duels_migration.py` line 154). The group 1 secret-scan gate is red by exit status only because of the bare text `sb_secret_` in `supabase/README.md` line 1046 (use the key-shaped recipe at `docs/ENGINEERING.md` line 414). A scratch path with a session id sits in `specs/M1-backbone.md` line 1294 and in commit 4d5aa5b: scrub before pushing. Not verified: real Supabase ownership and privileges (`realtime.messages`, `auth.users`) and how the MCP stamps versions.

**F8. Docs are stale.** `integrate/fri6:docs/STATUS.md` says in its own header that "In progress, Blocked and the review queue are not refreshed". It still lists S0 and G5 as in progress and D017's seven old questions.

**F9. Codex pace.** Measured from file and commit times: G5 about 1.6 h, G6 about 1.2 h, G7 about 2 h, G8 about 6 h. Roadmap v0.3 budgeted G7 at 1.5 to 2.5 Codex days. I use the measured pace.

**F10. Small coupling.** If any reveal, closing or last-beat line in `backend/content/secret/case.json` changes (including the two corrected story sentences in spec 5.11), run `npm run art:fingerprints` in `frontend/`, or the Vercel build uses stale fingerprints.

## 3. Where things stand

| Place | Contents | Gate results |
|---|---|---|
| `main` = 8ff24cc (live) | G1 to G6, S1 with Story v2, S2, L1, A1 foundation (migration 000000 applied), keep-alive, API in Dublin, L4 v1 backend (flag off, `/api/market` answers 502) | 1,509 backend, 194 frontend |
| `integrate/fri6` = dc59708 (local, not pushed; worktree `~/Developer/The-Great-Plot-Twist-int`) | Group 1: S0 story round and case data, A2/A3, A6. 20 routes. Migrations 020000, 030000, 040000 not applied | 3,099 backend, ruff clean, 288 frontend, build and spoiler guard pass. `origin/main` 8ff24cc not merged yet (merge-tree: no conflict) |
| `origin/feat/g8-islet-harbor-demo` = 34c679a | G7 plus G8 checkpoints 0 to 3 | 345 tests, 31 commands (see F1) |
| A4 c373f60, L2 8c2ed24, open-world 57a5a02, L4 v2 + X1 + linter 4d5aa5b, L5 e90a620, A7 8af962b | One commit each on an older `main`, Opus-reviewed. Migrations unapplied: 050000, 070000, none, 090000, 100000, 110000 | Each passes alone. Trial merge of all ten in a scratch clone: 9,690 backend tests, ruff clean, 33 routes; frontend 88 files, 1,538 tests, build passes, browser checks pass except two known flaky ones (`test:credits`, `test:chaos`) |

Merge conflicts are mechanical: group 2 and 3 conflict only in docs, `app.py`, `settings.py`, `server/__init__.py`, `routes/__init__.py`, wallet tests and `frontend/src/game.js` (15 hunks). The plan lists four semantic breaks and four silent duplicates that git does not show (L4 v2 removes `market/rules.py`, which open-world's `daily/exchange_summary.py` imports; A7 and L4 v2 pin wallet-reason positions; a second `HOST_PLAYER_IDS` block and duplicate readers from L5; islet-boundary test needs `caseUi.active||stopPlots.active` in `hasOverlay`; A7 needs `container.querySelector('.duel-modal')?.remove()` in `dispose()`).

## 4. What "feature complete at minimum versions" means here

1. `main` holds groups 1 to 3, the four case phases and U1. The migration chain 010000 to 110000 and the four case migrations are applied and verified before the code that reads them. Flags `live_presence`, `market`, `case` on; `predictions`, `arena`, `sports` off; `RELIGHT_OPEN` unset.
2. One signed-in player can run Act 1, get the kit and coins, make a crew code, muster (partners fill empty seats), search, pin, pair, form the four deductions, build the signal station, call nightfall, lock three lights, accuse, see the reveal and get once-only rewards. A solo player with three partners does the same (proved with the host clock route).
3. Two signed-in captains see each other in the harbor.
4. The Exchange opens and closes 10x positions on the seven island companies at real prices (stocks stay hidden until the key and Finnhub's OK).
5. Automated proofs are green: backend and frontend suites, ruff, build with the strengthened spoiler guard, `case_sql` C, N, W and P checks on scratch Postgres, the 69-mix solvability proof, registry/case parity and leak tests, G7 conformance on the real adapter, G8's 31 commands, strict-CSP check, bundle scan of the live site.
6. The Relighting is proven on scratch Postgres (W1 to W9) and in tests, never on the live project: `RELIGHT_OPEN` stays off until Nils opens the game.

## 5. Inventory of remaining work

"Est. h" is Claude or Codex agent time as stated in the Owner column. "FC?" says whether the item is needed to call the game feature complete this weekend (Y, N, Part). Roadmap v0.3 agent hours were S3 9 to 14 (including the adapter), L3 7 to 11, S4 4 to 6, U1 3 to 5; I moved the adapter hours to Codex and used measured pace.

### 5.1 Core

| ID | Item | State now | "Minimum" = done when | Owner | Depends on | Est. h | FC? |
|---|---|---|---|---|---|---|---|
| C1 | Group 1 to `main` (S0, A2/A3, A6) | On `integrate/fri6`, not pushed, three migrations unapplied; another workflow is on it now | `main` carries them; `GET /api/me` answers 200 for a signed-in test account | Claude | C2 before the push (`/api/me` reads `entry_profiles`, 502 otherwise); merge 8ff24cc; secret-scan pattern; scrub `specs/M1-backbone.md:1294` | 1 to 1.5 | Y |
| C2 | Apply migration chain 010000 to 110000 in one sitting | Plan and scratch runs done (Postgres 16.2 only) | Pre-flight passes; rolled-back dry run clean; nine files applied with the foundation's role; versions re-recorded; post-apply checks 1 to 10 pass (history 10 rows, 18 tables plus 1 view, 17 wallet reasons, 5 realtime policies, advisor, `notify pgrst, 'reload schema'`) | Claude | 010000 first; fix the two pinned wallet tests; runner owns the 7 public tables, may DELETE `auth.users`, owns or belongs to the owner of `realtime.messages`; MCP not read-only; short lock window | 1.5 to 2.5 | Y for 010000 to 040000 now; 050000, 070000, 090000 for A4, L2, Exchange; 100000 and 110000 ride along |
| C3 | G7 + G8 (world, presence, account, rewards, log, Gull's Rest, islet art, bulletin, hook, presenter kit, a11y, how-it-works, spoiler-proof bundle, ending-card fix) | Built and pushed (34c679a), not merged | On `main`; build with strengthened guard green; live bundle scan shows no elimination data | Claude | Resolve `game.js` hunks (plan has G7 resolutions, recheck for G8); Codex's uncommitted edits sit outside the ref | 1 to 1.5 | Y |
| C4 | A4 live presence | Built (c373f60); 050000 unapplied | Two players in one place see each other's position and captain name; flag `live_presence` on; no Realtime connection when the flag is off | Claude (merge, apply, live checks L1 to L7); Codex (wiring inside C9) | C2; Nils switches Realtime "Allow public access" off; `npm ci --offline` right after the merge (supabase-js 2.118.0); emote and facing mapping (F6) | 0.5 to 1 | Y |
| C5 | L2 home islet | Built (8c2ed24); 070000 unapplied | Signal station plus workshop, 20-timber starter pack, charged once; `GET /api/islet`, `POST /api/islet/build`; `islet_changed` event (G8 draws it) | Claude | C2; C9 `getToken`; case Phase 2 reads it through the `IsletStations` port | 0.5 to 1 | Y (third light) |
| C6 | L4 v2 Exchange + X1 market hall + content linter | Built (4d5aa5b); 090000 unapplied | `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/open`, `POST /api/market/close`: seven island companies at real prices, 10x positions both ways, fee 2 % (1 % after the Relighting); flag `market` on; stocks hidden until `STOCK_API_KEY`; linter 0 errors | Claude | C2; the four breaks and four duplicates from the plan; open-world port patch; Binance answers from the Dublin function; stage reader (C14) | 1 to 1.5 | Y (core by Nils); stocks N |
| C7 | Security batch (section 6) | Open | Headers in `vercel.json` (preview-tested), token-shape check, no-store default, settings URL check | Claude | C3 (CSP-ready bundle); Supabase origins for `connect-src` | 2.5 to 4 | Part: headers Y before sign-in, rest N |
| C8 | K1 contracts and decision entries | Not started | INTERFACES v1 as built (case routes from spec section 8, no secrets), flags, kit coins, wallet reasons; entries D007 amendment, D008, D009, D010, D014, D015 amendment, D017 (rewritten on the L4 v2 branch), D021, D023 to D026, D027; STATUS, ROADMAP v0.4, README status refreshed | Claude | C1 to C6 merged | 1.5 to 2.5 | Part: the route-contract part gates Codex |
| C9 | U1a real adapter, online half, with library sign-in | Not started; screens exist (G6, G7); `online/api.js` and `session.js` exist (A2, token in memory only) | G7 conformance suite passes on the real adapter with recorded fixtures; GitHub sign-in with supabase-js 2.118.0 (PKCE; session survives reload and renews, a case takes 2 h); account, cloud save, delete me, name re-roll, arrival card (A3), crew create, join and muster with partners (A6), presence (A4), `getToken` to the islet and market panels; auth parameters stripped from the URL; `/api/auth/exchange` use and `auth-check.html` removed; title chunk stays under the load check (about 370 bytes of headroom) | Codex | C1 and C3 on `main`; A4 on `main` for presence; contract (C8) | 4 to 8 (Claude review 0.5 to 1) | Y |
| C10 | U1b real case adapter (`frontend/src/online/case-adapter/`) | Not started | Spec section 8: `GET /api/case` and `GET /api/world` to the G6/G7 view; every intent to its route; refusals mapped into `caseReasons`; effect ids; polling plus crew-room nudges; passes conformance on fixtures, then on the real routes; clears only for formed deductions | Codex | C12 contract and `case_fixtures`, then C13 to C15 routes | 3 to 5 (Claude review 0.5 to 1) | Y |
| C11 | First building and muster hook | Not started | Muster reminder and the finale's build button call `POST /api/islet/build`; the station serves as the third light | Codex | C5, C9 | 0.5 to 1 | Y |
| C12 | S3 Phase 1: case rules (migration 060000) | Spec done (private), not started | Loader and load-time checks; clock and windows; 12 routes (kit, open, timed); gates; journal; accusation with 60 s wrong-answer wait and snapshot check; solve share; reveal with four closing lines, log line and `world`; `GET /api/case`, `POST /api/case/search {routeId, paidConfirmed, expectedPrice, actionUid}`, `POST /api/case/accuse {suspect, actionUid}`, `POST /api/host/case/clock`; flag `case`; `RELIGHT_OPEN` fail-closed; checks C1 to C14; `case_fixtures` for Codex | Claude | C1 (A6 seats); A2 `HostDep`; A4 nudges optional | 4 to 6 (+0.5 to 1 review and apply) | Y |
| C13 | L3 Phase 2: board and night (migration 080000) | Not started | `POST /api/board/pin {cardId, actionUid}`, `POST /api/board/pair {cards, actionUid}`, `POST /api/finale/nightfall {actionUid}`, `POST /api/finale/post {light, actionUid}`, `POST /api/finale/signal {light, bearing, actionUid}`; pins with seat credit; pairing by two seats; rewards in SQL; 20-minute night, 3-minute dawn; three posts (third through the L2 port); 5 degree bearings; 90 s overlapping locks; schooner and glow; `finale` and `credits` view parts | Claude | C12; C5 | 4 to 6 (+0.5 to 1) | Y |
| C14 | Phase 3: Relighting switch (migration clash, F3) | Not started | `world_state` changes once and only while `RELIGHT_OPEN`; `world_solves`; Wall of Lights; extra-light counter; `GET /api/world` behind flag `case`; world outcome to every solver; plus `WorldStageReader` and `relit_check` (F5) | Claude | C12, C13; new stamp | 2 to 3 (+0.5) | Y |
| C15 | S4 Phase 4: NPC partners (migration clash, F3) | Not started (kit rule and muster are in A6) | `POST /api/crews/me/orders {seat, order, target, allowPaid, actionUid}`: fetch-and-pin (15 case minutes), `man_light`, four refusals (`busy`, `wrong_kit`, `locked_window`, `not_ready`), line bank, `allowPaid` off, pins credited to the orderer, 27 marked tests | Claude | C12, C13, C14 | 3 to 5 (+0.5 to 1) | Y |
| C16 | Proofs and automated end-to-end | Not started | 69-mix solvability proof; leak and registry tests; `case_sql` on scratch Postgres; automated solo run with three partners on the real routes via the host clock; fresh-clone and signed-out checks; bundle scan of the live site; Codex: golden and chaos checks on the real adapter, G8's 31 commands on merged `main` | Claude 2 to 3; Codex 1 to 2 | C9 to C15; Nils' `HOST_PLAYER_IDS` | 3 to 5 total | Y |
| C17 | Live smoke and flag switch-on | Not started | Two GitHub accounts in two windows see each other; Act 1 to kit to crew to muster; `FEATURE_FLAGS` set in Vercel | Nils (Claude prepares the list) | C4, C9 | 0.5 to 1 (Nils) | Y |

Notes for the core table:
- **C9 contents** worth stating in the prompt: rewards come from the player's own ledger under RLS with supabase-js or a later route; `deleteMyData({confirm})` maps to `DELETE /api/me {confirm:true}`; `stale_save` maps to `save_conflict`; a bulletin mapping can wait because `status: 'off'` is the default; supabase-js must stay out of the title chunk (lazy import).
- **C12 to C15 order.** Phase 2 needs Phase 1's pure rules and migration file final. Phase 3 and 4 need Phase 2's file. The spec's own plan runs phases 2 and 3 in parallel; with one Claude workflow at a time they are sequential, which is what the 15 to 24 h assumes.
- **Hand Codex only** spec sections 3.4, 3.8 and 8 (answer shape, view, intent and reason mapping), not the rules sections.

### 5.2 Should, later and follow-ups

| ID | Item | State | Note | Owner | Est. h | FC? |
|---|---|---|---|---|---|---|
| S1 | W1, D1, H1 open-world server (weather states, Lisbon day, `GET /api/bulletin`, Chapter 2 hook data) | Built (57a5a02); G8 draws the screens | Rides with C6 (L4 v2 breaks open-world's imports without the port patch). Flags off. The hook needs a Relighting, so it stays silent while the lock is on | Claude | 0.5 to 0.75 | N |
| S2 | L5 prediction desk | Built (e90a620), 100000 | Merge; migration in the sitting; flag `predictions` off until the teacher question | Claude | 0.5 | N |
| S3 | A7 Lantern Duels | Built (8af962b), 110000 | Merge; flag `arena` off | Claude | 0.5 | N |
| S4 | T1 Exchange beat in the demo tour | Not started; G8 left it out | After X1 is on `main` with a production-safe rehearsal mode | Codex | 1 to 2 | N |
| S5 | R1 Relighting extras (festival timer, lantern claims, duel ring; art for the 12 extra lamps) | Not started | After 23 Nov | Claude, Codex | 1 to 1.5 | N |
| S6 | E1 economy check on D017 rules | Not started | After 23 Nov | Claude | 1 to 2.5 | N |
| S7 | L6 sports, Y1 to Y3, C2 Chapter 2 | Not started | After 23 Nov. Y4 dropped (decision 16) | Claude | not counted | N |
| S8 | Small follow-ups from the integration reviews | Open | `delete_player()` does not bump `crews.version` (migration after 040000); D020 and `crews/seats.py` still say "PENDING Nils" for decisions D018 settled; kit data lives twice (secret case file and `entry_kits.json`): add a consistency test; Exchange game day starts 08:00 and the bulletin day 00:00; bulletin "paused companies" has no v2 meaning; SQL guard for the stake caps (500, 2,000, 20 open) in a new migration | Claude | 1.5 to 2.5 | N |
| S9 | M3 ship: README, lane pages for S, A, L (G page done: `frontend/HOW-IT-WORKS.md`), ASSETS check, D-entry completeness, tag v1.0 | Not started | After feature complete. Fresh-clone and signed-out checks are in C16 | Claude and Codex draft; Nils submits | 2 to 4 | N |

### 5.3 Totals

| Who | Hours | Breakdown |
|---|---|---|
| Claude | 29 to 46 | C1 to C6 and S1 to S3 merges: 7 to 11; C7: 2.5 to 4; C8: 1.5 to 2.5; review of Codex output (C9, C10): 1 to 2; C12 to C15: 15 to 24; C16 (Claude part): 2 to 3 |
| Codex | 10 to 19 | C9: 4 to 8; C10: 3 to 5; C11: 0.5 to 1; C16 (Codex part): 1 to 2; post-G8 feedback in flight: 0.5 to 1; regression on merged `main`: 1 to 2. Optional T1 adds 1 to 2 |
| Nils | about 1 to 1.5 | Section 8, items A to E |

Laptop limit: at most one Claude workflow and one Codex task at a time. Extra Codex work (lane pages, README draft, T1) can go to Codex's cloud on the GitHub repo.

### 5.4 Suggested order, and the cut order if Sunday slips

Claude, in order:
1. C2 then C1 (in progress). Then C3 as its own early push (closes the leak, unblocks Codex).
2. C4 and C5 (A4 and L2: Codex needs them for presence and panels, Phase 2 needs L2's port).
3. C12 Phase 1. Publish the route contract and `case_fixtures` after its pure slices so Codex starts C10.
4. C7 headers on a Vercel preview, before U1a merges with sign-in.
5. C6 with S1 to S3 (rest of the merge train).
6. C13, C14, C15.
7. C16 and C8.

Codex: C9 starts when C1 and C3 are on `main`; C10 after C12's contract; C11 after C5 and C9; regression after C6.

Cut order (case spec section 10, lines 2783 to 2790, and the cut ladder in v0.3 lines 563 to 585). Only Nils may cut the Exchange or A4:
1. Everything in 5.2.
2. Cinematics beyond the reveal lines (Nils at S0: cut first).
3. The live `credits` view part; partner job lines beyond `order_accepted` and `pinned_card`; Phase 4 tests beyond the 27 marked; the log lead.
4. S3 without timed routes, only if the 69-mix proof still passes (about 0.5 day).
5. X1 down to the read-only board (ladder 9), L2 down to the signal station alone (ladder 10).

Never cut: sign-in, kits and crews, the case rules, the three-light finale, the Relighting switch, once-only rewards. A two-light finale needs Nils' OK.

## 6. Security audit: what G8 checkpoint 0 (b8a56df) fixed, what stays open

Source: `<project notes>/20261106_Security-Audit_Findings.md` (server lines 28 to 109, frontend lines 111 to 169).

| Finding | Status | Still to do (owner) |
|---|---|---|
| Frontend 1, Medium: case stand-in's elimination table in the production bundle | Fixed on G8: inline DEV gate, stronger guard, `case-lab` only with `CASE_LAB=1`, ungated build proven to fail. Live leak remains until G8 reaches `main` | Merge G8 (Claude, C3); rescan the live bundle |
| Frontend 3, Low: unformed deductions expose `clears` in the view | Fixed in the fake; rule written in `frontend/GRAPHICS.md` | Server view builder and real adapter must send `clears` only for formed deductions (Claude C12, Codex C10) |
| Frontend 4, Low: public `/.vite/manifest.json` | Fixed (`manifest: !process.env.VERCEL`) | None after the merge |
| Frontend 2 and server 1, Medium/Low: no security headers, framing, static `*` CORS | Prepared, not applied: strict self-only CSP passes five pages, style attributes moved to CSSOM, `auth-check.css` added, Vite preview sends the set. `vercel.json` has no `headers` on G8 or `integrate/fri6` | Claude (C7): add headers Report-Only first, with Supabase https and wss origins in `connect-src`; test on a Vercel preview first (a `crons` entry once broke Services deploys); then enforce. Gate before U1 sign-in |
| Server 2a, Low: unknown Bearer costs a Supabase round trip | Open | Claude: reject tokens over 4,096 chars or without three parts before any network call, with a test |
| Server 2b, Low: `/api/auth/exchange` unthrottled | Open | Remove the route, `auth-check.html` and their tests when U1 sign-in lands (Claude and Codex), or answer 404 in production now |
| Server 2c, Low: `/api/market` 502 until its migration | Resolves with 090000 | None |
| Server 3, Low: private answers lack `no-store` | L4 v2's private market routes set it; no app-wide default | Claude: middleware default `Cache-Control: no-store` and `nosniff`; case routes need it |
| Server 4, Low: `market_trade()` trusts caller limits | Partly addressed: v2 SQL pins leverage 10, fee rates 100 or 200 and rechecks fee and value. Stake min and max, daily cap and open-position cap are still parameters from Python | Optional new migration guard (S8) |
| Server 5, Low: Preview holds production secrets | Open | Nils decides (5 min, Vercel): unset `SUPABASE_SECRET_KEY` and `CRON_SECRET` in Preview, or accept |
| Server 6, Low: `profiles` readable by every signed-in player | Open | Tiny migration: select only `id, display_name` (Claude, optional) |
| Frontend 5 and server 7: no dependency monitoring, `pip-audit` not run | Open | Nils: enable Dependabot alerts; Claude: run `pip-audit` once (needs network); a `dependabot.yml` only after asking |
| Server 8: any `SUPABASE_URL` accepted | Open | Claude: in preview and production require `https://` and a `.supabase.co` host, with a test |
| Frontend 6, 7, 8, 9 and server 9 (Info): `127.0.0.1` redirect, `*` CORS wording, `http` accepted on the check page, 60-day workflow rule | Open | Strip auth parameters in U1; wording and note edits in docs (Claude); the check page disappears with 2b |

## 7. Roadmap v0.3 human steps and today's decisions

Source for the decisions: `<project notes>/20261105_Roadmap-Inputs.md` lines 94 to 101 ("no kickoff, no check-ins, no waiting", "no review until it's done", weekend target, working mode). Tags: **DONE**, **DROP**, **END** (Nils' end review, Mon 9 onward, before M3 starts Thu 19), **AUTO** (an automated check), **STAYS** (still Nils' own step). Roadmap lines refer to `20261106_Roadmap_v0.3.md`.

### 7.1 Review and decision queue (lines 64 to 160)

| # | Item (day, who, time) | Tag | What replaces it or when |
|---|---|---|---|
| 1 | Spoilers in the public repo (Fri, Nils, 10 min) | DONE | "Yes, label it" (Inputs line 92); D018 |
| 2 | Two dashboard settings (10 min) | DONE and STAYS | Dublin is now pinned in `vercel.json` (8ff24cc, `regions` plus a test). Realtime "Allow public access" off is still Nils' step (2 min); it gates the A4 flag |
| 3 | Review rule D015 (10 min) | DONE | Decided: no review until done, Claude gates every merge. Claude writes the D015 amendment (C8) |
| 4 | Sign off S0 (30 min) | DONE in effect | Weekend target uses "the minimum versions of the S0 sign-off". Loose ends listed in section 8 (R1 to R3, D016, 300-coin reserve); Claude proceeds on the recommended defaults |
| 5 | Kickoff invite and joining note (20 min) | DROP | "No kickoff message" |
| 6 | Review A2 and A3 (Sat, 70 min) | DROP, then END | Opus review done, 3,099 tests, scratch and live pre-flight, post-apply checks. Still needed: Nils' Supabase id into `HOST_PLAYER_IDS` (5 min) |
| 7 | Story v2 wording (30 min) | END | Ad hoc on the live site; no blocker |
| 8 | "Delete my data" rule, team (15 min) | DROP as a meeting, then END | Ships as drafted (D022). ENGINEERING's "team agrees on personal data" and the Auth audit-log point (N4) wait for the end |
| 9 | Lead the kickoff (1 h) | DROP | Claude records D008 and D014 as Nils' decisions; lane owners stay unassigned |
| 10 | Play G5, G6, Story v2 on laptop and phone (Sun, 1.5 h) | END, partly AUTO | G8: accessibility check (22 screens at 1280, 375, 320 px), production tour, golden and chaos checks. Physical phone, gamepad, speakers stay manual |
| 11 | Review A6 (45 min) | DROP, then END | Automated tests and scratch checks |
| 12 | Contracts review, team, Mon 9 (1 to 1.5 h) | DROP | Claude freezes INTERFACES v1 (C8) and records D009; teammates may object later |
| 13 | Exchange: key (10), reserve (5), review (45) | STAYS (key), DROP (reserve), END (review) | Finnhub key into Vercel only and the email to Finnhub (later, optional for the weekend); default "no 300-coin reserve"; stocks stay hidden, the seven island companies need no key |
| 14 | Backbone go/no-go D010 (30 min) | AUTO | Post-apply checks plus deploy checks 2 to 5 (passed). Claude writes D010 as "go", check 1 open |
| 15 | Two-device test (Thu 12, 1.25 h) | AUTO plus a short live check, earlier | Policy checks on scratch Postgres, A4 tests, conformance. Nils: two GitHub accounts in two windows, 20 to 30 min, once A4 and U1a are live. Sign-in cannot be automated; agents never log in |
| 16 | Presenter laptop and frame rate (Fri 13, 30 min) | END (stays human) | G8's `?perf=1` overlay with "Copy numbers" does the measuring; do it before the Fri 20 rehearsal |
| 17 | M1 check, cut rule, grow order (team, 1 h) | DROP | Feature complete is targeted by Sun; Claude records D008; growth to full size only on Nils' call |
| 18 | Reviews of S3, L3, S4, L2 (6 to 8 h) | DROP, then END | 69-mix proof, leak and registry tests, `case_sql` C, N, W, P, Opus review per phase, automated solo run (C16) |
| 19 | Review X1 and G7 (1.5 h) | DROP, then END | G8's 31 commands, Opus review, merged-tree gates |
| 20 | Timed playtest, crew of four (Tue 17, team, 2.5 h) | DROP, replaced by AUTO | Solo run with three partners on the real routes, fast-forwarded with the host clock; four-seat proof on scratch. Nils' own solo run at the end is optional |
| 21 | Freeze check (Wed 18, 1 h) | AUTO | Script gate: tests, ruff, build, secret scan, spoiler guard, end-to-end. Wed 18 stays a soft freeze unless Nils moves it |
| 22 | Teacher question on play-money predictions (10 min) | STAYS | Needed only before `predictions` or `sports` switch on; not needed for feature complete |

### 7.2 Kickoff agenda, joining and rhythm (lines 162 to 174, 537 to 561, 587 to 595)

| Item | Tag | Note |
|---|---|---|
| Lane owners, partner rules 11 and 12, daily reset, demo format, S4 builder | DROP | Already settled by Nils or by the build; Claude records them |
| D008 grow order | DROP | Moot once the minimums are built; recorded for the buffer |
| Who creates data-API accounts | STAYS | Only the Finnhub key remains (Nils); L6 accounts not needed |
| Default weather place (Carcavelos or the Faroe Islands) | STAYS | Three environment variables, no code; the Faroe Islands stay without an answer |
| Teammates pick a package by Sun 8 | DROP as a deadline | Buffer: Mon 9 to Mon 23 |
| First tiny PR (credits row) by Tue 10; merged PR beyond it by Mon 16 | DROP as deadlines | Buffer. The three rows in `frontend/src/shell/team.js` must stay untouched. The course rule that each member shows own code stays roadmap risk 1 and is not solved by anything built |
| Peer review of D001 to D017 (due Mon 16) | END | Teammates' own PRs keep D001 |
| Deploy check 1 (a teammate's push) | DROP as a gate | D010 notes it as open |
| Integration hour Mon, Wed, Fri 17:00; review pairs; two fixed review slots a day; daily question sheet | DROP | Claude asks only real decisions |

### 7.3 End-game items (M3, lines 452 to 461, 531 to 535)

| Item | Tag | Note |
|---|---|---|
| README review (Thu 19, 30 min) | END | Claude drafts (S9) |
| Explain-back drills Thu 19 and Sat 21 (1.5 h each) | END (kept) | Course requirement; G8 delivered twelve explain-back cards in `frontend/HOW-IT-WORKS.md` |
| Rehearse and record highlights Fri 20; final rehearsal Sun 22 (1 h each) | END (kept) | Presenter kit: `?demo=1`, `?demo=1&record=1`, `?perf=1` |
| Fresh-clone and signed-out checks (Mon 23) | AUTO | Run earlier in C16 and again on Mon 23 |
| Tag v1.0 | AUTO | Claude, with Nils' OK |
| Submit on Moodle by 18:00 with a named backup (30 min) | STAYS | Nils; naming the backup needs a message he sends |
| Open the Supabase dashboard the day before the demo (demo after submission: Tue 24 Nov or Fri 4 Dec) | STAYS | Nils |
| Lane pages, ASSETS check, D-entry completeness | AUTO / agents | S9 |

### 7.4 Human jobs named elsewhere

| Item | Tag | Note |
|---|---|---|
| Captain-name word lists, a human look (N9, `backend/content/README.md`) | END | Names appear on a projector |
| Final name check for every place and company | END | Before the demo; an agent can do a first pass |
| Paper playtest with stopwatch (TIMING section 9) | DROP | The timing simulation replaced it |
| VoiceOver, Safari, Firefox, phone, gamepad (G8 script in `frontend/GRAPHICS.md`, "Fifteen-minute VoiceOver rehearsal") | END | Manual only; the automated check cannot certify them |
| Weekly look at Organization > Usage > Realtime | STAYS | Nils, once A4 is on |

## 8. Nils' own steps and decisions

**Now or soon**
- A. Supabase: Realtime, Settings, "Allow public access" off (2 min). Unblocks A4's live checks and the `live_presence` flag.
- B. After group 1 is live: put his Supabase user id into `HOST_PLAYER_IDS` in Vercel (5 min). Needed for the host clock route and the automated solo run.
- C. Approve or set `FEATURE_FLAGS=live_presence,market,case` in Vercel Production when Claude reports the migrations verified; `RELIGHT_OPEN` stays unset.
- D. Live smoke test (20 to 30 min, two GitHub accounts, two windows) after U1a and A4 are live.
- E. Quick decisions: R1 to R3 of the approval sheet (`docs/story/README.md`, still "Not yet seen"); accept D016; kit coins and "first ending counts" (D019 N5 and N6; built defaults 1,000 and 1,600); no 300-coin reserve (default); default weather place (default Faroe Islands).

**One structural decision**
- F. When he switches Claude to orchestrator mode, either finish the case backend first, or allow Codex scoped edits in `backend/` and `supabase/` for named tasks (best candidates: Phase 3, Phase 4, `case_sql` tests) with Claude's review and live pre-flight. The standing rule says Codex never edits those folders, and Claude cannot hand over case-server work without this change.

**Later**
- Finnhub key into Vercel only and the email to Finnhub (15 min); teacher question; Dependabot alerts; Preview-secrets decision (5 min); Moodle submission and backup.

## 9. Suggested checkpoints for the G9 prompt

The G8 prompt forbids `frontend/src/online/`, `frontend/src/net/`, `frontend/src/adapter/select.js` and Claude's panels. G9 must own them. Keep forbidden: `backend/`, `supabase/`, `vercel.json`, `.github/`, the teammate credit rows, new npm packages (only `@supabase/supabase-js` 2.118.0 is approved).
- **C0:** real adapter skeleton, sign-in and session on fixtures, conformance suite green, `auth-check` removal staged. Push.
- **C1:** account, save, arrival, crew, muster and presence on the real routes (tested against a local backend), `getToken` for the panels. Push.
- **C2:** case adapter on `case_fixtures` once Claude publishes the contract; switch to the real routes as phases land. Push.
- **C3:** first building, merged-game regression (G8's 31 commands plus new real-adapter checks), signed-out production check, optional T1, HOW-IT-WORKS online section.
- Self-checks every checkpoint: conformance, golden path, chaos, spoiler guard, accessibility, budgets (cold title near 21,052 bytes), CSP check.

## 10. Sources read and what I could not verify

Read: `20261106_Roadmap_v0.3.md` (all), `20261105_Roadmap-Inputs.md` (all), `20261106_Security-Audit_Findings.md` (all), `20261106_Case-Backend_Spec.md` (sections 0 to 3.12, 4.1 to 4.2, 4.12, 5, 6, 8, 10 to 15 and its heading map), `20261106_Codex-Prompt_G8-Islet-Harbor-Day-Class-Demo.md`, `20261105_End-of-Day_Handover.md`, `20261106_Jump-In-Guide_and_Kickoff-Message.md` (sections 4 to 7, key dates), `20261105_Stock-API_Decision-Memo.md` (steps). From the main clone with `git show`, `ls-tree`, `grep`, `log`: `integrate/fri6` (docs/STATUS.md, ROADMAP.md, docs/INTERFACES.md, docs/DECISIONS.md, docs/story/README.md, vercel.json, migrations), every pending branch (commit messages, file lists, specs, migration headers), `origin/feat/g8-islet-harbor-demo` (commits, STATUS, GRAPHICS.md, select.js, vite.config.js, package.json). From `docs/handoff/`: `merge_group1.json`, `verify_group1.json`, `analyse_migration-chain.json`, `analyse_frontend-plan.json`, `analyse_backend-docs-plan.json` (the brief did not name them; they hold the merge and migration plans). Read-only status of the worktrees `-int` and `-graphics`.

Not verified: the live database (which migrations are applied now) and the live site, because I used no network; the Vercel and Supabase dashboard settings (region, Realtime access, flags); whether the other workflow has moved `integrate/fri6` since dc59708; real Supabase role ownership; the effect of Claude's usage limit on the hour estimates (the plan fits Sunday only if that budget holds); Codex's uncommitted worktree contents beyond the file list.