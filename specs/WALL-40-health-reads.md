# WALL-40: complete bounded perimeter health reads

Used by Johannes Franz Lang (`frcola`) and the integration reviewers; tracking [WALL-40 #320](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/320), a child of WALL-00.

## Contract and plan

The client must accept all 128 canonical walls from the legacy health endpoint and all 139 recoverable structures (128 walls plus 11 cannon-slot towers) from the V1 recovery endpoint. Houses and the watchtower are not recoverable kinds. Full-cohort reads must traverse the actual `createIslandApi` boundary. Preserve existing health, phase, protocol, epoch and UUID validation; reject overflow, duplicate spots/instances, aliases of wall IDs, unknown IDs, slot/kind disagreement and malformed fields. Existing explicitly supported `tower_s1` through `tower_s7` aliases remain normalized to the canonical tower identity and cannot bypass duplicate detection.

Own files: `frontend/src/island/api.js`, one focused API test file and this spec. No start-wave transport edits; WALL-32's client capability is preserved. WALL-39 owns the backend read boundary and unsupported legacy restore; WALL-38 owns actual API/private-PostgreSQL evidence. This is a dependent draft on integrated preview `dc6f80ef`, kept separate and unmerged.

First demonstrate the old 50-row rejection, then update only these read validators, run focused tests and record exact results. Increasing size without identity checks risks displaying unsupported or duplicate defenses; retaining 50 hides paid pieces. No new package, environment edit, migration, live activation or merge.
