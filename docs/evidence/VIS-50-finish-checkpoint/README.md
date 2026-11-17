# VIS50: first recovery checkpoint finish guard

Used by the VIS50 reviewer to inspect the confirmed refusal bypass and the narrow forward correction. Responsible human: Johannes Franz Lang (`frcola`); [issue #415](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/415), [Draft #416](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/416).

## Result and scope

A first finish with missing, extra, foreign, fractional or healing structure health now returns the existing validator refusal. It cannot close from initial health or pay loot without any accepted checkpoint. A valid first finish and retry still pay once; older/divergent submissions can still close from an already accepted canonical checkpoint.

The forward `20261118040000_recovery_finish_checkpoint_guard.sql` follows the three incoming November 18 migrations. It repeats the current finish function because previously applied migrations must not be edited. The [exact function diff](function-diff.patch) changes only the refusal predicate and explanatory comments. Signature, grants, authoritative first close, teammate outcomes, expiry and abandonment logic remain unchanged. The existing validator writes the accepted UID/timestamp and full health prefix atomically while finish holds the same wave lock. The guard does not require an actor account to remain present after anonymization.

This is local disposable PostgreSQL evidence, not a live migration or production activation. The preview must compose the fix and verify its own final source before review.

## Source boundaries

The immutable review base is actual combined commit `0d047bd2`, not its earlier claim `096d04e2`. The clone completed after that merge commit landed. No existing reference was rewritten; Draft #416 now uses new immutable base `review/vis50-checkpoint-0d047bd`.

| Scope | Backend tree | Supabase tree |
|---|---|---|
| Before VIS50, combined 0d047bd2 | `e61fa1b8f6bcd02bb357b17b530b427acf5abee2` | `4ca440d8800397f01e241eb2728c483f29bbc3a5` |
| Guard plus initial tests e118f87d | `11830183e3c73fa26fb90579d598d64144ada396` | `6e52a63b87028291127dbae8c344c9f49a73896d` |
| Final stronger progress checks733cced0 | `c785196095edef4f5416744b46435ab564da4e9c` | `6e52a63b87028291127dbae8c344c9f49a73896d` |

The Python runtime and frontend are unchanged by VIS50. The backend tree changes because it includes the new PostgreSQL test. Exact source/commands and limitations are in [provenance](provenance.json) and each result file.

## Red and green checks

| Check | Exact result | Source and receipt |
|---|---|---|
| One independently controlled diagnostic | `1 failed in 4.03s` | [Observed state](diagnostic-observed.json), [raw log](diagnostic-pytest.log), [runner](diagnostic-result.json), [external diagnostic](diagnostic-test_finish_first_vector_diagnostic.py) |
| New regression before forward migration | `6 failed, 3 passed in 5.58s` | [Log](red.log), [command/result](red-result.json); claim 94301e57 with the new test uncommitted before the migration. Later formatting and the full progress-tuple assertion strengthen the same six malformed cases. |
| Guard plus focused lifecycle/perimeter checks | `43 passed in 8.97s` | e118f87d; [log](green.log), [exact selected files/command](green-result.json) |
| Strengthened full progress-field checks | `9 passed in 3.18s` | 733cced0; [log](progress-green.log), [command/result](progress-green-result.json). Same production SQL tree as the 43-case run. |
| Whole backend Ruff | `All checks passed!` | 733cced0; [command/result](ruff.log) |

The diagnostic used a paid wall, a 15-second minimum with a declared 20-second test clock, valid sealed tick 399/head 0 and no prior checkpoint. Direct health submission refused divergence, while the incoming finish paid 15 (90→105), closed initial full HP and retained null checkpoint UID. Replacing only finish with the previous function inside a rollbackable transaction refused the same inputs without changes. The private scratch fixture applies every migration twice, uses only a local Unix socket, rolls back each case and deletes the server data directory. It never reads a database URL or `.env`.

The 43-case selection includes the actual perimeter start capability/retry guards, old-template added-wall bridge, paid V1 lifecycle/history, joinable member discovery, legacy-wall identity conversion, idempotent first-close receipts, older-prefix and teammate outcomes, away handling, and boundary health/layout IDs. It is a bounded compatibility selection, not a rerun of all backend tests or proof of every 139-instance vector. The later final composed preview still needs its own coordinated PostgreSQL/HTTP gate.

The six negative cases assert unchanged wallet, wave close/outcome, canonical HP/checkpoint, materialized wall health, wave best/flags/next wave and loot-row count. Positive tests preserve valid first reporting, one payout on retry, older accepted-prefix fallback and same-prefix divergent fallback. No test, timeout, assertion or production setting was weakened.

## Explain-back

The validator already knows whether a health vector is usable. Finish previously ignored every disagreement even when nothing valid had ever been accepted. The new guard allows fallback only when the database already holds an accepted receipt. It otherwise returns the validator's refusal before money, health or progression changes.

Before marking ready, explain three examples: why an empty vector cannot describe one frozen wall; how an older complete prefix can finish from the accepted canonical checkpoint; and which transaction assertions prove that a refusal changed no money, health or progress.

Changed: forward finish guard and meaningful regression/evidence. Verified: exact local results above and independent source review. Not verified: final composed preview, live rollout or human explain-back. Remaining: coordinator checks and a different human's current-head review. Branch/PR: `fix/vis-50-finish-checkpoint-guard`, Draft #416; no merge.
