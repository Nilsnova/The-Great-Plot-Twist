# G25 checkpoint 2 · slides and original diagrams

Responsible teammate: Nils. Branch: `docs/g25-deck`. Baseline: main `c26f303`.

Changed: ten offline-oriented HTML slides with local CSS/JS; original island,
architecture and request-sequence SVGs; full notes in a separate view; paired
navigation, rehearsal clock, keyboard/click controls and a print stylesheet.
Evidence and qualified status are in `docs/presentation/sources.md`.
G11's live-demo script is not duplicated. No spoilers or student numbers.

Review: independent agent checked sources and content. Two suggestions were
addressed: arrows keep working after focus lands on a notes-navigation button,
and branch-task mechanics were removed from the audience slide.

Validation: direct `file:` navigation was attempted but blocked before document
load by managed Chromium policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). Do not claim
that gate passed. No global browser policy was changed. The local-disk offline
browser harness is used to check rendering, CSP, paired notes and print behavior;
it passed nine grouped checks: slide allocation/local assets, keyboard/click and
boundary navigation, desktop rendering, bidirectional paired notes and message
filtering, timer, standalone notes, narrow layout, print layout/PDF generation,
and zero remote requests/browser errors/CSP violations. C3 records final export.

Main suites at baseline: 3,100 Python and 288 JavaScript tests passed; Ruff and
production build passed. These are controlled test cases, not live RLS checks.
Checkpoint scan uses Gitleaks 8.24.2 with its default rules and redacted output;
the release SHA256 was verified against the official release checksum list.

Next: finish the timing/rehearsal guide and browser-generated PDF, verify page
count/text and final diff. Refresh/merge main before this checkpoint commit;
push only `docs/g25-deck`. Files outside `docs/presentation/` are limited to the
three user-authorized G25 checkpoint notes.
