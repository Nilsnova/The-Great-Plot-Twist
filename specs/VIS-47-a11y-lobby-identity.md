# VIS-47 — Refresh-aware lobby audit identity

Responsible teammate: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`). Child of VIS-31 #236; tracks #409.

Claim recorded before source edits on `test/vis-47-lobby-refresh-identity`, based on frozen coordinated candidate `6e2c3e8`. Stacked Draft base: `review/vis47-a11y-6e2c3e8`.

The real audit's sole failure is lobby keyboard identity after a render replaces Start and Look around first. All five actual controls, containment, visible focus, count and trap checks pass. Reuse semantic refresh identity in the audit while retaining strict native order, action identity, duplicate/count/visibility/trap/timeout checks. No product runtime changes absent a real runtime bug. Pure regressions and syntax/diff checks only; another agent holds the sole Chrome lease.

## Changed

Only the lobby audit opts into existing `data-focus` action identity. Its readonly Game link uses its existing explicit `aria-label`; action and readonly-field keys have separate namespaces so an editable/action replacement cannot impersonate that field. The selected mode travels in the audit snapshot. Other screens retain the existing `data-key` behavior, and genuinely unkeyed controls such as Close retain strict original-node stamps. No replacement node inherits a temporary audit stamp.

The actual lobby render rebuilds the whole body. Its regression therefore replaces link, Copy, Start and Look around first together, preserving only the modal Close control. Tag/type, semantic route, duplicate keys, native index/count, positive tabindex, containment and visible-focus checks remain unchanged. The audit still executes the same real Tab/trap/visibility/count/timeout assertions.

## Verified

- Initial new pure checks failed before source changes: `Tests 3 failed | 22 passed (25)`.
- Independent source review identified full-body replacement of the named readonly link; the expanded fixture and named-field guards failed before that final addition: `Tests 3 failed | 24 passed (27)`.
- `cd frontend && npm test -- --run tests/a11y-refresh-focus.test.js tests/a11y-helpers.test.js --maxWorkers=1`: `Test Files 2 passed (2)`; `Tests 51 passed (51)` (1.01s).
- `node --check frontend/scripts/a11y-helpers.js`, `node --check frontend/scripts/check-a11y.js` and `git diff --check`: exit 0, no output.
- Existing pure assertions are preserved. New negatives cover action reorder/substitution/duplicates, insertion/removal, tag/type changes, missing semantic keys, wrong index, invisible focus, changed field label/lost readonly, category spoofing, duplicate named fields and unchanged strict default behavior.
- Final independent agent source review found no identity regression; agent review does not replace human approval.

## Not verified / remaining

No Chrome, full a11y, native controls suite, full frontend suite, build, live backend or deployment in this slice. The coordinator must rerun the real audit after integration; these pure checks do not establish a browser pass. Keep Draft for that evidence, Johannes's explain-back and a different human's review. No merge/deployment.

Explain-back prompts: Why can a fresh DOM node be the same semantic action but lose an audit stamp? Why must names/order/count still match instead of restamping replacements? Why is the readonly Game link identity opt-in and distinct from action keys?
