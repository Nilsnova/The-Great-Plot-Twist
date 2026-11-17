# WALL-26 · Quoted wall construction and safe retries

> **What this is:** Client transport and a lifecycle-owned wall drafting controller.
>
> **Who uses it:** WALL-27's real island controls; the server remains authoritative.

- **Status:** in progress; tests precede runtime implementation.
- **Responsible teammate:** Johannes Franz Lang (`frcola`).
- **Issue:** [WALL-26 #280](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/280).
- **Branch:** `feat/wall-26-builder-controller`, stacked on the working-camera draft.

## Contract and scope

Adapters: `enableWalls({code?})`, `quoteWalls({cells,code?})`, `buildWalls({placements,actionUid,code?})`. Responses use the existing `{ok,status,data}` / normalized failure convention. Quote cells and returned ID-position pairing stay ordered. Malformed quotes/receipts are unreadable outcomes, never success.

The controller snaps the first cell to the half-unit grid. Further taps append cardinal two-unit edge-sharing runs and allow turns, up to 32 pieces. It shows unchecked drafts until an authoritative quote succeeds. The quote is invalidated by edits. Confirm freezes the exact placements, cost and one UID before posting. An unknown build outcome retains that immutable intent even after closing/reopening; only its retry is allowed until reconciled. Late responses do not repaint a changed scope or disposed session. Clear refusals permit a fresh quote. No client permission, money, unlock or placement authority is added.

Likely files: `frontend/src/island/wall-builder-api.js`, `wall-builder-mode.js`, focused tests, this spec and roadmap handover. WALL-27 owns actual DOM, ghost rendering and index integration. API/SQL and fake-transport writers remain separate owners.

## Cases and proof

Tests cover snapped runs/turns, overlap/limits, exact quote pairing, quote errors, malformed receipt, double confirm, unknown response/same-UID retry, cancel/reopen while pending, stale island/epoch response and disposal. Focused checks are run here; combined build/browser/capture checks use one coordinated lane. No UI or running-game result is claimed by this controller alone.

## Explain-back

The quote associates each real wall ID with one cell and price. A timeout does not reveal whether payment committed, so the next request must repeat the same identity rather than create another purchase. Scope/session checks control only display; the server checks permission before replay and returns current state separately from the historical receipt.

Questions: Why retain both UID and intent? What can a green ghost prove? Why can an accepted late response still be inappropriate for the current screen?

No new dependency, migration application, live activation or merge. Different-human review and Johannes's explain-back remain pending.
