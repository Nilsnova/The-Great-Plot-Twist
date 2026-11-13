# T5 island decoration — Ianno Hollensteiner

> **What this is:** review evidence and handover for the approved island milestones.
>
> **Who uses it:** Ianno, the human reviewer and the repository walkthrough team.

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). Codex drafted the code,
tests and notes. Branch: `feat/t5-island-decoration`; [PR #10](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/10),
[issue #11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/11).
Introductory explain-back completed on 13 Nov, with clarifications noted below.
Ianno requires approval of this PR by **Nils Lenke (`Nilsnova`) or Johannes Franz Lang
(`frcola`) before merge**. Independent human review is still pending.

## Result and revised scope

Ianno replaced the first rectangular flag design with a number-only league shield,
above and right of the cabin, using original shapes in the existing cartoon paint kit.
The old rectangular artwork and obsolete after screenshots are replaced, not shipped
as another design. The [spec](../../specs/T5-island-decoration.md) records the approved ladder.
The number follows each newly survived highest wave; the artwork changes at ten-wave
milestones. A lost attempt or replay of a lower wave does not increase the record.
A statue appears after wave 25; existing trees keep their original size with zero houses, then grow to 110% and
120% with one and two houses. Removing houses returns them toward the original size. No public API, database, money, combat, collision or dependency changes.

## Evidence

| Viewport | Before T5 | Final design at best wave 25 |
|---|---|---|
| 1280 × 720 | [Before](../evidence/t5/before-1280.png) | [After](../evidence/t5/after-1280.png) |
| 375 × 812 | [Before](../evidence/t5/before-375.png) | [After](../evidence/t5/after-375.png) |

[One house, desktop](../evidence/t5/after-1-house-1280.png) ·
[Two houses, desktop](../evidence/t5/after-2-house-1280.png) ·
[One house, phone](../evidence/t5/after-1-house-375.png) ·
[Two houses, phone](../evidence/t5/after-2-house-375.png).
The zero-house after screenshots above keep the same tree size as the before images.
All three house counts were captured on the same local island; the desktop images
show the trees, while the phone view also checks the surrounding UI after building.

[All twelve rank designs](../evidence/t5/ranks.png). The labels on this developer
preview identify the ranks; the in-game shield shows only its number.
These are Chrome captures with local fake APIs, not deployed accounts or physical phones.
The final screenshots were visually inspected: badge beside the cabin, no overlap
with the existing build markers, readable number at both sizes, original cartoon outlines.

## Verification (13 Nov 2026)

Commands run from `frontend/` unless stated otherwise. This Mac needs
`CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` for the
browser component tests. Node 22.12.0 and its bundled npm were added to PATH locally;
no package was added and the lockfile is unchanged.

| Command | Exact result / evidence |
|---|---|
| `npm install` | `added 47 packages in 687ms` |
| `npm test` (final rank artwork and tree correction) | `Test Files 236 passed (236)`; `Tests 2971 passed (2971)`; exit 0 |
| `npm run build` | `Spoiler guard: 225 text files, 12 protected lines, no suspect elimination data.`; exit 0 |
| `node scripts/report-budget.js --check` | exit 0; initial JavaScript 18,174 / 21,080 bytes; CSS 8,550 / 12,000 bytes |
| `node scripts/text-lint/index.mjs` (repository root) | `Text lint: 3744 candidate strings in 411 source files; 0 errors, 8 report-only findings.`; the report-only findings are in unchanged files |
| `node scripts/check-island-decorations.mjs` | `T5 after: captured 1280×720 and 375×812 at best wave 25.`; exit 0; also writes the rank preview and all house stages at both viewports. `T5 house builds: tree scale 1.1 with one house, 1.2 with two houses.` |
| `npm run test:a11y` | `"screens": 33`, `"failures": []`, `"errors": []`; exit 0 |
| `SHOTS_DIR=/private/tmp/t5-trees-demo-shots npm run test:demo` | 33 checks; `"errors": []`, `"external": []`; exit 0 |
| `git diff --check` (repository root) | exit 0, no output |

Tree correction tests first: four tests failed against the old 60% / 80% / 100% rule
before it was replaced. The current expected rule keeps the original size and grows it.

Tests-first evidence: the first rule-test run failed because `decorations.js` did
not exist. The later rank test failed with `TypeError: waveRank is not a function`
before the rank selector was added. The T5 tests cover every ten-wave
boundary, recorded win-event refreshes, statue 24/25, house growth/removal, invalid
records, another island’s lower progress, texture reuse and exactly-once cleanup.

The first baseline run lacked browser/loopback permissions; a subsequent baseline
run lacked CHROME_PATH. Neither is claimed as a passing baseline. The corrected full
suite above passed with Chrome configured. The demo script initially tried to write
to another teammate’s home directory; its existing SHOTS_DIR option fixed the run.
The submitted game journey verifies actual local house builds at 100%, 110% and
120% as well as the badge/statue. Generated accessibility captures were moved
outside the checkout and original tracked captures restored, keeping this PR focused.

## Explain-back discussion — 13 Nov 2026

Ianno completed the introductory quiz about number/rank updates, the best-wave
record after a loss, and texture cleanup. The discussion clarified two details:

- The number changes after each new highest wave; the design changes only at the
  ten-wave boundary (silver at 29, gold at 30).
- A loss leaves the highest-wave record unchanged.
- Replacing the image releases graphics memory on every number update, not only
  rank changes. A visited island may show a lower rank drawn from its own record.

Independent human review remains pending. The reviewer can ask further questions
about house removal, the rank selector, state updates and cleanup with the source open.

## Limits and next step

No backend checks were run because no backend or contract changed. No live database,
real account/visit, physical phone, screen reader or device performance claim is made.
Canvas artwork is cosmetic and has no new interactive control; this automated
accessibility audit does not measure the drawn shield’s contrast. Visually reviewed
screenshots and the local component tests complement it.

The introductory explain-back is complete, so the PR can be marked ready for human
review. At Ianno’s request, **Nils or Johannes Franz Lang must approve the current
change before merge**. No merge is authorized by this handover.
