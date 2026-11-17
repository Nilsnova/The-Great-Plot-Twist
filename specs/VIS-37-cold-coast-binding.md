# VIS-37: bind the first coast read to the actual backdrop transform

Responsible: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`); corrective VIS-34 child. Pinned68330ddf, immutable review/vis-37-coast-68330ddf. Actual cold GPU/material readback reproduced a stale identity-normalized coast UV despite a correctly transformed backdrop and identical alpha field.

Three0.187 now skips updateWorldMatrix unless dirty/forced. Mark the assigned affine manual matrix dirty in legacyBackdrop. Test unforced water.setCoast before any render, and verify shader-bound GPU/readback against the actual backdrop afterward. Preserve projection coefficients, gameplay geometry/coordinates, alpha field and effect quality semantics. No central world/art-family edits, dependencies/env/live migration/flags/main/force push/merge/deploy. Keep Draft; full scene and device acceptance remain separate.
