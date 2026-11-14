# T28 verification and testing

Responsible teammate: Ianno Hollensteiner, assisted by Codex. Implementation is in
[PR #19](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/19), tracked by
[issue #18](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/18).

## Before and after

Before screenshots use a separate, clean checkout of current `origin/main`,
`50cab125`, fetched on 14 Nov 2026. After screenshots use this branch. Both use
Chrome and the existing in-memory pirate demo at wave 5, full defenses, high
island health and a 98% boss trigger to reach the same moment quickly. No real
account, live database or actual phone was used.

| Viewport | Before: short title card | After: explanation | After: personal practice |
|---|---|---|---|
| 1280 × 720 | [Before](before-introduction-1280x720.png) | [Introduction](after-introduction-1280x720.png) | [Practice](after-practice-1280x720.png) |
| 375 × 812 | [Before](before-introduction-375x812.png) | [Introduction](after-introduction-375x812.png) | [Practice](after-practice-375x812.png) |

[Game capture report](report.json): both layouts stay in the viewport without
card overlap; the actual score stays zero during practice and the scored attempt
starts after Finish practice. Visual inspection caught an unrelated hint covering
the first draft; the final layer order fixes it and hides informational tips
while keeping error messages visible.

[Checkpoint report](checkpoints.json): haul, cannon, duel and Redtide's three
practice steps all reach the scored phase without browser errors. Additional
phone captures are `checkpoint-<kind>-<step>-375x812.png` in this folder.

## Test it yourself

Run `cd frontend && npm install && npm run dev -- --port 5174` from this branch, then use the
address Vite prints. If it is `http://127.0.0.1:5174`, use these checkpoints:

- [Chain](http://127.0.0.1:5174/?pirates=demo&practice=haul&practicePlayer=Ianno&practiceIsland=test-one)
- [Cannon](http://127.0.0.1:5174/?pirates=demo&practice=cannon&practicePlayer=Ianno&practiceIsland=test-one)
- [Arrow duel](http://127.0.0.1:5174/?pirates=demo&practice=duel&practicePlayer=Ianno&practiceIsland=test-one)
- [Redtide combination](http://127.0.0.1:5174/?pirates=demo&practice=redtide&practicePlayer=Ianno&practiceIsland=test-one)

Press Play, skip the story/tutorial if desired, and close the goal card. The
checkpoint opens after arriving on the rehearsal island; no boss waves need to
be played first. It uses the real finisher rules/scene and a private recorder,
with no API calls, coins or saved wave progress. The labels in the URL scope only
rehearsal guidance; they cannot select a real account or island.

Try Practice, then Finish practice; try Skip practice on another task. Reload:
completed/skipped introductions should be remembered. Change `practiceIsland`
to `test-two` or `practicePlayer` to `Friend`: the introduction should return.
Redtide explains only task kinds not already completed for those labels.
The standalone checkpoint is solo rehearsal; use the real island demo with two
players to test the shared multiplayer barrier. `npm run test:mp -- <folder>`
provides the reproducible four-page fake-room check.

## Results and limits

- `npm install`: added 47 packages; existing fsevents install-script notice.
- `npm test`: 239 passed files; 2,989 passed tests; 127.43 s (final full run after the keyboard-focus fix).
- `npm run build`: built in 770 ms; spoiler guard: 230 text files, 12 protected lines, no suspect elimination data.
- `node scripts/report-budget.js --check`: exit 0; initial JavaScript 18,174 bytes, CSS 8,550 bytes.
- Root `node scripts/text-lint/index.mjs`: 3,774 candidate strings in 415 source files; 0 errors, 8 existing report-only findings.
- `npm run test:a11y`: 33 screens, failures [], errors []; [report](accessibility.json).
- `SHOTS_DIR=/private/tmp/t28-demo-shots npm run test:demo`: 33 checks, errors [], external []; [report](demo.json).
- `npm run test:mp -- /private/tmp/t28-multiplayer-shots`: `check-multiplayer: OK (4 pages)`. Three captains skipped and one practiced: all real clocks/scores stayed zero. All four decided `finisher_won 384/224`; [log](multiplayer.txt).
- Additional Redtide feasibility case: `npm test -- --maxWorkers=1 tests/pirates/finisher.test.js`: 19 passed. Across crews of 1, 2, 4 and 10, both difficulty settings and three salts, delayed chain/arrow inputs still clear two tasks even when the cannon task is lost. This is a rules-level feasibility check, not a human playtest.
- Documentation: 44 added local links/anchors checked, 0 missing. A broader scan found three obsolete anchor references already on main in INTERFACES; those unrelated references are unchanged.
- `git diff --check origin/main`: exit 0, no output.

The first complete test run exposed the added event missing from the expected
protocol list and scene fixtures not announcing readiness. The list and fixtures
now exercise the new contract; no test was deleted, skipped or weakened. Final
unit/browser suite above passes. Initial demo/multiplayer commands could not
write to the scripts' default `/Users/nilslenke` paths; reruns use their supported
output-directory options. The first browser-suite attempt was blocked from
opening a local port; the successful run used the required local Chrome access.

Not verified: physical phones, projector, live Supabase accounts/rooms, packet
loss or latency beyond the existing wave scheduler's assumptions. No backend,
SQL, security-header, dependency or live configuration changes were made, so
backend/SQL checks were not run. The standard accessibility command audits its existing 33 screens, not a physical screen reader on the new canvas task. Cross-device guidance persistence is deliberately
not provided; clearing or blocking storage can show the introduction again.
Ianno practiced all checkpoints and completed the introductory explain-back after clarification: private practice inputs, player × island × task guidance, and the bounded shared wait were discussed. The timeout starts the attempt without removing idle participants from the crew target. Rehearse independently before the walkthrough. Independent human approval remains pending; do not merge yet.
