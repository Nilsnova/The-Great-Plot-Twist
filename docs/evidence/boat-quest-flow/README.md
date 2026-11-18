# Quest and boat flow evidence

Review evidence for issue #462 and [PR #467](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/467), used by Ianno and the peer reviewer. Prerequisite #481 has merged. [Latest main-merge evidence](merge-0a639631/README.md) covers the HUD/reward integration with main `0a639631`; the boat decision is now D068, preserving main's reward decision D067. Earlier [notice-layout review evidence](review-2026-11-18/README.md) and results below retain their original source boundaries.

## Earlier component browser evidence

From `frontend/`, run `node ../docs/evidence/boat-quest-flow/capture.mjs`. These screenshots were captured on combined candidate `9ff8cd8b`. Production HUD, island controller, ship card and boat scene run with the local fake server. A second fake captain starts wave 31 and the first joins while playing the boat. An old save at goal 8 with two hired gunners recovers to goal 10. This fixture does not mount the real pirate wave HUD; the later native review found overlaps it could not detect.

At 1280×720 and 375×812, [capture.json](capture.json) confirms: no remaining boat or modal, captain input available, visible interruption notice within the viewport, no countdown overlap or horizontal overflow, zero application page errors and zero external requests. Local Vite's blocked hot-reload WebSocket emitted eight console errors; the capture records that limitation without its transient token. The independent notice survives error/success toasts and completed pending payouts.

| Ship card before starting | Interrupted during countdown |
|---|---|
| [Desktop](ship-card-desktop.png) | [Desktop](interrupted-desktop.png) |
| [Phone](ship-card-phone.png) | [Phone](interrupted-phone.png) |

Screenshots are labelled component fixtures: current production UI on a plain fixture background, not an authenticated multiplayer battle.

## Earlier joint checks

- Focused original boat/controller/UI regression command: **9 files / 97 tests passed** before latest-main integration; saved-goal/guide rules also passed **2 files / 19 tests** during the merge review.
- Initial joint `npm test` at `465c8e39`: **4626 passed / 1 failed**, 421 files, 410.19 s. The one failure was an existing source-string guard expecting the former two-argument movement call. The guard now recognizes the callback-bearing call while retaining the overlay-blocking assertion; actual movement-before-combat/draw and blocked-movement behavior is tested. Targeted guard/movement/live-feedback checks: **3 files / 98 tests passed**.
- Final joint `npm test` at `9ff8cd8b`: **421 files / 4627 tests passed**, 388.98 s, exit 0. Exact full-suite and build logs are retained with the included [pose verification](../captain-pose-feedback/README.md).
- Combined `npm run build`: **passed**, 698 ms; spoiler guard **245 text files / 12 protected lines**. Application files are identical between `465c8e39` and `9ff8cd8b`.
- `npm run test:mp -- /tmp/captain-pose-final-mp` on the included pose source `0b714732`: **OK (4 pages)**, including both own-pose viewports, matching teammate poses, synchronized combat/HP, revive, pause/resume, late joins, boss admission, T28 personal practice and shared finisher outcome. [Exact native evidence and source boundaries](../captain-pose-feedback/README.md). This is the component-source native journey; it is not labelled as a separate joint-head native rerun.
- Fresh joint component capture passed on `9ff8cd8b`. Task diff whitespace checks, JavaScript/capture syntax and document links passed; independent agent reviews found no actionable integration defect. No assertion, viewport, quality setting or timeout in the original multiplayer checker was relaxed.

## Historical results

The original application `d464c20a` (before latest-main/pose integration) passed 3847 tests across 349 files and its build. Its general native journey stopped at the musket-pose assertion tracked in #421. The pose follow-up now resolves that failure; old results retain their original source boundary. The original bare multiplayer command also stopped on its developer-specific output path; all actual runs use the documented positional folder argument. Initial text-lint findings were corrected; the current lint has zero errors and eight pre-existing report-only findings.

## Limits and next step

Real Supabase room delivery, live wallet settlement, physical-device interaction and human acceptance remain unverified. These fixes add no backend/schema change. Best-score topups remain optional/pending; D057's first-success payout is clearly explained before play. The refreshed #467 needs current-head human peer approval. This task did not merge to main or deploy; #481 was merged separately by another teammate.
