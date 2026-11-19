# Reconcile control after an accepted shared run changes

Responsible teammate: Ianno Hollensteiner. This bounded #501 fix connects accepted
island reads to the existing canonical session client. It changes only island
loading, session binding and pending client-flight handling, with focused tests.
There is no new authority, controller store, receipt, endpoint or financial writer.

When a current, guarded island read changes the selected shared account/run for
the same visible actor and authentication lifetime, schedule one deferred session
reconciliation. Compare actor, authentication generation and full immutable origin;
revision-only updates do not send session requests. Unknown, unsupported, hidden,
disposed or superseded selections cannot initiate control. Read/hydration callbacks
never await reconciliation, avoiding a cycle through attachment hydration.

An attachment already pending for another source retains its exact original UID,
body and unknown/401 outcome. After that flight settles, recheck the captured new
actor/authentication/origin before starting the existing admission path. A later
selection or sign-in change cancels that queued attempt. Existing durable departure,
inert intent parking, exclusive Web Lock and independently fresh control GET remain
required; a new snapshot alone cannot grant proof or a nonce room.

Test first: actual island assembly must automatically reacquire a member session
after a same-code replacement snapshot and old heartbeat refusal, without a focus
event or manual post-change session request. Cover both response orders, unchanged
scope reads, delayed old attachment/read/hydration, actor/target/visibility fencing,
and exact uncertain original intent retention. Local fixtures verify composition;
the genuine rendered reset and accepted Realtime transition remain separate.

## Verification

Before the fix, both actual-assembly heartbeat response orders failed to restore
proof, and five pending-flight/uncertain-intent cases failed. Two further queued
visibility/availability cancellation regressions failed before clearing the canceled
fingerprint. The final focused selection passes102 tests across eight files in
32.61 seconds, including existing session transport/intents, adoption hydration and
actor-fenced loading tests. The production build and spoiler guard pass; full diff
whitespace review is clean. Independent source review found no concrete issue.

The browser assembly tests use synthetic authenticated transport and real browser
Web Locks. A transient spectator read during asynchronous lock release remains
read-only and uses the existing normal session retry timer before admission.
No live runtime, additional reset, grant or provider write is part of this change.
The full test suites and real automatic reset/member-topic transition must be
reported separately against the integrated source.
