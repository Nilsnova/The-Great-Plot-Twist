# G21 backend correctness report

Prepared for Nils on 6 November 2026. Branch: `test/g21-backend`.
Base tested at each checkpoint: `origin/main`, commit
`c26f3032b150af970d57fbbcd6eea439eb26f4c4`.

**Result:** 518 new test cases; the complete backend gate passes with 3,618 tests and clean Ruff.
C1 is complete. C2 covers the implementation available on this base, but **10× leveraged-position
and zero-close coverage remains blocked because those APIs have not reached `main`**. C3 provides
this report and the checkpoint notes. No source bugs were demonstrated or fixed.

## C1 — Act 1 and referee

Files: `backend/plot_twist/tests/act1_graph.py`, `test_act1_correctness.py`,
`test_act1_web_correctness.py`, `act1_correctness_runner.mjs`, and
`backend/server/tests/correctness/test_act1_referee.py`.

| Check | Evidence |
| --- | --- |
| Exhaustive reachable graph | 122 semantic states and 254 accepted transitions, including loops |
| Reachable endings | All declared scenes, both ending scenes and eight terminal profiles |
| No dead ends | Backward search from endings reaches every reachable state; closed non-ending cycles fail |
| Independent transition oracle | All 2,196 state/action probes check requirements, full resulting state, refused-move immutability, uniqueness and monotonic inventory/flags |
| Python/browser agreement | Every canonical state × all 17 action IDs plus unknown; full state, result/message, visible choices, notes and browser save/resume; 32 additional seeded histories |
| Referee/kit agreement | 141 complete edge-covering routes plus 64 seeded walks; every accepted edge and all eight ending/decision/logbook profiles covered against an independently authored four-kit mapping |
| Incomplete replay | Every nonterminal canonical prefix is refused with `no_ending` |

Act 1 has cycles, so there are infinitely many literal move logs. The graph is exhaustive over
rule-relevant state (scene, inventory set, flag set and ended), with independent ordering/message
checks on canonical transitions and seeded longer histories. It does not claim to enumerate
infinite histories or prove inevitable termination when a player deliberately loops forever.
Node executes only the existing pure browser story engine; no frontend file is modified and no
browser or external service is needed. Missing Node fails G21 parity rather than skipping it.

## C2 — pure backend contracts

All six new files below are in `backend/server/tests/correctness/`.

| Files | Coverage |
| --- | --- |
| `test_settings_contract.py`, `test_settings_boundaries.py` | Every one of the 12 documented server variables, defaults/blank values, normalization, environment isolation, all 128 feature-flag subsets, malformed enums/integers/hosts, every multiplier 20–100, exact/adjacent coordinate limits, finite/nonfinite coordinates, 512 seeded coordinates, Unicode/control-character place limits, seeded canonical host lists, unmodified input and independent flag dictionaries |
| `test_weather_codes.py` | Independent expected baselines for all 29 repository-supported codes; every other integer in 0–99 plus absent/out-of-range cases; nonfinite/absent measurements for each supported code; 1,856 combined seeded readings and 1,856 monotonic readings; exact summaries, two-decimal output and input preservation |
| `test_names_properties.py` | Exhaustive 40 adjectives × 40 nouns × 90 suffixes = 144,000 distinct valid output names; independent profile grammar; case-insensitive vocabulary duplicates; a focused offensive-token regression list; all 90 reroll collisions, including 99→10; three seeds × 4,000 generation/reroll pairs covering every word and suffix |
| `test_market_arithmetic.py` | Fraction/integer oracles for buy-ceiling/sell-floor and 2% fee-ceiling math; 3,000 seeded walk samples, explicit subcent/coin boundaries, 6,000 fee-boundary assertions and 2,700 current amplified-quote samples |
| `test_position_arithmetic.py` | 3,000 current spot-position marks with independent exact value/profit oracles, unchanged units/cost, monotonic valuation, and signed half-up profit ties on either side of zero |

Seeds are fixed in the test files. Randomness uses only `random.Random`; no dependency was added.
All settings/auth-like strings are unmistakable synthetic placeholders, not credentials. No test
loads real process credentials. Server tests inherit the existing socket guard in
`backend/server/tests/conftest.py`; services are fake or not invoked. No new test reads private
case content or prints its contents. The required full backend gate also runs the unchanged
existing suites; G21 does not edit or reclassify those tests.

