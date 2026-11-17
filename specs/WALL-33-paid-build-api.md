# WALL-33 — paid construction and receipt reconciliation

For Johannes Franz Lang (`frcola`), [issue #301](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/301). This bounded second API slice is stacked on [enable/quote Draft #302](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/302).

Plan: strict posted placements/quote/epoch/UID; resolve current permission; look up the original immutable receipt before flags/current eligibility; return matching past receipt plus fresh current island; otherwise gate new offers, revalidate current canonical quote/epoch and pass bounded items/raw-layout/role/wave fences to atomic SQL. Refusals stay truthful. A timeout retains original UID/intent; no automatic new charge, reconstruction or receipt rewriting.

Owned: wall_build.py, routes/island_walls.py, shared fake and focused tests. SQL is separately reviewed in WALL-12. No package, live migration application, activation, deployment or merge. Implementation/checks pending; walkthrough and independent human review remain.

## Implemented and verified

Implemented in Draft [#308](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/308). `POST /api/island/walls/build` accepts strict bounded placements, quotedTotal, actionUid and the quoted islandEpoch. It resolves current permission before private receipt lookup. A matching old receipt returns with a separately refreshed current island even after offer pause/reset; new requests revalidate current canonical IDs, cells, price, payer role, owner progress and reset scope before the atomic SQL call.

Receipt responses are validated against the exact posted intent. A missing or malformed receipt RPC never authorizes a new charge. The full 64-character UID is passed unchanged; SQL owns distinct per-piece refs and all-or-nothing payment. This Python layer does not rewrite receipts, reapply old pieces or infer that a timeout cancelled the transaction.

Executed from backend with workspace uv cache and the existing project environment:

```sh
uv run --frozen --no-env-file pytest -q server/tests/test_wall_build_routes.py server/tests/test_wall_offer_routes.py server/tests/test_wall_layout_snapshot.py server/tests/test_owner_wall_policy_routes.py server/tests/test_wall_chain.py
uv run --frozen --no-env-file ruff check .
uv run --frozen --no-env-file ruff format --check server/island/wall_build.py server/routes/island_walls.py server/tests/island_helpers.py server/tests/test_wall_build_routes.py
```

Results: **83 passed in 4.38s**, Ruff **All checks passed!**, format **4 files already formatted**; `git diff --check` passed. Cases include full UID/ordered items, lost committed reply then reset/paused offers, changed original intent, fresh role/epoch changes with identical empty layout, permission before receipt, SQL refusal translation, unavailable receipt RPC and strict client-authority shape.

These fake-transport tests prove API semantics and handoff arguments, not real SQL payment/concurrency or browser behavior. Real SQL verification belongs to the separately reviewed WALL-12 slice; complete desktop/phone lifecycle and independent human review remain. No live migration application, activation, deployment or merge.

Explain-back: I ask whether this exact action already committed before checking today's prices or build eligibility. That lets a lost old reply be reconciled safely. The receipt describes past payment, while the separate island describes what exists now. A new action must match the current quoted epoch and state before SQL can charge it.

Questions: Why must receipt lookup precede current eligibility? Why return receipt and current island separately? Why can a timeout not safely generate a replacement UID?
