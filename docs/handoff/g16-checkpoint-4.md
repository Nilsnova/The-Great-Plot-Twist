# G16 checkpoint 4 — current reliability integration

This note supersedes the budgets, flag registry, asset bound and CSP proposals in historical
G16 checkpoints 1–3. Those notes and their dated measurements remain unchanged for provenance.
The current limits are **21,080 bytes of title JavaScript**, **12,000 bytes of title CSS**,
40,000 bytes for the title image, **256 stamped JS/CSS assets**, 4 MiB per asset and 16 MiB
per smoke run. Config validation covers **all 11 registered flags**. The existing strict
production CSP remains unchanged; the historical `unsafe-inline` proposal must not be applied.

The authored G16 commits `13e77b6`, `90d9c68`, `a253729` were preserved as `6c81d82`,
`b7e27e6`, `9abf3ba`. Current runtime fixes are `f1d3eb4` and `b866212`:

- Request privacy defaults are private/no-store, while explicit public caching remains
  available for approved content. Request diagnostics record method, status and duration
  without raw URLs, query strings or exception text; unexpected errors log their class only.
- The public intro cache reuses bounded encoded responses and invalidates changed or removed
  files. Existing case, festival, host, sports and current Exchange contracts remain intact.
- World styles load with the world. Account form styles load with the account screen, while
  its small title summary stylesheet remains immediate. Budgets were preserved, not relaxed.
- Weather keeps the newest successful response. Touch release checks the captured pointer.
  Corrupt saves with non-string flags are rejected. QA separately enabled the three authored
  G20 regressions and verified 29 tests with no skips.
- Build identity stamps every emitted JS/CSS asset. The signed-out smoke is bounded,
  same-origin and credential-free, and checks the current flags and complete stamped bundle.
  The runbook follows Nils's standing release/rollback authorization and forbids manual
  Actions, cron changes and new action IDs after uncertain money responses.

## Bounded verification

The production build stamped clean runtime commit `b86621231ed4aa25010b6705ccd58592ddc30c9d`.
The build and spoiler guard passed (132 text files). Strict budget and local Chromium loading
checks passed: title JavaScript **20,316 B** (gzip 9,642 B), CSS **11,353 B** (gzip 4,012 B),
title image **29,530 B**, 122 stamped assets, and interface contrast **6.479**. The account,
shell and build-info checks passed **16 tests**. The current smoke fixtures passed **18 tests**.
Focused backend privacy/content/current-route checks passed after reconciling retired market
fixtures and private cache expectations; the final policy/bulletin/prediction subset passed
12 tests. Existing weather/story tests passed 89 tests before the independent QA regressions.
Independent review of the frozen runtime checkpoint additionally passed 107 backend tests,
94 frontend tests and the 18 smoke fixtures without findings; its separate benchmark rerun
passed all nine tests and all 55 network-blocked route scenarios.

```sh
cd frontend
npm run build
node scripts/report-budget.js --check
CAPTURE_DIR=/tmp/reliability2-captures CAPTURE_PREFIX=G16-current node scripts/check-loading.js
npx vitest run tests/build-info.test.js tests/account.test.js tests/shell.test.js --maxWorkers=1
cd ..
node --test scripts/test-smoke-live.mjs
```

The current API benchmark is a separate four-file commit `660caaf` (local cherry-pick
`3feb0c4`), documented in `g16-benchmark-current.md`: **55/55 operations**, two timed samples
and one warmup per operation, one network-blocked fresh import, no uncovered/obsolete routes,
and nine tool regression tests. These are smoke measurements, not performance improvement or
production latency evidence. The inherited unused error-module import identified by that
commit is already removed by `b866212`.

Logs are `/tmp/reliability2-final-build.log`, `/tmp/reliability2-final-budget.json`,
`/tmp/reliability2-loading.log`, `/tmp/reliability2-front-focused.log`, and
`/tmp/g16-current-routes.json`. Full source Ruff, diff, current staged-secret and protected-file
checks accompany the final handoff. G21 is independently documented in checkpoint 4 with
2,406 passing checks; its authored history contains one documented synthetic secret-scanner
false positive, while current test fixtures use short distinct fake values.

## Release integration and limits

Take G16 through `b866212`, the standalone benchmark commit, and this note. Root already has
G21 and should avoid applying its patches twice. Preserve root's later content-cache probe
expectations and sports README corrections, QA's current browser tooling, the help/privacy
links, and the security branch's Vite notices plugin/license alongside `buildInfoPlugin`.
The full existing production CSP and conditional entry points must remain intact.

No SQL, private/public source content, public assets, dependencies, lockfiles, `vercel.json`,
G9 branch, STATUS or DECISIONS files changed. No live deployment, database/provider access,
Actions or push was performed here. Provider credentials, authenticated live multiplayer,
physical mobile/Safari checks and production performance are not proved by these local gates.
