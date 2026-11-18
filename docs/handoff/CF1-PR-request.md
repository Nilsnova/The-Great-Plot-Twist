# Prepared PR request: clarify captain range and immediate danger

What this is: the proposed pull-request description, including screenshots.
Who uses it: Ianno for manual review and the publishing agent after explicit confirmation.

**Publication authorized on 18 November 2026.** Ianno completed all three explain-back questions, reviewed the changes and explicitly requested opening the PR. Task #453 records its link and status.

## What changes and why?

Players could not tell whether Musket shots helped or enemies were out of reach.
For [#453](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/453), show actual
weapon/skill reach while using or focusing fire and briefly after attempts,
including refusals. Use sparse parchment arcs and a short direction cap at the real boundary.
Explain reloads and out-of-range aims; use existing bullets and impact flashes for
shot feedback, without a written confirmation or damage numbers. Immediate captain/heart threats get one actionable
warning, a direction marker and a muted-aware sound attempted once per continuous warning.
After that onset, only visuals remain. Captain/heart priority changes, critical
status, menus and unmuting do not replay the sound. A threat that clears during
active play and later returns can start a new warning episode.

## Current-main integration

The published PR was reconciled with main `37eb70fa` after GitHub reported conflicts.
The overlay now uses the shared ground projection; the danger row spans the new HUD
and compacts in landscape. Main's renderer pooling, wall connections and native HUD
behavior are retained. CF1 is D066 because main already owns D061–D065. Ianno reviewed
runtime `79bb6762` before publication; these later integration changes need current
human peer review. The PR remains unmerged.

## Screenshots

Actual local fake-game captures: wave 1, level-one Musket, 1280×720 and 375×812.
Position setup and returning-device history are declared fixtures; the bell, F attacks and simulation remain real.
The updated village artwork comes from current main, separately from this combat feedback feature.

![Desktop weapon range](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-range-1280x720.png)

![Phone danger warning](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-danger-375x812.png)

| View | Before | After |
|---|---|---|
| Desktop range | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-range-1280x720.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-range-1280x720.png) |
| Phone range | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-range-375x812.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-range-375x812.png) |
| Desktop danger | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-danger-1280x720.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-danger-1280x720.png) |
| Phone danger | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-danger-375x812.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/main-integration/after-danger-375x812.png) |

[Shot/impact screenshots, full provenance, walkthrough and exact logs](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/README.md).

## Checks and evidence

- Current-main integration: **89 tests / 12 files** plus **72 tests / 8 files** passed; a later landscape-layout rerun passed **10 tests / 3 files**.
- Fresh native feedback: **14 checks**, six new screenshots; overlap audit: **21 checks pass** (later-wave hint states are skipped by current main's rule).
- Current build/spoiler guard, budget and reviewed text checks pass. Projection and initial landscape failures plus fixes are retained in the linked evidence.

Earlier verification, retained with its original scope:

- Latest audio/core-wave regression suite: **77 tests pass across 6 files**. Build/spoiler/budget and text checks pass. Existing screenshots are preserved because this revision changes only sound triggering.
- Earlier range redesign suite: **100 tests pass across 11 files**.
- Native feedback: **14 checks pass**, six current captures; overlap audit: **24 checks pass**.
- Build, spoiler guard and budget pass; text lint reports **0 errors**.
- Prior full run: **3,864 passed / 5 failed**. Three tutorial-copy failures were corrected, and all failed cases pass in the recorded follow-up run under the original time limits. The entire full suite was not repeated for this bounded presentation revision.
- The broader demo and accessibility audits retain the limitations described in the evidence. No physical-device/Safari/screen-reader speech or live multiplayer proof is claimed.

## Responsibility and handover

- Responsible teammate: Ianno (`Iannomh123456`). Agent assistance: Codex, with isolated danger-helper work and independent read-only review.
- Decision: D066; one task branch from current main, separate helper branch, no main writes.
- Scope: frontend presentation; existing attack inputs, simulation, balance, money, recovery and network authority remain unchanged.
- Ianno completed the explain-back questions, manually reviewed the screenshots/diff and explicitly confirmed publication. Next step: a different human reviews the published change before merge.

## Ready for peer review

- [x] Ianno reviewed the feature at runtime `79bb6762` and authorized publication.
- [ ] Current integration changes have independent human peer review.
- [x] Relevant verification and screenshots are included and reviewed.
- [x] No credentials, private data or unrelated generated files are included.

Ianno confirmed review of runtime `79bb6762` and publication in this chat on 18 November 2026. A different human must review the updated integration before merge.
