# WALL-40: complete bounded perimeter health reads

Used by Johannes Franz Lang (`frcola`) and the integration reviewers; tracking [WALL-40 #320](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/320), a child of WALL-00.

## Contract and plan

The client must accept all 128 canonical walls from the legacy health endpoint and all 139 recoverable structures (128 walls plus 11 cannon-slot towers) from the V1 recovery endpoint. Houses and the watchtower are not recoverable kinds. Full-cohort reads must traverse the actual `createIslandApi` boundary. Preserve existing health, phase, protocol, epoch and UUID validation; reject overflow, duplicate spots/instances, aliases of wall IDs, unknown IDs, slot/kind disagreement and malformed fields. Existing explicitly supported `tower_s1` through `tower_s7` aliases remain normalized to the canonical tower identity and cannot bypass duplicate detection.

Own files: `frontend/src/island/api.js`, one focused API test file and this spec. No start-wave transport edits; WALL-32's client capability is preserved. WALL-39 owns the backend read boundary and unsupported legacy restore; WALL-38 owns actual API/private-PostgreSQL evidence. This is a dependent draft on integrated preview `dc6f80ef`, kept separate and unmerged.

First demonstrate the old 50-row rejection, then update only these read validators, run focused tests and record exact results. Increasing size without identity checks risks displaying unsupported or duplicate defenses; retaining 50 hides paid pieces. No new package, environment edit, migration, live activation or merge.


## Actual results

The new boundary tests were first run against the unchanged decoder: `Tests  30 failed | 14 passed (44)`, proving the 50-row cap and permissive identity gaps. After the focused decoder change, this command passed:

```sh
npm --prefix frontend test -- --maxWorkers=1 tests/island/perimeter-health-api.test.js tests/island/wall-recovery.test.js tests/island/structure-recovery-api.test.js tests/island/structure-recovery-world.test.js tests/island/api.test.js
```

Actual result: `Test Files  5 passed (5)`; `Tests  80 passed (80)`; `Duration  1.86s`. `git diff --check` passed.

The tests exercise real `createIslandApi.walls()` and `.structureRecovery()` reads at 12, 50, 51, 102 and full 128/139 rows. A decoded complete state reaches the real world appearance rule for destroyed `wall_128`; a stale repair refusal retains all 139 current-state rows. Negative cases cover overflow, canonical wall boundaries, slot/kind mismatch, duplicate normalized spots, duplicate UUIDs including case variants, malformed health/time/level fields and invalid version/window/epoch metadata. The existing tower alias request round trip and WALL-32 start-wave capability assertions still pass.

Not verified here: actual HTTP/private PostgreSQL, browser screenshots, full app suite/build or production deployment. WALL-38 and the combined integration lane own those checks. No migration or live activation is included.

## Explain-back

A full island can contain more than 50 paid defenses, so the read decoder must use the real bounded inventory rather than the old arbitrary list cap. The wall endpoint has 128 slots; V1 recovery adds the eleven damageable cannon slots. A larger bound alone would accept duplicate or unknown identities, so every row must match a known slot and every structure instance must remain unique. The server still owns health, prices and repair permission.

Before the draft is marked ready:

1. Why do the wall-health and V1 recovery endpoints have different maximum row counts?
2. Why must duplicate checking normalize the explicitly supported tower aliases and UUID letter case?
3. Which test shows a full API response reaching the real world appearance rule, and what production evidence does it not supply?
