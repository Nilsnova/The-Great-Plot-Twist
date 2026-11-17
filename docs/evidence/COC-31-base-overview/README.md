# COC-31 preliminary visual evidence

These are real Chromium screenshots of the integrated game using its local fake island transport. They are not generated concepts and do not show production data. The before comparison is the unchanged single-building detail card; the after comparison is the new overview at the same prepared island state. **The first captures still have an unrelated arrival-cutscene backdrop. Clean regeneration is pending the coordinated browser slot; these images are preliminary, not final visual acceptance.**

| Viewport | Before | After |
|---|---|---|
| 1280 × 720 | [Single detail](before-1280x720.png) | [Base overview](after-1280x720.png) |
| 375 × 812 | [Single detail](before-375x812.png) | [Base overview](after-375x812.png) |

Reproduce from `frontend/`:

```bash
node scripts/capture-base-overview.js ../docs/evidence/COC-31-base-overview
```

The capture uses real game/card rendering, existing fake build/upgrade commands, the existing arrival-seen key for a returning-player fixture, normal Skip controls for optional queued narration, and the new public overview opener used by its menu entry. It asserts no open arrival cutscene, seven rendered building rows, no horizontal document overflow and zero page exceptions. The [report.json](report.json) currently records the first, less strict run; it does not prove that the added clean-backdrop assertion passed.

The overview is scrollable when seven rows cannot fit on a phone. The screenshot is the first visible part of that scrollable card. Tests separately verify both filters, no-match feedback, focus retention, zero overview POST writes and accepted data refreshes.

Limits: local fake API, Chromium, two viewports. This evidence does not establish Safari, physical-touch-device or production-backend behavior.
