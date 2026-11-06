# G21 checkpoint 2 — parsers, weather, names and arithmetic

Prepared for Nils on 6 November 2026 on `test/g21-backend`.

## Changed

Added six test files under `backend/server/tests/correctness/`, adding 513 test cases.

- Settings: all 12 server variables in one synthetic mapping, defaults/blank values, normalization,
  isolated environment loading, all 128 feature-flag subsets, malformed values, every multiplier
  from 20 to 100, finite coordinate endpoints and adjacent out-of-range floats, seeded coordinates
  and host lists, Unicode/control-character place limits, invalid host positions, and input/state
  isolation. The template check catches server variables added without a correctness assertion.
- Weather: exact baselines for all 29 codes supported by this repository, all other integer codes
  from 0 to 99 plus representative out-of-range/absent codes, nonfinite/absent measurements,
  1,856 seeded combinations and 1,856 monotonic readings. Values, rounding, summaries and input
  preservation are checked independently of the production code table.
- Names: all 144,000 possible outputs meet an independent profile grammar and are unique across
  distinct vocabulary/number combinations; all 90 forced reroll collisions wrap correctly.
  Fixed seeds cover every vocabulary entry and suffix. Case-insensitive duplicate and explicit
  forbidden-token guards run against the word lists. Human interpretation of ambiguous pairs
  remains outside what the small token list can prove.
- Current market: exact rational/integer oracles check fees and adverse rounding over 3,000
  seeded price-walk samples, subcent/whole-coin boundaries and 6,000 fee-boundary assertions.
  Another 2,700 samples verify current amplified-price arithmetic. Current spot valuation and
  signed profit rounding run over 3,000 position marks, plus positive/negative half ties.
  These are arithmetic tests, not G12 economy/abuse simulations or controls.

No production bug was demonstrated. No source fix, dependency or existing test change was made.
All inputs and seeds are synthetic or the existing non-secret public story/name vocabulary;
tests make no external network requests.

## Verified

Before this checkpoint: `git fetch origin main && git merge --no-edit origin/main` reported
already up to date at `c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

From `backend/`, with `UV_CACHE_DIR=/workspace/.cache/uv` and `UV_OFFLINE=true`:

```sh
uv run pytest -q && uv run ruff check .
```

Final result: **3,618 passed in 17.82s; All checks passed!** No skipped or xfailed tests.
Staged-change credential-pattern scan across these seven added files: **zero findings**.
The scan scope and patterns are documented in the final report; no matching values are printed.

## Remaining

**C2 is partial:** the requested 10× leveraged-position and zero-close APIs are absent from this
`origin/main`. `docs/story/OPEN-WORLD.md`, section 7, explicitly says the Exchange replacement is
pending on its implementation branch. Testing the current spot/amplified-price implementation
does not validate that replacement. No placeholder skip/xfail or new feature was added to hide
this gap. Add those tests after the Exchange update reaches `main`.

C3 records the complete coverage and limits. No migration, frontend, deployment, status/decision,
case or existing abuse/economy test file was changed. No PR or merge into `main` was performed.
