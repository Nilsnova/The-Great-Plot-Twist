> **Setup update (Claude, Fri 6 Nov, 17:00 Lisbon), overrides the lines below where they differ:** G9 runs on the laptop in `~/Developer/The-Great-Plot-Twist-graphics`. G10 (server: group 3 merge, case backend), G11 (ship pack), G12 (economy and abuse tests) and G13 (festival extras) run in Codex's cloud. The case route contract and `case_fixtures` come from G10 (pushed on `feat/case-backend`), not from Claude. Group 2 is not on `main` yet: Claude says through Nils when it is.

# Codex prompt: the real adapter and the rest of the browser side (G9), a very large package

**For Nils, in five lines**
1. **What Codex builds:** the whole browser side, until it is feature complete. That is the real adapter (U1: the code that connects every screen to the live server), GitHub sign-in inside the game, accounts, crews, live captains, the islet, Exchange, prediction-desk and duel panels, and the case on the real routes. It also finishes the build stamp and "Report a problem" (already started), clear words for every server problem, phone, touch, keyboard and gamepad play, speed work, a strict security policy, a golden-path browser test and the class screenshots.
2. **How long:** about 20 to 30 hours of Codex work in six checkpoints, then a long overflow list for as many usage resets as you have. Checkpoint 4 (the case) waits for the case contract from Codex's server package G10, expected Sat 7. Codex does checkpoint 5 meanwhile.
3. **How to start:** Codex is still working on G9 starter files in `~/Developer/The-Great-Plot-Twist-graphics` (uncommitted). Paste this there. It first commits and pushes that work. Then free the laptop for G10, the critical path: run G9 as a Codex cloud task on `Nilsnova/The-Great-Plot-Twist`, branch `feat/g9-real-adapter`. Type "G9 browser pass" in the laptop worktree only while no other Codex task runs there.
4. **Your steps:** after each push, tell Claude "G9 checkpoint N is pushed" (the note is in `frontend/HANDOFF-G9.md` on the branch). Answer the quick decisions when Claude asks. Set the sign-in values Claude lists for you (R5). Realtime "Allow public access" is off and `HOST_PLAYER_IDS` is set already.
5. **If Codex stops** (usage limit or restart), type "Continue G9" and it picks up from its handoff note. It never merges into `main` and never touches the server. It asks you only about new packages, money rules, removed features, licence wording or a bigger first load.

Paste everything below the line into Codex, with `~/Developer/The-Great-Plot-Twist-graphics` open. Prepared Fri 6 Nov 2026, evening (Lisbon). Your G8 is finished and pushed (`ea89e35`, including the HUD credit correction). Claude merges it into `main` tonight with group 2. You already started G9 on `feat/g9-real-adapter` (`cae6dad`, `bb7599e`). This is a very large package: 22 workstreams in six checkpoints, then a prioritised overflow list. Split it across your own subagents ("How to split the work") and work on your own for many hours ("How to work on your own").

---

# Task: the real adapter and the rest of the browser side (package G9)

**G9 makes the game real.** Until now your screens ran on a stand-in (the fake adapter in `frontend/src/adapter/fake/`), and production used the disconnected adapter (`frontend/src/adapter/unavailable.js`). In G9 you build the real adapter (roadmap U1) and connect every screen to the live server. You own the whole browser side. Claude owns `vercel.json`, the merges into `main`, the live database and the settings. Server code is built by Claude or, under Claude's review, by Codex's server package G10. Neither is your job.

You work for Nils Lenke on a four-person student project, The Great Plot Twist (Nova SBE, Intro to Programming). The target is **feature complete and live by Sun 8 Nov, Lisbon time**, at the minimum versions Nils signed off in the story round (S0). Mon 9 to Mon 23 is buffer time, for the teammates' own ideas and Nils' end review. The submission stays on Mon 23, on Moodle.

What the player gets at the end of G9:
- GitHub sign-in inside the game, a captain name with one re-roll, Act 1 with an entry kit, and a cloud save;
- a crew made or joined with a code, NPC partners in empty seats, and other captains walking in the harbor;
- the signal station on the home islet, play-money positions in the market hall (island companies and five US stocks), the prediction kiosk and the Lantern Duels arena;
- the whole case with the crew, on the real routes: the board, card searches, partner errands, the Night of Three Lights (the three-light finale), the accusation, the reveal and the Relighting coast (the lit world after the first solve);
- a build stamp and "Report a problem" on every release, clear words for every server problem, and full phone, touch, keyboard and gamepad play.

Nils' decisions that shape this package:
- **The server decides, the screen shows** (decision D003). The game is free and uses play money only.
- **Live multiplayer is core.** Sign-in is GitHub only, through Supabase's browser library `@supabase/supabase-js`, pinned at `2.118.0`. The library is approved and arrives on `main` with A4 tonight.
- **No waiting for teammates.** There is no kickoff and no check-in. Nothing is reserved for them. Leave the three teammate rows in `src/shell/team.js` as they are.
- **No human review per merge.** Claude merges each checkpoint after its gates: all tests, the build, a secret scan and an independent agent review. Nils reviews at the end. Your own checks are the first quality gate, so run all of them.
- **Claude is in orchestrator mode:** it writes prompts, reviews and merges, and you build. Its answers may be slow. Never wait for one.
- **The case solution may sit in the public repository, labelled as a spoiler.** The culprit's identity never reaches the files the browser downloads.
- **Data and licence credits live only under Settings, then Credits** (Nils, 6 Nov). No provider or licence block appears inside a gameplay screen.
- **What switches on.** The prediction desk (L5) and Lantern Duels (A7) go live once group 3 is merged and checked (the module teacher approved play money). The five US stocks go live with Exchange v2 (Nils set the stock settings). The bulletin, the tonight chip and the Chapter 2 hook (the open world) stay off until a server flag exists and Nils switches it on. The default weather place is now Carcavelos.
- **Keys and secrets live only in Vercel or GitHub settings.** They never go into the repository, a document, a test, a capture or a report.

## The weekend plan: three lanes, and you are the browser lane

These times are expected, not promised. Never wait for them. Take the next stream whose inputs exist.

| When (Lisbon) | Claude (reviews, database, `main`) | Codex G10 (server, on the laptop) | You, Codex G9 (browser) |
|---|---|---|---|
| Fri evening and night | Pushes group 2 to `main`: G8, A4 (live presence), L2 (home islet) and the open-world server, with migrations 050000 and 070000 and the first security headers (report-only). Group 1 (story round, A2/A3, A6) is on `main` since `c26f303`. | Starts the case backend (phase 1, S3 case rules). Merges group 3 (L4 v2 with the X1 market hall, L5, A7) on `integrate/group3` once group 2 is on `main`. | Commit your starter work, then checkpoint 0, then checkpoint 1. |
| Sat 7 | Reviews and applies each G10 migration, pushes `main`, merges your checkpoints, switches `live_presence`, `market`, `predictions` and `arena` on after checks. | Publishes the case route contract after phase 1, slice 2. Then phases 2 to 4: L3 (the board and the Night of Three Lights), the locked Relighting switch, S4 (NPC partner errands). | Checkpoints 2 and 3. Then checkpoint 4 on the published contract. |
| Sun 8 | Switches `case` and `sign_in` on and enforces the headers, after checks and smoke tests. | Proofs and follow-ups (including your server requests that Claude hands it). | Checkpoint 4 on the real routes, checkpoint 5, then the overflow list. |
| Mon 9 to Mon 23 | Buffer, fixes and Nils' end review. | Buffer. | The overflow list, and fixes from playtests. |

**Other Codex tasks, all in Codex's cloud:** G11 (ship pack: `README.md`, `docs/lanes/`, `docs/drills/`, the presenter script and release checklist), G12 (economy and abuse tests, backend only) and G13 (Relighting festival extras behind a new flag `festival`, with festival art and screens under `frontend/`). Never edit their branches or their files. Never build festival screens or festival art yourself. When G13's frontend files reach `main`, adopt them like any other merged files.

## Start: keep the branch you are on, and stay in sync with `main`
1. You are on `feat/g9-real-adapter`, pushed at `bb7599e` (the build stamp `cae6dad` and the problem-report drafts `bb7599e`, on top of G8 `ea89e35`). **Keep it. Never recreate, reset or rebase it.**
2. **Finish your uncommitted work first.** If the working tree holds unfinished G9 work (for example `frontend/CSP.md`, `src/adapter/call-failure.js`, `src/ui/kit/call-state.js`, `src/ui/kit/server-call-state.js`, `scripts/check-call-states.js`, or edits to `adapter/intent.js`, `main.js` and the account files), map each part to its stream below (the call states are stream 5, the header proposal is stream 1). Run the stream gate, commit each part as that stream's commit, and push. Do this before anything else, so a cloud task can see it.
3. **Sync** whenever `main` moves, and always at the start of every checkpoint: `git fetch origin`, then `git merge origin/main`. `main` holds group 1 now (`c26f303`). G8 reaches `main` tonight with group 2: `git merge-base --is-ancestor ea89e35 origin/main` tells you when.
   - Never rebase or force-push.
   - Conflicts in Claude's files are resolved Claude's way. **Adopt the frontend files that arrive** (`frontend/src/online/`, `frontend/src/net/`, the four panels and their `game.js` hooks) and build on them. Do not rewrite them.
   - If `frontend/package-lock.json` changed: on the laptop run `npm ci --offline` (plain `npm ci` if the cache does not have the package); in the cloud run `npm ci`.
   - If `npm run build` throws "Committed reveal fingerprints need regeneration" after a merge, run `npm run art:fingerprints`. Check that only `tests/fixtures/reveal-fingerprints.json` changed (it holds hashes only), and commit it as `chore(graphics): regenerate reveal fingerprints after <sha>`. Never edit the spoiler guard.
   - Rerun the checkpoint self-check after every merge, and list the merged commits in the checkpoint note.
4. Read these first:
   - `AGENTS.md`, `CONTRIBUTING.md`, `docs/ENGINEERING.md` (section 6, the safety checklist) and `docs/STATUS.md`;
   - `ROADMAP.md` and `docs/DECISIONS.md` (D003 and the newest entries);
   - `docs/INTERFACES.md`: the routes, the error shape, "Talking to the API: api.js and session.js (A2)", the database tables, the wallet, and section 7 on live rooms once A4 is merged;
   - your own `frontend/GRAPHICS.md`, above all "Case view-model details for the real adapter", "G7 additive adapter contract (schema 1)", "Conformance suite (G7)", "G8 verification", "Readability comparison and handoff", "Build identity (G9 starter)" and "Problem reports (G9 starter)";
   - `frontend/ASSETS.md` and `frontend/HOW-IT-WORKS.md`.
5. Read these on `main` once they are merged, read only: the `README.md` of each panel (`frontend/src/screens/islet/`, `market/`, `predictions/` and `duels/`), the header of `frontend/src/online/realtime.js`, `specs/A4-live-presence.md` and `specs/L4-exchange-v2.md`. For checkpoint 4 you may also read, with `git show`, the case section of `docs/INTERFACES.md` and the `case_fixtures` on `origin/feat/case-backend` as soon as G10's note says they are published. Read nothing else from other branches. Never read another worktree or Nils' private project folder.
6. **Work only inside `frontend/`, with no exception.** You no longer write `docs/STATUS.md`; Claude copies one line from your checkpoint note when it merges a checkpoint.

## Where you run: one Codex task on the laptop at a time
- The laptop has 8 GB of memory. It runs at most one Claude workflow and one Codex task. G10 needs the laptop (it reads files that exist only there and runs a scratch database), so after Start step 2, Nils may move G9 to Codex's cloud.
- **In the cloud:** run `npm ci`, `npm test`, `npm run build` and every check that needs no browser. Never download a browser. Add each browser check you could not run to the "Browser pass" list in the note, marked "Not verified: needs the laptop's Chrome".
- **On the laptop** (Nils types "G9 browser pass", or you run there anyway): pull the branch, run the Browser pass list one check at a time, close Chrome between checks, fix what fails, and push.
- Never run G9 in the cloud and on the laptop at the same time. Push before a switch, and pull after it.
- **A checkpoint counts as done only after its browser pass is green.** Claude merges a checkpoint only when its note shows that.

## What you own now, and what stays with others
**You own:**
- `frontend/src/adapter/select.js`, and a new folder `frontend/src/online/case-adapter/` for the real adapter;
- `frontend/src/online/` and `frontend/src/net/` (A2's `api.js` and `session.js`; A4's `realtime.js` and `net/live-*.js`). Extend them without breaking what is there, keep their tests green, and record every behaviour you change in the checkpoint note;
- the four panels in `frontend/src/screens/islet/`, `market/`, `predictions/` and `duels/`, once they reach `main`. Wire, polish and test them, and keep their adapters, words and tests;
- the hooks in `frontend/src/game.js` and `frontend/src/main.js`. The rule stays: one small hook per feature, and no reformatting;
- everything you started in G9: `src/build/`, `src/diagnostics/`, `scripts/build-stamp.js`, `scripts/check-build-stamp.js`, `scripts/check-problem-report.js` and `frontend/CSP.md`.

