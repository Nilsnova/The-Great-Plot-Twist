# Engineer role: first quoted construction purchase

The candidate frontend `74be485507fbdbf1eb662f96f11a40c5e902e507` passed both an owner and an invited visitor's first construction purchase immediately after visible Engineer selection. Each case used actual local GoTrue registration, genuine SDK session restoration, production JWT verification and real PostgreSQL effects. The unchanged backend, content and migrations matched `64ee02b360d68836b2de9247121ab47dc6a3ecbf`; the frontend source is qualified separately.

For each sequential browser context:

- The actual role button returned 200 without charging money.
- The first physical Build click displayed 9 coins and submitted the authoritative `quotedCoins: "9"` intent. It returned 200 and a 9-coin canonical receipt.
- Independent database observations matched the complete ledger: 5,000 → 4,991 coins, unchanged zero commitments, exactly one additional treasury transaction and exactly one construction receipt for that UID.
- Exactly one build POST occurred. No explicit refresh, reload, travel or fixture mutation occurred between the role selection and first purchase. The role handler's ordinary authoritative reads are the fix being tested.

`result.json` contains the exact safe request/receipt fields, financial observations and before/after source/helper hashes. The screenshots show each displayed first quote. The scenario uses one Chromium process with isolated owner and visitor contexts in sequence; the other island owner uses actual authenticated API calls only. Both browser contexts and the browser process were closed after the run.

Fresh service admission with 5,000 coins and a saved personal level-5/earned-points eligibility profile are explicitly installed test prerequisites. They do not prove naturally earned milestones. Opening the Captain and build cards uses the existing product selection methods; Engineer selection and Build use physical pointer clicks. No HP, clock, combat outcome, quote or financial receipt is injected.

The candidate used a dedicated loopback frontend with a private Vite cache and `/api` proxy to the unchanged local API. Product Auth configuration retained the original valid HTTPS provider URL. Initial harness SDK `setSession` used a transparent same-origin `/provider` proxy to that same provider with its trusted local CA; there is no fake identity or replaced response. `candidate-source.json` records the launched wrapper, process and source identity. Its source receipt was recorded before the measured scenario, and before/after production/helper checks passed. Local filesystem prefixes in published JSON are replaced with descriptive placeholders; the original private files remain available.

`setup-failure.json` preserves the first setup-only attempt: the immediate API verifier call returned 401 during lazy session restoration, before any role or build action. The successful driver then used the existing bounded verifier-readiness pattern, observing 401, 401, 200 for the owner and 401, 200 for the visitor, always requiring the actual expected actor before game actions. The retained pre-fix first-click 409 remains separate evidence; it is not relabeled as passing.

## Verification

The meaningful browser-DOM regressions failed on the original role handling, then passed after the fix. The four focused suites passed **29 tests**:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/island/engineer-role-quotes-dom.test.js tests/island/captain-auth-race-dom.test.js tests/island/economy-captain-dom.test.js tests/island/shared-core-dom.test.js
npm run build
```

The production build and spoiler guard passed. The actual-provider scenario is a bounded first-purchase proof, separate from the remaining multiplayer acceptance matrix. It makes no hosted deployment, full frontend-suite or live-migration claim.

## Auth generation during a refused role refresh

A subsequent self-review found a separate narrow race introduced by keeping the role/respec busy flag through the refreshed read. If a refused action awaited its fallback home read, authentication could change and a new actor's action could start before that old continuation returned. The old continuation could then clear the newer action's busy flag. Two regression cases reproduced the failure before the follow-up fix. Both actions now recheck their captured authenticated actor immediately before resetting their busy state.

The five focused suites, including `captain-role-refresh-race.test.js`, then passed **31 tests** and the production build/spoiler guard passed again. `auth-guard-follow-up.json` pins the executed runtime/test blobs, records the exact command and distinguishes the dirty verification worktree from its committed base.

The actual-provider result remains attributed to frontend **74be4855** and was not rerun for this two-check delta. Its successful owner/visitor traces retain the same authenticated actor and already pass the success branch's post-refresh check. The new final check also evaluates true on those unchanged success traces and introduces no request, quote, receipt or money movement. That is a bounded trace-equivalence argument for reusing the first-buy evidence, not a claim that the final source was executed against the provider.
