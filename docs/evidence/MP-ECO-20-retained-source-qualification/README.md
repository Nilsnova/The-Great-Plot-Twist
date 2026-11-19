# Retained acceptance evidence: source qualification

This comparison helps reviewers reuse specific historical MP-ECO-20 observations
without changing their original source, result or evidence layer.

[comparisons.json](comparisons.json) records actual Git blob comparisons and
retained harness hashes. No tests or browser journeys were rerun for this package.
The [acceptance matrix](../../economy/ACCEPTANCE.md#required-scenarios) still requires
targeted SQL and authenticated-browser evidence; a comparison cannot manufacture
a missing observation.

## Compared source and unchanged dependencies

The rendered historical source is
`b239bdf094d132fc57969fb31f652f106db8abc5`; the current served candidate is
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`. Published main
`3bd2588cdc88bfd5ce8f0e64e9ae607841851065` has identical protected production
files to that candidate. Tests, tools and documentation are outside that
production comparison; the exact pathspecs are recorded in JSON.

Between the historical source and candidate, only eight protected paths differ:
one backend catalogue docstring, six frontend control/loading modules and the
additive operator recovery migration. The backend AST matches after removing
docstrings; all 34 Auth/SDK files and all 107 historical migration blobs match
exactly. Migration 108 adds private operator receipts and service-only operator
routines; these are outside the retained normal-path scenarios. This is not a
claim that both complete database schemas are identical.

The retained [core browser report](../MP-ECO-20-local-provider/core.json) ran on
`3bdd8eda16470795fdedd68c42fffab54e5f2ced`. All eight recorded helper SHA256s
match their actual executed checkout blobs. Its backend, content, Auth/SDK files
and dependency locks match the current candidate without any differences. The
[session report](../MP-ECO-20-sessions/result.json) retains source
`82abc298570ce5436c721a992f538c16d04c30e5`; its executed scenario SHA256 also
matches, and the same authority dependency scope is unchanged.

## Applicable observations and limits

| Retained observation | Qualified use |
|---|---|
| Core capability/epoch/member/actor refusals; authorized initial shared read | Genuine authenticated-browser transport: actual Chromium, public GoTrue SDK, production restored session and browser-origin fetch. The tested authorization dependency scope is unchanged. |
| Core invited-member build, exact replay, free respec, Carpenter refusal and last-funds construction | Retain those browser-transport slices and committed-accounting observations. They do not render cards or establish purchase/wager/repair contention. |
| Session duplicate-tab and cross-island controller refusals | Retain unchanged authority/proof boundaries. A proofless clone cannot enter the new renderer-promotion branch, which requires a valid controlling participant proof. |
| Retained reconnect canonical UUID/generation, healthy HP, position and empty cooldown | Retain the server-state facts. Current renderer promotion is a separate observation; fallen or nonempty-cooldown persistence was not observed by that journey. |
| Idle Settings reset and automatic peer topic reacquisition | Conditional reuse only: no current wave makes the added control refresh return before effects; changed account/epoch/full-economy stamps still dispatch the original funding payload. Preserve the original cached-socket boundaries. |
| Account deletion and personal preservation | Unchanged backend effects remain applicable. Idle peer clearance needs the same branch condition; malicious cached-socket deletion and universal immediate cache eviction remain unclaimed. |

The six changed frontend modules directly affect active-wave control and loading.
Historical active-wave reconnect, spectator promotion and pacing cannot be treated
as a blanket current rendered pass. Current targeted observations must cover the
changed branches before combining them with retained authority evidence.
Historical rendered revival at treasury 200 does not establish a rendered
zero-bank revival. New Node/API or sealed-simulation evidence also keeps that
layer. The observed first-build stale quote after selecting Engineer is not waived
by this comparison.

The [test map](../../TEST-MAP.md) and individual scenario reports remain the place
to combine actual observations into the fifteen rows. This package alone does not
close MP-ECO-20, claim physical-device coverage or authorize hosted activation.

## Quote-refresh follow-up candidate

Candidate `74be485507fbdbf1eb662f96f11a40c5e902e507` changes only
`frontend/src/island/island-actions.js` in protected production; integration
candidate `dc20dd3839785e32ee8c973413fae958ddbf8efa` has the same protected
files. Backend, content, all 108 migrations, locks and Auth/SDK remain identical
to served candidate `64ee02b3`.

The new helper invalidates and reloads shared construction offers after a role
change or respec. Those callers await the new quotes. Existing build, demolition,
research and crew function source before that helper is identical; JSON records
its SHA256. Reset and Account deletion use separate unchanged implementations,
whose SHA256s are also recorded. This qualifies those unchanged branches without
claiming that the whole actions module matches.

The old core/session HTTP refusals retain their unchanged authority dependencies;
role-free combat, revival, repair, wager and ship cases retain their stated
sources and limits. Role/respec UI and the first construction afterward required
a separate actual-provider observation. The [Engineer first-purchase proof](../MP-ECO-20-engineer-first-buy/README.md)
now records that observation for both the owner and invited visitor. Its 29
Chromium DOM checks and build remain separate evidence, rather than substitutes
for the actual browser result. The original stale-quote failure remains a failure.

The final actor-guard follow-up,
`9c25ec4b08f30ba08b89cb84e362bdbd8e942754`, adds exactly two `current()`
checks before role/respec busy-state cleanup. It leaves the quote refresh and
all financial requests unchanged. The actual owner/visitor successes remain
attributed to frontend `74be4855`: they kept the same actor and passed the
existing post-refresh success check, so the added guards are true on those
observed paths. There was no provider rerun for the follow-up. Its separate
pinned regression report records two tests failing before the guard, then 31
passing tests across five affected suites and a successful build. The newly
protected delayed-refusal branch is test evidence, not a newly observed provider
journey. Exact source/test blob IDs and result provenance are recorded in JSON.

## Membership-departure follow-up candidate

Candidate `90a9a8227579c2be86cbe1d024fa75de7d61637e` adds one protected
production delta to `9c25ec4b`: the existing `depart` helper in
`frontend/src/island/shared-session-client.js`. Only an authenticated leave
response with status 403 and exact code `not_member` now retires the saved
original departure through the existing exact-record intent check. General 403,
unknown refusal and network failure remain retryable. All backend, content,
108 migrations, locks, Auth/SDK and other frontend files remain unchanged.

The canonical membership transaction already withdraws the departing player's
control, slots and stock and rotates the topic. The obsolete local departure
therefore grants no remaining authority. Clearing it permits the ordinary new
attachment attempt; the server still checks membership and global control.

Financial, zero-revival and real-grace observations remain attributed to their
actual `64ee02b3` source; the direct-own grace case does not enter the changed
removed-membership branch. The successful Engineer traces remain actual
`74be4855`. The separate departure fix package reports one red regression, then
76 passing session client/API/intents tests and a fresh successful build; this
comparison reruns none of them.

The actual `64ee02b3` member-Leave waiting failure stays failed. Its replacement
requires a separate actual-provider proof on served candidate `90a9a822`: same
actor, ordinary rejoin/Leave, authentic old-scope `403 not_member` and product
handoff to a fresh own session after the recorded normal UI/focus trigger. The
comparison does not manufacture that result or waive other authority gates.