**Never edit these:**
- everything outside `frontend/` (above all `backend/`, `supabase/`, `vercel.json`, `.github/`, `docs/`, `docs/story/`, `backend/content/` and `README.md`);
- `frontend/public/auth-check.html` and its `auth-check*.js` and `auth-check.css` files. Backend tests (`backend/server/tests/test_me.py` and `test_auth_exchange.py`) read these files, so Claude retires the page, `POST /api/auth/exchange` and those tests together (request R4);
- `src/demo/intro-story.json` and every story text;
- G13's festival files once they arrive.

**Files that server tests read, so change them only with care:**
- `frontend/src/world/places/registry.js` is read by `backend/server/tests/test_entry_kits.py`. Keep every existing place id. If a place id or start place must change, file a request first.
- the `auth-check*` files above.

You never write server code. If a route is missing or wrong, stop that stream, write the exact request into "Requests for Claude" and move on.

## The rules that shape everything
- **The server decides, the screen shows.** Screens never call `fetch`, never import Supabase or `src/online/`, and never decide an outcome. Only these parts talk to the network: the real adapter (`src/online/case-adapter/`), the sign-in module (`src/online/auth.js`, new), A2's `api.js`, A4's `realtime.js`, each panel's own HTTP file, `net/weather.js` and the intro's story read. Each panel gets its transport or token function at its `game.js` hook.
- **Two library users only.** `src/online/auth.js` and A4's `src/online/realtime.js` are the only files that import `@supabase/supabase-js`, both lazily. The wallet and `crew_seats` reads go through the client in `auth.js`.
- **Public reads carry no token.** A2's `api.js` adds `Authorization` whenever a token exists. For public, edge-cached reads (`GET /api/world`, `GET /api/bulletin`, `GET /api/market`, `GET /api/config`) use a second client, `createApi({session: {getToken: () => null, clearToken() {}}, ...})`, with a test that no such request carries `Authorization`.
- **One adapter surface, one contract.** The real adapter returns all 24 view keys of schema 1 and answers the same 25 intents as the stand-in (`src/adapter/contract.js`). Extend the contract, and never fork it. An added field or refusal reason goes into `contract.js`, the conformance suite, GRAPHICS.md and the checkpoint note. `schema` stays 1.
- **Mirror the server's names.** Copy route field names unchanged wherever a screen can use them. Translate only where the screen contract already differs (see "How server answers become adapter results").
- **Refusals resolve; they never throw.** Every server problem becomes `{accepted: false, reason, message, view}`, with a reason from `caseReasons`. Only a broken transport may throw, and then only with a known reason and a message that is safe to show the player.
- **Clears only when earned.** The server sends cleared suspects only for deductions the crew has formed. The adapter copies them and never infers more. It holds no table of which deduction clears whom. Unformed deductions keep `clears` and `clearedTitles` empty.
- **No spoilers in the production bundle.** The spoiler guard in `npm run build` stays green and never gets weaker. Never copy case data, reveal lines or hook text into `frontend/`, including test fixtures: recorded answers use placeholder ids and texts. Reveal lines reach a solver only at run time, from the server. Watch for the guard's trap: no quoted lowercase word within 60 characters after a `clears:` key in source.
- **The stand-in serves `?demo=1` and tests only.** Normal play in a production build gets the real adapter or the disconnected one. **The `?demo=1` tour keeps working without the server.**
- **Strict-CSP safe.** No inline scripts, and no `style` attributes or `<style>` blocks through `innerHTML`. Set positions through single `element.style` properties, never through `cssText`. If a feature needs more than the policy allows, report the exact directive.
- **Light first load.** Cold title JavaScript must stay at most 21,080 bytes (`scripts/check-loading.js`). At `bb7599e` it is 21,079 bytes, so there is 1 byte of room. The real adapter, the sign-in module, the Supabase library (about 214 kB) and A4's live code all load lazily, after the title.
- **`game.js` and `main.js` are merge hot spots.** One small hook per feature, made after merging `origin/main`, and no reformatting.
- **Times are Lisbon times.** Format them with `Intl.DateTimeFormat` and `timeZone: 'Europe/Lisbon'`, pinned in tests (this Mac runs on Berlin time).
- **Free and light.** No new npm packages beyond `@supabase/supabase-js` 2.118.0, and no external assets, fonts or browser downloads. Draw at most 8 other captains per place, plus "+N more", and send positions at most twice a second.
- **Accessible and phone-ready.** Everything works by keyboard and with a screen reader, and respects reduced motion. Follow the one Escape rule: top panel first, then the cinematic, then pause, with focus back on the canvas (`src/shell/escape.js`). Text floors: controls 16 px, case body 18 px, story 19 px, captions 18 px. Touch targets are at least 44 px at 375 px, and nothing scrolls sideways at 320 px.
- **Safe flashing.** Nothing flashes more than three times a second. Reduced motion gets a still marker and words.
- **Keep the credits.** Keep `src/shell/team.js` (Nils plus three teammate rows) and every line in `src/shell/credits.js`. Add a line for each new library or data source (the Supabase client, Finnhub for the stocks).
- **Privacy.** No player id, captain name, crew code, token, save content, case text, ledger reference or intent argument goes into logs, captures, problem reports or the console. Screens see opaque ids only.
- **No accounts, no Actions.** Never sign up for or sign in to any service (GitHub, Supabase, Vercel, Finnhub). Tests never reach GitHub or Supabase: they intercept those addresses. Never run or dispatch a GitHub workflow, and never add files under `.github/`. Pushing your branch runs no GitHub Action. Vercel builds a preview of it, which is expected; previews cannot sign in.

## How to work on your own: many hours, few questions
- **Decide routine details yourself.** Ask Nils only about these: a new npm package; a schema change; anything that changes what a player pays or earns; removing a feature; licence or credit wording; a bigger first-load budget.
- **Never wait.** If a stream's inputs are not on `main` yet, do the next stream whose inputs exist (see the table in "How to split the work"), and come back after the next merge of `origin/main`. Check `main` yourself with `git fetch` and `git merge-base --is-ancestor`; nobody needs to tell you.
- **Time-box.** If one problem blocks you for 90 minutes, write it into the checkpoint note with what you tried, and move on.
- **Push finished work early.** If a checkpoint runs past about three hours, push the streams that pass the stream gate, and label the note "streams done so far, not a checkpoint".
- **Requests for Claude.** For any change to the server, the database, `vercel.json` or a setting, write a request and move on. Claude decides who builds it: Claude itself, or G10 under Claude's review. Each request has seven parts: an id (`R` and a number); the route or setting; what is missing or wrong (a field, a code or a behaviour); why it matters (the screen, and what the player sees); the exact shape you propose; the stream it blocks; and your workaround in the meantime. At each sync, mark answered requests as done, with the commit. Keep the list short.
- **The checkpoint note.** Keep one file, `frontend/HANDOFF-G9.md` (new). At each checkpoint, put the new note at the top in the form below, and keep the full request table under it. Commit it with the checkpoint, so Claude reads it with `git show`. End your chat report with the same note, so Nils can forward it.

```text
## G9 checkpoint <n>: <one-line result> (<date and Lisbon time>, <short sha>)
Merged from main: <shas, or "nothing new">
Changed: <per stream: files and purpose>
Verified: <exact commands and results>
Browser pass: <green at <sha>, or the list of browser checks still to run>
Not verified: <what, and why>
Remaining: <streams and overflow items left>
Requests for Claude: <new or changed ids; the full table is below>
Contract changes Claude must mirror: <view fields, reasons, mode, events, emote list>
Decisions for Nils: <only items from the ask list>
```

- **The stream gate** runs after each stream, before its commit:
  - `npm test` (all Vitest, including the conformance suite on the stand-in and on the real adapter);
  - `npm run build` (the spoiler guard);
  - `npm run test:online` (the real-adapter golden path, part A, from stream 2 on; a browser check);
  - the stream's own checks.
- **The checkpoint self-check** runs before every push. When a check fails, fix the code. Never weaken a check or raise a budget.
  1. Sync with `main` (Start, step 3).
  2. Run the stream gate.
  3. Run `npm run test:loading`, `npm run test:csp` and `npm run test:a11y`.
  4. From checkpoint 1 on, run `npm run test:g9 -- --phase=after --keep-going`. This driver is new in stream 2 and runs G8's 31 commands plus the G9 checks; `--resume` reruns only the failures.
  5. Run the "Quick check before you push" from `docs/ENGINEERING.md` section 6 over `origin/main..HEAD`. It must print nothing.
- **If you are restarted,** read the top of `frontend/HANDOFF-G9.md`, `git log --oneline -20` and the newest verification JSON in `frontend/captures/`. Then continue at the first unfinished stream.
- **Browser checks on the laptop** run one at a time, also across subagents, and close Chrome between them. Start a dev or preview server only for the check that needs it.
- **Evidence.** Write one JSON summary per checkpoint in `frontend/captures/<YYYYMMDD>_G9-C<n>/`. Add PNGs only for new or changed screens, and keep each checkpoint to about 3 MB at most. No absolute path or user name goes into any committed file; write paths relative to `frontend/`.
- **Style for new code.** A header comment in every file; plain names; lines under about 120 characters; one statement per line; functions of about 20 lines. Do not reformat old code. Classmates must be able to explain this code in the drills.
- **Commits.** One commit per stream, with a one-line subject in the form `<type>(graphics): <what>` as before (`feat`, `fix`, `test`, `docs`, `style` or `chore`). Merge commits read `merge: sync origin/main <sha> before G9 checkpoint <n>`.

## Requests for Claude you can file at once
Put these into `frontend/HANDOFF-G9.md` in checkpoint 0. Do not file them twice; update their status instead.

