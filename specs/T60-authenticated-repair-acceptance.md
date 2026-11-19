# T60: Current-rule repair acceptance and journal capacity

This is the verification follow-through for issue #126. Ianno Hollensteiner owns
the work. The source baseline is main `3bdd8eda`; no deployment, hosted migration
or feature activation belongs to this task.

An actual-provider observation demonstrated an active-wave reconnect race: a
spectator renderer did not gain its server-confirmed frozen Captain control after
session attachment. The narrow frontend fix refreshes that validated projection
without restarting the simulation or changing journal/HP history. It rejects a
stale session response and never grants control to a true nonparticipant spectator.
The bounded real-provider follow-up proves one physical repair by the restored
member; it does not claim the complete three-use provider matrix.

The approved 18 November rule replaces historical gradual healing: all supported
structures regain full current HP at canonical win/loss/expiry/abandonment, while
closed combat HP and old receipts remain immutable. There are three successful
paid repairs per accepted reservation, shared across countdown and combat. Price
is the current base-level catalogue increment, without an Engineer discount.

## Checks

- Compose actual accepted bell, two controllers, ordered structure checkpoints,
  shared repair, reconnect/replay and canonical closure in disposable PostgreSQL.
  Invalid/stale/refused requests must preserve funds, HP and allowance. An old
  successful UID after fresh damage must return its receipt without healing.
- Drive the production journal decoder and replay simulation independently for
  two consumers. A live boarder occupying a ruined tower must leave its restored
  footprint while the tower remains standing; disappearance is not egress.
- When a separate isolated provider is available, use its actual authentication,
  API and rendered clients without response interception. Record exactly which
  observations ran. A synthetic report fixture is not provider/browser proof.
- Measure a bounded journal workload, fixed-head paging, payload/storage and
  latency. Separate local sample timings from network or production guarantees.

## Conservative operating plan

The capacity planner consumes measured evidence and explicit operator-supplied
storage/event budgets. It estimates retained journal demand using a configurable
safety multiplier, and returns a blocking result when inputs are invalid or
forecast demand exceeds either budget. There is no invented default retention
period or automatic journal deletion: the only supported action is `retain_all`,
with zero destructive operations. Canonical snapshots, journals, accounting,
receipts, obligations and completion history stay intact. A budget refusal means
review capacity/admission before deployment, not erase history to manufacture
space. Multi-worker HTTP rate buckets are not a durable aggregate event limit.

Broader gameplay balance measurements belong to #512. Full scenario and release
acceptance remain separately tracked by #505 and #513. Evidence reports must keep
failed or unavailable observations explicit and source-qualified.
