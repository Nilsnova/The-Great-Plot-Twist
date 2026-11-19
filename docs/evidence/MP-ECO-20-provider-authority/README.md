# Current-candidate authority and grant verification

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

These bounded #505 observations use actual local GoTrue identities, production
HTTP handlers, PostgREST transactions and independent committed-state reads.
The full declared production candidate is
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`, including the reconnect correction and
108 migrations. Historical evidence retains its earlier source and is not relabeled.

## Actual results

| Case | Execution on 19 November 2026 | Observations |
|---|---|---|
| [Registered authority](member-authority.json) | 17:23:45–17:24:03 UTC, six groups passed | An invited member demolished the owner's wall and refunded five coins to the island; changed the owner's cannon research decision for its exact 360-coin quote; outsiders and forged account/epoch requests failed without spending. Session succession allowed settings but returned 403 for reset. Owner reset/retry produced one replacement 200-coin grant, preserved the member Captain and replayed the old research receipt without affecting either account. Explicit owner account/island deletion preserved continuing players and rejected the cached deleted identity. |
| [Concurrent capital](grant-races.json) | 17:32:31–17:32:52 UTC, three groups passed | Three parallel creates and three shared resumes per owner did not multiply personal or island starting grants. Joining two islands brought no money. Same-UID reset requests returned 200/200 with one immutable effect; distinct UIDs captured against the same epoch returned 200/409. Each owner retained exactly one retired and one active account, each with one grant and reconciled history. A new UID with the retired epoch could not reset again. |
| [Genuine anonymous member](anonymous-member.json) | 17:39:02–17:39:13 UTC, two groups passed | A separate official GoTrue service created genuine anonymous users; the primary Auth service independently accepted their tokens. Invalid invitation left the guest unadmitted, while the normal valid invitation admitted it. Actual guest build, demolition of the owner's building and research reversal returned 200; reset and uninvited access returned 403. The final shared bank 1085/0 matched its ledger, and private wallets were unchanged. The primary demo-off context still returned 403. |

Every final process exited zero. Exact scenario/helper hashes, protected source
comparisons, actual served candidate and UTC timestamps are recorded in the reports.
The loaded helper files matched before and after each run. [Provider provenance](provider.json)
records pinned official image digests and all 108 application migration hashes.
The initial configuration/source guard tests passed eight cases; after adding the
secondary-Auth isolation regression, the focused suite passed **nine tests**.
Two Node endpoint/source guard tests, scoped Ruff, script syntax and diff checks
passed. No broad application suite or production build was repeated.

## Explicit setup and trust boundaries

Registered authority used an explicit fresh 6000-coin admission and saved wave-20
research unlock. Anonymous authority used 2000 coins and the same saved unlock.
The grant-race case used the configured 200 coins. These are service-only test
admissions, not public conversion, naturally earned capital or earned milestones.
No subsequent financial history, clock, combat HP, journal or outcome was edited.
Preserved personal Captain checks in the authority case used an initialized
level-one profile; earned participation/milestone preservation is covered separately.

The anonymous context is isolated from the frozen primary services. A second
cached official GoTrue image binds only `127.0.0.1:54426` and enables its existing
anonymous provider against the same real Auth database and issuer. A separate
production API binds `127.0.0.1:58008`, with only the existing `demo` feature flag
enabled; `demo_mode` stays false. No user row or JWT identity was fabricated.
Normal `/api/games/join` invokes the existing guest-admission path. The separate
configuration generator reproduces the exact observed Compose bytes and is tested
to leave the primary configuration unchanged.

These are authenticated API and SQL observations, not anonymous browser login or
pointer interaction. The optional successful guest HTTP wager has its own source
and fixture-price evidence; it is not inferred from these spending checks.
The complete #505 scenario accounting remains separate.

## Reproduction

Prepare the common isolated provider with its explicit full candidate SHA first.
From `backend/`, start only the secondary guest services:

```sh
uv run python -m tools.authenticated_economy.guest_stack up
uv run python -m tools.authenticated_economy.guest_application
```

From the repository root, using fresh private output directories:

```sh
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
MP_ECO_OUTPUT=/tmp/new-authority node frontend/scripts/authenticated-economy/member-authority.mjs
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
MP_ECO_OUTPUT=/tmp/new-grant-races node frontend/scripts/authenticated-economy/grant-races.mjs
NODE_EXTRA_CA_CERTS=/tmp/mp505-provider/provider-ca.crt \
MP_ECO_OUTPUT=/tmp/new-anonymous node frontend/scripts/authenticated-economy/anonymous-member.mjs
```

Reports never contain access tokens, passwords or account emails. The private
runtime and optional guest wager client remain outside the repository.
Stop the secondary API terminal and use
`uv run python -m tools.authenticated_economy.guest_stack down` to remove only its
Auth container. The primary provider's database/network remain separate.

[Earlier failed harness expectations](preparation-failures.json) remain failed:
one quote selector accidentally excluded tier one's null choice; another used the
wrong starting-grant reason in its observer query. Neither was an application
defect or a successful earlier case.
