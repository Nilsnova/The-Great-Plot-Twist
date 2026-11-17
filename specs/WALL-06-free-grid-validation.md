# WALL-06 — trusted free-grid wall validation

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-06 #247](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/247). This branch is the pure server-rule slice of the approved full-perimeter implementation. It does not activate or apply a live policy.

## Scope and plan

1. Add separately named wall-rule/capacity metadata; preserve existing layout version 1/2 meaning.
2. Keep legacy lane admission and read normalization unchanged.
3. Accept valid stored free-grid walls under trusted rule 1/capacity 128; preserve all ordinary geometry refusals.
4. Treat additional wall IDs as unplaced inventory until coordinates are accepted.
5. Test legacy/new-policy parity, coordinate stability, bounds and refusal ordering.

Likely files: `backend/server/island/layout.py` and focused tests. The dependent WALL-07 slice transports the atomic policy/read snapshot and Move CAS. Root integration owns policy SQL, service/catalogue/wave inputs and public response fields. No client request chooses its own placement permission.

## Verification and risks

Run focused backend tests and Ruff against the changed files. Important cases are read-time D056 resettling, invalid/unsupported policy, coordinate/ID bounds, blocked land and unbuilt inventory accidentally reserving cells. Scratch SQL, API integration and actual browser evidence remain separate gates; pure tests do not claim a running perimeter builder.

## Handover

Status: implementation claimed; checks pending. No runtime change, passing check, migration application, deployment or merge is claimed by this initial draft.
