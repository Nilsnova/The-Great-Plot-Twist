# Boat notice review follow-up

Conflict resolution and native layout evidence for PR #467, used by Ianno and the peer reviewer.

## Change

Main `03e660fe` is integrated in merge `a1416e00`. The conflicts in DECISIONS and INTERFACES retain both the boat/quest contracts and main's recovery/economy decisions. Main's auto-rejoin, arsenal, recovery and captain-pose work remain intact. Prerequisite #481 has already merged separately.

The review found that the fixed boat notice covered the real wave bar/countdown at 320×568 and 844×390. The earlier component fixture did not mount that HUD. New regressions failed at both sizes before the fix; an additional rotation regression reproduced a stale toast height.

Application `d7a25731`, with the animation-clearance follow-up `e12d303d`, reserves actual notice/toast space. Short screens use a horizontal countdown; short landscape puts notice and countdown beside each other. The existing 1.5× number animation has frame clearance. Temporary status/combat stacking keeps both readable above passive narration; ordinary priorities return when the seven-second notice hides. Observers and their reserved space are cleaned up on disposal. Payout and refund rules are unchanged.

## Verification

- `npm test`: **425 files / 4681 tests passed**, 493.25 s, exit 0. [Complete frontend log](frontend.log). The run began with the `d7a25731` application; the final six-pixel animation-clearance adjustment in `e12d303d` is also covered by the final focused and native proofs below.
- Main-integration checks: **7 files / 86 tests passed**, 16.70 s, covering quests, boats, rejoin, arsenal and recovery policy.
- Final focused checks: **6 files / 28 tests passed**, 37.21 s, covering selection-dock cleanup, boat transitions/layout/rotation, toast clearance, HUD startup and lazy loading. After the final animation gap adjustment, boat/selection checks passed **2 files / 10 tests**, 8.79 s.
- `npm run build`: **passed**, 1.92 s; spoiler guard **250 text files / 12 protected lines**. [Build log](build.log).
- `node scripts/text-lint/index.mjs`: **0 errors / 10 report-only findings** in existing source. Task diff, syntax and document-link checks accompany this handover.
- Independent read-only source/integration reviews found no actionable defect after the fixes. These are technical reviews, not human peer approval.

The first broad run had 4678 passes and three selection-dock teardown failures: its semantic DOM fixture has no document root. Optional root access preserves that existing fixture; final targeted checks pass without changing its assertions. The full game's normal ArrowRight handler prevents page scrolling, so native movement, rather than `defaultPrevented`, establishes restored control.

## Native reproduction

From `frontend/`:

```sh
node ../docs/evidence/boat-quest-flow/native-layout.mjs /tmp/boat-notice-proof
```

The script enters the real local game, repairs the boat through fake APIs, opens its real dash scene and starts wave 31 through the island controller. It observes the real wave HUD, current toasts, notice, natural countdown animation and captain position. It changes no clock, animation, renderer, pose or game outcome. The error variant adds an ordinary application error toast; both live rotations settle through four natural animation frames. The report brackets five relevant application files with SHA-256 hashes.

The [native report](native.json) is from application `e12d303d`; all five hashes stayed stable and match the committed files. It records four fixed viewport/toast variants and both settled rotations. All keep notice/countdown within the viewport, clear the bar/toast/countdown, close the boat/modal and release the island overlay. Native ArrowRight movement resumes in both rotations. Status and countdown remain readable above passive captions. No application page errors, console errors or external requests were captured.

| Viewport | Ordinary feedback | Error toast | After rotation |
|---|---|---|---|
| 320×568 | [Portrait](wave31-320x568-normal.png) | [Portrait/error](wave31-320x568-error.png) | [To landscape](wave31-320x568-rotated.png) |
| 844×390 | [Landscape](wave31-844x390-normal.png) | [Landscape/error](wave31-844x390-error.png) | [To portrait](wave31-844x390-rotated.png) |

Natural-animation DOM samples also retain any observation during resizing, before layout observers settle. They are diagnostic observations, not proof that every intermediate DOM state was painted. Settled geometry, native movement and the actual screenshots establish the stated result.

## Limits and handover

These are local Chrome/fake-server checks, not authenticated Supabase delivery, live wallet settlement or physical-device acceptance. The previous broad native multiplayer journey retains its earlier source boundary; it was not rerun for this layout-only follow-up. Different-human approval of the refreshed PR and an explicit merge instruction remain required. This task did not merge to main or deploy.
