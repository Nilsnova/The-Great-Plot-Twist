# CW1 · Scattershot hits at the observed tick

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`). Coding agent: Codex.
Branch: `fix/cw1-scattershot-latency`, based on `48aee0e7b34c879968c4bc606b543f911032adfa`.
Different human reviewer: pending. Last updated: 2026-11-18.
Issue: [#458](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/458).

## Goal and scope

A blunderbuss target can walk or sail outside the cone before a delayed command
resolves. Recovery-wave single shots and cutlass attacks already use the shooter's
observed tick; extend that existing position lookup to cone range, angle and
nearest-target ordering.

Use current living target objects for projectiles and damage. Preserve the existing
40-tick (2-second) history bound, current-position fallback, reload, standing check,
weapon statistics and three-target limit. Legacy waves keep current-position checks.
No new networking, connection, latency, API, database or event infrastructure is needed.

## Acceptance and tests first

`frontend/tests/pirates/scattershot-latency.test.js` exercises the production sim:

- Moving ships and boarders remain hittable at their observed range and cone angle.
- Rewind includes exactly 40 ticks; older, future, invalid or unavailable history
  uses current positions. Legacy waves ignore the observed tick.
- The nearest three targets are ordered using observed positions; projectile
  endpoints still use current positions.
- Replaying the same journal through different page order and advance batches
  produces the same hits and final state.

Run the focused regression before and after the fix, then relevant pirate suites,
the frontend build and budget check. Record exact results in the handover.
Hosted multiplayer and deployment verification remain separate human review work.

## Local verification · 2026-11-18

- Tests first: the focused file had 7 failing and 8 passing cases before the fix;
  all 15 pass afterward. Local logs: `/tmp/cw1-before.log`, `/tmp/cw1-after.log`.
- `cd frontend && npm test -- tests/pirates/scattershot-latency.test.js tests/pirates/playtest-1117.test.js tests/pirates/captain-stats.test.js tests/pirates/skills-boarding.test.js tests/pirates/recovery-transport.test.js tests/pirates/wave-replay.test.js`:
  6 files, 81 tests passed. Log: `/tmp/cw1-focused.log`.
- `cd frontend && npm run build`: passed; spoiler guard checked 243 text files
  and 12 protected lines, with no suspect elimination data. Log: `/tmp/cw1-build.log`.
- `cd frontend && node scripts/report-budget.js --check`: passed; initial
  JavaScript 18,899 / 21,080 bytes, CSS 9,410 / 12,000 bytes. Log: `/tmp/cw1-budget.log`.
- `cd frontend && npm test -- --maxWorkers=2`: **348 files / 3,853 tests passed** in **561.03 s**.
- Independent agent review found no actionable issues and separately reran the 15 new regressions.
- `git diff --check`, local Markdown file-target checks and the committed-diff secret scan passed.
- Draft PR: [#463](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/463). Human explain-back, peer approval and hosted multiplayer/deployment verification remain.
- The [before/after diagnostic screenshots](../docs/evidence/CW1-scattershot/README.md)
  at 1280 × 720 and 375 × 812 show the actual baseline/current simulator outputs
  from identical inputs. These are labeled reports, not the game UI.

## Contracts and review

No payload or public contract changes; reuse `seenPlace(input, target)` and its
existing `seen` input. No new shared product decision. Human review remains pending;
no merge or deployment is authorized by this specification.
