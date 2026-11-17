# VIS49: latest-main integration evidence

Responsible human: Johannes Franz Lang (`frcola`).
[Issue #413](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/413) /
[Draft #414](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/414).
This is a local integration review, not a PR/main merge or release.

## Sources and preservation

Main is `ee5677ff4986b671c271c85a35abcee70aa8fe59`; the incorporated visual
candidate is `a4ecdce6e4cab0fe9cfb282099d0b2bf941df2be`. The prior main checkpoint
is `dbc11c46e8f61a8b1dd6f043286eaedbffe280ad`.

The [50-path audit](main-path-audit.json) names every newer main path and its
prior/upstream/visual/result blob. Thirty-five upstream-only paths are preserved
exactly. Fourteen paths changed on both sources and were inspected as combined
changes. The remaining upstream test file, `pirates/multiplayer.test.js`, retains
its assertions and adds an explicit integration regression plus genuine test
interval cancellation; its change is classified deliberately. Unexpected
changes to upstream-only paths: **none**. Incoming SQL migrations and handoff
copies are unchanged; no migration was applied by this task.

Raw conflicts:

- `island/api.js`: retain extracted base-row validation and clock offset stamping
  together with strict local perimeter validation and `wallClientVersion: 1`.
- `island/index.js`: retain transient own-read retries and clearing of retry state,
  plus successful-target identity tracking and the new selection route.
- `docs/STATUS.md`: preserve both teammates' logs.

Clean-merge interactions corrected after independent source review:

- A canonical close records its wave ID. Old responses/admissions for that ID
  cannot revive it, including after an earlier local stop cleared `current`.
  The fence does not cancel a pending different wave/target. A local stop alone
  permits a fresh server-confirmed rejoin; target/reset boundaries clear history.
- A separate cheap 250 ms core-only publisher preserves truthful retained legacy
  HP after an explicitly confirmed same-wave return. Recovery structure vectors
  retain the newer event-driven publication. Context/epoch/wave and disposal
  guards remain covered.
- Public recovery join rows reject any supplied legacy-only `perimeterDemo`.
  A valid legacy demo still validates on its own protocol; valid public recovery
  discovery/join continues to work.

## Exact final affected checks

The [result JSON](affected-pure-result.json) includes the full argv, source tree
pins and process timing. The [raw log](affected-pure.log) records:

~~~text
Test Files  24 passed (24)
     Tests  263 passed (263)
  Duration  16.26s
~~~

Process exit **0**, elapsed **18.46 s**. These are affected pure contracts for
startup, security header validation, API, legacy/live/recovery waves, core and
perimeter behavior; no Chrome was opened. `first-read-retry.test.js` was excluded
from this invocation because it requires the coordinator's exclusive browser
lease. It is not reported as skipped or passed.

Verified application trees:

- Frontend source: `d40e9c78a8c1179965db1af0f5c10a29f41bf48e`.
- Public artwork: `9306942db1050d728799cee2fbdc8e8960f14ad2`, exactly the visual source.
- Backend: `e61fa1b8f6bcd02bb357b17b530b427acf5abee2`.

## Failure history, kept separately

- [Initial regressions](integration-red.log): 3 failed / 46 passed, 2 files,
  2.29 s; two ended-wave variants and the missing periodic core publication.
- [First correction](integration-green.log): 1 failed / 48 passed, 1.59 s.
  The new disposal assertion counted an expected explicit `null` cleanup as an
  extra publication; it was corrected to require that cleanup and then verify
  zero scheduled callbacks and no later publication. No runtime was weakened.
- [Mixed-protocol row](joinable-red.log): 1 failed / 7 passed, 438 ms.
- [Close after local stop](canonical-close-red.log): 3 failed / 32 passed, 429 ms.
- [Pending new wave/target](canonical-new-wave-red.log): 4 failed / 35 passed,
  572 ms. This exposed overbroad generation invalidation; the final close fence
  rejects the closed ID while preserving the pending new wave.
- [Intermediate three-file checks](integration-contracts-green.log): 64 passed,
  1.78 s, before the final four new-wave/target variants. The final 263-test
  invocation above includes all current regressions.

No timeout, original assertion, quality setting or gameplay rule was relaxed.

## Remaining

Full frontend, actual browser/input flows, fresh screenshots, build/budgets and
changed backend/ephemeral-PostgreSQL integration are coordinator gates on their
own frozen source. Earlier logs/captures remain source-specific. Inherited
immutable asset-cache headers are included explicitly; no deployment, live SQL,
production flag change, human visual acceptance or PR/main merge is claimed.
