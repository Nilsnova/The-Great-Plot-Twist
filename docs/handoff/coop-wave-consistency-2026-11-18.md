# Co-op wave consistency fixes

Current review corrections and results: [18 November review handover](coop-review-fixes-2026-11-18.md).
The checkpoints below retain their original source and verification scope.

English implementation handover for Ianno Hollensteiner and the human reviewer of four confirmed race conditions.

Responsible teammate: Ianno (`Iannomh123456`), assisted by Codex. The development evidence below
was recorded from local changes based on `48aee0e7b34c879968c4bc606b543f911032adfa`.
The publication branch is `fix/coop-wave-consistency-review`, based on current main `db573347`.
It preserves the merged VIS-41 and WebP work and adds only the remaining co-op corrections.
Ianno authorized commits and draft publication; different-human approval is still required.
Draft review: [PR #485](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/485).

The current-main core publication slice passed **95 frontend tests in 10 files** (8.52 seconds)
and **552 backend/API/PostgreSQL tests** (29.54 seconds), including the complete island SQL
suite and corrected Tavern-delegation guard. These focused checks were run after bringing the
slice onto `db573347`; they are separate from the historical combined runs below. Exact logs:
[frontend](../evidence/coop-wave-consistency/publication-frontend.log) and
[backend](../evidence/coop-wave-consistency/publication-backend.log).

## Changed

| Reported problem | Verified cause and correction | Task branch |
|---|---|---|
| Paid revival lost on reload | Payment preceded a separate journal write. The new transaction commits payment and a server-authored revival together; reconnect replays the event. A repeat spends and appends nothing again. | `fix/paid-revive-journal`, [#466](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/466) |
| Previous wave's loot abandoned | A transient failure of an in-flight finish was ignored after replacing the wave. Its original request now retains its own paced retries through replacement or travel. | `fix/recovery-wave-settlement`, [#465](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/465) |
| Old island's delayed start applied after leaving | Reset did not invalidate pending admissions. Context and lookup generations now fence responses before and after preparation, including caller UI effects. The server wave continues for its other players. | `fix/wave-context-integration`, existing [#397](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/397) / [PR #398](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/398) |
| Saved victory displayed as defeat | SQL already returns the first close's outcome, but HTTP discarded it. Canonical `survived` now controls recovery result presentation, narration, quest events and defense reports. Pending results stay neutral. | `fix/recovery-wave-settlement`, #465 |

The revival, retry and canonical-outcome defects affect recovery protocol 2. The stale island
response affects both protocols. Legacy revival and settlement contracts remain covered.
Late receipts still update the player's wallet and win event; they cannot release the next
wave's battle controls, change its result display or overwrite its loot chip.

The context fix reuses Johannes Franz Lang's (`frcola`) implementation and 25 standalone race
tests from PR #398, with scoped integration changes for current main. Preserve that authorship
when publishing; this is not a second independent implementation of his fix.

## Review locations

- [Revival spec](../../specs/B466-paid-revive-journal.md), source worktree `/workspace/wave-revive`.
- [Settlement spec](../../specs/B465-recovery-wave-settlement.md), source worktree `/workspace/The-Great-Plot-Twist`.
- [Context integration spec](../../specs/wave-context-integration.md), source worktree `/workspace/wave-context`.
- Combined validation checkout: `/workspace/wave-integration`, branch `fix/coop-wave-consistency`.

The development checkout contains the three source diffs applied together. Its focused task
branches and captures are retained for provenance. The consolidated publication branch targets
`main` through a draft PR; it does not overwrite another teammate's branch or change main.

## Verified

Before implementation, regression tests reproduced all four defects. Actual disposable
PostgreSQL reproduced a paid receipt with zero revival events and `already_up` on a fresh retry.
The context suite reproduced 21 failing races out of its 25 original tests on unchanged main.

The combined API/PostgreSQL command passed **195 tests in 17.16 seconds**:

```sh
cd backend
UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/test_wave_revive_routes.py server/tests/test_wave_recovery_routes.py server/tests/test_wave_recovery_transport.py server/tests/test_wave_routes.py server/tests/island_sql/test_recovery_revive_sql.py server/tests/island_sql/test_recovery_revive_http_pg.py server/tests/island_sql/test_captain_revive_sql.py server/tests/island_sql/test_recovery_wave_end_sql.py server/tests/island_sql/test_recovery_two_player_http_pg.py
```

This includes real HTTP-to-PostgreSQL revival, rollback on a failed append, same-UID repeats,
two helpers, closed/last-tick refusals, legacy revival, canonical wave-end and two-player
settlement checks. The fixture applies the complete migration chain twice to a disposable
database; it does not use the live database.

Individual source-branch checks also passed: revival **96 backend / 55 frontend**; settlement
**80 focused frontend / 130 focused backend** and **12,488 backend passed / 299 skipped**, with
the unchanged settings-contract file explicitly excluded; context **38 focused / 35 surrounding**
frontend tests. These are branch-specific results, separate from the combined checks.

Combined verification also passed:

- `cd frontend && npm test`: **351 files / 3,883 tests passed**, 325.87 seconds.
- `cd backend && UV_CACHE_DIR=/tmp/audit-revive-uv CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql`: **398 passed**, 22.30 seconds.
- `cd frontend && npm run build`: passed; spoiler guard checked **243 text files / 12 protected lines**, with no suspect data.
- `cd frontend && node scripts/report-budget.js --check`: passed; initial JS **18,899 bytes** against 21,080, CSS **9,410 bytes** against 12,000; no unshipped assets in the build.
- `cd backend && UV_CACHE_DIR=/tmp/audit-revive-uv uv run ruff check .`: **All checks passed**; format check passed for all **9 changed/new Python files**.
- `git diff --check`, changed/new-file secret scan and handover local-link checks: passed.

`CHROME_PATH=/usr/bin/chromium npm run test:mp -- /tmp/coop-integrated-mp` **failed** at
`scripts/check-multiplayer.js:813`: the owner's musket pose was observed at **1 of 2** required
viewports. Before that failure, the check passed cooperative build/upgrade propagation,
same-tick fall/revival with one 35-coin payment, Medic HP, pause/resume, both 35-coin wave
receipts, one shared next wave and four-player late admission. There were no browser errors.
Boss/finisher assertions after the failure were not reached. The failure is retained in the
[raw log](../evidence/coop-wave-consistency/multiplayer.log).

The exact command was repeated in the clean detached checkout `/workspace/wave-main-check`
at unchanged main `48aee0e7`, with output directory `/tmp/coop-main-mp`. It **also failed at
line 813 with `1 !== 2`**, with the phone pose observed and desktop pose missing, and no
browser errors. Its [raw baseline log](../evidence/coop-wave-consistency/multiplayer-main.log)
is retained. The same late pose failure is tracked separately in
[#421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421). Active shot/pose functions
and the pose, figure, shot-art, sync, fake-API and multiplayer-check files were compared with
main and are unchanged. The full multiplayer check remains failed on both sources; its later
boss/finisher path remains unverified.

The unchanged settings-contract matrix was not rerun by this task; its exclusion from the
separate broad backend run is explicit above.

Independent agent review found and corrected lock ordering, token case normalization, a
finish-finalizer race and stale consumer effects, then found no remaining blocker in the final
combined source. This does not constitute the required different-human approval.

## Browser evidence

Chromium `156.0.8078.79` exercised the real simulation, controller and HUD with a synthetic
canonical receipt. At both 1280×720 and 375×812, unchanged main showed `Loot +35` with
`The island fell`; the combined fix shows `Loot +35` with `Wave won!`. A delayed start after
reset changed from one stale start to zero. Each fixture made one finish request and had no
page errors. The local simulation still loses; the confirmed outcome governs the presentation.

Exact capture script SHA-256:
`6a84a45f559670e52b89e9920db1bec88f95dc82ade99a260eccea4f47ee8716`.
The saved script retains the exact workspace paths used for this evidence.

- [Before report](../evidence/coop-wave-consistency/before-report.json), [after report](../evidence/coop-wave-consistency/after-report.json), [exact script](../evidence/coop-wave-consistency/capture-exact.mjs).
- Desktop: [before](../evidence/coop-wave-consistency/before-result-1280x720.png), [after](../evidence/coop-wave-consistency/after-result-1280x720.png).
- Phone: [before](../evidence/coop-wave-consistency/before-result-375x812.png), [after](../evidence/coop-wave-consistency/after-result-375x812.png).
- [Combined source file hashes](../evidence/coop-wave-consistency/source-files.sha256) cover the 32 changed/new backend, frontend and database files.

These are standalone HUD screenshots, with a visible fixture label. They do not establish a
3D scene, live payment, authenticated multiplayer or physical-phone behavior. Separate actual
Chromium component tests cover stale bell/card effects and old receipts during the next wave.

## Not verified and remaining

No production migration, feature activation, deployment or merge was performed. Code publication
and exact review-head checks are recorded in the draft PR. The additive [revival migration](../../supabase/migrations/20261118051000_paid_revive_journal.sql)
must be reviewed and applied through the normal release process before deploying its API.
The migration guards old clients against a charge-only recovery revival; they need the updated
client for that action. Existing already-paid historical receipts are not bulk-backfilled.

Settlement retries persist while this controller remains alive, including wave changes and
travel. A full browser restart does not preserve the retry queue. The atomic revival event
itself is durable across reload.

Ianno discussed the explain-back questions (question 2 with coaching) and approved the proposed
behavior and draft publication. A different human teammate must review and approve the current
revision before merge. No independent-human approval is claimed by agent review or this handover.
