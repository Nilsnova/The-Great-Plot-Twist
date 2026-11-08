# Inspection views: navigation and visual review

Client inspection and earned-record changes for Nils. Branch `review/inspection-visuals`, based on `feed250` from `integrate/overflow-1-3`.

## Changed

- Search opened from navigation now offers a native place/item picker from `view.search.spots`, including when `activeSpot` is null and the rehearsal picker is off. The empty prompt is disabled; every supplied real option stays selectable. `inspectSpot` receives the unchanged supplied ID.
- Inspection observations remain full text. Place names, route titles, quoted prices, duration chips and availability messages have distinct visual roles. All route buttons retain the supplied `canStart` state and the existing paid-confirmation intent.
- Running/completed reports appear before route details. **Complete** and the Board action depend on the supplied `job.done`, including when an unfinished display timer reaches zero. Completed reports omit the redundant progress bar, which also avoids showing a misleading 0% bar for an accepted instant search.
- Partners have a working initial empty state and an **Open crew** action. Completed partner reports offer **Open board**. An absent server route/chart no longer produces the invented “At the harbor berth” caption. Reports, status, portraits and native order fields use the same coastal surfaces as other panels.
- Log titles, report text and place/seat/time metadata are separate. Identifier formatting adds no location lookup and leaves supplied prose, names and punctuation intact. An active player's earned log no longer asks them to repeat the intro.
- The accepted Arrival crew action appears before inventory/details. Rewards have a clear balance/ledger/cabinet hierarchy and omit the irrelevant negative Festival filler. Lights' unavailable copy describes current availability. Short refusal pages can scroll while Close remains reachable.

The scoped stylesheet is imported by the existing lazy case-screen controller. No world art, story source, secret content, route permissions, prices, timers, completions, wallet calculations, rewards grants, server routes or dependencies changed.

## Verification

```sh
cd frontend
npx vitest run tests/inspection-guidance.test.js tests/case-controls-stability.test.js tests/partner-empty-state.test.js tests/partner-life-screen.test.js tests/log.test.js tests/rewards.test.js tests/case-search.test.js tests/g9-arrival-presentation.test.js --maxWorkers=1
INSPECTION_CAPTURES=/tmp/inspection-visual-audit node scripts/check-inspection-views.js
```

- 36 focused tests pass across 8 files. The new Search, partner-chart and log regressions failed against the original implementation; the initial empty-partner regression also failed before its fix.
- Independent source review is clear. The reviewer separately ran 15 pure case-search, log and rewards tests.
- The component audit covers 20 states at 1280×800, 375×667, 320×568, 844×390 and 375×400: 100 layouts, including long supplied reports, waiting/completed searches, locked/empty routes, idle/busy/completed/empty partners, earned/empty logs, ready/unavailable rewards, ready/pending arrival, Lights phases and a connection refusal.
- The harness loads the actual `base.css` first and shared panel styles before case components. Native hidden semantics are respected. It starts Chromium with GPU disabled and never loads the world renderer or contacts a live service.
- All 100 layouts pass viewport fit, horizontal overflow, header/navigation/content separation, a reachable Close target, 44px native targets, visible keyboard wrap, readable font sizes and a 7:1 measured HTML text contrast gate. The measured minimum is 7.12:1. Disabled text and canvas/image contrast remain separate from that HTML measurement.

[Capture checks](../../frontend/captures/20261108_inspection/checks.json) and representative screenshots are committed. Captures were visually inspected through the image viewer across every requested viewport size. Full-world integration, production deployment, physical phones and screen-reader speech remain the integration owner's checks.

No push, live settings, database or deployment changes were made by this branch.
