# T54–T59 combined wave-end repair review

Evidence for Ianno's current repair follow-ups. The local-only `test/wave-end-repair-integration` candidate at `899da142cc1c651718b06ca21022701ec5c819d6` combines current main `48aee0e7` with the five separate task branches below. This is a test candidate, not a request to merge an aggregate into main.

| Task | Reviewed branch | Head before this documentation-only handover |
|---|---|---|
| Current rules/docs | `docs/wave-end-repair-rules` | `ebaec403` |
| Existing gated defenses | `fix/recovery-gated-defenses` | `3426da7f` |
| Saved-policy loading/error safety | `fix/recovery-policy-fallback` | `87c916b9` |
| Obsolete repair options/server policy | `fix/wave-end-repair-options` | `0f216663` |
| Repair choices/help/cards | `fix/wave-end-repair-ui` | `91637858` |

## Results and provenance

- Combined frontend: **207 tests in 19 files passed in 62.70 seconds**. [Exact output](frontend-final.txt). Includes saved-v1 error handling, normal/HP-less upgrade eligibility, damaged/zero/tiny HP, paid-intent feedback, Captain/Tech choices, tutorial/narrator behavior and legacy/snapshot/paid-then-damage simulation checks. Actual browser DOM fixtures use local synthetic data.
- Combined disposable PostgreSQL island suite: **398 passed in 35.64 seconds**. [Exact output](island-sql-final.txt). Includes full-chain apply/reapply, paid price/shared allowance/retry cases, real HTTP/SQL adapters, new retired-choice/policy-transition guards, fixture isolation and all-six-kind full canonical wave-end restoration with closed combat HP preserved.
- Combined focused Python baseline: **433 passed / 1 failed in 32.45 seconds**. The only remaining failure expected the old exact visit-response field list after the additive `recoveryVersion` field. `1af5d457` fixes that assertion; the affected tower-defense suite then passed **51 tests**. Final policy/JSON/route checks separately passed **94 tests**. These are reported as separate runs, not one fully rerun combined pass.
- Combined production build passed; spoiler guard checked **243 text files / 12 protected lines** without suspect elimination data. Final text lint: **zero errors / eight report-only findings** after manual review of seven correctly spelled words missing from the small vocabulary. Changed-file Ruff passed. The committed combined diff secret scan found **zero findings**.
- The task agent's earlier full backend run reported **536,807 passed / 305 skipped in 1117.53 seconds**. It began before the additive policy JSON changes; final changed paths are covered by the explicit current-source checks above. It is not labelled final-tree full-suite proof.

The initial combined frontend attempt had 204 passing / 3 failing cases: obsolete ETA text and revised tutorial sentence limits. The corrected tests preserve all original bounds and paid/phone/HP assertions. The initial combined SQL attempt had 395 passing / 3 failing cases because a committed concurrency fixture leaked a synthetic player into later build/reset tests; robust cleanup fixed this without changing unrelated assertions. An intermediate SQL collection attempt ran before a test-helper merge conflict was resolved and is not test evidence. Final tests ran after both required helper fields were retained.

## Reconciliation and limits

Shared imports/helpers preserve both the gated-defense and new-policy behavior. Documentation keeps the current wave-end rule plus existing gated-defense compatibility. STATUS reconciliation was checked against main and every task branch: every committed line from each history remains in order. Protected instruction files are unchanged. Current source checks did not apply a live migration, activate flags, deploy or merge main.

No actual provider/authenticated two-browser multiplayer session, physical phone, broad early/mid/late balance or release acceptance is claimed. Canonical wallet/journal/HP ordering does not prove every client-reported combat hit. New screenshots remain explicit offline UI fixtures. Ianno's manual review/publication confirmation and Franz's current-revision review remain before human merge; no PR has been opened for these five follow-ups.
