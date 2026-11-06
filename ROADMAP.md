# ROADMAP: The Great Plot Twist

> **What this file is:** the team's work plan from Thu 5 to Mon 23 Nov 2026. It says who builds what, in which order, and how we know it is done.
>
> **Who uses it:** all four teammates and every coding agent. The story is in [docs/STORY.md](docs/STORY.md). What is happening right now, and ready-to-paste agent briefs, are in [docs/STATUS.md](docs/STATUS.md).

**Current execution: 6 Nov 2026.** The game and API are live at
https://the-great-plot-twist.vercel.app/. Group 3, the complete minimum case backend, NPCs,
server followups and G12 are deployed. Reviewed festival, host and sports code is deployed after
its migration proofs; festival is enabled but waits for the first Relighting, while sports stays
off pending its provider key. The stabilization/submission wave is deployed and its final gates pass.
G9 is paused until Nils' laptop returns; normal browser multiplayer/the complete mystery still
await that adapter. The detailed historical package plan remains below.

## Execution update · 6 Nov 2026

Nils authorized Codex to coordinate all lanes, review and apply migrations, push integration branches
and main, and manage Vercel. No Claude handover is required during this period. The current target is
feature-complete minimum versions by Sunday 8 Nov, then stabilization and submission preparation for
23 Nov. These are targets; live completion is recorded in docs/STATUS.md.

1. Release group 3: Exchange v2, predictions and duels, after gates and the reviewed 090000,
   100000 and 110000 migrations. Enable live_presence, market, predictions and arena and verify live.
2. Complete the case backend in phases: searches and earned case data, board/night finale,
   Relighting/rewards, NPC partners and hardening. Apply each reviewed migration before its code.
3. Complete G9: real sign-in, account/save, crews, presence and the case adapter; prove solo and crew
   play end to end with once-only rewards and protected reveals.
4. Integrate economy-abuse coverage, festival, host console and sports in dependency order, then
   reliability, security, accessibility, developer tools, help, privacy and submission materials.
   Nils authorized enabling completed festival and sports on 6 Nov; each still needs its proofs.
   RELIGHT_OPEN stays unset until the separately controlled game-opening step.
5. Add the optional AI helper described below, then rehearse the full deployed experience.

### Current delivery map

| Area | Current result | Remaining proof or input |
|---|---|---|
| Intro, islands, story presentation and sound | Built and deployed; local demo/rehearsal available | Physical laptop/phone/gamepad and listening rehearsal |
| Weather, Exchange v2, predictions, duels and presence services | Deployed and enabled | Direct stock/cache smoke needs this cloud's production-host allowlist; normal crew subscription needs G9 |
| Case, shared board/night, Relighting and NPCs | Backend deployed; all 69 kit mixes and actual solo/four-human HTTP/SQL journeys pass | Resume G9 and prove authenticated browser journeys; RELIGHT_OPEN remains unset |
| Festival and host tools | Deployed; festival enabled in waiting state; host actions require configured identity | Actual authenticated host/browser rehearsal; festival starts only after the first real Relighting |
| Sports | Reviewed code and database deployed, feature off | Add provider key directly to Vercel; verify current provider read-only before activation |
| Reliability, tests, help/privacy, security/notices, devtools | Deployed; combined gates and public read-only verification pass | Authenticated browser/device journey follows G9 |
| Presentation, drills and submission materials | Offline deck/PDF, presenter script and contributor guides built | Teammate names, private course requirements and spoken laptop/projector rehearsal |
| Spoiler-safe ChatGPT helper | Scope and consent/security contract recorded; feature off | Official registered website client approval, then implementation after G9 and a consented live proof |

No routine merge permission is needed. The immediate external dependencies are the laptop for G9,
the sports key in Vercel and official ChatGPT website-client registration. Teammate credit names,
submission details and the physical rehearsal are needed before hand-in. Secrets and student
numbers must stay out of chat and Git. Stabilization adds no database migration or paid service.

**Sound is already built**, in frontend/src/audio/: original procedural title/finale music, sea/wind/rain
ambience, footsteps, foghorns, dialogue/UI sounds, building cues and station hum. It starts after a
user gesture, has separate master/music/effects levels and visible captions for key cues. Keep audio
regressions in release checks; listening balance on the presenter laptop remains a rehearsal task.

**AI helper (new, Nils, 6 Nov):** spoiler-safe hints and game help powered by a player's eligible
ChatGPT plan through official Sign in with ChatGPT. Add it as an optional feature after the earned-case
adapter. The model may see only the requesting player's earned, authorized game view and public help;
it receives no secret case content and cannot write game state or award coins. Keep ordinary gameplay
available when disconnected, consent is declined or usage is exhausted. Website OAuth activation is
blocked on OpenAI approval and a registered client/callback: the official website flow is a limited
trial, not a general-purpose client registration. Never borrow a Codex client ID or store a player's
ChatGPT credentials. See [the integration scope](specs/AI-helper.md).

## Changes since v0.2 (Thu 5 Nov, late evening)

- **The story round is approved (S0 is done).** Nils approved the 19 recommendations of the story approval sheet as written. [D018](docs/DECISIONS.md) records them. Three review changes to the text of the sheet still wait for his OK. The minimum versions of S1, S3, S4 and L3 now say what the story round needs, the S0 "Provides" line points at the real files in [docs/story/](docs/story/README.md), and the L4 and L2 texts follow D017 and G2 (a 2% fee, four plots and a signal station).
- **No demo world for now** (Nils: "maybe we add later, for now we just build the game"). Rehearsals and the demo use the existing `?demo=1` highlights tour, which runs on the browser-side stand-in and never touches the live world. One server setting, the relight lock, keeps the relight switch locked until the game opens, so the team's own test solves cannot relight the coast. This replaces the seeded demo world and L3's presenter seed.
- **Live multiplayer is core** (Nils: "the game needs to be a multiplayer game, so we need to see everyone live; push that up"). A4 live presence moves from Later into core and is built on Supabase Realtime. Its target is the Fri 13 slice.
- **The case files moved to the D016 paths:** `backend/content/secret/case.json`, `backend/content/partners.json` and the timing program in `backend/tools/`.
- **Status lines match `main`.** Foundation wave 2 (`393f551`), G2 and G3 (`60bd60e`), the S1 import (`589baea`) with Story v2 (`3d59b6a`), and the S2 intro (`c52613b`) are merged, so the lines for G, S and A no longer say "in progress". The per-lane count includes A4.
- **The keep-alive is decided** (Nils, 5 Nov): a daily GitHub Actions workflow, `.github/workflows/keepalive.yml`, calls `/api/keepalive`.
- **No package is reserved for a teammate** (Nils, 5 Nov, late evening): Claude and Codex build every package as far as they can, and teammates join any package or bring new ideas. S4 is no longer proposed for the L-lane owner.
- **The Island Exchange text waits for Nils' answers** (5 Nov, late evening). He answered the D017 questions: no circuit breaker, no price floor or ceiling, and real prices with 10x leveraged positions instead of a multiplier. D017 and L4 change on the Exchange branch, so the multiplier, floor and circuit-breaker lines in L4 below are marked as superseded and are not rewritten here.

## Changes since v0.1

- **Look decided (D005): original top-down pixel art.** On 5 Nov Nils chose a top-down 2D look, not low-poly 3D, and then approved the pixel-art gameplay presentation. The sprites are original and drawn by code: 36 sprites plus one baked terrain backdrop (a ready-made picture of the ground), at 16 native pixels per world unit, enlarged with nearest-neighbour scaling so the pixels stay sharp. The earlier painted-paper and nautical-journal studies are superseded iteration material. The game lives in `frontend/`. Codex is still finishing on `feat/graphics-foundation`, which already merged `main` (`cc7174d`) and keeps the `frontend/` layout. G1 finish merges that branch when Codex reports done and Nils agrees.
- **Layout and hosting.** One Vercel project with two Services: `frontend/` (Vite) and `backend/` (FastAPI). Every `/api` request goes to the backend. Functions should run in Dublin, next to the Supabase project in Ireland (Nils confirms the region in the Vercel settings). (v0.1 said `api/index.py` and Frankfurt.)
- **`main` is live (new).** On 5 Nov, Claude merged `feat/live-skeleton` into `main` (merge commit `a0e501a`). The game and the Python API now run at https://the-great-plot-twist.vercel.app/: the page answers with the game, `/api/health` answers `{"status":"ok","version":"0.1.0","env":"production"}` and `/api/config` answers with all flags off. That passes deploy check 2 and shows that Vercel Services with the Python backend works on the Hobby plan. The merge skipped peer review once, on Nils' standing authorization. D015 records the rule: owner-authorized merges by Claude cover coordination work, and teammates' changes keep peer review.
- **Foundation.** Wave 1 is done and on `main`. Wave 2 was in progress on `chore/foundation` (merged since as `393f551`): starting balance 0, a table of wallet reasons, neutral captain names, explicit grants, crews and seats (D012), a keep-alive route, and the decision entries D002, D003, D004, D012 and D015.
- **Story.** "The Light That Shouldn't Be" replaces "The Fog Ledger", and S3 takes its name. New packages: S0 Story detail round, S4 NPC partners, A6 Crews and seats. L3 becomes the Captain's Table board and the Night of Three Lights.
- **Live features.** L4 Island Exchange follows Nils' rules and uses a checked data feed. L5 Prediction desk and L6 Sports predictions come back as "should", with checked sources. A7 Lantern Duels is new.
- **Honest tiers.** Every package is core, should or later. The story skeleton's core list is about twice our capacity, so this roadmap cuts it. Minimum versions ship first.
- **Demo.** Very short, highlights only (D013, decision 4). The phone class raid (A5) moves to later, and D011 is released.
- **Merge order.** The bootstrap went to `main` as one merge. A new four-step order follows: these docs, foundation wave 2, Codex's final pixel pass, then one `feat/` branch per package (see [Merge order](#merge-order-today)).

