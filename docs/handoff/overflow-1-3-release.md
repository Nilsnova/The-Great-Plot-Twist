# Overflow 1–3 and mobile walking · 8 November 2026

Nils authorized the first three G9 overflow items, reliable phone walking and nicer open-panel visuals. Integration starts from published G9 core `dda021b` (production runtime `ee92ca8`) so releasing this work preserves the live account, cloud-save, crew and case adapter.

## Delivered

1. Playtest findings: cloud-save recovery now reads fresh server state; an uncertain action keeps its idempotency key through a later rate limit; account actions stop processing after logout/account changes, including the intro ledger boundary. Each defect had a failing regression before its fix.
2. Accessibility: account cancellation/background refresh retain useful focus; modal Tab order respects disabled fieldsets, negative tabindex and radio groups; board countdowns announce state transitions instead of every tick.
3. Five contextual first-time hints: account, completed-story kit confirmation, crew, earned signal station and first pin. One quiet card appears after two seconds of idle exploration; it pauses during movement, controls, rooms and overlays. What next uses the same rules and device dismissals. These hints open existing UI only on an explicit click and never grant progress.

Account, case pages, Settings, Exchange, predictions, Arena, Sports and Islet now use shared teal surfaces, brass headings, readable system text, rounded cards, clear tabs and contained scrolling. Styles load with their owners, outside the cold title.

Phones support tapping a clear map path or floor to walk, plus the existing movement stick and room D-pad. Bounded local pathfinding uses the same terrain/furniture/building collision checks as manual movement; the ordinary controller moves the player. Manual input, overlays, lost/cancelled touch capture, multiple fingers, blur, visibility changes, travel, room changes and disposal cancel routes. Markers are static and decorative. The movement stick has a visible label; version information remains in Settings/reports while its world badge is hidden on touch devices.

## Review and verification

Independent reviewers checked the G9 auth/account/crew core, complete case contract, and final mobile/onboarding integration. The mobile review found and fixed queued-frame cancellation, secondary capture loss and a room detour bound before release.

- Full frontend suite: **3,676 tests in 247 files passed**.
- Real Chromium CDP touch input at 375×667, 320×568 and 844×390: **36 checks passed**, including map arrival/stop, menu cancellation, held/released joystick, floor taps and nonoverlapping fixture hint/HUD/interaction prompt. See `frontend/captures/20261108-mobile-walking/`.
- Open panels: **48 layouts** across 12 real component fixtures passed; palette contrast at least 7.12:1. Representative screenshots were inspected. See the separate open-panel handoff for scope.
- Cold title: **21,008 JavaScript bytes / 11,878 CSS bytes**, below unchanged 21,080 / 12,000 caps. Settings preload metadata now stays in the existing lazy world loader.
- Final focused input/onboarding rerun: **40 tests passed**; documented `test:input` gate: **56 tests passed**.
- Text lint: **0 editable diagnostics**, 38 existing report-only notices.
- Build and spoiler guard passed: 188 text files, 12 protected lines.

- Integrated accessibility: **61 screens passed**, no failures, browser exceptions or external requests; includes keyboard order, focus return, contrast, 44px targets, short viewports and reduced motion.

- Strict CSP: five production pages and the recorded tour passed with zero violations or external asset requests.
- Production static smoke check: all seven checks passed, including Settings, saved quality, focus restoration and chart travel.

Recorded online-failure / golden-journey checks and deployment verification are still running at this integration checkpoint.

## Scope and limits

No backend, migration, feature flag, provider, secret, workflow or Vercel configuration change. No AI companion was restored. No real account, cloud progress, crew or database state was written during tests.

The browser checks use local recorded/synthetic responses. They do not prove a real OAuth/crew journey, physical iPhone/Android input, VoiceOver or other browser engines. Existing SwiftShader cinematic/storm performance limitations remain separate hardware proofs; this work does not raise their budgets or loosen their thresholds.
