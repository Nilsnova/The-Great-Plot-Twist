# Zero-treasury timed revival: API and simulation evidence

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). This is a separate
bounded #505 **API/headless-simulation** case. An ordinary rendered zero-budget
hold is not established by this artifact.

Frozen driver `7bc63fd1eb80fe0fa745b23615702c5d6495da72` passed with process exit
zero on 2026-11-19, 17:46:39.663–17:47:09.048 UTC. Two fresh actual local GoTrue
sessions made 237 production API observations. Both normal Captains used their
actual server snapshots; no acquired-level, health, fall or defense fixture was needed.
Only fresh zero-capital shared admission was explicit setup.

The unchanged production simulation consumed complete actual sealed journal prefixes
under real time. Enemy damage felled the owner at battle second 24.85 while the
member stood at 800000 normalized HP. Whole-party reports came directly from those
computed facts; the server supplied the canonical fall ID. The real hold required
2000 milliseconds. Immediate completion returned `409 hold_incomplete`, valid
completion restored 500000 normalized HP, and the exact retry returned the same
receipt without another effect.

Independent committed-state observations confirmed one actual `captain_revive`
journal event, target `down=false`, HP 500000 and its matching revive basis sequence.
Shared cash/commitments stayed **0/0**, account revision and transaction count stayed
unchanged, personal wallet balances/transaction counts stayed unchanged, and shared
paid-repair quota stayed zero. A separate read-only completed-hold/actor-wallet join
also confirmed that the **acting helper's private balance was zero**. The target's
normal 200-coin starting wallet remained unchanged; no all-members-zero claim is made.

[`result.json`](result.json) contains exact source/helper hashes, assertion facts,
the supplemental wallet observation and grouped request counts. Repeated polls are
grouped; credentials and controller-proof query values are absent. Actual running
API/frontend manifests and tracked/untracked source guards matched candidate
`64ee02b360d68836b2de9247121ab47dc6a3ecbf` before and after, and helpers remained
unchanged. The playout/JSON-loader regression evidence is reused from identical
previously tested files; it was not rerun for this narrow case.

From the repository root with the isolated provider/common helpers installed:

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
  node --import ./frontend/scripts/economy-personal-loader.mjs \
  frontend/scripts/check-economy-zero-revival-provider.mjs \
  --runtime /tmp/mp505-provider/runtime.json --output /tmp/mp505-zero-revival-evidence \
  --expected-commit 64ee02b360d68836b2de9247121ab47dc6a3ecbf
node --check frontend/scripts/check-economy-zero-revival-provider.mjs
git diff --check
```

Execution used the explicit common API-helper override; recorded hashes identify
the actual files. Syntax and whitespace checks passed. No broad backend/frontend
suite is claimed. Reports retain the existing client-simulation trust contract;
this case does not prove rendered input, browser revival feedback, a complete wave
outcome or the whole acceptance matrix. No HP, journal, fall, result, hold timestamp
or clock was fabricated. No product/helper/schema change, hosted migration,
conversion, deployment or activation occurred.