### Coverage blocked or limited

1. **10× and zero-close:** current `PositionRow` represents spot units/average price, and current
   `MarketService.view_position` values those units without leverage. `market/rules.py` still
   amplifies quotes and applies the old bands/breaker. The existing
   [Exchange change notice](../story/OPEN-WORLD.md#7-the-island-exchange) explicitly says the 10×
   implementation is pending on the Exchange branch. There is no leveraged-position/zero-close
   operation to call. A zero net receipt after a spot fee is not zero-close coverage. No new
   feature, fabricated target, skipped placeholder or expected failure was introduced. After
   that update merges, replace the old quote assertions and add independent position/P&L/fee and
   liquidation-boundary tests against its actual API.
2. **Name interpretation:** exhaustive format/uniqueness checks and a small explicit token list
   cannot certify that every adjective/noun combination is inoffensive in every context or
   language. The existing content documentation still requires human review of ambiguous pairs.
   The tests do not assert that random draws are globally unique across players.
3. **Scope:** no new database, network, deployment, abuse-control, economy-simulation or later-case
   tests were added. G12 and G10 work remains separate. There is no new-dependency requirement.

## Bugs found and fixed

**None demonstrated.** The new assertions pass against the existing production code. Accordingly,
there are no source changes or bug-fix commits. Missing 10× functionality is a pending feature,
not a bug G21 is authorized to implement.

No change was made to `supabase/migrations/`, `frontend/`, `vercel.json`, `docs/STATUS.md`,
`docs/DECISIONS.md`, existing abuse/economy tests or case code/content. All additions are in the
two authorized test directories and `docs/handoff/`. No push or merge targets `main`.

## Gates and reproducibility

In this prepared environment:

```sh
cd /workspace/The-Great-Plot-Twist/backend
export UV_CACHE_DIR=/workspace/.cache/uv UV_OFFLINE=true
uv run pytest -q && uv run ruff check .
```

All **3,618 passed**, with no skipped/xfail outcomes, and Ruff reported **All checks passed!**
The starting suite had 3,100 cases. C1 added five; C2 added 513. Checkpoint notes record the
individual runs. Before each checkpoint `origin/main` was fetched and merged into the task
branch; each merge reported already up to date. No test requires an external network request;
only the requested Git operations use network access for this task.

### Credential-pattern scan

The staged/branch additions have **zero findings** for private-key headers, recognizable GitHub
tokens, AWS access-key IDs, service tokens, JWTs and credential-bearing HTTP URLs. The check uses
only Python's standard library and prints locations/rule names, never matching values. It scans
changed files only; it is not an entropy detector or a complete repository/history audit.
No external scanner is installed, and none was downloaded during this no-new-dependencies task.

To reproduce against the committed branch from the repository root:

```sh
python - <<'PY'
import re
import subprocess
import sys

patterns = {
    "private-key": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "github-token": r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
    "aws-access-key": r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "service-token": r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,})\b",
    "bearer-jwt": r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b",
    "credential-url": r"https?://[^\s/@:]+:[^\s/@]+@",
}
names = subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", "origin/main...HEAD"]
).decode().split("\0")
findings = []
for path in filter(None, names):
    if path.startswith("backend/content/secret/"):
        raise SystemExit("Refusing forbidden secret-content path")
    text = subprocess.check_output(["git", "show", "HEAD:" + path]).decode()
    for number, line in enumerate(text.splitlines(), 1):
        for rule, pattern in patterns.items():
            if re.search(pattern, line):
                findings.append((path, number, rule))
for finding in findings:
    print("%s:%s: %s" % finding)
print(f"Credential-pattern scan: {len(findings)} findings")
sys.exit(bool(findings))
PY
```

The scan was also run against the index before each checkpoint commit. Tests and reports contain
no actual credentials or private case output.

## Checkpoints and handover

- [C1](g21-checkpoint-1.md): `57d2587`, exhaustive Act 1 and referee correctness.
- [C2](g21-checkpoint-2.md): `d2a3052`, current pure backend contracts; leveraged positions blocked.
- [C3](g21-checkpoint-3.md): final report, complete gate and branch-scope audit.

Only `test/g21-backend` is pushed. No PR or merge into `main` has been performed. Review the tests
and report, then complete the deferred 10×/zero-close tests once their implementation reaches
`main`; human review is still required before merging this branch.
