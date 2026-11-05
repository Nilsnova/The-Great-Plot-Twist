# Status: The Great Plot Twist

> **What this file is:** the living status page. It says what works right now, what each lane does next (with agent briefs ready to paste), and what happened, in a dated log.
>
> **Who uses it:** all four teammates and every coding agent. Read it before you start a task. The plan is in [ROADMAP.md](../ROADMAP.md) and the story in [STORY.md](STORY.md).

**Rule for every agent.** When you finish a task:

1. add one line at the top of the [Log](#log) (newest first);
2. update [Right now](#right-now);
3. update [Next steps per lane](#next-steps-per-lane) for your lane.

Never write keys, tokens, passwords or student numbers in this file. If two pull requests both add log lines, keep both lines when you merge.

## Right now

*Last updated: Thu 5 Nov 2026, evening, by Claude (coordinating for Nils).*

### What works

- **`main` is live.** The bootstrap merge (`a0e501a`, 5 Nov) put everything built so far on `main`: the team workflow docs, foundation wave 1, the graphics snapshot in `frontend/`, and `vercel.json` with two Vercel Services (`/api` goes to `backend/`, the rest to `frontend/`). Production works at https://the-great-plot-twist.vercel.app/: the page answers 200 with the game (title "The Great Plot Twist · Lighthouse Isle"), `/api/health` answers `{"status":"ok","version":"0.1.0","env":"production"}`, and `/api/config` answers with all flags off. So Vercel Services with the Python backend works on the Hobby plan (deploy check 2 passed).
- **The browser game (`frontend/`):** the pixel-art lighthouse island (D005, Codex's final pass, merged as `45d2d46`), a walking explorer, the four story zones (`cottage`, `desk`, `shore`, `tower_door`), day and night, weather states, and settings. `npm test`: 27 tests in 5 files passed; `npm run build`: built. (Checked by Claude on 5 Nov on `main` at `45d2d46`.)
- **The Python API (`backend/`):** `GET /api/health`, `GET /api/config`, the sign-in check, the wallet rules, the pattern for outside data and the first migration. `uv run pytest`: 232 passed. `uv run ruff check .`: All checks passed! (Same check, same copy.)
- **Accounts are ready.** Vercel: the Hobby team "The Great Plot Twist" is connected to the Nilsnova GitHub account, the project is `the-great-plot-twist`, Nils set the environment variables, and the function region should be Dublin (Nils confirms it in the Settings). Supabase: the project `great-plot-twist` (West EU, Ireland) exists, GitHub sign-in is on, and Claude's Supabase connection can reach it, so Claude applies the migration and no teammate has to be invited or paste SQL for that. Email sign-in should be off (Nils confirms). The A-lane teammates still get Developer access in the Supabase organization, to read.
- **Story, look and plan:** story skeleton v1 is approved ([STORY.md](STORY.md)), the look is decided (D005: original top-down pixel art), and [ROADMAP.md](../ROADMAP.md) v0.2 is written.

### In progress

| What | Who | Where |
|---|---|---|
| G2 + G3: the Saltreach Isles world (place system, sea chart and sailing, Saltreach Harbor, home islet visuals, case place stubs; the place, hotspot and light ids are fixed in Nils' Codex prompt and documented in `frontend/GRAPHICS.md` when done) | Codex, for Nils | `feat/g2-world-places` |
| S1 story engine: the Python engine and the story in `backend/`, an ES-module engine in `frontend/src/story/`, the 11 original tests, a parity test, `GET /api/content/intro-story` | Claude, for Nils | `feat/s1-import-plot-twist` |
| S0 story detail round: Story v2 edits, the case file, NPC partners, the open world, a timing simulation; for Nils' approval | Claude, for Nils | `docs/story-detail` |
| Foundation wave 2: the migration aligned with D003 and D004 (starting balance 0, a `wallet_reasons` table, neutral captain names, explicit grants, `crews` and `crew_seats`), the keep-alive route `GET /api/keepalive`, engineering docs with the `frontend/` and `backend/` commands, `docs/ARCHITECTURE.md`, `docs/INTERFACES.md`, and the decision entries D002, D003, D004, D012 (Crews and seats) and D015 (owner-authorized merges) | Claude, for Nils | `chore/foundation` (not pushed yet) |
| Coordination: roadmap, story, this page, the README update and agent briefs. They go to `main` first (merge order, step 1). | Claude, for Nils | waiting to go to `main` |
| Owners for lanes S, A and L | the team | today |

### Blocked or waiting

- **The database migration is not applied yet.** It waits for foundation wave 2, which still changes the migration file (a migration is never edited after it is applied or merged). When wave 2 is on `main`, Claude applies the migration through its Supabase connection and runs the Supabase security advisor (its built-in safety check).
- **Four of the five deploy checks have not run** ([SETUP.md](SETUP.md), step 5). Check 2 passed: `/api/health` answers on production. Check 1 needs a teammate's push, check 3 needs a cron entry for `/api/keepalive` in `vercel.json` (not there yet), check 4 needs the migration, and check 5 needs a GitHub sign-in round trip.
- **Nils confirms two settings:** that Email sign-in is switched off in Supabase, and that the function region is Dublin in the Vercel settings.
- **S1 is being built** by Claude for Nils on `feat/s1-import-plot-twist`. Nils decided the team brings everything into this repo, so nobody needs the private solo repository.
- **G2 and S2 wait for Codex's final pixel pass** to be merged (G1 finish). The look itself is decided (D005).

### Known gaps

- [ENGINEERING.md](ENGINEERING.md) on `main` still says to run every command from the repository root. The code now lives in `frontend/` and `backend/`, so use the commands in [Start here](#start-here-as-a-teammate). Wave 2 brings the corrected commands.
- [frontend/GRAPHICS.md](../frontend/GRAPHICS.md) still says to run `npm install` in the repository root. Run it inside `frontend/`. G1 finish fixes the text.
- The Vite dev server does not pass `/api` to the local API yet (ENGINEERING.md, section 3). The first package that calls the API from the browser adds it (L1 or A2) and tells the G lane.
- The README's "Project status" now points to the live site and this page. M3 adds the deployed URL, names, student numbers and commands.
- PR 1 (`docs/team-workflow`): its commits are inside `main` now, so GitHub should show it as merged. If it still shows as open, close it by hand.
- The decision log ([DECISIONS.md](DECISIONS.md)) has only D001 so far. D002, D003, D004, D012 and D015 arrive with foundation wave 2, and D005 with G1 finish.
- The setup guide ([SETUP.md](SETUP.md), step 4) still says that `main` has nothing to build. Production already builds and runs, so treat that sentence as out of date.

### Open decisions

Nobody has decided these yet. Until they are decided, the plan in [ROADMAP.md](../ROADMAP.md) stands as written.

**For Nils** (asked on the evening of 5 Nov):

1. **Decided: the Island Exchange is core** (Nils, 5 Nov). It ships its minimum version first; L2 and G3 ship their minimum versions.
2. **Decided: nobody needs the private solo repository** (Nils, 5 Nov). Claude imports the story for Nils (S1, in progress).
3. **Decided and done: Codex's pixel pass is on `main`** (`45d2d46`).

**For the team kickoff** (the four teammates decide together):

1. **Who builds S4 (NPC partners)?** Proposal: the L-lane owner.
2. **The D008 grow order.** Proposal in ROADMAP.md: S3, L3 and S4 first, then L4, then G2 and G3, then L2, then A7, L5 and L6.
3. **Who creates the free data-API accounts** (CoinGecko Demo, football-data.org, balldontlie)? The keys live only in the Vercel settings, never in the repository, a file or chat.
4. **Demo format.** Live on a seeded demo world, or recorded? Does the demo show the twist?
5. **Seat takeover.** When a friend takes over an NPC partner's seat, does the seat keep the partner's kit, or take the friend's own kit?
6. **What the Exchange daily reset re-bases.** In plain words: what gets set back to its starting point each morning?
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

**Done on `feat/g2-world-places`, awaiting Claude's integration: G2 + G3 and the authorised home/case visuals.** Seven places share one lifecycle manager, a keyboard sea chart and weather-driven skippable sailing. Saltreach Harbor has eleven hotspots and a night-lit office window visible from the docks. Home has four selectable plots and five building types. Case stubs cover Cove, Wreck Point, the Teeth and locked Gull's Rest. The registry and all event/light contracts are in `frontend/GRAPHICS.md`; every new original sprite is in `frontend/ASSETS.md`.

- **Verified:** 36 Vitest tests in 8 files, production build, original Lighthouse browser regression, 55 world-browser assertions, ten complete round trips with stable resource counts, production/reduced-motion travel, 77 PNGs in development and production, and readable 14–16 px controls/labels at three desktop window sizes. Rebuilding all art reproduced 77 byte-identical PNGs. Evidence and exact commands are in `frontend/GRAPHICS.md` and `frontend/captures/20261105_World-*`.
- **Next:** Claude reviews and integrates this branch. The story/world-state owner connects `world.setRelightingComplete`; G4 can use the four registered beam origins. Backend saving/building rules remain with L2's owner. S2 can follow when `frontend/src/story/engine.js` and its README land on main; they were absent at `393f551`, so the optional phase was skipped.
- **Not verified:** other browsers/GPUs, touch controls, a sustained long-session soak, or live backend/story/state integration. No main merge or manual deployment was performed.

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
             Do not touch: code, content/ files (S1 and S3 write those), the skeleton text in
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
Scope:       Proposed paths. Agree them in the issue first.
               backend/plot_twist/              engine.py, cli.py, __init__.py, __main__.py
                                                (the terminal game, started with
                                                cd backend && uv run python -m plot_twist)
               backend/plot_twist/tests/        test_acceptance.py, test_web_parity.py (11 tests)
               frontend/src/story/engine.js     web/engine.js as an ES module, rule for rule
               frontend/scripts/parity-runner.js  tests/parity_runner.js, rewritten with import
               content/story.json               plot_twist/story.json
               content/README.md                the content format and the provenance note
               backend/pyproject.toml           add "plot_twist/tests" to testpaths
               backend/tools/lint_content.py    the content linter (second pull request)
             Allowed engine changes: read story.json from content/, and a save_path=None option
             so the server never writes save files. The rules stay frozen.
             Do not touch: backend/server/, supabase/, frontend/src/world/. Do not import the
             old web interface (index.html, web/app.js, web/style.css); S2 builds a new one.
             No new dependencies unless I say so. No secrets.
Git:         First pull request on feat/s1-import-plot-twist, second on feat/s1-story-v2, both
             from main. Commit and push only when I say so.
Done when:   First pull request: cd backend && uv run pytest runs the 11 original tests plus
             the server tests, all green (paste the summary line); the parity test passes
             (Python and JavaScript agree); cd frontend && npm test and npm run build pass; the
             terminal game still starts; content/README.md holds the provenance note (source
             repository, commit e235ee4, what changed) and the format; the D007 entry is in
             docs/DECISIONS.md.
             Second pull request (after S0's change list): every line from the change list is
             in content/story.json, with one test per change (each ending line per decision,
             the read-log flag, "no decision" as a real third path, the planted hints); the
             linter rejects unknown items or flags and flags that are set but never used; the
             parity test still passes.
Watch out:   The backend on Vercel may not see files outside backend/. A3 checks this on a
             preview. Say in the pull request how engine.py finds content/story.json.
Method:      Move first, change second: the first commit copies the files unchanged, the next
             commits make the small edits, so a reviewer can see each change.
Report:      Finish with: changed, verified (exact commands and result lines), not verified,
             remaining, branch/PR. Then add one line at the top of the Log in docs/STATUS.md
             and update "Right now" and "Next steps" for the S lane.
```

### A Accounts and Multiplayer (owner picked today)

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
                Ready preview; /api/health answers on the preview; the keep-alive runs on
                production (it needs a cron entry in vercel.json and CRON_SECRET in Vercel; if
                the entry is missing, mark the check as waiting and open an issue); the two
                test users each see only their own rows; a GitHub sign-in round trip ends
                signed in.
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
             backend/server/tests/, content/names.json (new word lists, no real people's
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
             save version gets 409; names come only from content/names.json, never from a
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

Newest first. One line per finished task: date, who, what, where.

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
