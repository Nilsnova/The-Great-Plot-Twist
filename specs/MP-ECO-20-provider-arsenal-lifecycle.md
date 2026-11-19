# Provider-authenticated arsenal capacity and lifecycle

This bounded contribution to [#505](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/505)
checks shared arsenal ownership and the canonical departure/deletion/worker path.
Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

The final API-only scenario passed from `2026-11-19T17:13:40.157Z` to
`2026-11-19T17:15:03.339Z` on driver `3b720688c06f0bd04dff2879ed9b018322885c09`.
Scenario SHA-256: `b3c0ecbdeeed77de384989cf9e6bab2b1c9c55da4c338a34e76c611eb222ea81`.
[Committed evidence](../docs/evidence/MP-ECO-20-provider-arsenal/README.md) includes
all eight observation checkpoints and unchanged hashes for ten helper files.

## Scenario and authority

[The API scenario](../frontend/scripts/check-economy-arsenal-provider.mjs) uses four
real local provider registrations, production token verification and the actual
shared HTTP routes. It uses no browser, synthetic Auth response or fixture
authority provider. The canonical session transactions freeze and settle the
original account, epoch, roster, copy identity and holder generation.

Fresh admission with a 5000-coin test budget, a saved wave-10 unlock and four
account-bound converted copies are explicit disposable setup. The budget is not
the selected normal starting capital, and these checks do not prove earning,
legacy conversion or a naturally reached unlock. No financial receipt, immutable
history, wave outcome, clock, HP, fall or journal is edited.

## Bounded acceptance

| Boundary | Required observation |
|---|---|
| Total capacity | Twenty actual paid copies comprise sixteen stored and four carried; the twenty-first purchase refuses before a new operation root or debit. Prices come from the actual catalogue. |
| Replay and money | Exact purchase retry returns its original receipt. Independent balance/hold sums match the immutable ledger and all twenty purchases debit once. |
| Exclusive copy | Two authenticated actors compete for the same identity/generation; exactly one takes it. Its previous held copy returns atomically even at full capacity. Obsolete tenure cannot return the new holder's copy. |
| Basic weapon and overflow | A full-inventory return exposes the free musket. Existing converted excess raises the fixture total to twenty-four; takes/returns retain every identity and new purchases remain refused. |
| Frozen loadout | The ordinary bell freezes four exact weapons/copies/generations. New inventory mutation is refused throughout the reservation. |
| Departure and deletion | A departing member and a deleted nonowner retain reserved copies as pending returns. Physical Auth/profile deletion does not destroy inventory. |
| Grace and independent closure | Remaining controllers disconnect into the real fixed grace. Repeated disconnect does not extend it. No player API or arsenal read occurs for sixty-seven seconds; the independently running production worker must close the abandoned attempt and return the original pending tenures once. |
| Continued ownership | All twenty-four IDs and frozen history remain; a formerly deleted holder's saved copy can be taken once by competing remaining members. Continuing personal wallets and island money are conserved. |

The fixture has no combat simulation and claims no natural win, damage, fallen
Captain or revival result. It exercises canonical abandonment under the actual
clock and the separately running production worker. The worker's source and live
process are checked before and after; the scenario never calls a terminal
outcome or due-worker RPC to cause the observed closure.

## Source and reproduction

The production baseline is `64ee02b360d68836b2de9247121ab47dc6a3ecbf`. The generic
provider harness must serve that exact qualified candidate and run its canonical
worker. The driver checks working-tree/untracked production source, dependency
manifests, serving-process evidence and the imported helper closure before/after.
An unrelated candidate must receive fresh qualification rather than inherit this
checkpoint's result.

From `frontend/`, after the generic local provider stack and worker are ready:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/check-economy-arsenal-provider.mjs \
  --runtime /path/to/private-local-runtime.json \
  --output /path/to/new-private-evidence-directory
```

The private runtime stays outside the repository. `MP_ECO_API_HELPERS` and
`MP_ECO_OBSERVER_HELPERS` can select the same generic helper interfaces from
another local checkout. The helpers refuse a different configured candidate or
nonlocal provider. No hosted migration, deployment or activation is performed.
The remaining authenticated scenario matrix and real production readiness keep
their separate status.

## Verification boundary

`node --check frontend/scripts/check-economy-arsenal-provider.mjs`, relative
documentation links and scoped whitespace checks passed. A separate read-only
review found no demonstrated material concern in the scenario. The first
successful development run was followed by a focused final run adding direct
in-grace identity/generation/deadline assertions; it is not relabeled as an
rerun on unchanged source. No full application test/build was repeated for this
API-only test/evidence contribution.
