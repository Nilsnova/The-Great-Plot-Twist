# MP-ECO-14: Shared Harbor entry lifetime

> **What this is:** the isolated host for the shared market and football cards.
>
> **Who uses it:** the game owner, with canonical island context and private panel services.

- **Issue:** [#503](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/503).
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`). Coding assistance: Codex.
- **Status:** implemented and tested locally from this prior bounded specification; game wiring is separate.

## Behavior and scope

Add `createSharedWagerHost` in `frontend/src/harbor/shared-wager-host.js`. Its inputs are
`session`, `container`, `getEconomy`, `onEconomy`, optional `subscribeEconomy`, the existing
input/focus/sign-in/notice callbacks, and optional lazy `loadMarket`/`loadMatch` functions.
It returns `open(product)`, `close()`, `dispose()` and an `active` getter. Public products
are `market` and `football`; their private feature tickets are respectively `market` and
`sports`. Pending imports and entry opens count as active so the game can block captain input.

Before any await, require a validated common shared economy envelope, an authenticated UUID
from the current panel provider's `getActorId()`, and a current private-read feature ticket.
Copy the five-field owner/account/run origin. Watch the session's provider lease and optional
canonical economy subscription. A provider, actor, feature, identity, readiness or origin
change cancels the pending open and closes/disposes the old entry. Reopening requires a new
explicit intent. Revision/balance changes within the same origin remain valid.

Cards are created lazily by `createSharedMarketEntry`/`createSharedMatchEntry`. Supply guarded
private provider transport, current canonical economy and actor getters, the validated common
setter `onEconomy(envelope, expectedOrigin)`, optional subscriptions and existing UI callbacks.
Forward request options unchanged so the common authenticated transport receives the cards'
economy capability header. Recheck scope after awaits; discard late replies and entry opens.
Never read credentials, install a new global context store, or select a personal transport.
Missing or malformed context and disabled features fail closed without loading a card.

Closing the shared card while its initial read is pending must immediately release the host's
input block. The card reports closure to its own host entry callback; the host cancels only
that still-owned entry. A delayed close notification from an older card must leave a newer
market or football open intact. Closing does not resolve or replace any pending wager UID.

Only the new host, its focused tests and this specification are in scope. Game and island
wiring, canonical authority production, activation and publication remain outside this change.

## Acceptance checks

Use the actual private panel registry with injected lazy card modules to verify deferred
imports and entry opens; frozen origin/actor binding; provider, feature and identity changes;
pending input blocking; close/dispose cancellation; product switching; load retry; exact
transport options and UI callbacks; and guarded setter/subscription forwarding. Run the
focused host and existing shared card/transport tests plus the production frontend build.
