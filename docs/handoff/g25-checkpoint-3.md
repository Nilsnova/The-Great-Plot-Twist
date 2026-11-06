# G25 checkpoint 3 · rehearsal, PDF and final gates

Responsible teammate: Nils. Branch: `docs/g25-deck`. Main baseline: `60f7fd0`.
C3 merged the newer main revision and refreshed the content/counts before the
checkpoint commit. Earlier C1/C2 handoffs describe `c26f303`. Push only the deck
branch; no main push, merge into main, deployment or PR creation is part of G25.

Changed: rehearsal table with per-slide and cumulative targets totaling 10:45;
presenter instructions and a clearly unrun human rehearsal row; a browser-printed,
tagged ten-page PDF; export reproduction instructions; final validation record.
The title, notes labels and test-count wording received final polish.

Verified:

- All nine grouped offline disk-intercepted browser checks passed, including
  paired/standalone notes, keyboard/click controls, timer, desktop/narrow layout,
  print fit and zero external requests, browser errors or CSP violations.
- PDF metadata/page count/text checked: ten audience pages, correct title, tagged,
  no PDF JavaScript and no speaker notes or controls. Browser and PDF diagrams
  inspected. Independent agent review approved the content and speaker view.
- Main test counts were rerun: 6,408 Python + 886 JavaScript tests, plus clean
  Ruff and build; 99 built text files passed the repository spoiler guard.
- Gitleaks 8.24.2: empty checkpoint findings and empty extracted-PDF findings.
  Existing reveal fingerprints found no matches in deck/handoff/PDF text.
- Changed paths stay within `docs/presentation/` and the three expressly
  authorized `docs/handoff/g25-checkpoint-N.md` files. No application changes.

Not verified / remaining:

- Managed Chromium blocks `file:` before loading documents. The direct filesystem
  gate remains outstanding on the actual presentation laptop; no policy was
  bypassed. The offline local-disk browser test is recorded separately.
- A spoken, timed rehearsal and projector/G11 handoff check still need a presenter.
- Realtime code and account UI now exist, with game/real transport integration
  pending. Sitewide headers are now configured. Live RLS/concurrency and deployed
  header behavior are not established by this docs task.
- Requested `frontend/HOW-IT-WORKS.md` arrived in the C3 main merge and was read.

Entry point: `docs/presentation/index.html`. Static fallback:
`docs/presentation/The-Great-Plot-Twist.pdf`. Full sources, checks and remaining
limits: `docs/presentation/{sources,validation,rehearsal}.md`.
