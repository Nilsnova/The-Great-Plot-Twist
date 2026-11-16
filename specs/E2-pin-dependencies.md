# E2 Pin direct dependencies exactly

> **What this is:** Exact direct dependency bounds matching the existing Python and npm lockfiles.
>
> **Who uses it:** Ianno owns this task; the whole team relies on repeatable dependency installs.

- **Status:** in progress
- **Branch:** `chore/pin-dependencies`
- **Issue and pull request:** [#9](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/9); [draft PR #108](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/108)

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
- Lockfile package record or version changes. Only root declaration metadata may change when needed to match the manifests (`uv.lock` root specifiers and `package-lock.json` root dependency metadata).

## Done when

- [x] Python direct declarations exactly match `uv.lock`; Playwright exactly matches `package-lock.json`.
- [x] Structured before/after comparison proves lock package records and versions are unchanged; installed versions are recorded.
- [ ] `uv sync`, backend pytest/Ruff, `npm install`, frontend tests/build/budget check and `npm audit` are recorded here with exact results, including the frontend timeout. A previous main report names this test, but current-main confirmation is pending.
- [x] Audit findings are reported without changing dependencies to address them: `npm audit` found 0 vulnerabilities.
- [ ] Ianno manually reviews the current PR, and Franz (@frcola) approves the current revision before merge. Root coordinates the review request after verification; keep the PR as draft until then.

## Tests to write first

No code behavior changes. Use existing project checks and lockfile/manifest comparisons; do not add a bespoke test for declarative version edits.

## Contracts touched

None. `requires-python` and Node `engines` remain unchanged.

## Handover

- **Owner:** Ianno (@Iannomh123456)
- **Agent assistance:** Codex, model gpt-6-luna/high
- **Verified:** `uv sync` and `uv run ruff check .` passed; backend pytest: 536,618 passed and 283 skipped; `npm install` passed; frontend tests: 3,389 passed and 1 `nearby-game` timeout (current-main confirmation pending); `npm run build` passed; budget check passed (18,669 bytes initial JavaScript / 21,080 limit, 9,092 bytes CSS / 12,000 limit); `npm audit` found 0 vulnerabilities. All non-root lock package records and versions are unchanged.
- **Remaining:** rerun the focused `nearby-game` test on this branch and current main with the unchanged 20-second threshold; explain-back; Ianno's manual review; and Franz (@frcola)'s approval of the current revision. Keep the PR in draft; no automatic merge.
