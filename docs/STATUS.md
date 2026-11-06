# Status: The Great Plot Twist

> **What this file is:** the living status page. It says what works right now, what each lane does next (with agent briefs ready to paste), and what happened, in a dated log.
>
> **Who uses it:** all four teammates and every coding agent. Read it before you start a task. The plan is in [ROADMAP.md](../ROADMAP.md) and the story in [STORY.md](STORY.md).

**Rule for every agent.** When you finish a task:

1. add one line at the top of the [Log](#log) (newest first);
2. update [Right now](#right-now);
3. update [Next steps per lane](#next-steps-per-lane) for your lane.

Never write keys, tokens, passwords or student numbers in this file. If two pull requests both add log lines, keep both lines when you merge. Decision numbers (`D0xx`) and migration timestamps work the same way: take the next free one on `origin/main` when you open your pull request, and renumber yours at merge time if another merge took it first (the Exchange decision became D017 that way).

## Right now

*Last updated: Thu 5 Nov 2026, late evening, by Claude (coordinating for Nils).*

### What works

- **`main` is live** at https://the-great-plot-twist.vercel.app/, and Vercel deploys every push to `main` (two Vercel Services: `/api` goes to `backend/`, the rest to `frontend/`). Checked after the push of `d7857d9`: the game, `/ui-kit.html`, `/api/health`, `/api/config` (with the public sign-in settings) and `/api/weather` answer 200, and `/api/me` answers 401 without a token, as it should.
- **The browser game (`frontend/`):** original pixel art (D005); the Saltreach Isles world from G2 + G3 (Lighthouse Isle, the sea chart with sailing, Saltreach Harbor, the home islet, the case places); the pixel UI kit with its gallery `/ui-kit.html` (G4); 114 story-art additions; five skippable finale cinematics (rehearse them with `?demo=1`); the playable intro on Lighthouse Isle (S2) with the unchanged story engine, both endings and a local save; live weather from Open-Meteo drives the island (L1). Ids and contracts are in [frontend/GRAPHICS.md](../frontend/GRAPHICS.md). `npm test`: 143 passed; `npm run build`: built.
- **The Python API (`backend/`):** ten routes: `health`, `config`, `content/{name}`, `weather`, `me`, `auth/exchange` (temporary), `keepalive`, and the Island Exchange (`market`, `market/portfolio`, `market/trade`; trading sits behind the flag `market`, which is off). `uv run pytest`: 1487 passed; `uv run ruff check .`: All checks passed! Tests cannot reach the network (`backend/server/tests/conftest.py`).
- **The database:** the foundation migration is applied to Supabase (`great-plot-twist`, Ireland; remote version `20261106000000`, the same as the file): seven tables with row-level security, the grants in [supabase/README.md](../supabase/README.md), the wallet reasons and the sign-up trigger. The Island Exchange migration (`20261106010000`) is on `main` but **not applied**: it waits for Nils (review queue, item 1).
- **Sign-in:** GitHub sign-in through Supabase, checked with the page `/auth-check.html`. The two-account test is in the review queue.
- **Story, look and plan:** story skeleton v1 is approved ([STORY.md](STORY.md)); the original story is imported unchanged (S1, D007), with a Python and a browser engine that a parity test keeps equal; the look is decided (D005); [ROADMAP.md](../ROADMAP.md) v0.2 is written.

### In progress

| What | Who | Where |
|---|---|---|
| Experience layer (G5): title screen and menus, settings, original Web Audio sound, touch controls, the `?demo=1` highlights tour for the class demo, a faster first load | Codex, for Nils | `feat/g5-experience-layer` |
| S0 story detail round: Story v2 edits, the case file, NPC partners, the open world, a timing simulation; for Nils' approval | Claude, for Nils | `docs/story-detail` |
| Owners for lanes S, A and L | the team | kickoff |

### Blocked or waiting

- **The Island Exchange migration waits for Nils** (review queue, item 1). The code is on `main` with the flag `market` off, so nobody can trade. Until the migration is applied, `/api/market` answers `502 database_error` (no screen calls it yet). That answer also shows that Binance answered our Dublin function, because the board fetches prices before it reads the database.
- **Four of the five deploy checks passed; check 1 waits** ([SETUP.md](SETUP.md), step 5). Check 2 passed: `/api/health` answers on production. Check 1 needs a teammate's push. Check 3 passed on 5 Nov: the daily GitHub Actions keep-alive was green on its first manual run ([SETUP.md](SETUP.md#keep-it-awake-until-the-demo)). Check 4 passed on 5 Nov with two real players: 181 of 181 steps on the live database, read only, every write rolled back, nothing changed. Check 5 passed on 5 Nov: both of Nils' GitHub accounts signed in.
- **Nils confirms two settings:** that Email sign-in is switched off in Supabase, and that the function region is Dublin in the Vercel settings.

### Known gaps

- The first load is large: the game's main script is about 610 kB, and Vite warns about the chunk size. G5 splits it, so the first load is fast on classroom Wi-Fi.
- The README's "Project status" now points to the live site and this page. M3 adds the deployed URL, names, student numbers and commands.
- PR 1 (`docs/team-workflow`): its commits are inside `main` now, so GitHub should show it as merged. If it still shows as open, close it by hand.

### Open decisions

**Waiting for Nils: review queue** (newest first, as of the late evening of 5 Nov). Each item needs Nils to review, set, test, approve or decide. Nothing in this list is done until Nils says so.

1. **Decide on the Island Exchange (L4), now on `main` with the flag off.** First, approve applying its migration `20261106010000_island_exchange.sql` to Supabase. It only adds: three tables, two functions and three wallet reasons. An independent Opus review approved the database part, and the migration applies twice cleanly on a scratch Postgres 17. Then answer the seven questions in [D017](DECISIONS.md) (details there): (a) the multiplier for the class: your rule is 100, and the simulation suggests 20 to 30 (at 100, ETH was paused 45 of 90 minutes in a class-length slot, and crypto prices sit near the floor after a few days); keep 100 as the code default and set `MARKET_MULTIPLIER=25` on Vercel, or change the default; (b) the lowest and highest price, now 25 % and 400 % of the start price; (c) when Binance is away, show the last prices and pause trading, with `DEMO_MODE=true` as plan B (the recording now plays only in demo mode, because anyone could read it in advance); (d) trading on the public recording in demo mode: keep it or switch it off; (e) refuse a trade when the price moved more than a few percent since the player saw it (not built); (f) the two brakes: a trade uses prices at most 5 seconds old, and a player may trade 10 times in 30 seconds; (g) a pull back toward the start price at the daily re-base (not built, because players could predict it).
2. **Review the story detail round** (S0, branch `docs/story-detail`, arriving soon): Story v2 edits, the case file, NPC partners, the open world and a timing simulation.
3. **Done: the Supabase URLs are set and Email login is off** (Nils, 5 Nov). The sign-in round trip works.
4. **Done: the sign-in works with both of Nils' GitHub accounts** (5 Nov), so deploy checks 4 and 5 passed.
5. **Approve three changes from the backbone merge:** the temporary route `POST /api/auth/exchange`, the changed test that allows `sessionStorage` for the PKCE code verifier (in `backend/server/tests/test_me.py`), and the new PKCE line in the [safety checklist](ENGINEERING.md#6-safety-checklist).
6. **Done: a daily GitHub Actions workflow calls `/api/keepalive`** (Nils, 5 Nov). Nils set a new `CRON_SECRET` in Vercel and in GitHub, and the first manual run was green, so deploy check 3 passed ([SETUP.md](SETUP.md#keep-it-awake-until-the-demo)).
7. **Decide the default weather place.** Torshavn in the Faroe Islands is the default now, with Lisbon as the option. It is also item 7 on the kickoff list below.

Nobody has decided these yet. Until they are decided, the plan in [ROADMAP.md](../ROADMAP.md) stands as written.

**For Nils** (asked on the evening of 5 Nov):

1. **Decided: the Island Exchange is core** (Nils, 5 Nov). It ships its minimum version first; L2 and G3 ship their minimum versions.
2. **Decided: nobody needs the private solo repository** (Nils, 5 Nov). Claude imports the story for Nils (S1, merged as `589baea`).
3. **Decided and done: Codex's pixel pass is on `main`** (`45d2d46`).

**For the team kickoff** (the four teammates decide together):

1. **Who builds S4 (NPC partners)?** Proposal: the L-lane owner.
2. **The D008 grow order.** Proposal in ROADMAP.md: S3, L3 and S4 first, then L4, then G2 and G3, then L2, then A7, L5 and L6.
3. **Who creates the free data-API accounts** (CoinGecko Demo, football-data.org, balldontlie)? The keys live only in the Vercel settings, never in the repository, a file or chat.
4. **Demo format.** Live on a seeded demo world, or recorded? Does the demo show the twist?
5. **Seat takeover.** When a friend takes over an NPC partner's seat, does the seat keep the partner's kit, or take the friend's own kit?
6. **What the Exchange daily reset re-bases.** In plain words: what gets set back to its starting point each morning? D017, rule 4, proposes an answer.
7. **The default weather location.** Proposal: the Faroe Islands, with Lisbon as an option.

## Start here as a teammate

1. **Accept the GitHub invite** to `Nilsnova/The-Great-Plot-Twist` (Write access). Push your branches inside this repository. Never fork it, because Vercel holds pull requests from forks.
2. **Set your commit email** to the email that is verified on your own GitHub account. Vercel checks commit authors, and the course checks that every member contributed code from their own account.

   ```bash
   git config --global user.email "the-email-verified-on-your-github@example.com"
   ```

3. **Clone the repository.** `main` has everything built so far.

   ```bash
   git clone https://github.com/Nilsnova/The-Great-Plot-Twist.git
   cd The-Great-Plot-Twist
   ```

4. **Read** [README.md](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [AGENTS.md](../AGENTS.md) and [ROADMAP.md](../ROADMAP.md), in that order. Give your coding agent AGENTS.md and [ENGINEERING.md](ENGINEERING.md).
5. **Run the checks** from ENGINEERING.md, section 3. You need Node.js (22.12 or a newer 22, 24, or 26 and newer) and [uv](https://docs.astral.sh/uv/). Start in the repository root:

   ```bash
   cd frontend
   npm install
   npm test              # expect: 22 tests passed, 4 files
   npm run build         # expect: built (a chunk-size note is normal)
   cd ..
   cd backend
   uv sync
   uv run pytest         # expect: 232 passed (the number changes when wave 2 lands)
   uv run ruff check .   # expect: All checks passed!
   cd ..
   ```

   To play on your computer: `cd frontend`, `npm run dev`, open the address Vite prints and click **Step ashore**. The live site is at https://the-great-plot-twist.vercel.app/. To run the API: in the repository root run `cp .env.example .env` once (empty values are fine), then `cd backend` and `uv run --env-file ../.env uvicorn main:app --reload --port 8000`, and open `http://127.0.0.1:8000/api/health`.
6. **Pick a package.** Take your lane's next package below, or one from "Start today" in ROADMAP.md. Open an issue with the goal, acceptance checks, scope, responsible teammate and likely files. Create your branch from `main` (`git switch main`, `git pull`, then for example `git switch -c feat/l1-live-weather`). Paste the agent brief below and open a draft pull request early.

## Next steps per lane

Each lane has its next two packages, each with a brief. Fill in the `<...>` parts and paste the brief to your coding agent. The briefs follow the template in [ENGINEERING.md](ENGINEERING.md), section 8, and end with the handover format from [AGENTS.md](../AGENTS.md). What each package ships, provides and must pass is in [ROADMAP.md](../ROADMAP.md).

### G World and Graphics (Nils, with Codex)

**G8 complete on `feat/g8-islet-harbor-demo`.** Accepted islet builds, the opt-in Lisbon-time bulletin/tonight chip, safe distant signal, original harbor sound/life and the nine-beat presenter kit are ready. Accessibility fixes keep controls at 16 px, case body at 18 px and story/captions at 19/18 px. Provider/licence blocks are removed from gameplay; credits are reached only through Settings. The class walkthrough includes the architecture, ten-file reading path and twelve explain-back cards.

- **Verified:** 345 tests / 58 files; build/spoiler guard; all 31 combined commands, including 91 golden-path checks, 210 chaos checks and 23 accessibility contexts after the UI correction. Tour 170.6 seconds with APIs down; cold title 21,080 bytes. Eight captains/night storm: 60 FPS / 112 calls. Evidence and limits: `frontend/GRAPHICS.md`, `frontend/captures/20261106_G8-C3-after/`.
- **Next:** Claude integrates and mirrors schema-1 `bulletin`, `log.observations` and earned-only deduction clears. Main remains `8ff24cc`; real adapters/services and Claude-owned panels still need combined integration checks. Keep all attribution under Settings → Credits, with none in gameplay. Nils rehearses the documented VoiceOver/Safari/Firefox/physical-device script. The optional Exchange tour beat waits for a production-safe rehearsal.

### S Story and Mystery (owner picked today)

**Next 1: S0 Story detail round.** Can start now. Writing only.

```text
Goal:        Turn the approved story skeleton into a detailed case design we can build and
             test (package S0 in ROADMAP.md), so S1, S3, S4, A6 and L3 can start.
             Writing only, no code. Due on Mon 9.
Who:         Nils and <S-lane owner>, with <agent>. The humans decide; the agent drafts.
Read first:  AGENTS.md, CONTRIBUTING.md, docs/STORY.md (all of it), ROADMAP.md (S0, S1, S3, S4,
             A6, L3), docs/ENGINEERING.md (recipe 4.6, Add story content), and the original
             game's story.json (S1 copies it to backend/content/story.json; you do not
             need the private solo repository).
Scope:       You may change: docs/STORY.md (answer the items under "Next detail round" and
             "Questions for this round"), new specs/S3-the-light.md and
             specs/S4-npc-partners.md (copied from specs/_TEMPLATE.md), docs/STATUS.md.
             Do not touch: code, backend/content/ files (S1 and S3 write those), the skeleton text in
             sections 1 to 9, and the five approved decisions.
             Titles only: no new personal names; Elena stays the only named character.
             Plain English, short sentences, no em dashes.
Git:         Work on branch docs/story-detail from main. Commit and push only when I say so.
Done when:   1. The Story v2 change list quotes every new line, says where it goes and which
                test proves it.
             2. The case file has 8 cards (id, text, where found, cheap route for one kit,
                slower route for the others, cost or wait) and 4 deductions (cards, finding,
                who it clears), plus the clearing lines, the twist line and the four closing
                lines.
             3. The fairness and solvability rules are written as checks that S3 can test.
             4. The NPC partner orders, errand times and about 30 lines are written.
             5. A timed paper playtest with 4 people is logged (target: about 120 minutes for
                a crew of four, about 150 solo).
             6. The Relighting and reward rules name a wallet reason and a ref for each reward,
                so each is paid once per player (wave 2 adds clue_reward, mystery_reward and
                event_reward).
             7. Every place and company name has a name check (published games, real companies).
             8. Items owned by other packages are handed over by name.
             Nils approves the case file in the pull request.
Report:      Finish with: changed, verified (what you checked and how), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the S lane.
```

**In progress: S1 Import Plot Twist and Story v2** (Claude, for Nils, on `feat/s1-import-plot-twist`). The second pull request needs S0's change list.

```text
Goal:        Import the original Plot Twist (The Keeper's Last Log) into this repository as a
             copy, so its 11 tests run here (first pull request). Then apply the Story v2 edits
             from S0 (second pull request). Package S1 in ROADMAP.md.
Who:         <S-lane owner> with <agent>. Source: nilschristophlenke-hash/Plot-Twist, branch
             main at commit e235ee4. Claude imports it for Nils (Nils' decision: nobody
             needs the private solo repository). Never change the solo repository.
Read first:  AGENTS.md, CONTRIBUTING.md, docs/ENGINEERING.md (sections 1 and 5, recipe 4.6),
             ROADMAP.md (S1, S2, A3), docs/STORY.md (decision 2 and "Rules for changing the
             story"), backend/pyproject.toml, and in the source: README.md,
             plot_twist/engine.py, plot_twist/story.json, web/engine.js and tests/.
Scope:       Paths as built in the first pull request. The content location is decision D016
             (proposed).
               backend/plot_twist/              engine.py, __init__.py. The terminal game (cli.py)
                                                is not imported: it is not part of the web game.
               backend/plot_twist/tests/        test_acceptance.py, test_web_parity.py (the 11
                                                original tests), parity_runner.mjs (the Node.js
                                                runner) and the tests added at import
               frontend/src/story/              engine.js (web/engine.js as an ES module, rule
                                                for rule), its helpers and a README.md
               backend/content/story.json       plot_twist/story.json, unchanged
               backend/content/README.md        the content format and the provenance note
               backend/server/routes/content.py GET /api/content/intro-story, with its tests, and
                                                one include_router line in backend/server/app.py
               backend/pyproject.toml           add "plot_twist/tests" to testpaths
               backend/tools/lint_content.py    the content linter (second pull request)
             Allowed engine changes: read story.json from backend/content/, and a save_path=None
             option so the server never writes save files. The rules stay frozen.
             Do not touch: the rest of backend/server/, supabase/, frontend/src/world/. Do not
             import the old web interface (index.html, web/app.js, web/style.css); S2 builds a
             new one. No new dependencies unless I say so. No secrets.
Git:         First pull request on feat/s1-import-plot-twist, second on feat/s1-story-v2, both
             from main. Commit and push only when I say so.
Done when:   First pull request: cd backend && uv run pytest runs the 11 original tests plus
             the server tests, all green (paste the summary line); the parity test passes
             (Python and JavaScript agree); cd frontend && npm test and npm run build pass;
             GET /api/content/intro-story answers with the story (a test checks it);
             backend/content/README.md holds the provenance note (source repository, commit
             e235ee4, what changed) and the format; the D007 and D016 entries are in
             docs/DECISIONS.md.
             Second pull request (after S0's change list): every line from the change list is
             in backend/content/story.json, with one test per change (each ending line per decision,
             the read-log flag, "no decision" as a real third path, the planted hints); the
             linter rejects unknown items or flags and flags that are set but never used; the
             parity test still passes.
Watch out:   The story lives inside backend/ (D016), because the backend on Vercel may not see
             files outside it. Whether the deployed API finds backend/content/story.json is not
             checked yet: A3 checks it on a preview. Say in the pull request how engine.py finds
             the file (it uses the content folder next to the plot_twist package).
Method:      Move first, change second: the first commit copies the files unchanged, the next
             commits make the small edits, so a reviewer can see each change.
Report:      Finish with: changed, verified (exact commands and result lines), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the S lane.
```

### A Accounts and Multiplayer (owner picked today)

**Status (5 Nov, late evening):** foundation wave 2 is on `main`, and Claude applied its migration through the Supabase connection (remote version `20261106000000`). What is left of A1-next is the two-user test plan (deploy check 4) and the sign-in round trip on `/auth-check.html` (check 5, in Nils' review queue).

**Next 1: A1-next, apply and prove the foundation.** Starts once foundation wave 2 is on `main`. Production is already live, and deploy check 2 has passed.

```text
Goal:        Prove the foundation on the real services: the migration applied, the two-user
             test plan passed, the five deploy checks run, and the results written down
             (A1-next in ROADMAP.md).
Who:         <A-lane owner> with <agent>, together with Claude (for Nils) and Nils. The human
             does every dashboard step, and Nils confirms the login settings. Claude applies
             the migration through its own Supabase connection and runs the security advisor,
             so no teammate has to paste SQL for that step. The A-lane agent never sees or
             asks for keys, passwords or tokens, and never opens a dashboard. The A-lane
             owner gets Developer access in the Supabase organization, to read.
When:        Only after foundation wave 2 is on main, so the migration file is final.
             Production is already live, and deploy check 2 passed on 5 Nov.
Read first:  AGENTS.md, CONTRIBUTING.md, docs/SETUP.md (steps 2 to 5), supabase/README.md
             (all of it), specs/F0-foundation.md, docs/ENGINEERING.md (recipe 4.2 and
             section 6, Safety checklist), backend/server/routes/keepalive.py, vercel.json.
Scope:       You may change: docs/STATUS.md (the results), docs/DECISIONS.md (the D010 entry),
             and the "test" marks in docs/SETUP.md once a check is proven.
             Do not touch: code, the migration, vercel.json and any dashboard setting (the
             human does those). If a check fails, stop, write down the exact error without
             secrets, and open an issue.
Git:         Work on branch chore/a1-deploy-checks from main. Commit and push only when I say so.
Steps:       1. Agent: cd backend && uv sync && uv run pytest && uv run ruff check ., then the
                SQL parse command in docs/ENGINEERING.md, recipe 4.2, step 9. Paste the lines.
             2. Human (Nils): GitHub sign-in is on. Confirm that Email sign-in is off and that
                Anonymous sign-ins are off.
             3. Claude: apply the migration once through its Supabase connection, run the two
                quick checks from supabase/README.md and the Supabase security advisor, and
                paste the results (no keys). Agent: compare the output with the expected lines.
             4. Human and agent: the manual test plan in supabase/README.md with two test
                users. The agent prepares each SQL block with the two user ids filled in; the
                human (or Claude, through its connection) runs it and pastes the result. Mark
                each step pass or fail.
             5. The five deploy checks in docs/SETUP.md, step 5 (check 2 already passed on
                production on 5 Nov; repeat it on a preview): a teammate's push builds a
                Ready preview; /api/health answers on the preview; the daily keep-alive
                (Vercel Cron is out: a crons entry in vercel.json stopped our production
                deploys on 5 Nov, so never add one while we use Services; the daily caller
                is the GitHub Actions workflow keepalive.yml, so run it once by hand
                and do not touch vercel.json); the two test users each see only their own
                rows; a GitHub sign-in round trip ends signed in.
Done when:   every step is marked pass or fail with evidence (result lines, or screenshots
             without keys); every failure has an issue or a recorded fallback; the D010 entry
             (go or no-go) is in docs/DECISIONS.md; docs/STATUS.md shows the results.
Report:      Finish with: changed, verified (exact commands and result lines), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the A lane.
```

**Next 2: A2 Sign-in, captain names and cloud progress.** Starts after A1-next has passed.

```text
Goal:        Players sign in with GitHub, get a generated captain name, see "Saved", resume
             on a second device, and can delete their data (package A2 in ROADMAP.md).
Who:         <A-lane owner> with <agent>. Start after A1-next has passed.
Read first:  AGENTS.md, CONTRIBUTING.md, docs/ENGINEERING.md (sections 5 and 6, recipes 4.1
             and 4.2), ROADMAP.md (A2, A3, A6), specs/F0-foundation.md, supabase/README.md
             (profiles, saves, the policy matrix), docs/INTERFACES.md and docs/ARCHITECTURE.md
             (coming with the foundation update), backend/server/auth.py,
             backend/server/routes/health.py (the style to copy), backend/server/tests/helpers.py.
Scope:       You may change: new backend/server/routes/me.py and backend/server/names.py,
             backend/server/app.py (one include_router line), new tests in
             backend/server/tests/, backend/content/names.json (new word lists, no real people's
             names), new frontend/src/online/api.js, a sign-in button in frontend/src/ui/
             (agree the spot with the G lane), frontend/vite.config.js (the /api proxy from
             docs/ENGINEERING.md, section 3, if nobody has added it), a new migration only if
             a column is missing, docs/DECISIONS.md (the D006 entry).
             Do not touch: the wallet rules, the first migration, other lanes' files.
             A new browser package (for example the Supabase client library for sign-in)
             needs the team's OK in the issue first. No secrets: the browser gets only the
             publishable key, through VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
Contract:    GET /api/me returns {captainName, coins, kit, place}. PUT /api/save
             {version, data} answers 409 when the version is stale. DELETE /api/me removes the
             player's data. A require_host check guards presenter routes. The user id always
             comes from the verified sign-in (PlayerDep), never from the request body.
Git:         Work on branch feat/a2-sign-in from main. Commit and push only when I say so.
Done when:   Tests: 401 without a token; player A cannot read or write player B's data; a stale
             save version gets 409; names come only from backend/content/names.json, never from a
             GitHub login. cd backend && uv run pytest and uv run ruff check . pass, and
             cd frontend && npm test and npm run build pass (paste the lines). By hand: sign
             in, see the captain name and "Saved", then resume in a second browser
             (screenshots in the pull request).
             Minimum version first: no re-roll and no delete button.
Method:      Write the tests first and watch them fail. Thin routes, rules in plain functions,
             Pydantic models for what comes in and goes out, a header comment in every file.
Report:      Finish with: changed, verified (exact commands and result lines), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the A lane.
```

### L Live Systems (owner picked today)

**Status (5 Nov, late evening):** L1 live weather is done: merged (`3e80605`) and wired into the game by Codex (`c52613b`). The L4 Island Exchange minimum is on `main` with the flag `market` off (`d7857d9`, decision D017); its migration waits for Nils, and the trading screen comes after his Exchange decisions. Next for the lane: L3 (Next 2 below).

**Next 1: L1 Live weather.** The spec, the saved answers, the tests and the code can all start now, on a branch from `main`.

```text
Goal:        Real weather drives the game's weather. The server fetches Open-Meteo and maps
             it to the four setWeather values, and the browser applies them (package L1 in
             ROADMAP.md).
Who:         <L-lane owner> with <agent>.
Read first:  AGENTS.md, CONTRIBUTING.md, docs/ENGINEERING.md (recipes 4.4, 4.1 and 4.3,
             sections 5 and 6), ROADMAP.md (L1), backend/server/adapters/base.py,
             backend/server/adapters/example.py, backend/server/tests/test_adapters_example.py,
             backend/server/routes/health.py (the style to copy), frontend/GRAPHICS.md
             ("Coordinates and story contracts", setWeather), frontend/src/world/weather.js,
             frontend/src/core/events.js.
First:       Check Open-Meteo's terms (free use, credit line, limits) and write them in the
             spec, specs/L1-live-weather.md. Save one real answer per weather group once, as
             test data, with no keys or personal data in it. Which place is the default is
             open for the team kickoff (the roadmap proposes the Faroe Islands, with Lisbon
             as an option).
Scope:       You may change: new backend/server/adapters/weather.py, new
             backend/server/game/__init__.py and backend/server/game/weather_map.py, new
             backend/server/routes/weather.py, backend/server/app.py (one include_router
             line), new tests in backend/server/tests/ (with the saved answers), new
             frontend/src/online/weather.js and frontend/tests/weather.test.js,
             frontend/src/main.js (one line that starts the hook), frontend/GRAPHICS.md (the
             new event), frontend/vite.config.js (the /api proxy from docs/ENGINEERING.md,
             section 3, if nobody has added it; tell the G lane).
             Do not touch: frontend/src/world/ (only call setWeather), supabase/, the wallet,
             other routes. No new dependencies (httpx is already there). No secrets.
Contract:    GET /api/weather?place=<faroe|lisbon> returns {cloudCover, rain, fog, wind, isDay,
             source, fetchedAt}. Each of the four values is 0 to 1. An unknown place answers
             422. The browser calls setWeather({cloudCover, rain, fog, wind}) and emits
             {type:'weather_updated', source, fetchedAt} on the event bus; write that event in
             frontend/GRAPHICS.md first. Credit Open-Meteo on screen as its terms ask, in a
             spot agreed with the G lane.
Git:         Work on branch feat/l1-live-weather from main. Commit and push only when I say so.
Done when:   pytest with the saved answers covers every weather-code group (clear, cloudy,
             fog, drizzle, rain, snow, showers, thunderstorm); a second call within 15 minutes
             comes from the cache; when the fetch fails you get the last good value, then the
             saved answer; DEMO_MODE=true uses only the saved answer; no test uses the network.
             Vitest: the hook passes the mapped values to setWeather and keeps the current
             weather when the API fails. cd backend && uv run pytest and uv run ruff check .,
             cd frontend && npm test and npm run build all pass (paste the lines). A screenshot
             shows live weather and the credit.
             Minimum version first: one place, no override.
Method:      Write the tests first and watch them fail. Copy example.py. Keep Open-Meteo's
             field names inside the adapter. Give every number a name (for example
             RAIN_FULL_MM_PER_HOUR).
Report:      Finish with: changed, verified (exact commands and result lines), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the L lane.
```

**Next 2: L3 spec for the Captain's Table and the Night of Three Lights.** Due for the contracts review on Mon 9. Code comes later, after A6 and the S3 card rules.

```text
Goal:        Write the spec and the contracts for the Captain's Table board and the Night of
             Three Lights (package L3 in ROADMAP.md) for the contracts review on Mon 9.
             The code comes later, test first, after A6 and the S3 card rules.
Who:         <L-lane owner> with <agent>. Review it with the S-lane owner (S0) and the A-lane
             owner (A6).
Read first:  AGENTS.md, CONTRIBUTING.md, docs/STORY.md (sections 4, 5 and 7, the decisions,
             and items 4, 7 and 10 of the detail round), ROADMAP.md (L3, S3, S4, A6, G4),
             docs/ENGINEERING.md (recipes 4.1, 4.2 and 4.3, section 7, Performance budgets),
             supabase/README.md (crews, crew_seats, the policy matrix),
             backend/server/wallet.py (the reasons), docs/INTERFACES.md (coming with the
             foundation update).
Scope:       You may change: new specs/L3-board-and-finale.md (from specs/_TEMPLATE.md), the
             L3 lines in docs/INTERFACES.md once it exists, docs/STATUS.md.
             Do not touch: code and migrations in this step.
The spec says:
             - the board: a seat pins a card once (a repeat changes nothing); a deduction
               lights up when its two cards are pinned by two different seats; the board polls
               every few seconds (no Realtime; at most 2 updates per second per player);
             - the case clock, and the crew's call for nightfall after D1;
             - the finale: three seats at three lights within a time window, with a bearing
               tolerance; one seat alone is always refused;
             - the Relighting: it happens once for the world; later crews add names and one
               more light;
             - rewards once per player: the wallet reason and the ref for each reward;
             - the spoiler rule: the server sends reveal lines only to crews that solved;
             - the tables (board_pins, finale_signals, world_state) with the rights of the
               three actors, following recipe 4.2;
             - every route with its input, answer and errors; the event {type:'finale', stage}
               for G4; presenter routes behind require_host (403 for players);
             - the minimum version: a list board, two lights, coins and the Wall of Lights.
Git:         Work on branch docs/l3-board-finale-spec from main. Commit and push only when I
             say so.
Done when:   the spec follows specs/_TEMPLATE.md, lists the tests to write first, and the S, A
             and G lane owners have reviewed it by Mon 9.
Report:      Finish with: changed, verified, not verified, remaining, branch/PR. Then add one
             line at the top of the Log in docs/STATUS.md and update "Right now" and
             "Next steps" for the L lane.
```

## Log

- **2026-11-06, G8 UI correction.** At Nils’s request, Codex removed provider/licence blocks from the gameplay HUD and bulletin and moved the Credits entry under Settings, preserving the return path to title/pause. Weather values and events are unchanged. 345 tests, build/spoiler guard and nine focused browser checks pass, including 23 accessibility contexts; cold title is 21,080 bytes. Evidence: `frontend/captures/20261106_G8-Credit-Placement/`.

- **2026-11-06, G8 checkpoint 3.** Codex for Nils completed the combined regression, phone/keyboard/contrast fixes, visible-time presenter/cinematic lifecycle and class walkthrough on `feat/g8-islet-harbor-demo`, against main `8ff24cc`. All 31 commands pass: 345 tests, build/spoiler/CSP, 91 golden-path checks, 210 chaos checks and 22 accessibility contexts; the offline tour runs in 170.6 seconds and cold title is 21,052 bytes. Claude-owned panels/live services and physical screen-reader/device checks remain integration/manual work; contracts and evidence are in `frontend/GRAPHICS.md`.

- **2026-11-06, G8 checkpoint 2.** Codex for Nils added the supplied safe Chapter 2 signal/notice/log view, original harbor audio/life and the 170-second presenter kit with keyboard controls, notes, recording and performance overlay on `feat/g8-islet-harbor-demo`; main remains `8ff24cc`. 330 tests, build and six targeted browser commands pass; presenter 60 FPS/17.5 ms p95/107 calls, cold title 21,060 bytes. Full combined regression, accessibility and class documentation continue in checkpoint 3.

- **2026-11-06, G8 checkpoint 1.** Codex for Nils added persistent event-driven islet scenery, original signal/plot/sign art, the finale/chart station marker, and the opt-in Lisbon-time harbor bulletin/tonight chip on `feat/g8-islet-harbor-demo`, after merging main `8ff24cc`. 316 tests, build and seven targeted browser checks pass; islet 60–61 FPS/41–44 calls, cold title 21,061 bytes. Real panels/services still await Claude’s merge; checkpoint 2 continues.

- **2026-11-06, G8 checkpoint 0.** Codex for Nils strengthened the production spoiler guard (including elimination data), reduced the public build surface, verified strict CSP on five pages and kept ending notes inside their cards on `feat/g8-islet-harbor-demo`. 292 tests, three build variants, production tour, loading, case, golden and chaos checks pass; cold title 21,026 bytes. Checkpoint 1 continues after merging main.

- **2026-11-06, G7 checkpoint 3 complete.** Codex for Nils finished Gull’s Rest, full-case/chaos checks, larger text and lifecycle/paid-consent polish on `feat/g7-living-world`. 284 tests, build/91-file spoiler guard and all 24 verification commands pass; 83 golden-path milestones and 96 fault cases/202 assertions; cold title 21,080 bytes, eight captains with storm 60 FPS/111 calls. Ready for Claude’s real-adapter integration; no merge or deploy.

- **2026-11-06, G7 checkpoint 2.** Codex for Nils added adapter-supplied rewards/ledger/keepsakes, partner actors/status/paid consent/takeover rehearsal, Captain’s Log/hints/What next, larger phone text and cancellable shortcuts on `feat/g7-living-world`. Vitest, build/spoiler guard and new-screen browser checks pass; crew scene 61 FPS/53 calls/one root. Full-game/chaos and final regression continue in checkpoint 3.

- **2026-11-05, G7 checkpoint 1.** Codex for Nils shipped adapter conformance/fixtures, live-captain interpolation/cap/emotes, account/save presentation and larger readable text on `feat/g7-living-world`; Vitest, build/spoiler guard, 17 live/account, 26 experience and 18 loading checks pass. Eight others: 60 FPS/105 calls; cold title 20,988 bytes. Local fake only; Claude supplies the real adapter.

- **2026-11-05, G7 checkpoint 0.** Codex for Nils added the editable four-member credits list (Nils plus three teammate-owned placeholders), Binance live/replay and licence credits on `feat/g7-living-world`. 195 tests, build/spoiler guard and 11 desktop/phone credits browser assertions pass. No adapter changes; this checkpoint is pushed alone for teammates' first contributions.

Newest first. One line per finished task: date, who, what, where.

- **2026-11-05, end of day.** Claude, for Nils: A2 and A3 (captain names, cloud saves, delete my data, host check, the browser API client, the referee and entry kits) and A6 (crews and seats) are built and reviewed, and pushed as branches `feat/a2-a3-signin-referee` and `feat/a6-crews`; they merge first on Fri 6 after a check of their database changes against the live database. Still building: A4 live multiplayer, the story round finalize, the case backend spec, L2 home islet, the open-world must items, the Exchange v2 rework with its screen and the content linter, L5 prediction desk, A7 Lantern Duels, a security audit, the stock-API choice, and Codex's G7.
- **2026-11-05, night.** Claude, for Nils: deploy checks 4 and 5 passed. Two real players (both of Nils' GitHub accounts) each see only their own wallet, coin ledger, save and crew; every player and anon write is refused; the server-only functions are refused (181 of 181 steps on the live database, read only, every write rolled back, nothing changed). Story v2 is merged (`3d59b6a`). Nils answered the Island Exchange questions: real prices for crypto and stocks, 10x positions both ways that close at zero, no floor, ceiling or pauses (the rework is building).
- **2026-11-05, late evening.** Claude, for Nils: merged Codex's G6 case on screen (arrival and crew screens, the board, card searches, partner errands, the three-light night, the accusation and the reveal player, the Relighting coast, all on a local stand-in adapter; 194 frontend tests and the build with its spoiler guard pass). Nils' sign-in on `/auth-check.html` worked for one GitHub account (the second did not reach the project; one more try in a private window), and Email login is off. Deploy check 4 ran on the live database (read only, every write rolled back): no player could read another player's wallet, ledger, save or crew, and every player write was refused; it is rerun with the real second account.
- **2026-11-05, late evening.** Claude, for Nils: merged Codex's G5 experience layer (`3ca7d38`: title screen and menus, settings, original Web Audio, touch and gamepad, the 153-second `?demo=1` highlights tour and lazy loading; the main game script fell from 611 to 393 kB; 162 frontend tests and the build pass). Nils decided four things: the keep-alive caller is a daily GitHub Actions workflow (`.github/workflows/keepalive.yml`, added here; Nils set the secret and the first manual run was green, so deploy check 3 passed); Claude may apply database migrations that passed an Opus review and all tests, and reports each one (the Exchange migration still waits for his Exchange answers); no demo world for now; and live multiplayer (A4, Supabase Realtime) is core. Email sign-in stays off, because Supabase's built-in sender reaches only the project's own team.
- **2026-11-05, evening.** Codex for Nils completed G6 on `feat/g6-case-on-screen`: adapter-driven crew/arrival, board/search/partner/night/accusation/reveal/Relighting screens, three original sprites, readable phone layouts and a spoiler-free local tour. 194 tests, build/spoiler guard, all existing browser checks and 35 case checks pass; the API-down tour takes 168.3 seconds and all 195 PNGs regenerate identically. Contracts and evidence are in `frontend/GRAPHICS.md`; Claude connects real services and integrates, with no backend changes, main merge or manual deployment.
- **2026-11-05, evening.** Codex for Nils completed G5 on `feat/g5-experience-layer`: pixel shell/credits, persisted settings, original Web Audio, touch/gamepad controls, 375 px layouts, a 153.5-second API-independent highlights tour and lazy loading. 162 tests, build and all browser checks pass; 192 PNGs regenerate identically. Handoff, performance numbers and limits are in `frontend/GRAPHICS.md`; Claude integrates, with no backend/infrastructure changes or main merge.

- **2026-11-05, late evening.** Claude, for Nils: merged Codex's G4 and S2 work (`c52613b`: the pixel UI kit and `/ui-kit.html`, 114 story-art additions, five finale cinematics with `?demo=1` rehearsals, the playable intro, live weather wired into the island) and replaced the two tests that still required the removed cron entry with a guard that `vercel.json` has none (`acdd341`). Merged `docs/cron-finding` (`9ec2fad`) and the L4 Island Exchange minimum (`d7857d9`): its decision is D017, because `main` already used D016; the flag `market` stays off, and its migration is not applied (review queue, item 1). While merging, three Exchange tests quietly fetched real Binance prices, because a merged parameter of `create_app` had moved; the optional services of `create_app` are now keyword-only, and the tests refuse every network connection. Cleaned up the last code comments and docs that said Vercel's cron calls the keep-alive. Main: 1487 backend and 143 frontend tests pass, and production picked up `d7857d9`. Codex builds the experience layer (G5) on `feat/g5-experience-layer`.
- **2026-11-05.** Codex, for Nils: completed the pixel UI kit/gallery, 114 original story-art additions, five skippable G4 cinematic beats, S2 against the unchanged S1 engine (both endings, inventory and replayable moves), and L1 weather startup/credit on `feat/g4-ui-kit-story-art`; 143 unit tests, build, real-API intro and all graphics/browser/art checks pass; active 60 FPS and stable resources after ten round trips. Contracts, 191-PNG asset register and captures are in `frontend/`. Ready for Claude to integrate; no own backend/auth/economy/board changes or main merge.
- **2026-11-05, evening.** Claude, for Nils: found why production stopped updating, and aligned the Supabase migration history. (1) Production stayed on `589baea` (the S1 merge) and did not pick up the next two merges, `3e80605` (L1 live weather) and `c8bac2b` (the backbone check, which added a `crons` entry for `/api/keepalive` to `vercel.json`). Commit `409316e` took the entry out, and the next production deploy went live within about 8 minutes: `/api/weather` answers 200, `/api/me` answers 401 without a token (correct) and `/auth-check.html` answers 200. So a `crons` entry in `vercel.json` together with Vercel Services breaks the deploy on our Hobby project. The failed deploy is not visible from outside, because Vercel keeps serving the last good deploy. Never add `crons` back while we use Services. The route `GET /api/keepalive` stays, with `CRON_SECRET`. What calls it once a day is an open decision for Nils (see Open decisions); until then we rely on team activity and a manual check of the Supabase project the day before the demo. (2) The remote migration history now matches the file: the remote version is `20261106000000` (name `foundation`), where it had been recorded as `20261105170942`, so the Supabase CLI and the file agree. The docs were fixed to match, on `docs/cron-finding`: ARCHITECTURE, SETUP, INTERFACES, ENGINEERING, this page, the F0 spec and the docstring of `routes/keepalive.py`.
- **2026-11-05, evening.** Claude, for Nils: the foundation migration is applied to the Supabase project (`great-plot-twist`, Ireland; recorded remotely as version `20261106000000`, name `foundation`, the same as the file; see the entry above) and verified by query: 7 tables, row-level security on all, grants and function rights exactly as in [supabase/README.md](../supabase/README.md), 8 wallet reasons, the sign-up trigger. Security advisor: one warning on Supabase's own `rls_auto_enable()` (low risk; optional follow-up revoke) and the intended `is_crew_member()` for signed-in players. Merged the backbone check: `GET /api/me` (own profile, coins and crews only), `/api/config` with the public auth settings, `POST /api/auth/exchange` (temporary PKCE code exchange for the check page), the check page `/auth-check.html` (PKCE sign-in; tokens never in the browser history) and a daily keep-alive cron entry in `vercel.json` (taken out again later, see the entry above). Main: 802 backend and 130 frontend tests pass, build OK. Waiting for Nils (review queue): the Supabase redirect URLs for the live site, the two-account sign-in test, and OK for the temporary exchange route, the PKCE test change and the new PKCE checklist line (now listed under Open decisions).
- **2026-11-05, evening.** Claude, for Nils: merged L1 live weather: `GET /api/weather` (Open-Meteo, one cached call per 10 minutes, a recorded real answer as the fallback, demo mode never calls out, all 29 WMO codes mapped to cloudCover, rain, fog and wind; default place Torshavn, Faroe Islands, an open question for Mon 9) and `startLiveWeather` in `frontend/src/net/weather.js`, not yet wired into `main.js` (Codex wires it with the one line in INTERFACES.md). Credit: Weather data by Open-Meteo.com, adapted for the game (CC BY 4.0).
- **2026-11-05, evening.** Claude, for Nils: merged G2 + G3 from Codex (`60bd60e`: world manager, sea chart and sailing, Saltreach Harbor, home islet, case places) and S1 (the Plot Twist story engine: the original story unchanged in `backend/content/story.json`, the Python and the ES-module engines, the 11 original tests plus engine-rule tests, a parity test that replays the same moves through both engines, and `GET /api/content/{name}`; decisions D007 and D016). Main after the merge: 387 backend tests and 62 frontend tests pass, build OK. Codex now builds the UI kit, story art and finale visuals on `feat/g4-ui-kit-story-art`; Claude builds the backbone check, L1 weather and the L4 Exchange core on their own branches.

- **2026-11-05.** Codex, for Nils: built G2/G3 Saltreach Isles, four home plots and case-place visuals on `feat/g2-world-places`; 68 original sprites + 9 backgrounds/charts, exact place/hotspot/light events, readable UI, 36 unit tests and real-browser/build/art checks pass; ten round trips retain 96 geometries/27 textures/one place root at 60 FPS. Contracts, asset sources and screenshots are in `frontend/`. Ready for Claude to integrate; no backend/story logic or main merge.

- **2026-11-05, evening.** Claude, for Nils: merged Codex's final pixel pass (`45d2d46`; 27 frontend and 232 backend tests pass, build OK) and these team documents (`c9e710a`) into `main`. Nils decided: the Island Exchange is core (minimum version first; L2 and G3 minimum); the team brings the original story into this repo itself (S1, Claude for Nils, `feat/s1-import-plot-twist`); Codex builds G2 + G3 on `feat/g2-world-places`. Still in progress: foundation wave 2 (`chore/foundation`) and the S0 story detail round (`docs/story-detail`).

- **2026-11-05, evening.** Claude, for Nils: updated ROADMAP.md, docs/STORY.md, this page and the README for the live `main`: the merge order, the pixel-art look (D005), D012 "Crews and seats", D015, the Supabase connection, a new "Open decisions" list and a new README "Project status". They are on `main` (`c9e710a`).
- **2026-11-05, evening.** Claude, for Nils: connected Supabase. The project `great-plot-twist` (West EU, Ireland) exists, GitHub sign-in is on, and Claude's Supabase connection has access, so Claude applies the migration and no teammate needs an invite or SQL pasting for that. The migration is not applied yet: it waits for foundation wave 2. Email sign-in should be switched off (Nils to confirm). The A-lane teammates still get Developer access in the Supabase organization, to read.
- **2026-11-05, evening.** Codex, for Nils: the pixel work so far is committed on `feat/graphics-foundation` (`69523a4` the pixel kit and terrain, `479cd8d` the switch to the approved pixel presentation, `6f0ecfa` the note that records Nils' approval in `frontend/ASSETS.md`). The branch merged `main` in `cc7174d` and keeps the `frontend/` layout. Codex is still finishing, and some work is not committed yet. G1 finish merges the branch when Codex reports done and Nils agrees.
- **2026-11-05, evening.** Nils approved the pixel-art gameplay presentation. D005 is decided: top-down original pixel art. Codex recorded the approval in `frontend/ASSETS.md` on `feat/graphics-foundation` (commit `6f0ecfa`) and switched the game to it (commit `479cd8d`, "switch Lighthouse Isle to the approved pixel presentation"): 36 original sprites drawn by code plus a baked terrain backdrop, 16 native pixels per world unit, nearest-neighbour scaling. The painted-paper and nautical-journal studies are superseded iteration material.
- **2026-11-05, evening.** Claude, for Nils: checked production. https://the-great-plot-twist.vercel.app/ answers 200 with the game (title "The Great Plot Twist · Lighthouse Isle"), `/api/health` answers `{"status":"ok","version":"0.1.0","env":"production"}` and `/api/config` answers with all flags off. Deploy check 2 passed, and Vercel Services with the Python backend works on the Hobby plan. The other four deploy checks have not run. Vercel is set up: the Hobby team "The Great Plot Twist" is connected to the Nilsnova GitHub account, the project is `the-great-plot-twist`, Nils set the environment variables, and the function region should be Dublin (Nils confirms it in the Settings).
- **2026-11-05, evening.** Claude, for Nils: merged `feat/live-skeleton` into `main` (merge commit `a0e501a`, "Merge the bootstrap: team workflow, foundation (F0 wave 1) and graphics snapshot"). This was a one-time bootstrap exception to the peer-review rule, made under Nils' standing authorization (push and merge without asking; ask only for important decisions) so the team can start from a working `main`. D015 records the rule: owner-authorized merges by Claude cover coordination work, and teammates' changes keep peer review. Nobody needs `feat/live-skeleton` any more.
- **2026-11-05, evening.** Claude, for Nils: wrote ROADMAP.md v0.2, docs/STORY.md and this status page, and added four rows to the README's "Start here" table. Checked both test suites on a copy of `d5d6f80` (frontend 22 passed, backend 232 passed, ruff clean). On `feat/live-skeleton`.
- **2026-11-05, evening.** Nils approved story skeleton v1, "The Light That Shouldn't Be", with five decisions. Decision 4 changed: the class demo is very short and shows highlights only. Recorded in docs/STORY.md; D013 follows with S0.
- **2026-11-05, afternoon.** Claude, for Nils: started foundation wave 2 (migration aligned with D003 and D004, keep-alive route, docs for the `frontend/` and `backend/` layout). On `chore/foundation`, not pushed yet.
- **2026-11-05, afternoon.** Codex, for Nils: saved the paper scene studies before the final visual pass (`b4f2568`); the pass moves toward a pixel-art direction. On `feat/graphics-foundation`.
- **2026-11-05, afternoon.** Claude, for Nils: merged the graphics snapshot (G1 at `9f6a64a`) into the live skeleton (`d201c95`) and moved the game into `frontend/` (`d5d6f80`). On `feat/live-skeleton`, pushed.
- **2026-11-05, afternoon.** Claude, for Nils: foundation wave 1 (Python tooling, API skeleton, sign-in check, outside-data pattern, wallet, first migration, engineering rules, setup guide, F0 spec, Vercel Services routing), merged into the live skeleton. On `chore/foundation` at `bea3060`, pushed.
- **2026-11-05, afternoon.** Nils with Codex: graphics foundation G1, an illustrated island to explore, 108 original drawings, an art workshop, 22 tests. On `feat/graphics-foundation` at `9f6a64a`.
- **2026-11-05.** Nils: set up the accounts. Vercel (Hobby; the function region should be Dublin, to confirm in the Settings), Supabase (project in Ireland), GitHub sign-in switched on.
- **2026-11-05.** Claude, for Nils: checked the live data sources for the Exchange, the prediction desk and sports. Summary in ROADMAP.md, packages L4 to L6.
- **2026-11-05, midday.** Nils (as Nilsnova): opened the team workflow pull request, PR 1 (`docs/team-workflow`): CONTRIBUTING.md, AGENTS.md, the pull request template and decision D001.
