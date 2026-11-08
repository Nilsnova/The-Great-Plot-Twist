# Guided Friends entry and initial panel focus

The title's Friends page now offers one useful next action from the current public account facts. It opens Account when sign-in is available, starts or continues the island story until a kit is confirmed, and resumes the world before opening Crew for a confirmed signed-in player. Offline or disabled sign-in offers local exploration with clear copy. The button never starts OAuth, claims a kit or joins a crew by itself.

The page shows the primary action and Back before optional instructions. The three-step explanation and explicit new-solo-story action live in a closed How it works disclosure. Returning from Account refreshes the existing page's copy without moving focus. Both actions fit a 320×400 screen without scrolling for every tested state.

The new resume-to-Crew tail checks the current play request, disposal, shell mode, Account, festival and game overlays after `begin` resolves. It rereads the actual signed-in and confirmed-kit facts before opening Crew. Cancelled or superseded lazy Friends pages cannot install or dispatch stale actions. `openAccount` is a hoisted function whose callback is invoked after account-host initialization.

Settings' existing lazy boundary is retained. The intent module's growing preload list now sits behind the existing world loader, keeping the title under its unchanged budget. The world exposes only a small `openCrew()` presentation method.

Ordinary Account opening focuses the fixed header and resets scrolling to the introduction. Genuine session expiry retains sign-in focus and scrolls that action into view. Existing refusal and deletion-disclosure focus logic is unchanged. Credits also starts at its header and introduction rather than scrolling to the first attribution link.

## Verification

- Production build and spoiler check passed.
- `node scripts/report-budget.js --check`: 21,066 cold JS bytes, 11,878 CSS bytes; original limits remain 21,080 and 12,000.
- `node scripts/check-friends-entry.js`: 29 production-DOM checks passed, zero browser errors or external requests. The fixture renders real built components and real built main/shell, replacing only private transport and the GPU factory; no game renderer is created.
- `npm test -- --maxWorkers=1 --reporter=dot tests/account-focus.test.js tests/g9-account-expiry-presentation.test.js tests/friends-entry.test.js tests/shell.test.js`: 11 tests passed, including expiry, deletion cancellation and pure stage rules.
- Text lint: zero editable diagnostics; 38 existing report-only notices. Diff check passed.

Screenshots and the production fixture report are in `frontend/captures/friends-entry/`. The root coordinator owns final integration, real world-to-Crew verification, deployment and live account checks. No database, auth provider, flags or production data was changed.

## Follow-up from the read-only journey review

The live adapter still inherits an empty guidance model after the five device tips are dismissed. A direct Search visit with no active spot also has no routes or spot picker. Those are separate guidance priorities; this patch does not infer new routes, deductions, completion or private case facts.
