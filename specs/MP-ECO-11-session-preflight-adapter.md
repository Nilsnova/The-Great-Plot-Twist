# MP-ECO-11 reserved-session preflight adapter

> **What this is:** read-only binding of the existing session domain to published treasury and permission modules.
>
> **Who uses it:** future coordinated canonical wave integration and focused contract tests.

- **Status:** bounded integration preparation; no runtime route activation.
- **Branch:** `feat/shared-wave-session-adapters`
- **Issue:** [MP-ECO-11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/501)
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Agent assistance:** Codex. Independent human review remains required.

## Scope and authority

Add `wave_session_adapter.py` and focused tests. Use the actual published
`EconomyContext`, `resolve_economy_context`, `read_economy_authority`,
`authorize_economy_action` and `EconomyPermit` APIs. The adapter accepts only the existing
`combat_input` and `wave_revive` actions, checks the explicit target wave against the current
reservation and actor assignment, and applies the existing session/generation/time checks.
It returns the existing advisory permit and never changes money, state or receipts.

Generic permission success alone does not bind a request to a particular wave: a stale
wave-A request must fail if the island and actor are now assigned to wave B, even when both
waves share an island and run. The current resolved account must also match the target
wave's frozen owner/account/run origin. Frozen origin does not bind a participant to the
bell-ringer's actor identity; the current actor comes from verified authentication.

The caller must obtain the frozen context and live session state from coordinated canonical
persistence. Missing frozen binding fails closed; the adapter defines no new snapshot
format, table, RPC, account/epoch authority, participation receipt or assignment provider.
In particular, recovery `islandEpoch` and treasury `runEpoch` are separate identities and
must not be substituted for each other. Existing recovery snapshots currently have no
shared-economy binding.

The published permission reader's `island_economy_authority` RPC provider is not implemented
on this base. Its absence must remain a visible failure. Context and authority reads are
advisory and can race; every eventual SQL mutation independently rechecks current membership,
account/epoch, canonical wave, assignment, controller generation, phase and command validity
under the agreed locks. Preflight is never a bearer token or a write authorization.

## Tests before implementation

- Real-module composition accepts an active assigned participant at combat start, including
  zero treasury funds for free revive, with no money call.
- Another current wave, cross-island assignment, stale epoch/account/owner, missing frozen
  binding, explicit departure, expired wave, countdown-only arrival and old connection
  generation fail without an effect.
- Frozen origin may belong to another initiating actor; it never selects the current actor.
- Unknown actions, `wave_ready` and `wave_join` fail rather than aliasing an existing read.
- Missing or malformed authority fails closed through the published decoder; database
  transport failures preserve their existing unavailable error.
- No personal-wallet fallback, account admission, treasury debit or operation receipt call
  occurs. Fixture authority remains explicitly distinguished from runtime integration.

## Verification and remaining work

Run focused adapter/session/permission/treasury tests, backend Ruff and `git diff --check`.
Current route/SQL/browser runtime acceptance remains blocked by the agreed canonical frozen
binding, assignment/controller provider, participation writer and autonomous expiry driver.
No existing wave routes/services, shared frontend files, flags or INTERFACES are changed.

## Actual local verification

- `uv run pytest -q server/tests/test_wave_session_adapter.py
  server/tests/test_wave_session_control.py server/tests/test_wave_session_lifecycle.py
  server/tests/test_economy_permissions.py server/tests/test_economy_authority.py
  server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py
  server/tests/test_economy_operations.py` — **229 passed**.
- `uv run ruff check .` — passed across the backend.
- `git diff --check` — passed.

Commands ran in `backend/` with a writable temporary `UV_CACHE_DIR`. No dependency files
changed. All new adapter tests use explicit fixture RPC replies and the real Python
foundation modules; none proves SQL authority, transaction concurrency, authenticated browser
reconnect or background expiry. No runtime authority provider or canonical frozen binding
was available for this check, so MP-ECO-11 remains incomplete.
