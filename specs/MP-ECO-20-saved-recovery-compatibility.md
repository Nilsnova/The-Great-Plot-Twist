# Saved recovery compatibility with current main

This bounded compatibility check preserves saved recovery-version-one structures while applying
current main's always-on defense catalogue. It supports the existing multiplayer integration;
it introduces no gameplay policy, migration, authority provider, or runtime activation.

## Scope and contract

- Reproduce only the two saved-extra-plot/culverin HTTP-and-PostgreSQL checks reported by the
  current full backend run. Leave that run and other writers untouched.
- `defenses_v2` and `more_tower_spots` no longer control availability: omitting their accepted
  names must still offer unlocked extra plots and culverins (INTERFACES.md, feature flags).
- Preserve initial-snapshot identity across bell/join/current, saved structure kinds, accepted
  recovery version/protocol, exact repair charge, full repaired HP, and no duplicate payment.
- Distinguish a genuine product failure from an obsolete flag expectation using the actual
  failing HTTP response and persisted rows before changing a test.
- Change only the affected assertions/setup if the current behavior fulfills that contract.
  Any required production correction needs its own concrete failing evidence and review.
- Permit the existing `islet_build` RPC through the narrow disposable SQL adapter for a real
  newly available extra-plot purchase and exact-UID replay. This calls production SQL rather
  than substituting a build result. Verify one building and one wallet debit.

## Verification and limits

Run the two exact pytest nodes on a new disposable Unix-socket PostgreSQL instance with the
complete migration chain, then focused Ruff and diff checks. Authentication in these tests is
injected `httpx.MockTransport`; real domain SQL is exercised. This is not actual-provider,
browser, hosted-database, or full-backend acceptance. Record exact outcomes after execution.

The original two exact nodes failed in 20.52 seconds at the retired culverin/extra-plot
availability assertions. After alignment, the two affected nodes passed in 11.13 seconds with
all 107 migrations installed twice by the disposable fixture. The existing saved-wave,
join/current-snapshot, 80-coin repair, and full-HP assertions remain. The added HTTP purchase
and same-UID retry commit one cannon and one 30-coin ledger debit. Occupied-plot and wrong-slot
requests still fail without charging. Focused Ruff and `git diff --check` passed.
