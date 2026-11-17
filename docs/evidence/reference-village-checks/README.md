# Reference village: verification chronology

Responsible human: Johannes Franz Lang (`frcola`). These are unchanged diagnostic
receipts supplied by the coordinator, preserved by documentation Draft #388.
**The historical attempts in the table below failed. None is a complete-suite,
input-resume, multiplayer or accessibility pass.**

The later [source-52 completed sequence](source-52-completed/README.md) is
archived separately: 4,583 frontend tests passed / one timed out; accessibility
33 and demo 34 passed; two layout overlaps and a known upstream multiplayer
firing-pose check failed. Its later keyboard variant also timed out. Those
source-specific results do not rewrite the historical failures below.

The later [final e874 review](source-e874-review/README.md) uses a new UI tree
after measured Goals/toast clearance: 21 measured layout rows pass (three
wave-hint rows skipped), and frontend has 4,586 passes / one 20-second timeout.
The remaining five final commands/native document proof are still pending.
Stage-nine actual images and source-52 history retain separate boundaries. The [manifest](sha256.json) records each copied file's
original archive name, byte count and SHA-256. No application/browser run was
performed to package these records.

| Run and source | Exact result | Original receipts and boundary |
|---|---|---|
| Complete frontend 1, `9f47c14277c801d10f2c504799a72fe059b52171` | 4,402 passed / 27 failed; 407 files (394 passed / 13 failed), 609.82 s | [Verbose output](frontend-01-9f47/frontend.log), [runner record](frontend-01-9f47/report.json). Runner wall time is 610.63 s; it is distinct from Vitest's duration. Subsequent focused corrections do not turn this run into a pass. |
| Complete frontend 2, `6e2c3e8b3437ba7302870adb59e2351c2fa74f5e` | 4,463 passed / 1 failed; 409 files (408 passed / 1 failed), 563.22 s | [Verbose output](frontend-02-6e2/frontend.log), [runner record](frontend-02-6e2/report.json). Runner wall time is 564.04 s. Defense-report input ownership exceeded the unchanged 20-second limit. |
| Accessibility, `6e2c3e8b3437ba7302870adb59e2351c2fa74f5e` | 33 screens; lobby keyboard failed, 382.39 s | [Output](a11y-01-6e2/a11y.log), [runner record](a11y-01-6e2/report.json). Browser errors and external requests were empty. Temporary audit identity stamps were lost during a legitimate lobby refresh; VIS47's replacement needs its own native result. |
| VIS46 initial fixture, `4844c2c1e0a086f6fd94eee61baeae1ea36529f5` | New sole-owner assertion failed at 18.375 s | [Output](report-46/vis46-corrected.log), [Vitest JSON](report-46/vis46-corrected-result.json). The mismatch was `worldBusy`: it includes the report's own blocked state, so it must be true while the report is open. It was not proof of an independent competing owner. |
| VIS46 derived-state correction, `4f69978f815d6b943b9472b52e4c5c5df95eaac5` | 20.007 s timeout | [Output](report-46/vis46-derived-corrected.log), [Vitest JSON](report-46/vis46-derived-corrected-result.json). Report/world blocked state is checked together; no completed input-resume pass follows. |
| VIS46 coherent veteran fixture, `870e624b710112df8971b4e74ac3437c0772a51d` | 20.013 s timeout | [Output](report-46/vis46-veteran.log), [Vitest JSON](report-46/vis46-veteran-result.json). Initial memory uses the actual already-seen unlock-card IDs through wave 30. Tutorials remain enabled. The original actions, movement checks, 24 real frames, high quality and 20-second limit remain. No completed input-resume pass follows. |
| Unchanged multiplayer script, `8db343ba071f000583a843bd537a692732053542` | Exit 1 in 65.84 s | [Output](multiplayer-01-8db/check-multiplayer.log), [runner record](multiplayer-01-8db/result.json). Host/friend lobby and co-op construction progressed; the old individual-wall observer then reported level 0 for a textured batched level-one wall. Wave, revive, simultaneous-next-wave, late-join and boss assertions were not reached. |

The frontend source/public/backend trees of the VIS46 test-only candidates and
the documentation-only `8db` baseline match `6e2`'s corresponding trees. Test,
script or documentation changes still need explicit source identities and their
own checks. The [rendered review capture](../reference-village-visual-review/README.md)
keeps its earlier `9f47` runtime; these diagnostics do not replace those images
or imply a new screenshot of a later source.

The broader [review guide](../../contribute/REFERENCE-VILLAGE-REVIEW.md) keeps
human visual acceptance, physical devices/Safari, sustained performance, balance,
the 8MiB asset target and land expansion open. All PRs remain Draft. No PR merge
to main, deployment, live migration or production flag activation is represented
by this record.
