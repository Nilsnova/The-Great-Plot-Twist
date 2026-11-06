# G21 backend correctness report

Prepared for Nils. Current integration base: `94a48ad` (6 November 2026).
The original authored G21 commits `57d2587`, `d2a3052` and `4afbeb5` are retained in history;
checkpoint 1–3 notes describe their earlier `c26f303` baseline rather than this integration.

**Current result: 2,406 focused correctness tests passed in 11.60 seconds.** The suite calls
current production code directly. The retired spot-trading imports and multiplier assumptions
were replaced in tests; no compatibility layer or runtime rule was added. The complete backend
suite was deliberately not repeated in this delegated regression slice.

## Act 1 and referee

The reachable-graph checks, independent transition oracle, referee replay and Node parity runner
are unchanged from the authored G21 work and pass against the current engines:

- 122 semantic states, 254 accepted transitions, all scenes and eight terminal profiles.
- Every reachable nonterminal state has a path to an ending; closed non-ending cycles fail.
- Every state × all declared actions plus an unknown action is compared independently.
- Python/browser state, messages, visible choices, scene notes and save/resume agree, with 32
  additional seeded histories. Missing Node fails this gate rather than skipping it.
- Edge-covering referee routes and 64 seeded walks check the independently authored kit mapping.

There are infinitely many literal logs because Act 1 has loops. The graph is exhaustive over
rule-relevant state, not over infinite histories or deliberate nonterminating player choices.
The Node runner imports only the existing pure browser story engine; no browser, frontend package
installation or external service is used.

## Current pure backend contracts

| Files under `backend/server/tests/correctness/` | Coverage |
| --- | --- |
| `test_settings_contract.py`, `test_settings_boundaries.py` | All 16 template server variables plus platform-injected build metadata, all 17 settings fields, defaults/blanks, independent dictionaries, all 2,048 subsets of the 11 flags, provider allowlists, production-only Relighting, secure deployed Supabase origins, coordinate/Unicode/control boundaries and seeded host lists |
| `test_weather_codes.py` | Independent expectations for all 29 supported WMO codes, unknown codes, absent/nonfinite measurements, seeded combinations and monotonic rain/fog/wind |
| `test_names_properties.py` | Exhaustive 40 adjectives × 40 nouns × 90 suffixes, independent grammar and offensive-token regressions, duplicate vocabulary, all reroll collisions and fixed-seed generation |
| `test_market_arithmetic.py` | Exact Fraction/integer oracle for current rising/falling 10× values, floor/ceiling rounding, 1%/2% fees, fee/value caps, monotonic marks, exact zero points and one eight-decimal tick on either side, tiny entries and large price gaps |
| `test_position_arithmetic.py` | Current production portfolio and public position projections on seeded walks, unchanged stored positions, independent value/net result/profit oracles and signed half-up ties |

The Exchange oracle multiplies rational values before rounding and never calls the production
value or fee helper to obtain its expected result. It checks both 10× directions and both fee
rates against the current `positions`, `portfolio` and route-model APIs. The retired amplified
price bands, spot units and `MARKET_MULTIPLIER` are no longer asserted. Zero-point math and its
portfolio projection are covered; database sweeps, wallet conservation, source freshness and
abuse/concurrency remain separate G12/Exchange gates.

All randomness is fixed-seed `random.Random`. No dependency was added. Settings strings are
explicit synthetic placeholders; tests replace the supplied mapping and never load process
credentials. Server tests inherit the existing socket guard. No test reads private case content.
The branch adds no coverage claim for external provider credentials, live network behavior,
production deployment, physical devices or later multiplayer/browser wiring.

## Changes and limits

No runtime bug was demonstrated by these checks. Integration failures were outdated test
contracts: imports of removed spot modules, retired multiplier fields, old flag lists and an
insecure preview Supabase fixture. They were corrected in the tests against documented current
contracts, with no production edits or skipped placeholders.

Exhaustive name-format/uniqueness checks and a short explicit token list do not certify every
name combination as appropriate in every language or context. Human content review remains
necessary. Generated names are not asserted globally unique across different player accounts.

All SQL files, source story/partner data, frontend runtime/assets, dependency files and
`vercel.json` remain byte-identical to `94a48ad`. Changes are restricted to the new G21 test
files and `docs/handoff/g21-*`. The case, world, Exchange implementation, festival, host console
and sports packages are preserved.

## Reproduction

From the repository root, run the focused gate and the documented Python style command:

```sh
cd backend
uv run pytest -q server/tests/correctness plot_twist/tests/test_act1_correctness.py plot_twist/tests/test_act1_web_correctness.py --tb=no
uv run ruff check .
```

The focused gate passed **2,406 tests**, without skips or expected failures. Style, secret scan
and protected-file checks are recorded in `g21-checkpoint-4.md` with the integration commit.
The original historical full-suite counts remain in checkpoint 1–3; they are not a claim that
that old suite size or obsolete API contract describes the current release.