| Id | Request | Blocks | Meanwhile |
|---|---|---|---|
| R1 | A local test server for the golden path: one documented command that starts the API on `127.0.0.1:8000` with an in-memory or scratch database and a test sign-in for two to four fixed test players (one of them a host). It switches on only when all three hold: an explicit opt-in variable, `APP_ENV=local`, and no `VERCEL` variable. A test proves that preview and production refuse it. Today `backend/server/auth.py` checks every token with Supabase, so no local test sign-in exists. | stream 20, part B | part A on recorded answers |
| R2 | The security headers in `vercel.json`. The first set (with group 2, report-only) must list `https://<project>.supabase.co` and `wss://<project>.supabase.co` in `connect-src`, or live presence and sign-in break. Enforce it before the flag `sign_in` goes on. Once it is on `main`, `vercel.json` is the source of truth and stream 1's module reproduces it. | sign-in in production | the proposal in `frontend/CSP.md` and `npm run print:headers` |
| R3 | A server flag for in-game sign-in (proposal: `sign_in` in `FLAG_NAMES`), switched on only after R2 is enforced. It is a one-line change and is needed by Saturday, so Nils can test sign-in early. | sign-in in production | production builds hide sign-in until `flags.sign_in` is true |
| R4 | Retire `POST /api/auth/exchange`, `/auth-check.html`, both backend tests that read it and the safety-checklist line, together, once in-game sign-in is live. | nothing | the game never calls the route |
| R5 | The sign-in settings. First, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Vercel frontend build for Production (public values; A4 needs them too). Second, the game's own address `https://the-great-plot-twist.vercel.app/` as an allowed return address in Supabase Auth (the check page returns to `/auth-check.html`, the game returns to `/`). Claude lists the exact values for Nils. | live sign-in | without the values the account says "Sign-in is not set up on this build" |
| R6 | A server flag for the open-world screens (bulletin, tonight chip, hook), for example `bulletin`. `GET /api/bulletin` has no flag today. | showing the bulletin | `bulletin.status: 'off'` in production |
| R7 | Confirm that the browser may read its own crew's `crew_seats.player_id` with the library under row-level security (for A4's crewmate flags), or add opaque member ids to `GET /api/crews/me`. | crewmate flags | the crew room without crewmate flags |
| R8 | Send `crew_changed` on join and on muster, so a forming crew updates without polling. | nothing | poll `GET /api/crews/me` every 5 s while the crew screen is open |
| R9 | Optional: a join preview, `{code, preview: true}` on `POST /api/crews/join`. | nothing | a local preview (the code's shape only) |
| R10 | `rerollsLeft` and an `isHost` flag in `GET /api/me`. | nothing | call the idempotent `POST /api/me/name` once after every sign-in; host controls stay hidden |
| R11 | Say in G10's note which ref holds the case contract (the case section of `docs/INTERFACES.md`) and the `case_fixtures`, and keep suspect ids and texts in those fixtures replaceable by placeholders. | checkpoint 4 | the shapes in this prompt |
| R12 | Update the weather section of `docs/INTERFACES.md`: the credits now live under Settings, then Credits, and no longer next to the data (Nils, 6 Nov). | nothing | — |
| R13 | Whoever edits `backend/content/secret/` (G10) runs `npm run build` in `frontend/` and commits regenerated reveal fingerprints in the same commit, so the next frontend build does not fail. | every stream gate after such a merge | regenerate them yourself (Start, step 3) |

## How to split the work (subagents)
- **Branch:** one branch, `feat/g9-real-adapter`. Push after every checkpoint, so Claude can merge early.
- **A coordinator owns the shared files:** the adapter contract and the conformance suite; `frontend/GRAPHICS.md`, `ASSETS.md`, `HOW-IT-WORKS.md`, `CSP.md` and `HANDOFF-G9.md`; the `package.json` scripts; the real adapter's top-level composition (`src/online/case-adapter/index.js`); `scripts/world-browser-tools.js`; and every hook in `game.js` and `main.js`. Streams ask the coordinator for changes to these files instead of editing them.
- **Each stream owns its own folders.** All paths are under `frontend/`:

| Stream | Folders and files |
|---|---|
| 0 | `index.html` (the stamp only), `vite.config.js` (the stamp only), `scripts/build-stamp.js`, `src/build/`, `src/diagnostics/`, `scripts/check-build-stamp.js`, `scripts/check-problem-report.js`, `src/shell/perf/` (the stamp line) |
| 1 | `src/adapter/select.js`, `src/main.js` (through the coordinator), a new `scripts/security-headers.js`, `scripts/check-csp.js`, `CSP.md`, the new `HANDOFF-G9.md`, and whatever title code moves behind a dynamic import |
| 2 | the new `src/online/case-adapter/` (core), `src/adapter/conformance/`, a new `src/adapter/shared/` (kit names and the archetype rule), `scripts/world-browser-tools.js` (the shared API stub, through the coordinator), a new `scripts/check-online-golden.js`, a new `scripts/check-g9-regression.js` |
| 3 | a new `src/online/auth.js`, `src/online/session.js` (additive), `src/screens/account/`, `src/shell/account-host.js`, `src/shell/lazy-account.js` |
| 4 | `src/online/case-adapter/` (the account part), `src/screens/arrival.js`, `src/screens/account/`, `src/screens/rewards/` |
| 5 | `src/ui/kit/` (state parts), `src/adapter/intent.js`, `src/adapter/call-failure.js`, `scripts/check-call-states.js`, a new `scripts/check-online-chaos.js` |
| 6 | `src/online/case-adapter/` (the crew part), `src/screens/crew.js`, `src/world/partners/` |
| 7 | `src/online/case-adapter/` (the presence part), `src/online/realtime.js`, `src/net/live-*.js`, `src/world/others/`, `src/screens/presence/` |
| 8 | `src/screens/islet/`, `src/world/islet/`, `src/screens/finale.js` (the build button) |
| 9 | `src/screens/market/`, `src/world/places/case-spots.js` |
| 10 | `src/screens/predictions/`, `src/screens/duels/` |
| 11 | `src/online/case-adapter/` (the bulletin part), `src/adapter/conformance/bulletin.js`, `src/screens/bulletin/`, `tests/bulletin.test.js` |
| 12 to 15 | `src/online/case-adapter/` (the case parts); a case screen only where it must change |
| 16 | `src/adapter/select.js`, `scripts/check-production.js` |
| 17 | `scripts/security-headers.js`, `vite.config.js`, `scripts/check-csp.js`, `CSP.md` |
| 18 | `src/controls/`, screen styles, a new `scripts/check-input-parity.js` |
| 19 | `src/shell/perf/`, `scripts/check-loading.js` (assertions only) |
| 20 | `scripts/check-online-golden.js`, `captures/` |
| 21 | `HOW-IT-WORKS.md`, `GRAPHICS.md`, `ASSETS.md`, committed captures |

- **Order, and what each checkpoint needs on `main`:**

| Checkpoint | Streams | Needs on `main` | Until then |
|---|---|---|---|
| 0 (small, pushed alone, tonight) | your uncommitted work, then 0 and 1 | nothing new | — |
| 1 | 2 first (the core and its conformance), then 3, 4 and 5 | group 1 (on `main` since `c26f303`); A4 for the library (stream 3, with group 2 tonight) | build stream 3 against an injected sign-in client fed with recorded answers; import the real library right after the merge; never add the package yourself |
| 2 | 6 and 7 | group 1 (A6); A4 (group 2) | streams 8 and 11 first |
| 3 | 8, 9, 10 and 11 | group 2 for 8 and 11; group 3 for 9 and 10 (G10 merges it on `integrate/group3`, then Claude pushes `main`) | whichever panel is on `main`; never start streams 9 and 10 before their panels are on `main` |
| 4 | 12 first, then 13, 14 and 15 | G10's published case contract and `case_fixtures` (R11), then the case routes on `main` | checkpoint 5 first |
| 5 | 16 to 19, then 20 and 21 | everything above; R1 for stream 20, part B | part A only |
| Overflow | items 1 to 17, in order | as noted per item | the next item |

## Server routes you will use, and when they land
**Group 1's routes exist on `main` now. Group 2 and 3 routes land tonight and on Saturday; the case routes land phase by phase from Saturday.**
- Every path starts with `/api`. JSON is camelCase. Errors look like `{"error": {"code", "message"}}`.
- "Bearer" means `Authorization: Bearer <access token>`. The player id comes only from the verified token. Answers that hold player data carry `Cache-Control: private, no-store`.
- `actionUid` is 8 to 64 characters of letters, digits, `_` and `-`. Make one per click, and reuse it on a retry after an unknown outcome.
- Flags come from `GET /api/config` (`flags: {market, predictions, sports, arena, raid, live_presence, case, sign_in, bulletin, festival}`). The config never holds a key. Re-read it every 5 minutes and on page focus, so a flag switch shows up without a reload. Poll only routes whose flag is on.

| Route | Auth | Streams | Lands |
|---|---|---|---|
| `GET /api/config` | none | 2, 3, 7, 10, 11 | on `main` |
| `GET /api/content/intro-story` | none | unchanged caller (`story/intro.js`) | on `main` |
| `GET /api/weather` | none | unchanged caller (`net/weather.js`) | on `main`; `state` and `tonight` arrive tonight with group 2 |
| `GET /api/me` | Bearer | 2, 3, 4 | on `main`, with `captainName`, `kit` and `place` |
| `POST /api/me/name`, `POST /api/me/name/reroll` | Bearer | 4 | on `main` |
| `GET /api/save`, `PUT /api/save` | Bearer | 4 | on `main` |
| `DELETE /api/me` | Bearer | 4 | on `main` |
| `POST /api/intro/complete` | Bearer | 4 | on `main` |
| `POST /api/crews`, `POST /api/crews/join`, `POST /api/crews/me/start`, `GET /api/crews/me` | Bearer | 6 | on `main` |
| A4's Realtime rooms `live:world`, `live:place:<placeId>:<room>` and `live:crew:<crewId>` (no HTTP route) | the player's token | 7, 12 | tonight with group 2 (flag `live_presence`) |
| `GET /api/islet`, `POST /api/islet/build` | Bearer | 8, 15 | tonight with group 2 (no flag) |
| `GET /api/bulletin` | none | 11 | tonight with group 2 (no flag yet: R6) |
| `GET /api/market` | none | 9 | on `main` in the v1 shape; v2 with group 3 |
| `GET /api/market/portfolio` | Bearer | 9 | on `main` in the v1 shape; v2 with group 3 (flag `market`) |
| `POST /api/market/open`, `POST /api/market/close` | Bearer | 9 | with group 3 (flag `market`) |
| `GET /api/predictions`, `GET /api/predictions/mine`, `POST /api/predictions/stake` | none, then Bearer | 10 | with group 3 (flag `predictions`, switched on after checks) |
| `GET /api/duels`, `POST /api/duels`, `GET /api/duels/{id}`, `POST /api/duels/{id}/move`, `POST /api/duels/{id}/cancel` | Bearer | 10 | with group 3 (flag `arena`, switched on after checks) |
| `GET /api/case` | Bearer | 12 | case phase 1 (flag `case`) |
| `POST /api/case/search`, `POST /api/case/accuse` | Bearer | 13, 15 | case phase 1 |
| `POST /api/board/pin`, `POST /api/board/pair` | Bearer | 13 | case phase 2 |
| `POST /api/finale/nightfall`, `POST /api/finale/post`, `POST /api/finale/signal` | Bearer | 15 | case phase 2 |
| `GET /api/world` | none; never send `Authorization` (it is edge-cached) | 12, 15 | case phase 3 |
| `POST /api/crews/me/orders` | Bearer | 14 | case phase 4 |
| `POST /api/host/case/clock` | host | 20, part B only (tests) | case phase 1 |

The game does not use these routes: `POST /api/auth/exchange` (temporary; the check page only), `GET /api/keepalive` (the daily workflow only), `POST /api/market/trade` (removed by L4 v2) and `POST /api/predictions/settle` (host only). These are not planned for the weekend: a join preview (R9), a ledger route and `POST /api/world/lantern` (the festival lanterns belong to G13).

## How server answers become adapter results
**One table turns every server answer into a reason, a message and a next step.**
- Every intent resolves `{accepted, reason, message, view, ...extras}`. `view` is present even on a refusal. Extras carry what the screen needs, for example `retryAfterSeconds`, `offer`, `minutes` or `seconds`.
- A2's `api` already answers `{ok: true, status, data}` or `{ok: false, status, code, message, retryAfterSeconds?}` and never throws. It clears the token on a 401, and it has player words for 401, 409 and 429.
- Case changes answer 200 with `accepted`, `reason`, `message` and a fresh `case`. Apply that view at once.
- `already_applied`, `already_seated`, `already_started` and a case `repeat: true` all mean "done": accept, then re-read.
- **Unknown outcome** (status 0 or a 503 on a change): re-read first. Then:
  - routes with an `actionUid` (names, the islet, the market, predictions, duels, the case): resend once with the same `actionUid`;
  - crew routes (no `actionUid`): resend once; the "done" codes cover a repeat;
  - `PUT /api/save`: read `GET /api/save`. If the cloud copy equals what you sent, treat it as saved. Otherwise show the conflict choice. Never resend blindly, or you raise a false `stale_save`.

| Server answer | Adapter result | What the player sees |
|---|---|---|
| status 0 (`network_error`, `timeout`) | `offline` | "You are offline. Your progress on this device is kept." Reads retry by themselves |
| 401 `unauthorized` | `session_expired` | sign-in opens; local progress is kept |
| 403 `forbidden` | `forbidden` | a plain message |
| 404 `feature_off` | `feature_off` | an "Opens later" state; the controls hide |
| 404 `player_not_set_up` | `not_ready` | "Your captain is being set up. Try again in a moment." |
| 404 `wrong_code` | `wrong_code` | "No crew has that code." |
| 404 `no_crew` | `crew_required` | the crew screen |
| 409 `kit_needed` | `kit_required` | "Finish Act 1 first." |
| 409 `already_in_crew` | `already_in_crew` | the current crew |
| 409 `already_applied`, `already_seated`, `already_started` | accepted, then a re-read | the result, as if it had just happened |
| 409 `crew_busy` | one silent resend (the same `actionUid` on case routes; a plain resend on crew routes), then `not_ready` | "The crew is busy. Try again." |
| 409 `crew_full`, `crew_finished` | `not_ready`, with the server's message | the server's message |
| 409 `stale_save` | `save_conflict` | a choice between the two copies |
| 409 `no_rerolls_left` | `name_reroll_used` | "You already used your re-roll." |
| 409 `no_name_yet` | call `POST /api/me/name`, then retry once | nothing |
| 422 `validation_error` | `invalid_request` | a plain message, plus "Report a problem" |
| 422 `move_refused`, `no_ending` | `intro_incomplete` | "Finish Act 1 first." |
| 422 `save_too_big`, `save_not_json` | `save_unavailable` | "This save cannot be stored." |
| 422 `invalid_transaction`, 502 `database_error` | `internal_error` | a plain message; try again later |
| 429 on `POST /api/crews/join` | `too_many_tries`, plus `retryAfterSeconds` | a countdown |
| any other 429 (`too_many_requests`) | `rate_limited`, plus `retryAfterSeconds` | a countdown |
| any 503 (`auth_unavailable`, `database_unavailable`, `crew_codes_busy`, `islet_unavailable`, `case_unavailable` and the rest) | `not_connected`; on a change, the unknown-outcome rule | "Service unavailable. Try again in a moment." |
| a case answer with 200 and `accepted: false` | the server's `reason` (most words match `caseReasons`) | the server's message |
| signed out, for an intent that needs a player | `sign_in_required` (new, additive) | a sign-in button; "Your progress on this device is kept." |

Every call also has these states (stream 5 builds them, and every later stream uses them):

| State | When | What shows |
|---|---|---|
| Loading | a read takes over 300 ms | a status line in the panel ("Asking the harbor…"); the canvas is never blocked |
| Empty | no crew, no positions, no bulletin, no wall entries | one plain sentence and the next action |
| Error | a 422, a 502 or an unknown code | a plain message, "Try again" and "Report a problem" |
| Offline | status 0 | a small banner; reads retry after 5, 15 and 30 s; writes wait for a tap |
| Session expired | a 401, or a failed renewal | the account host opens: "Sign in again; your progress on this device is kept." |
| Rate limited | a 429 | a countdown from `retryAfterSeconds` on the refused control, with the control disabled and words that say why |
| Stale save | a 409 `stale_save` | the conflict choice |
| Changed crew | a crew push, a `crew_busy`, a crew that ended | a re-read and one line: "Your crew changed." |
| Feature off | a 404 `feature_off`, or the flag is off | a closed sign; nothing loads |
| Not set up | the build lacks the sign-in values | "Sign-in is not set up on this build." Act 1 still plays |

## Checkpoint 0: finish the playtest releases, and make room for the adapter (small, pushed alone, tonight)
**Checkpoint 0 goes first because it unblocks both sides.** Testers get a complete build stamp and report button on the next release. Claude gets the header proposal it needs before sign-in goes live. And you get room on the title for the real adapter. It starts with committing your uncommitted work (Start, step 2).

### Stream 0: close the gaps in the build stamp and "Report a problem"
- **Goal:** every release says which build it is, and every tester can report a problem in two taps, with nothing private in the report.
- **Already built, keep it and its names:** `scripts/build-stamp.js` (`VERCEL_GIT_COMMIT_SHA`, then `git rev-parse --short HEAD`, then `dev`); `__BUILD_STAMP__` and `build-stamp.json`; `src/build/info.js` (Settings and Credits) and `src/build/badge.js` (the world badge, hidden on every `?demo=1` page); `src/diagnostics/` (`report-url.js`, `report-link.js`, `runtime.js`, `trace.js`, `ui-actions.js`); the link in Pause and Settings; `npm run test:build-stamp` and `npm run test:problem-report`; `tests/build-stamp.test.js` and `tests/problem-report.test.js`. Keep `dev` as the fallback word.
- **Routes:** none.
- **Build the gaps:**
  - the stamp as small text on the title, written into `index.html` at build time, so it costs no JavaScript bytes;
  - a `-dirty` suffix on a laptop build with uncommitted changes, and the word `preview` or `production` from `VERCEL_ENV` when it is set (validated against those two words);
  - the stamp in the "Copy numbers" text of `?perf=1`;
  - the issue title `[playtest <sha>] <place or screen>: `, for the tester to finish;
  - more allow-listed body fields, each from a fixed list: the open screen, the view mode (`online`, `unavailable` or `local`), the account state word, the browser family and major version, and the `?perf=1` summary when it runs;
  - adapter outcomes in the last-10 list, as `intent → accepted` or `intent → <reason>`, fed by the results of `sendCaseIntent`. Names come from `caseMethods` and reasons from `caseReasons`; never an argument;
  - a "What you expected" section, and the line "This report is public. Check the text before you submit it.";
  - **never throw on length:** drop the oldest actions first until the address is under 7,000 characters (today `createProblemUrl` throws a `RangeError`);
  - words on the button that say it opens GitHub, needs a GitHub account, and makes a public report;
  - a "Report a problem" link in every error state (through stream 5's state parts, so add the hook now and fill it in stream 5);
  - check on the first Vercel preview of your branch that the stamp shows a real commit, not `dev`. If it shows `dev`, file a request (Vercel's setting that passes system values to the build).
- **Done when:**
  - Vitest covers the new fields and the length rule: a crew code, a token-shaped value or a captain name planted in the context never reaches the address; a 300-action history never throws and stays under 7,000 characters; the stamp fallbacks include `-dirty` and `VERCEL_ENV`;
  - `test:build-stamp` finds the stamp on the title, in Credits and in the perf text, and `test:problem-report` checks the title format, the new fields and that nothing navigates to GitHub during the test;
  - `npm run test:loading` stays at most 21,080 bytes, and `npm run test:csp`, `npm test` and `npm run build` are green.
- **Note for Claude:** where the stamp's values come from, and any Vercel setting needed. A `playtest` label or an issue template would live in `.github/`, which is Claude's.

### Stream 1: room on the title, the adapter slot and the header proposal
- **Goal:** room for the real adapter without a bigger first load, one composition point for adapters, and the exact header block Claude needs before sign-in goes live.
- **Files:** `src/adapter/select.js`, `src/main.js` (one hook, through the coordinator), a new `scripts/security-headers.js`, `vite.config.js` (`previewSecurityHeaders`), `scripts/check-csp.js`, `CSP.md` and the new `HANDOFF-G9.md`.
- **Routes:** none.
- **Build:**
  - **Room on the title (do this first).** The cold title is 21,079 bytes at `bb7599e`, against a ceiling of 21,080. Read the local manifest for what the title graph holds, and move code the title does not need before its first paint behind a dynamic import. Candidates: the account summary, shell parts that open only on a click, and the journal parsing in `select.js` (only a few lines, because `main.js` imports `intro-journal.js` statically). Aim for at least 600 bytes of room. Never raise the ceiling in `check-loading.js`. If you cannot fit, stop this item, write the measured numbers into the note as a decision for Nils, and go on.
  - **The adapter slot.** `select.js` stays the one composition point:

| Situation | Adapter |
|---|---|
| `?case=local` on the dev server, or `?case=local` with `?demo=1` | the stand-in, as today |
| `?case=local` alone in a production build | the disconnected adapter |
| `?demo=1` without `case=local` | the disconnected adapter (the tour brings its own stand-in and never touches the live world) |
| every other page load | the real adapter, through one `await import()` of `src/online/case-adapter/` |
| the real adapter's chunk fails to load | the disconnected adapter, plus a notice |

  - The real factory returns at once. Its network start (the config, the session, `GET /api/me`, the save and the crew) runs in the background and publishes `case_updated`, so the title never waits for the network. Record in the note how long the title takes to appear, before and after. Until stream 2 lands, the real branch returns the disconnected adapter behind one constant.
  - **The sign-in return hook.** Add an empty hook in `select.js` for an address that holds `code` or `error` from the sign-in round trip. Stream 3 fills it with `auth.js`.
  - **The header proposal.**
    - `scripts/security-headers.js` returns the header set for a given Supabase address: today's policy, plus `https://<project>.supabase.co` and `wss://<project>.supabase.co` in `connect-src` when an address is given.
    - Once Claude's headers are on `main`, `vercel.json` is the source of truth. The module must then reproduce exactly its `headers` entry, under either `Content-Security-Policy` or `Content-Security-Policy-Report-Only`. Any extra directive you need goes to Claude as a request.
    - `vite.config.js` and `check-csp.js` both use this module, so the preview and the exact-string check never drift apart.
    - `npm run print:headers` (new) prints the `headers` block for `vercel.json`.
    - `frontend/CSP.md` holds the inventory and one line per origin with its reason. Check first whether supabase-js 2.118.0 in your configuration needs anything more (a Worker, or `blob:`), and avoid it if you can.
  - **The handoff file** holds the note template and requests R1 to R13.
- **Done when:**
  - the stream gate passes;
  - `test:loading` passes, and the note records how much room you gained;
  - `test:csp` passes with the policy from the module (without a Supabase address it is exactly today's policy);
  - a Vitest test pins the header builder with and without an address, and refuses any address that is not `https://<name>.supabase.co`;
  - a Vitest test pins the selection table, including `?case=local` alone.
- **Note for Claude:** the printed header block, the origin list from `CSP.md`, and "report-only first, enforce before the flag `sign_in` goes on" (R2, R3).

## Checkpoint 1: the real adapter, sign-in and the account (U1, part 1)
**After checkpoint 1 a player can sign in, finish Act 1, get a kit and a name, and keep a cloud save.** Claude can merge it at any time: production keeps sign-in hidden until Claude switches the flag `sign_in` on (R3), after the headers are enforced (R2).

### Stream 2: the real adapter core, proven by the same conformance suite
- **Goal:** a real adapter that passes the conformance suite just as the stand-in does, on recorded answers, with no network; and production checks that keep passing once it is the default.
- **Files:**
  - the new `src/online/case-adapter/`. Proposal: `index.js` for the surface and composition; `view.js` to compose all 24 keys from the held answers; `reasons.js` to map server codes to reasons and messages; `uid.js` to make one `actionUid` per click; `schedule.js` for the refresh timing, with an injected clock;
  - a new `src/adapter/shared/kits.js`: the kit display names and the archetype rule, moved out of `adapter/fake/` without changing a name, imported by both adapters;
  - `src/adapter/select.js` (the real branch) and `src/adapter/conformance/fixtures.js`;
  - `scripts/world-browser-tools.js` (one shared `/api/**` stub, through the coordinator);
  - the new tests `tests/real-adapter-conformance.test.js` and `tests/online-reasons.test.js`;
  - the new `scripts/check-online-golden.js` (`npm run test:online`) and `scripts/check-g9-regression.js` (`npm run test:g9`).
- **Routes:** `GET /api/config` and `GET /api/me` (both on `main`).
- **Build:**
  - `createRealCaseAdapter(deps)` takes injected parts: `api` (A2's `createApi({session, fetchImpl, timeoutMs})`), a public `api` without a token, `auth` (stream 3), a Realtime loader (stream 7), `clock`, `random`, `redirect` and `storage`. The production wiring imports the real modules, and tests pass fakes. There is no `dev` property.
  - The surface: `read()` (returns a clone the caller owns), `subscribe(listener)` (returns an unsubscribe function), `tick(dt)` (may do nothing), `dispose()` (stops timers, Realtime and listeners), and the 25 intents through `bindCaseMethods`.
  - The view has `mode: 'online'` (additive; screens only test for `'local'` and `'unavailable'`) and `schema: 1`. `revision` rises on every structural change, and `case_updated` publishes before an intent resolves.
  - Every view key is present from the first `read()`, with the safe empty parts of `emptyExtensions()` until data arrives.
  - Signed out, the adapter behaves like the disconnected one for Act 1: the local intro journal and local continuation keep working.
  - Check the arguments before any call, so empty probe arguments get a known reason (`invalid_request`, `confirmation_required`, `unknown_light` and so on) without a request. Catch every handler exception and answer `invalid_request`.
  - **Refresh the recorded answers** in `fixtures.js` to the real shapes. Today's answers are stale:
    - `GET /api/me` lacks `captainName`, `kit` and `place`;
    - the intro answer uses a kit id as `decision`, but the real values are `warned`, `trusted` and `none`;
    - `POST /api/crews` answers `{crew: {...}}`;
    - the save conflict code is `stale_save`;
    - `GET /api/board` does not exist; the case view is `GET /api/case`.

    Keep the recorder's redaction.
  - Register the real adapter with `defineAdapterConformance('real', factory, driver)`:
    - `driver.options` injects the recorded `api` and a redirect spy;
    - `prepare` queues recorded answers instead of calling `adapter.dev`;
    - `sequence` runs an accepted path (Act 1, then create a crew, then muster);
    - `assertProgress` checks the crew.
  - **Keep G8's production checks green from now on.** G8's browser checks fail on any console error and count any non-local request as external, and they stub only the weather. Once the real adapter is the default, its background `GET /api/config` would break them. So add one shared stub to `scripts/world-browser-tools.js`: a recorded `GET /api/config` with every flag off, and 503 for every other `/api/**` call, applied by every production check. Update the expectations of the checks that now meet the real adapter (for example `check-credits.js`, `check-experience.js`, `check-loading.js` and `check-production.js`), with assertions as strong as before.
  - `npm run test:online` runs a production build in Chrome. Every `/api/**` call gets a recorded answer, and every Supabase address is intercepted. It grows with every stream.
  - `npm run test:g9` runs G8's 31 commands plus the G9 checks (including `test:build-stamp` and `test:problem-report`), with `--phase`, `--keep-going` and `--resume` as in the G8 driver.
- **Done when:**
  - the stream gate passes, with the conformance suite green on both adapters;
  - `tests/online-reasons.test.js` covers every row of the mapping table;
  - `test:loading` shows the real adapter as a separate chunk that the cold title does not request;
  - `test:csp` and `test:g9` are green with the real adapter as the default;
  - a test proves that the real adapter's chunk imports nothing from `adapter/fake/`.
- **Note for Claude:** `mode: 'online'`, every reason you added, and the recorded-answer shapes you assumed.

### Stream 3: in-game sign-in with the Supabase library
- **Goal:** GitHub sign-in inside the game, a session that survives a reload and renews itself, and no use of `POST /api/auth/exchange`.
- **Files:** the new `src/online/auth.js` (with `realtime.js`, the only library user, and only lazily); `src/online/session.js` (feed it, and keep it memory-only); `src/adapter/select.js` (fill the return hook); `src/screens/account/`; `src/shell/account-host.js`; `src/shell/lazy-account.js`; `src/shell/credits.js` (one licence line).
- **Routes:**
  - no route of ours for the sign-in itself;
  - `GET /api/config` (on `main`) for `auth.provider` and the flags;
  - then `GET /api/me` (on `main`);
  - `POST /api/auth/exchange` (on `main`) stays for the check page only, until Claude retires it.
- **Build:**
  - The client reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public build values). Never commit them, never create `.env` files, and do not change Vite's `envDir`. Without the values, the account says "Sign-in is not set up on this build", and Act 1 still plays.
  - In a production build, show sign-in only when `GET /api/config` has `flags.sign_in === true` (R3). Dev builds always show it.
  - Use the PKCE flow only, GitHub only, and never the implicit flow. `signIn()` sets `account.state: 'signing_in'` and goes to GitHub through the library, returning to the game's own address.
  - Check first the exact function and option names in the installed package's type files, not from memory. Examples: `signInWithOAuth`, `exchangeCodeForSession`, `onAuthStateChange`, `getSession` and `signOut`, and the options `flowType`, `storage`, `persistSession`, `autoRefreshToken` and `detectSessionInUrl`.
  - **The return.** The selector loads `auth.js` at once when the address holds `code` or `error`. Exchange the one-time code, strip `code`, `error` and `error_description` from the address at once (`history.replaceState`), then load `GET /api/me`. An `error` return gives `account.state: 'error'` with a plain message.
  - **Storage.** Nils has not yet decided N11 ("may the sign-in survive a reload?"). The default is `sessionStorage`: it covers this tab only, survives a reload, and is gone when the tab closes. Put it behind one constant with three values: `memory`, `session` and `local`. Wrap every storage access in try/catch, and fall back to memory. Never read, log or copy the refresh token yourself.
  - **The PKCE code verifier needs to survive the trip to GitHub.** The library keeps it in the same storage as the session, so with `memory` (or the memory fallback) the exchange always fails. Give the library a small storage adapter that keeps the verifier key in `sessionStorage` whatever the constant says, and removes it right after the exchange. Test the `memory` setting's sign-in path too.
  - Load the sign-in module after the title is visible: at once on a sign-in return, otherwise when the player taps sign-in, or in idle time to restore a stored session.
  - **Renewal.** The library renews the access token, and every new token goes to `session.setToken()` (and to A4's `getAccessToken` in stream 7). A failed renewal, or a 401 after one renewal attempt, sets `account.state: 'expired'`, and `main.js` already opens the account host when that happens.
  - `signOut()` calls the library's sign-out and `session.clearToken()`, stops Realtime, and keeps the local intro journal.
  - **Tests never sign in for real.**
    - In Vitest, inject a fake client.
    - In browser checks, build with a placeholder address (for example `https://placeholder.supabase.co`) and answer its `/auth/v1/*` calls with Playwright interception.
    - Make fake tokens at run time. Never commit a string shaped like a key or a JWT.
    - A dev-only test sign-in may serve the dev server. It needs an inline `import.meta.env.DEV` gate and is set with `page.addInitScript`, never through the address. Prove that it is absent from the production bundle.
  - Add the Supabase client's licence to "Tools and licences" in `src/shell/credits.js`. Check first the licence files of the package and its parts in `node_modules`.
- **Done when:**
  - the stream gate passes;
  - Vitest covers the return handling and the address cleaning, the verifier storage, the storage fallback, expiry, renewal into `session`, and sign-out;
  - `test:online` signs in through the intercepted placeholder origin on a production build, reloads and stays signed in, then signs out;
  - `tests/online-api.test.js` and `tests/online-session.test.js` stay green. They forbid browser storage in `api.js` and `session.js`, so the library's storage lives only in `auth.js`;
  - `test:csp` is green with the placeholder origin in the policy, and `test:loading` is green.
- **Note for Claude:** the storage default (for Nils' decision N11), the exact return addresses for Supabase (R5), and that the game no longer calls `POST /api/auth/exchange` (R4).

### Stream 4: the arrival card, captain names, cloud saves, rewards and delete my data
- **Goal:** the account half of the view, on the real A2 and A3 routes.
- **Files:** `src/online/case-adapter/` (the account part), `src/screens/arrival.js`, `src/screens/account/`, `src/screens/rewards/`, and `src/story/intro-journal.js` (the adapter only reads it).
- **Routes:** `GET /api/me`, `POST /api/me/name`, `POST /api/me/name/reroll`, `GET /api/save`, `PUT /api/save`, `DELETE /api/me` and `POST /api/intro/complete` (all on `main`).
- **Build:**
  - **Name and account.**
    - `captain` and `account` come from `GET /api/me` → `{id, displayName, coins, crews, captainName, kit, place}`.
    - **Right after every sign-in,** call `POST /api/me/name` once (no body). It is idempotent: it names a new player and returns the existing name to a returning one, always with `rerollsLeft`. Do this before presence starts, so other players never see the placeholder name. `account.canReroll` is `rerollsLeft > 0`.
    - `rerollName()` → `POST /api/me/name/reroll {actionUid}`. `no_rerolls_left` becomes `name_reroll_used`. On `no_name_yet`, call `POST /api/me/name`, then retry once. `already_applied` means accepted.
  - **Act 1 and the arrival card.**
    - `completeIntro({ending, actions})` → `POST /api/intro/complete {actions}`, with nothing else in the body (1 to 300 ids of `a-z0-9_`; any other field is refused).
    - The answer `{ending, decision, readLog, kit {id, name, startPlace, coins, item {id, name, text}, cheapCard}, coinsPaid, alreadyGranted}` becomes `arrival`. `screens/arrival.js` prints `kit.item` and `kit.startLabel` as text, so give it those strings. `alreadyGranted` shows "Welcome back" instead of a second grant (the first Act 1 ending counts; a replay pays nothing).
    - Signed out at the end of Act 1: keep the actions in the intro journal and refuse with the new reason `sign_in_required` ("Sign in with GitHub to claim your kit. Your progress on this device is kept."). Show the sign-in button on the arrival card, and send the actions after sign-in.
  - **Cloud save.**
    - `GET /api/save` → `{version, data, updatedAt}`; `PUT /api/save {version, data}`, with `data` at most 100,000 bytes.
    - Save the replay of accepted actions (G7's rule), never an engine snapshot. Save after Act 1, on place changes, and at most once a minute while something changed.
    - `stale_save` → `account.save.state: 'conflict'`. `resolveSaveConflict('keep_this_device')` reads the current version and writes this device's copy; `'use_cloud'` loads the cloud copy.
    - Record the `data` shape in GRAPHICS.md.
  - `continueGame()` → `GET /api/save` plus `GET /api/me` (`kit` and `place`) → `continuation {source, kind, actions, place}`.
  - **Delete my data.** `deleteMyData({confirm: true})` → `DELETE /api/me {confirm: true}` → `{deleted: true}`, then sign out and stop everything. Without `confirm: true`, refuse locally with `confirmation_required`. A 503 means the outcome is unknown; deleting again is safe, so retry once. The words say that everything goes, the coin ledger included.
  - **Rewards.**
    - `balance` comes from the `coins` of `GET /api/me`.
    - `recent` and `ledger` come from the player's own `wallet_transactions` rows, read through the client in `auth.js` under row-level security (the policy "Players can read their own transactions" exists). Check first the columns and the wallet reasons in the database and wallet sections of `docs/INTERFACES.md`. Show the reason as a plain word and the amount only. Never show, log or capture a ledger reference.
    - Keepsakes, the epilogue and the festival badge stay empty (full version, or G13).
- **Done when:**
  - the stream gate passes, and Vitest covers every mapping and refusal;
  - `test:online` runs this path: sign in, the arrival card, a name with one re-roll and the second re-roll refused, a save, a conflict with both choices, continue, delete with two taps, signed out;
  - `test:a11y` covers the account states at 375 and 320 px.
- **Note for Claude:** the save `data` shape, the new reason `sign_in_required`, and any field you missed (R10).

### Stream 5: clear states for every server call
- **Goal:** no server call leaves a player without words. Every call has loading, empty, error, offline and expired states, and every refusal has a message and a next step.
- **Files:** `src/ui/kit/` (the state parts, including your started `call-state.js` and `server-call-state.js`), `src/adapter/intent.js`, `src/adapter/call-failure.js`, `scripts/check-call-states.js`, a new `scripts/check-online-chaos.js` (`npm run test:online:chaos`) and `tests/online-reasons.test.js`.
- **Routes:** every route in this prompt.
- **Build:**
  - Adopt and finish what you started (the call-failure messages and the call-state parts). Keep one small set of state parts in the UI kit: a status line, a banner, a countdown, a retry button and the "Report a problem" link. Words come first, and colour never carries a meaning alone.
  - A connection banner for offline, back online and slow (a read took over 5 s). Reads retry after 5, 15 and 30 s, then on a tap. Writes never retry by themselves, except under the unknown-outcome rule.
  - `retryAfterSeconds` becomes a countdown on the refused control ("Try again in 12 s"), with the control disabled and words that say why. Screen readers hear the start and the end of the wait, not every second.
  - Session expiry keeps local progress, reopens sign-in, and re-reads after the new sign-in. It never replays a write.
  - A changed crew (a crew push, a `crew_busy`, a crew that ended) re-reads the crew and the case, and shows one line: "Your crew changed."
  - The states table in "How server answers become adapter results" becomes a test, with one row per reason and its message and next step.
  - `test:online:chaos` injects each status (0, 401, 404 `feature_off`, 409 `stale_save`, 429 with `Retry-After`, 502 and 503) on every route group. It checks that the state shows, that focus stays in place, and that nothing is granted.
- **Done when:** the stream gate passes, `test:online:chaos` is green, and `test:a11y` is green for every state at 375 px.
- **Note for Claude:** every reason you added.

## Checkpoint 2: crews and live presence
**After checkpoint 2 a crew forms with a code and musters with NPC partners, and captains see each other in the harbor** (once Claude switches `live_presence` on).

### Stream 6: crews: create, join by code, seats and the muster (A6)
- **Goal:** the crew half of the view, on the real routes.
- **Files:** `src/online/case-adapter/` (the crew part), `src/screens/crew.js` and `src/world/partners/`.
- **Routes:** `POST /api/crews`, `POST /api/crews/join {code}`, `POST /api/crews/me/start` and `GET /api/crews/me` (all on `main`). Each answers `{crew: {id, code, status, mode, mySeat, startedAt, seats[4]}}` or `{crew: null}`.
- **Build:**
  - `createCrew()` → `POST /api/crews` (no body).
  - **Joining takes two taps.**
    - On the first tap, `joinCrew(code)` shows a local preview in `view.crew.joinPreview {code, seat: null, replaces: null, message}`, after normalising the code (case, spaces and hyphens are ignored; 1 to 20 characters). It sends no request, so no wrong guess is spent.
    - On the second tap, `joinCrew(code, {confirm: true})` → `POST /api/crews/join`.
    - Use Claude's preview if R9 lands.
  - `muster()` → `POST /api/crews/me/start`. The server fills the empty seats with NPC partners.
  - **Seats.**
    - The server sends `{seatNo, holder: player | partner | open, name, kit, partnerId, isMe}`. The screen needs `{seat, kind: player | npc | open, name, kit: {id, name} or null, isYou, archetype}`.
    - Kit names come from `src/adapter/shared/kits.js` (stream 2), the intro answer, or the case view's `kitName`. Never invent new ones.
    - `archetype` (art only) follows the shared rule. No player id reaches a screen. `crew.status` may also be `finished`.
  - `permissions` come from the crew state. Check first the stand-in's rule (who may muster, who may order).
  - **Refresh** with `GET /api/crews/me` after every crew change, every 5 s while the crew screen is open and the crew is forming, and on a crew push (stream 7).
  - The refusals follow the mapping table: `wrong_code`; a 429 → `too_many_tries` with the countdown (10 wrong codes in 10 minutes); `crew_full`; `crew_finished`; `already_seated` and `already_started`, which both mean done; `already_in_crew`; `kit_needed`; `crew_busy`; `no_crew`.
- **Done when:**
  - the stream gate passes, and Vitest covers the seat mapping, the preview and every refusal;
  - `test:online` creates a crew, lets a second captain join (a recorded answer), and musters so that two seats fill with partners, shown on the crew screen and in `world/partners/`. Three wrong codes and a 429 show the countdown;
  - `test:a11y` covers the crew screen at 375 × 400 px (a short viewport that stands in for the phone keyboard, which Playwright cannot open). The code field keeps `autocapitalize` and a fitting `inputmode`, and stays visible.
- **Note for Claude:** the polling interval while a crew forms (R8), and the preview choice (R9).

### Stream 7: live presence through A4
- **Goal:** other captains walk, wave and show their crew in the harbor, through A4's browser module, and only when the server flag is on.
- **Files:** `src/online/case-adapter/` (the presence part), `src/online/realtime.js`, `src/net/live-rules.js` and the other `src/net/live-*.js`, `src/world/others/`, `src/screens/presence/`, and `src/world/experience.js` (an unchanged caller).
- **Routes:** no HTTP route. A4's Supabase Realtime rooms `live:world`, `live:place:<placeId>:<room>` and `live:crew:<crewId>` arrive tonight with group 2. The flag `live_presence` comes from `GET /api/config` and stays off until Claude switches it on.
- **Build:**
  - After sign-in, and only when `flags.live_presence` is true and the build has the two public values, use `await import()` to load A4's `realtime.js` and call `startRealtime({enabled: true, playerId, getAccessToken, kit, crew})`. Otherwise set `presence.status: 'off'` and open no connection at all. Check first that A4's client (created with `accessToken`) and the sign-in client do not share one auth storage key.
  - `reportPosition({place, x, y, facing, moving})` → `live.setPlace(place)` when the place changes, and `live.update({x, z: y, facing, moving})`, with front → down and back → up. `setEmote(id)` → `live.emote(id)`; a `false` answer becomes `emote_cooldown`.
  - **Events into `presence`:**
    - `live_presence_changed` → `others`, `hiddenCount` and `crew`;
    - `live_peer_moved` → positions (z back to y, and up and down back to back and front);
    - `live_peer_emoted` → emotes;
    - `live_status_changed`: connecting or slow → `reconnecting`, live → `live`, offline → `offline`, off → `off`.

    A null name becomes "Captain". Kit ids become `{id, name}`. Player ids become opaque ids, from a per-session map inside the adapter.
  - **Emotes.** Your screens and the suite use wave, cheer, point, lantern and shrug, and the five sprites exist. A4's `EMOTES` in `net/live-rules.js` lists wave, cheer, nod, shrug, follow_me and help. Change A4's list to your five, together with its tests. Check first with `git grep` that no file under `backend/` or `supabase/` pins the list; if one does, stop and file a request.
  - **Crewmates.** `setCrew({id, memberIds})` needs player ids, which `GET /api/crews/me` does not send. By default, read the crew's `crew_seats.player_id` through the client in `auth.js` under row-level security (R7). If that read is refused, pass `{id, memberIds: []}`. The crew room still works, and the crewmate flags stay off.
  - **Crew pushes.** On `live_crew_updated {kind, data}`, re-read `GET /api/crews/me` when the kind is `crew_changed`, and re-read `GET /api/case` when `data.version` is above the held `writeRevision` (checkpoint 4).
  - `signOut()`, `deleteMyData()` and `dispose()` all call `live.stop()`.
- **Done when:**
  - the stream gate passes;
  - Vitest covers every translation (position, facing, emote, status, names, ids) with A4's fakes (`tests/realtime-fakes.js`);
  - `test:online` with a fake Realtime (no socket) shows two captains who appear, walk and wave, and "+N more" past eight;
  - with the flag off, no Realtime or library chunk is requested, and neither chunk is in the cold title.
- **Note for Claude:** the changed emote list (mirror it in `docs/INTERFACES.md` section 7), and the crewmate read (R7).

## Checkpoint 3: the islet, the Exchange and the other panels on the real routes
**After checkpoint 3 every merged panel works on the real routes, follows your Escape rule and reads well at 375 px.** This checkpoint builds on G8's handoff: the panel Escape checks and the `?islet=local` golden path were waiting for these panels. G10 merges group 3 (L4 v2, L5, A7) with its own fixes in `game.js` (the `hasOverlay` line and A7's `dispose()`); adopt them as they arrive and never redo them.

### Stream 8: the home islet build panel and the first building (L2)
- **Goal:** build the signal station on the real route, see it stand, and use it as the crew's third light.
- **Files:** `src/screens/islet/`, `src/world/islet/`, `src/screens/finale.js` (the build button) and the islet hook in `game.js`.
- **Routes:** both arrive tonight with group 2. They have no flag and go live once merged.
  - `GET /api/islet` → `{coins, timber, signalStationBuilt, playMoneyNote, spots[]}`;
  - `POST /api/islet/build {plot, type, actionUid}` → `{plot, type, name, level, coinsPaid, timberPaid, coins, timber}`.
- **Build:**
  - At the hook, give `attachIsletPanel({container, on, emit, resetInput, focus, transport, canAsk})` A2's `api` as `transport`, and "signed in" as `canAsk`.
  - After sign-in and at game start, read `GET /api/islet` once, so that `islet_changed` reaches `world/islet/state.js` before the first visit. Today the world learns about the islet only on arrival or when the panel opens.
  - `buildLight('islet_signal_station')` → `POST /api/islet/build {plot: 'islet_signal_station', type: 'signal_station', actionUid}`. Then re-read `GET /api/islet` (which emits `islet_changed`) and, once it exists, `GET /api/case`.
  - Map the islet codes to the finale's reasons: `not_enough_timber` → `materials_required`, `insufficient_funds` → `no_coins`, `plot_occupied` → `already_built`, `not_buildable_yet` → `light_not_ready`, and `already_applied` → done. Check first in the published case contract.
  - **The first building.** At the muster, if the station is not built yet, show "Build your signal station before nightfall: it is your crew's third light", with a button that opens the panel. The finale's build button uses the same intent.
  - Polish the panel in the pixel style at 375 px, and follow the one Escape rule. Keep the panel's overlay lines in `game.js` (`isBlocked`, `hasOverlay`, the gamepad `isPlaying` and the loop gate), so Escape never opens Pause over the panel.
- **Done when:**
  - the stream gate passes, and `scripts/check-islet.js` (L2's) is green;
  - the `?islet=local` golden path passes: build the station through the panel's local fake, see it stand in the world, and use it as the third light;
  - `test:islet:world` is green, and `test:online` builds the station from a recorded answer;
  - `test:a11y` and the Escape checks include the panel.
- **Note for Claude:** the code mapping you used, and anything in the panel that needed a server change.

### Stream 9: the Island Exchange market hall (L4 v2, X1)
- **Goal:** play-money positions in the market hall on the real routes, for the seven island companies and the five US stocks, clearly labelled as a simulation.
- **Starts when** group 3 is on `main`.
- **Files:** `src/screens/market/`, `src/world/places/case-spots.js` and the market hook in `game.js`.
- **Routes:**
  - `GET /api/market` (public) and `GET /api/market/portfolio` in the v2 shape;
  - `POST /api/market/open {companyId, side, stake, actionUid}` and `POST /api/market/close {positionId, actionUid}`;
  - trading needs the flag `market`. The price board works without it;
  - `POST /api/market/trade` disappears with v2, so never call it.
- **Build:**
  - At the hook, pass `getToken` to `createMarketEntry({container, resetInput, focusGame, openShareholderRegister, getToken})`. The price board uses the public client.
  - **One hotspot, two uses.** G8's `world/places/case-spots.js` also maps `market_hall` to a case search. Keep the panel first. Its "Read the shareholder register" button opens that search (`caseUi.open('search', {spot: 'market_hall'})`). Test both paths by keyboard, touch and gamepad.
  - The simulation note (the server's `simulationNote`, "Simulation with play money …") stays visible on every pane.
  - **Stocks are live.** Show a stock card whenever the server sends a price. Stocks trade only during US market hours: show `status: closed` with `opensAt` in Lisbon time, `stale` with its plain words, and `unavailable` as a closed card. A card without a price shows no stake controls.
  - **Credits.** The server's `credits[]` (Finnhub for the stocks, the island data source) go to Settings, then Credits (Nils' rule), not into the hall. If a licence seems to need a line next to the data, ask Nils.
  - A 429 (more than 10 per 30 s) shows the countdown. `feature_off` shows the price board with "Trading opens later". Show the open-position limit (20) and the daily stake cap from `rules`.
  - Polish at 375 px, follow the Escape rule, and keep the overlay lines.
- **Done when:**
  - the stream gate passes, with the panel's Vitest tests;
  - `scripts/check-world.js` is green (L4 v2 edits it);
  - a new browser check of the hall (a new `scripts/check-market-hall.js`, run with `npm run test:market`) covers the prices, a closed stock, a stale price, the positions, opening and closing a position from recorded answers, a 429 and the flag off, at 1280 and 375 px;
  - `test:a11y` includes the hall.
- **Note for Claude:** how stock companies arrived, and where the credits now show.

### Stream 10: the prediction kiosk (L5) and the Lantern Duels arena (A7), both going live
- **Goal:** both panels wired to the real routes and polished, because Claude switches their flags on once group 3 is merged and checked.
- **Starts when** group 3 is on `main`.
- **Files:** `src/screens/predictions/`, `src/screens/duels/` and their hooks in `game.js`.
- **Routes:** all arrive with group 3. All answer `404 feature_off` while their flag is off.
  - L5: `GET /api/predictions`, `GET /api/predictions/mine` and `POST /api/predictions/stake {questionId, side, amount, stakeId}`. `POST /api/predictions/settle` is host-only and gets no browser control.
  - A7: `GET /api/duels`, `POST /api/duels`, `GET /api/duels/{id}`, `POST /api/duels/{id}/move` and `POST /api/duels/{id}/cancel`.
- **Build:**
  - Hand A2's `api` to L5's `screens/predictions/adapter.js`, which passes a `noToken` function today. Hand `getToken` to A7's `openArena({container, resetInput, focus, getToken})`.
  - Wire every refusal of both panels to stream 5's states (stake caps, `pool_closed`, `already_staked`, `duel_taken`, `duel_expired`, `daily_pair_limit`, `insufficient_funds` and the rest), and the outcome-unknown 503 to the unknown-outcome rule.
  - While a flag is off (as `GET /api/config` reports), its hotspot (`prediction_kiosk` or `arena_gate`) shows a closed sign with one plain line and loads nothing. The sign turns into the panel within 5 minutes of a flag switch, without a reload.
  - Polish both panels in the pixel style at 375 px, follow the Escape rule, and keep the overlay lines. A7's modal must be removed on `dispose()` (G10 fixes this in the merge; keep it).
- **Done when:**
  - the stream gate passes, with both panels' Vitest tests;
  - a browser check per panel passes with its dev-only local fake (`?desk=local`, `?arena=local`) at 1280 and 375 px; `test:online` stakes once and plays one duel from recorded answers; and a "flag off" run in a production build shows the closed sign;
  - `test:a11y` includes both panels, and nothing of either panel loads while its flag is off.
- **Note for Claude:** anything either panel needs before its flag can go on.

### Stream 11: the harbor bulletin and the weather on the real route (W1, D1, H1)
- **Goal:** the bulletin, the tonight chip and the Chapter 2 hook read the real route, and stay off until Nils switches them on.
- **Files:** `src/online/case-adapter/` (the bulletin part), `src/adapter/conformance/bulletin.js`, `src/screens/bulletin/` and `tests/bulletin.test.js`.
- **Routes:** `GET /api/bulletin` (public; arrives tonight with group 2) → `{day, lines, weather, exchange, chapterTwoHook}`; `GET /api/weather` (on `main`; `state` and `tonight` arrive with group 2).
- **Build:**
  - Fill `bulletin` from `GET /api/bulletin` (public client) about every 5 minutes. A good answer gives `status: 'ready'`, with the route's fields unchanged. `503 bulletin_unavailable` gives `unavailable`. A network failure keeps the last good bulletin with a stale note, or gives `unavailable`.
  - Production keeps `status: 'off'` until the flag from R6 exists and is on.
  - `weather.attribution` may be `null` when Open-Meteo has nothing. Fix the validator in `adapter/conformance/bulletin.js` and its test.
  - `log.observations` comes from `bulletin.chapterTwoHook`, as in the stand-in.
  - Keep `net/weather.js` as it is. The HUD and the bulletin carry no credit, and `scripts/check-weather-wiring.js` asserts that.
  - Line 46 of `tests/bulletin.test.js` points at a private worktree path. Remove that fallback: after the merge, the test reads `../backend/content/bulletin.json` on `main`.
- **Done when:** the stream gate passes; the bulletin conformance and Vitest are green; `test:bulletin` is green with the real adapter on recorded answers; and a production build without the flag shows `off`.
- **Note for Claude:** the flag you need (R6), the docs update (R12), and that `attribution: null` is now handled.

## Checkpoint 4: the case on the real case routes (lands phase by phase from Sat)
**After checkpoint 4 a crew plays the whole case on the real server.** G10 builds the case backend in four phases behind a new flag `case`, and publishes the route contract and `case_fixtures` after phase 1, slice 2 (R11). Until then build against the shapes below. When the contract lands, it wins over this prompt. Turn its fixtures into your own recorded answers under `frontend/tests/fixtures/server/`, with every suspect id, card text, deduction text and reveal line replaced by a placeholder. Wire each phase's routes as they reach `main` (phase 1: the view, search, accuse; phase 2: the board and the night; phase 3: the world; phase 4: partner orders).

These rules hold for every case route:
- Every change answers `200 {accepted, reason, message, ...extras, case: <fresh view>}`. Apply the fresh view at once, without an extra read. A repeated `actionUid` answers 200 with `repeat: true`.
- Game refusals answer 200 with `accepted: false` and a `reason`, and most reason words match `caseReasons`. Where a reason has no entry, add it to `caseReasons` with a plain message and list it for Claude. Check first: the plan has, for example, `schooner_found` and `price_changed`.
- HTTP errors:
  - 401;
  - 404 `feature_off` (the case is not open yet: "The case opens soon"), `no_crew`, `no_such_route`, `no_such_card`, `no_such_suspect` and `no_such_light`;
  - 409 `crew_not_started`, `crew_finished`, `crew_busy` and `not_a_partner`;
  - 422 `validation_error` and `paid_errands_off`;
  - 429 `too_many_requests` (more than 10 case writes or 30 reads per 10 s per player);
  - 502 `database_error`;
  - 503 `case_unavailable` and `database_unavailable`.
- Every case route needs `Authorization`, except `GET /api/world`, which must never send it (use the public client).

### Stream 12: the case view and its refresh rules
- **Goal:** one held case view, always fresh enough, and never more than the server said.
- **Files:** `src/online/case-adapter/` (the case view and `schedule.js`). Touch a case screen only where it must change; prefer mapping in the adapter.
- **Routes:**
  - `GET /api/case` → `{case: View or null}` (phase 1);
  - `GET /api/world` → `{stage, lightsOn, fogBankGone, gullsRestOpen, extraLights, solves, relitAt, wall[{name, order}], line}` (phase 3; public and edge-cached; `404 feature_off` means the dark world).
- **Build:**
  - Map the View (`caseId, writeRevision, now, minute, crew, seats, me, premise, question, board, search, accusation, reveal, finale, credits, partners`) to the screen parts. Follow "Case view-model details for the real adapter" in GRAPHICS.md. The parts are `board`, `search`, `partners`, `finale`, `accusation`, `reveal`, `world`, `effects`, the crew seats, `now` and the clock. `credits` feed `rewards.contributors` and the reveal.
  - The adapter makes some parts itself, because the server sends none:
    - `effects`: ids rise, and each effect runs once. On the first snapshot after a reload, remember the state without playing anything;
    - `revision`, `partners[].archetype`, `search.clockLabel`, `finale.chartDescription`, `joinPreview` and `permissions`;
    - optionally, partner `life` (the travel and the chart line), derived from the job times as polish. Screens treat it as optional.
  - `log` and `hints` come from the case view and the intro journal, as in the stand-in, but they read only the view, never adapter internals.
  - **Clears only when earned.** A test feeds a view with unformed deductions and checks that the composed view holds no clearing data. A source check proves that the adapter holds no suspect list.
  - **Refresh rules:**
    - on a crew push with `data.version` above the held `writeRevision`, re-read `GET /api/case`;
    - when the earliest `remaining` reaches 0, re-read once after 0 to 2 s of jitter, at most once per 5 s;
    - otherwise poll every 30 s, or every 5 s while Realtime or its flag is off;
    - read `GET /api/world` every 60 s;
    - pause all polling while the page is hidden.
  - `{case: null}` (no crew, or a crew still forming) opens the crew screen.
- **Done when:**
  - the stream gate passes, and Vitest covers the mapping, the effect memory and the scheduler with a fake clock;
  - `test:online` shows the board, the searches, the partners and the finale from recorded answers;
  - `test:case` (the dev server with the stand-in) is still green.
- **Note for Claude:** every field you expected but did not get.

### Stream 13: the board and card searches
- **Goal:** pins, pairs and searches on the real routes.
- **Files:** `src/online/case-adapter/` (the board and search intents), plus `src/screens/board.js` and `src/screens/search.js` only if needed.
- **Routes:**
  - `POST /api/board/pin {cardId, actionUid}` (phase 2): card ids `C1` to `C8`; extra `coinsPaid`; reasons `card_not_held` and `already_pinned`;
  - `POST /api/board/pair {cards: [a, b], actionUid}` (phase 2): extras `deduction {id, name, finding, clearLine, opens, opensLine}` and `coinsPaid`; reasons `pair_cooldown` and `wrong_pair` (both with seconds), `not_pinned`, `different_seats_required` and `already_deduced`;
  - `POST /api/case/search {routeId, paidConfirmed, expectedPrice, actionUid}` (phase 1): route ids look like `C<n>.<name>`; extras `readyIn` and `coinsSpent`; reasons `lead_locked`, `already_have`, `wrong_kit` and `locked_window` (with minutes).
- **Build:**
  - Wire `pin`, `pair` (both drag and drop and the select fallback) and `search`, with `expectedPrice` set to the price the player saw. A changed price shows the new price and asks again.
  - `inspectSpot(spotId)` stays adapter-local. Take the spot's routes from the case view (`board.cards[].hotspot` and `routeId`, and `search.spots`). Check first in the published contract.
  - Show cooldowns as countdowns, and coins as a short credit line.
- **Done when:**
  - the stream gate passes, and Vitest covers every mapping and reason;
  - `test:online` runs two pins from two seats, a wrong pair with its cooldown, a right pair that forms a deduction, and a search whose job completes on the clock;
  - pairing works by touch and by keyboard.
- **Note for Claude:** the price-change reason you met.

### Stream 14: partner errands
- **Goal:** order NPC partners on the real route.
- **Files:** `src/online/case-adapter/` (the partner intents), `src/world/partners/`, and `src/screens/partners/index.js` only if needed.
- **Routes:** `POST /api/crews/me/orders` (phase 4).
  - Body: `{seat (1 to 4), order: fetch | man_light, target (a card or light id), allowPaid, actionUid}`.
  - Extras: `line`, `order {number, seat, order, target, orderedAt, arriveAt, foundAt, pinAt, readyAt, price}` and `coinsPaid`.
  - Reasons: `busy`, `wrong_kit`, `locked_window` (with minutes) and `not_ready`. A 409 gives `not_a_partner`, and `allowPaid: true` gives a 422 `paid_errands_off`.
- **Build:**
  - The partners screen offers only what the server allows. Orders that the weekend version lacks (G6's search, pin and wait) and paid shortcuts are refused locally, before any request, with a plain line (`order_not_allowed`).
  - Job progress comes from `partners[].job`, and the optional `life` from the order times. Pins credited to the orderer show on the board. A partner pin's 50 coins are paid when the order is accepted (Nils, C6), so show them then.
- **Done when:** the stream gate passes; Vitest is green; and `test:online` orders a fetch for a card and `man_light` for a light, shows each refusal, and shows the partner walking when `life` exists.
- **Note for Claude:** nothing, unless an order shape surprised you.

### Stream 15: the three-light night, the accusation, the reveal and the Relighting coast
- **Goal:** the finale and the end of the case on the real routes.
- **Files:** `src/online/case-adapter/` (the night, accusation and reveal parts), plus `src/screens/finale.js`, `accusation.js`, `reveal.js` and `relighting.js` only if needed. `src/screens/beam-math.js` stays the geometry.
- **Routes:**
  - `POST /api/finale/nightfall {actionUid}` (phase 2): extra `endsIn`; reasons `deduction_required`, `night_in_progress`, `dawn_wait` (with seconds) and `schooner_found`;
  - `POST /api/finale/post {light, actionUid}` (phase 2): lights `keepers_lamp`, `harbor_light` and `islet_signal_station`; extra `onPostIn`; reasons `night_required`, `light_not_ready`, `post_taken` and `already_on_post`;
  - `POST /api/finale/signal {light, bearing, actionUid}` (phase 2): bearing in [0, 360); extras `holdsFor` and `parted`, plus `lights` and `target` once parted; reasons `post_not_ready`, `post_not_owned`, and `aim_cooldown` and `off_target` (both with seconds);
  - `POST /api/case/accuse {suspect, actionUid}` (phase 1): extras `seconds`, `solved`, `world` and `coinsPaid`; reasons `already_solved`, `schooner_required`, `evidence_required`, `accusation_cooldown` and `accusation_refused`; a 404 gives `no_such_suspect`;
  - `GET /api/world` (phase 3).
- **Build:**
  - `callNightfall()`, `takePost(lightId)` and `aim(lightId, degrees)`, with degrees normalised to [0, 360) before sending.
  - When the view turns, play the effects once each: the three locks lead to `three_lights`, `fog_lift` and `schooner_reveal` (the stand-in's names).
  - `boardSchooner()` stays adapter-local (Nils, C18: presentation only). It is accepted only when `accusation.schoonerFound` is true; otherwise it answers `schooner_required`. The masked art loads only after boarding is confirmed.
  - `accuse(suspectId)`. A repeat answers the stored outcome.
  - `nextReveal()` pages through `case.reveal.lines` locally (solvers only). Reveal text exists only at run time: never in storage, the save, a capture or a problem report.
  - The Relighting coast reads `GET /api/world` (`stage`, `lightsOn`, `fogBankGone`, `gullsRestOpen`, `wall` and `line`). While the server's relight lock is on, a solve never changes the world (Nils, C9): show the dark world and the solver's own reveal and rewards. `claimLantern()` refuses locally with `festival_closed` (the festival is G13's).
- **Done when:**
  - the stream gate passes, and Vitest is green;
  - `test:online` plays nightfall, three posts, three aims and the parting, then one wrong accusation with its cooldown, one accepted accusation, the reveal pages and the Relighting coast in both the locked and the relit state. All texts and ids in the recorded answers are placeholders;
  - the spoiler guard is green, and no capture holds a reveal line, a suspect name or the culprit.
- **Note for Claude:** every reason you added, and any field the screens needed.

## Checkpoint 5: ready for players and the class
**After checkpoint 5 the browser side is feature complete, provably safe, fast, and playable with every input.**

### Stream 16: the stand-in stays in `?demo=1` and tests
- **Goal:** proof that normal play in production never uses the stand-in.
- **Files:** `src/adapter/select.js` and `scripts/check-production.js`.
- **Routes:** none.
- **Build:** prove the selection table in a production build:
  - normal play never builds the stand-in;
  - neither the cold title graph nor the real adapter's chunk imports anything from `adapter/fake/`;
  - `?case=local` alone gives the disconnected adapter;
  - the `?demo=1` tour runs its nine beats while every `/api/**` call answers 503;
  - the test sign-in code and the recorded answers are absent from `dist/`.

  (The shared API stub and the updated production checks were done in stream 2.)
- **Done when:** the stream gate passes; the bundle proof is part of `test:production` and `test:g9`; and `test:csp` and `test:presenter` are green.
- **Note for Claude:** the list of chunks that may import the stand-in.

### Stream 17: the strict security policy, final proof
- **Goal:** the exact headers Claude enforces, proven on every page and flow.
- **Files:** `scripts/security-headers.js`, `vite.config.js`, `scripts/check-csp.js`, `CSP.md` and a new `tests/security-headers.test.js`.
- **Routes:** none new.
- **Build:**
  - Run every page and flow under the policy with the placeholder Supabase origin: `/`, `/?demo=1`, `/asset-library.html`, `/ui-kit.html`, `/auth-check.html`, the signed-in golden path, the market hall, the islet panel, the kiosk and the arena. Expect zero violations, and zero requests to any other origin.
  - Finish "Security headers (G9)" in `CSP.md` (GRAPHICS.md links to it):
    - the final block;
    - each origin with its reason: the Supabase project over https for sign-in, renewal and the REST reads, and the same project over wss for Realtime. GitHub is only a page the player leaves for, which `connect-src` does not cover;
    - what is not needed: no fonts, images, frames or workers from anywhere else.
  - Suggest a `Permissions-Policy` only if it blocks nothing the game uses (gamepads, fullscreen, audio). Check first.
  - `tests/security-headers.test.js`: when `../vercel.json` has a `headers` entry, the module's output must equal it, under either `Content-Security-Policy` or `Content-Security-Policy-Report-Only`, so later drift fails `npm test`. If they differ, file the exact difference as a request; never change the test to match.
- **Done when:** the stream gate passes, and the extended `test:csp` is green.
- **Note for Claude:** the final block (R2), and whether it matches `vercel.json`.

### Stream 18: phone, touch, keyboard and gamepad
- **Goal:** every action works on a phone, by touch, by keyboard, by gamepad and with a screen reader.
- **Files:** `src/controls/` (`touch.js`, `gamepad.js` and `logic.js`), the screen and panel styles, GRAPHICS.md and a new `scripts/check-input-parity.js` (`npm run test:input`).
- **Routes:** none new.
- **Build:**
  - **One table in GRAPHICS.md, "Input parity (G9)":** every player action against keyboard, touch, gamepad and screen reader. Close every gap, in particular for:
    - walking and interacting, and the sea chart;
    - the board's pairing;
    - the finale's aim (it needs a control that works by touch and by stick, not only by dragging);
    - the emote picker and the crew code field;
    - the four panels, sign-in and the account, and the report button.
  - **The phone pass** covers every screen and panel at 375 × 812, at 390 × 844 and in landscape at 812 × 375:
    - respect the safe areas (`env(safe-area-inset-*)`);
    - the code field stays visible in a short viewport (375 × 400), standing in for the phone keyboard;
    - no control works on hover only;
    - pinch zoom stays allowed, and `touch-action` is set only where a control needs it.
  - **Gamepad parity** goes through `controls/gamepad.js`: dialog focus moves, A activates, and B goes back by the Escape rule. Use L2's `scripts/gamepad-browser-fixture.js` to drive browser checks if it fits.
  - `test:input` plays the golden path by keyboard only, by touch (Playwright `hasTouch` and taps) and through the gamepad fixture.
  - Update Nils' manual list (G8's fifteen-minute VoiceOver script, Safari, Firefox, a real phone and a real gamepad) for sign-in and the new panels.
- **Done when:** the stream gate passes; `test:input` and `test:a11y` are green at 1280, 375 and 320 px; and the parity table has no gap.
- **Note for Claude:** nothing, unless a server limit blocks an input.

### Stream 19: speed on the presenter laptop and the first load
- **Goal:** a first load no bigger than G8's, case screens and panels that load lazily, and the frame budget kept with the real adapter.
- **Files:** `src/shell/perf/`, `scripts/check-loading.js` (assertions only) and GRAPHICS.md.
- **Routes:** none new.
- **Build:**
  - A first-load table in GRAPHICS.md lists each part and when it loads: the cold title JavaScript (ceiling 21,080 bytes), the title CSS and HTML, the first world chunk, the real adapter, the sign-in module, the Supabase library, A4's code, and each case screen and panel.
  - `check-loading.js` asserts that the new chunks are dynamic entries and that the cold title requests none of them. Do not touch the byte ceiling.
  - `?perf=1` adds the adapter's requests per minute, the polling interval and the Realtime state to "Copy numbers" (the stamp is there since stream 0).
  - **The frame budget with the real adapter:** the harbor with eight live captains (a fake Realtime) and the night storm runs at 60 FPS and under 150 draw calls on this Mac. The adapter allocates nothing per frame, and polling pauses in hidden tabs.
  - Write a five-minute presenter-laptop check for Nils with `?perf=1`, in case the presenter laptop is not this Mac.
- **Done when:** the stream gate passes; `test:loading`, `test:presenter` and the frame checks are green; and no sample is more than 10 % worse than G8's measured budgets.
- **Note for Claude:** the first-load table.

### Stream 20: the golden path in a real browser, and the screenshot set
- **Goal:** one automated playthrough of the whole game in Chrome, and the class screenshots.
- **Files:** `scripts/check-online-golden.js` and `frontend/captures/`.
- **Routes:** every route above. `POST /api/host/case/clock` (host only) is used in part B only.
- **Build:**
  - **Part A (yours alone; it has been growing since stream 2):** `npm run test:online` plays the whole path on a production build, with recorded answers and the intercepted placeholder Supabase origin, at 1280 and 375 px. The path: sign in, Act 1, the arrival card, a name and a re-roll, a save, a crew, a second captain joins, the muster with partners, the islet station, a market position, a stake, a duel, pins and pairs, a search, a partner errand, nightfall, three lights, the accusation, the reveal, the Relighting coast, sign out, and delete my data.
  - **Part B (once R1 exists):** the same path against the API on `127.0.0.1:8000`, through the proxy of `npm run dev`. It uses the dev-only test sign-in and two browser contexts as two captains. With R1's host test player, it uses the host clock route to move the case clock forward. It never uses a real GitHub sign-in and never touches the live database.
  - **The screenshot set** for the class submission: about 20 named shots at 1920 × 1080 and at 375 × 812, saved in `frontend/captures/<date>_G9-Submission/` with a short index, at most 8 MB in total.
    - The shots: the title with the stamp, sign-in, arrival, the crew, the muster, the harbor with captains, the islet build, the market hall, the prediction kiosk, the arena, the board, a search, the partners, the finale night, three lights, the accusation gate, the Relighting coast, the account, an offline state, a countdown and the report button.
    - Use placeholder data only: no reveal line, culprit or cleared-suspect list from real data.
- **Done when:** part A is green inside `test:g9`; part B is green, or listed as blocked on R1; and the set is committed and indexed.
- **Note for Claude:** part B's status, and anything the path found in server files, with the exact failing step.

### Stream 21: how it works online, and clean evidence
- **Goal:** the class can explain the online half, and the repository stays clean.
- **Files:** `frontend/HOW-IT-WORKS.md`, `frontend/GRAPHICS.md`, `frontend/ASSETS.md`, `frontend/CSP.md` and the committed captures.
- **Routes:** none.
- **Build:**
  - In HOW-IT-WORKS.md, add a new section "Going online": how `select.js` picks an adapter, the sign-in round trip, one intent from the tap through the route to the view, the refresh rules, and why screens never fetch. Update the map, the reading path and the explain-back cards for `select.js`, the real adapter and `auth.js`.
  - In GRAPHICS.md, add "Real adapter (G9)", "Sign-in (G9)", "Server states (G9)", "Input parity (G9)" and "G9 verification", and link `CSP.md`. ASSETS.md lists every new sprite and sound.
  - Replace the absolute paths in committed capture logs and JSON with paths relative to `frontend/` (without rewriting history), and keep new captures within the evidence budget.
- **Done when:** the docs match the code, and a test or script finds no `/Users/` path under `frontend/`.
- **Note for Claude:** the sections Claude should mirror in `docs/INTERFACES.md`.

## Overflow: when checkpoints 0 to 5 are done, work down this list in order
Each item is small and shippable, with its own commit, its own check and a line in the checkpoint note. Push after every two or three items. Items marked "(no browser)" can be done fully in the cloud; all others need a browser pass.

1. Fix what the golden path, the chaos run and the phone pass found. **Done when:** each finding is fixed, or filed with a reason.
2. Accessibility fixes: contrast in the four panels, focus order, reduced motion everywhere, screen-reader labels, and polite live-region announcements for the new states. **Done when:** `test:a11y` covers them with zero findings.
3. Onboarding hints for first-time players (extend `src/shell/hints/`): sign in, claim the kit, make a crew, build the station, the first pin. Dismissed hints stay a device preference. **Done when:** Vitest covers the hint rules, and a browser check shows each hint once.
4. A "What's new" panel fed by a static release-notes file (new, for example `frontend/public/release-notes.json`, with one entry per checkpoint: its stamp and three plain lines). It opens from Settings, and once after an update. **Done when:** Vitest covers "new since last seen", and `test:csp` is green.
5. An end-of-case recap screen after the reveal: the crew credits, the time taken, the deductions formed (names only), the coins earned and the world outcome, all from the server's view. **Done when:** Vitest covers the mapping, and a browser check passes with placeholder data.
6. Small animations for case moments: a pin thud, a pair glint, a stamp when a deduction forms, a lock pulse within the safe-flash rule, and a coin tick-up. All stay still under reduced motion. **Done when:** the frame budget holds and the reduced-motion check is green.
7. Sound and music polish: themes per place, mix levels, and a sound check in Settings. Every cue keeps its caption. **Done when:** the caption check is green, and the levels are in ASSETS.md.
8. The Relighting coast and Gull's Rest (the place that opens after the Relighting) on every field the server adds. The festival, lantern claims and the duel ring are G13's: never build them. **Done when:** conformance and a browser check pass on recorded answers.
9. Polish of the keepsake gallery (`src/screens/rewards/`): good empty states until the server sends keepsakes, and the phone layout. **Done when:** `test:a11y` passes at 375 px.
10. The Exchange beat T1 in the `?demo=1` tour, but only if the market hall has a rehearsal mode that is safe in production. The tour stays under 3.5 minutes. **Done when:** `test:presenter` is green.
11. The tour's recorded weather (`src/demo/recorded-weather.json`) still names Torshavn; Nils moved the default place to Carcavelos. Relabel the place, keep the numbers. **Done when:** `test:presenter` and `test:demo` are green.
12. (no browser) Speaker notes in `src/demo/speaker-notes.js`: talking points on free hosting, the spoiler guard, real prices and the live server, for Nils to edit. Once G11's `docs/PRESENTER-SCRIPT.md` is on `main`, match its beats; never edit that file. **Done when:** the notes ship with no spoiler.
13. (no browser) Level 2 and 3 art for the islet buildings, made with the Pillow generator in `frontend/scripts/pixel_art/`, unused until an upgrade route exists. **Done when:** ASSETS.md lists the art and `test:art` is green.
14. "Copy build stamp" and a short "About this build" box in Settings. **Done when:** Vitest is green.
15. (no browser) A playtest guide in GRAPHICS.md for Nils and testers: where the stamp is, how to report, and what to try in each release. **Done when:** Nils can follow it in five minutes.
16. Refresh the screenshot set after the final merge on `main`. **Done when:** the index names the `main` commit.
17. (no browser) A long-line pass over the files G9 touched (lines over 200 characters), with no change in behaviour. **Done when:** the tests and checks give the same results before and after.

## Quality
- **Vitest covers all pure logic:** the reason and state tables, every view mapping (account, crew, presence, islet, market, kiosk, arena, bulletin, case), the scheduler, the effect memory, the address builder and its length rule, the stamp, the header builder, the selection table, the storage fallback, the PKCE verifier storage and the sign-in return.
- **The conformance suite runs on both adapters,** and every new field or reason is in the suite.
- **These must pass at the end:** `npm test`, `npm run build`, `npm run test:loading`, `npm run test:csp`, `npm run test:online`, `npm run test:online:chaos`, `npm run test:input`, `npm run test:a11y`, `npm run test:build-stamp`, `npm run test:problem-report`, `npm run test:market`, `npm run test:g9` (with G8's 31 commands), and L2's `scripts/check-islet.js` and L4's `scripts/check-world.js`. Add every new check to `package.json` and to GRAPHICS.md.
- **Docs:** the GRAPHICS.md sections (stream 21), `CSP.md`, ASSETS.md and HOW-IT-WORKS.md, with HANDOFF-G9.md up to date at every push.
- **Budgets:** the cold title at most 21,080 bytes; under 150 draw calls; G8's frame samples within 10 %; at most about 3 MB of evidence per checkpoint, and 8 MB for the screenshot set.

## Do not
- Edit anything outside `frontend/`, including `docs/STATUS.md`.
- Write server code, or call our routes from screens.
- Delete or edit `frontend/public/auth-check*`, or change an existing place id in `world/places/registry.js` without a request.
- Add npm packages (only `@supabase/supabase-js` 2.118.0, which arrives with A4), browsers, external assets or fonts.
- Commit keys, tokens, `.env` files, strings shaped like a key or a JWT, or absolute paths.
- Sign up for or sign in to any account, or run or dispatch GitHub Actions.
- Read Nils' private folder or other worktrees, or copy case data, reveal lines or the culprit's identity into `frontend/`.
- Touch G10's, G11's, G12's or G13's branches, or build the festival.
- Fill in the teammates' credit rows, or remove a credit line.
- Switch a flag on, change Vercel or Supabase settings, merge into `main`, or deploy. Claude integrates.
- Raise a budget or weaken a check without Nils' yes.

## Finish
- **Push** `feat/g9-real-adapter` at every checkpoint once its self-check passes. If a push fails, say so.
- **Report each checkpoint** with the note from "How to work on your own", committed in `frontend/HANDOFF-G9.md` and repeated at the end of your chat report. The note covers: what changed; what you verified, with exact commands and results; the browser pass; what you did not verify; what remains; the requests for Claude; the contract changes Claude must mirror; the decisions for Nils; and the branch with what you merged from `main`. Claude copies its first line into `docs/STATUS.md` when it merges.
- **When everything above is done,** keep going down the overflow list, and say in each note which item comes next.
