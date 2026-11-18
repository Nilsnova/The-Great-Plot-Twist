# Prepared PR request: clarify captain range and immediate danger

What this is: the proposed pull-request description, including screenshots.
Who uses it: Ianno for manual review and the publishing agent after explicit confirmation.

**Not published.** Explain-back 1/3 is completed; visual review, the two remaining answers and publication confirmation are pending.

## What changes and why?

Players could not tell whether Musket shots helped or enemies were out of reach.
For [#453](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/453), show actual
weapon/skill reach while using or focusing fire and briefly after attempts,
including refusals. Use sparse parchment arcs and a short direction cap at the real boundary.
Explain reloads and out-of-range aims; use existing bullets and impact flashes for
shot feedback, without a written confirmation or damage numbers. Immediate captain/heart threats get one actionable
warning, a direction marker and a muted-aware sound limited to once per six seconds.

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

- Current focused suite: **100 tests pass across 11 files**.
- Native feedback: **14 checks pass**, six current captures; overlap audit: **24 checks pass**.
- Build, spoiler guard and budget pass; text lint reports **0 errors**.
- Prior full run: **3,864 passed / 5 failed**. Three tutorial-copy failures were corrected, and all failed cases pass in the recorded follow-up run under the original time limits. The entire full suite was not repeated for this bounded presentation revision.
- The broader demo and accessibility audits retain the limitations described in the evidence. No physical-device/Safari/screen-reader speech or live multiplayer proof is claimed.

## Responsibility and handover

- Responsible teammate: Ianno (`Iannomh123456`). Agent assistance: Codex, with isolated danger-helper work and independent read-only review.
- Decision: D061; one task branch from current main, separate helper branch, no main writes.
- Scope: frontend presentation; existing attack inputs, simulation, balance, money, recovery and network authority remain unchanged.
- Next step: Ianno manually reviews the screenshots/diff, answers the remaining explain-back questions and explicitly confirms publication. A different human reviews the published change before merge.

## Ready for peer review

- [ ] I reviewed the complete diff; the change stays within scope.
- [ ] Relevant verification and screenshots are included and reviewed.
- [ ] No credentials, private data or unrelated generated files are included.

These human-review boxes remain unchecked until the responsible teammate confirms them.
