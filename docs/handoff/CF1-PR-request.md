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

## Screenshots

Actual local fake-game captures: wave 1, level-one Musket, 1280×720 and 375×812.
Position setup is scripted; the bell, F attacks and simulation remain real.

![Desktop weapon range](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-range-1280x720.png)

![Phone danger warning](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-danger-375x812.png)

| View | Before | After |
|---|---|---|
| Desktop range | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-range-1280x720.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-range-1280x720.png) |
| Phone range | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-range-375x812.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-range-375x812.png) |
| Desktop danger | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-danger-1280x720.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-danger-1280x720.png) |
| Phone danger | [Before](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/before-danger-375x812.png) | [After](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/redesign/after-danger-375x812.png) |

[Shot/impact screenshots, full provenance, walkthrough and exact logs](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/README.md).

## Checks and evidence

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

- [x] I reviewed the complete diff; the change stays within scope.
- [x] Relevant verification and screenshots are included and reviewed.
- [x] No credentials, private data or unrelated generated files are included.

Ianno confirmed manual review and publication in this chat on 18 November 2026. A different human still reviews the published PR before merge.
