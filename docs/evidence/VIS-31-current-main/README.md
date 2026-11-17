# Current-main ancestry reconciliation

Responsible human: Johannes Franz Lang (`frcola`). [Issue #391](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/391), child of [VIS31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236). [Draft #392](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/392), branch `chore/reference-village-current-main`.

The preview now contains the fetched main history while preserving its runtime
and original artwork bytes. The ancestry operation happened only in an isolated
review clone. No GitHub PR was merged, main was not updated, and no rollout,
migration or deployment occurred. Keep Draft for different-human review.

## Exact history and source identity

- Pinned visual candidate: `414559fba3efade531de71acd7f24593f65b006d`.
- Candidate complete tree: `bef92ab18e2270bf33bce29ccbbe9efb50223e4e`.
- Initial audited main: `8759fc802a43e2860e631bf452b07d792d1c50c4`.
- Freshly fetched main: `dbc11c46e8f61a8b1dd6f043286eaedbffe280ad` (PR #343's T60 browser follow-up).
- Shared ancestor: `569d8fda3474cb84af36af190853d1a0e02b7abf`.
- Claim document commit: `549920453dc8a2c2ca6560bab276a7a4006fcb51`.
- Normal two-parent reconciliation commit: `1cf2be0e21c21681ad08f5c8ce7987be8ba2ab41`.
- Reconciliation parents: the claim commit above and fetched main `dbc11c46`.
- Reconciliation tree before this final audit update: `6c9ec893bf796008f2a0bd8eebc45ce872c0d7b3`.

| Runtime subtree | Candidate and reconciliation tree object | Result |
|---|---|---|
| `frontend/src` | `b765286c950b39405ebfd2767ad5c45e2af9ba4d` | Identical |
| `frontend/public` | `9306942db1050d728799cee2fbdc8e8960f14ad2` | Identical |
| `backend` | `e8d128f1ed1830a052aa1407858d8d899d3cb2d8` | Identical |

The entire runtime, public assets and backend are identical to the pinned
candidate, so its source-specific captures remain applicable. Frontend scripts
are outside `frontend/src`: the incoming multiplayer QA script is deliberately
updated and exactly equals fetched main. The complete repository tree therefore
changes in the authorized21 incoming non-runtime paths plus this audit document;
it is not falsely described as a completely identical repository.

## Audited main behavior

Main875 changed46 files after the shared ancestor. Forty are byte-identical to
the pinned candidate, including guest invite validation, the seven new narrator
recordings and manifest, recovery playout/replay tests, Workshop guidance,
repair-card fixtures, input, renderer, tutorial and settings.

The six reviewed differences are intentional preview additions:

| Path | Reviewed difference retained |
|---|---|
| `docs/STATUS.md` | Preview log additions; all existing main logs retained. |
| `scripts/text-lint/words.txt` | Seventeen additional reviewed words; no main words removed. |
| `frontend/src/island/card-model.js` | Role, recovery-level, stale-level guard and actual upgrade-price fields used by selection. |
| `frontend/src/pirates/controller.js` | Perimeter demo and management guide hooks; the incoming playout-buffer implementation is retained. |
| `frontend/src/player/camera.js` | D064 projection and saved Work/Fit view preserve and extend main's held-Tab overview behavior. |
| `frontend/tests/player/tab-overview.test.js` | All original main tests retained, with added saved-village view assertions. |

### Forty identical main paths

- `docs/HOW-TO-PLAY.md`
- `docs/evidence/T57-wave-recovery/README.md`
- `docs/evidence/T58-captain-repair/README.md`
- `docs/evidence/T58-captain-repair/workshop-card-desktop.png`
- `docs/evidence/T58-captain-repair/workshop-card-phone.png`
- `docs/evidence/T59-repair-feedback/README.md`
- `docs/evidence/tab-overview/normal.png`
- `docs/evidence/tab-overview/tab-held.png`
- `frontend/captures/t59-structure-card-between-desktop.png`
- `frontend/captures/t59-structure-card-preparation-phone.png`
- `frontend/captures/t59-structure-card-tiny-phone.png`
- `frontend/public/audio/voice/manifest.json`
- `frontend/public/audio/voice/narrator-guide_cutlass.mp3`
- `frontend/public/audio/voice/narrator-guide_shoot.mp3`
- `frontend/public/audio/voice/narrator-unlock_final_battle.mp3`
- `frontend/public/audio/voice/narrator-unlock_research_3.mp3`
- `frontend/public/audio/voice/narrator-unlock_swivel.mp3`
- `frontend/public/audio/voice/narrator-unlock_tree_2.mp3`
- `frontend/public/audio/voice/narrator-unlock_tree_3.mp3`
- `frontend/scripts/capture-captain-repair.js`
- `frontend/scripts/capture-structure-recovery-card.js`
- `frontend/src/campaign/houses.js`
- `frontend/src/core/input.js`
- `frontend/src/core/renderer.js`
- `frontend/src/island/structure-recovery-model.js`
- `frontend/src/online/adapter/validate.js`
- `frontend/src/settings/view.js`
- `frontend/src/tutorial/pages.js`
- `frontend/tests/fixtures/structure-recovery-card-preview.js`
- `frontend/tests/island/card-model.test.js`
- `frontend/tests/island/structure-recovery-model.test.js`
- `frontend/tests/online-guest-island-signin.test.js`
- `frontend/tests/pirates/recovery-controller.test.js`
- `frontend/tests/pirates/recovery-playout.test.js`
- `frontend/tests/pirates/recovery-tower-replay.test.js`
- `frontend/tests/tutorial-pages.test.js`
- `frontend/tests/ui/tutorial.test.js`
- `specs/T57-wave-recovery.md`
- `specs/T58-captain-repair.md`
- `specs/T59-repair-feedback.md`

## Latest-main delta and conflict decisions

The fresh875→dbc delta has21 paths, all documentation, evidence or the
multiplayer browser QA script. It contains no frontend source, public asset or
backend runtime change. The coordinator explicitly authorized preserving this
new work instead of discarding it to force complete repository-tree equality.

A normal `git merge --no-commit --no-ff dbc11c46` reported three overlaps:

1. `frontend/src/player/camera.js`: retain the already-audited preview's
   obstructed-management guard, D064 framing and saved working view. Incoming
   Tab behavior is already present; no incoming runtime change after875 exists.
2. `frontend/tests/player/tab-overview.test.js`: retain the complete incoming
   original test block plus the preview's39 added lines. A prefix comparison
   confirms every original main test remains, with only the required additional
   `villageFrame` import.
3. `docs/STATUS.md`: preserve every committed preview log and append all four
   genuinely new T60 paragraphs from fetched main, including the correction and
   remaining release limitations. No historical result is relabeled as a pass.

All other incoming paths merged normally. The exact allowlist is:

- `docs/BUILD-PLAN.md`
- `docs/DECISIONS.md`
- `docs/FINAL-ROADMAP.md`
- `docs/OPEN-TODOS.md`
- `docs/STATUS.md`
- `docs/TEST-MAP.md`
- `docs/WALKTHROUGH.md`
- `docs/evidence/T60-structure-recovery/README.md`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run-output.txt`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/04-paused-break-me.png`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/05-four-captains-mid-wave-me.png`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/05b-musket-pose-own-375x812.png`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/05b-musket-pose-teammate-375x812.png`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/07-finisher-haul-mid-task-me.png`
- `docs/evidence/T60-structure-recovery/browser-followup/full-run/07-finisher-outcome-me.png`
- `docs/evidence/T60-structure-recovery/browser-followup/targeted-pose/four-page-late-wave4/05b-musket-pose-own-1280x720.png`
- `docs/evidence/T60-structure-recovery/browser-followup/targeted-pose/four-page-late-wave4/05b-musket-pose-own-375x812.png`
- `docs/evidence/T60-structure-recovery/browser-followup/targeted-pose/four-page-late-wave4/05b-musket-pose-teammate-1280x720.png`
- `docs/evidence/T60-structure-recovery/browser-followup/targeted-pose/four-page-late-wave4/05b-musket-pose-teammate-375x812.png`
- `frontend/scripts/check-multiplayer.js`
- `specs/T60-structure-recovery-verification.md`

## Verification and limits

- Initial audit:46 main paths,40 identical blobs, six reviewed differences.
- Final changed-path assertion: exactly the21 authorized latest-main paths plus
  this single audit document; no other tracked file changed.
- Exact Git tree identity for `frontend/src`, `frontend/public` and `backend`.
- `frontend/scripts/check-multiplayer.js` blob equals fetched main exactly.
- Original main Tab tests preserved as the beginning of the extended test file.
- No unmerged index entries; `git diff --cached --check` passed.
- `node --check frontend/scripts/check-multiplayer.js` passed.
- No app suite or browser launched for this ancestry/documentation task. The
  coordinator's full tests and visual checks are separate, source-specific work.
- The new T60 script was preserved, not rerun here. Incoming recorded browser
  results retain their original source and do not establish a new current run.

Explain-back: the preview already contained the earlier main fixes as
cherry-picked content, but its commit graph did not show main as an ancestor.
The normal reconciliation preserves both histories. Exact subtree hashes prove
that this operation did not change what the game runs or its artwork, while the
new T60 QA and documentation are deliberately included.

Changed: preview ancestry and incoming non-runtime records. Verified: the Git
identity/path checks and syntax check above. Not verified: app/browser behavior
or live operation. Remaining: coordinator checks and human review. Branch/PR:
`chore/reference-village-current-main`, Draft #392. Nothing merged to main.
