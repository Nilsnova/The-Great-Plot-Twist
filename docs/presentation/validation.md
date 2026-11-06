# G25 validation · 6 November 2026

Main baseline: `60f7fd0b89fcbaad346b05ac365b1386aa6c0f8d`. Work branch:
`docs/g25-deck`. Refreshed and merged `origin/main` before each checkpoint;
C3 merged the newer `60f7fd0` and refreshed the test counts, Realtime/account/header
claims and requested frontend guide. C1/C2 retain their earlier snapshot records.
Only the deck branch was pushed. The user authorized the three G25 handoff files outside the otherwise
strict `docs/presentation/` write scope.

## Presentation checks

`node docs/presentation/check-deck.cjs`, Chromium 156, offline browser context,
with all deck requests fulfilled from local disk and all other requests rejected:

| Check | Outcome |
| --- | --- |
| Ten slides; complete notes; durations sum to 645 seconds | Passed |
| Arrow keys, click, Home/End, previous/next boundaries | Passed |
| All original diagrams load; 1440 × 900 layout has no overflow | Passed |
| Paired speaker view syncs in both directions, including after button focus | Passed |
| Unrelated window messages ignored | Passed |
| Notes timer starts, pauses and resets | Passed |
| Standalone notes open on a bookmarked slide | Passed |
| Narrow 390 × 844 viewport has navigation and no horizontal overflow | Passed |
| Print shows ten slides, hides notes/controls and has no clipped slide boxes | Passed |
| External requests, browser errors, CSP violations | **Zero** |
| Direct `file:` browser launch | **Blocked before document load by environment policy** |

The last row remains a gate to check on the presentation laptop. It is not a
deck error observed in the loaded page, and the offline interception test is not
presented as a direct-file pass. Managed Chromium's `URLBlocklist` excludes local
files; no global browser policies were changed. The implementation uses classic
local JS/CSS/SVG, no modules, server, storage or remote dependencies.

## PDF and content

The committed PDF was generated with the browser print renderer and the deck's
print stylesheet. `pdfinfo` confirms ten landscape pages (approximately 16:9),
tagged structure, no PDF JavaScript and the class-presentation title. Text
extraction confirms the expected slide on each page with no speaker prose or
toolbar/timer text. Original diagrams were visually inspected in both browser
and PDF rendering; the speaker view was also inspected.

The rehearsal table is a 10:45 allocation, not a measured spoken rehearsal.
The separate G11 demo and questions are outside that time. No live-demo steps,
case solution or student numbers were included. An independent agent reviewed
the sources, slide wording, diagrams and speaker view; its keyboard/wording
suggestions were addressed. The existing reveal-fingerprint guard was also
applied to deck text, SVGs, handoffs and extracted PDF text, with no matches.

Gitleaks **8.24.2**, default rules, redacted logs: each checkpoint's staged changes
and the PDF's extracted text produced empty JSON findings. The binary's SHA256
matched its official release checksum list. Scanner coverage is evidence, not a
guarantee against every possible secret or spoiler.

## Main's test evidence

6,408 backend tests and 886 frontend tests passed; Ruff and the production build
passed. The build spoiler guard checked 99 text files and 12 protected lines. Exact commands and limits
are in [sources.md](sources.md). These runs do not establish live Supabase RLS,
live Realtime integration, deployed headers or human delivery timing.

Reproduction and PDF export commands are in [README.md](README.md) and
[rehearsal.md](rehearsal.md). Temporary test logs, redacted scan reports and
screenshots remain outside the repository at `/workspace/cloud-setup/g25/`.
