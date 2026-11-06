# G21 checkpoint 4 — current backend integration

Owner: Nils. Branch: `integrate/backend-regression-v2`, based on `94a48ad`.
Used by: the reliability integration and release reviewers.

- Preserved the authored G21 commits `57d2587`, `d2a3052`, `4afbeb5` as cherry-picks
  `49e509c`, `b45bd3d`, `ab5cafc`, retaining their author and dates.
- Initial focused gate failed collection on the retired spot-market APIs. Tests now use the
  current 10× position, portfolio and public projection APIs directly, with exact rational
  oracles, both rising/falling directions and both Relighting fee rates.
- Updated settings coverage to current secure preview URLs, production-only Relighting,
  stock/sports allowlists, build metadata, 17 fields and all 2,048 subsets of 11 flags.
- No production compatibility shim, rule change, dependency or SQL edit was introduced.
- Focused command in `g21-report.md`: **2,406 passed in 11.60s**, no skips/xfails.
- The documented `uv run ruff check .` passes. Staged Gitleaks, diff checks and the protected-file
  comparison are run before the reconciliation commit; final results accompany the SHA.
- A history-only Gitleaks finding in authored C2 is its explicit synthetic Supabase secret
  placeholder (`test_settings_contract.py`, original line 20), not a real credential. Distinct
  short fake values replace it in the current test; preserving authored history retains that
  historical false positive. Current staged results are reported separately from history.
- No redundant full backend suite, network/provider credential proof, live writes, push,
  deployment, Actions or G9 branch work was performed. Existing source/data/assets remain
  unchanged. The benchmark reconciliation is a separate delegated worktree and commit.
