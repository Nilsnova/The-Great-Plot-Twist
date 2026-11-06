# Explain-back rehearsal

Used for the course drills on **Thursday 19 and Saturday 21 November 2026**. Forty cards cover implemented code, tests and safety boundaries; they do not expose the case solution.

- [G — world and graphics: ten cards](G.md)
- [S — story and mystery: ten cards](S.md)
- [A — accounts and multiplayer: ten cards](A.md)
- [L — live systems: ten cards](L.md)

On Thursday, rotate speaker/questioner across lanes. For each card, open the source file, explain the named lines aloud, predict an edge case, then open the answer. Everyone should cover an easy card and a testing/safety card outside their usual lane. Use the [lane pages](../lanes/README.md) for context.

On Saturday, repeat without reading the back first. Trace one player action across browser, API and database boundaries; distinguish a pure test, a mocked request, a real browser smoke and a live permissions test. The questioner changes one assumption (stale version, duplicate action, missing provider, failed landing) and asks what happens. A correct explanation names both what is verified and what remains unverified.

Do not memorize fixed line numbers: cards identify functions/tests and give ranges from the audited main. After each main merge, confirm the range still points at that mechanism. Do not open private settings, authenticated responses or server-only case data on the projector. Keep rehearsal notes local; no course-only identity information belongs in this public repo.
