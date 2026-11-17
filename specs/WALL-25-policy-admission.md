# WALL-25: trusted perimeter policy and admission

For Johannes Franz Lang (`frcola`), implementing issue #274. Used by the new free-grid read/Move transport and later positioned construction. Draft only: no live migration, activation or merge.

## What changes

A private owner policy records rule 1/capacity 128; absence remains legacy 0/12. One SQL statement reads policy plus every ordered layout row. Owner-only admission checks the old raw rows and active wave, settles old recovery, materializes server-computed effective D056 coordinates, then changes interpretation. Both old/new Move validations are fenced by policy and complete raw rows under the owner lock.

The original 12 IDs and empty-site behavior remain. New unbuilt inventory IDs cannot reserve ground through Move. Permission, no-active-wave and bounded IDs/coordinates are checked again in SQL. Service role can read/insert policy, but cannot update/delete it back to legacy. Added-cohort constraints and positioned payments are separate drafts.

## Verification and limits

Private Unix-socket PostgreSQL tests cover legacy read, private grants, effective old-position materialization/repeat, stale policy/layout rejection, outsider/admission permissions, active wave, unplaced/out-of-range inventory, malformed rows, V1 instance/health/repair-sequence preservation, monotonic grants, and a separate-connection stale Move against committed admission. The fixture executes every available migration twice and rolls test data back; the concurrency case explicitly cleans up its synthetic owner.

These functions trust server-computed placement/effective cells, like the existing Move RPC. They do not independently duplicate Python terrain/collision logic. The Python caller must validate the final geometry, and dependent deployment requires this migration first. Future paid cohort, UI and complete ring acceptance are not proved here.

## Explain-back

“I separate the saved wall policy from whether anything has moved. I read that policy and the coordinates together, then check both again while holding the island lock. When switching an old island, I first preserve what the player actually saw and settle recovery under the old rules.”

1. Why is layout.version 1/2 insufficient to authorize free-grid walls?
2. How can a legacy Move race admission, and why does checking just the layout rows fail?
3. Why does new inventory not get default coordinates until construction?
