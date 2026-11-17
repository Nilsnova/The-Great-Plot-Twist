# VIS-41 — Fence stale current-wave lookups

Responsible teammate: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`). Child of VIS-31 #236; tracks #397.

Claimed before runtime edits on `fix/vis-41-wave-look-fence`, based on frozen coordinated candidate `9f47c142`. Stacked Draft base: `review/vis41-wave-look-9f47c142`.

An older asynchronous wave lookup must not overwrite a newer island/wave, revive reset state or replace an accepted start/join. Fence mutations inside wave-flow, preserve the core model's expected-wave authority, and cover deferred lookup/reset/admission ordering plus actual island-load state. Scope: wave-flow and focused tests only; no new package, backend, environment, browser run, deployment or merge.

Implementation and exact verification pending. Keep Draft for independent human review and Johannes's explain-back.
