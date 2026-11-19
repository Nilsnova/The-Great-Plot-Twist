# Authenticated shared repair quota

The **staged real-provider observation passed** on production candidate
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`, the current 108-migration local provider
and frozen common helpers `68497043`. This extends #505 acceptance. It does not
add a new completion gate to the separately merged T60/#126 evidence.

[The completed observation](completed-observation.json) combines the assertions
recorded by [the interrupted scenario](interrupted-scenario.json) with a fresh
[fourth request](fourth-request.json) and independent accounting/terminal checks
on the **same wave**. The interrupted script remains `failed`: its redundant
checkpoint before an already-exhausted repair returned a synchronization refusal.
This is not reported as an uninterrupted successful CLI run.

| Observed fact | Result |
| --- | --- |
| Accepted reservation | Actual played wave 1; preparing phase exposes three shared uses |
| Intact and stale-price requests | Both refuse; no spend or allowance effect |
| Real member reload | Same actor/session/frozen participant; generation 6 → 7 |
| Three successful repairs | Owner/member/owner; wall 4 / wall 5 / wall 4; ordinals 1/2/3 |
| Exact repair price | 40 coins each, the current level-three catalogue increment |
| Shared funds before → after repair 3 | 1,040 → 920; zero commitments; exactly three new receipts |
| Original UID after later natural damage | Same original receipt; no new healing, charge or use |
| Fresh fourth request | Actual damaged server row, zero remaining uses, HTTP 409 `repair_limit_reached` |
| Independent accounting | Selected three ledger rows sum to −120; total account ledger reconciles |
| Natural terminal result | Victory at 17:41:58 UTC, separately credits 35 `pirate_loot` coins; final balance 955 |
| Personal wallets | Both unchanged |
| Terminal HP/history | Both real clients read all 12 current structures at full HP; damaged closed HP and original receipt stay immutable |

Both independent native browser replays applied every paid event. Payment requests
use normal authenticated HTTP from the actual browser sessions; the bell uses a
physical pointer. The earlier bounded T60 provider case retains its separate
physical repair-card proof. No response interception, fabricated HP, journal,
combat outcome or clock was used.

## Declared setup and retained attempts

The [setup driver](setup-driver-partial.json) created actual GoTrue accounts and
restored product sessions in two independent Chromium processes. A fresh test-owned
treasury received an explicit **2,000-coin** service-only grant. Saved island unlock
20 and personal level-five/won-wave-20/ten-earned-point eligibility are explicit
fixtures, not naturally earned progression or a recommended balance setting.

All 12 level-three shore/inner-ring walls were bought through **36 fresh-quote
ordinary API purchases/upgrades**, costing 840 coins. The original six shore walls
are recorded in the setup report; the additional
[inner-ring purchases](inner-ring-purchases.json) are retained separately. Earlier
partial waves spent 120 coins on three valid repairs. Therefore the successful
reservation correctly starts at `2000 − 840 − 120 = 1040`, rather than receiving
another grant. Its three repairs cost another 120, and natural victory then pays
35: `1040 − 120 + 35 = 955`.

After a loss the actual retreat rule selected wave 18 from unlock record 20. Only
the already-declared `next_wave=1` saved-state fixture was restored between
completed attempts; the successful reservation explicitly asserts played wave 1.
No combat state/history was reset. One earlier pair was closed after the initial
entry diagnostic. The final retained real account/browser pair was then reused
through click/synchronization diagnostics, with no further registration or grant.
[Failed-attempt summaries](failed-attempts-summary.json)
remain failures; safe raw local reports were preserved.

## Source and execution boundaries

[The source fence](source-fence.json) compares the executed scenario's pre/post
SHA-256, frozen common helper files, loaded entry-finisher function, actual live
API/frontend source manifests, the 108-migration manifest and the independent
browser objects. Production source remains exactly `64ee02b3`.

The successful staged calls loaded committed scenario `a04acbcc` in a persistent
Node REPL and reused the real clients from the earlier failed driver invocation.
The unchanged entry-finisher function matches its committed source. The earlier
driver's whole-file hash applies to that earlier invocation only. These are
source snapshots and file/function comparisons, not continuous process attestation.

After observation, the standalone harness was corrected to use already-accepted
damaged server state for the exhausted fourth request and to check its own script
hashes in its final guard. Those follow-through changes passed syntax/whitespace
review; a new uninterrupted full CLI run is not claimed. The actual staged fourth
request and independent terminal/accounting assertions are the evidence for the
observed result.

The current isolated-provider helper package (including `servedSourceEvidence`,
frozen here at `68497043`) is a prerequisite for this runner. It does not change
the production candidate. Select that helper checkout explicitly when reproducing:

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
MP_ECO_HELPERS_ROOT=/path/to/provider-checkout/frontend/scripts/authenticated-economy \
MP_ECO_OUTPUT=/tmp/mp505-full-repair-quota \
node frontend/scripts/authenticated-economy/full-repair-quota.mjs
```

The recorded execution instead used `node --experimental-repl-await`, imported
that driver with failed-client retention, and called the committed exported quota
scenario on the retained pair. Its fourth request and final SQL/API assertions
continued in the same REPL after the synchronization interruption.

Both scripts passed `node --check`; scoped Markdown links, JSON parsing,
credential-pattern exclusion, evidence arithmetic/source hashes and whitespace
were checked. No broad test suite/build rerun is claimed for this harness-only
change. No hosted migration, deployment, shared-mode activation or full #505/#513
release acceptance is included.

Published failure stacks replace absolute local worktree prefixes with
`<checkout>/` or `<provider-checkout>/`. The sanitization is labeled in the JSON;
raw local reports remain unchanged, and no financial or protocol values are edited.
