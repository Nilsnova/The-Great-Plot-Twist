# VIS52: responsive Goals and toast clearance

Responsible human: Johannes Franz Lang (`frcola`). [Issue #419](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/419), [Draft #420](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/420).

## Actual before failure

The unchanged native overlap audit at `52f6bb158b03188b57260c1872e273391598debf`
reported Goals/toast intersections at **390×844 (366×11px)** and **844×390
(538×13px)**. The two-row purse moves Goals below both top controls. Their
bottom is 183/185px, while the responsive toast rule still starts at 172px.
The wide-screen island-toast state and wave-toast states passed their existing
checks. This is a real visible-box failure, not a relaxed audit observer.

The [original report](before/report.json), [command log](overlap-command.log)
and [completed coordinator report](coordinator-checks-52.json) retain their exact
source and results. The coordinator report includes other checks with their own
outcomes; it does not establish a complete-suite pass.

| Unchanged actual before | Image |
|---|---|
| Desktop 1280×720 | [PNG](before/island-toast-1280x720.png) |
| Portrait 390×844 | [PNG](before/island-toast-390x844.png) |
| Landscape 844×390 | [PNG](before/island-toast-844x390.png) |

The [manifest](manifest.json) proves the copied byte hashes and native PNG
dimensions. The original full-game audit does not include a 375×812 image;
the real-DOM component comparison below supplies that required review size.

## Native component before and after

The same new regression helper (SHA-256 `02d4a240d44b96dce9e01ec23408bdce8e741b77c37981117f27238512ec862b`)
ran against two isolated source snapshots. The before checkout is the actual
`52f6bb15` runtime plus that identical, untracked test helper; it does not
pretend the helper already existed in that commit. The after checkout is
`ea87f88283dc999670e45f7c98bb0535d21c3c7a`, frontend source tree
`d76918ec05735c46c9cda4a55cc495e28bfa0d5a`.

These are unchanged native component screenshots of the actual HUD, Goals and
toast code on the declared component background. They are separate from the
full-game images above and the coordinator's complete village captures. The
fixture declares 7,180 coins and best wave 40; it makes no gameplay or balance
claim. All four sizes are captured before any geometry assertion can stop the
run. No image is edited or resized.

| Native component size | Before | After |
|---|---|---|
| 1280×720 | [PNG](component/before/island-toast-1280x720.png) | [PNG](component/after/island-toast-1280x720.png) |
| 375×812 | [PNG](component/before/island-toast-375x812.png) | [PNG](component/after/island-toast-375x812.png) |
| 390×844 | [PNG](component/before/island-toast-390x844.png) | [PNG](component/after/island-toast-390x844.png) |
| 844×390 | [PNG](component/before/island-toast-844x390.png) | [PNG](component/after/island-toast-844x390.png) |

Exact command, with `VIS52_SHOTS_DIR` set to each isolated output folder and
`CHROME_PATH=/usr/bin/chromium`:

~~~bash
npm test -- --maxWorkers=1 tests/ui/toast-clearance.test.js --reporter=verbose
~~~

The [before result](component/before/result.json) and [log](component/before/native.log)
record **3 failed (3), 9.00s**, process 11.54s. The failures are genuine measured
gaps of −11.296875px, −126.453125px after a hint, and −11.296875px after a card.
The [after result](component/after/result.json) and [log](component/after/native.log)
record **3 passed (3), 8.92s**, process 10.03s. No assertion was removed or
relaxed between these runs. Both browser processes closed, with zero live
Chrome processes before the writer explicitly released the coordinator's slot.

## Small implementation

Source `46fe08ab4c622234086350b269138834f6286c38` reuses the HUD's existing
`measureHeader` and ResizeObserver. It also watches the actual Goals strip,
publishing its layout bottom plus 10px on the document root so the game's
popover toast inherits the value. At widths up to 900px, toasts use the larger
of that measurement and the existing 172px minimum. Existing wave/break and
modal selectors retain their greater specificity and placement behavior.

Rendering a new goal or changing bare/management mode updates spacing
synchronously. Hint and fold changes trigger the same native size observer.
`visibility:hidden` still reserves a layout box beneath an existing card, so
closing it needs no new size event. Display-none, hidden or zero-size Goals
reserve nothing. Disposal disconnects the observer, removes the shared value
and guards a callback already queued before disconnect.

No goal is hidden to make the check pass. Text, touch targets, gameplay,
placement, prices, HP, assets and packages are unchanged.

## Verification boundary

- Node syntax checks for HUD/test and `git diff --check` passed.
- Independent implemented-source review found no concrete blocker.
- Three real-DOM tests passed and exercise the two-row purse at four sizes, hint/fold
  changes without window resizing, a real visibility-hidden shell card,
  managing/bare reset and a queued callback after disposal. They preserve the
  native ResizeObserver through a recording subclass.
- The root granted a bounded Chrome slot for these exact red/green native
  component checks. The writer closed both runs and released that slot.
- No complete-suite, unchanged full-game overlap-matrix after run, build,
  physical device, Safari or final human visual acceptance is claimed here.

The coordinator must run the unchanged full-game overlap audit and applicable
combined checks, then report their exact new source and result lines. The
native component pair is supporting UI evidence; keep the PR Draft for those
combined gates and human review.

## Explain-back

The notification needs to follow the space that Goals really use. Guessing
another fixed top would break again when a label wraps or its hint opens.
The existing observer already owns HUD sizing, so it can watch that box too
without a new per-frame measurement loop. The game already guards `setBare`
against unchanged values. Removing the HUD also removes its spacing value.

Before marking Ready, answer:

1. Why does a wrapped hint require a measured bottom rather than another fixed top?
2. Why does `visibility:hidden` reserve space while `display:none` does not?
3. What stops a queued observer callback from restoring stale spacing after disposal?

No PR was merged to main, no deployment or live migration was performed, and no
human current-head approval is implied by the source review.
