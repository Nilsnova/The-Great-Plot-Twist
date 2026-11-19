# Current-source compatibility and last-funds accounting

This bounded #505 evidence uses production baseline
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`, the official isolated local provider
with 108 application migrations, real registered GoTrue identities and the
production bearer-token verifier. No product source, migration or economy rule
changed. All setup and writes were confined to fresh disposable local actors.

## Observed results

| Observation | Exact evidence and boundary |
| --- | --- |
| An old private obligation keeps its recipient | An actual private ten-coin duel opened through HTTP before admission, then canceled through HTTP after admission: personal wallet 200→190→200; island bank stayed 10/0. |
| Shared requests fail closed | Nine real authenticated route/protocol probes rejected missing/unsupported capabilities, missing epoch, forged actor, old protocol on shared island, native start without proof and island payloads on excluded private products. Island and personal balances/history counts stayed unchanged. |
| Legacy personal products stay personal | A separate registered legacy actor read Pirate Point/islet coins, purchased a ten-coin Pirate Point wall and replayed the request. Its wallet changed 200→190 once; the shared bank stayed unchanged. The legacy protocol-one idle current-wave read returned 200/null. |
| Construction competes with a wager | The actual trusted-input wager transaction held the canonical treasury scope lock during a real two-second scheduling gate. After observing `PgSleep`, an authenticated construction request competed for the same last ten coins. The wager committed one ten-coin hold; construction returned 409 `insufficient_funds`. Bank/commitments 10/0→10/10; ledger/revision 1→2; private histories unchanged. |
| Eligible combat repair competes with a wager | Six actual ten-coin wall purchases left ten coins from a labeled fresh 70-coin admission. An actual protocol-two bell froze two registered members. The unmodified production controller/journal advanced at real 50 ms intervals; natural damage reached 875000 HP units after 12.928 real seconds and the canonical checkpoint accepted it. During the observed wager scope-lock gate, the member's actual eligible repair returned 409 `insufficient_funds`; paid quota stayed zero. Bank/commitments 10/0→10/10; ledger/revision 7→8; personal wallet histories stayed unchanged. |
| Disposable SQL contention and no fallback | Four current-authority cases passed, including independent barrier-started purchase/wager transactions for owner/member purchasers, exact winner replay, unsupported shared exchange refusal and shared legacy wave-entry refusal. No persistent authority function was replaced. |

The final compatibility provider run lasted **17:25:04.488–17:25:23.357 UTC**;
the repair/wager run lasted **17:25:04.583–17:25:30.449 UTC**, both on 2026-11-19.
Raw reports and source fences are in [provider](provider/compatibility-result.json).
The [manifest](manifest.json) hashes copied artifacts and the SQL test source.

## Reproduction and provenance

With the isolated provider already prepared by the authenticated economy harness,
run from `frontend` using Node 24:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
MP_ECO_RUNTIME=/path/to/private/runtime.json \
MP_ECO_OUTPUT=/tmp/compatibility \
node scripts/authenticated-economy/check-compatibility.mjs

NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
MP_ECO_RUNTIME=/path/to/private/runtime.json \
MP_ECO_OUTPUT=/tmp/repair-wager \
node scripts/authenticated-economy/check-repair-wager.mjs
```

`MP_ECO_HELPER_ROOT` can select an existing copy of the common authenticated
provider helpers. The recorded common helper commit is
`6849704385f2f49a00be2b96a91eebc14d1fbc75`. The source guards compare actual served
API/frontend and local scenario production paths to the declared full baseline
before and after. Both wrappers/scenarios and their four direct JavaScript helper
files are hashed before/after. These receipts do not claim a complete transitive
helper dependency inventory or human observation of rendered controls.

From `backend`, the final disposable SQL command was:

```sh
CASE_PG_SCRATCH=1 uv run --offline --no-sync --with pgserver \
  --with 'psycopg[binary]' --with pglast python -m pytest -q --tb=short \
  server/tests/island_sql/test_current_cross_domain_compatibility_sql.py
```

Result: **4 passed in 5.97 seconds**, with the exact output in
[disposable-sql.txt](disposable-sql.txt). The tests use explicit seeded identities,
fresh admission and saved unlocks; they do not establish provider authentication.
Separate focused route tests cover class-guest access and prerequisite-read failure
without fallback at their existing fake-transport layer: **11 passed in 2.67
seconds**, recorded in [focused-routes.txt](focused-routes.txt). The exact command
was:

```sh
uv run --offline --no-sync python -m pytest -q --tb=short \
  server/tests/test_economy_permissions.py::test_bad_account_resolution_never_reaches_authority_or_a_personal_fallback \
  server/tests/test_island_treasury.py::test_database_failure_never_becomes_personal_wallet_fallback \
  server/tests/test_market_calls_routes.py::test_an_admitted_guest_makes_calls_like_a_player \
  server/tests/test_island_routes.py::test_an_admitted_guest_plays_like_a_player \
  server/tests/test_island_routes.py::test_a_guest_without_the_class_code_is_refused
```

Scoped Ruff, all four scenario/wrapper Node syntax checks and `git diff --check`
also passed. No application build was rerun for this test/tooling-only change.

## Limits and retained failures

Construction is idle-only; repair requires a wave reservation. A single three-way
purchase/wager/repair race would contain an ineligible action, so two valid races
cover the common last-funds invariant. The two-second scheduling gate is a real
transaction wait, not a changed persisted clock. Trusted price 100/current-source
terms are explicit inputs to the actual wager RPC; these observations do not prove
an HTTP market opener or a natural market feed. Saved Harbor unlock 4 and fresh
admission amounts are explicit setup. Combat HP, outcome, journal, roster and clock
were not fabricated. Countdown zero was selected through the ordinary settings
API; the real minimum-finish time remained ten seconds.

The compatibility run covers a positive legacy protocol-one idle read, not a full
protocol-one combat lifecycle. Anonymous class-code guest UI, injected prerequisite
read outage, rendered cross-product context switching and natural market outcomes
are not observations of these API-only scenarios. Existing lower-layer tests keep
their own qualification; these limits do not introduce new acceptance rules.

One initial harness attempt expected a 422 for a native start without a session
proof; the actual explicit response was 409 `economy_context_required`. The test
expectation was corrected and the final complete source-matched runs above passed.
Earlier successful submission races were strengthened with the observed canonical
lock gate; they are not relabeled as the final measured runs. No product defect was
demonstrated by this contribution.
