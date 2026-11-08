# Settings and supporting screens · visual audit · 8 Nov 2026

Branch `review/visual-settings` starts from integrated checkpoint `feed250`.
Nils requested an actual visual review of every settings/supporting screen and pleasant
navigation. This audit uses real components and screenshots, without the game renderer.

## Findings and changes

- Settings used only a narrow column on desktop and showed no numeric volume values.
  It now uses two columns when space permits. Native volume sliders have fixed-width,
  tabular percentage outputs; accessible labels and `aria-valuetext` remain on the slider,
  and visual outputs are hidden from assistive technology to avoid duplicate announcements.
- Settings required scrolling to the bottom for Back. Its existing Close action is now
  visible in the header. Credits also gets a pinned header with that existing action,
  a bounded body scroller and readable team/attribution sections.
- The shortcuts overlay kept the old square frame/Courier style. It now shares the
  teal/brass/serif-header presentation and has a pinned Close control.
- The Account body reset itself to Courier after lazy loading. Its scoped system font
  now survives that ordering. Generic button specificity also erased the visual distinction
  between Confirm deletion and Keep my data; deletion actions now have a distinct warm red
  surface. All deletion/legal copy remains present.
- The long nearby-captain option clipped at 320px. Its display label is now
  `Everyone · up to 8`; the stored option value and existing limit are unchanged.
- Settings, shortcuts and public help now describe tap-to-walk and the visible Inspect action.
- How to play still claimed online accounts/mystery were unconnected, sports was closed
  and an AI hint assistant was coming. It now describes the signed-in save/kit/crew flow,
  available sports states, and removes the discarded AI feature.
- Help/privacy metadata was below 16px and privacy links below 44px. These pages now
  retain readable metadata and full-size targets, with all notices, attribution and
  play-money/legal guidance preserved. The help guide also shares the game's readable theme.

## Integration seam

The new `src/ui/settings-polish.css` is imported by the lazy Settings view and shortcuts
module. Add `import '../../ui/settings-polish.css';` to `src/screens/account/index.js`
when integrating, so an Account-first open receives its font/action refinements too.
Do not import the stylesheet into the cold title entry or base kit.

Initial Account/Credits focus was a separate real issue: focusing the first body action/link
scrolled past the introduction/save summary on phones. The guidance agent owns the
`account-host.js`/Credits focus correction and its regressions. This branch preserves all
existing action/refusal/deletion-cancel focus behavior and does not change those files.

## Verification

- `npm run build` passed, including the spoiler guard.
- `node scripts/report-budget.js --check` passed: cold title **21,008 B JS / 11,878 B CSS**,
  title image 274,026 B. New styles remain deferred.
- Targeted preference-owner, preferences, credits and help tests: **13 passed in 4 files**.
- `node scripts/check-settings-visuals.js`: **75 screenshots/states** at 1280×800,
  375×667, 320×568, 844×390 and short 375×400. Actual base/kit/shell/owner CSS is loaded,
  including global box sizing and hidden rules. Chromium runs with GPU and WebGL disabled.
  Native menu/Account/shortcuts components and standalone pages are used, with local account
  fixtures and intercepted API calls; no real account/save/provider writes occur.
- The DOM check verifies containment, horizontal overflow, **16px text**, **44px targets**,
  and **7:1 text contrast**. It exercises slider Home/End and visible percentage/accessible
  values, fixed output positioning, Help search/Clear, Credits → Settings → Title Escape
  navigation, and Close from a paused game's Settings returning to Pause.
- Baseline evidence contains 70 states; polished evidence contains 75. Screenshots for
  Settings, Credits, shortcuts, Help, Privacy and Account deletion were individually
  inspected at all five sizes, with extra controls/footer/search images inspected.
  The headless fixture background is intentionally plain; these images do not prove
  appearance over the live island or actual OAuth/cloud saves.

Local evidence is in `frontend/captures/settings-baseline/` and
`frontend/captures/settings-polished/` (not committed). The parent integration writer owns
the complete-world playthrough, merged accessibility run, production verification and push.
