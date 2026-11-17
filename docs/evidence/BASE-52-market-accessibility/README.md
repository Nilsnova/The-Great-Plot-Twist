# BASE-52: Harbor contrast and refresh-safe focus

For Johannes Franz Lang (`frcola`); [issue #339](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/339),
[Draft #340](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/340). This is a
local production-component fixture, not a full gameplay or live market capture.

## Sources and original failure

Before application: `1fd16f1fc0055edc832f3a849b6959e77e78ca2b`. After application and
QA helper: `3135da36993aa3292dc751bcad24739b6edeedfc`. The application change is only
the existing Harbor ARIA-disabled opacity, `.5` to `.65`. The affected Harbor and
audit source was unchanged from main `8759fc80`, so these were pre-existing issues.

The coordinator preserves the original full audit unchanged outside the checkout:
`generated-browser-captures/initial-a11y-overlaps/20261106_G8-A11y-Checks.json`,
SHA-256 `7e72e5ea1dec6535533d59acfe9a216cea3f5a31d2cb17b7d073a52eaf927e7a`.
It reports three placed-state contrast failures and four market keyboard failures.
Those keyboard entries keep visible, contained, trapped focus but lose temporary
markers. This probe adds the semantic identity missing from that original report.

## Actual observations

The production market entry uses the declared 100-coin calls fixture. Real controls
place 10 coins on Ether. The reset stake is 5, its minimum. The affected control is
`tidewright-works:less`, named **Less by 5 coins, Ether**.

The browser clock executes the production 15-second interval. Adapter reads increase
from 2 to 3, the old button disconnects, and its focused replacement keeps the same
key without an audit marker. A real Tab moves to `tidewright-works:more`. The old
marker-only audit would fail; the new audit verifies both original semantic identity
and current native order. It also retains count, duplicate-key, positive-index,
visible-focus, containment and trap checks. Polling continues throughout.

Enter on the focusable ARIA-disabled minimum leaves 5 unchanged and does not send
another payment. The control remains `aria-disabled=true`, native `disabled=false`.

| Width | Before contrast / opacity | After contrast / opacity |
|---|---:|---:|
| 1280 | 3.9664425132344356 / 0.5 | 5.606368149075574 / 0.65 |
| 375 | 3.9664425132344356 / 0.5 | 5.606368149075574 / 0.65 |
| 320 | 3.9664425132344356 / 0.5 | 5.606368149075574 / 0.65 |

The project threshold remains 4.5. No disabled-state exception was introduced.
Raw metadata: [before](before/report.json) and [after](after/report.json).

| Native viewport | Before | After |
|---|---|---|
| 1280×720 | [Before](before/market-1280x720.png) | [After](after/market-1280x720.png) |
| 375×812 | [Before](before/market-375x812.png) | [After](after/market-375x812.png) |

The PNGs are copied byte-for-byte from Chromium. No artwork, DOM painting, hidden
controls or screenshot edits are used. Production CSS is loaded in both fixtures.

## Commands and results

From the QA checkout, `node frontend/scripts/market-refresh-probe.js <frontend-root>
<output> before|after` records each source separately. Before mode confirms the
known contrast defect and marker failure; it is not a passing accessibility gate.
After mode requires contrast ≥4.5 and the stronger focus checks. Both probe commands
exit 0; both record zero page exceptions and external requests.

From `frontend/`, `npm test -- --maxWorkers=1 tests/a11y-helpers.test.js
tests/a11y-refresh-focus.test.js tests/a11y-native-controls.test.js tests/harbor`:
**10 files passed, 133 tests passed in 43.51s**. The new negative cases reject
reorders, duplicate keys, inserted/removed/substituted controls, unkeyed replacement
and new positive tabindex. No original timeout or assertion is relaxed.

Full existing `npm run test:a11y`: **33 screens, failures `[]`, errors `[]`, browser
errors `[]`, external requests `[]`, skipped `[]`; exit 0**. All original states,
thresholds and real keyboard traversal remain. In this run the market states passed
32/40/41/40 Tab steps, including 21/8/17/26 replaced controls without old markers;
every step passed original identity, native index, visible focus and containment.
These replacement counts are observations, not fixed timing expectations.

The complete generated report and screenshots are preserved outside source at
`/workspace/village-perimeter-work/base-52-evidence/full-a11y/`; the exact command
log is `/workspace/village-perimeter-work/base-52-a11y.log`. The initial report was
not overwritten. Full after-report SHA-256 is
`d953e0a9525dc756249630ffe9e72ecfa5f03f35056381995de63feca7678919`.
The coordinator owns subsequent integrated client checks.
Physical devices, Safari,
assistive-technology operation and global gameplay performance are not established
by this scoped component evidence. No merge, live migration or deployment occurred.
