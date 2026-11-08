# Player experience and visual scrutiny · 8 November 2026

Nils requested a deeper review of Settings and every inspection screen, clear guidance and a pleasant playthrough. This follow-up builds on the first three overflow items and the mobile-walking release.

## Changes

- Friends now offers the actual next action: Account, start/resume the opening story, or resume and open Crew. The primary action and Back fit at 320×400; instructions are optional. Async navigation checks the current account and overlays before opening Crew.
- Live What next now reads earned server capabilities instead of an empty extension. Up to three steps have their action inside each card. First-time Crew, pin and station guidance does not repeat the same card.
- Search offers supplied places, displays active/completed reports before route controls, and links earned findings to Board. Partners, Log, Arrival, Lights and Rewards have clearer states and next actions. Prices, permissions and job completion remain server-owned.
- Settings shows volume percentages. Settings, Credits, shortcuts and account panels have readable, contained layouts and reachable Close controls. Account/Credits open at the top; expired sign-in focus is scrolled into view. Deletion actions are visibly distinct.
- Story passages keep their fixed 330/420px frames. At 320×400 the current passage is fully visible; Journal clears the footer, Continue sits consistently near it, and opaque surfaces remove room-text ghosting. Important sound captions have their own row; choices scroll inside the dialogue when the caption is visible on a short screen.
- Help and privacy describe the connected game accurately. Privacy discloses the existing per-tab sign-in session and PKCE storage; retention/deletion/cache/play-money text is preserved. The AI companion is absent.

## Review evidence

Independent code reviews cleared the capability-derived guidance, Friends/account focus, story and Settings changes. Root reviewed canonical privacy and inventory changes against the verified auth storage behavior.

Targeted passes: 112 story visual checks plus 77 intro-page checks and 26 intro tests; 75 Settings/supporting-page states and 13 focused tests; 100 inspection layouts and 36 focused tests; 29 Friends production-DOM checks; 69 inline/live-guidance tests. All visual fixtures include the real base stylesheet. The inspection audit's first hidden-facts observation was withdrawn after correcting its missing base stylesheet; no product workaround was added for that fixture error.

The final clean frontend run passed **3,719 tests in 252 files**, with zero failures. Combined checks passed **36 native Chromium touch checks**, **61 accessibility screens**, **29 Friends checks**, **51 story-caption checks**, and seven production smoke checks. Seven production pages plus the recorded tour passed strict CSP with zero violations. Cold title delivery is **21,066 JavaScript bytes / 11,892 CSS bytes**, within the unchanged budgets. Text lint reports zero editable errors and 47 report-only findings. Build/spoiler guard, ten build-stamp checks and 38 problem-report checks pass.

Recorded native journeys passed predictions (41), Arena (20), bulletin (35) and case (19). The implemented fault groups passed 98 cases / 581 assertions. The earlier native prediction flag timeout did not reproduce in an isolated rerun with the same artifact, original 20-second limit and real keyboard path; the final full prediction journey also passes. Prediction/duel test clocks now use a deterministic anchor before mounting, removing a confirmed startup RPC race without changing expiry assertions or timeouts. Browser fixtures isolate their Vite optimizer caches; sequential DOM files share a temporary cache only within their Vitest run.

The compact [verification manifest](../../frontend/captures/20261108-overflow-release/verification.json) links the release results and their limits; supporting JSON reports are alongside it. These are pre-deployment gates. The production release must separately verify its exact pushed main SHA, public routes, flags and asset fingerprints.

No backend, migration, provider, feature-flag or workflow changes. Recorded/synthetic tests do not prove live OAuth, real private crews, physical phones or screen readers. Existing hardware frame proofs remain separately filed. Full reports and selected screenshots are under the dated captures folders; redundant generated older checkpoint images are not part of this release.

## Production and stock-label follow-up

Main `7486bac` deployed READY; public health/config, all 174 stamped JS/CSS assets, 12 art hashes,
12 spoiler fingerprints, private-route refusal and the live football feed passed. Public cold title
was 21,066 JavaScript / 11,886 CSS bytes. See [initial live proof](../../frontend/captures/20261108-overflow-release/production-7486bac.json).

That check found an existing clarity issue: a closed US stock without a cached quote said only
“No price yet.” Follow-up `df4931e` uses the server-supplied reopening time to say “Closed, opens
Monday 14:30 Lisbon time. No price yet.” It does not invent prices or change backend statuses,
provider, calendars or trading permissions. Independent review, **392 tests across all 23 market
files**, build/spoiler guard and text lint pass. The actual production panel at 320×568, 375×667
and 844×390 shows the full message, no horizontal overflow and no position opener, with zero
browser errors. [Follow-up proof](../../frontend/captures/20261108-overflow-release/stock-closure-followup.json).
The earlier 3,719-test full-suite run is the baseline before this isolated display-copy follow-up;
it was not rerun. Its final main SHA and public assets are checked again after the follow-up push.
