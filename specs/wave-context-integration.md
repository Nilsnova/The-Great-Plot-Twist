# Stale wave response integration

Integrates the existing VIS-41 fix with current recovery waves; used by the coordinating teammate and reviewer.

Tracking issue: [#397](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/397). Existing draft:
[PR #398](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/398).
Integration branch: `fix/wave-context-integration`, based on `origin/main` at `48aee0e7b34c879968c4bc606b543f911032adfa`.

The context/lookup generation implementation and its 25 standalone race tests are reused from
Johannes Franz Lang's (`frcola`, `83476@novasbe.pt`) scoped commits `b584fec2`, `3f985bb6` and
`0b9938da` in PR #398, relative to its frozen review base `9f47c142`.
This integration does not include that candidate's separate village/core work. Retain Johannes's
authorship credit when publishing these changes. Responsible teammate for this integration:
Ianno Hollensteiner (`Iannomh123456`), assisted by Codex.

## Goal and acceptance

- A pending start, join or current-wave read from an island that was left cannot start or replace the current battle.
- Reset and an accepted newer context invalidate old replies before and after defense preparation.
- A recovery close cannot be undone by a pending current-wave read.
- Leaving keeps the server's wave running for the other players.
- A stale successful bell reply does not close the new island's card.
- A new island can ring its bell while an old request waits; the old completion cannot free the new request's busy state.
- An old wave's receipt updates wallet and win events while the next wave remains reserved: no teardown unlock or repair-complete toast.
- The current wave's receipt still opens its own break after `ended()` clears it.

## Scope and contracts

The original PR changes `frontend/src/island/wave-flow.js` and the standalone deferred race tests.
Current main's recovery `ended()` and `release()` stay available. The integration covers recovery
close invalidation, the bell caller's UI and busy state, and the island's receipt consumer.
Locally superseded admission replies retain the API answer with `ignored: true`; the bell UI skips those replies.
No API, database, dependency, wallet rule or server lifecycle contract changes.

## Evidence and handover

- Before source integration: `npm --prefix frontend test -- tests/island/wave-flow-races.test.js --maxWorkers=1`
  failed with **21 failed, 4 passed (25)** on current main.
- After applying the original source patch: the race suite and existing flow suite passed **34/34**.
- Before the added integration fixes: recovery-close and reset/busy regressions failed **2/2**.
- Two actual Chromium component regressions then failed **2/2**: a stale bell reply closed the newer
  build card; an old receipt enabled teardown during the next wave. Their assertions pass with the fixes.
- `cd frontend && npm test -- tests/island/wave-flow-races.test.js tests/island/wave-flow.test.js tests/island/wave-context-integration.test.js tests/island/wave-context-dom.test.js --maxWorkers=1`:
  **4 files, 38 tests passed**.
- Surrounding checks, `cd frontend && npm test -- tests/island/dom.test.js tests/island/demolish-dom.test.js tests/pirates/recovery-wave-end.test.js tests/pirates/recovery-controller.test.js tests/ui/first-quests.test.js --maxWorkers=1`:
  **5 files, 35 tests passed**.
- `cd frontend && npm run build`: passed, including the spoiler guard (**243 text files, 12 protected lines**).
- `cd frontend && node scripts/report-budget.js --check`: passed. Initial JavaScript **18,899 bytes**
  (limit 21,080), CSS **9,410 bytes** (limit 12,000), no title image or unshipped files.
- `node --check frontend/src/island/wave-flow.js`, `node --check frontend/src/island/index.js`
  and `git diff --check`: passed.

The browser evidence exercises real island cards in isolated Chromium with the existing fake transport.
It does not establish live multiplayer, hosted database behavior, physical-phone behavior or deployment.
Combined frontend, SQL, build and browser results are in the
[integration handover](../docs/handoff/coop-wave-consistency-2026-11-18.md), including the same
late multiplayer pose failure on unchanged main. Independent agent source review found no
concrete blocker; it does not establish human approval or completion of the teammate's explain-back.

The original integration checkpoint made no commit, push, merge or deployment. Its remaining
context corrections are included in the authorized `fix/coop-wave-consistency-review` draft;
the already merged PR #398 remains credited to Johannes. No merge or deployment is performed.
