# Owned-island account deletion disclosure

[Phone disclosure](owned-island-delete-phone.png) captured and visually inspected in real Chromium
at 375 × 812. The test supplies a synthetic read-only server classification and records the two
client intents. No account API is contacted and no account or island is deleted.

The initial confirmation sends only `{confirm:true}`. After
`owned_island_confirmation_required`, a separate choice explains owned island deletion, absence
of automatic transfer, and preservation of other players' personal Captains and progress. Only
that second choice adds `confirmOwnedIslandDeletion:true`. The viewed foreign island supplies no
ownership authority.

```sh
cd frontend
MP_ECO_EVIDENCE_DIR=../docs/evidence/MP-ECO-account-deletion npm test -- --maxWorkers=1 tests/account-owned-island-dom.test.js
```