## Start today

Nothing here waits for anyone. `main` is live, so clone it and create your branches from `main`. Open decisions (for example the D008 grow order and who creates the data-API accounts) are listed in [docs/STATUS.md](docs/STATUS.md#open-decisions).

| Lane | Start now | Read first | Next, when it unblocks |
|---|---|---|---|
| Everyone | Accept the GitHub invite, set your commit email, clone `main` and run the checks. Open the live site. Settle the open decisions at the team kickoff. | [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), this file, [docs/STATUS.md](docs/STATUS.md) | The first package of your lane |
| G World and Graphics (Nils, with Codex) | G1, G2 and G3 are on `main` (`45d2d46`, `60bd60e`; D005: original top-down pixel art). | [frontend/GRAPHICS.md](frontend/GRAPHICS.md) | G4 finale visuals, once the L3 finale contract exists. |
| S Story and Mystery | S0 Story detail round: approved by Nils on 5 Nov (branch `docs/s0-story-round`, from `main`), except three review changes that wait for his OK. S1's import (`589baea`) and Story v2 (`3d59b6a`) are on `main`; its content linter is still to do. S2's playable intro is on `main` (`c52613b`). | [docs/STORY.md](docs/STORY.md) | S3 The Light That Shouldn't Be, once A3 and A6 are on `main`. Its spec is the case file in [docs/story/](docs/story/README.md). |
| A Accounts and Multiplayer | A1-next preparation: get Developer access in the Supabase organization (to read), read the database rules, and read the backend code on `main`. A4 live presence is core now: read its Realtime budget in [docs/INTERFACES.md](docs/INTERFACES.md#7-realtime-budget). | [docs/SETUP.md](docs/SETUP.md), [supabase/README.md](supabase/README.md), [specs/F0-foundation.md](specs/F0-foundation.md) | The foundation migration is applied. The deploy checks and the two-user test plan are tracked in [docs/STATUS.md](docs/STATUS.md#right-now). Then A2 |
| L Live Systems | L1 Live weather: the spec, saved Open-Meteo answers and the mapping tests. No network in tests. | `backend/server/adapters/base.py` and `example.py`, [docs/ENGINEERING.md](docs/ENGINEERING.md) recipe 4.4, `setWeather` in [frontend/GRAPHICS.md](frontend/GRAPHICS.md) | L1 code on `feat/l1-live-weather` (from `main`), and the L3 spec for Mon 9 |

## How to read this

### Sizes

One roadmap day is about 4 focused hours by one teammate with a coding agent.

- S = 1 day
- M = 2-3 days (sums count an M as 2.5)
- L = 4 days

### Capacity and the cut rule

- From Fri 6 to Wed 18 each teammate gives about 8 roadmap days. Kickoff, reviews and checkpoints take about 1.5 of them. That leaves about **26 package days** for the team.
- **The story skeleton's core list is too large.** Built in full it comes to about 50 package days: the 16 core packages below (37 days), plus the Exchange, free sailing and salvage, a phone page for the class and a presenter panel. That is nearly twice what we have. This roadmap cuts it in three steps.
  1. Only the 16 packages that the world, the mystery, the logins, your own islet and the live weather need are **core**. Everything else is **should** or **later**.
  2. Even the core is too big at full size: about 37 days. At minimum versions it is about 23 days, which fits with about 3 days to spare. So **every core package ships its minimum version first**, as its own small pull request.
  3. **Cut rule at M1 (Fri 13).** A package counts as merged when its minimum version is on `main`. If less than 70% of the M0 and M1 packages are merged (8 of 11, with A4), every remaining core package stays at its minimum version and no should package starts. If 70% or more are merged, lanes grow core packages to full size in the grow order, then start should packages.
- **Grow order** (proposed for D008, open for the team kickoff): first S3, L3 and S4 to full size, because the mystery is the heart of the game. Then L4 Island Exchange. Then G2 and G3 at full size. Then L2 at full size. Then A7, L5 and L6, in that order.

| ID | Package | Tier | Size | Full days | Minimum days | Milestone |
|---|---|---|---|---|---|---|
| G1 | Graphics foundation and the final look | core | S | 1 | 1 | M0 |
| G2 | Places and sea chart | core | M | 2.5 | 1.5 | M1 |
| G3 | Saltreach Harbor | core | M | 2.5 | 1 | M2 |
| G4 | Finale visuals | core | S | 1 | 0.5 | M2 |
| S0 | Story detail round (Nils and the S lane) | core | M | 2.5 | 1.5 | M0 |
| S1 | Import Plot Twist and Story v2 | core | M | 2.5 | 1.5 | M0 |
| S2 | Act 1 in the browser | core | M | 2.5 | 1.5 | M1 |
| S3 | The Light That Shouldn't Be | core | L | 4 | 3 | M2 |
| S4 | NPC partners | core | M | 2.5 | 1.5 | M2 |
| A1 | Foundation: what is left | core | L, about S left | 1 | 1 | M0 |
| A2 | Sign-in, captain names and cloud progress | core | M | 2.5 | 1.5 | M1 |
| A3 | Referee and entry kits | core | M | 2.5 | 1.5 | M1 |
| A6 | Crews and seats | core | M | 2.5 | 1.5 | M1 |
| L1 | Live weather | core | S | 1 | 0.5 | M1 |
| L2 | Your home islet | core | M | 2.5 | 1.5 | M2 |
| L3 | Captain's Table and Night of Three Lights | core | L | 4 | 2.5 | M2 |
| | **Core total** | | | **37** | **23** | |
| L4 | Island Exchange | core (Nils, 5 Nov; minimum version first) | L | 4 | 2 | M2 |
| A4 | Live presence | core (Nils, 5 Nov, late evening; minimum version first). Size and days are a proposal until the A4 spec | M (proposal) | 2.5 | 1.5 | M1 |
| A7 | Lantern Duels | should, 2nd | M | 2.5 | 1.5 | after M1 |
| L5 | Prediction desk | should, 3rd | M | 2.5 | 1.5 | after M1 |
| L6 | Sports predictions | should, 4th | M | 2.5 | 1.5 | after M1 |
| | **Should total** | | | **11.5** | **6.5** | |

At minimum versions each lane carries about 5 to 7 days: G about 5 (with Nils' half of S0), S about 6.5, A about 7 with A4 (proposed), L about 6 (with S4). Everyone has about 6.5, so the A lane is the fullest until the recount at the Fri 13 check. These numbers show the load, not an assignment: no package is reserved for a teammate (Nils, 5 Nov, late evening). Claude and Codex build every package as far as they can, and teammates join any package or bring new ideas.

**Decided by Nils (5 Nov):** Island Exchange (L4) is core. To fit about 26 package days, it ships its minimum version first, and L2 (home islet) and G3 (Saltreach Harbor) ship their minimum versions. The minimum core is then about 25 days, with about 1 day spare. L2 and G3 grow back to full if the M1 check passes.

**Decided by Nils (5 Nov, late evening):** live multiplayer is core, so A4 (live presence) joins L4 below the line. At its proposed 1.5 days of minimum size it takes the minimum core to about 26.5 days. G1, G2, G3 and L4 are already on `main`, so the days still to spend are fewer than that sum. The roadmap owner recounts them at the M1 check on Fri 13 Nov, counting G2, G3 and L4 as done.

### Tiers

- **Core:** must ship by M2 (Wed 18). Every core package has a minimum version.
- **Should:** starts only when the M1 cut rule passes and the builder's own lane core is merged. Always behind its feature flag, so unfinished work never blocks the freeze.
- **Later:** not before submission (Mon 23). The world keeps running after the demo, so later packages can still come.

### Lanes

One lane per teammate, so everyone owns visible game code in both Python and JavaScript.

- **G World and Graphics:** Nils, with Codex.
- **S Story and Mystery:** owner picked by the team today. Nils co-owns S0.
- **A Accounts and Multiplayer:** owner picked by the team today. Nils does the account steps with them (A1).
- **L Live Systems:** owner picked by the team today.

The letter says where a package belongs, not who must build it. The lane owner coordinates it, and any teammate may build it ([CONTRIBUTING.md](CONTRIBUTING.md): any teammate may own a task). No package is reserved for a teammate (Nils, 5 Nov, late evening): Claude and Codex build every package as far as they can, and teammates join any package or bring new ideas.

### From package to code

- Each package becomes one GitHub issue (goal, acceptance checks, scope, responsible teammate, likely files) and one spec, `specs/<ID>-<name>.md`, copied from [specs/_TEMPLATE.md](specs/_TEMPLATE.md).
- Branch names follow `<type>/<id>-<topic>` from `main`, for example `feat/a2-sign-in`. One writing agent per branch.
- The minimum version is the first pull request. Pull requests stay under about 400 changed lines, not counting lockfiles, assets and story text.
- A different human teammate approves. Merge with a merge commit. Teammates' packages always keep this peer review (D015); the only exception so far is the bootstrap merge.
- Names under "Provides" are proposals until [docs/INTERFACES.md](docs/INTERFACES.md) (coming with the foundation update) freezes them on Mon 9 (D009). The big picture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (also coming with the foundation update).
- Ready-to-paste agent briefs for the next packages are in [docs/STATUS.md](docs/STATUS.md#next-steps-per-lane).

## Merge order (today)

The bootstrap is done. `feat/live-skeleton` was merged into `main` on 5 Nov (merge commit `a0e501a`: the team workflow docs, foundation wave 1 and the graphics snapshot, moved into `frontend/`). It skipped peer review once, on Nils' standing authorization (D015). Nobody needs `feat/live-skeleton` any more. What lands next, in this order:

1. **These docs go to `main` first:** this roadmap, the story, the status page and the README changes, so the whole team plans from the same pages.
2. **Done: foundation wave 2 (`chore/foundation`) is on `main`** (`393f551`), with `docs/ARCHITECTURE.md`, `docs/INTERFACES.md` and the decision entries D002, D003, D004, D012 and D015. It came before the database work because wave 2 still edited the first migration, and a migration is never edited after it is applied ([docs/ENGINEERING.md](docs/ENGINEERING.md), recipe 4.2). The migration is applied to the Supabase project.
3. **Done: Codex's final pixel pass is on `main`** (`45d2d46`, merged on 5 Nov evening after the tests and the build passed).
4. **Every package uses its own `feat/` branch from `main`.** Packages that draw places or screens (G2, S2) wait for step 3, and packages that use the database (A2 and later) wait for step 2.

Peer review stays the rule for every teammate's package (D015).

## Dependency overview

```text
Now, no waiting (Thu 5 to Sun 8):
  G1 final pixel pass (Codex)             S0 Story detail round (writing only)
  A1 wave 2, migration, deploy checks     L1 Live weather (spec, saved answers, tests)
  Everyone: clone main, run the checks, settle the open decisions

Then:
  G1 -> G2 Places and sea chart -> G3 Saltreach Harbor -> G4 Finale visuals
  solo game access + S0 -> S1 Import Plot Twist and Story v2 -> S2 Act 1 in the browser
  A1 -> A2 Sign-in and captain names -> A3 Referee and kits (also needs S1)
  A2 -> A6 Crews and seats
  A2 + A6 -> A4 Live presence (Supabase Realtime, target the Fri 13 slice)
  S0 + S1 + A3 + A6 -> S3 The Light That Shouldn't Be
  S0 + A6 + S3 cards -> S4 NPC partners
  A6 + S3 rules -> L3 Captain's Table and Night of Three Lights -> G4
  G2 + A2 -> L2 Your home islet

Should (only if the M1 cut rule passes, always behind a feature flag):
  L4 Island Exchange -> A7 Lantern Duels -> L5 Prediction desk -> L6 Sports predictions
```

## Milestones

| Milestone | Dates | Done when |
|---|---|---|
| M0 Foundations | Thu 5 to Sun 8 | `main` is live (done on 5 Nov: the bootstrap is merged and production answers). Foundation wave 2 is on `main`. Codex's final pixel pass is merged and D005 is written. `npm test` and `uv run pytest` are green on `main`. Lane owners are picked. The S0 case file is drafted. The migration is applied and the two-user test plan passes. |
| Contracts | Mon 9 | All four have reviewed `docs/INTERFACES.md` (D009). Nils has approved S0. The A6 and L3 specs are written. Every core package has an issue. |
| Backbone go/no-go | Tue 10 | The five deploy checks in [docs/SETUP.md](docs/SETUP.md) pass or have a recorded fallback (D010): a teammate's push builds a Ready preview, `/api/health` answers on the preview, a call to the daily keep-alive route ends with 200 on production (check 3: a daily GitHub Actions workflow makes the call, `.github/workflows/keepalive.yml`, Nils, 5 Nov), two test users each see only their own rows, and a GitHub sign-in round trip works. Check 2 already passed on 5 Nov: `/api/health` answers on production. |
| M1 Vertical slice | Fri 13 | Act 1 is playable in the browser to an ending. The referee grants a kit. A crew forms, with an NPC partner in an empty seat. Two players see each other live (A4). You can travel from Lighthouse Isle to the harbor. Live weather shows. First fps check on the presenter laptop. Cut rule applied (D008). |
| M2 Feature complete | Wed 18, freeze 18:00 | The case works end to end: a crew of four and a solo player with NPC partners both finish (8 cards, 4 deductions, finale, accusation, twist). The Relighting and the rewards happen once. Each islet is saved per account. Solvability proofs are green. The timed playtest is logged. |
| M3 Ship | Thu 19 to Sun 22 | Deployed checks pass. The README has the deployed URL, every member's name and student number, the commands and demo mode. Each lane has a how-it-works page. `frontend/ASSETS.md` is complete. The highlights demo is rehearsed on Fri 20, explain-back drills run on Thu 19 and Sat 21, final rehearsal on Sun 22. |
| Submit | Mon 23 | Fresh-clone check and signed-out browser check. Tag `v1.0`. One member submits on Moodle by 18:00 (the deadline is 23:59), with a backup member named. |

## Decision log entries (docs/DECISIONS.md)

Numbers are reserved in this order. Whoever merges first uses the reserved number.

| ID | Decision | Written in | Status |
|---|---|---|---|
| D001 | Shared collaboration workflow | PR 1 (`docs/team-workflow`); its commits are in `main` through the bootstrap merge | proposed; accepted once a teammate has reviewed it (the bootstrap merge skipped review once, D015) |
| D002 | Hosting and services: Vercel Hobby with two Services (`frontend/`, `backend/`), Supabase Free in Ireland, portable build | Foundation pull request (A1) | coming with the foundation update |
| D003 | Rules live in Python on the server; the browser never writes game data | Foundation pull request (A1) | coming with the foundation update |
| D004 | Play-money wallet: one ledger, starting balance 0, coins arrive with the entry kit, a reasons table with directions, one row per player, reason and ref | Foundation pull request (A1) | coming with the foundation update |
| D005 | Look: top-down original pixel art, decided by Nils on 5 Nov (sprites drawn by code, 16 native pixels per world unit, nearest-neighbour scaling, on Vite, Three.js and plain JavaScript). It supersedes the earlier look studies. | G1 finish, with Codex's final pixel pass | decided; the entry is written with G1 finish |
| D006 | Identity: GitHub sign-in only, generated captain names, preset emotes, no free text | A2 | proposed in the A2 pull request (`feat/a2-a3-signin-referee`); the sign-in approach and the word lists wait for Nils |
| D007 | Plot Twist imported as an unchanged copy with a provenance note; the solo repository untouched | S1 | written in the S1 pull request (`feat/s1-import-plot-twist`); proposed until reviewed |
| D008 | Scope tiers (core, should, later), minimum versions first, the M1 cut rule and the grow order | Kickoff | reserved; the grow order is open for the kickoff |
| D009 | Contracts v1 frozen in `docs/INTERFACES.md` | Mon 9 | reserved |
| D010 | Backbone go/no-go result | Tue 10 (A1-next) | reserved |
| D012 | Crews and seats: up to 4 seats per crew, each holding a player or an NPC partner; solo = one player plus NPC partners | Foundation pull request (A1) | coming with the foundation update |
| D013 | Story decisions 1 to 5 (5 Nov): own copy per crew and the first solve relights the coast for everyone; Story v2 is small `story.json` edits; NPC partners v1 are scripted errand runners; **the class demo is very short and shows highlights only (changed)**; the culprit is chosen (a spoiler, named only in D013 of the [decision log](docs/DECISIONS.md) and the labelled story files), titles only | S0 | decided; to be written |
| D014 | Live data sources and their free keys: who creates each account and where each key lives (Vercel settings only) | L1 or L4, whichever merges first | reserved (new in v0.2); who creates the accounts is open for the kickoff |
| D015 | Owner-authorized merges by Claude for coordination work; teammates' changes keep peer review. First use: the bootstrap merge `a0e501a` on 5 Nov | Foundation pull request (A1) | reserved; written in `docs/DECISIONS.md` with the foundation update (new on 5 Nov, evening) |
| D016 | Server content lives in `backend/content/`; the browser gets public content through `GET /api/content/{name}`; secret content in `backend/content/secret/` is never served; browser-only data stays in `frontend/`. It moves the content paths of S3, S4, A2, A3, L2, L4 and L5. | S1 | proposed in the S1 pull request; stays proposed until Nils accepts it (new on 5 Nov) |
| D017 | Island Exchange rules | L4 | written in `docs/DECISIONS.md`; the chosen numbers are proposals for Nils and the team. His answers of 5 Nov, late evening, change several of them, so D017 is reworked on the Exchange branch |
| D018 | Story round (5 Nov 2026): the 19 decisions of the approval sheet, decision 19 changed (no demo world for now, a relight lock instead) and live multiplayer as core (A4) | S0 | decided by Nils; written with the S0 pull request (`docs/s0-story-round`) |
| D019 | Referee and entry kits | A3 | proposed in the A3 pull request (`feat/a2-a3-signin-referee`); the kit coins (N5) were settled by the story round (D018); "the first ending counts" (N6) waits for Nils |
| D020 | Crews: codes, the guessing limit and partners at the muster | A6 | proposed in the A6 pull request (`feat/a6-crews`) |
| D021 | Home islet rules: five spots, one building each, 300 coins and 10 timber, 20 starter timber, one atomic build | L2 | proposed in the L2 pull request (`feat/l2-home-islet`); the choices marked "chosen here" need Nils' OK |
| D022 | Account data: cloud save versions, delete my data, hosts (D018 on its branch; renumbered at merge) | A2 | proposed in the A2 pull request (`feat/a2-a3-signin-referee`); "delete my data" waits for Nils |
| D023 | Live presence on Supabase Realtime: private rooms, presence, preset emotes, server pushes to a crew (D018 on its branch; renumbered at merge) | A4 | decided by Nils in its core (live multiplayer, free, the library `@supabase/supabase-js`); the details marked "chosen here" are proposals |
| D024 | Open-world must: weather states and the fog-night rule, the Lisbon day, the harbor bulletin and the Chapter 2 hook (D018 on its branch; renumbered at merge) | open-world must | proposed in `feat/open-world-must`; the choices marked "chosen here" need Nils' OK |

D011 (class join go/no-go after a load test) is released. The phone class join moved to later, and the demo is highlights only.

## Demo

**Very short, highlights only. It is not the live first solve** (D013, decision 4; Nils changed this on 5 Nov).

- It shows a few highlights, picked from the beats in [docs/STORY.md](docs/STORY.md) section 8, for example: the Act 1 ending card, a crew with an NPC partner in one seat, a deduction lighting up, the Night of Three Lights and the schooner, and the Relighting. Whether it also shows the twist is open for the team kickoff, because that spoils the case for classmates who play later.
- **No separate demo world for now** (Nils, 5 Nov, late evening: "maybe we add later, for now we just build the game"). The demo runs the existing `?demo=1` highlights tour (S2 and G5), which runs on the browser-side stand-in and never touches the live world, so the live world's real first solve stays open for players. A short recording of the same highlights is the fallback. Rehearsals use the same tour. One server setting, the relight lock, keeps the relight switch locked until the game opens, so the team's own test solves cannot relight the coast (decision 19). A separate demo world with a seed and a reset script can still come later if the team wants it.
- Not needed any more: the 7:30 live script and the phone class join (A5).
- Still open: the date (Tue 24 Nov or Fri 4 Dec), the slot length and the format. The course has not published them yet.
- Free Supabase projects pause after 7 days of low activity. A daily GitHub Actions workflow calls the keep-alive route (`.github/workflows/keepalive.yml`, Nils, 5 Nov; [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)). Someone still opens the Supabase dashboard the day before the demo.

## Lane G: World and Graphics (Nils, with Codex)

### G1 Graphics foundation and the final look

- **Status:** done. The look is decided (D005, Nils, 5 Nov): original top-down pixel art, 36 sprites drawn by code plus a baked terrain backdrop, at 16 native pixels per world unit (the approval is recorded in `frontend/ASSETS.md`). Codex's final pass is on `main` (`45d2d46`), and the live site runs it.
- **Milestone:** M0 · **Size:** S · **Tier:** core · **Can start now:** in progress.
- **Ships:** the lighthouse island in its final style (original top-down pixel art) on `main`: beam, sea, sky, day and night, rain and fog, the explorer and the four story zones.
- **Depends on:** nothing.
- **Provides** (contracts in [frontend/GRAPHICS.md](frontend/GRAPHICS.md)):
  - the event bus `on` and `emit` (`frontend/src/core/events.js`), with `{type:'interact', id}` for `cottage`, `desk`, `shore` and `tower_door`;
  - `setWeather` and `getWeather` (`frontend/src/world/weather.js`): `cloudCover`, `rain`, `fog` and `wind`, each 0 to 1;
  - the camera anchors `stairwell` and `lamp_room`;
  - `createCharacter(art)`, the art catalogue and `loadArt()`;
  - quality presets.
- **Acceptance:**
  - `cd frontend && npm test` and `npm run build` pass on `main` (today: 22 tests in 4 files);
  - the contracts above still hold, or every change is written in `frontend/GRAPHICS.md` and announced to the other lanes;
  - D005 is written in `docs/DECISIONS.md` and names the style: top-down original pixel art;
  - fps, draw calls and triangles are measured on the presenter laptop and logged in `frontend/GRAPHICS.md`;
  - every shipped asset is our own and listed in `frontend/ASSETS.md`. Style reference images are not committed to this public repository.
- **Minimum version:** merge the final pixel pass as it is; tune later.

### G2 Places and sea chart
- **Status:** done (Codex, for Nils; merged with G3 as `60bd60e`).

- **Milestone:** M1 · **Size:** M · **Tier:** core · **Can start now:** after Codex's final pixel pass is merged, so G2 builds on the final frontend code.
- **Ships:** a place manager that loads one place at a time (Lighthouse Isle, Saltreach Harbor, your home islet), a sea chart for travel, chart stops for Smugglers' Cove, Wreck Point and the Teeth, and the fog bank that hides Gull's Rest.
- **Depends on:** G1.
- **Provides:**
  - `createPlace(ctx)` returning `{group, zones, anchors, colliders, update(dt), dispose()}`;
  - `world.goTo(placeId)`;
  - events `{type:'travel', to}` and `{type:'arrived', place}`;
  - `content/places.json`: place ids, hotspot ids and positions, and chart positions (from the map and art list in S0).
- **Acceptance:**
  - Vitest covers the travel table (a refused trip changes nothing) and `dispose()`;
  - fps stays within budget after 10 round trips, with no console errors;
  - new art is listed in `frontend/ASSETS.md`.
- **Minimum version:** the chart plus a fade. Chart stops open a pixel-art scene panel instead of a walkable map.

### G3 Saltreach Harbor
- **Status:** done (Codex, for Nils; merged with G2 as `60bd60e`).

- **Milestone:** M2 · **Size:** M · **Tier:** core · **Can start now:** after G2.
- **Ships:** the shared hub from the story: Harbor Office, Harbor Light, ferry pier, jail, market hall, prediction kiosk, sports pavilion and signal station.
- **Depends on:** G2.
- **Provides:** a `createPlace` module `harbor` whose hotspots emit `interact` with ids from `content/places.json`.
- **Acceptance:**
  - every hotspot id exists in `content/places.json`, and every place the case uses exists there too (checked by the content linter);
  - under 150 draw calls;
  - assets are listed in `frontend/ASSETS.md`.
- **Minimum version:** one drawn harbor map with only the hotspots the case needs (S0 names them; likely the Harbor Office, the Harbor Light, the signal station and the ferry pier). The other buildings are scenery.

### G4 Finale visuals

- **Milestone:** M2 · **Size:** S · **Tier:** core · **Can start now:** after G3. The event contract comes from L3.
- **Ships:** three gold beams crossing on the false light, the fog parting, the dark schooner appearing, and the unmasking shot.
- **Depends on:** G3, and the L3 finale event.
- **Provides:** `world.cinematic('three_lights' | 'fog_lift' | 'unmask')`, which listens for `{type:'finale', stage}`.
- **Acceptance:** plays in under 15 seconds; Escape skips it; the reduced-motion setting is respected; fps measured on the presenter laptop.
- **Minimum version:** a fog fade plus a reveal card.

## Lane S: Story and Mystery (owner picked today)

### S0 Story detail round
- **Status:** done. Nils approved the story round on 5 Nov 2026 (D018). Everything is in [docs/story/](docs/story/README.md). Three review changes to the text of the approval sheet wait for his OK before the pull request ([docs/story/README.md](docs/story/README.md#changes-to-the-approval-sheet-after-the-review)).

- **Owner:** Nils and the S-lane owner.
- **Milestone:** M0, done by Mon 9 (contracts day) · **Size:** M · **Tier:** core · **Can start now:** yes. Writing only, no code.
- **Ships:** the details that turn the approved skeleton into something we can build and test. From "Next detail round" in [docs/STORY.md](docs/STORY.md):
  - the Story v2 change list for `story.json`;
  - the case file: 8 cards, 4 deductions, routes per kit, costs or waits, clearing lines and closing lines;
  - the fairness and solvability rules for the linter and the pytest proofs;
  - the NPC partner orders, errand times and about 30 scripted lines;
  - the timing table and a timed paper playtest;
  - the Relighting and reward rules: reasons, once-per-player refs and the spoiler rule;
  - a name check of every place and company name.

  Items that other packages own go there: the crew and seat model (A6), the Night of Three Lights (L3), the map and art list (G2), the open-world numbers (L2, L4) and the demo script (M3).
- **Depends on:** nothing.
- **Provides:** the detail sections in docs/STORY.md and the story round in [docs/story/](docs/story/README.md): the case file ([CASE-FILE.md](docs/story/CASE-FILE.md)), the NPC partner rules ([NPC-PARTNERS.md](docs/story/NPC-PARTNERS.md)), the Story v2 change list ([STORY-V2-CHANGES.md](docs/story/STORY-V2-CHANGES.md)), the open-world numbers ([OPEN-WORLD.md](docs/story/OPEN-WORLD.md)), the timing check ([TIMING.md](docs/story/TIMING.md)), and the case data in `backend/content/secret/case.json` and `backend/content/partners.json`. They stand in for `specs/S3-the-light.md` and `specs/S4-npc-partners.md`, which are not written: S3 and S4 start from these pages.
- **Acceptance:**
  - every item in "Next detail round" is answered, or handed to a named package;
  - the case file lists 8 cards and 4 deductions, with a cheap route for one kit and a slower route for the others;
  - a timed paper playtest is logged;
  - Nils approves the case file, and D013 is written.
- **Minimum version:** the Story v2 change list and the case file. The rest goes into the S3 and S4 specs.

### S1 Import Plot Twist and Story v2
- **Status:** the import is on `main` (`589baea`), and so is the second pull request, Story v2 (`3d59b6a`) (Claude, for Nils). The content linter `backend/tools/lint_content.py` is not built yet.

- **Milestone:** M0 · **Size:** M, two pull requests · **Tier:** core · **Can start now:** yes; in progress (Claude, for Nils).
- **Ships:** the original game, *The Keeper's Last Log* (engines, story and its 11 tests), inside the team repository. Then the Story v2 edits.
- **Depends on:** nothing for the first pull request: Claude copies the original game into this repo for Nils (Nils decided on 5 Nov that nobody needs the private solo repository). The second pull request needs S0's Story v2 change list.
- **Provides** (paths as built in the first pull request; the content location is decision D016, proposed):
  - `backend/plot_twist/`: `engine.py` with a `save_path=None` option for the server. The terminal game (`cli.py`) is not imported, because it is not part of the web game. It can come back later if Nils wants it;
  - `frontend/src/story/engine.js`: the JavaScript engine as an ES module, the same rules rule for rule, with its `README.md`;
  - `backend/content/story.json` (Story v1 in the first pull request, Story v2 in the second) and `backend/content/README.md` (the content format and the provenance note);
  - `GET /api/content/intro-story` (`backend/server/routes/content.py`), public, so the browser can load the story from the API;
  - `backend/plot_twist/tests/` with the 11 original tests, added to `testpaths` in `backend/pyproject.toml`, and the Node.js runner `parity_runner.mjs` next to the parity test;
  - `backend/tools/lint_content.py` (second pull request).
- **Acceptance:**
  - `cd backend && uv run pytest` runs the 11 original tests (9 acceptance and content tests, 2 parity tests) and the server tests, all green;
  - the parity test (the Python and JavaScript engines agree) still passes;
  - the provenance note (solo repository `main` at `e235ee4`, copied, the solo repository untouched) and D007 are written, and D016 (the content location) is proposed;
  - `GET /api/content/intro-story` answers 200 with the story file and `Cache-Control: public, max-age=300`, and a name that is not on the public list answers 404 in the standard error shape;
  - Story v2 (second pull request): all 14 edits of [STORY-V2-CHANGES.md](docs/story/STORY-V2-CHANGES.md): one ending line per decision, the log lead, a visible third path for saying nothing (it is not final: decision 2), Elena's drawing for Chapter 2, the lantern fix and the planted hints for everyone. Each change has a test (19 new tests), and the one existing engine-rule test that pins the shore notes by position is updated;
  - the linter rejects unknown items or flags, and flags that are set but never used.
- **Minimum version:** the import, then all 14 Story v2 edits and their 19 tests in one small pull request.
- **Watch out:** D016 puts the server's content under `backend/` from the start, because it is not proven that the backend on Vercel can read files outside `backend/`. What is still not checked is that the deployed API finds `backend/content/story.json`. A3 checks this on a preview.

### S2 Act 1 in the browser

- **Milestone:** M1 · **Size:** M · **Tier:** core · **Can start now:** after G1 (Codex's pixel pass merged) and S1.
- **Ships:** *The Keeper's Last Log* playable in the game world: walk to a zone, press E, read and choose in a dialogue panel, inventory, local save and an ending card. A `?demo=1` chapter select for rehearsals.
- **Depends on:** G1, S1.
- **Provides:** `frontend/src/story/intro.js`: an interact id moves the engine through plain "go to" actions, then shows that scene's actions. The move log `actions[]`. The event `{type:'intro_ended', ending}`.
- **Acceptance:**
  - Vitest covers the adapter paths (shore to desk runs `shore_back`, then `to_desk`), and a refused action changes nothing;
  - all text is inserted with `textContent`;
  - the solo game's keyboard and focus behaviour is kept;
  - a play-through reaches every ending.
- **Minimum version:** the panel at the four zones; the stairwell and the lamp room as panel scenes.

### S3 The Light That Shouldn't Be

- **Milestone:** M2 · **Size:** L · **Tier:** core · **Can start now:** the spec from S0 by Mon 9; code after S1, A3 and A6.
- **Ships:** the case for one crew (each crew plays its own copy, D013): 8 cards, 4 deductions, the Night of Three Lights finale (with L3), the accusation aboard the schooner and the twist, with a closing line per kit.
- **Depends on:** S0, S1, A3, A6. L3 builds the board and the finale on the same rules.
- **Provides:**
  - `backend/content/secret/case.json`. Server only and never served, because it names the culprit. The data is already in place from the story round, with its format in `backend/content/README.md`; S3 builds the server code that reads it;
  - `backend/server/game/case.py`: find a card at a place, check a deduction, check an accusation. Coin costs are checked first, and a refusal changes nothing;
  - `POST /api/act {place, actionId, actionUid}` returning `{accepted, message, notes, actions}`, and `POST /api/case/accuse {suspect, actionUid}`;
  - `reveal_lines(profile, flags)`.
- **Acceptance:**
  - a crew of 4 finishes in about 2 hours in a timed playtest;
  - a solo player with three NPC partners finishes;
  - every intro-ending mix works: pytest proves that every mix of endings, with 1 to 4 players plus NPC partners, can solve on starting coins, including four identical endings;
  - pytest proves that one seat can never solve alone;
  - a wrong accusation is refused, changes nothing and shows the clearing deduction;
  - a repeated `actionUid` acts once, and a refused action costs nothing;
  - no file under `frontend/` reads `backend/content/secret/case.json`, and the built site contains no reveal line (checked by a test);
  - the timing program (`python3 -I backend/tools/simulate_case.py`) exits with 0 after any change to a minute, a window or a price.
- **Minimum version:** 8 cards with 12 routes (4 kit, 4 timed, 4 open), 4 deductions, the accusation, the reveal and closing lines, and the finale with three lights. Paid, share, world and log-reader routes come later.

### S4 NPC partners

- **Built by:** not reserved for anyone (Nils, 5 Nov, late evening). Claude and Codex build S4 as far as they can, and a teammate may join. Partners act on L3's board and finale, so whoever builds S4 agrees pinning and manning lights with whoever builds L3. The S-lane owner reviews the lines.
- **Milestone:** M2 · **Size:** M · **Tier:** core · **Can start now:** after A6 and the S0 partner spec.
- **Ships:** scripted errand runners (D013, decision 3). An empty seat holds an NPC partner with a kit the crew lacks. You order it to search a place, pin its card or man a light. An errand takes about 10 minutes on the case clock and ends with a scripted line. Partners count as crew, but they never pick card pairs or accuse. A friend can take over a partner's seat with the crew code (A6).
- **Depends on:** S0, A6, S3 (the card list), and L3 (pinning and manning lights).
- **Provides:** `backend/server/game/partners.py`; `backend/content/partners.json` (the 34 scripted lines are already there from the story round; orders and errand times are constants in code); `POST /api/crews/me/orders {seat, order, target, actionUid}`.
- **Acceptance:**
  - pytest: a partner never pairs cards or accuses; an impossible order is refused with a line and changes nothing; an errand finishes once, even if the request is repeated;
  - partners fill exactly the kits the crew lacks;
  - a solo run with three partners reaches the finale (with S3);
  - lines come only from the bank: no free text and no AI voice.
- **Minimum version:** one order that fetches a card and pins it (15 case minutes), `man_light`, the kit rule and the refusals busy, wrong kit, locked window and not ready, in about 25 tests. `allowPaid` stays off.

## Lane A: Accounts and Multiplayer (owner picked today)

### A1 Foundation (F0)

- **Status:** waves 1 and 2 are on `main`: wave 1 came in with the bootstrap merge `a0e501a`, wave 2 as `393f551`. Production is live and deploy check 2 passed: `/api/health` answers `{"status":"ok","version":"0.1.0","env":"production"}` and `/api/config` answers with all flags off, so Vercel Services with the Python backend works on the Hobby plan. Wave 2 brought the database aligned with D003 and D004 (starting balance 0, a `wallet_reasons` table, neutral captain names, explicit grants, `crews` and `crew_seats`), the keep-alive route `GET /api/keepalive`, and the ARCHITECTURE and INTERFACES docs. The Supabase project `great-plot-twist` (West EU, Ireland) exists, GitHub sign-in is on, and the foundation migration is applied. **Next:** the two-user test plan in [supabase/README.md](supabase/README.md) and the other deploy checks in [docs/SETUP.md](docs/SETUP.md) (step 5), as [docs/STATUS.md](docs/STATUS.md#right-now) tracks them. The A-lane teammates still get Developer access in the Supabase organization, to read. Then the A-lane owner takes over.
- **Milestone:** M0, go/no-go on Tue 10 · **Size:** L (the code exists; about S is left) · **Tier:** core · **Can start now:** yes.
- **Ships:** a deployed skeleton: `/api/health` and `/api/config` live (done on 5 Nov), GitHub sign-in proven, the wallet and the migration applied and tested.
- **Depends on:** Nils for the account steps. He has set up Vercel and its environment variables; he still confirms that Email sign-in is off in Supabase and that the function region is Dublin. The Supabase secret key goes from the dashboard straight into Vercel, never through chat or the repository.
- **Provides:**
  - `PlayerDep` (the signed-in player) and the error shape `{"error": {"code", "message"}}`;
  - `CachedSource` (cache, timeout and fallbacks) for every outside data source;
  - the wallet: `apply_transaction` in `backend/server/wallet.py` and the one database function behind it;
  - the tables `profiles`, `saves`, `wallets`, `wallet_reasons`, `wallet_transactions`, `crews` and `crew_seats`;
  - `GET /api/keepalive`, for one daily caller so the free Supabase project does not pause (a daily GitHub Actions workflow calls it, `.github/workflows/keepalive.yml`, Nils, 5 Nov; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive));
  - `vercel.json` with two Services.
- **Acceptance:**
  - `cd backend && uv run pytest` and `uv run ruff check .` are green (today on `main`: 232 passed, "All checks passed!"), and the SQL parse check passes;
  - the migration is applied once wave 2 is final, and the two-user test plan passes;
  - the five deploy checks pass, or have a recorded fallback, by Tue 10 (D010); check 2 has passed;
  - D002, D003, D004, D012 and D015 are written.
- **Minimum version:** health proven on production (done on 5 Nov) and sign-in proven on production; the full test plan by M1.

### A2 Sign-in, captain names and cloud progress

- **Milestone:** M1 · **Size:** M · **Tier:** core · **Can start now:** after A1.
- **Ships:** a "Sign in with GitHub" button; a generated captain name such as "Brave Puffin 17", with one re-roll; a "Saved" indicator; progress that resumes on a second device; a delete-my-data button.
- **Depends on:** A1.
- **Provides:**
  - `frontend/src/online/api.js` with `api.get` and `api.post`: adds the sign-in token and turns 401, 409 and 429 into messages;
  - `GET /api/me` returning `{captainName, coins, kit, place}`, `PUT /api/save {version, data}` and `DELETE /api/me`;
  - a `require_host` check for presenter routes;
  - `backend/content/names.json`, the word lists.
- **Acceptance:**
  - 401 without a token, and player A cannot read or write player B's data;
  - a stale save version gets 409;
  - names come only from the word lists, never from a GitHub login;
  - resume works in a second browser;
  - D006 is written. A new browser package (for example the Supabase client library) is agreed in the issue first.
- **Minimum version:** no re-roll and no delete button.

### A3 Referee and entry kits

- **Milestone:** M1 · **Size:** M · **Tier:** core · **Can start now:** after S1 and A2.
- **Ships:** "Keep your story". The browser uploads the Act 1 move log, the server replays it with the original Python engine, and the arrival card shows one of four kits: True Keeper, Witness, Informant or Stranger.
- **Depends on:** S1, A2.
- **Provides:**
  - `backend/server/game/referee.py` and `backend/content/entry_kits.json`;
  - `POST /api/intro/complete {actions[]}` returning `{ending, decision, readLog, kit}`;
  - the table `entry_profiles` (new migration);
  - kit coins through the wallet, with reason `kit_grant` and ref `kit`, so they are paid once.
- **Acceptance:**
  - all 8 end states map to the right kit;
  - forged logs are refused and store nothing: unknown ids, more than 300 actions, no ending reached;
  - a resubmission returns the stored profile and pays nothing;
  - it works on a preview deployment, which proves the backend can read the story content there.
- **Minimum version:** kits set the start place, the coins and one card route only.

### A4 Live presence

- **Status:** core since the late evening of 5 Nov 2026 (Nils: "the game needs to be a multiplayer game, so we need to see everyone live; push that up"). It moved up from the Later list. Its size and days are a proposal until the A4 spec.
- **Milestone:** M1, target the Fri 13 slice: two players see each other live · **Size:** M (proposal) · **Tier:** core · **Can start now:** the spec now; code after A2 and A6.
- **Ships:** you see the other captains who are in your crew or at your place, live: a small figure with a captain name and preset emotes, moving as they move. It runs free on Supabase Realtime, which the free Supabase plan includes, in small rooms: one private room for each crew and one room for each place. Positions are sent only while a player moves, at most 2 a second. Presence says who is here. The server pushes rule changes (a pin, a deduction, a lock) into the crew room. **The server stays the referee:** nothing in a room decides money, progress or a deduction.
- **Depends on:** A2 (sign-in, so a room knows who joins) and A6 (crews, so a crew room exists). Behind the flag `live_presence`.
- **Provides:** `frontend/src/online/presence.js`; the room names and message shapes, written in the A4 spec and in [docs/INTERFACES.md](docs/INTERFACES.md#7-realtime-budget) (another branch updates its realtime section).
- **Acceptance:** two browsers signed in as different players in one crew see each other move; a player in another crew or at another place does not appear; a moving player sends at most 2 position updates a second and a player who stands still sends none; a message in a room never changes a coin balance or a deduction; with the flag off the game runs with no Realtime connection. A place room holds at most N players. The A4 spec sets N with the arithmetic of [docs/INTERFACES.md](docs/INTERFACES.md#7-realtime-budget), including the limit of 20 presence messages a second.
- **Minimum version:** two players at one place see each other's position and captain name. Emotes and the pushes of rule changes into the crew room follow, the pushes together with L3.

### A6 Crews and seats

- **Milestone:** M1 · **Size:** M · **Tier:** core · **Can start now:** the spec now (the tables come with foundation wave 2); code after A2.
- **Ships:** start a crew and get a crew code. A crew has up to four seats, and each seat holds a player or an NPC partner (S4) with a kit. A friend joins with the code and takes an open seat, or a partner's seat.
- **Depends on:** A1 (the tables `crews` and `crew_seats`), A2.
- **Provides:** `POST /api/crews` (returns the code), `POST /api/crews/join {code}`, `GET /api/crews/me`; crew codes (a new column or table, by migration); credit per seat for every pin, bearing and accusation.
- **Acceptance:**
  - at most 4 seats, and one player never holds two seats in one crew;
  - a wrong code is refused and changes nothing, and guessing codes is rate limited;
  - joining takes an open seat first, then a partner's seat;
  - only crew members can read their crew, and only the server writes (the policy matrix is updated).
- **Minimum version:** start and join by code. No leaving and no kicking.

### A7 Lantern Duels

- **Milestone:** after M1, only if the cut rule passes · **Size:** M · **Tier:** should, 2nd · **Can start now:** no.
- **Ships:** turn-based duels between two players, five rounds, and the server decides every round. Optional equal play-coin stakes, paid to the winner. Preset emotes only.
- **Depends on:** A2, and the flag `arena`.
- **Provides:** `backend/server/game/duel.py`; the tables `duels` and `duel_moves` (new migration); `POST /api/duels`, `POST /api/duels/{id}/move` and `GET /api/duels/{id}`, polled, so a duel does not need Realtime (A4 uses it for presence, not for duels); the wallet reasons `arena_stake` and `arena_payout`, added by migration.
- **Acceptance:** a move out of turn is refused with no change; the server stores the result of every round; stakes are taken once and paid once (the ref is the duel id); a timed-out duel refunds both players; no free text.
- **Minimum version:** three rounds, no stakes.

## Lane L: Live Systems (owner picked today)

### L1 Live weather

- **Milestone:** M1, started in M0 · **Size:** S · **Tier:** core · **Can start now:** yes. Spec, saved answers and mapping tests first.
- **Ships:** real weather from a real coast (the Faroe Islands as the proposed default, Lisbon as an option; the default is open for the team kickoff) drives the clouds, rain, fog and wind through `setWeather`. A credit line for Open-Meteo shows on screen.
- **Depends on:** A1 (the adapter pattern, done) and G1 (`setWeather`, done).
- **Provides:**
  - `backend/server/adapters/weather.py`: Open-Meteo on `CachedSource`;
  - `backend/server/game/weather_map.py`: Open-Meteo values to `{cloudCover, rain, fog, wind}`, each 0 to 1;
  - `GET /api/weather?place=` returning `{cloudCover, rain, fog, wind, isDay, source, fetchedAt}`;
  - `frontend/src/online/weather.js`: calls the API, then `setWeather`, and emits `{type:'weather_updated', source, fetchedAt}` on the event bus;
  - later: a presenter override, labelled on screen.
- **Acceptance:**
  - pytest with saved Open-Meteo answers covers every weather-code group, with no network in tests;
  - a second call within 15 minutes comes from the cache;
  - the fallback order is the last good value, then the saved answer; demo mode uses only the saved answer;
  - Vitest: the hook passes the right values to `setWeather`, and keeps the current weather when the API fails.
- **Minimum version:** one place, no override.

### L2 Your home islet

- **Milestone:** M2 · **Size:** M · **Tier:** core · **Can start now:** after G2 and A2.
- **Ships:** your own islet, saved per account (decision 4 in the roadmap inputs: each player's own island and progress are saved). It has 4 plots, as G2 draws them (`plot_1` cabin, `plot_2` workshop, `plot_3` windmill that presses lamp oil, `plot_4` greenhouse), and a signal station of its own, which serves as a finale light. Every crew builds one for the finale (300 coins and 10 timber).
- **Depends on:** G2, A2.
- **Provides:** a `createPlace` module `islet`; `backend/content/buildings.json`; `backend/server/game/building.py`; `GET /api/islet`; `POST /api/islet/build {plot, type, actionUid}`; the event `{type:'plot_clicked', plot}`; the table `islets` (new migration); coins through the reason `building_purchase`.
- **Acceptance:**
  - out of range, occupied, unaffordable or unknown type: each is refused with no change;
  - the exact cost is charged once, even when the request is sent twice;
  - the islet looks the same after a reload in another browser.
- **Minimum version:** the signal station plus one other building.

### L3 Captain's Table board and Night of Three Lights

- **Milestone:** M2 · **Size:** L · **Tier:** core · **Can start now:** the spec and contract by Mon 9; code after A6 and the S3 card rules.
- **Ships:**
  - the Captain's Table: the crew's shared case board. Seats pin cards. A deduction lights up for the whole crew when its two cards are pinned by two different seats;
  - the case clock, and a player's call for nightfall after D1, so nobody waits for real fog (night never falls by itself);
  - the Night of Three Lights: three seats man three lights and drag gold beams onto the blinking light within a time window. Then the schooner appears and the accusation opens (S3);
  - the Relighting: the first solve in the world changes the shared chart for everyone. Later crews add their names and one more light. One server setting, the relight lock, keeps this switch locked until the game opens (decision 19);
  - rewards, once per player: coins, the title Relighter and a name on the Wall of Lights. Anything that names the culprit shows only to crews that solved it;
  - not in this package: a demo world with a presenter seed and reset script. There is no demo world for now; rehearsals use the `?demo=1` tour.
- **Depends on:** A6, and S3 (the card and deduction rules). G4 draws the finale.
- **Provides:** the tables `board_pins`, `finale_signals` and `world_state` (new migration); `GET /api/board`; `POST /api/board/pin {cardId, actionUid}`; `POST /api/finale/signal {light, bearing, actionUid}`; `GET /api/world`; rewards with the reasons `clue_reward` and `mystery_reward` and once-per-player refs; the relight lock (a server setting; the proposed name is `RELIGHT_OPEN`, off by default, added to `.env.example`); the event `{type:'finale', stage}`. The board is read with `GET /api/board`. With A4 the server also pushes rule changes into the crew room, and polling every few seconds stays as the fallback.
- **Acceptance:**
  - pinning twice changes nothing, and a deduction unlocks exactly when its two cards are pinned by two different seats;
  - one seat alone can never unlock a deduction or finish the finale;
  - a wrong bearing is refused with no change;
  - the Relighting happens once, and each reward is paid once per player;
  - a crew that has not solved the case never receives the culprit's reveal lines;
  - while the relight lock is on, an accepted accusation pays its rewards and plays the reveal, but the world stays dark.
- **Minimum version:** a list board, a finale with three lights, and rewards of coins plus the Wall of Lights. A finale with two lights needs Nils' OK, because it changes the answer to "why nobody solves it alone"; cut the cinematics first.

### L4 Island Exchange

- **Milestone:** M2 · **Size:** L · **Tier:** core (Nils, 5 Nov), minimum version first · **Can start now:** the data terms, the price rules and their tests, yes; the routes after A1.
- **Superseded in part (Nils, 5 Nov, late evening):** he answered the D017 questions. The multiplier, the price floor and the circuit breaker below, and the acceptance lines about them, are replaced by real prices with 10x leveraged positions, and by no floor, no ceiling and no pauses. D017 and this entry are reworked on the Exchange branch. Until then the lines below describe the code as built.
- **Ships:** fictional island companies whose prices follow real price moves, amplified, as Nils asked:
  - every real % move is multiplied by a setting from 20 to 100;
  - a price floor, and a circuit breaker that pauses trading after a 30% move;
  - a daily reset at the 08:00 open (the exchange closes at 22:00, as in docs/STORY.md); what the reset re-bases is open for the team kickoff;
  - play money only, labelled as a simulation, with a 2% fee on every buy and sell, and 1% after the Relighting (D017 and decision 17; the 1% needs L4 to read the world stage);
  - a Greyfathom share gives card C6 a slower route (docs/STORY.md).
- **Data feed (checked on 5 Nov):**
  - Seven instruments sit behind the companies: BTC, ETH, SOL, XRP, BNB, EURC (a euro stablecoin, our stand-in for EUR/USD) and PAXG (a gold token, our stand-in for gold). They trade around the clock, so they move during an 11:00 class. No free source gives European share prices that we may show in a public app.
  - Primary: the CoinGecko Demo API. A teammate creates the free account (no card; agents never sign up). Who does it is open for the team kickoff. The key lives only in the Vercel settings, as `MARKET_DATA_API_KEY`. One call returns all seven. Show "Powered by CoinGecko" next to the prices. Never commit recorded CoinGecko prices.
  - Budget: the Demo plan allows 100 calls a minute but only 10,000 a month, about 330 a day. A 60-second cache while the exchange is open (08:00 to 22:00) could need up to 840 calls a day for each running server. So refresh only when a request finds the cache expired, and use a cache of about 5 minutes, or let the backup fill the gaps. The spec shows the arithmetic.
  - Backup: Binance market data (`data-api.binance.vision`), no key. It can refuse requests from US addresses (HTTP 451). Our functions run in Dublin, but test from the deployed function.
  - Replay fallback: a trimmed file of 1-minute candles from Binance Vision. Its licence (CC BY-NC-SA 4.0) allows committing it, with the credit "Binance Vision" and the same licence on the file.
  - Vercel Cron cannot be used with our setup (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)), so no timer refreshes prices: they refresh when a request finds the cache expired.
  - Before building, read CoinGecko's API terms (sections 4.4, 6.1 and 6.2) on the live page. Whether amplified prices count as "derived data" there is not settled.
- **Depends on:** A1 (the wallet), A2.
- **Provides:** `backend/server/adapters/prices.py` (the three sources, in order); `backend/server/game/market.py`; `backend/content/companies.json`; `GET /api/market` (prices with `source` and `fetchedAt`); `POST /api/market/trade {company, side, quantity, orderId}`; the table `holdings` (new migration); the reasons `market_buy` and `market_sell`, added by migration; the flag `market`.
- **Acceptance:**
  - with 100 coins, buying 5 at 12.00 with a 2% fee leaves 38, because a wallet holds whole coins (D017);
  - the same replay gives the same prices, and tests use no network;
  - coins and holdings never go negative, and a repeated `orderId` trades once;
  - a move beyond 30% pauses trading, and no price falls below the floor;
  - the screen says which source is running: live, backup or replay.
- **Minimum version:** the replay only, three companies, buy and sell.

### L5 Prediction desk

- **Milestone:** after M1, only if the cut rule passes · **Size:** M · **Tier:** should, 3rd · **Can start now:** no.
- **Ships:** a desk at the prediction kiosk with hand-picked real questions. Players stake play coins, and the winners share the pool. No bookmaker odds.
- **Data (checked on 5 Nov):**
  - Primary: Manifold Markets. Reading needs no key. It allows 500 requests a minute per address, so call it from our server and cache. Manifold is itself a play-money site. Credit Manifold on the page.
  - Backup: Polymarket's Gamma API, no key. Use `/events/keyset`; the old `/events` list is deprecated.
  - Do not use Kalshi (its terms forbid caching and sharing the data) or Metaculus (it needs an account and hides the numbers).
  - A hand-picked allow-list of 20 to 40 questions lives in `backend/content/questions.json`. Never list questions automatically: user-made questions can be personal or in bad taste. No wars, deaths, shootings or elections. Weather questions such as "Fog tonight?" can settle from our own L1 data.
  - Settlement: once a question is resolved and a grace period of about 1 hour has passed, the YES or NO winners share the pool pro rata. CANCEL or any other result refunds everyone, and so does a pool with no winners.
- **Switch:** behind the flag `predictions`, which stays off until Nils is sure that play-money bets on real matches are fine for class (decision 18).
- **Depends on:** A1 (the wallet), A2. Shares `backend/server/game/pools.py` with L6; whoever builds first writes it.
- **Provides:** `backend/server/adapters/predictions.py`; `backend/server/game/pools.py`; `GET /api/predictions`; `POST /api/predictions/stake {questionId, side, amount, stakeId}`; the table `prediction_stakes` (new migration); the reasons `prediction_stake` and `prediction_payout`, added by migration; the flag `predictions`.
- **Acceptance:** a question not on the allow-list is refused; a stake is taken once; a payout is paid once (the ref includes the question id); CANCEL refunds; tests use saved answers, with no network.
- **Minimum version:** Manifold only, five questions, settled by a presenter button that uses the same rules.

### L6 Sports predictions: tonight's game

- **Milestone:** after M1, only if the cut rule passes · **Size:** M · **Tier:** should, 4th · **Can start now:** no.
- **Ships:** stake play coins on tonight's real game. The pool is shared among the players who picked the result. It settles only on the final result.
- **Data (checked on 5 Nov):**
  - Football primary: the football-data.org free plan. It has 12 competitions, among them the Primeira Liga, the Champions League and the Premier League, and allows 10 calls a minute. Scores arrive with a delay it does not state. A teammate registers (who is open for the team kickoff). Their terms forbid keys in open-source repositories, so the key lives only in the Vercel settings, as `SPORTS_API_KEY`. Show "Football data provided by the Football-Data.org API". Use team names as text, no crests.
  - Football backup: OpenLigaDB. No key, an open licence, and made for prediction games. Call it at most once per league every 30 to 60 seconds during live games, from our server only. Volunteers enter the data, so confirm a result with a second source before paying out. It has no Primeira Liga.
  - Basketball (NBA): balldontlie, with a free key and 5 calls a minute. A teammate creates the key (who is open for the team kickoff), and it lives only in the Vercel settings. Its games have a clear `final` status. The NBA plays almost every night, so it is the safest "last night's game" for a morning class.
  - Settle only on the final result (`FINISHED` or `final`). Refund when a game is postponed, cancelled or suspended. Stay with league games or 90-minute results, to avoid extra-time rules. The winners share the pool pro rata, and a pool with no winners refunds. A presenter can settle by hand with the same rules.
  - Vercel Cron cannot be used with our setup (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)), so no timer settles games for us: settle when someone opens their stakes after the game. For an 11:00 class, take stakes the evening before.
- **Switch:** behind the flag `sports`, which stays off until Nils is sure that play-money bets on real matches are fine for class (decision 18).
- **Depends on:** A1, A2, and `pools.py` from L5 (or written here).
- **Provides:** `backend/server/adapters/fixtures.py`; the tables `fixtures` and `sports_stakes` (new migration); `GET /api/sports`; `POST /api/sports/stake {fixtureId, pick, amount, stakeId}`; the reasons `sports_stake` and `sports_payout`, added by migration; the flag `sports`.
- **Acceptance:** settles only on a final result; refunds when a game is postponed or cancelled; splits the pool pro rata; pays once; shows the credit line; tests use no network.
- **Minimum version:** one league from OpenLigaDB, settled by a presenter button with the same rules.

**Play money only (L4 to L6 and A7).** Coins cannot be bought or cashed out, and there are no real prizes. Screens say "simulation, play money", and nothing links to a betting site. Supabase's acceptable use policy forbids facilitating unregulated gambling, and Portuguese law defines gambling around money. This is not legal advice: ask the teacher if unsure.

## Later

Not before submission, or only if everything above is green:

- A5 Phone deckhands and class raid: not needed, because the demo is highlights only (D013).
- Free sailing and salvage: "sail the real wind; salvage where it blows".
- Storm raids, boarding rounds, the Light Network, harbor orders and Elena's radio bulletin.
- Chapter 2, *The Unmarked Light*.
- Hints that cost coins, for solo players who get stuck.
- AI (language model) voices for partners or a companion: only with a capped server key and Nils' OK.
- Touch controls, Google sign-in, and continuous integration on GitHub Actions (only with Nils' OK).

## Weekly rhythm

- **Integration hour on Mon, Wed and Fri at 17:00:** everyone pulls `main`, runs both test suites and plays the deployed site. Bugs become issues.
- **Review pairs rotate weekly:** G with S and A with L in week 1, then G with A and S with L.
- **Status page:** every agent adds a log line to [docs/STATUS.md](docs/STATUS.md) and updates "Right now" and "Next steps" when it finishes a task.
- **Explain-back drills on Thu 19 and Sat 21,** using the course's six question types. Everyone explains one file from every other lane.
