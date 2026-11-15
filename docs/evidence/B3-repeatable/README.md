# B3 — Repeat the feedback audit

Local Chromium fixtures for reviewers. Uses existing production components and
fake transport/API; does not sign in, contact a real server or change saved progress.
No player-facing UI is changed by this test-tool PR.

From the repository root:

```sh
cd frontend
npm install
node scripts/check-feedback.mjs
```

Install Chrome first; if it cannot be found, set `CHROME_PATH` to its executable.
Leave `TEST_URL` unset: the runner must own its local test server. The final
`Feedback evidence:` line names a new temporary folder with sixteen PNGs and
`report.json`. Nothing is written into the tracked captures directory. Move that
folder somewhere durable if keeping it after your machine clears temporary files.

| Fixture (each at 1280x720 and 375x812) | Assertions |
|---|---|
| Malformed game code | Visible correction; Join restored; first and repeated attempts issue zero join calls |
| Full game | Visible refusal; Join restored; each deliberate attempt calls the controlled API once |
| Create offline | Plain next step; Create restored; second try opens the fake game successfully |
| Not enough coins | Visible shortfall; all purchase choices disabled; native clicks issue zero builds |
| Locked tower | Visible unlock wave; mortar disabled/no build; available cannon still emits one build |
| Pending build | Building label; choices disabled; no extra build |
| Leaderboard offline | Visible next step; Try again invokes the existing callback once |
| Connection offline | Visible next step; Retry connection sends only the existing `continueGame` intent |

Each fixture also rejects horizontal overflow. Any assertion, unexpected browser
error or external request fails the command. Screenshots are component evidence,
not a full connected-game journey, a physical phone or a screen-reader check.
Money/reward safety is limited to callback counts: backend transactions and real
network recovery are not exercised here. The full-game response is controlled;
it does not verify live capacity enforcement.

Development countercheck: a temporary browser response enabled the normally
disabled building buttons. The runner exited 1 at the first poor-build assertion
after six passing cases. Production source was not edited for that countercheck.
The normal run then passed all sixteen cases. See [the spec](../../../specs/B3-feedback-check.md)
for exact final results and [the follow-up proposals](../../handoff/B3-next-proposals.md).

Recorded sample run: [report.json](report.json),
[phone Create failure](create-offline-375x812.png),
[desktop locked tower](build-locked-1280x720.png). The command regenerates all
sixteen pictures; these are existing UI states, not before/after product changes.
