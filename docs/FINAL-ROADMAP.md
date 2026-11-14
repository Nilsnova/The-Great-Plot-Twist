# Final roadmap: from "works" to "excellent" by Mon 23 Nov

> **What this file is:** the plan for the last two weeks, ranked by what moves the grade most. Every task has an ID, a size and a "done when". No task belongs to a particular person: pick the highest open one that fits you (see [How to pick and claim a task](#how-to-pick-and-claim-a-task)).
>
> **Rules that come from the course** ([team project page](https://2477-introduction-programming.gitlab.io/wiki/team-project/)):
> - The repository link goes on Moodle by **Mon 23 Nov 2026, 23:59**. One member submits. Commits after the deadline do not count.
> - **Every member contributes code** to the repository, with their own GitHub account.
> - Presentations: **Tue 24 Nov or Fri 4 Dec**. A live demo at the deployed URL (no slides or video instead), then a repository walkthrough where staff can ask **any member about any part**: how it is built, why, its limits and how it could change.
> - The README must have the deployed URL, every member's name and student number, and the commands to run the app and its tests.
>
> **Direction changed on Tue 10 Nov:** the mystery is out; the game becomes island building, a shared trading Harbor and pirate-wave defense with friends ([PITCH.md](PITCH.md)). **The build lanes and their tasks are in [BUILD-PLAN.md](BUILD-PLAN.md)** and replace groups B and C below. Groups A, D, E and F here stay valid; skip anything that only concerns the mystery.
>
> Last updated: Tue 10 Nov 2026.

## Where we stand against the grading criteria

| Criterion (weight) | Today | What "excellent" means for us |
|---|---|---|
| 1. It works (20%) | Live, the smoke check passes, about 17,000 automated tests | Every demo workflow works on the projector and on phones, including invalid input, and a fallback exists if the network fails |
| 2. UI and UX (20%) | The new front door: Play, two clicks to the harbor, quest strip | A first-time player completes the class demo without help; every rejected action says why; works at 375 px |
| 3. Scope and ambition (20%) | Far beyond the solo project: multiplayer, live APIs, economy, duels, voiced cutscenes | Keep it. Add nothing big; polish what exists |
| 4. Verification (10%) | Accepted and rejected actions and edge cases are tested; all green on main | A one-page test map: what the tests cover and what they do not |
| 5. Security (10%) | No secrets, database rules on every table, 2 runtime npm packages, 0 known vulnerabilities | Every dependency pinned exactly; no dead routes; the class-code gate explained |
| 6. Repository walkthrough (20%) | **Biggest risk:** the codebase is large and so far one person committed | All four members can answer the walkthrough questions for every part, and each member has merged their own code |

The order of the tasks below follows this table: the walkthrough and the UX carry 40% between them and are where we can still gain the most.

## Phases

| Phase | Dates | Goal |
|---|---|---|
| 1. Release and lock the demo | Tue 10 – Thu 12 Nov | The class-code and email release is live; the Supabase account setup is done ([OPEN-TODOS.md](OPEN-TODOS.md), section 1); the two-phone test passed |
| 2. Team tasks | Wed 11 – Wed 18 Nov | Every member merges at least two pull requests from the task board; the walkthrough sheet is written and rehearsed |
| 3. Freeze and polish | Thu 19 – Sun 22 Nov | Only fixes after Thu 19; README final; two full demo rehearsals; the release checklist ([RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)) passes |
| 4. Submit | by Sun 22 Nov (deadline Mon 23 Nov, 23:59) | One member submits the link on Moodle; a named backup can submit if needed |
| 5. Present | Tue 24 Nov or Fri 4 Dec | Live demo with the [presenter script](PRESENTER-SCRIPT.md); everyone answers walkthrough questions |

## Task board

Value: ★★★ moves a 20% criterion, ★★ a 10% criterion or a clear risk, ★ nice to have. Size: S (under 2 hours), M (half a day), L (a day).

- [x] **T27: exact-angle captain shooting direction**, including diagonals, body/gun overlap
  and corrected grip hands, implemented in [PR #17](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/17).
  Ianno’s walkthrough part 30, test-map entry and reviewed eight-direction screenshot are included;
  checks passed; independent rehearsal and human review remain pending.

### A. Repository walkthrough (criterion 6, 20%)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| A1 | ★★★ | M | **Walkthrough sheet** [`docs/WALKTHROUGH.md`](WALKTHROUGH.md) (started 11 Nov; lane pages to be written by members): one page per part (browser game, Python API, database and rules, live multiplayer, external APIs, class demo, tests, deployment). For each: what it does, where it lives (paths), why it was built that way, its limits, how it could change. Include the course's three sample questions with our answers: where the data is stored, what the tests cover and miss, what happens when an external API is down. | Every statement links to a file; a teammate who did not write it can answer from it; reviewed by one other member |
| A2 | ★★★ | S | **Mock walkthrough**: each member answers 6 random questions from A1 aloud, 2 minutes each, without notes; write down the questions nobody could answer and fix A1 | All four members did it once before Thu 19 Nov |
| A3 | ★★ | S | **Folder guides**: a 5-line `README.md` in each top-level folder of `frontend/src/` and `backend/server/` that lacks one: what, why, limits, main entry file | Each folder has one; links checked |
| A4 | ★★ | M | **Architecture at a glance**: one diagram (Mermaid in Markdown) at the top of [ARCHITECTURE.md](ARCHITECTURE.md): browser → Vercel (static site + FastAPI) → Supabase (Postgres, Auth, Realtime) → external APIs | The diagram renders on GitHub and matches the code |

### B. UI and UX (criterion 2, 20%)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| B1 | ★★★ | M | **Hallway playtest**: 3 people outside the team play the class demo on a phone without help. Note every hesitation, question and wrong tap. Open one issue per problem, ranked | Notes and issues exist; the top 3 are fixed (B1 counts as done when the fixes are merged) |
| B2 | ★★★ | M | **Phone layout pass** at 375 × 812 and 390 × 844 on the demo path: title, Join, goal card, harbor, quest strip, duel, Keeper's Lock, lamps, Settings > Account | No overlap, no cut-off text, tap targets ≥ 44 px; before and after screenshots in the PR |
| B3 | ★★★ | S | **Feedback audit**: every rejected action on the demo path shows a plain message and a next step (wrong or old class code, duel declined or timed out, wrong lock answer, place not found, offline, email code wrong or expired) | A table in the PR lists each case with a screenshot; missing messages added with tests |
| B4 | ★★ | M | **Full-mystery first ten minutes**: apply the open points of [UX-SIMPLIFICATION.md](UX-SIMPLIFICATION.md) to the start of the full mystery (fewer clicks, clearer next goal) | Click count before and after in the PR; the golden-path check still passes |
| B5 | ★★ | S | **Slow network**: title → harbor on throttled "Fast 3G" in Chrome DevTools; add or improve loading feedback where the screen looks frozen | Recording or screenshots before and after |
| B6 | ★ | S | **Wind on flags** in the harbor (`frontend/src/world/wind.js`) | Flags move by whole pixels; low quality and reduced motion respected |
| B7 | ★ | S | **Staggered arrivals** in rehearsal `?demo=1&captains=40` so the arrival ripple plays (`frontend/src/class-demo/rehearsal.js`) | Ripples visible in rehearsal; perf still about 60 fps |

### C. Simplify the code base (helps criteria 5 and 6)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| C1 | ★★★ | M | **Dead code sweep**: find modules, routes, scripts and flags that nothing uses any more (for example the retired demo-window routes and UI, the `raid` flag if it stays off, scripts that drive removed title buttons). Remove them or say in the PR why they stay | Each removal has a "nothing references it" proof (search output); all tests pass |
| C2 | ★★ | S | **Docs diet**: move the ~90 dated notes in `docs/handoff/` and finished specs into `docs/archive/` and fix links, so a grader sees the current docs first | Link check clean; README links still work |
| C3 | ★★ | M | **One file, one job**: pick the 3 largest frontend files and the 3 largest backend modules; split only where a file mixes unrelated jobs; no behaviour change | Same tests pass; the PR explains each split in one sentence |
| C4 | ★ | S | ~~Old browser scripts~~ — done: removed with the mystery on 10 Nov | — |

### D. It works, including invalid input (criterion 1, 20%)

D1 current-demo sweep done in [#5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5) by Johannes Franz Lang (`frcola`); explain-back and human review pending. [Scope and limits](../specs/D1-invalid-inputs.md).

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| D1 | ★★★ | M | **Invalid-input sweep** on the demo workflows: empty, too long, wrong type and repeated requests for join code, email, lock answer, place search, duel challenge. Each must be rejected cleanly by the server with the house error shape | Done for the agreed current-demo scope in [#5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5). Valid repeats retain their route-specific behavior; email is checked at the Supabase client boundary. SQL/live checks are not claimed. |
| D2 | ★★★ | S | **Demo-day dry run** with the checklist in [OPEN-TODOS.md](OPEN-TODOS.md), section 2, on the real projector setup if possible; note every surprise | A dated note in the PR or OPEN-TODOS; problems become issues |
| D3 | ★★ | S | **API-down drill**: show what the player sees when weather, stock, crypto or sports providers fail (the fallbacks exist); add a short section to A1 | Screenshots and the A1 section |
| D4 | ★★ | S | **Host-console probes** for the new tables (`demo_class_code`, `demo_guests`) and the sports desk. Needs a small migration; write it, do not apply it (the project owner applies migrations) | Migration file + tests; the PR asks for review and application |

### E. Verification and security (criteria 4 and 5, 10% each)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| E1 | ★★ | S | **Test map** [`docs/TEST-MAP.md`](TEST-MAP.md) (started 11 Nov; lane rows to be written by members): per part, which test folder covers it, how to run it, what it does NOT cover (physical phones, 40 real users on one Wi-Fi, provider outages over hours) | Linked from A1 and the README |
| E2 | ★★ | S | **Pin every dependency exactly**: `backend/pyproject.toml` from `>=` to `==` (matching `uv.lock`), `playwright-core` in `frontend/package.json` without `^`; run `npm audit` and record the result | Lockfiles unchanged in substance; tests pass; audit output in the PR |
| E3 | ★ | S | **Busy-laptop timing check**: `test:g8`'s "one key skips each step quickly" fails under heavy load; measure in frames instead of milliseconds | Passes under load and at normal speed |

### F. Submission and presentation (must be done, not optional)

| ID | Value | Size | Task | Done when |
|---|---|---|---|---|
| F1 | ★★★ | S | **README final**: deployed URL, every member's name and student number, install / run / test commands in the first screen of the README | Each member checked their own line; by Fri 20 Nov |
| F2 | ★★★ | S | **Moodle submission** of the repository link by one member, with a named backup | Submitted by Sun 22 Nov; screenshot of the confirmation |
| F3 | ★★★ | S | **Presentation roles**: who drives the projector, who holds the two phones, who explains which part; two full rehearsals | Rehearsed twice by Sun 22 Nov |

T5 follow-up: island milestones implemented in [PR #10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10) by Ianno Hollensteiner: number-only rank shield, wave-25 statue and house-linked trees. [Spec](../specs/T5-island-decoration.md); explain-back completed; approval by Nils or Johannes Franz Lang pending. This does not complete A1 or any playtest task.

T7 from OPEN-TODOS: weekly island leaderboard implemented in [PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13) by Ianno; introductory explain-back completed after clarification; human review by Franz (`frcola`) pending. This completes only T7's walkthrough/test-map entries, not A1 or E1 as a whole.

## How to pick and claim a task

1. Take the **highest-value open task** you can finish in time. Prefer ★★★, and prefer A and B.
2. Check that nobody has claimed it: look for an open pull request or a branch with the task ID (`git fetch && git branch -r | grep -i <ID>`).
3. Claim it at once: create a branch `<type>/<id>-<short-topic>` (for example `feat/b3-feedback-audit`) from current `main`, push it, and open a **draft pull request** titled `[B3] Feedback audit`.
4. Work with your coding agent. Use the [agent prompt](contribute/AGENT-PROMPT.md).
5. Before asking for review: run the checks in the PR template, add screenshots for UI changes, and write the explain-back ([EXPLAIN-YOUR-CODE.md](contribute/EXPLAIN-YOUR-CODE.md)).
6. Another member reviews and approves; merge with a merge commit ([CONTRIBUTING.md](../CONTRIBUTING.md)). Tick the task here in the same pull request.

**Each member:** at least two merged pull requests of your own, and you can explain every part of A1, not only your own tasks.

## Out of scope until the deadline

New big features, new external services, new paid accounts, story or culprit changes, changes to the live database without the project owner, and anything that touches keys. If an idea is bigger than M, write it in [contribute/IDEAS.md](contribute/IDEAS.md) for "how it could change" in the walkthrough instead.

T26 UI follow-up: island Harbor weather access implemented in [PR #8](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/8), with [evidence](handoff/T26-weather-board.md); explain-back and human review pending. This does not complete A1 or the broader UI audits.

T28 UX follow-up: [Learn boss minigames with optional first-time practice](../specs/T28-minigame-introduction.md), owned by Ianno. Per player, island and minigame, including multiplayer; implementation done in [#19](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/19), with [evidence](evidence/T28/README.md). Ianno practiced all checkpoints; introductory explain-back completed after clarification; independent human review remains pending. This does not complete the broader UX audits.
