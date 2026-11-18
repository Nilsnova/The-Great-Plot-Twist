# Prepared PR request: clarify captain range and immediate danger

What this is: the PR description and screenshot handover for CF1.
Who uses it: Ianno, the publishing agent and the peer reviewer.

Publication was explicitly authorized on 18 November 2026 after all three explain-back questions and Ianno's review. Existing PR: [#475](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/475).

## What changes and why?

Players could not tell whether Musket shots helped or enemies were out of reach.
For [#453](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/453), show the current
weapon/skill reach on local fire hover/focus/hold and briefly after attempts,
including refusals. Twelve short, warm parchment arcs have enough contrast over
textured terrain, with a short cap in the last gun direction. Each multiplayer
browser sees only its own captain's range.

Use existing bullets and impact flashes for successful shots, without a written
Hit label or damage numbers. One actionable captain/heart warning and direction
marker prioritize immediate danger. Sound is attempted once per continuous warning;
then visuals continue alone. Changes in priority, critical status, menus or mute do
not replay it. A threat that genuinely clears and later returns is a new episode.

## Reviewer fixes and main reconciliation

The [posted review](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/475#pullrequestreview-5959325841)
identified a valid musket shot showing Cutlass reach beside a boarder, and a narrator
caption covering the danger instruction on a short phone. Both are corrected:

- The explicit recent gun/cutlass attempt determines range mode until it expires; ambient melee hints resume afterward. An accepted ship shot beside a real boarder retains Musket range 14 and its direction point. Refused gun attempts follow the same rule.
- A narrator caption yields only when its measured rectangle covers an acute instruction. Its still-active text and Skip return when the warning clears; existing reading/audio timers continue, so expired lines are not replayed.
- Portrait touch Fire sits below the measured warning/weather bar, and expanded range text reserves the joystick column.

The task branch retains the teammate's `79629587` pose reconciliation and merges
main through `03e660fe` via `4fe16d9f`. The STATUS conflict preserves both histories.
Upstream weapon art, poses, shot art, simulation and live-input feedback remain
byte-identical to that main. CF1 is D068. The open visual draft #489 was not merged;
a bounded manual composition verifies its narrator docking/fallback with this guard.

## Screenshots

These actual local fake-game captures use wave 1, a level-one Musket, native F/mouse,
declared position setup and returning-device history. Attacks and damage run through
the real controller/simulation. Source: `a881b551`; desktop 1280×720 and phone 375×812.
The village artwork and weapon poses come from main.

![Desktop contextual range](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-range/after-range-1280x720.png)

![Phone acute warning](https://raw.githubusercontent.com/Nilsnova/The-Great-Plot-Twist/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-range/after-danger-375x812.png)

The following are native production-component layout fixtures, separate from the running-game captures:

| Small phone composition | Before | After |
|---|---|---|
| 320×568 with #489's narrator fallback | [Covered instruction](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-narrator/320x568-draft-before.png) | [Manually composed warning guard and control clearance](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-narrator/320x568-draft-composed-after.png) |
| 320×568 current task branch | — | [Warning, Fire and joystick clear](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-narrator/320x568-current-after.png) |
| 375×812 expanded weather | [Caption covers warning](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-narrator/375x812-current-before.png) | [Warning and caption both fit](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/review-narrator/375x812-current-after.png) |

[All desktop/phone range and impact captures, provenance, exact logs and history](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/feat/captain-combat-feedback/docs/evidence/CF1-captain-combat-feedback/README.md).

## Checks and evidence

- Combined focused run: **224 tests pass across 21 files**. Covers accepted/refused gun attempts, expiry, private host/visitor and recovery range, current poses/render/replay, warnings/audio, native touch/narrator/HUD and reviewed text.
- Actual-game check: **14 pass**, six fresh desktop/phone captures, no uncaught browser errors.
- Overlap audit: **21 state/viewport checks pass**. Three later-wave first-hint states remain skipped under main's rule. Separate native touch tests cover 320×568 normal/large captions, weather expansion, complete warning text, Fire/bar/joystick separation and range text bounds.
- Production build/spoiler guard and asset budget pass. The two before-fix range test failures and phone before/after evidence are retained.
- Independent read-only code and visual review found no blocking issue. The helper's manually composed #489 test passes 3/3; its exact scope and tool-output-only log limit are documented.

No fresh full-suite, broad accessibility/demo, physical-device, Safari/screen-reader
speech or live-multiplayer pass is claimed. The earlier full run remains historical:
3,864 passed / 5 failed, with affected cases passing later scoped reruns; it is not a
new full green result. Large narration without an acute warning retains existing
short-screen placement. No backend, money, balance, recovery or network rule changed
in CF1; current-main changes are preserved.

## Responsibility and handover

- Responsible teammate: Ianno (`Iannomh123456`). Codex assistance includes isolated warning-clearance work and independent read-only review.
- Task/branch: CF1 / #453, `feat/captain-combat-feedback`, D068. No main writes or deployment.
- Ianno completed all three explain-back questions, manually reviewed and authorized publication. Another teammate's completed review was reported in chat. The posted technical review requested these corrections before approval; the updated code needs current human approval.

## Ready for peer review

- [x] All three explain-back questions are completed.
- [x] Ianno reviewed the feature and authorized publication.
- [x] Relevant scoped verification, failure evidence and updated screenshots are included.
- [x] Current changes have independent agent code/visual review.
- [x] No credentials, private data or unrelated generated files are included.
- [x] Another teammate's earlier completed review is recorded, as reported by Ianno.
- [ ] The latest main reconciliation and reviewer fixes have current human approval.

The PR remains open and unmerged. Human approval of the updated fixes and any later explicit merge authorization are separate steps.
