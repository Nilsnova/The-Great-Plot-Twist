# Presentation validation · 6 November 2026

The authored G25 checkpoints are preserved in history. Current content is reconciled against release candidate `94a48ad`; [sources.md](sources.md) separates the confirmed case production release from the new candidate wave. Updating this deck does not apply migrations, enable flags, deploy code or prove a live provider.

## Checks for this revision

The checker used existing `playwright-core` and installed Chromium 156. It added no dependency and contacted no live service. Temporary reports and screenshots are outside the repository.

| Check | Actual result |
|---|---|
| Offline disk-intercepted browser gate | **9 checks passed.** Ten slides and complete notes; 645-second allocation; keyboard/click navigation; paired and standalone notes; local timer; 390px layout; ten unclipped print pages; no external requests, browser errors or CSP violations. |
| Direct `file:` browser gate | **Blocked before page load:** `net::ERR_BLOCKED_BY_ADMINISTRATOR`. No browser policy was changed. The offline gate does not establish filesystem behavior on the presentation laptop. |
| Current audience PDF | Regenerated from the checked HTML: **10 pages**, landscape 841.92 × 474pt, tagged, selectable text, local vector diagrams, no forms or JavaScript. Text extraction confirmed all ten slide numbers in order and current evidence terms; speaker notes and timer controls are absent. |
| Protected reveal fingerprints | **25 source/PDF-text files clean** against the existing fingerprint fixture. Protected prose was not printed. This scan has the same fingerprint-coverage limit as the application guard. |
| Source and links | Shell/JavaScript syntax and **129** local Markdown/HTML/SVG target checks passed. All **40** drill cards remain. No remote-link availability or full fresh-clone run was inferred. |
| Visual inspection | Current evidence and team slides were inspected at desktop size. The browser gate checked every slide for loaded diagrams and overflow. |
| Independent review | A separate read-only agent checked current claims, local targets, PDF metadata and the protected-text boundary. Its status and rehearsal-cue findings were corrected; bounded review approved. |

Reproduce the browser/export check from the repository root, with the existing frontend development dependencies installed:

```sh
CHROME_PATH=/usr/bin/chromium G25_ARTIFACTS=/tmp/ship-deck-check \
  G25_PDF="$PWD/docs/presentation/The-Great-Plot-Twist.pdf" \
  node docs/presentation/check-deck.cjs
```

The run's report is `/tmp/ship-deck-check/report.json`; temporary screenshots are in the same directory. The direct-file attempt used `/tmp/ship-deck-file-check`. The checked-in PDF is the durable audience artifact. No student identifiers or unverified teammate names were supplied.

## Application evidence used by the talk

The completed case record proves 10,859 backend tests, 69 kit mixes and actual solo+NPC/four-player API-to-SQL playthroughs. Root reports 1,672 next-wave frontend tests and a build checking 130 public text files / 12 protected lines. Exact sources and remaining deployment/provider/browser limits are listed in [sources.md](sources.md).

The 10:45 timing is a planned allocation. A human spoken rehearsal, actual laptop/projector setup and physical-device checks have not been performed by this task. Use [rehearsal.md](rehearsal.md) to record those separately.
