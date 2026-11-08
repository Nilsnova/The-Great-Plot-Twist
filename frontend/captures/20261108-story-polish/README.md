# Story dialogue visual review

These are the actual intro controller, public story and production styles in a DOM-only fixture. The gradient and background room prompt are inspection fixtures; these images do not claim a world-renderer or live-service playtest. Chromium ran with GPU and software rasterization disabled.

The two `before-` images show the previous wrapped Journal footer and the journal overlapping its footer. The other 20 images cover passage, choices, writing-desk choices and journal at 320×568, 375×667, 844×390, 1280×720 and 320×400.

The patch makes the story surface opaque, keeps Journal and **Back to island** on one line, clears the journal footer and places a single Continue beside the footer. The outer 330px/420px frames and 19px passage text stay unchanged. A small padding adjustment keeps the complete current passage visible at 320×400.

Verification:

- `node frontend/scripts/check-story-polish.js`: 112 checks, including complete current passages, stable frames, 44px controls, keyboard journal scrolling/focus and Show full text.
- Existing `check-intro-pages.js`: 77 checks, including both original endings, replay/restart, held confirm and disabled choices.
- Four focused intro test files: 26 tests.
- `node scripts/text-lint/index.mjs`: zero errors, 38 existing report-only findings.

The relevant scripts and tests used a GPU-disabled Chromium wrapper. Protected story data and game rules were not changed. The current full-world golden run and hardware performance remain separate checks.
