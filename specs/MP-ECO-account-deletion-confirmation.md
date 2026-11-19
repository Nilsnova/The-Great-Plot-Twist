# Explicit owned-island account deletion confirmation

Frontend account deletion disclosure and strict optional confirmation for the existing account API.
Responsible teammate: Ianno Hollensteiner. This changes client code, not any live account.

The existing DELETE `/api/me` keeps mandatory `{confirm:true}`. An optional
`confirmOwnedIslandDeletion` must be a boolean. The server atomically classifies ownership;
a missing explicit true for an admitted owned island returns read-only 409
`owned_island_confirmation_required`. The client does not infer that classification from the
selected or visited island, a local owner label, or a cached economy envelope.

Keep the existing legacy/member confirmation flow. After that server classification, display
a separate explicit choice explaining that the owned shared island will be deleted, no automatic
ownership transfer occurs, and other players retain their personal Captains and progress. Only
that choice resends `{confirm:true,confirmOwnedIslandDeletion:true}`. Cancel, panel close and
identity loss discard the extra consent. Classification is tied to the current private adapter
scope and actor; a new identity must review and classify again before the optional flag is sent.

Write focused transport and real-DOM tests before implementation: absent/false/string optional
flags, no sign-out or retry on classification, explicit second click, cancel, member deletion
while visiting another island, and identity change between classification and confirmation.
Existing confirmed deletion cleanup and keyboard focus tests must continue to pass. No request
in these tests may reach a real account service. Capture the new disclosure in a browser fixture.

## Local verification

The new classification/strict-flag/scope cases and owned-disclosure journey failed before the
implementation. The corrected focused selection passed 38 tests across six files:

```sh
cd frontend
npm test -- --maxWorkers=1 tests/real-account-profile.test.js tests/account-owned-island-dom.test.js \
  tests/account-focus.test.js tests/real-account-cleanup.test.js \
  tests/real-account-action-boundaries.test.js tests/account.test.js
npm run build
```

The production build and spoiler guard passed (256 text files, 12 protected lines). The
[phone disclosure](../docs/evidence/MP-ECO-account-deletion/README.md) was regenerated and visually
inspected. Scoped whitespace review passed. The tests use synthetic classification and deletion
responses; they do not delete a real account or establish backend lifecycle acceptance.
