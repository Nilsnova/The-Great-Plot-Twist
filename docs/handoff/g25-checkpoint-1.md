# G25 checkpoint 1 · outline and notes

Responsible teammate: Nils. Branch: `docs/g25-deck`, from `origin/main` `c26f303`.
The user explicitly allowed the three specified `docs/handoff/g25-checkpoint-N.md`
files as exceptions to the `docs/presentation/` write boundary.

Changed: `docs/presentation/outline.md` has ten slides, a 10:45 talk allocation,
full speaker notes and source qualifications. G11 retains the live-demo script.
No spoilers or student numbers included.

Verified: README, architecture, decision titles and D015 body inspected. Requested
`frontend/HOW-IT-WORKS.md` is absent; `frontend/GRAPHICS.md` and code used instead.
Main's suites rerun: 3,100 Python tests, 288 JavaScript tests (33 files), Ruff and
production build passed; spoiler guard checked 51 built text files.

Limits: Realtime is planned/unconnected; the connected case adapter is incomplete.
Current sign-in page CSP and account caching do not establish sitewide security
headers. Most backend tests use fake services, not live Supabase RLS verification.

Next: build offline HTML slides, original diagrams and a separate speaker view.
Refresh/merge `origin/main` before committing each checkpoint. Push only this branch.
