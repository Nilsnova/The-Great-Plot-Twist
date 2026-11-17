# VIS-18: prepared static village artwork and visible retry

Responsible teammate: Johannes Franz Lang (`frcola`), Johannes Franz Lang <83476@novasbe.pt>. [Task #223](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/223). This bounded follow-up starts from coordinator candidate `cd6dc2e77218762ba512d147a860f9228aed85d6` and targets immutable `review/vis-18-static-cd6dc2e7`; activation/registration Draft #357 remains a separate scope. The user approved the original world-art route in D063 and authorized continued implementation, without merging or deploying.

## Problem and contract

The main level-art request omits static bell/campaign/service meshes and silently keeps stand-ins on failure. Static landmarks must adopt their registered prepared PNG material and declared logical box at the same ground foot. Conditional arsenal art must not be loaded, retained or represented by a hidden mesh while its flag has never enabled it. Preserve all existing flags, unlock/site state, selected campaign frame, interaction and collision coordinates. The bell's approved presentation box is56×72/anchor8.

This writer owns only island/world.js loading/static refresh/lifecycle/error sections and a small purpose-built helper/status UI plus narrow ctx wiring. VIS-34 owns projection/picking/range hunks in that shared file, world/art.js and camera/combat projection. Coordinate imports and let the root serialize integration. The family manifest and art modules/assets remain coordinator/family-owned.

## Implementation plan

1. Claim this bounded task in a Draft before runtime edits.
2. Prepare static landmark materials through the shared loadArt route, replacing geometry/material while preserving mesh identity and ground point; make late-created enabled services use the same route.
3. Add deduplicated main/static/wall requests and actionable visible art-load error with a44px Retry button in the ordinary game, using existing container/ctx patterns.
4. Keep retries idempotent, release replaced owned resources, and dispose/ignore late completion after the decoration ends.
5. Test exact metrics/state/enablement, failure→retry, concurrent retry and late-disposal behavior with meaningful source-level tests.
6. Coordinate actual desktop/phone normal and failure/retry browser evidence with the sole Chromium lane; report exact commands and remaining combined visual gates.

## Acceptance and risks

- Loaded bell and current registered campaign/service frames use PNG source receipts and correct foot-normalized geometry, with one actual object per existing identity.
- No arsenal request/material/mesh before enablement; late enablement prepares real art; hidden/flag-off behavior remains authoritative.
- Registered failures cannot silently claim visual success: an actual visible message and Retry exist; successful retry clears that failure without duplicating geometry or requests.
- Disposal is idempotent, stale asynchronous completions cannot reattach objects/UI, and owned materials/textures are released once.
- No changes to source assets, game state, colliders, saves, prices, combat rules, dependencies, environment, live settings or deployments. Keep source/test/capture changes near400lines or split a meaningful follow-up.

Actual combined screenshots, browser overflow/contrast, cold title rules, total graphics budget and human visual acceptance remain mandatory review evidence; generated sheets and unit-test stubs do not prove the final target. Keep Draft and do not merge.

## Source and focused evidence

Claim `1f358da2`; runtime/test `765033d04ed4288436018a83f00fda6bdaab83a7`, [Draft #362](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/362). The helper adopts registered static art on existing objects, copies the approved world geometry, and releases replaced resources only when no scene mesh still borrows them. A prepared bell pavilion stays grounded during the existing ring timer; audio, interaction and wave timing are unchanged. Main/static/wall loading shares pending/error status and deduplicated retries. The ordinary island and Pirate Point decoration ctx receives its existing container; a decoration-owned notice is visible only while that decoration is active. Unregistered legacy static art retains its existing route.

Conditional arsenal behavior is preserved precisely: before first enablement there is no arsenal request, material or mesh. If disabled after it has existed, its existing mesh remains hidden as before; completion cannot change authoritative visibility. Re-enabling reuses its prepared art.

From `frontend`, ran:

```sh
npm test -- --maxWorkers=1 tests/island/static-village-art.test.js tests/island/world-cohort.test.js tests/island/world-art.test.js tests/island/structure-recovery-world.test.js tests/island/arsenal-context.test.js tests/island/arsenal.test.js tests/art/village-consumers.test.js
```

Latest result: **7 files passed,55 tests passed,2.69s**. The six new cases cover exact bell geometry/foot and grounded ringing, registered tech state, delayed arsenal enable/disable, main and static failure/retry with deduplication, no late swap/error/retry after disposal, borrowed-map ownership and actionable notice states. These source tests use controlled materials and a tiny DOM fixture; they do not prove actual PNG pixels or browser layout.

From root, `node scripts/text-lint/index.mjs`: **4520 candidate strings in516 source files;0 errors,8 report-only findings**, all in untouched existing files. `git diff --check` and JavaScript syntax checks pass.

Actual desktop/phone normal/error/retry screenshots, keyboard target/overflow/contrast, total memory/performance, broad build/budget/a11y/demo checks and final human visual acceptance are **not verified by this writer**. Root owns the sole Chromium lane and combined source integration, including services registration and VIS-34 projection. No full suite, build or browser job was launched by this task. This scoped implementation does not mark all VIS-18 depth/handoff acceptance done.

Explain-back: I keep each landmark at its confirmed ground point and change only its prepared picture and visual box. Loading is separate from visibility: a late arsenal picture cannot turn a disabled arsenal on. Failed requests remain visible and the Retry button repeats only unfinished requests. Cleanup releases temporary owned resources while preserving a texture another scene object still borrows.
