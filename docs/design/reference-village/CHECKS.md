# Checks, source and evidence boundaries

This is a documentation and task-planning change. Repository policy requires content/link checks for it, rather than a full application test/build rerun. Existing-behavior checks below were run to ground the audit; none proves the unimplemented target features.

## Planning and publication

- English task records: 32 Village Visuals + 24 Wall Gameplay = 56 new leaf tasks, with goals, likely files, dependencies, bounded plans, acceptance, failure cases, verification and explain-back questions.
- Independently counted: 173 input/action/expected cases, 168 explain-back questions and 325 acceptance checks.
- Default, selected-image and selected-cohort-plus-image graphs: PASS; optional wall capacity/batch work is not a hard ancestor of the core wall gate.
- Local Markdown links: 67 resolved in the final content pass, including this file.
- JSON parsing, task count/IDs, neutral visible prose, GFM table shape, PNG dimensions and target-generation byte identity: PASS.
- `git diff --check`: PASS.
- All 50 earlier BASE issues retain their existing numbers, URLs, states, assignees and labels. Actual historical source paths/branches are deliberately preserved.
- Final GitHub read-back and native hierarchy counts are recorded in [VERIFICATION.json](VERIFICATION.json). Proposed/open issues are not completed features. Check live claims again before assigning work.

## Existing baseline tests

Source: `724bbc41de5754007a9bcc27a5e84758540b540b`, a separate detached checkout. The documentation branch starts from `569d8fda3474cb84af36af190853d1a0e02b7abf`; its only intervening main change is `scripts/cleanup-branches.sh`, with no runtime difference from the tested source.

Executed from that baseline's `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/placement.test.js tests/island/wall-connections.test.js tests/pirates/pathing.test.js tests/pirates/pathing-wiring.test.js tests/pirates/battle-guide.test.js tests/pirates/wall-blocking.test.js
```

Exact result lines:

```text
Test Files  6 passed (6)
     Tests  75 passed (75)
  Duration  3.85s (tests 59%, transform 23%, import 17%, worker 1%)
```

Exit 0; wrapper elapsed 5.22 seconds. These cover existing placement, wall connections, pathing, guide and blocking behavior. They are not a free-grid implementation, SQL concurrency, expanded-capacity or target-style pass.

## Actual browser baseline

The existing real-game capture helper was run with declared local fake API data at **1280×720** and **375×812**. It built the fixture through existing controls, checked actual Exit hit testing and long-refusal reflow/camera fit, and recorded **0 page errors** and **0 external requests** at each size. The external QA helper selected the existing quality preference for the published high-quality images; no app source or screenshot pixels were edited. [COMPARISON.json](COMPARISON.json) records capture-time renderer density, source and transport.

These are local Chromium captures with 19 fixture structures, not production progress, Safari or physical-phone evidence. The generated target is a design illustration, not a running-game after screenshot. There is no implemented target-phone capture yet.

## Not run or claimed

No full frontend suite/build/budget/accessibility/demo rerun, backend suite, new scratch SQL/concurrency proof, migration application, live flag activation, production deployment, Safari/physical-device check or target-feature acceptance is claimed for this documentation-only change. Applicable implementation tasks must run their own checks against their actual source and report failures honestly. No merge was performed.
