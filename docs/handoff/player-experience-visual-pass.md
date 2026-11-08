# Player experience and visual scrutiny · 8 November 2026

Nils requested a deeper review of Settings and every inspection screen, clear guidance and a pleasant playthrough. This follow-up builds on the first three overflow items and the mobile-walking release.

## Changes

- Friends now offers the actual next action: Account, start/resume the opening story, or resume and open Crew. The primary action and Back fit at 320×400; instructions are optional. Async navigation checks the current account and overlays before opening Crew.
- Live What next now reads earned server capabilities instead of an empty extension. Up to three steps have their action inside each card. First-time Crew, pin and station guidance does not repeat the same card.
- Search offers supplied places, displays active/completed reports before route controls, and links earned findings to Board. Partners, Log, Arrival, Lights and Rewards have clearer states and next actions. Prices, permissions and job completion remain server-owned.
- Settings shows volume percentages. Settings, Credits, shortcuts and account panels have readable, contained layouts and reachable Close controls. Account/Credits open at the top; expired sign-in focus is scrolled into view. Deletion actions are visibly distinct.
- Story passages keep their fixed 330/420px frames. At 320×400 the current passage is fully visible; Journal clears the footer, Continue sits consistently near it, and opaque surfaces remove room-text ghosting.
- Help and privacy describe the connected game accurately. Privacy discloses the existing per-tab sign-in session and PKCE storage; retention/deletion/cache/play-money text is preserved. The AI companion is absent.

## Review evidence

Independent code reviews cleared the capability-derived guidance, Friends/account focus, story and Settings changes. Root reviewed canonical privacy and inventory changes against the verified auth storage behavior.

Targeted passes: 112 story visual checks plus 77 intro-page checks and 26 intro tests; 75 Settings/supporting-page states and 13 focused tests; 100 inspection layouts and 36 focused tests; 29 Friends production-DOM checks; 69 inline/live-guidance tests. All visual fixtures include the real base stylesheet. The inspection audit's first hidden-facts observation was withdrawn after correcting its missing base stylesheet; no product workaround was added for that fixture error.

Final combined frontend, mobile, accessibility, loading and CSP checks are running before the main release. Production deployment and public build/flag/asset verification follow. The earlier native prediction flag timeout did not reproduce in an isolated rerun with the same artifact, original 20-second limit and real keyboard path; no game fix or threshold increase was made.

No backend, migration, provider, feature-flag or workflow changes. Recorded/synthetic tests do not prove live OAuth, real private crews, physical phones or screen readers. Existing hardware frame proofs remain separately filed. Full reports and selected screenshots are under the dated captures folders; redundant generated older checkpoint images are not part of this release.
