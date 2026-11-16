# E2 Pin direct dependencies exactly

> **What this is:** Exact direct dependency bounds matching the existing Python and npm lockfiles.
>
> **Who uses it:** Ianno owns this task; the whole team relies on repeatable dependency installs.

- **Status:** in progress
- **Branch:** `chore/pin-dependencies`
- **Issue and pull request:** [#9](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/9); draft PR pending

## Why

The manifests currently permit dependency versions newer than those recorded in the lockfiles. Exact bounds make the declared versions explicit and reproducible without upgrading packages.

## What

- Change every direct Python dependency bound in `backend/pyproject.toml` from `>=` to the exact version already selected by `backend/uv.lock`.
- Pin `playwright-core` in `frontend/package.json` to its existing exact `frontend/package-lock.json` version.
- Keep both lockfiles' package records, package versions, and integrity data unchanged.
- Record structured lockfile comparisons, installed versions, checks, and audit findings in the PR.

**Files likely to change:**

- `backend/pyproject.toml`: exact versions from the matching lock records.
- `frontend/package.json`: exact Playwright version already locked.
- `specs/E2-pin-dependencies.md`, `docs/FINAL-ROADMAP.md`, `docs/STATUS.md`: task and handover.

## Out of scope

- Dependency upgrades, additions, removals, audit remediation, or runtime/engine constraint changes.
- Lockfile package record or version changes. Root lock metadata may change only if `uv` requires it after the declaration edits.

## Done when

- [ ] Python direct declarations exactly match `uv.lock`; Playwright exactly matches `package-lock.json`.
- [ ] Structured before/after comparison proves lock package records and versions are unchanged; installed versions are recorded.
- [ ] `uv sync`, backend pytest/Ruff, `npm install`, frontend tests/build/budget check and `npm audit` are recorded with exact results.
- [ ] Audit findings are reported without changing dependencies to address them.
- [ ] A different human teammate reviews and approves the current change before merge.

## Tests to write first

No code behavior changes. Use existing project checks and lockfile/manifest comparisons; do not add a bespoke test for declarative version edits.

## Contracts touched

None. `requires-python` and Node `engines` remain unchanged.

## Handover

- **Owner:** Ianno (@Iannomh123456)
- **Agent assistance:** Codex, model gpt-6-luna/high
- **Remaining:** implementation, installation/check results, npm audit output and independent review.
