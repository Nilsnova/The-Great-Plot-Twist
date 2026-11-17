# VIS-47 — Refresh-aware lobby audit identity

Responsible teammate: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`). Child of VIS-31 #236; tracks #409.

Claim recorded before source edits on `test/vis-47-lobby-refresh-identity`, based on frozen coordinated candidate `6e2c3e8`. Stacked Draft base: `review/vis47-a11y-6e2c3e8`.

The real audit's sole failure is lobby keyboard identity after a render replaces Start and Look around first. All five actual controls, containment, visible focus, count and trap checks pass. Reuse semantic refresh identity in the audit while retaining strict native order, action identity, duplicate/count/visibility/trap/timeout checks. No product runtime changes absent a real runtime bug. Pure regressions and syntax/diff checks only; another agent holds the sole Chrome lease.

Implementation and exact results pending. Keep Draft for coordinator verification, Johannes's explain-back and independent human review. No merge/deployment.
