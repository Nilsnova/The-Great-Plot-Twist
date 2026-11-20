# Reconciled core client UI evidence

Real Chromium component screenshots used to review the shared treasury and personal Captain UI.
The responses are coherent synthetic fixtures; no authenticated backend or live account is used.

- [Desktop Crew](treasury-crew-desktop.png): 25 available island coins, 75 committed, and server-priced hire availability while a larger personal wallet is ignored.
- [Phone treasury](treasury-phone.png): exact amounts above the JavaScript safe integer range wrap inside a 375 px viewport without overlapping Menu.
- [Personal Engineer](engineer-personal-progress.png): the personal role commitment and respec explanation remain visible independently of island treasury funds.

Generated and visually inspected from the reconciled extracted island modules with:

```sh
cd frontend
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-core-client npm test -- --maxWorkers=1 tests/island/economy-dom.test.js tests/island/economy-captain-dom.test.js
```

Both files passed, six tests. Older screenshots and verification notes remain under `../MP-ECO-18/`.
These images do not establish canonical multiplayer authority, admission or deployment acceptance.
