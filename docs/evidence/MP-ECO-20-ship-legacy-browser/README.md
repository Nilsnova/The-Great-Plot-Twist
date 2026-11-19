# Targeted ship, personal and class browser observations

These bounded #505 observations use actual GoTrue identities, the production SDK,
an unchanged application/API and disposable PostgreSQL. Test source began at
`92e7c3b6d68a8636a638606a605efa534ea3fb83`; protected application/content/migration
and dependency files matched the running production candidate
`64ee02b360d68836b2de9247121ab47dc6a3ecbf`. The running provider is not renamed to
the test checkout. Before/after source guards and file hashes retain both identities.

**The staged observations passed; an uninterrupted whole-driver pass is not
claimed.** The [main driver](interrupted-driver.json) remains failed at its optional
positive-score assertion. Its five completed facts and actual zero-star ship
claim are retained, followed by the independently executed
[class continuation](class-continuation.json). See the exact
[completed observations](completed-observation.json).

| Actual browser observation | Result |
| --- | --- |
| Personal construction card | Physical Build on unused wall 3 returned 200 and debited the personal wallet 180→170. |
| Legacy Harbor | Reachable actual card and HUD used personal funds, 170 coins. |
| Pirate Point purchase | Physical Build on `pp_wall_4` returned 200; its card said “Paid by you · belongs to Pirate Point”; personal funds 170→160. |
| Legacy protocol-one idle read | Actual authenticated browser transport returned 200/null. This is not a rendered combat/finish claim. |
| Shared old-client fences | Missing/unsupported capability reads and a protocol-one shared bell returned explicit 409 errors; original private/shared money stayed unchanged. |
| Actual ship game and normal claim | The real Broadside UI ran its normal 20-second round with physical Fire inputs and unmodified scoring. It earned **zero stars**. The scene submitted its normal HTTP claim, which returned 200. The result visibly read “No improvement · island 0 / 36 earned.” |
| Zero-reward accounting | Independent committed state found one original-account Broadside result: stars/coins/cumulative 0/0/0, cap 36; shared balance/held 200/0, one starting ledger entry; personal balance remained 160. No positive browser payout is claimed. |
| Genuine class-code admission | The same prepared anonymous actor restored a genuine SDK session and used the visible Join form; normal `/api/demo/join` returned 200. Current product rules correctly land class players at Pirate Point. |
| Personal class Harbor | Ordinary sea-chart travel reached Saltreach Harbor. Visible Menu → Harbor → Market showed personal 200 coins. Original shared bank 200/0, original owner wallet 160 and guest wallet 200 stayed unchanged. |

Positive ten-member ship caps, parallel improvements and positive reward accounting
retain their separate API/SQL evidence. A positive score is not an extra browser
acceptance gate. The actual missed shots are not replaced with supplied stars or
an injected result.

## Source, setup and execution

The main observations ran **18:55:25.760–18:58:04.464 UTC on 2026-11-19**, using
committed scenario `ec7a049f6b1085fa56e19eb43846c037ba354a1a`. The class continuation
uses its own recorded interval and committed `ce2aed5b` scenario. Each scenario
compares its actual loaded file/helper/launcher hashes and protected source before
and after. The exact measured blobs remain in Git history. These are source
snapshots and file comparisons, not continuous process-memory attestation.

A separate loopback API/frontend on 58007/55107 uses normal product services and
a private Vite optimizer cache. Its declared local settings enable `demo`, disable
recovery admission and keep `demo_mode=false`. Existing `oneisland=0` exposes the
normal legacy sea chart. The production provider URL remains the original valid
HTTPS root. Initial SDK restoration uses a transparent same-origin `/provider`
proxy to that same actual provider, with trusted local TLS; no Auth/API response
is replaced and primary services are unchanged.

Saved island record 30/completed wreck 500 and service-only shared admission of
200 are explicit eligibility/setup fixtures. They do not establish naturally
earned wins, wreck payments, legacy-save conversion or rollout. The actual
registered host is allowlisted only on the side API; the normal host endpoint
generates a disposable class code. No profile/JWT/Auth stub grants that role.
Actual anonymous signup uses the separately enabled local GoTrue service.

The final observations reused the same registered host/game and anonymous actor.
Earlier failed attempts legitimately bought walls 1 and 2; they were not refunded
or reset. Thus the retained main interval starts with personal 180, spends 10 on
wall 3 and 10 on Pirate Point, and ends at 160. Shared admission creates one
separate 200 grant. Class continuation creates no new signup, grant or reset.

Existing development inspection selects cards and the chart; economic buttons,
travel targets, ship launch/Fire and class Join/Market controls use actual native
browser input. Screenshots show the inspected
[zero-result ship](boat-zero-result.png) and the cropped
[personal class market](class-personal-market.png). Class codes, session files,
tokens and provider credentials remain private.

## Reproduction

With the common local provider and its real anonymous-enabled GoTrue service ready,
the forward standalone preparation/commands are:

```sh
cd frontend
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/authenticated-economy/prepare-ship-legacy.mjs actors
```

Start `python -m tools.authenticated_economy.ship_legacy_side` from `backend`, then
from `frontend`:

```sh
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/authenticated-economy/ship-legacy-front.mjs
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/authenticated-economy/prepare-ship-legacy.mjs code
NODE_EXTRA_CA_CERTS=/path/to/local-provider-ca.crt \
  node scripts/authenticated-economy/ship-legacy-browser.mjs
```

The recorded successful class continuation instead runs
`class-browser-continuation.mjs` against the already prepared actors and retained
failed-main artifact. Its own source guards/hashes and actual UI result are
separate. The preparation file and forward standalone corrections are syntax
reviewed; the complete corrected standalone command was not rerun. Do not relabel
the retained failed driver as a pass.

## Retained failures and verification

[Earlier failures](retained-failures.json) preserve side-origin bootstrap readiness,
detached controls, queued goals/chart readiness, the optional positive-score
assertion and mistaken class landing/loading predicates. Current source explicitly
lands class-code users at Pirate Point; the continuation follows that rule and
then travels normally. No product defect is inferred from those harness mistakes.

Scoped Python Ruff, all four JavaScript syntax checks, exact measured-source and
artifact hashes, JSON/credential exclusion, relative links and whitespace checks
passed. No broad application suite/build was rerun for this tooling/evidence
change. The current complete #505 matrix, natural feed results, physical devices,
full legacy rendered combat and hosted deployment remain separately qualified.
