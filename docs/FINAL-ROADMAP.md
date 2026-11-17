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

**17 Nov perimeter candidate:** the [Draft workboard](contribute/PERIMETER-WORKBOARD.md), [implementation/explain-back guide](contribute/PERIMETER-REVIEW.md) and [integrated verification](evidence/PERIMETER-VERIFICATION.md) supersede older slice-only evidence checkpoints below. Functional implementation, the remaining under-150 rendering gate and independent human acceptance are recorded separately. This candidate does not close the full visual or land-expansion programme.

**17 Nov bounded VIS-35 follow-up:** same-wave core HP after optional travel ([#378](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/378)) is implemented in [Draft #379](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/379), with [focused evidence and limits](handoff/vis35-core-travel-rejoin.md). The parent visual task #364 remains open; this is not a merged or browser-accepted release.

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

**VIS54 home-tree clearance / Johannes:** implementation in [Draft #427](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/427) starts home-island foliage at 0.70 visual scale, retaining existing house growth, every tree foot/radius-0.48 blocker and all gameplay rules. [Focused evidence](evidence/VIS-54-tree-clearance/README.md): expected red 2 failures / 7 passes, then 8 pure files / 67 tests passed (6.45s), build and title budget passed. Actual composed desktop/phone screenshots, full/native checks, visual acceptance and human review remain open; no merge or rollout.

**Reference-village visual phase, 17 Nov / Johannes:** the [guide](contribute/REFERENCE-VILLAGE-REVIEW.md) maps 50 component Drafts and [fresh stage-nine actual images](evidence/reference-village-latest-review/README.md). All 13 supplied families/164 IDs are compiled; stage-nine capture/final checks share e874023f / frontend d76918ec after VIS52. [Final-source evidence](evidence/reference-village-checks/source-e874-review/README.md) passes 21 measured layout rows (three skipped); frontend has 4,586 passes / one unchanged 20-second timeout, with a11y 33/demo 34/build/budget/text passed, overall exit 1; native document proof passes separately (12 images / 33 actions per viewport), preserving both cache-read failures. Historical source-52 failures remain; VIS53/#421 tracks the upstream pose failure and an explicitly INCONCLUSIVE native diagnostic. VIS31 acceptance remains **open**. Matching backend proof is 262 route/unit plus 269 real-PG, not a full rerun. Scenery, human/device/balance, 12,554,858-byte/8MiB and land-expansion limits stay explicit. Documentation child [#387](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/387), Draft [#388](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/388); no PR merge to main or rollout.

**VIS49 current-main integration / Johannes:** [Draft #414](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/414) preserves newer main `ee5677ff` beside visual source `a4ecdce6`, with [50-path audit and affected pure evidence](evidence/VIS-49-latest-main/README.md): 24 files / 263 tests passed. Fresh combined full/browser/backend checks and independent human review remain open. No PR/main merge, live migration or rollout.

**VIS51 selected-wall visibility / Johannes:** implemented in [Draft #418](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/418), source `acc37240`. One foreground draw reuses the selected wall's actual quads/current material above foliage; normal buffers, paid position, HP and topology stay authoritative. [Evidence and limits](evidence/VIS-51-selected-wall-visibility/README.md): 50 pure tests passed across 7 files (2.68s); coordinator stage-eight before/after evidence at both sizes records selected-state calls 118→119 desktop / 115→116 phone, zero page errors/external requests. Exact frontend/public identity and separate VIS50 backend boundary are recorded. Combined checks and independent human/device acceptance remain open; no PR/main merge or rollout.

VIS48 QA (Johannes): [Draft #412](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/412), [scope and exact results](../specs/VIS-48-multiplayer-wall-observer.md), observes real textured wall buffers and rejects stale teardown remnants while retaining legacy/tower pip and all gameplay/timing checks. Focused 2 files / 38 tests passed (968ms); corrected native multiplayer remains pending. The unchanged 65.84-second baseline failed on the old wall observer. No runtime change or merge.

**Perimeter defense progress, 17 Nov / Johannes:** bounded implementation drafts are collected in the [review preview](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/chore/perimeter-integration-review); the [implementation/review guide](contribute/PERIMETER-REVIEW.md) maps actual contracts, migrations, evidence and remaining gates to [epic #241](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/241). The broader [visual roadmap Draft #239](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/239) is separate. This records progress, not rollout completion: drafts remain unmerged, new offers default off, and human acceptance/live application/activation remain open.


**V3 follow-up T19:** nearby building interactions implemented in [PR #7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7), with [visual evidence](evidence/T19/README.md) and Johannes's lane notes in [WALKTHROUGH.md](WALKTHROUGH.md). Human review is pending; the task row is in [OPEN-TODOS.md](OPEN-TODOS.md).

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
| B2 | ★★★ | M | **Island-target slice merged in [#58](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/58) and entry/full-lobby slice merged in [#61](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/61) (15 Nov); Harbor/menu slice in draft [#66](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/66); physical-device and remaining game-view checks open.** **Phone layout pass** at 375 × 812 and 390 × 844 on the demo path: title, Join, goal card, harbor, quest strip, duel, Keeper's Lock, lamps, Settings > Account | No overlap, no cut-off text, tap targets ≥ 44 px; before and after screenshots in the PR |
| B3 | ★★★ | S | **Connection-retry slice in draft [#38](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/38) and repeatable current-v3 audit in draft [#39](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/39); broader audit/review open.** **Feedback audit**: every rejected action on the demo path shows a plain message and a next step (wrong or old class code, duel declined or timed out, wrong lock answer, place not found, offline, email code wrong or expired) | A table in the PR lists each case with a screenshot; missing messages added with tests |
| B4 | ★★ | M | **Full-mystery first ten minutes**: apply the open points of [UX-SIMPLIFICATION.md](UX-SIMPLIFICATION.md) to the start of the full mystery (fewer clicks, clearer next goal) | Click count before and after in the PR; the golden-path check still passes |
| B5 | ★★ | S | **Slow network**: title → harbor on throttled "Fast 3G" in Chrome DevTools; add or improve loading feedback where the screen looks frozen | Recording or screenshots before and after |
| B6 | ★ | S | **Wind on flags** in the harbor (`frontend/src/world/wind.js`) | Flags move by whole pixels; low quality and reduced motion respected |
| B7 | ★ | S | **Staggered arrivals** in rehearsal `?demo=1&captains=40` so the arrival ripple plays (`frontend/src/class-demo/rehearsal.js`) | Ripples visible in rehearsal; perf still about 60 fps |

B3 current-game audit claimed by Johannes in [#30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/30). Help loading/retry implemented in draft [#31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31); shortcuts and the audit handover are tracked separately in #32. This does not mark the whole B3 row done.

B3 follow-up: Late arsenal replies stay with their original island, implemented in draft [PR #88](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/88), with [evidence](evidence/B3-arsenal-context/README.md). This completes only this slice; broader B3 and human review remain open.
B3 follow-up: Retry an arsenal load directly in its card, implemented in draft [PR #90](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/90), with [evidence](evidence/B3-arsenal-retry/README.md). This completes only this slice; broader B3 and human review remain open.
B3 follow-up: Closing a loading harbor cancels the old opening, implemented in draft [PR #92](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/92), with [evidence](evidence/B3-harbor-loading/README.md). This completes only this slice; broader B3 and human review remain open.
Approved U addition: Optional skill-aware comparison against the carried weapon, implemented in draft [PR #96](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/96) with [evidence](evidence/U-weapon-comparison/README.md). This completes only the approved addition; author and independent human review remain.

Approved U addition: Local inventory filters and grouped rack rows, implemented in draft [PR #98](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/98) with [evidence](evidence/U-arsenal-filters/README.md). This completes only the approved addition; author and independent human review remain.
Approved U addition: Preparation and upcoming unlocks before ringing the bell, implemented in draft [PR #94](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/94) with [evidence](evidence/U-wave-preparation/README.md). This completes only the approved addition; author and independent human review remain.

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
| E2 | ★★ | S | **Pin every dependency exactly**: draft [PR #108 by Ianno](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108) pins `backend/pyproject.toml` to `uv.lock` and `playwright-core` to `package-lock.json`; `npm audit` reports 0 vulnerabilities | Lock package records unchanged; backend tests 536,618 passed / 283 skipped; frontend first run: 3,389 passed / 1 `nearby-game` timeout; one controlled quiet full rerun: 3,390/3,390 passed (279/279 files, 491.55 s). Focused E2 and base runs pass 2/2 each. Build and budget pass; review remains. Ianno review and Franz (@frcola) current-revision approval remain. |
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

## Expansion backlog · 14 Nov 2026

The requested [defense and shared-island expansion](BUILD-PLAN.md#6-defense-and-shared-island-expansion) adds T29–T47, proposed by Ianno Hollensteiner. It preserves this grading/submission plan and the feature freeze. Start with investigation and reviewed contracts; schedule large implementation packages after the deadline unless the team explicitly revises the schedule. Existing T3/T5/T6/T7/T26 are extended, not replaced. Claiming, human review and merge rules above still apply.

The unified-recovery follow-up T54–T60 is claimed by Ianno. [PR #135](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/135) merged the approved plan; [PR #203](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/203) merged the core implementation. [OPEN-TODOS section 11](OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov) lists the current follow-ups and review status; [BUILD-PLAN](BUILD-PLAN.md#t54-t60-unified-recovery-delivery-gates) lists delivery gates. The T60 local four-page browser check passes, with exact scope and remaining authenticated recovery, egress, balance and retention gaps in [D059](DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16). Human review and release gates remain; no live migration, activation or deployment is authorized. PR #127 remains superseded; PR #128 is the earlier approved gameplay baseline.

Planning handover (14 Nov): roadmap/task expansion drafted by Ianno Hollensteiner; documentation checks completed. Implementation tasks remain proposed, not done. Peer review and explain-back are pending.

- [x] **B3 current-v3 feedback pass:** implemented by Johannes in drafts [#31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31) and [#32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32). [Audit, screenshots and limits](B3-FEEDBACK-AUDIT.md). This scoped pass does not claim the historical mystery/email workflows or live provider/multiplayer proof. Human review remains.


COC-07 scoped visual follow-up ([issue #148](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/148)): distinct neutral and role house-level silhouettes are implemented on `feat/coc-07-house-levels`, with [focused checks and limitations](../specs/COC-07-house-levels.md) and [before/after fixtures](evidence/COC-07-house-levels/README.md). This is one small feature slice; it does not mark the wider COC roadmap complete. Draft/human review and coordinated integration checks remain; no merge or release is claimed.

COC-13 scoped addition (Johannes): the first **between-wave wall-connection drawing** slice is implemented on `feat/coc-13-wall-connections`, tracking [#154](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/154). [Spec](../specs/COC-13-wall-connections.md) and [evidence](evidence/COC-13/README.md) describe the exact phase boundary. The whole COC-13 task is **not** marked complete: combat integration, central checks, Explain-back and independent human review remain. No merge or feature-policy change is claimed.

COC-39 local report slice: [issue #180](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/180), `feat/coc-39-defense-report`, responsible Johannes Franz Lang (`frcola`). A bounded local event collector and reachable read-only report menu are drafted. [Scope, exact checks and gaps](../specs/COC-39-defense-report.md). This does not mark the wider COC-40 report-navigation package or T54–T60 complete. Four component screenshots and focused checks are recorded; draft review and final coordinated checks remain. No merge.

COC-31 / Johannes: a first read-only base overview slice is implemented in [draft PR #196](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/196) on `feat/coc-31-base-overview` for [issue #172](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/172). [Scope and limits](../specs/COC-31-base-overview.md); [screenshots](evidence/COC-31-base-overview/README.md). The broad task stays open: village-mode selection handoff, author explain-back and human review remain.

COC-49, optional own-island village management: bounded implementation in draft
[PR #192](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/192), tracked by
[issue #190](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/190).
Not released or marked complete: focused evidence, Johannes's explain-back and
independent human review remain. No change to the existing freeze or merge rules.

COC-02 follow-up (Johannes, draft): current-base management fit view is a bounded implementation slice for issue #143 and depends on COC-49/PR #192. The parent camera task remains open; see [specification](../specs/COC-02-village-overview.md). No merge or full editor-camera completion is claimed.


WALL-06 pure validation slice (Johannes): trusted free-grid rules and inventory footprints are implemented in [Draft #271](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/271), with [scope and exact checks](../specs/WALL-06-free-grid-validation.md). Existing-policy behavior remains the default. Atomic admission/Move transport, service/wave integration and the real perimeter builder remain; the wider task is not marked complete. No migration application, activation or merge.


WALL-07 transport slice (Johannes): atomic wall-policy/layout reads and policy-fenced Move are implemented in [Draft #277](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/277), stacked on WALL-06. [Scope and exact checks](../specs/WALL-07-policy-snapshot.md). Direct transport tests passed; shared HTTP/view integration, real SQL and the actual perimeter lifecycle remain. No migration application, activation or merge.
WALL-03 bounded cohort slice (Johannes): the 128-piece catalogue adapter, complete bounded building reads and position-required browser recognition are implemented in [Draft #276](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/276), stacked on #271. [Checks and remaining handoffs](../specs/WALL-03-perimeter-cohort.md). This does not activate offers, complete layout/recovery integration or claim a working perimeter builder. No migration application or merge.

WALL-19 perimeter follow-up (Johannes): [Draft PR #275](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/275) adds bounded database identities and positioned-build/lifecycle guards for the 128-piece target. [Scope, dependencies and evidence](../specs/WALL-19-cohort-constraints.md). This is one required slice; it does not complete the perimeter wall feature, apply a migration or authorize release.

WALL-22 recovery/wire slice (Johannes): complete bounded 139-instance vectors, trusted perimeter snapshot inputs and public geometry-version compatibility are implemented in [Draft #297](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/297), stacked on #285. [Checks, internal/public version distinction and remaining SQL/start/lifecycle gates](../specs/WALL-22-perimeter-wave-state.md). No production acceptance, migration application or merge is claimed.

WALL-32 start fence (Johannes): the service-only owner-locked perimeter wrapper and explicit browser capability are implemented in [Draft #304](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/304), tracking [#303](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/303). [Scope, exact checks and remaining SQL/lifecycle gates](../specs/WALL-32-wave-admission.md). This does not activate or release the feature; independent human review remains.


WALL-28 owner integration (Johannes): [Draft #285](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/285), [issue #284](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/284), integrates trusted wall policy in own/visited/action views and existing additional-wall actions. [Exact checks and limits](../specs/WALL-28-owner-policy-view.md). Empty added inventory has no spatial view; paid positions survive paused placement. SQL/browser lifecycle and independent human review remain; no migration application or merge.

BASE-02 working-camera slice (Johannes): bounded Zoom in/out, drag pan and Fit are implemented in [Draft #270](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/270), with [scope and evidence](../specs/BASE-02-working-camera.md). Focused camera/gesture tests pass; actual before/after and coordinated broader checks remain. This does not complete the full parent, future land bounds or physical-device testing. No merge.

BASE-02 working-camera slice (Johannes): bounded Zoom in/out, drag pan and Fit are implemented in [Draft #270](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/270), with [scope and evidence](../specs/BASE-02-working-camera.md). Focused camera/gesture/mode tests: 30 passed; actual before/after interaction checks pass at both sizes. Coordinated broader checks remain. This does not complete the full parent, future land bounds or physical-device testing. No merge.

WALL-16 (Johannes): the route-preview durability correction is implemented in [Draft PR #268](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/268) for [#257](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/257). [Scope, executed red/green regressions and limits](../specs/WALL-16-durability-guide.md). Focused guide/pathing/research checks passed 68 tests in 4 files. Coordinated build/browser/capture evidence, explain-back and independent human review remain; no merge or whole-perimeter completion is claimed.

VIS-02 bounded cannon-material trial (Johannes): original code-painted stone/wood/metal detail and a shared world/combat Canvas verification fixture are implemented in [Draft PR #269](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/269). [Scope, checks and limits](../specs/VIS-02-cannon-style.md). Four focused files / 21 tests passed; actual browser captures, camera/terrain composition, visual acceptance, explain-back and independent human review remain. This does not mark the whole reference trial or visual roadmap complete. No merge.

WALL-23 bounded combat connection slice (Johannes): the wave renderer now reuses full-side wall topology driven by actual positive simulation HP, with cached geometry, explicit breach/restoration and owned cleanup in [Draft PR #278](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/278). [Scope and exact focused evidence](../specs/WALL-23-combat-connections.md). Four focused files / 31 tests passed; actual before/after captures, combined integration checks, explain-back and independent human review remain. This does not complete free placement, expanded wall allowance or the overall Wall Gameplay gate. No merge.

WALL-23 bounded combat connection slice (Johannes): the wave renderer now reuses full-side wall topology driven by actual positive simulation HP, with cached geometry, explicit breach/restoration and owned cleanup in [Draft PR #278](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/278). [Scope and exact focused evidence](../specs/WALL-23-combat-connections.md). Four focused files / 32 tests passed; actual before/after captures, combined integration checks, explain-back and independent human review remain. This does not complete free placement, expanded wall allowance or the overall Wall Gameplay gate. No merge.

WALL-29 perimeter-entry correctness (Johannes): [issue #287](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/287), [Draft PR #290](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/290). The selected frozen perimeter-wave option now starts new boarders exterior to standing wall footprints, preserving actual repaired-occupant egress and absent/false legacy behavior. [Reproduction, scope and exact checks](../specs/WALL-29-exterior-landing.md): measured 102-piece ring regression observed red, then four focused files / 40 tests passed. Trusted W22 transport, combined integration checks, explain-back and independent human review remain. No rollout or merge.

WALL-33 enable/quote API (Johannes): [Draft #302](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/302), [issue #301](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/301), adds owner-only monotonic admission, an off-by-default offer flag, canonical bounded quotes and trusted reset-epoch scope. [Exact checks/limits](../specs/WALL-33-perimeter-api.md). Paid construction/reconciliation and real SQL/browser lifecycle remain; no activation, live migration application or merge.

WALL-33 paid-build API (Johannes): [Draft #308](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/308), stacked on #302, adds permission-first receipt reconciliation and current-state/epoch validation before atomic positioned construction. [Exact checks/limits](../specs/WALL-33-paid-build-api.md). API fake evidence is separate from SQL/browser lifecycle acceptance. Existing receipts do not reconstruct reset/demolished pieces. No live migration application, activation or merge.

WALL-26 (Johannes): [Draft PR #282](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/282) implements the quoted-run client/controller and unknown-outcome reconciliation for [#280](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/280). [Scope and exact evidence boundaries](../specs/WALL-26-builder-controller.md). Actual controls/ghost integration is WALL-27 #281; full/browser checks, captures and human review remain. No full-perimeter completion or merge is claimed.


WALL-27 (Johannes): actual construction entry, quote/build/retry controls, keyboard/pointer routing and snapped wall/grid ghosts are implemented in [Draft PR #296](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/296) for [#281](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/281). [Scope and component evidence](../specs/WALL-27-builder-controls.md). Focused checks and a real Chromium DOM/index/pointer component pass are recorded; integrated server/fake/cohort behavior, actual-game paired captures, full perimeter lifecycle and human review remain. No merge.


WALL-37 (Johannes): optional fine positioning for the whole unpaid wall draft is implemented in [Draft #316](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/316), tracking [#315](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/315). [Contract and exact evidence](../specs/WALL-37-fine-position.md). Successful half-grid shifts require a fresh quote; unknown paid intents stay frozen. Focused and actual-phone component checks pass; combined full-game/capture/SQL evidence and human review remain. No merge.

VIS-19 raised-edge trial (Johannes): D062 keeps the analytic island top fixed while a bounded decorative rock base drives visual foam. [Draft PR #299](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/299), [specification](../specs/VIS-19-raised-cliffs.md), [actual desktop/phone before/after and limits](evidence/VIS-19/README.md). Seven focused files / 42 tests passed; corrected raster bounds, current wall/captain feet, decorative-base field and 38 ship-anchor centers passed. Combined build/UI checks and final visual/human acceptance remain. No land-growth, collision, saved-position, economy or naval-rule change; no merge.

WALL-39 health-read slice (Johannes): complete bounded 128-wall legacy reads and safe added-ID legacy-restore refusal are implemented in [Draft #318](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/318), tracking [#317](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/317). [Scope and exact focused checks](../specs/WALL-39-complete-health-reads.md). Client bounds and the full perimeter lifecycle remain separate; no activation, production claim or merge.

WALL-38 actual HTTP/SQL verification (Johannes): [Draft #319](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/319), [issue #312](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/312), proves production APIs purchase/reload/retry a measured 102-piece ring in four bounded runs and freeze all pieces in the first config-2 public wave. Actual health responses pass production client decoding; repeated-reset stale epoch refuses without expense. [Exact private-fixture checks/limits](../specs/WALL-38-http-sql.md). Browser/visual acceptance and human review remain; no live migration application or merge.

WALL-13 (Johannes): [Draft #323](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/323) fixes the reproduced legal-opening raster mismatch only for the frozen perimeter rules, forwards that mode to the guide and retains legacy behavior. [Implementation, 115 focused checks, bounded 128-shape timings and limits](../specs/WALL-13-perimeter-clearance.md). Actual aggregate browser/capture/device evidence and human review remain; no rollout or merge.

WALL-42 (Johannes): the actual-game construction-bar size regression is corrected in [Draft #330](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/330), [issue #329](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/329). Desktop grouping retains all copy, fine controls and 44px targets; the inventory count is explicit. [Scope, nine real Chromium component cases and remaining actual-game captures](../specs/WALL-42-compact-builder.md). Aggregate verification, before/after evidence and human review remain; nothing merged.

WALL-44 (Johannes): [Draft #336](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/336), [issue #335](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/335), corrects the verified phone construction workspace and truthful overlay camera framing. [Implementation, 10 real DOM cases, 13 camera cases and remaining actual-game probe](../specs/WALL-44-phone-workspace.md). Essential quotes/warnings and 44px targets remain; aggregate verification, actual before/after and human review remain. Nothing activated or merged.

WALL-24 local prototype evidence (Johannes): [Draft #322](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/322) records actual desktop/phone paid construction, reload, upgrade and frozen-demo combat checks with [paired screenshots and exact limits](evidence/WALL-24/README.md). The expanded phone workspace needs WALL-44 correction and superseding evidence. Human acceptance and production rollout remain pending; the wider task is not marked done. No merge or activation.

WALL-24 local prototype evidence (Johannes): [Draft #322](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/322) records actual desktop/phone paid construction, reload, upgrade and frozen-demo combat checks with [paired screenshots and exact limits](evidence/WALL-24/README.md). Corrected WALL-44 phone workspace and WALL-45 drawing pass on `76f66f3f`; the prior phone defect is preserved in historical evidence. Human acceptance and production rollout remain pending; the wider task is not marked done. No merge or activation.

WALL-24 local prototype evidence (Johannes): [Draft #322](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/322) records actual desktop/phone paid construction, reload, upgrade and frozen-demo combat checks with [paired screenshots and exact limits](evidence/WALL-24/README.md). Corrected WALL-44 phone workspace/visible labels and WALL-45 drawing pass on `525c2ab4`; the prior phone defect is preserved in historical evidence and a labeled software-before comparison. Human acceptance and production rollout remain pending; the wider task is not marked done. No merge or activation.

BASE-51 QA journey (Johannes): [Draft #342](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/342) preserves the intentional one-current-goal UI and every original assertion while exercising the lamp hint after real Wave/Defend progress. The documented demo command passes with 34 default report checks, errors `[]` and external requests `[]`; [source, raw log/report and current-goal proof](evidence/BASE-51-demo-journey/README.md). Optional performance mode, broader gates and human review remain. No runtime change or merge.

VIS-18 bounded static-art/retry implementation (Johannes): [Draft #362](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/362), [scope and focused evidence](../specs/VIS-18-static-art-retry.md), makes registered static landmarks adopt prepared art and exposes an actual Retry notice for failed main/static/wall artwork. 55 focused tests pass; combined desktop/phone screenshots, broader depth/handoff acceptance and human visual review remain pending. The whole VIS-18 task is not marked done. No activation or merge.

VIS-30 bounded source compilation (Johannes): [Draft #371](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/371), [implementation and exact proof](../specs/VIS-30-baked-world-art.md), delivers 13 selected families / 164 IDs with unchanged original images, exact maximum-density pixels and lossless PNG transport validation. Selected transfer including terrain falls from 29,819,059 to 12,554,858 bytes; the 8MiB target remains unmet. Eight focused files / 38 tests pass; runtime activation, broader performance/visual acceptance and human review remain coordinator work. The entire VIS-30 task is not marked done; no deployment or merge.

VIS50 finish guard (Johannes): implementation in [Draft #416](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/416), [issue #415](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/415), rejects malformed first recovery finish vectors without money/health/progress changes while preserving accepted-prefix fallback. [Exact red/green evidence and source boundaries](evidence/VIS-50-finish-checkpoint/README.md): 43 focused PostgreSQL lifecycle/perimeter checks passed, then 9 final strengthened guard checks passed; whole backend Ruff passes. Final composed verification, different-human review and any owner-applied migration remain open. No merge or live activation.

VIS52 responsive toast clearance (Johannes): implemented in [Draft #420](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/420), [issue #419](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/419). The existing HUD observer measures the Goals box so narrow-screen notifications clear wrapped, unfolded and restored Goals. [Identical-helper native red/green evidence](evidence/VIS-52-toast-clearance/README.md) preserves all three expected before failures and **3/3 after passes (8.92s)**, with unchanged component screenshots at 1280×720, 375×812 and both failing sizes. Full-game overlap, combined checks and human review remain open; no merge or rollout.
