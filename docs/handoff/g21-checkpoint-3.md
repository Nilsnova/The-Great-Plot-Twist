# G21 checkpoint 3 — final report and gates

Prepared for Nils on 6 November 2026 on `test/g21-backend`.

## Changed

Added [g21-report.md](g21-report.md) with coverage, independent oracle methods, fixed-seed sample
counts, reproducible gates/credential-pattern scan, bugs/fixes, protected-path audit and limitations.
The complete branch adds 11 backend test/helper files and four handoff documents only.

No demonstrated production bug means no source fix or bug-fix commit. No new dependency was added.
C1 is complete. C2 covers current settings/weather/names/market math but is partial: the 10×
position and zero-close APIs have not reached this `origin/main`. Their implementation and its
tests remain outstanding; no new feature or placeholder skip/xfail was added by G21.

## Verified

Before this checkpoint: `git fetch origin main && git merge --no-edit origin/main` reported
already up to date at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

From `backend/`, with `UV_CACHE_DIR=/workspace/.cache/uv` and `UV_OFFLINE=true`:

```sh
uv run pytest -q && uv run ruff check .
```

Result: **3,618 passed in 18.10s; All checks passed!** No skips or xfails.
The baseline had 3,100 cases; this branch adds 518 (C1 five, C2 513).

Full staged-branch credential-pattern scan against `origin/main`: **15 files, zero findings**.
This scans every added file at its staged version, including earlier checkpoint commits. Its
six rules, exact committed-branch reproduction command and limitations are in the final report.
It does not inspect secret case content or print potential credential values.

Branch-scope audit: all changes relative to `origin/main` are additions under
`backend/plot_twist/tests/`, `backend/server/tests/correctness/` and `docs/handoff/g21-*.md`.
No existing tracked file is modified or deleted. This includes the migration/frontend/deployment,
status/decision, case and existing abuse/economy files the task protects.
`git diff --cached --check` passes.

## Handover

C1 commit: `57d2587`. C2 commit: `d2a3052`. This checkpoint adds only the report and this note.
Push only `HEAD:refs/heads/test/g21-backend`; never push `main` or perform a final merge into it.
No PR has been created. Human review remains necessary before merge. Complete the deferred
10×/zero-close coverage after its implementation reaches `main`; review ambiguous captain-name
word combinations with the team rather than treating the small token guard as universal proof.
