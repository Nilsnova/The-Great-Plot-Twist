# S — story and mystery

Used by the story presenter and [S drills](../drills/S.md). This page explains mechanisms without the case solution. Server-only case data is deliberately not reproduced.

## What the player gets

The Lighthouse introduction presents locations, inventory and legal choices. The four introductory world hooks open the connected intro; Continue replays the browser's accepted action journal. Later case screens include boards, search, discussion and end-state presentation against an adapter contract. Those screens have a local rehearsal adapter, but their normal production adapter is unavailable: the full authoritative online mystery is not connected merely because the screens exist.

## Files and data flow

| Responsibility | Files |
| --- | --- |
| Pure mirrored rules | `backend/plot_twist/engine.py`, `frontend/src/story/engine.js` |
| Public intro data | `backend/content/story.json`, `frontend/src/demo/intro-story.json` |
| Intro transport, journal, replay/navigation | `frontend/src/story/intro.js`, `intro-adapter.js`, `storage.js`, `saves.js` in that folder |
| Public data boundary | `backend/server/routes/content.py` (`PUBLIC_CONTENT`) |
| Authoritative intro judging | `backend/server/game/referee.py`, `backend/server/routes/intro.py`, `backend/server/game/entry_kits.py` |
| Case presentation contract | `frontend/src/adapter/contract.js`, `bridge.js`, `unavailable.js`, `frontend/src/screens/` |

World interaction → intro fetch with bounded wait/retry → adapter view → engine checks action conditions → accepted action updates state and journal → UI refresh. Continue rebuilds the state by replaying actions. Navigation searches legal movement-only edges and tests a candidate replay before replacing the current state/log; it does not teleport or silently collect items.

The server separately receives a bounded action log → replays trusted Python rules/content → verifies completion → derives the entry kit → asks the constrained database function to grant it safely once. A client ending, button or fake answer is not authority (D003). Public content uses a fixed symbolic allowlist; arbitrary filesystem paths are refused.

## Evidence

From `backend/`:

```bash
uv run --locked pytest plot_twist/tests -rs
uv run --locked pytest server/tests/test_content.py server/tests/test_referee.py server/tests/test_intro_route.py
```

From `frontend/`:

```bash
npm test -- tests/story-engine.test.js tests/story-engine-rules.test.js tests/intro-adapter.test.js tests/case-boundary.test.js tests/case-board.test.js tests/case-search.test.js tests/case-night.test.js tests/case-reveal.test.js
npm run build
```

Parity tests execute equal move sequences in Python and JavaScript, comparing accepted/refused moves and resulting views. Node must be present: inspect the `-rs` output rather than counting a skipped parity test as a pass. Route tests protect public-content boundaries and reject invented/non-final intro logs. Screen tests prove view/adapter behavior; the build's fingerprint guard checks specific protected prose, not every conceivable leak.

## Known limits

- Local browser journals and rehearsals are not cloud saves, shared cases or awards.
- Rehearsal case data is illustrative, not an authoritative deduction/reward source.
- `frontend/src/story/README.md` still says nothing connects the engines; the intro is now wired, while the later online case remains disconnected.
- Do not use later case workshop screens during the spoiler-safe class demo. Use only the [approved coastal visuals](../PRESENTER-SCRIPT.md).
