# B3 — Repeatable feedback check

Johannes Franz Lang (@frcola), assisted by Codex. Parent issue #30.

## Goal and scope

Make the eight existing current-v3 feedback fixtures repeatable with one local
command, using the existing Chromium helper and fake API. Check desktop and phone
sizes, useful messages, usable recovery controls, disabled purchases and callback
counts. Save screenshots plus a small report. No product, login, adapter, API,
dependency or database change; independent of drafts #31/#32/#38.

## Acceptance

- Eight component cases at 1280x720 and 375x812.
- Invalid code does not call join; refused join and failed create restore controls.
- Poor/locked/pending build controls do not call build; valid cannon still works.
- Leaderboard retry and connection retry call their existing callbacks.
- Assertions fail the command; console/page errors and external traffic fail it.
- Evidence explicitly distinguishes controlled components from real online play.

Likely files: `frontend/scripts/check-feedback.mjs`, a small fixture module,
this spec, walkthrough, test map, status, task-board and evidence instructions.
