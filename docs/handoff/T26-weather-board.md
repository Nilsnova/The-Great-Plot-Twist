# T26 · Weather board from the island Harbor

Local verification and handover for Ianno Hollensteiner and the peer reviewer, 13 Nov 2026. [PR #8](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/8).

## Changed

The Harbor after wave 4 lists Weather board. The game routes it to the existing lazy weather card, after closing the island card. Stall buttons sit below their text in the docked Harbor so the descriptions stay readable. No provider, dependency, API, database, security header or coin rule changes. Scope: [spec](../../specs/T26-weather-board.md).

## Verified

Commands used Node 22.12.0 and installed Chrome (`CHROME_PATH` set to the installed Google Chrome binary).

| Command | Actual result |
|---|---|
| `cd frontend && npm install` | `changed 71 packages, and audited 48 packages in 2s`; `found 0 vulnerabilities`. npm 10 rewrote platform metadata; restored the lockfile to its original bytes. |
| `cd frontend && npm test` | `Test Files 234 passed (234)`; `Tests 2963 passed (2963)` |
| `cd frontend && npm run build` | `✓ built in 580ms` on the first run; final build also exited 0. `Spoiler guard: 225 text files, 12 protected lines, no suspect elimination data.` |
| `cd frontend && node scripts/report-budget.js --check` | Exit 0. Final output records initial JavaScript/CSS and limits; no unshipped assets in dist. |
| `node scripts/text-lint/index.mjs` (root) | `Text lint: 3744 candidate strings in 409 source files; 0 errors, 8 report-only findings.` No dictionary edits. |
| `cd frontend && npm run test:a11y` | First run: `"screens": 33, "failures": [], "errors": []`. After the layout change: exit 1, lobby keyboard failure. Repeat: `"screens": 33, "failures": [], "errors": []`. The intermittent lobby result remains a limitation. |
| `cd frontend && npm run test:demo` (`SHOTS_DIR` set to a temporary directory) | Exit 0; 33 checks, `"errors": []`, `"external": []`. |
| `cd frontend && node scripts/check-island-weather.js` | Exit 0; `Captured after Harbor at 1280×720 and 375×812`. Real game callback, recorded weather/fake island API, one open dialog, Escape and viewport containment checked. |
| `git diff --check` | Exit 0. |

The model assertion first failed because Weather board was absent (`1 failed | 24 passed`), then passed (`25 passed`). The new Chrome DOM regression also passed (`1 passed`): wave-3/4 boundary, storm/fog/stale/missing readings, latest answer on reopen, one dialog, reset/focus, Escape and disposal. The full suite includes it.

## Screenshots

Captured in the running local game with a fake island set to wave 4 and recorded weather. No live account or database writes. Phones use the sheet's existing scrolling; the additional entry screenshot shows the reachable button.

| Size | Before | After | Entry scrolled into view | Weather card |
|---|---|---|---|---|
| 1280 × 720 | [Before](../evidence/t26/before-1280-harbor.png) | [After](../evidence/t26/after-1280-harbor.png) | [Entry](../evidence/t26/after-1280-entry.png) | [Weather](../evidence/t26/after-1280-weather.png) |
| 375 × 812 | [Before](../evidence/t26/before-375-harbor.png) | [After](../evidence/t26/after-375-harbor.png) | [Entry](../evidence/t26/after-375-entry.png) | [Weather](../evidence/t26/after-375-weather.png) |

## Not verified and remaining

No backend checks: no backend changes. No real provider outage, deployed sign-in, physical touch device, screen reader or real-time update while the card stays open was verified. Weather is read on opening; a running wave keeps its server-supplied conditions. The accessibility lobby keyboard failure was intermittent, passing on the immediate repeat; no test was weakened.

Ianno must review every changed line and supply his own explain-back. The agent drafted code, tests and these notes; they are not proof of Ianno's understanding. Proposed reviewer: Johannes (`frcola`). Keep the PR draft until the explain-back is complete; do not merge without another human's current approval.
