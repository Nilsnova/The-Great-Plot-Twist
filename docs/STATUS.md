# Status: The Great Plot Twist

> **What this file is:** the living status page. It says what works right now, what each lane does next (with agent briefs ready to paste), and what happened, in a dated log.
>
> **Who uses it:** all four teammates and every coding agent. Read it before you start a task. The plan is in [FINAL-ROADMAP.md](FINAL-ROADMAP.md) and the story in [STORY.md](STORY.md).

**Rule for every agent.** When you finish a task:

1. add one line at the top of the [Log](#log) (newest first);
2. update [Right now](#right-now);
3. update [Next steps per lane](#next-steps-per-lane) for your lane.

Never write keys, tokens, passwords or student numbers in this file. If two pull requests both add log lines, keep both lines when you merge. Decision numbers (`D0xx`) and migration timestamps work the same way: take the next free one on `origin/main` when you open your pull request, and renumber yours at merge time if another merge took it first (the Exchange decision became D017 that way).

## Right now

**16 Nov / Nils — slots and badges (D060):** branch `feat/slots-and-badges`: the orange 🪓 badges of the battle guide are gone; four extra tower spots (`cannon_8`..`cannon_11`, after waves 10/20/30/40) behind the off-by-default flag `more_tower_spots`. Migration `20261117010000_more_tower_spots.sql` is not applied (paste `docs/handoff/apply-2026-11-17.sql`, then switch the flag on).

**16 Nov / Ianno — wall-record race:** [PR #86](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/86) is reconciled with main `a9386656`, preserving both status and walkthrough additions. The SQL fence is unchanged; on the new baseline 250 scratch PostgreSQL tests and 30 wall-route tests pass, Ruff is clean, and all 50 migrations parse. Ianno reviews the PR; Franz (@frcola) must approve its current revision before a human merge. Migration application remains separate.

- **Wall record race (#82):** [draft PR #86](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/86) is ready for human review; all scoped SQL/backend checks pass. Migration is not applied live.
**16 Nov / Ianno — shared defense recovery:** [draft PR #85](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/85) remains design only. Confirmed: Carpenter/Workshop automatic wall work continues during battle; a wall rebuilt and destroyed again starts a fresh recovery lifecycle, replacing its original deadline. The captain repair-skill/Engineer replacement is still undecided. Current-main scope also includes the new HP-bearing swivel. No recovery implementation is authorized.

**15 Nov, T33 persistent tower damage / Ianno:** [draft PR #85](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/85) contains design only; no implementation is authorized. The confirmed shared rule heals every HP-bearing defense with positive ending hp to full at wave end; destroyed defenses recover after 10 minutes or one subsequent wave, whichever comes first, only at an inactive-wave boundary. Scope is walls plus cannon/mortar/harpoon/culverin; watchtower and houses remain excluded. Player E repair/rebuild is disabled during new-policy battles; existing wall-only automatic Carpenter/Workshop repairs continue unchanged. Captain Shipwright repair skills and the Engineer wall-health combat bonus lose their current player-action effect; a compatibility treatment is undecided.

**Ianno / multiplayer pause — 16 Nov:** draft [PR #106](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/106) fixes a late pause click in the multiplayer browser check. Current-main reproduction passed revive, then reached the host Pause click with about 3 seconds left in the fixed 8-second break; the HUD closed before Playwright's existing 30-second click bound. The reordered check passed Pause/Resume, the 9-second hold, upgrade propagation while paused, and wave 4 in one full journey; that run later failed the musket pose check (`0 !== 2`, cause unresolved). One unchanged-bound rerun failed earlier because revive ticks differed by 0.7 s (`73.1 !== 72.4`). Focused co-op/HUD tests: 43 passed; full frontend: 279 files / 3,390 tests passed; build and spoiler guard pass. The full MP journey is not green. No game rules or permissions changed. Franz (`frcola`) must approve the current revision; Ianno manually reviews every PR.
**16 Nov, E2 / Ianno:** [draft PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108) pins the seven Python direct dependencies and Playwright to their existing locked versions. `uv sync`, Ruff, `npm install`, build and budget check pass; `npm audit` finds 0 vulnerabilities. Backend pytest reports 536,618 passed and 283 skipped. The first frontend full run had 3,389 passed and one 20-second `nearby-game` timeout. One controlled quiet full rerun then passed 3,390/3,390 tests in 491.55 s (279/279 files); focused reruns also passed 2/2 on this branch (32.06 s) and base a9386656 (34.38 s). No source, test or timeout changes were made. All 28 Python and 71 npm non-root lock records are unchanged. Review remains: Franz (@frcola) must approve the current revision, and Ianno also manually reviews every PR; the draft stays open.

**16 Nov, T48 / Ianno:** [draft PR #109](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/109) implements issue #107's bounded island leaderboard query. The service now asks a service-only SQL function for the top ten best winning runs, preserving D046 and the batched name/crew reads. Focused service tests (18), scratch SQL checks (6), full backend (536,612 passed / 289 skipped), Ruff and SQL parse pass; EXPLAIN covers 2,012 skewed qualifying runs. Migration `20261116100000` must be applied before deploying the backend; if merge triggers Vercel deployment, it must be applied before merge. No live application was authorized or performed. Keep the PR draft pending Franz (`frcola`) review of the current revision; Ianno manually reviews every PR. No agent merge.
**15 Nov, T35 / Ianno:** [draft PR #84](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/84) adds the off-by-default `tower_obstacles` frozen wave rule. Damageable tower footprints block movement and routing when standing; boarders detour or break them, boundary hacks and guide preview share the same tower state. Full frontend (274 files / 3,348 tests) passed before the final enclosed-boarder fix; the affected final suite passes 8 files / 76 tests, and build/budget pass after it. Backend (536,584 passed / 282 skipped), Ruff and 221 scratch PostgreSQL tests pass. The centered 8-tower workload keeps 300 boarders moving for 3,000 ticks in 1.897 s, with 111 field builds, 37 rebuilds and no stuck boarders. Two-client rule sync matches for 451 ticks; screenshots are [archived here](evidence/T35-tower-obstacles/README.md). The general `test:mp` script reaches the revive on both current branch and unchanged base, then times out later in pause/break UI checks. The three-seed wave-60 balance smoke is not sign-off. The migration is not applied and feature remains off; independent review and balance approval remain open.
**16 Nov, E2 / Ianno:** [draft PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108) pins the seven Python direct dependencies and Playwright to their existing locked versions. `uv sync`, Ruff, `npm install` and `npm audit` pass; audit reports 0 vulnerabilities. Structured comparison confirms all 28 Python and 71 npm non-root lock records are unchanged. Full pytest/frontend tests, build and budget check await the shared-machine slot; human review remains.
**15 Nov, B3 / Johannes:** Closing a loading harbor cancels the old opening in draft [PR #92](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/92). Closing the harbor during its first module load keeps it closed. Repeated opens share one download, and only the latest overview/weather intent opens. Obsolete errors and disposed views stay silent. [Evidence and verification](../specs/B3-harbor-loading.md). Login/APIs unchanged; author rehearsal and independent human review pending.
**15 Nov, B3 / Johannes:** Late arsenal replies stay with their original island in draft [PR #88](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/88). A buy, take or return requested on island A cannot replace inventory, coin display, messages or loadout after travel to island B. A completed server purchase is kept. [Evidence and verification](../specs/B3-arsenal-context.md). Login/APIs unchanged; author rehearsal and independent human review pending.

**15 Nov, B3 / Johannes:** Retry an arsenal load directly in its card in draft [PR #90](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/90). An initial arsenal read failure offers Try again. During a read the control says Opening… and is disabled. Success removes the error state; Escape and close still work. [Evidence and verification](../specs/B3-arsenal-retry.md). Login/APIs unchanged; author rehearsal and independent human review pending.

**15 Nov, B3 / Johannes:** Closing a loading harbor cancels the old opening in draft [PR #92](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/92). Closing the harbor during its first module load keeps it closed. Repeated opens share one download, and only the latest overview/weather intent opens. Obsolete errors and disposed views stay silent. [Evidence and verification](../specs/B3-harbor-loading.md). Login/APIs unchanged; author rehearsal and independent human review pending.

**15 Nov, U / Johannes:** Optional skill-aware comparison against the carried weapon in draft [PR #96](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/96). [Implementation, checks and limits](../specs/U-weapon-comparison.md); login/API contracts and game rules unchanged. No merge; human review pending.

**15 Nov, U / Johannes:** Local inventory filters and grouped rack rows in draft [PR #98](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/98). [Implementation, checks and limits](../specs/U-arsenal-filters.md); login/API contracts and game rules unchanged. No merge; human review pending.
**15 Nov, U / Johannes:** Preparation and upcoming unlocks before ringing the bell in draft [PR #94](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/94). [Implementation, checks and limits](../specs/U-wave-preparation.md); login/API contracts and game rules unchanged. No merge; human review pending.


**14 Nov, B2 / Johannes:** [draft PR #58](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/58) removes four 40px island-button overrides: Hire crew, Move, Tear down and Players now use the existing 44px kit minimum. Four browser cases and real fake-game before/after captures at 375x812, 390x844 and 1280x720; [measurements/limits](evidence/B2-phone-targets/README.md). Full frontend: 260 files / 3,206 tests; build/budget/text lint, accessibility 33 screens and demo 33 checks pass on main `4d83dcd`. Login/APIs unchanged; draft, author and human review pending. Full B2 and physical-device checks remain open.
**14 Nov, B2 entry/lobby / Johannes:** [draft PR #61](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/61) fixes visually truncated captain names in full phone lobbies: a small mobile grid lets names wrap and puts status below. Seven focused cases, plus a repeatable 21-panel title-to-lobby fake-game audit at 375x812, 390x844 and 1280x720. Full frontend: 260 files / 3,209 tests; build/budget/text lint, accessibility 33 screens and demo 33 checks pass on the branch from main `4d83dcd`. [Before/after, entry audit and limits](evidence/B2-entry-lobby/README.md). Login/APIs unchanged; independent of #58. Draft; author/human review, physical phone/keyboard and remaining B2 game views are open.

**15 Nov, morning (Nils, agent-assisted).** Nils reviewed and **accepted D039–D049** (teammates may still comment). Merged: README members table (#68), `fresh_start.sql` clears the sprint tables (#69), `check-loading.js` brought up to date after D031 (#70), and Johannes's B2 phone fixes #58 and #61 with a small phone-width fix for the game-choice dialog (#71). Moodle submission of the repository link: by Mon 23 Nov 23:59 (plan: Sun 22 Nov).

**12 Nov, T19 / Johannes:** [draft PR #7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7) makes
building clicks use E's existing reach and preserves priority for wave/revive actions. Frontend:
**2,753 tests passed**; build, budgets and text lint pass; accessibility **33 screens / no failures**;
demo **33 checks / no errors**. [Before/after evidence](evidence/T19/README.md). No login/API changes;
physical phones, live multiplayer and human review remain separate checks.

**14 Nov, B3 help / Johannes:** draft [#31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31) makes How to play loading/failure recoverable. Frontend 3,036 tests passed; build/budget/text lint pass; a11y 33 screens with no failures; demo 33 checks with no errors. [Component captures](evidence/B3-help/README.md). Shortcuts/audit handover are tracked separately in #32; login/APIs unchanged.

**14 Nov, B3 / Johannes:** current-game feedback pass in independent drafts [#31](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/31) and [#32](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/32). Help/shortcuts loading, failure and recovery fixed; [audit/evidence/limits](B3-FEEDBACK-AUDIT.md). Each branch: 3,036 frontend tests passed; build/budget/text lint, 33 accessibility screens and 33 demo checks pass. Login/APIs unchanged. Author explain-back and independent human review remain; no merge without Johannes explicit OK.

**14 Nov, B3 / Johannes:** [draft PR #38](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/38) adds visible pending/retry-failure feedback and stale-response protection to the connection banner. Six regression cases; full frontend 244 files / 3,042 tests, build/budget/text lint, accessibility 33 screens and demo 33 checks passed on main `908d376`. [Evidence and limits](evidence/B3-connection/README.md). Callback failure is injected, not a verified live outage; login, adapter and APIs unchanged. Draft; author and independent human review pending.

**14 Nov, B3 / Johannes:** [draft PR #39](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/39) makes the existing feedback audit reproducible: eight component cases at two sizes, recovery/disabled-action/callback assertions, screenshots and JSON report. `16 cases passed; browser errors: 0; external requests: 0`; full frontend 243 files / 3,036 tests, build/budget/text lint passed on main `908d376`. [Command/evidence/limits](evidence/B3-repeatable/README.md); [next proposals](handoff/B3-next-proposals.md). Test tools only, independent of #31/#32/#38; author and human review pending, no merge.

**14 Nov, B2 Harbor/menus / Johannes:** [draft PR #66](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/66) keeps long team words readable by stacking match-side choices up to 480px; coin choices and existing rules stay unchanged. Thirty layout cases for ten views at three sizes plus six interaction/help cases pass. Final frontend: 260 files / 3,240 tests; build/budget/text lint, accessibility 33 screens and demo 33 checks pass on the branch from main `86b01d9`. [Before/after, menu matrix and limits](evidence/B2-harbor-menus/README.md). Login/APIs untouched; independent of #58/#61. Draft; author/human review, physical devices and remaining game cards stay open.

**14 Nov, ~22:05 UTC: `pathing` is live.** Nils accepted the closed-ring gap (D040: at wave 60 a closed wall ring is 12 to 18 points harder with pathing), so `pathing` was added to production `FEATURE_FLAGS` and redeployed. Checked after the redeploy: `/api/config` shows all new flags on (`islands`, `rescue`, `wall_recovery`, `placement`, `defenses_v2`, `arsenal`, `tower_health`, `pathing`), `/api/health` answers 200, and Vercel shows no runtime errors in the last hour. Every T29–T47 feature is now live; what the paragraph below says about `pathing` being off is superseded. Players should reload old tabs.

**14 Nov, late evening, T29–T47 sprint (Nils, agent-assisted): state tonight, ~21:55 UTC.** Merged this sprint: PRs #20, #29, #33–#37, #40–#53 and, since the last docs pass, #54, #56, #59, #62 and #63. **Applied live and registered in `schema_migrations`:** `20261114100000_wall_recovery`, `20261114110000_island_layout`, `20261114120000_arsenal`, `20261114130500_wave_rules` and `20261114140000_culverin` (the plot rule for the culverin and the wave-rule names, including `defenses_v2`); the arsenal conversion `arsenal_convert_personal_weapons()` was run once (1 copy converted, 0 islands left with personal weapons). **Production `FEATURE_FLAGS` on:** `live_presence`, `market`, `arena`, `sign_in`, `demo`, `sports`, `islands`, `placement` (~19:45 UTC, after the release check [PR #49](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/49)), `wall_recovery` (~20:28, after the finish guard of #52 and `test:walls`), `arsenal` (~20:48, after [PR #53](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/53)), `rescue` (~21:05, after the release check [PR #54](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/54)), `defenses_v2`, the culverin (~21:53, after the wiring of [PR #56](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/56) and the release check [PR #62](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/62)) and `tower_health` (~21:53, after the balance check of [PR #59](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/59)). **Off:** `pathing`. **Why `pathing` stays off:** at wave 60 a closed wall ring is 12 to 18 points harder than with no rules (80 seeds: 51 % with pathing and 45 % with both rules, against 63 % with none); the retune of #59 (`WALL_ENGAGE` 3, boarder `towerReach` 1.5) fixed every other case. Fixing the ring needs a `sim.js` change or a team decision, see [specs/T33-T35-balance.md](../specs/T33-T35-balance.md). `tower_health` is on, but on today's routes it plays like no rules (boarders rarely reach a tower); its balance check passed. [PR #63](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/63) fixed the flag-on-mid-wave bug: a wave keeps the rule set of its first answer even when that set is empty. Live for players: wall recovery, flexible placement, the arsenal, the co-op policy, the minigame curves, the last-chance rescue, the culverin, tower health (nearly invisible so far), the Harbor forecast line, the all-time leaderboard and statue stages. Merged but off: targeting/pathing in the sim. **Care points:** a player with an old tab should reload after a flag flips; do not switch `defenses_v2` off while culverins are built without a plan (the server then hides them). All of it is still **proposed** in the decision log (D039–D049): the fast-track D047 agreed the merge order only, and the peer review comes after. Known follow-ups are in [OPEN-TODOS section 9](OPEN-TODOS.md#known-follow-ups-from-the-sprint-14-nov); the reading guide for the review is [SPRINT-T29-T47-GUIDE.md](SPRINT-T29-T47-GUIDE.md) (section 15 is new: balance harness, retune, wave rules kept once). The live state was checked by the coordinator on 14 Nov; this repository cannot prove it, so check `GET /api/config` and the migration list before relying on it.

**14 Nov, T29–T47 review guide (docs only):** [SPRINT-T29-T47-GUIDE.md](SPRINT-T29-T47-GUIDE.md) is a beginner walkthrough of everything merged in the sprint (PRs #33–#44): per feature the player view, flag, files, code walk, tests and three explain-back questions, plus how flags and migrations fit together and a suggested review split. Read it before the walkthrough; D047 merged these lanes without prior review.

**14 Nov, T29–T47 / Nils (agent-assisted): fast-track sprint.** Ianno's roadmap ([PR #20](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/20)) is merged. Nils's agents work on T29–T47 in eight lanes. Each lane has its own claim issue and branch: wall recovery #21, targeting/pathing #22, flexible placement #23, arsenal #24, co-op policy #25, minigames/rescue #26, Harbor/weather #27, highscore/statue #28. **Nils decided ([D047](DECISIONS.md)) to merge these lanes to `main` as soon as each one is green, without waiting for peer approval first.** Review happens after the merge, so please look at the merged PRs and comment or reopen anything you disagree with. Merge gate: `npm test`, `npm run build`, `npm run test:mp`, the GitHub sign-in checks and backend `pytest`/`ruff` all pass. Any feature that needs a new table ships behind a new feature flag that is off by default, so the live game keeps working until the migration is applied and the flag is switched on (each one a separate, announced step). The proposed design decisions are D039–D046 and are open for team comments.

**14 Nov, T28 / Ianno:** [Boss minigame introduction and optional first-time practice](../specs/T28-minigame-introduction.md) is implemented in [PR #19](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/19), from main `50cab125`. Per player/island/task; shared real result. Frontend: 2,989 tests, build/budget/text lint, 33 accessibility screens, 33 demo checks and the four-page practice/skip barrier pass. [Evidence and checkpoints](evidence/T28/README.md). Ianno reports having practiced all tasks; introductory explain-back completed after clarification; independent human review remains pending.

**14 Nov, T27 (Ianno):** [PR #17](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/17)
adds only exact-angle musket aiming, upright directional body views and body/gun overlap. Frontend tests (2,980), build, budget, text lint, accessibility (33 screens), demo (33 checks), two-page angle graphics and four-page fake-room multiplayer pass. The eight-direction montage is in WALKTHROUGH part 30. Coached explain-back discussed; independent rehearsal and human review are pending.

**14 Nov, T7 / Ianno:** [PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13) implements the weekly island leaderboard. Highest win per island this UTC week, up to ten rows, shared islands counted once; Harbor noticeboard and medal badges. [Evidence and limits](handoff/T7-weekly-leaderboard.md). Introductory explain-back completed after clarification; Franz (`frcola`) is the requested reviewer. Independent human approval and live database/deployment verification remain pending.

**14 Nov, T27 / Ianno:** proposed a [captain shooting-direction task](OPEN-TODOS.md#2-open-tasks-you-can-pick-small-independent-updated-thu-12-nov). Planning only; implementation has not started.

**13 Nov, T5 / Ianno:** [PR #10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10) adds a number-only rank shield above/right of the cabin, a wave-25 statue and trees at 100%, 110% or 120% size for zero, one or two houses. Original island-style drawings; existing progress only. Verification is recorded in [the T5 handover](handoff/T5-island-decoration.md); introductory explain-back completed; approval by Nils (`Nilsnova`) or Johannes Franz Lang (`frcola`) is required before merge.

**13 Nov, T26 / Ianno:** island Harbor weather entry implemented in [PR #8](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/8). Reuses the existing card; [local evidence and limits](handoff/T26-weather-board.md). Explain-back and human review pending.


**14 Nov, planning proposal (Ianno Hollensteiner):** [Defense and shared-island expansion](BUILD-PLAN.md#6-defense-and-shared-island-expansion) adds T29–T47. No gameplay implementation or live change is claimed. Planning branch: `docs/t29-t47-defense-roadmap`; existing uncommitted work is preserved.
**11 Nov, D1 contribution (Johannes):** [draft PR #5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5)
adds 67 invalid-input/boundary cases using the existing fakes. Backend: **15,894 passed, 257 skipped**;
Ruff: **All checks passed!** The skips concern optional SQL tools and opt-in database checks.
Explain-back and human review are pending; no live-database evidence is claimed.

**Plan to the deadline:** [FINAL-ROADMAP.md](FINAL-ROADMAP.md) ranks the remaining work by grade value; members pick tasks there with the [agent prompt](contribute/AGENT-PROMPT.md). **Open to-dos:** the account setup and demo-day list is [OPEN-TODOS.md](OPEN-TODOS.md) (account setup, pre-demo checks, follow-ups, the Moodle deadline). No task there is assigned to a person.

**Current release, 9 Nov 2026 (G29, the class demo):** main `c7f8c95` is live. The title has Play, Join and Settings; a short voiced intro (ElevenLabs) leads to the harbor in two clicks; one class harbor holds up to 40 captains; a quest strip (wave, duel, Keeper's Lock), a two-tap friendly duel, the Keeper's Lock with the player's real weather and the three-lamps finale; a projector QR (J); wow graphics (animated title, pixel sea, dusk and night light, rain and fog); a host-console Class demo panel. All gates passed; the live smoke check has 0 failures. The flag `demo` is on. Guests stay locked out until anonymous sign-ins are allowed in Supabase (OPEN-TODOS.md, 1a). Being built: the class-code gate and email sign-in.

**Current integration, 8 Nov 2026, Codex for Nils:** G9 is published and its live runtime is preserved
in `integrate/overflow-1-3`. The first three overflow items, native phone tap-to-walk, clearer Friends
and case guidance, polished inspection/Settings/support pages and caption-safe story frames are reviewed.
The final clean frontend run passes **3,719 tests in 252 files**; combined phone/accessibility checks
pass **36 checks / 61 screens**, with cold-title and strict-CSP budgets unchanged. Recorded native
journeys and fault proofs pass. See the final visual evidence
and overflow release. Main `7486bac` is deployed READY, with exact
identity, public routes, flags and all 174 stamped assets verified. A separately reviewed stock-label
follow-up clarifies closed hours before a first quote; 392 market tests and three native panel layouts
pass. Its final deployment identity is checked after push. Private OAuth/crew and physical-device
checks remain distinct.
No new key or configuration is needed from Nils. No backend, SQL, feature flag or provider was changed.

**Historical checkpoints follow.** Their statements about G9 being unfinished or sign-in being off
refer to earlier releases; use the current integration and its dated proof for this work.

**Verified baseline before the visual release, 6 Nov 2026, Codex:** main `364d178` and production
`dpl_4HmGdZCJrhgKS8DWF2qUN7eMAhPj` are READY with the AI companion removed.
Presence, market, predictions, arena, case, bulletin, festival and sports are enabled; sign-in
and raid remain off. Queryless health/config/sports returned 200 with ten real Premier League
fixtures from football-data.org. The key stays sensitive and Production-only. No gameplay write
was used for this proof. See sports activation.
RELIGHT_OPEN remains unset; festival waits for the first Relighting.

The [visual simplification](UX-SIMPLIFICATION.md) integrates original detailed title art, freshly
drawn 4× island sprites, 4096×3072 terrain, actual dense rendering, smoother player/camera motion,
full-screen explorable rooms, short replacing dialogue passages, a quiet HUD and a stable visual
light challenge. Integrated tests and independent review pass; exact evidence is recorded in
the visual release proof. Neither these visuals nor the title's Friends entry imply G9 is connected.

All reviewed migrations through 180000 are applied separately, exact stored MD5 proven and
restored to their repository versions; 150000 is unused. Live schema: **39 tables +1 view
/57 project functions /17 wallet reasons /9 sequences /7 triggers**, expected-only advisors.
The deployed live-extras gate passed **11,168 backend and 1,672 frontend tests**. Case services
include all 69 kit mixes and real solo+NPC/four-human HTTP-to-SQL journeys.

The stabilization/submission release includes reliability, frontend/backend regressions, isolated
devtools, help/privacy, security/text, notices, presentation/PDF and starter guides. Original authored
checkpoints are preserved and independent reviews pass. **13,584 backend tests plus nine benchmark
tool tests, 1,799 frontend tests with zero skips**, build/budgets and merged browser checks pass.
Live health/config are 200/private,no-store; build identity matches the main merge and stamps all
122 JS/CSS assets. Help, privacy, host and software notices are 200. See the
stabilization proof.

G9 cloud work is active. Its [current server-readiness checklist](handoff/g9-cloud-readiness.md)
records resolved requests and merge checks without changing the in-flight G9 source.

Normal browser mystery/multiplayer still await **G9, now active in a cloud session**; backend
journey proofs do not establish a connected browser session.

Nils cancelled the AI companion on 6 Nov. Its backend context code, tests, feature flag and
active specification are removed; the ten remaining flags keep their existing behavior.

No build input is currently needed from Nils. A disposable Vercel Sandbox provided read-only production access without relaxing route guards or exposing secrets. Later hand-in needs
three teammate names, private submission details and physical laptop/projector/spoken rehearsal.
Original music, ambience/effects and festival media are already built. Older paragraphs below are
historical checkpoints; use the current roadmap and proof links for release state.

**Codex release checkpoint, 6 Nov 2026:** group 3 is integrated on `integrate/group3`; its three
migrations (090000 Exchange v2, 100000 predictions, 110000 duels) are now applied, hash-verified and
re-recorded under their repository versions. Final live counts: 18 tables, one view, 17 reasons.
Backend 9692 passed; frontend 1601 passed plus two new lifecycle cases in targeted checks; build,
spoiler guard and redacted Gitleaks pass. Independent code and per-file SQL reviews passed.
Production code/flags are the next release step. The older status paragraphs below are historical.
Normal-play multiplayer and the full case still await G9 and the case chain; demo captains are stand-ins.

Sound is built (original music, weather ambience and effects, with separate volume controls).
The roadmap execution update records the release order,
Nils' approval to enable completed festival/sports. The later AI companion proposal is cancelled.

*Last updated: Fri 6 Nov 2026, evening, by Claude (coordinating for Nils). Group 1 (the story round, A2/A3 and A6) is on `main`, and its four database changes are applied. Group 2 (Codex's G8 with all of G7, A4 live presence, L2 home islet and the open-world must items) is merged on `integrate/fri6`; it reaches `main` after its gates, an independent agent check and the apply of its two database changes (`050000`, `070000`). Group 3 (Exchange v2, the prediction desk, Lantern Duels) follows tonight. Since 6 Nov the aim is a feature-complete game by Sun 8 Nov: agent-built work merges without a human review per merge (D015, extended), nothing waits for teammates, and Codex takes the browser side. The review queue under Open decisions is from 5 Nov; its finished items are marked done.*

### What works

- **`main` is live** at https://the-great-plot-twist.vercel.app/, and Vercel deploys every push to `main` (two Vercel Services: `/api` goes to `backend/`, the rest to `frontend/`). Checked after the push of `d7857d9`: the game, `/ui-kit.html`, `/api/health`, `/api/config` (with the public sign-in settings) and `/api/weather` answer 200, and `/api/me` answers 401 without a token, as it should.
- **The browser game (`frontend/`):** original pixel art (D005); the Saltreach Isles world from G2 + G3 (Lighthouse Isle, the sea chart with sailing, Saltreach Harbor, the home islet, the case places); the pixel UI kit with its gallery `/ui-kit.html` (G4); 114 story-art additions; five skippable finale cinematics (rehearse them with `?demo=1`); the playable intro on Lighthouse Isle (S2) with the unchanged story engine, both endings and a local save; live weather from Open-Meteo drives the island (L1). Ids and contracts are in [frontend/GRAPHICS.md](../frontend/GRAPHICS.md). The browser's API client (`frontend/src/online/api.js` and `session.js`, A2) is there, with no screen that uses it yet. Group 2 adds Codex's G7 and G8: the living multiplayer world on the case adapter contract, with its conformance suite (other captains and emotes, rewards and keepsakes, partner life, the Captain's Log and hints, Gull's Rest, the credits under Settings), the islet builds drawn in the world, the opt-in harbor bulletin and Lisbon fog nights, the Chapter 2 signal, harbor sound and ambient life, presenter and recording tools for the `?demo=1` tour, keyboard, phone and contrast fixes, a stronger spoiler guard and strict-CSP preparation ([frontend/GRAPHICS.md](../frontend/GRAPHICS.md), [frontend/HOW-IT-WORKS.md](../frontend/HOW-IT-WORKS.md)). It also adds L2's build panel on the home islet's plots (with no live transport yet it says it is not connected) and A4's live presence module (`frontend/src/online/realtime.js`, which the game does not start yet). The case screens use the local stand-in only with `?case=local` (in development, or with `?demo=1`); in normal play they show an unavailable adapter until the real adapter (G9) connects them to the API and to live presence. `npm test`: 886 passed (72 files); `npm run build`: built, and the spoiler guard passes; the cold title stays at 21,080 bytes (`test:loading`).
- **The Python API (`backend/`):** twenty-three routes: `health`, `config`, `content/{name}`, `weather` (since group 2 with the weather state and tonight's fog-night forecast), `bulletin` (the daily harbor bulletin on Lisbon time, public, new in group 2), `me` (GET, and DELETE for "delete my data"), `me/name` and `me/name/reroll`, `save` (GET and PUT), `intro/complete` (the referee and the entry kit), `auth/exchange` (temporary), `keepalive`, the crews (`crews`, `crews/join`, `crews/me`, `crews/me/start`), the home islet (`islet` and `islet/build`, new in group 2), and the Island Exchange (`market`, `market/portfolio`, `market/trade`; trading sits behind the flag `market`, which is off). The crew broadcaster for live presence (`backend/server/crew_broadcast.py`) is built and switched off with the flag `live_presence`. `uv run pytest`: 6407 passed; `uv run ruff check .`: All checks passed! Tests cannot reach the network (`backend/server/tests/conftest.py`).
- **The database:** five migrations are applied to Supabase (`great-plot-twist`, Ireland), each recorded under its own version and checked by md5 against its file: the foundation (`20261106000000`, 5 Nov) and, on 6 Nov, `20261106010000_island_exchange.sql` (Exchange v1, which v2 builds on), `20261106020000_accounts.sql`, `20261106030000_entry_profiles.sql` and `20261106040000_crew_codes.sql`. That gives thirteen tables, all with row-level security, the grants in [supabase/README.md](../supabase/README.md), eleven wallet reasons and the sign-up trigger. The Supabase security advisor shows only known items: `is_crew_member` is callable by signed-in players on purpose, `rls_auto_enable` is Supabase's own, `crew_join_failures` has row-level security and no policy on purpose, and the leaked-password notice does not apply because only GitHub sign-in is on. Group 2 adds two files, applied by the controller before group 2 reaches `main`: `20261106050000_live_presence.sql` (one helper and five policies on `realtime.messages`, no table) and `20261106070000_home_islet.sql` (two tables and one function). With them the database holds fifteen tables, fourteen policies in `public` plus the five on `realtime.messages`, and still eleven wallet reasons ([supabase/README.md](../supabase/README.md#three-quick-checks-after-applying)). Group 3 adds three more files (`090000`, `100000` and `110000`). Each file is applied before the code that needs it reaches `main`, because previews share the database ([supabase/README.md](../supabase/README.md#apply-before-you-merge)).
- **Sign-in:** GitHub sign-in through Supabase, checked with the page `/auth-check.html`. The two-account test is in the review queue.
- **Story, look and plan:** story skeleton v1 is approved ([STORY.md](STORY.md)); the original story is imported unchanged (S1, D007), with a Python and a browser engine that a parity test keeps equal; the look is decided (D005); ROADMAP.md v0.2 is written.

### In progress

| What | Who | Where |
|---|---|---|
| The real browser adapter (G9): the screens on the real API and on live presence, with the presence names mapped ([INTERFACES.md, section 7](INTERFACES.md#what-the-browser-adapter-g9-maps)) | Codex, for Nils | `feat/g9-real-adapter` |
| Group 3: Exchange v2 (the L4 rework), the prediction desk (L5) and Lantern Duels (A7). The desk may switch on after group 3: the module teacher confirmed that play-money predictions are fine for class (Nils, 6 Nov; D018, decision 18) | Claude, for Nils | `feat/l4-exchange-v2`, `feat/l5-prediction-desk`, `feat/a7-lantern-duels` |
| Owners for lanes S, A and L | the team | when teammates join |

### Blocked or waiting

- **The Island Exchange v1 tables are applied** (6 Nov), and the flag `market` stays off. Exchange v2 (group 3, tonight) replaces v1 with its own migration; nobody trades until then.
- **Live presence (A4) stays switched off.** Its migration goes live with group 2, but the flag `live_presence` stays off until the controller has run the checks L1 to L7 of [supabase/README.md](../supabase/README.md#live-presence-checks-steps-l1-to-l7) on the live project (L7 sends one real crew event with the server key). The game starts the module only once the real adapter (G9) maps G8's presence names to A4's ([INTERFACES.md](INTERFACES.md#what-the-browser-adapter-g9-maps)).
- **Four of the five deploy checks passed; check 1 waits** ([SETUP.md](SETUP.md), step 5). Check 2 passed: `/api/health` answers on production. Check 1 needs a teammate's push. Check 3 passed on 5 Nov: the daily GitHub Actions keep-alive was green on its first manual run ([SETUP.md](SETUP.md#keep-it-awake-until-the-demo)). Check 4 passed on 5 Nov with two real players: 181 of 181 steps on the live database, read only, every write rolled back, nothing changed. Check 5 passed on 5 Nov: both of Nils' GitHub accounts signed in. Since 6 Nov nothing waits for check 1: Nils decided not to wait for teammates (D015, extended).
- **Done: the settings Nils had to confirm.** Email sign-in is off (5 Nov). The function region is Dublin, pinned in `vercel.json` (`"regions": ["dub1"]`, 6 Nov; the live `x-vercel-id` header shows `dub1`). Supabase Realtime "Allow public access" is off, and `HOST_PLAYER_IDS` is set in Vercel for Production and Preview (Nils, 6 Nov).

### Known gaps

- The first load is large: the game's main script is about 610 kB, and Vite warns about the chunk size. G5 splits it, so the first load is fast on classroom Wi-Fi.
- The README's "Project status" now points to the live site and this page. M3 adds the deployed URL, names, student numbers and commands.
- PR 1 (`docs/team-workflow`): its commits are inside `main` now, so GitHub should show it as merged. If it still shows as open, close it by hand.

### Open decisions

**Changed on 6 Nov (Nils):** no review per merge (D015, extended: Nils reviews at the end or ad hoc), no kickoff and no team check-ins, and nothing waits for teammates. The review items below are dropped; the decisions stay open until Nils decides, and the build follows the recommendation meanwhile.

**Waiting for Nils: review queue** (newest first, as of the late evening of 5 Nov). Each item needs Nils to review, set, test, approve or decide. Nothing in this list is done until Nils says so.

1. **Done: the Island Exchange (L4) questions.** Its migration `20261106010000_island_exchange.sql` is applied (6 Nov), and Nils answered the questions of [D017](DECISIONS.md) on the night of 5 Nov: real prices for crypto and stocks, 10x positions both ways that close at zero, no floor, ceiling or pauses. Exchange v2 (group 3) builds his answers; the flag `market` stays off until then.
2. **Done: the story detail round is approved** (Nils, 5 Nov; D018, on `main` with group 1).
3. **Done: the Supabase URLs are set and Email login is off** (Nils, 5 Nov). The sign-in round trip works.
4. **Done: the sign-in works with both of Nils' GitHub accounts** (5 Nov), so deploy checks 4 and 5 passed.
5. **Approve three changes from the backbone merge:** the temporary route `POST /api/auth/exchange`, the changed test that allows `sessionStorage` for the PKCE code verifier (in `backend/server/tests/test_me.py`), and the new PKCE line in the [safety checklist](ENGINEERING.md#6-safety-checklist).
6. **Done: a daily GitHub Actions workflow calls `/api/keepalive`** (Nils, 5 Nov). Nils set a new `CRON_SECRET` in Vercel and in GitHub, and the first manual run was green, so deploy check 3 passed ([SETUP.md](SETUP.md#keep-it-awake-until-the-demo)).
7. **Decide the default weather place.** Torshavn in the Faroe Islands is the default now, with Lisbon as the option. It is also item 7 on the kickoff list below.

Nobody has decided these yet. Until they are decided, the plan in ROADMAP.md stands as written.

**For Nils** (asked on the evening of 5 Nov):

1. **Decided: the Island Exchange is core** (Nils, 5 Nov). It ships its minimum version first; L2 and G3 ship their minimum versions.
2. **Decided: nobody needs the private solo repository** (Nils, 5 Nov). Claude imports the story for Nils (S1, merged as `589baea`).
3. **Decided and done: Codex's pixel pass is on `main`** (`45d2d46`).

**For the team kickoff** (the four teammates decide together):

1. **Who builds S4 (NPC partners)?** Proposal: the L-lane owner.
2. **The D008 grow order.** Proposal in ROADMAP.md: S3, L3 and S4 first, then L4, then G2 and G3, then L2, then A7, L5 and L6.
3. **Who creates the free data-API accounts** (CoinGecko Demo, football-data.org, balldontlie)? The keys live only in the Vercel settings, never in the repository, a file or chat.
4. **Demo format.** Live on a seeded demo world, or recorded? Does the demo show the twist?
5. **Decided: seat takeover.** The friend keeps their own kit (Nils in the story round, D018, decision 10).
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

4. **Read** [README.md](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [AGENTS.md](../AGENTS.md) and [FINAL-ROADMAP.md](FINAL-ROADMAP.md), in that order. Give your coding agent AGENTS.md and [ENGINEERING.md](ENGINEERING.md).
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

- **Ianno / #82:** ask for independent human review of [draft PR #86](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/86), including the additive migration and timestamp boundary; migration application remains a separate follow-up.
**Ianno / shared defense recovery:** decide the captain-skill replacement effects, support range and multiplayer stacking, then review the final plan against current main before authorizing implementation of [#85](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/85). The second-destruction choice is settled: restart the lifecycle.

**E2 / Ianno:** finish full backend pytest and Ruff plus frontend tests, build and budget check when the shared-machine slot opens; keep the audit result (0 vulnerabilities) and unchanged-lock-record comparison in [PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108). Update the handover with exact results, rehearse the explain-back, then obtain independent human review. Do not merge automatically.

**Ianno / multiplayer pause:** keep draft [PR #106](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/106) within its test-harness scope. Full frontend tests passed; the pause path passed in one full MP run, followed by an unresolved musket pose assertion, while the single unchanged-bound rerun stopped earlier at a revive tick mismatch. Root is deciding whether the pose failure belongs in a separate T27 task. Do not widen or weaken timing assertions or fold in pose/product changes here. Franz (`frcola`) must approve the current revision; Ianno manually reviews. This task agent does not merge or enable auto-merge.
**E2 / Ianno:** explain the exact-pin diff and the first-run timeout followed by the controlled quiet 3,390/3,390 pass in [PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108). No app, test or timeout changes were made. Ianno manually reviews the current PR; Franz (@frcola) must approve the current revision. Root coordinates the review request after verification is complete. Keep the PR as draft until then; do not merge automatically.

**T48 / Ianno:** verification is complete for [draft PR #109](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/109); root coordinates Franz (`frcola`) reviewing this current revision, and Ianno manually reviews it. Keep the PR draft pending that review. Human rollout must apply `20261116100000` before the dependent server deploy; if merge triggers Vercel deployment, apply before merging. Live application has not been authorized. An agent does not merge.
**T35 / Ianno:** independently review draft [#84](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/84), including the feature-off parity, break/rebuild behavior, tower guide evidence, and the limited three-seed balance smoke. The flag stays off until the human balance review is complete; no merge or migration apply from this branch.

**Johannes / B2:** review draft #58 and check touch/keyboard on a physical phone. Continue the remaining current-v3 phone journey separately; this PR only fixes four island targets. Preserve all teammate handovers and recheck current main before a later merge. No merge without Johannes explicit OK and independent human approval.
**Johannes / B2:** review draft #61 and test entry/full lobby on a physical phone (including keyboard and a second-device invite). Remaining game views and draft #58 are separate. Keep draft; reconcile current main and handovers before a later merge; independent human approval and Johannes explicit OK required.

**T19 / Johannes:** inspect [PR #7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7) with the
[lane walkthrough](WALKTHROUGH.md#johannes-nearby-building-interactions-t19), then ask a different human
teammate to review the current diff; Nils (`Nilsnova`) is the suggested reviewer. No automatic merge.

**B3 / Johannes:** review help PR #31, review the independent shortcuts PR #32 and its audit handover; author explain-back and independent human review remain. No merge without Johannes explicit OK.

**B3 shortcuts / Johannes:** review draft #32 and audit alongside independent help draft #31, answer explain-back questions and obtain an independent human review. No merge without Johannes explicit OK.

**Johannes / B3:** review draft #38 and the independent help/shortcuts drafts #31/#32. No merge without Johannes explicit OK and another human approval. Do not infer live recovery from callback fixtures.

**Johannes / B3:** review draft #39 and the independent fixes #31/#32/#38. Next proposed scope: B2 phone pass, then B5 measured loading; optional practice needs coordination with Ianno/Nils first. These proposals are not claims.

**Johannes / B2:** review draft #66 and try match choices/menus on a physical phone. Account/login, live provider settlement and other game cards are outside this pass. Preserve #58/#61 and other handovers; reconcile current main and rerun affected checks before any later merge. Independent human approval and Johannes explicit OK remain required.

**T28 / Ianno:** introductory explain-back completed after clarification; ask Johannes (`frcola`) for independent review of PR #19. No merge before a different human approves.

**Captain visuals:** T27 covers shooting direction in single-player and multiplayer ([OPEN-TODOS §2](OPEN-TODOS.md#2-open-tasks-you-can-pick-small-independent-updated-thu-12-nov)). Implementation is in [PR #17](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/17); checks passed and Ianno reviewed the eight-direction montage; ask Johannes (`frcola`) to review. Three explain-back questions were discussed with coaching; rehearse independently before the walkthrough.

**T7 / Ianno:** introductory explain-back completed after clarification. Franz (`frcola`) is assigned to review PR #13; independent human approval and live verification remain pending. Do not merge without a current independent human approval.

**Captain visuals:** T27 covers shooting direction in single-player and multiplayer ([OPEN-TODOS §2](OPEN-TODOS.md#2-open-tasks-you-can-pick-small-independent-updated-thu-12-nov)). Implementation stays open for a later branch.

**T5 / Ianno:** introductory explain-back completed with clarifications. Nils (`Nilsnova`) or Johannes Franz Lang (`frcola`) must independently review and approve the current diff before merge.

**T26 / Ianno:** review the small weather-entry diff, answer the explain-back questions, then ask Johannes (`frcola`) for independent human review.


**Expansion next:** claim one task from the [new board](OPEN-TODOS.md#9-defense-and-shared-island-expansion-proposal-14-nov), starting with T29/T30 or independent T37/T42 design. Coordinate shared files before writing code; existing lane and submission priorities remain.
**T33 / Ianno:** finish design-only PR #85 after the user resolves both remaining decisions: Captain Shipwright/Engineer combat-skill compatibility, and whether a Workshop-rebuilt wall destroyed again during its one subsequent wave restarts recovery or the original deadline wins. Do not begin implementation before final design approval. Human review remains pending.
**D1 / Johannes:** explain the request, response and no-write assertions in [PR #5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5),
answer the three walkthrough questions, then ask Nils (`Nilsnova`) for independent human review.

Each lane has its next two packages, each with a brief. Fill in the `<...>` parts and paste the brief to your coding agent. The briefs follow the template in [ENGINEERING.md](ENGINEERING.md), section 8, and end with the handover format from [AGENTS.md](../AGENTS.md). What each package ships, provides and must pass is in ROADMAP.md.

### G World and Graphics (Nils, with Codex)

**Current next:** review the active cloud G9 checkpoint and prove its merged browser journey, then perform the physical-device and presentation rehearsal. The G8 notes below are historical.

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

**Next server step:** support the active cloud G9 work and prove its merged normal browser journey; sports provider activation is complete. All case and live-extra migrations through 180000 are applied; 150000 is unused. G9 browser wiring is active in the cloud; sports activation has its current-source proof.

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

**Current next:** complete the visual release and integrate reviewed G9; sports provider setup/read-only verification passed; existing market/prediction/arena flags are already on. Festival is enabled and waiting for the first Relighting. The older lane briefs below are historical.

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

- **Nicolas / 2026-11-16 / small demo polish (playtest finds).** Signed out, the HUD no longer shows an endless "🪙 …" (the chip waits for coins) and Settings/Account say only "Signed out" instead of "Signed out, Captain pending"; the title lighthouse windows are square with a cross bar, so they no longer read as "0 0". Test: `frontend/tests/signed-out-polish.test.js`; evidence `docs/evidence/demo-polish/`. Not checked on a real phone.

- **Ianno / 2026-11-16 / task-board reconciliation.** Updated this task branch with main `937b1b56`, whose two new commits affect only OPEN-TODOS: presenter rehearsal and the owner’s claimed T50–T53 tasks. Application source and prior verification are unchanged. Every existing committed log entry remains.

- **Ianno / 2026-11-16 / standing orchestration and review rules.** All Ianno task status and new logs use Ianno as owner; new logs begin `Ianno /`. Logs are append-only: retain every committed collaborator entry, resolve ordinary conflicts by keeping both sides, and add corrections as new entries. Every agent task has its own branch and draft PR; explicit smaller-model task agents are separate from selected-model orchestration/review. Ianno manually reviews every PR; Franz (@frcola) must approve the current revision for all current and future tasks. Franz may merge manually after the required checks and reviews. Agents never merge or enable auto-merge. Ask Ianno about consequential product/code ambiguity; do not ask Ianno to resolve routine log conflicts.

- **Ianno / 2026-11-16 / wall-record reconciliation, branch `fix/wall-record-race`.** Integrated main `a9386656` into this task branch only; kept Nicolas’s fresh-start walkthrough and all teammate status entries alongside the wall-record handover. No implementation change to the SQL fence. Refreshed checks: 250 scratch PostgreSQL tests, 30 wall-route tests, Ruff and all 50 SQL parses pass. All 100 mainline and 97 original task log entries remain present. No PR merge, deployment or live migration.
Ianno / Full frontend verification for multiplayer pause — 16 Nov 2026 (agent model: `gpt-6-luna`, high): `npm test -- --reporter=default --reporter=json --outputFile.json=/tmp/multiplayer-pause-flow-full-tests.json` passed 279 files / 3,390 tests in 456.51 s, exit 0. Captures: `/tmp/multiplayer-pause-flow-full-tests.stdout`, `/tmp/multiplayer-pause-flow-full-tests.json`, `/tmp/multiplayer-pause-flow-full-tests.exit`. Full MP remains not green: one run proved the pause flow before the unresolved pose assertion; one rerun failed earlier at revive tick equality. No timing bounds were changed.

Ianno / Multiplayer pause verification — 16 Nov 2026 (agent model: `gpt-6-luna`, high): after pausing immediately, the full MP run logged 8 s remaining, “Paused by Nils” on both clients, both break states alive past 8 s, cannon_2 level 2 on both while held, then both resumed and entered wave 4 with wave-1 ships/boarders 17/17 in sync. That run later failed at the separate musket pose assertion (0/2, `errors: []`). One unchanged-bound rerun failed earlier at revive tick equality (`73.1 !== 72.4`, `errors: []`) and did not reach the pause/pose phase. No assertion or bound changed; full frontend `npm test` remains pending. Draft #106 stays unreviewed until Franz approves the current revision and Ianno completes manual review.

Ianno / multiplayer pause — 16 Nov 2026 (agent model: `gpt-6-luna`, high): current-main browser reproduction passed revive and failed at the late Pause click after the 8-second break had naturally expired; the captured break had about 3 seconds remaining at the first click. Draft PR #106 changes the harness order without changing the 8-second duration or pause permissions. Focused tests: 3 files / 43 tests passed; `npm run build` and spoiler guard passed. Full frontend tests and the fixed-flow `test:mp` run remain pending the coordinated quiet window. Required reviewers: Franz (`frcola`) on the current revision, then Ianno's manual review; this task agent will not merge.
- **Ianno / E2 · 16 Nov 2026, controlled quiet frontend rerun:** one full frontend run ended with 3,389 passed / 1 `nearby-game` timeout after 799.95 s. After CPU/browser gates closed, a single run using `npm test -- --reporter=default --reporter=json --outputFile.json=/tmp/e2-quiet-full-tests.json` exited 0: 279/279 files, 3,390/3,390 tests, duration 491.55 s. JSON report records 3,390 passed, 0 failed, 0 pending; stdout, stderr and exit code were saved separately under `/tmp/e2-quiet-full-tests.*`. Focused runs passed 2/2 on E2 and detached base a9386656. No test, app or timeout changes; no further frontend rerun planned.

- **Ianno / E2 · 16 Nov 2026, focused timeout comparison:** the full frontend suite remains 3,389 passed / 1 timeout. `npm test -- tests/island/nearby-game.test.js` passed 2/2 on E2 (32.06 s) and on detached base a9386656 (34.38 s) using the same installed packages. The isolated check did not reproduce the 20-second full-suite timeout, so its baseline status is unconfirmed; no tests, app code or limits were changed.

- **Ianno / E2 · 16 Nov 2026, verification update:** [draft PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108) has 536,618 backend tests passing / 283 skipped, Ruff clean, frontend build and budget passing (18,669-byte initial JavaScript; 9,092-byte initial CSS), and npm audit at 0 vulnerabilities. Full frontend tests: 3,389 pass / 1 timeout in `nearby-game`; a prior main report names this test, but current-base confirmation is pending. No test changes or skips were made. All 28 uv and 71 npm non-root package records stay unchanged. Ianno will review manually; Franz (@frcola) must approve the current revision. PR remains draft; root will coordinate review after verification.

- **2026-11-16, E2 / Ianno, with Codex assistance:** exact Python direct pins and Playwright pin in [draft PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108). `uv sync`, Ruff, `npm install` pass; `npm audit` finds 0 vulnerabilities. All 28 non-root uv and 71 non-root npm lock records compare equal to `main`; package versions are unchanged. Full backend/frontend gates await the shared-machine slot; independent review remains.

- **Ianno / 2026-11-16, T48 branch sync:** merged latest `main` (`937b1b56`) into `fix/leaderboard-scalability`, preserving the presenter-rehearsal policy and T50–T53 owner tasks in `docs/OPEN-TODOS.md`. The upstream change was docs-only; application source and test evidence are unchanged. PR #109 remains draft for Franz's current-revision review.
- **Ianno / 2026-11-16, T48 full backend verification:** `cd backend && uv run pytest -q` passed: 536,612 passed, 289 skipped in 1,349.68 seconds. The skips are optional checks disabled in the normal backend run; focused leaderboard scratch SQL was separately run with `CASE_PG_SCRATCH=1` and passed 6/6. No live database operation.
- **Ianno / 2026-11-16, T48 review coordination:** Franz (`frcola`) is the required human reviewer of PR #109's completed current revision; Ianno manually reviews every PR. Keep #109 in draft through verification; root coordinates the review request after verification. An agent does not merge.
- **Ianno / 2026-11-16, T48 rollout dependency:** migration `20261116100000` must be applied before the new backend deploy. If PR merge triggers Vercel deployment, apply it before human merge; no live application authorization was given. Keep #109 draft for required current-revision review.
- **Ianno / 2026-11-16, T48 verification update:** focused service tests 18/18, scratch SQL tests 6/6, Ruff and the four-statement migration parse pass. EXPLAIN on 2,012 qualifying runs shows a sequential scan and in-memory sort followed by per-island ranking and a ten-row limit; no additional index was added based on this moderate scratch dataset. Full backend suite remains in progress; no live database operation.
- **Ianno / 2026-11-16, T48 leaderboard scalability, issue #107, branch `fix/leaderboard-scalability`.** Codex assistance: draft PR #109 adds the service-only `leaderboard_best_runs()` SQL function and removes the 2,000-run Python scan bound. Focused service tests: 18 passed; regression fails on the prior implementation with `leaderboard_unavailable` after 20 pages. The migration parsed as four SQL statements. Scratch PostgreSQL, permission/reapply checks, query plan, broader backend checks and human review remain. Migration `20261116100000` must precede deployment; no live database operation.
- **2026-11-16, pause-menu icons, branch `feat/menu-icons`.** Nicolas, with Claude (playtest polish, team style "less text, more icons"): each pause-menu button gets one emoji in front (▶️ Resume, ⚙️ Settings, 🏠 Return to title, 🏆 Leaderboard, ...). New `frontend/src/shell/menu-icons.js` maps a label to its icon; CSS draws it from `data-icon`, so button text and screen-reader names stay the same. Test `frontend/tests/menu-icons.test.js`; [screenshots](evidence/menu-icons/). No game, sim or server change.
- **2026-11-16, phone title shows the island, branch `fix/phone-title-island`.** Nicolas, with Claude (playtest polish): on tall phones the title card sat in the middle, right over the lighthouse island, with empty sea below. One CSS rule in `frontend/src/ui/shell.css` moves it to the bottom on portrait phones (at least 640 px tall); laptops and landscape are unchanged. Test `frontend/tests/phone-title-layout.test.js`; [before/after](evidence/phone-title/). No game, sim or server change.
- **2026-11-16, a rebuilt wall stops looking broken, branch `fix/rebuilt-wall-look`.** Nicolas, with Claude (playtest): in the break after a wave the island is drawn from the wave's last state, so a wall repaired or rebuilt there (D039) kept its rubble or cracks until the next wave. A paid Repair/Rebuild now hands the fresh wall health to the wave's renderer (`island/index.js` → `game-wiring.js` → `controller.refreshDefenses(walls)` → `render.js` `wallShare`). Drawing only: no change to `sim.js`, wall lanes, server or migrations. Test `frontend/tests/pirates/rebuilt-wall-look.test.js`.
- **2026-11-16, wave announcements no longer pile up, branch `fix/wave-ui-overlaps`.** Nicolas, with Claude (playtest: "speech bubbles, announcements and the life bar on top of each other"): at the start of a busy wave the countdown and the boss warning sat behind the toast under the wave bar. They now line up in one lane under the bar: toasts, countdown, boss warning (`--toast-stack-height` from `ui/toasts.js`, `--pirate-count-space` from `pirates/hud.js`, rules in `pirates.css`). The narrator card now also moves when the Musket button appears after it (`narrator/card.js`). Test in `frontend/tests/ui/hud.test.js`; [before/after](evidence/wave-ui-overlaps/). No game, sim or server change.
- **2026-11-16, tower upgrade trees and the swivel-gun nest (D055), branch `feat/tower-trees`.** Claude, for Nils: after level 5 every tower kind grows a Bloons-style tree (path a faster, path b harder, 3 tiers, one path to 3; tiers after waves 20/35/45, 🪙 700–6,000, paid by the clicker), drawn like the captain tree on a big tower card; the new swivel-gun nest (after wave 9) sprays pellets at boarders only. Migrations `20261116020000_tower_trees.sql` (adds only; apply before the server) and `20261116020100_swivel_spot_rule.sql` (the swivel's spot rule, the one DROP CONSTRAINT); neither applied. Balance: two captains now win wave 60 and most of 80; towers alone still lose 80.
- **2026-11-16, walls on pirate paths (D056), branch `feat/walls-matter`.** Claude, for Nils ("walls don't stand around useless"): walls may stand only on wall lanes derived from the sim's routes (server `409 off_path`, glowing lanes in Move mode, faint lanes in the battle guide), new default wall spots two by two across each lane, walls stored off a lane settle on the nearest lane cell on read. Sim unchanged; no migration; no PR yet.
- **2026-11-16, own ship from wave 30 (D057), branch `feat/boat-wave30`.** Claude, for Nils: the repaired wreck becomes the island's own ship after wave 30 (was "later" at 10) with two 20 s games, Broadside duel and Treasure dash, on the finishers' difficulty curve; the server pays ★ × (6 + wave/5) once per game, player and won wave (reason `boat_game`, migration `20261116040000_boat_games.sql` not applied); no PR yet.
- **2026-11-15, wall record race (#82), branch `fix/wall-record-race`, draft [PR #86](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/86).** Ianno Hollensteiner (`Iannomh123456`): regression reproduced on old SQL; new migration stamps paid wall restores and fences out delayed reports from waves already started. SQL covers both lock orderings on two connections and a later wave; 225 island SQL checks, 30 wall route checks, Ruff and migration parsing pass. Human review pending; migration not applied live.
- **Ianno / 2026-11-16 / captain repair checkpoint.** Confirmed nearby-only benefit and strongest nearby captain bonus per target; exact skill values and range remain open. The repair-source model still needs a choice: independent automatic captain repair (closest to current worker-independent repair) or boosting existing wall workers. No model or production implementation approved. Existing committed log entries retained.
- **2026-11-15, visual calm, branch `fix/visual-calm`.** Claude, for Nils ("layouts too full, limit the visual overload"): one toast at a time (2.8 s, errors 5 s and never pushed out by a note), short success toasts ("Cannon built · 🪙 70"), the Goals panel shows only the current goal, build markers faint and still unless the captain is near, the battle guide's preview dots only (half of them) and fewer, smaller chevrons in a wave, the wave bar's hp as "You" + meter and loot as "🪙 +N" (hidden at 0), the gun button keeps its name when out of range (dimmed), the narrator skips repeatable small talk during a wave, the pause menu in two quiet columns under a big Resume, a short Harbor card (icons, one line, "Open"), more room in cards and the building card's Hire crew / Move / Tear down in one row. No rule, sim or server change; aria labels keep the long words.
- **2026-11-16 / Ianno, shared defense recovery, branch `docs/t33-persistent-tower-damage-design`.** Recorded the confirmed fresh lifecycle after automatic rebuild and re-destruction, retained the automatic battle crew exception, and clarified that the Quick Fix crew-support example is unapproved. A targeted audit of main `a9386656` identified swivel and tower trees for the final implementation scope; no source code was changed. Codex assistance; design-only PR #85 still awaits the skill decision and final human plan approval.

- **Ianno / 2026-11-16 / recovery-design reconciliation.** Integrated main `a9386656` into `docs/t33-persistent-tower-damage-design` only, preserving all competing teammate status entries and the latest recovery decision. Design-only PR #85; no implementation or live changes.

- **2026-11-16 / Ianno, shared defense recovery, branch `docs/t33-persistent-tower-damage-design`.** Recorded the confirmed fresh lifecycle after automatic rebuild and re-destruction, retained the automatic battle crew exception, and clarified that the Quick Fix crew-support example is unapproved. A targeted audit of main `a9386656` identified swivel and tower trees for the final implementation scope; no source code was changed. Codex assistance; design-only PR #85 still awaits the skill decision and final human plan approval.
- **2026-11-15, T33 compatibility audit, branch `docs/t33-persistent-tower-damage-design`.** Added the exact Captain Shipwright/Engineer effects affected by the confirmed player-repair restriction and documented the compatibility decision; passive crew support is preferred to evaluate, but no effect mapping or stacking is approved. One Workshop rebuild/re-destruction recovery edge also remains open. Design only; no implementation authorized; draft PR #85 awaits human review.
- **2026-11-15, T33 persistent tower damage, branch `docs/t33-persistent-tower-damage-design`.** Codex for Ianno opened draft [PR #85](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/85), adding a proposed design spec only. Source links and `git diff --check` pass. User confirmed positive ending hp restores whole at wave end; destroyed defenses recover after 10 minutes or one subsequent wave, whichever comes sooner, only at an inactive-wave boundary; paid rebuild is instant between waves; player E repair/rebuild is disabled during new-policy battle. Current wall-only Carpenter/Workshop automatic repairs continue during battle. One edge remains: if Workshop rebuilds a destroyed wall during its one subsequent wave and the wall is destroyed again before the wave ends, restart recovery or let the original deadline win? Final design approval and human review are pending. Captain Shipwright repair-rate/rebuild-share/range skills and the Engineer wall-health combat boost become inert unless the user chooses a compatibility treatment; passive crew support is the preferred option to evaluate, with its effects/stacking still undecided. Engineer 10% build discount remains. No production code, migration, live change or implementation authorization.
- **2026-11-15, visual calm, branch `fix/visual-calm`.** Claude, for Nils ("layouts too full, limit the visual overload"): one toast at a time (2.8 s, errors 5 s and never pushed out by a note), short success toasts ("Cannon built · 🪙 70"), the Goals panel shows only the current goal, build markers faint and still unless the captain is near, the battle guide's preview dots only (half of them) and fewer, smaller chevrons in a wave, the wave bar's hp as "You" + meter and loot as "🪙 +N" (hidden at 0), the gun button keeps its name when out of range (dimmed), the narrator skips repeatable small talk during a wave, the pause menu in two quiet columns under a big Resume, a short Harbor card (icons, one line, "Open"), more room in cards and the building card's Hire crew / Move / Tear down in one row. No rule, sim or server change; aria labels keep the long words.
- **15 Nov 2026 · Johannes / B3 #88:** Late arsenal replies stay with their original island. Full frontend, build, budget, text lint and demo passed; known main accessibility failure reproduced separately. [Exact results/limits](../specs/B3-arsenal-context.md#verification-15-nov-2026). Draft; no merge.
- **15 Nov 2026 · Johannes / B3 #90:** Retry an arsenal load directly in its card. Full frontend, build, budget, text lint and demo passed; known main accessibility failure reproduced separately. [Exact results/limits](../specs/B3-arsenal-retry.md#verification-15-nov-2026). Draft; no merge.
- **15 Nov 2026 · Johannes / B3 #92:** Closing a loading harbor cancels the old opening. Full frontend, build, budget, text lint and demo passed; known main accessibility failure reproduced separately. [Exact results/limits](../specs/B3-harbor-loading.md#verification-15-nov-2026). Draft; no merge.

- **15 Nov 2026 · Johannes / U #96:** Optional skill-aware comparison against the carried weapon. Full frontend, build, budget, text lint and demo passed; known main accessibility findings reproduced separately. [Exact results](../specs/U-weapon-comparison.md#verification-15-nov-2026). Draft, no merge.
- **15 Nov 2026 · Johannes / U #98:** Local inventory filters and grouped rack rows. Full frontend, build, budget, text lint and demo passed; known main accessibility findings reproduced separately. [Exact results](../specs/U-arsenal-filters.md#verification-15-nov-2026). Draft, no merge.

- **2026-11-15, no overlaps, branch `fix/overlaps`.** Claude, for Nils: an overlap audit (`npm run test:overlaps`) and its fixes: toasts under the wave bar and under an open card's header, the first-wave hint inside the wave bar, a shorter bar on short screens, battle guide badges that no longer sit on each other (axe beside the wall bar, skull off a shore wall, shared route cells drawn once, thinner routes on phones). No game rules changed; no PR yet.
- **2026-11-15, battle clarity (D053), branch `feat/battle-clarity`.** Claude, for Nils after playtesting: landings, routes and the heart drawn on the island (faint between waves), wall hp bars, the cutlass as a sweep (reload 0.75 s), an icon goal HUD with a first-wave hint, and walls that block until broken (pathing). No migration; no PR yet.
- **2026-11-15, tower path obstacles (D054 proposed), branch `feat/tower-path-obstacles`, draft #84.** Ianno (`Iannomh123456`) for the issue's owner, with Codex: the off-by-default `tower_obstacles` wave rule requires `pathing` and `tower_health`; standing damageable tower footprints join routing and movement, and the battle guide uses the same rule and HP snapshot. Final review added a fallback for a boarder enclosed by touching rebuilt towers: take the deterministic lower-cost next step through its own footprint or attack the adjacent route blocker. The five-tower regression was red before this fix (`expected 'none' not to be 'none'`) and now reaches the heart without crossing another footprint. Additive migration `20261115160000_tower_obstacles.sql` is not applied; feature flag remains off. Full frontend suite 274 files/3,348 tests passed before the final edge fix; the final affected 8-file/76-test suite, build and bundle budget pass after it. Backend 536,584 passed/282 skipped, all 221 scratch SQL tests and Ruff pass. Centered tower perf: 300 boarders × 3,000 ticks, 1,897 ms, 111 field builds, 5,547 target ticks, 37 rebuilds, no stuck boarders. `test:rules` two-client 451-tick comparison passes; captures are in `docs/evidence/T35-tower-obstacles/`. `test:mp` reaches the captain revive on both branch and unchanged `e8c61c64`, but each run times out later at a different pause/break UI step. A 3-seed balance smoke is informative only, not balance approval. Draft PR #84 remains open for review; no merge, live DB change or deployment.
- **Ianno / 2026-11-16, PR #84 mainline reconciliation in progress (D058).** *(Model: GPT-6 Luna.)* Integrated `origin/main` into `feat/tower-path-obstacles` locally after resolving the docs and battle-guide collisions. Preserved the D055–D057 decision/status entries and all mainline changes; assigned the proposed T35 entry D058, clarified its interaction with D056 static wall-lane guidance, and included D055's HP-bearing swivel nest in the obstacle geometry and guide. Franz (`@frcola`) is the required human reviewer, with Ianno's manual review; approval must cover the current revision and passing checks. Keep PR #84 draft until verification is complete; the agent must not merge or enable auto-merge. Focused verification was pending at this stage; no push, PR merge, live database change or deployment.
- **Ianno / 2026-11-16, PR #84 focused reconciliation checks.** *(Model: GPT-6 Luna.)* After resolving main's battle-guide conflict, the focused Vitest run covering tower obstacle geometry, tower health, boarder routing, battle guide, wall lanes, frozen rules and D055 tower trees passes: 9 files, 98 tests. Full suites, balance, browser and performance checks on the reconciled branch remain pending; the previous measurements are pre-integration only.
- **Ianno / 2026-11-16, PR #84 review handover.** *(Model: GPT-6 Luna.)* Keep draft until reconciled verification is complete. Franz (`@frcola`) is the required human reviewer; Ianno manually reviews every PR and approval must cover the current revision. The agent must not merge or enable auto-merge; Franz may merge manually after approvals and required checks.
- **Ianno / 2026-11-16, PR #84 integration published.** *(Model: GPT-6 Luna.)* Pushed merge commit `f1f810f3` to `feat/tower-path-obstacles`; the existing PR remains draft. Focused frontend suites pass (9 files, 98 tests); full backend verification is running, with full frontend, browser, balance and performance checks still pending.
- **Ianno / 2026-11-16, PR #84 full backend check.** *(Model: GPT-6 Luna.)* On the reconciled branch, `UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run pytest -q` passes: 536,623 passed, 283 skipped in 1,356.42 s. SQL scratch suites, Ruff, full frontend, balance, browser and performance checks remain pending; older backend counts in the original handover are pre-integration.
- **Ianno / 2026-11-16, PR #84 SQL and lint checks.** *(Model: GPT-6 Luna.)* `CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql` passes: 246 tests in 14.39 s; `UV_CACHE_DIR=/tmp/tower-path-uv-cache uv run ruff check .` passes; the documented pglast parse check reads all 50 migration files. Full frontend, balance, browser and performance checks remain pending.
- **Ianno / 2026-11-16, PR #84 verification handover clarified.** *(Model: GPT-6 Luna.)* Merged current main through `937b1b56`; it adds only the `docs/OPEN-TODOS.md` update, so no application gates were repeated. Reorganized the T35 spec into historical pre-reconciliation results and current reconciled results. The current multiplayer attempt passed pause/resume, upgrade, and next-wave checks but failed a later musket-pose assertion (0/2); one controlled diagnosis is pending. Full frontend, fresh build/budget, balance, final multiplayer/browser and quiet-machine performance checks remain open; PR #84 stays draft.
- **Ianno / 2026-11-16, PR #84 full frontend and build.** *(Model: GPT-6 Luna.)* Captured `npm test -- --reporter=default --reporter=json --outputFile=/tmp/t35-frontend-final.json`: exit 0, 281 files and 3,406 tests passed, 0 failed/pending, 449.86 s. The original verbose run's Vitest cache also covered all 281 files with no failures, but its summary/exit were not retained; this captured rerun supplies final proof. `npm run build` plus spoiler guard passed (479 modules; 237 text files, 12 protected lines). `node scripts/report-budget.js --check` exited 0: initial JS 18,669/21,080 bytes, CSS 9,092/12,000, no unshipped files. Rules-sync browser, current balance and quiet-machine performance checks remain pending.
- **15 Nov 2026 · Claude, for Nils / D050:** bigger Harbor stakes on `feat/bigger-stakes`: one stake picker (− / + in 5 % steps, 10 % / 25 % / 50 % / All in, "Win 🪙 X") at the match board and the market stall, match board 1 to 10,000 a bet and 25,000 a day at double or nothing, market calls 5 to 10,000; migration `20261115120000_bigger_stakes.sql` not applied anywhere yet; no PR or merge.

- **2026-11-15, tower skills cost coins (D051), branch `feat/tower-skill-prices`.** Claude, for Nils after playtesting: a tower's skill pick is paid by the clicker (cannon 150 / capstone 600, mortar 120 / 480, watchtower 80 / 320, wall 40 / 160; house roles free); migration `20261115130000_tower_skill_price.sql` not applied; no PR yet.
- **15 Nov — Nils with Claude / skill tree visual:** `feat/skill-tree-visual` redraws the captain's skill tree and the Tech hub as real trees (round tiles, lines from the root, one detail panel with one big button; wide card, one branch at a time on phones); rules, prices and server calls unchanged ([walkthrough](WALKTHROUGH.md#the-skill-tree-and-the-tech-hub-as-real-trees--nils-with-claude-15-nov)). 3,283 of 3,285 frontend tests pass; the two timeouts (`nearby-game`, `shortcuts-loading`) fail the same on main; build, budget and loading checks pass. Not merged; human review pending.
- **14 Nov 2026 · Johannes / PR #58 conflict resolution:** integrated main `53a59d4` on `fix/b2-phone-controls`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B2-phone-controls.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov — Johannes / B2:** four island actions measured 40px before / 44px after at both phone sizes and desktop; four browser cases, 3,206 frontend tests, build/budget/text lint, 33-screen accessibility and 33-check demo pass; draft #58, physical phone/full B2 remain open.
- **14 Nov 2026 · Johannes / PR #61 conflict resolution:** integrated main `53a59d4` on `fix/b2-entry-lobby`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B2-entry-lobby.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov — Johannes / B2:** full lobby names clipped 10/10 before → 0/10 after at both phone sizes; draft #61 adds seven regressions and a 21-panel entry audit. Final 3,209 frontend tests and applicable UI gates pass; real phones/rooms remain unverified.


- **2026-11-15, guards and captain melee (D052), branch `feat/guards-and-melee`.** Claude, for Nils: a hireable Guard crew (🪙 60, max 3, after wave 6) that fights boarders by the heart, the automatic cutlass and point-blank taps; migration `20261115140000_guard_crew.sql` written and scratch-tested, not applied. Balance: 3 captains, wave 50 30% → 65% won, wave 60 15% → 40% with 3 guards; unchanged where the crew already holds.
- **2026-11-15, decisions accepted (docs only), branch `docs/accept-d039-d049`.** Claude, for Nils: recorded Nils's acceptance of D039–D049 in DECISIONS, STATUS and the sprint guide.
- **14 Nov 2026 · Johannes / PR #7 conflict resolution:** integrated main `53a59d4` on `feat/t19-nearby-interactions`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/T19-nearby-interactions.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.
- **14 Nov 2026 · Johannes / PR #31 conflict resolution:** integrated main `53a59d4` on `fix/b3-help-feedback`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B3-feedback-audit.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov 2026, Johannes with Codex, B3 part 1:** help loading, visible failure/retry/cancel and stale-response guards in draft #31; 3,036 frontend tests and applicable UI checks pass. No API/login changes.

- **14 Nov 2026 · Johannes / PR #32 conflict resolution:** integrated main `53a59d4` on `fix/b3-shortcuts-feedback`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B3-shortcuts-feedback.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov 2026, Johannes with Codex, B3 part 2:** shortcuts recovery and scoped v3 audit in draft #32; 3,036 frontend tests, build/budget/text lint, 33 a11y screens and 33 demo checks pass. Author review and independent human approval remain; no merge.


B3 handover (14 Nov): Johannes completes the shortcuts draft #32 and scoped audit; see B3-FEEDBACK-AUDIT.md for source/fixture versus live-proof limits. Next: author review and an independent human reviewer.

- **14 Nov 2026 · Johannes / PR #38 conflict resolution:** integrated main `53a59d4` on `fix/b3-connection-retry`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B3-connection-retry.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov — Johannes / B3:** connection-banner rejection/pending feedback implemented in draft #38; 3,042 frontend tests and applicable UI checks pass; live recovery not verified.
- **14 Nov 2026 · Johannes / PR #39 conflict resolution:** integrated main `53a59d4` on `test/b3-feedback-check`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B3-feedback-check.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov — Johannes / B3:** repeatable eight-case/two-size feedback audit in draft #39; deliberate enabled-build countercheck fails, normal 16-case run and 3,036 frontend tests pass; local test tools/docs only.
- **14 Nov 2026 · Johannes / PR #66 conflict resolution:** integrated main `53a59d4` on `test/b2-harbor-menus`; retained teammate content and reran client checks. Exact results and limits: [task handover](../specs/B2-harbor-menus.md#main-integration-and-conflict-resolution-14-nov-2026). Updated branch awaits independent review; no main merge.

- **14 Nov — Johannes / B2:** draft #66 fixes mid-word breaks in phone match choices with one CSS property; 36 Harbor/menu cases, 3,240 frontend tests, build/budget/text lint and both 33-screen/check UI gates pass. Controlled data only; real phones/providers remain unverified.


- **2026-11-14, ~22:05 UTC, pathing decision (docs only), branch `docs/pathing-decision`.** Claude, for Nils: Nils accepted the closed-ring balance gap; `pathing` switched on in production and checked (`/api/config`, `/api/health`, no runtime errors). Updated D040, OPEN-TODOS, INTERFACES and the sprint guide.
- **2026-11-14, live-state pass (docs only), branch `docs/sprint-live-state`.** Claude, for Nils: recorded the late-evening production state (flags `rescue`, `defenses_v2` and `tower_health` on; `pathing` off; migration `20261114140000_culverin` and the four earlier ones applied), PRs #54, #56, #59, #62 and #63; set the OPEN-TODOS section 9 statuses (T33, T38 and T43 live; T34/T35 merged, pathing off pending a team decision) and the follow-up table; updated the sprint guide (sections 0 and 13, notes in 10 and 11, new section 15 with three explain-back questions); marked the outdated sentence in the `wave_rules` migration header and `supabase/README.md` as superseded by #63. No code, flag or database change.
- **2026-11-14, sprint final pass (docs only), branch `docs/sprint-final-pass`.** Claude, for Nils: recorded that the four sprint migrations are applied live and which flags are on in production; replaced the stale "not applied" wording (D039, D041, D042, D049, supabase/README.md, INTERFACES.md, the T29/T33/T36/T40 specs); set every T29–T47 row in OPEN-TODOS section 9 to its real state with PR numbers and listed the known follow-ups; added the T45, arsenal, integration and culverin sections to the sprint guide. No code, flag or database change.

- **2026-11-14, sim integration (T29–T32 follow-ups, T33, T34/T35, T38), branch `feat/integration-sim`.** Nils (agent-assisted). Wall recovery: a finish can no longer heal walls (capped at the wave-start health) and a failed wall record never breaks a paid finish. New off-by-default flags `tower_health` (T33, D049 proposed: tower hp in a wave) and `pathing` (T34/T35 routes over the walls' T36 footprints; option A while off); the existing `rescue` flag now also switches the T38 sim hook on. All three travel to every client as `rules` on the wave answers, so a wave never mixes rules. Each wave keeps its rule set at its first answer (additive migration `20261114130500_wave_rules.sql`, not applied: apply it before switching any rule flag on). Before switching any of them on: reload all clients, playtest balance (T3).

- **2026-11-14, T29–T47 review guide.** Claude, for Nils: added [SPRINT-T29-T47-GUIDE.md](SPRINT-T29-T47-GUIDE.md), a beginner walkthrough of the sprint merges (#33–#44) with code walks, tests, explain-back questions, the flag/migration picture and a suggested split for the four teammates. Docs only; checked links and content as ENGINEERING.md section 3 asks. Open: the live state of the flags on Vercel is not recorded in the repo.

- **2026-11-14, T29–T47 fast-track started.** Nils approved and merged PR #20; eight agent lanes opened issues #21–#28. Per D047, green lanes merge without a prior peer approval, behind off-by-default flags where a migration is needed; teammates review after the merge.

- **2026-11-14, T28 implemented.** Ianno, assisted by Codex, implemented first-time practice per player/island/minigame on updated main. Full frontend suite and four-page shared-start proof pass; [evidence](evidence/T28/README.md). Introductory explain-back completed after clarification; independent human review pending.

- **2026-11-14, T27, Ianno with Codex:** exact-angle shooting visuals and body/gun overlap implemented in draft PR #17; checks passed; screenshot montage, walkthrough and test-map updated; coached explain-back discussed; independent human review pending.

- **2026-11-14, T7 explain-back:** Ianno explained weekly high scores and island grouping, then corrected the outage answer after clarification: Try again because results could not be retrieved. Desktop/phone-sized Chrome coverage versus unverified live queries and physical phones was clarified. PR #13 proceeds to human review by Franz (`frcola`); no merge.

- **2026-11-13, T7 / Ianno with Codex:** weekly island leaderboard implemented on `feat/t7-weekly-leaderboard`, [PR #13](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/13). D037 records weekly island scoring; [handover](handoff/T7-weekly-leaderboard.md) records checks, sample-data screenshots and remaining explain-back/live verification.

- **2026-11-14, T27 planning.** Ianno Hollensteiner, assisted by Codex, proposed captain shooting direction as an open task. Documentation only; no animation work started.

- **13 Nov 2026, T5 explain-back:** Ianno discussed number/rank updates, the highest-wave record after a loss, and releasing old textures. Clarifications were supplied for the first and third answers. Ianno requests approval by Nils or Johannes Franz Lang before this PR is merged.

- **13 Nov 2026, T5 follow-up for Ianno:** kept the existing tree size with zero houses, then grew trees to 110% and 120% with one and two houses; corrected the earlier shrinking baseline and recaptured the house progression. [Evidence](handoff/T5-island-decoration.md).

- **13 Nov 2026, Codex for Ianno Hollensteiner:** implemented T5 on `feat/t5-island-decoration`, [PR #10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10), following Ianno’s revised rank-shield design and placement. [Evidence and limits](handoff/T5-island-decoration.md). Explain-back and human review pending.

- **2026-11-13.** Codex for Ianno: T26 island Harbor weather access, regression tests and desktop/phone screenshots in PR #8; see [evidence](handoff/T26-weather-board.md). Human explain-back/review pending.

- **14 Nov 2026 · Ianno Hollensteiner, with coding-agent assistance:** prepared additive roadmap/tasks T29–T47 for review; no implementation or release. Independent human review and explain-back are pending; no merge or release is claimed.

- **2026-11-12, Johannes Franz Lang with Codex:** T19 nearby building input on `feat/t19-nearby-interactions` ([PR #7](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/7)); 2,753 frontend tests, build/budget/text checks, 33 accessibility screens and 33 demo checks pass. Nine new cases, before/after desktop/phone evidence, walkthrough and test map included. Login, APIs and movement unchanged; no files deleted; human review pending.

- **2026-11-11, Johannes Franz Lang with Codex:** D1 adds 67 cases in five existing route-test files on `test/d1-invalid-inputs` ([PR #5](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/5)). Backend 15,894 passed / 257 skipped; Ruff clean; a temporary 65-character action-ID bug was caught and restored. Production code is unchanged; explain-back and human review remain.

- **2026-11-08.** Codex for Nils: integrated reviewed G9 overflow 1–3, collision-aware phone tap-to-walk, idle onboarding, truthful Friends entry, inline case guidance and visual polish across inspection, story and support screens on `integrate/overflow-1-3`. Final clean frontend **3,719/252**, mobile **36**, accessibility **61**, caption **51**, CSP seven pages/zero violations; budgets, recorded native journeys and fault checks pass. Release evidence. Main/deployment verification follows; no backend/SQL/env/provider/workflow changes.

- **6 Nov 2026, Codex for Nils:** activated sports on main `364d178` after protected preview and canonical production read-only provider proofs; ten real fixtures returned, eight flags verified, sensitive key scope restored, temporary Sandbox deleted. Visual simplification is integrated locally, full frontend suite 1,859/133 files passes, original endings/local-save journey and responsive screen checks pass; final character and adaptive rendering checks pass; production identity verification follows the push.

- **6 Nov 2026, Codex for Nils:** Nils cancelled the AI companion. Removed its backend context module/tests, flag and active specification, deleted future-provider configuration and application prerequisites, and updated the ten-flag API/smoke contracts. Historical entries below record earlier work only; no AI feature remains planned.

- **6 Nov 2026, Codex for Nils:** prepared and independently reviewed AI earned-context foundation 1aafd7e: 82 boundary/view checks, strict UTF-8 limits, no reveals/identity/money or state initialization. No route, provider, migration, dependency, G9 or flag change; official hosted ChatGPT approval and remaining integration stay pending.

- **6 Nov 2026, Codex for Nils:** Nils confirmed G9 is now working in the cloud. Published [current G9 readiness](handoff/g9-cloud-readiness.md): ten older server requests are ready, temporary-auth retirement stays coupled to successful in-game sign-in, and current CSP/Vite/title-budget merge issues are identified. No sign-in/Relighting activation or G9 source change.

- **6 Nov 2026, Codex for Nils:** pushed stabilization branch a2736a1 and main cb42da3; production dpl_8U92ojsjmFxwS1cRwkjqwuvAJy51 READY. Build stamp matches the merge; health/config/help/privacy/host/notices return 200. Seven flags unchanged; no new live migration or gameplay writes.

- **6 Nov 2026, Codex for Nils:** stabilization integration passes 13,584 backend tests plus nine benchmark-tool tests, 1,799 frontend tests with zero skips, production/spoiler/budget gates and merged browser/deck checks. Independent reviews passed; no new migration, dependency, workflow, cron, flag or G9 change. Full proof: stabilization release.

- **6 Nov 2026, Codex for Nils:** pushed live extras as main d5ad219, verified READY and health/config/host 200, then enabled festival and redeployed the same commit. Seven flags verified, sports/sign-in/AI remain off, world still dark with zero gameplay writes. Integrated reviewed reliability/QA/devtools/help/privacy/security/text/ship/deck/starter work for its combined gate.

- **6 Nov 2026, Codex for Nils:** reviewed festival/host/sports integration passed 11,168 backend and 1,672 frontend tests; applied and proved 160000, 170000 and 180000 separately. Live schema is 39 tables/57 project functions, expected-only security advisors. Push/deployment proof is tracked in live-extras release; sports remains off pending its provider key.

- **6 Nov, Codex:** minimum case/NPC, server followups and Exchange-v2 economy checks integrated; 10,859 backend tests pass, all 69 mixes and two actual API/SQL solves proven. Applied 130000/140000 sequentially with exact hashes, versions, counts and known-only advisors. See complete proof.

- **6 Nov, Codex:** Phase 2 production verified healthy with approved flags and private POST-only routes. Phase 3 shared world/Exchange integration passes 10,309 backend tests; reviewed 120000 applied and hash/version/counts/advisors proven, singleton remains dark. See Phase 3 proof.

- **6 Nov, Codex:** Phase 2 board/night integrated with earned private views, immutable station reads and bounded live hints; 10,269 backend / 1,603 frontend tests pass. Reviewed 080000 applied verbatim, MD5/version/counts and known-only advisors proven. See release proof.

- **6 Nov, Codex:** group 3 deployed, four approved flags verified live; case Phase 1 reviewed and migration 060000 applied/MD5-proven with expected advisors. Source and SQL gates passed; preparing Phase 1 push. G9 moves to a separate cloud session. See case proof.

- **6 Nov, Codex:** group 3 integrated and independently reviewed; applied 090000/100000/110000 one file at a time, exact MD5 proofs and version restoration passed; all final database counts and known-only advisors match. Core local gates green; cloud browser regression and live deployment checks continue. See release proof.

Newest first. One line per finished task: date, who, what, where.

- **2026-11-06, server follow-ups reconciled.** Codex for Nils preserved the four authored commits on `integrate/server-followups-v2`, adapted the local SQL port to current case/world services, retained the early token-length bound and fixed concurrent member deletion after independent review. Final focused suite: 60 passed; 993 other affected route checks passed, Ruff/diff clean. Migration 140000 MD5 `a59dccb2d3447614454f94a37cc3bb40` is independently approved; coordinator applies before release. No live writes from this task.

- **2026-11-06, evening.** Claude, for Nils: group 2 is merged on `integrate/fri6`: Codex's G8 (with all of G7), A4 live presence (D023, renumbered from A4's D018), L2 home islet (D021) and the open-world must items (D024, renumbered from its D018), and the follow-ups of the group 1 check ("Apply before you merge" brought up to date, the kit coins N5 settled by the story round, one test that keeps the three copies of the kits equal, D020 in its place in time, two spec notes). Fixes the merge needed: the content-route sweep skips the open-world files that `GET /api/bulletin` shows on purpose; the islet panel leaves the signal station's hotspot to the finale screen (since G8 that hotspot is also a plot, so E there opened both); the world check closes the islet panel before the next hotspot; the panel's labels no longer share a chunk with the game, so the cold title stays within G8's 21,080 bytes; and A4's realtime tests use a stand-in key that the secret scan does not mistake for a real one. 23 routes; `uv run pytest` 6407 passed, `npm test` 886 passed, the build and its spoiler guard pass, and the G7 and G8 browser checks pass. Its database changes `050000` and `070000` are applied before the push; the flag `live_presence` stays off. [INTERFACES.md](INTERFACES.md#what-the-browser-adapter-g9-maps) lists the presence names that G9 maps between G8 and A4.
- **2026-11-06, afternoon.** Claude, for Nils: group 1 is on `main`: the story round (D018), A2/A3 (D022, renumbered from A2's D018) and A6 (D020), merged on `integrate/fri6` and checked by an independent agent (fixes: the secret-scan false alarm, the D020 note, a scratch path in a spec). Its four database changes are applied (`010000` to `040000`, each checked by md5 against its file, versions recorded, object counts as reviewed). The API runs in Dublin (`8ff24cc`). Nils decided: no review per merge (D015, extended), no kickoff or check-ins, feature complete by Sun 8 Nov, and Codex takes the browser side.
- **2026-11-06, G8 UI correction.** At Nils’s request, Codex removed provider/licence blocks from the gameplay HUD and bulletin and moved the Credits entry under Settings, preserving the return path to title/pause. Weather values and events are unchanged. 345 tests, build/spoiler guard and nine focused browser checks pass, including 23 accessibility contexts; cold title is 21,080 bytes. Evidence: `frontend/captures/20261106_G8-Credit-Placement/`.
- **2026-11-06, G8 checkpoint 3.** Codex for Nils completed the combined regression, phone/keyboard/contrast fixes, visible-time presenter/cinematic lifecycle and class walkthrough on `feat/g8-islet-harbor-demo`, against main `8ff24cc`. All 31 commands pass: 345 tests, build/spoiler/CSP, 91 golden-path checks, 210 chaos checks and 22 accessibility contexts; the offline tour runs in 170.6 seconds and cold title is 21,052 bytes. Claude-owned panels/live services and physical screen-reader/device checks remain integration/manual work; contracts and evidence are in `frontend/GRAPHICS.md`.
- **2026-11-06, G8 checkpoint 2.** Codex for Nils added the supplied safe Chapter 2 signal/notice/log view, original harbor audio/life and the 170-second presenter kit with keyboard controls, notes, recording and performance overlay on `feat/g8-islet-harbor-demo`; main remains `8ff24cc`. 330 tests, build and six targeted browser commands pass; presenter 60 FPS/17.5 ms p95/107 calls, cold title 21,060 bytes. Full combined regression, accessibility and class documentation continue in checkpoint 3.
- **2026-11-06, G8 checkpoint 1.** Codex for Nils added persistent event-driven islet scenery, original signal/plot/sign art, the finale/chart station marker, and the opt-in Lisbon-time harbor bulletin/tonight chip on `feat/g8-islet-harbor-demo`, after merging main `8ff24cc`. 316 tests, build and seven targeted browser checks pass; islet 60–61 FPS/41–44 calls, cold title 21,061 bytes. Real panels/services still await Claude’s merge; checkpoint 2 continues.
- **2026-11-06, G8 checkpoint 0.** Codex for Nils strengthened the production spoiler guard (including elimination data), reduced the public build surface, verified strict CSP on five pages and kept ending notes inside their cards on `feat/g8-islet-harbor-demo`. 292 tests, three build variants, production tour, loading, case, golden and chaos checks pass; cold title 21,026 bytes. Checkpoint 1 continues after merging main.
- **2026-11-06, G7 checkpoint 3 complete.** Codex for Nils finished Gull’s Rest, full-case/chaos checks, larger text and lifecycle/paid-consent polish on `feat/g7-living-world`. 284 tests, build/91-file spoiler guard and all 24 verification commands pass; 83 golden-path milestones and 96 fault cases/202 assertions; cold title 21,080 bytes, eight captains with storm 60 FPS/111 calls. Ready for Claude’s real-adapter integration; no merge or deploy.
- **2026-11-06, G7 checkpoint 2.** Codex for Nils added adapter-supplied rewards/ledger/keepsakes, partner actors/status/paid consent/takeover rehearsal, Captain’s Log/hints/What next, larger phone text and cancellable shortcuts on `feat/g7-living-world`. Vitest, build/spoiler guard and new-screen browser checks pass; crew scene 61 FPS/53 calls/one root. Full-game/chaos and final regression continue in checkpoint 3.
- **2026-11-05, G7 checkpoint 1.** Codex for Nils shipped adapter conformance/fixtures, live-captain interpolation/cap/emotes, account/save presentation and larger readable text on `feat/g7-living-world`; Vitest, build/spoiler guard, 17 live/account, 26 experience and 18 loading checks pass. Eight others: 60 FPS/105 calls; cold title 20,988 bytes. Local fake only; Claude supplies the real adapter.
- **2026-11-05, end of day.** Claude, for Nils: A2 and A3 (captain names, cloud saves, delete my data, host check, the browser API client, the referee and entry kits) and A6 (crews and seats) are built and reviewed, and pushed as branches `feat/a2-a3-signin-referee` and `feat/a6-crews`; they merge first on Fri 6 after a check of their database changes against the live database. Still building: A4 live multiplayer, the story round finalize, the case backend spec, L2 home islet, the open-world must items, the Exchange v2 rework with its screen and the content linter, L5 prediction desk, A7 Lantern Duels, a security audit, the stock-API choice, and Codex's G7.
- **2026-11-05, night.** Claude, for Nils: deploy checks 4 and 5 passed. Two real players (both of Nils' GitHub accounts) each see only their own wallet, coin ledger, save and crew; every player and anon write is refused; the server-only functions are refused (181 of 181 steps on the live database, read only, every write rolled back, nothing changed). Story v2 is merged (`3d59b6a`). Nils answered the Island Exchange questions: real prices for crypto and stocks, 10x positions both ways that close at zero, no floor, ceiling or pauses (the rework is building).
- **2026-11-05, G7 checkpoint 0.** Codex for Nils added the editable four-member credits list (Nils plus three teammate-owned placeholders), Binance live/replay and licence credits on `feat/g7-living-world`. 195 tests, build/spoiler guard and 11 desktop/phone credits browser assertions pass. No adapter changes; this checkpoint is pushed alone for teammates' first contributions.
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

- **Ianno / 2026-11-16, PR #84 reconciled browser, performance and balance smoke.** *(Model: GPT-6 Luna.)* `npm run test:rules` passed with two fake clients matching for 489 ticks (0–488); both observed one repair, retained frozen wave rules for a late join, and reported no browser errors. That wave had no tower break/rebuild. The quiet synthetic 300-boarder × 3,000-tick workload passed in 1,093 ms (0.364 ms/tick), with 111 field builds, 5,547 tower-target ticks, 37 rebuilds, 7,071 heart arrivals, 887,382 movement steps and zero stuck outcomes. A three-seed smoke (waves 15/30; spots/ring; 3 guards; 2 captains; D055 trees; 2 swivel nests; none/tower_health/pathing/both) passed the script check. No sampled tower broke or rebuilt; wave-30 wall breaches averaged 1–1.3 on spots and zero on ring. These are diagnostic checks, not balance approval, production Realtime evidence or phone performance approval. Screenshots and workload/balance output are archived in `docs/evidence/T35-tower-obstacles/reconciled-2026-11-16/`. Full frontend/build/budget checks are recorded above. The later musket-pose multiplayer assertion remains unresolved; feature flag remains off and PR #84 remains draft for current-revision Franz (`@frcola`) and Ianno reviews.

- **Ianno / 2026-11-16, PR #84 balance-smoke correction.** *(Model: GPT-6 Luna.)* Review confirmed the previous three-seed `balance-rules.mjs` command exercised its built-in `none`, `tower_health`, `pathing`, and `both` modes; `both` is only `{towerHealth:true,pathing:true}`. It did not enable `towerObstacles`, so its archived results are baseline-only and cannot support T35 obstacle-balance claims. A paired baseline `{towerHealth:true,pathing:true}` versus trial `{towerHealth:true,pathing:true,towerObstacles:true}` diagnostic at waves 30 and 60, three seeds, spots and ring, with current main fixtures, trees and two swivel nests is prepared but awaits the quiet test window. Preserve the earlier entry and artifacts as historical output; no balance sign-off is implied.

- **Ianno / 2026-11-16, PR #84 explicit paired obstacle diagnostic.** *(Model: GPT-6 Luna.)* After E2's quiet frontend rerun closed, compared baseline `{towerHealth:true,pathing:true}` with trial adding `towerObstacles:true`, paired seeds 1–3 at waves 30 and 60, 3 guards, 2 captains, D055 trees and 2 swivel nests. Layout `island` uses current D056 spots; `ring` is synthetic. Current-island wave 30 and 60 both survived 3/3 in both modes; at wave 60 the trial averaged 56 tower hacks and 1.7 repairs versus baseline 11.3 hacks and no repairs, with no breaks/rebuilds. Synthetic-ring wave 30 survived 3/3 in both modes with no tower breaks/rebuilds. At synthetic-ring wave 60 baseline survived 0/3 while trial survived 2/3; trial averaged 172.3 tower hacks, 6 repairs and 1.7 breaks/rebuilds, versus baseline 80.7 hacks, 3.3 repairs and no breaks/rebuilds. The three-seed ring outcome is diagnostic only, not evidence of balance approval; keep the flag off pending broader human review. Exact per-seed output and exit proof are archived in `docs/evidence/T35-tower-obstacles/reconciled-2026-11-16/t35-paired-balance-smoke-2026-11-16.*`.


Ianno / 16 Nov 2026, unified defense recovery (PR #118). Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). D059 records Ianno's approved design for all HP-bearing structures: one automatic 10-minute countdown or paid Repair now between waves; structure healing never completes during battle. Draft docs and cross-references are updated; runtime behavior and APIs are not implemented or changed. Verified docs-only links, anchors, content consistency and STATUS.md byte-prefix preservation; no app tests or runtime checks run. Remaining: Franz (@frcola) peer review and Ianno's manual review; agree the concrete modifiers, pricing, refunds, existing wall-skill compatibility and implementation contracts. Next: prepare that plan for review before production coding.

Ianno / 16 Nov 2026, PR #118 orchestrator review. Reviewed the full six-file documentation diff and verified 339 relative link destinations, new local anchors, unique D059 and preservation of every pre-existing STATUS byte. Corrected the spec's Bastion audit: its 50% maximum-HP bonus applies to walls, separately from passive wall regeneration. No runtime implementation or app-test result is claimed. The draft remains pending Ianno's manual review and Franz's current-revision approval; prepare the concrete implementation plan for Ianno's OK before coding.


Ianno / 16 Nov 2026, PR #118 unified recovery plan update. Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). D059 and the T33 spec now state the base countdown formula `600 seconds × (maxHP − currentHP) / maxHP` before bonuses; damage pauses it, paused time is excluded from the 10-minute base cap, and wall-clock time may exceed 10 minutes. Elapsed-progress credit and the server rule for deciding that damage has stopped remain open for T54 and require Ianno's explicit approval before runtime work. Proposed, unassigned T54–T60 tasks link issues #120–#126 and split planning, persistence, paid recovery, simulation, progression refunds, UI/docs and verification. D039/D049 remain runtime truth; no code, flag, migration or deployment changed. Verified documentation links/anchors, task dependency consistency, and preservation of all prior STATUS bytes; app tests/runtime checks not run. Franz's current-revision approval and Ianno's manual review remain pending.


Ianno / 16 Nov 2026, PR #118 final timer clarification and T54–T60 handoff. Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). The confirmed base countdown is `600 seconds × (maxHP − currentHP) / maxHP` before acceleration bonuses. Every damaging hit discards prior countdown progress; after exactly 3 seconds without another damaging hit, a fresh duration starts from current HP, and further hits restart the quiet window. This is separate from the removed three-second Captain repair action. Paused/quiet-window time is excluded from the 10-minute base cap, so wall-clock time may exceed 10 minutes; health restoration still waits for an inactive boundary. T54–T60 remain proposed and unassigned under issues #120–#126; T54 must settle trusted server-clock handling and remaining contracts and receive Ianno’s explicit approval before code. Existing D039/D049 behavior remains runtime truth; no runtime implementation, flag, migration or deployment occurred. For Ianno-agent work, Franz’s current-revision approval and status as designated sole human merger are required; this records the workflow, not configured GitHub enforcement. Verified doc links/anchors, timer/task consistency, clean diff check and append-only STATUS prefix; app tests/runtime checks not run.


Ianno / 16 Nov 2026, PR #118 workflow correction. The user cancelled the request for technical GitHub protection and asked to forget it; no protection settings or repository enforcement files were changed. The review and merge wording remains the existing workflow: Ianno manually reviews, Franz must approve the current revision and may merge manually after checks/reviews, and agents never merge or enable auto-merge.

Ianno / 16 Nov 2026, PR #118 final independent review. Reviewed all seven documentation files against the final proportional-timer, progress-discard and 3-second quiet-window decisions; clarified the paid between-wave action, personal wallet, immediate full restoration and skipped quiet window, with prices still pending T54. Verified 381 relative link destinations, 16 new anchor references, unique D059/T54–T60 rows and issue links, clean diff check, and exact preservation of every pre-existing STATUS byte. All seven issues #120–#126 are open and unassigned with the settled timer rules; roadmap/build-plan references and dependency gates agree. The documentation agent was gpt-6-luna/high. No runtime implementation or app tests, migration, deployment or GitHub protection changes. Next: Ianno manual document review and Franz current-revision approval; a collaborator may claim T54 to prepare the concrete plan for Ianno's OK before runtime coding.


Ianno / 16 Nov 2026, PR #118 paid-combat recovery update. Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). D059 and the T33 spec now allow a paid full Repair now for one selected supported structure during or between waves; this is the sole combat structure HP-restoration path. Automatic recovery still only completes between waves. The countdown remains 600 seconds × missing-health fraction before approved bonuses; every damaging hit discards prior progress, and a fresh countdown starts after exactly 3 seconds without another damaging hit. T55 preserves immutable wave-start snapshots and uses separate ordered paid-action history; T56 defines the authorized event and wallet charge; T57 consumes that event; T59/T60 cover combat-card sync, later damage, stale reports, firing and safe obstacle closure. T57 depends on T56's paid-event contract. The current legacy wall API still refuses active-wave repair. T54 remains unassigned and must receive Ianno's explicit plan approval before runtime coding; exact prices, combat HP authority, clock trust, event/version details and any frequency limit remain undecided. Earlier STATUS entries describing paid repair as between-wave-only remain untouched historical records and are superseded by this update. No implementation, migration, flag, deployment, settings change or app tests are claimed. Verified docs links/content and append-only STATUS prefix; app tests/runtime checks not run. Next: Ianno manually reviews current docs, then Franz may approve the current revision under the existing workflow.


Ianno / 16 Nov 2026, PR #118 recovery-progress correction. Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). This supersedes the earlier choice to discard timer progress on damage: hits now pause countdown advancement while preserving earned recovery progress. After exactly 3 seconds without another hit, recalculate the base requirement from current missing HP and subtract saved progress; further hits restart only the quiet window. The approved example leaves 4 minutes before bonuses (50% missing HP requires 5 minutes; after 2 minutes earned, +10% damage raises the requirement to 6 minutes). T54 must define progress/work units under bonuses, conversion, rounding, clamping and zero/no-bank behavior, plus clock/offline/event ordering. Paid combat Repair now remains the sole combat HP-restoration path; paid or automatic full restoration clears recovery progress, and later damage starts a new cycle. Earlier STATUS entries documenting progress discard are historical and remain byte-for-byte intact; this entry supersedes that rule. D059/spec/task board/build gates were updated; runtime behavior remains unimplemented. Verified docs links/content, append-only preservation of all previous STATUS bytes and original baseline; no app tests or runtime checks. Exact modifiers, prices, refund compatibility and API/clock/event contracts still need T54 planning and Ianno's explicit OK before coding. Next: Ianno manually reviews the current docs, then Franz may approve the current revision under the existing workflow.


Ianno / 16 Nov 2026, PR #118 final gradual recovery clarification. Model: GPT-6 Luna. Separate human owner: Ianno (@Iannomh123456). This supersedes the earlier wait-then-full and damage-progress-credit proposals: actual HP is the recovery state. Base gradual healing is `maxHP / 600 seconds` before approved bonuses; a hit subtracts from current HP and pauses healing until exactly 3 seconds without another hit, while previously regained HP remains in the actual HP value. The confirmed example is `50% HP → 60% HP → 50% HP` after 10 percentage points of damage. Automatic healing runs during and between waves and offline under the approved server model, and can reach full HP during combat. Paid Repair now remains the immediate full-restore option for one selected structure during or between waves, with caller personal-wallet idempotency and ordered event sync. D059 is now titled “Shared gradual HP recovery and paid instant Repair”; its old published anchor remains as a compatibility anchor. OPEN-TODOS T54–T60 and build/interface notes cover gradual HP state, zero-HP behavior, event ordering, modifiers, precision and multiplayer evidence. T54 must prepare the concrete clock/health authority, rounding, rate modifiers, zero-HP firing/obstacle policy, prices, refunds and API/version plan for Ianno's explicit OK before coding. Existing D039/D049 and the legacy wall API remain runtime truth until reviewed implementation; no code, migration, flag, deployment, settings change or app tests are claimed. Verified 313 relative markdown file destinations, D059 new/legacy anchors, diff check, and append-only STATUS prefixes including every byte at dfd0950f and the original baseline. Earlier STATUS entries, including the interim progress-retention log, remain untouched history and are superseded by this final rule. Next: Ianno manually reviews current docs, then Franz may approve the current revision under the existing workflow.


Ianno / 16 Nov 2026, PR #118 final gradual-model review. Independently reviewed the six-file gradual-healing revision and the complete seven-file documentation scope; corrected remaining wall-research and crew wording so all retained healing modifiers feed the one shared gradual rate. Verified 384 relative file destinations, 18 new local anchor references, both current and compatibility D059 anchors, unique T54–T60 links, clean whitespace diff and all eight updated tracking/task issues; the seven follow-up tasks remain open and unassigned. Original, paid-revision, interim-append and agent-handoff STATUS bytes remain exact prefixes, with no deleted history. The documentation agent used gpt-6-luna/high. No runtime implementation, application tests, migration, flag, deployment or settings change is claimed. Next: Ianno manually reviews the final rules and tasks in PR #118; after owner review, request Franz's current-revision review. T54 still needs a concrete plan and Ianno's OK before runtime coding.


Ianno / 16 Nov 2026, T54–T60 pipeline claim. Created docs/t54-recovery-implementation-plan from main e180ef53 after Franz manually merged the accepted design in PR #118. Ianno is claiming T54–T60; T54 is active planning in the orchestration session and T55–T60 remain reserved and blocked on the approved plan and their dependencies. No implementation agent, runtime code, migration, deployment or settings change has started. The concrete values/contracts, tests and risks will come back for Ianno's OK before coding; every implementation task will have its own branch and draft PR, with Ianno manual review and Franz current-revision approval before human merge.


Ianno / 16 Nov 2026, PR #127 pipeline reservation and fixed paid-price decision. Issues #120–#126 are assigned to Ianno: T54 planning is active on docs/t54-recovery-implementation-plan; T55–T60 are reserved and blocked, with no runtime agent started. OPEN-TODOS, BUILD-PLAN and FINAL-ROADMAP now show that ownership. Ianno clarified that instant Repair now costs a fixed amount per structure kind and level, identical for partial damage or destruction; no missing-HP price multiplier. D059 and the recovery specs/task requirements record this accepted rule; exact prices and the remaining implementation contracts still require T54 planning and Ianno's OK. Historical STATUS content is preserved by EOF append only; no runtime, instruction-file or settings changes.


Ianno / 16 Nov 2026, PR #127 accepted tuning and no-compensation scope. Ianno approved the fixed instant-repair formula (30% of cumulative catalogue construction cost, rounded up), +100% shared rate per Carpenter (maximum two), Workshop +30% within 10 units capped at +50%, multiplicative stacking, and reactivation at any positive HP. Ianno then removed player-compensation requirements: no special refunds, free respec or compensation migrations. The final gameplay recommendation keeps Engineer construction discounts and maps Quick Mend/Mason Drill/Bastion into the shared recovery rate; these cleanup effects remain for final T54 confirmation. T54 now records source-audit findings, canonical co-op crew and arithmetic proposals, paid-event/finish and replay concerns, tests and the ×20.25 wall balance case. Technical authority/API/locking/history contracts still need completion and Ianno approval before runtime coding. Earlier STATUS entries are preserved and superseded where they mention compensation. No runtime code, instruction files or settings changed.


Ianno / 16 Nov 2026, PR #128 destroyed-wave recovery amendment. Model: GPT-6 Luna (gpt-6-luna/high). Separate human owner: Ianno (@Iannomh123456). D059 and T33 now state that a structure destroyed during a wave remains non-operational for that wave unless server-confirmed paid Repair now restores it; positive HP or room-only messages cannot clear the gate, and later destruction reapplies it. Standing damaged structures keep actual regained HP and gradual recovery during combat, between waves and offline. Paid price and Carpenter/Workshop bonuses are unchanged. Canonical co-op Carpenter source is the island owner's hired count, capped at two, including while the owner is offline. Two choices remain open: disabled HP remains at zero versus heals in the background (including already-broken wave-start cases), and unpaid between-wave reactivation at positive versus full HP. The plan and task board also require an old paid-action UID retried after re-destruction to return its prior receipt/current state without charging again or restoring health/clearing the new gate; another restore needs a new UID. T54 is still WIP and requires Ianno's full-plan approval before T55–T60 or runtime work; those tasks remain reserved/blocked. Updated D059, T33/T54, OPEN-TODOS, BUILD-PLAN, INTERFACES and FINAL-ROADMAP; the existing wall API's active-wave refusal remains current runtime truth. Documentation-only review: links/anchors, D059 compatibility alias, rule consistency and STATUS baseline/prefix are being checked. No app suites or runtime checks claimed. Remaining: resolve the two pending choices, finish T54 technical contracts/skill recommendations, manual review, then Franz current-revision approval. Next: complete docs-only checks, commit and push this stacked child revision while keeping PR #128 draft.


Ianno / 16 Nov 2026, PR #128 closure correction. PRs #127 and #128 are closed without merge while the two disabled-HP/phase choices are discussed; keep the local documentation branches and commits, and do not reopen or request review until the rules are agreed. This supersedes the preceding draft-PR/next-review wording. The documentation checks have now completed; see the branch handoff for exact results and the known pre-existing INTERFACES anchor. No production/runtime changes.


Ianno / 16 Nov 2026 — T54 gameplay rules consolidated in D059, T33 and the T54 plan; this note supersedes earlier STATUS entries wherever they describe different repair behavior. Automatic repair is between waves only: base `maxHP / 600` HP per eligible second, proportional to missing HP, starting 3 seconds after the latest hit; active waves grant no automatic HP or healing credit, including offline and through all Carpenter/Workshop/Tech paths. Destroyed structures remain at 0 and inactive during a wave unless paid Repair now succeeds; between-wave healing can restore them and any positive HP can start the next wave. Repair now restores full HP at the current base-level incremental catalogue price (walls L1–5: 10/20/40/80/160); three successful uses per island wave are shared across players/structures, unlimited between waves, with atomic wallet/HP/event/quota and safe UID retries. Owner-backed Carpenters, Workshop caps, wall Tech, Captain changes, exact HP visuals and testing scope are recorded in the specs. T55–T60 remain reserved and blocked pending reviewed T54 technical authority, replay, locking, precision, API/version and rollout plan. Runtime/API/player guides still describe shipped behavior; no implementation or production change is claimed.

Ianno / 16 Nov 2026, T54 no-delay and repair-card amendment. This supersedes the 3-second post-hit quiet period in the prior T54 notes: approved automatic repair runs only between waves and starts/resumes immediately at the canonical inactive boundary, including offline inactive elapsed time. It has no hit-dependent countdown, last-hit repair state, or free-healing credit bank; damage still subtracts from current actual HP. T59 must clearly display the between-wave choice as `Repair now — pay N coins` plus an estimated free-repair time computed from actual missing HP and current approved bonuses; free repair continues automatically while the card is open or ignored. The ETA updates as HP/bonuses change, switches to paused status during waves, and recomputes from actual HP/current bonuses after the next inactive boundary; active-wave cards show shared paid-use quota without a combat ETA. Full HP has no repair offer. T60 covers dynamic price/ETA, paid repair concurrent with free healing, intact-target rejection without charge, wave-start ETA pause/resume and two-client agreement. No modal is specified. T55–T60 remain reserved and blocked on Ianno's approval of the concrete T54 authority, replay, locking, precision, API/version and rollout plan. This is documentation only; existing legacy API/runtime truth remains unchanged. Earlier STATUS bytes are preserved exactly; no runtime implementation or app tests are claimed.


Ianno / 16 Nov 2026 — T54 repair documentation reconciled with current main 5ba3fd13 on docs/t54-destroyed-wave-lock. Preserved the complete current-main STATUS prefix and every earlier branch log line unchanged and in order; retained collaborators' decisions, interface updates and task statuses. The repair proposal now has immediate between-wave automatic repair with no post-hit delay, plus a clearly priced instant action versus estimated free wait. Independent documentation checks passed: eight-file scope against current main, 269 relative destinations, two added anchor references, content and whitespace checks. Parent planning branch 720021b6 remains unchanged. No runtime implementation, application test, PR reopening/merge or production change is claimed.


Ianno / 16 Nov 2026 — Approved the documented repair rules after the current-file summary. The documentation review handoff is prepared for PR #128 against main; this supersedes the earlier hold keeping that request closed. PR #127 remains superseded and closed. The gameplay rules are unchanged from ad91c903: immediate gradual repair only between waves, shared three paid combat repairs, current-base-level price and explicit pay-versus-free-wait display. T54 technical authority/replay/locking/API/rollout work still requires a concrete plan and approval before T55–T60 coding. Franz must review and approve the current revision before human merge. No runtime implementation or production change.


Ianno / 16 Nov 2026, T54 frontend source audit. Model: GPT-6 Luna (gpt-6-luna/high). Audited current-main frontend wave metadata/clock, local HP simulation, room inputs, late join, finish reports, repair API/UI and renderer behavior; verified findings are recorded in the source-audit appendix of specs/T54-recovery-implementation-plan.md. The browser runs a deterministic local simulation but room delivery has no durable event replay, finish reports include client-computed wall percentages only, and tower HP is wave-local. This is source documentation only: no runtime/API behavior, gameplay rule, migration or deployment changed. T54 technical planning remains active with root architecture input pending; T55–T60 remain blocked until the complete technical plan is approved. No application tests or runtime checks run.


Ianno / 16 Nov 2026, T54 bell-reservation and upgrade confirmation. Ianno confirmed automatic repair pauses at server acceptance of the bell/wave-start reservation, including preparation/countdown; the shared three-repair limit also begins then and runs through canonical finish/expiry, with unlimited paid repairs outside that window. Wall and tower level upgrades are allowed only between waves over the same reservation boundary. The T54 source-audit appendix is recorded; the technical contract remains WIP, and T55–T60 remain blocked pending explicit T54 approval. This documentation update does not change runtime/API behavior or historical runtime-contract descriptions. No application tests or runtime checks run.

Ianno / 16 Nov 2026, T54 technical proposal handoff. The T54 plan now records root's concrete proposed authority, persistence, HP clock, journal/replay, paid repair, finish, lock-order and rollout design, including the latest quota identity, checkpoint, receipt privacy/current-balance, maxHP conversion and UI freshness details. This is a proposal only, pending Ianno's review and approval; no T55–T60 work is authorized or assigned. The source audit and technical planning remain WIP. No runtime code, API behavior, migration, application test or runtime check is claimed.


Ianno / 16 Nov 2026 — T54 technical proposal reviewed and refined by the orchestration session on docs/t54-repair-contracts, baseline main 460cb37a. The post-PR128 gameplay confirmations are explicit: accepted bell reservation pauses automatic repair, locks wall/tower level upgrades and starts the shared three-paid-repair allowance through preparation/countdown and combat. The technical contract remains proposed and unimplemented: normalized persistent HP, recovery v1/protocol 2, authenticated ordered history, replay, atomic wallet/HP/quota/receipt commits, reset generations, canonical lock order and compatibility rollout. Root resolved version labels, captured clock time after locks and fixed sealed-frontier wording. The earlier candidate fixed-age HP freshness window is superseded by per-instance repair-sequence validation; ordinary damage must not invalidate the damage-independent fixed-price quote, while another paid repair requires reconfirmation. Network delay/load, replay cost, raw-input retention and bounded client-reported combat HP are explicit approval/release gates. No runtime code, migration, feature activation or deployment was performed. T55–T60 implementation agents remain unassigned pending Ianno approval. New draft publication remains on hold after automatic approval review cited the earlier publication hold; no workaround was attempted. Existing STATUS bytes were retained by EOF append only.


Ianno / 16 Nov 2026 — Reconciled T54 planning with main eba53be0 (D060 extra tower spots and route-badge cleanup) on docs/t54-repair-contracts only. All collaborator changes and the entire current-main STATUS prefix were retained; all prior branch log entries remain unchanged and in order. The proposal covers the additional tower spots, preserves D060, and distinguishes approved gameplay from unapproved transport/authority recommendations. Documentation review passed for the eight-file scope, local destinations, anchors, whitespace and append-only log preservation; no application or live checks are claimed. The concrete proposal is prepared for Ianno review before publication, implementation assignment or any merge request.


Ianno / 2026-11-16 — T55: Save wall and tower health started on `feat/t55-structure-health` from main `a09787c0`, following Ianno’s confirmation and authorization after Franz (@frcola) merged PR #135. Responsible teammate: Ianno (@Iannomh123456); implementation model: gpt-6-luna, high reasoning, with stronger-session orchestration and review. Tracking: issue #121; separate draft PR follows. Isolated parallel work is coordinated across T55 persistence, T58 Captain/research and T59 presentation. Integration depends on the approved T54 contracts and required preceding implementations. No implementation verification or release is claimed. No live migration, flag activation or deployment is authorized; human review precedes any merge.

Ianno / 2026-11-16 — T55 foundation milestone: added normalized integer-HP projection/settlement, exact rational between-wave rate factors using equipped wall spec and island research, validated version-1 HP manifest and Captain skill policy filtering. Updated T54/D059/BUILD-PLAN approval metadata and clarified that only an equipped wall Quick Mend/Bastion spec applies. Focused backend checks: 27 tests passed and Ruff passed; frontend manifest parity check: 2 tests passed. The STATUS prefix remains byte-identical. Database persistence/APIs, migration, lock-order integration and disposable PostgreSQL checks are still in progress; this is not a completed T55 handoff. No migration was applied, no flag enabled, and no deployment made.

Ianno / 2026-11-17 — T55 additive persistence milestone: added service-only normalized health, versioned wave snapshot/journal/checkpoint/receipt foundations, default-off rule registration, pure statement-consistent state projection and locked canonical settlement helper. Disposable full-chain PostgreSQL suite: 19 tests passed, including overflow-safe projection, zero-origin recovery, exact read projection without anchor mutation, between-wave settlement, closed-history actor anonymization, and post-bell construction through expiry. Focused backend tests: 57 passed; Ruff passed. The migration was applied and reapplied only in the disposable private PostgreSQL fixture; no live database was touched. Recovery routes and legacy lock-order/lifecycle wrappers remain incomplete, the feature remains off, and this is not full T55 completion or rollout approval.

Ianno / 2026-11-17 — T55 shared state reader: added `GET /api/island/structures` for an owned island or a member island, backed by a strict read-only serializer and canonical database projection; v0 state stays `feature_off`, and saved v1 state is independent of the admission flag. The response uses the approved camel-case field set and contains no wallet balance. Focused route tests passed: 3; combined route/co-op/island checks passed: 113. Ruff and diff checks passed. The route and documentation are on the implementation branch only, not deployed.

Ianno / 2026-11-17 — T55 protocol/API milestone: wave start, join and current now negotiate persisted recovery versions and caller protocol through the version-aware lifecycle RPCs; v1 intent, event-page, health-checkpoint and atomic-finish adapters expose the agreed transport fields, with server-authored Captain metadata and strict bounded input validation. Added the versioned simulation template contract, per-player read/write budgets and implementation-only API documentation. Focused recovery/wave route and transport tests passed: 102; Ruff and formatting checks passed. This milestone does not include the lifecycle SQL implementation or integrated disposable PostgreSQL verification; feature admission remains off and no live migration/deployment occurred.

Ianno / 2026-11-17 — T55 protocol/API milestone: wave start, join and current now negotiate persisted recovery versions and caller protocol through the version-aware lifecycle RPCs; v1 intent, event-page, health-checkpoint and atomic-finish adapters expose the agreed transport fields, with server-authored Captain metadata and strict bounded input validation. Added the versioned simulation template contract, per-player read/write budgets and implementation-only API documentation. Focused recovery/wave route and transport tests passed: 102; Ruff and formatting checks passed. This milestone does not include the lifecycle SQL implementation or integrated disposable PostgreSQL verification; feature admission remains off and no live migration/deployment occurred.
