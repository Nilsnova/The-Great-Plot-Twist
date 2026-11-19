# Registered-session wager origin evidence

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). This bounded evidence
supports the `settlement-source-account` and `unrestricted-bets` rows of #505.

## Tested execution

The scenario is `frontend/scripts/check-economy-origins-provider.mjs`. It uses real
local GoTrue public registrations, their returned bearer sessions and the production
API verifier. Game creation, membership, session attachment, reset, original-request
retries and current-run reads use authenticated HTTP. No browser rendering is
claimed. The full source and exact results are recorded in the adjacent report.

The frozen scenario at `7301550acf51e70feffe7f9fb21f8d8ad7db298b` passed on
2026-11-19 from 15:38:02.001 to 15:48:12.254 UTC, with process exit zero,
20 authenticated HTTP observations and both unmodified five-minute deadlines.
[`result.json`](result.json) records the complete assertions and layer labels;
[`source-inputs.json`](source-inputs.json) identifies the exact scenario/helper bytes.
The genuine fresh HTTP opener returned `409 prices_stale`; no successful natural
Harbor opening or natural market outcome is claimed.

| Observation | Original account balance / held | Replacement balance / held |
| --- | --- | --- |
| Separate one-coin and all-remaining 199-coin stakes | 200 / 200 | — |
| One-coin win, then reinvest all two-coin proceeds | 201 / 201 | — |
| Owner reset, then original 199-coin bet returns 398 | 400 / 2, retired | 200 / 0 |
| Reinvested two-coin bet returns four | 402 / 0, retired | 200 / 0 |

An additional stake was refused at zero available funds. Exact opening retries
returned 200, changed retries returned 409, and repeated settlement/reset receipts
did not duplicate effects. The new account has exactly one starting grant. Final
balance/commitment sums match both accounts' independent ledgers. Both private
wallets and the owner's Captain are unchanged, and the authenticated current-run
wager page contains no retired-run wagers.

`node --check frontend/scripts/check-economy-origins-provider.mjs`,
`git diff --check` and the documented committed credential-pattern scan passed.

The script verifies that the production frontend, server and migration source is
unchanged from `3bdd8eda16470795fdedd68c42fffab54e5f2ced`. Its branch starts at
`82abc298570ce5436c721a992f538c16d04c30e5`; this is source-equivalence evidence,
not a claim that the running API was restarted at a later documentation commit.

With the isolated provider running, from the repository root:

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
  node frontend/scripts/check-economy-origins-provider.mjs \
  --runtime /tmp/mp505-provider/runtime.json --output /tmp/mp505-origins
```

The executed run used explicit helper overrides to the corresponding owned provider
helper files. Their content hashes are recorded separately from the scenario hash;
they were captured during the real-clock wait and compared again at completion.
Runtime credentials, tokens, account emails and passwords are never copied into
evidence. The local configuration and its credential-bearing contents remain outside
the repository.

## Boundary between product and fixture observations

Admission, the saved Harbor unlock and trusted market opening/settlement readings
are explicitly labeled disposable installer fixtures. They execute the existing
real product transaction functions. They are not natural market feeds or public
rollout. The scenario first records the genuine HTTP opener's response without
overriding it. It then waits both actual five-minute market deadlines; it never
changes immutable financial rows, clocks, HP or outcome columns.

The source-matched result explains the exact one-coin stake, all remaining funds,
separate same-event operations, payout reinvestment, original-request retries,
owner-only reset and retired-account settlement observations. New-run cash, both
personal wallets and the owner's personal Captain remain independently checked.
The member's Captain is not compared before/after in this case. This case does not complete other
acceptance rows or the old-personal-wager/natural-provider gameplay matrix.

No product module, helper, schema, hosted service, migration, deployment or feature
activation is changed by this contribution. No broad backend/frontend suite is
claimed for this scenario-only addition.
