# WALL-08: trusted wall preview policy

For Johannes Franz Lang (`frcola`), tracking [WALL-08 #249](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/249). This is a bounded dependent slice on WALL-03's cohort recognition and WALL-06's approved rules; it changes browser previews, not server authority.

1. Retain legacy lane restrictions when policy metadata is absent or rule0/capacity12.
2. Remove only the wall-lane restriction for exact trusted response policy rule1/capacity128; reject malformed/unsupported metadata.
3. Include new inventory walls only after paid, finite positioned response rows; no fictitious empty default reservations.
4. Give existing Move its current island's layout metadata, truthful hint and ordinary grid/coast/overlap/reachability checks.
5. Prove ID boundaries, legacy/perimeter parity, unsupported metadata, normal occupancy and stale-context cancellation with focused tests.

Files: placement.js, move-mode.js, narrow index callback hook and focused tests. Root owns server/SQL; another writer owns builder UI. The fake perimeter transport and world drawing are separate WALL-31/WALL-30 slices. No new dependencies, env edits, live migration/activation or merge.
