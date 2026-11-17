# WALL-33 — paid construction and receipt reconciliation

For Johannes Franz Lang (`frcola`), [issue #301](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/301). This bounded second API slice is stacked on [enable/quote Draft #302](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/302).

Plan: strict posted placements/quote/epoch/UID; resolve current permission; look up the original immutable receipt before flags/current eligibility; return matching past receipt plus fresh current island; otherwise gate new offers, revalidate current canonical quote/epoch and pass bounded items/raw-layout/role/wave fences to atomic SQL. Refusals stay truthful. A timeout retains original UID/intent; no automatic new charge, reconstruction or receipt rewriting.

Owned: wall_build.py, routes/island_walls.py, shared fake and focused tests. SQL is separately reviewed in WALL-12. No package, live migration application, activation, deployment or merge. Implementation/checks pending; walkthrough and independent human review remain.
