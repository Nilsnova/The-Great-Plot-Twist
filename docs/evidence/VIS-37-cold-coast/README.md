# Cold affine coast binding: actual before and after

The raw1280×720 PNGs are unedited screenshots from the real game using the same public funded/progressed102-wall fixture and Exit→Manage entry. Before source68330ddf; after runtime7b165865. The reports record actual GPU-bound and material uCoastUv, backdrop matrices, alpha-distance-field comparison, critical file hashes, camera/captain and renderer metrics. Only ground-transform.js differs among the recorded critical files.

Before, maximum GPU inverse error is0.004166666045784945. After, it is3.7252903539730653e-10; both alpha fields match their actual painted backdrops exactly(fieldDiff0). Captain position is identical; camera centers differ by less than0.002 world units and zoom by less than0.00003 from animation easing. Both actual frames report116 draw calls. The detached foam cap is gone in the after screenshot. This is a cold binding correction, not a gameplay or coast-geometry change.

Reproduce with the granted sole browser lane: `node frontend/scripts/probe-cold-coast.mjs <runtime-frontend> <out> before` on68330ddf, then the same command with `after` on7b165865. Each driver creates/closes its own browser/server and asserts the real GPU mismatch/agreement and unchanged alpha field. The driver source hash and raw screenshot/report hashes are in sha256.json.

Focused tests: `cd frontend && npx vitest run tests/art/coast-water.test.js tests/world/ground-transform.test.js tests/world/projection.test.js --maxWorkers=1` passed3files/15tests in1.19s. The new unforced cold-order test failed on the original code(identity world matrix versus affine) before adding the dirty flag. The old forced-matrix assertions remain intact.

Limits: these frames use the pinned raw-asset runtime, not the later compiled provider or final review scene. They are not Safari/physical-device evidence, sustained performance acceptance, final selected-building/ghost interaction proof or an independent human approval. Broader combined tests and final visual acceptance remain with the coordinator. Nothing was merged or deployed.
