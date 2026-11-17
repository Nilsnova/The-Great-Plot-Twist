# T60 shared recovery integrated regression evidence

This folder records local evidence for issue #126. No live database, browser account, deployment,
feature activation or real credentials are used.

## Current integrated checkpoint

The integrated focused API, SQL and replay slice passes. It uses the latest tested T55 contract and
canonical snapshot fixtures; assertions and server limits were left intact.

**Source revisions:** T60 baseline `76c9764b`; T55 foundation `72996af7`, API revision fence
`81171490`, snapshot schema/API `941703df`, finish response `cb181055`, lifecycle/expiry SQL
`9d4d4b6c` and `14a1841f`, saved-v1 flag-off start `22026006`, canonical mutation fixtures
`f16a46a1` and `0dbfcae5`, mutation hooks `3b9c289e` and `cc519114`; T56 paid repair `a4d4fe5a`;
T57 replay modules `80b79c22` and fixed-seal reader `aad93866`; T55 contract notes `704f7ea5`,
stateless SQL paging `db9cd0d4`, HTTP page adapter `081f5e1b`, and input response contract `583b9802`;
T55 stateless contract documentation `d260bfd6`; T58 integrated UI/evidence `a3ae783b`; T59
integrated card/indicator UI `ba0d6cae`; T55 version compatibility notes `097029f0`; and T60 HTTP
reconnect regression `d6b686e6`.
T60 API/PG/replay harness base commit `5ebbd657` with expiry/flag-off coverage and release docs in
`825d2c56` and `9e2e55b8`; final integrated branch verification at `dcc5a89b`; passive multiplayer
failure diagnostics at `d19570be`.

## Final integrated verification and multiplayer result

On `dcc5a89b`, the full frontend suite passed 3,694 tests across 322 files; the backend suite
excluding the separately verified unchanged settings-contract matrix passed 12,461 and skipped 293;
that matrix passed 524,322. The complete island SQL suite passed 368, the focused API/transport
suite passed 140, build and spoiler guard passed, and Ruff plus formatting for all 53 changed Python
files passed. The SQL/API counts are from the exact runtime code; subsequent backend changes were
documentation or AST-identical formatting. These are local checks, not CI statuses.

The original `npm run test:mp` run on `dcc5a89b` timed out after 240 seconds waiting for the host's
wave break, with its wave state already `null`. The same command and local Chromium setup on an
archive of exact main `a09787c` failed at the same host-break wait with `wave=null` and no page
errors. A single bounded diagnostic retry on `d19570be` used the unchanged script/fixture seed
setting, gameplay, assertions and timeout while recording passive lifecycle transitions; no numeric
seed value was separately recorded. The host trace showed `wave_finished` twice
for `fake-wave-1` with `survived:false`, then a `done:true`/`ended` state and controller stop; no
`pause:true` or break state was observed. The smoke flow's unconditional wait for a break after that
lost-wave outcome explains this timeout; it is not evidence of a recovery or break regression. The
second page's `survived` value was not retained as a separate artifact, so no claim is made about
its outcome. At that checkpoint the multiplayer check remained failed, and the diagnostic did not establish why the
host lost; the later browser follow-up below is a separate result. No gameplay behavior, seed, timeout or test assertion was changed. Passive failure
logging was syntax-checked with `node --check scripts/check-multiplayer.js`; it is not included in
the full frontend test result above.

**Reproduction commands** (run from the indicated directories; output paths are local logs):

```bash
# frontend/
npm test > /tmp/t60-final-frontend-dcc5a89b.log 2>&1
npm run build > /tmp/t60-final-build-dcc5a89b.log 2>&1

# backend/
UV_CACHE_DIR=/tmp/t55-uv-cache nice -n 10 uv run pytest -q \
  --ignore=server/tests/correctness/test_settings_contract.py \
  > /tmp/t60-final-backend-dcc5a89b.log 2>&1
UV_CACHE_DIR=/tmp/t55-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver \
  --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql \
  > /tmp/t60-final-island-sql-795eaf47.log 2>&1
```

The unchanged 524,322-case settings-contract matrix was separately verified; its exact invocation
is not included here. The browser run used an ephemeral executable wrapper because the local
Chromium install required flags in this environment. To reproduce the launch setup from
`frontend/`:

```bash
cat >/tmp/t60-local-chromium <<'EOF'
#!/bin/sh
exec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader "$@"
EOF
chmod +x /tmp/t60-local-chromium
CHROME_PATH=/tmp/t60-local-chromium npm run test:mp -- /tmp/t60-mp-repro
```

The integrated smoke command used `/tmp/t60-mp-dcc5a89b`; the exact-main baseline used the same
wrapper with its own archive checkout and `/tmp/t60-main-mp-a09787c` output path.

**Strict API/replay command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_http_pg.py
```

**Result:** 1 passed in 11.94 seconds. It applies the full repository migration chain twice to the
existing disposable Unix-socket PostgreSQL fixture. A synthetic owner and member authenticate
through a fake verifier; actual FastAPI route services call the local SupabaseAdmin adapter over
the same scratch connection used by the fixture. Local flags are `islands,structure_recovery`.

The route sequence starts a v1 wave, joins the member, reads the owner’s current wave, and checks
that structure HP stays fixed through preparation and combat. It rejects a health checkpoint before
the paid event is sealed, pays one repair through the actual route, and reads the journal. The member
then reconnects as the same actor with a fresh `after=0` request and receives the prefix again. The
owner appends an input through the actual HTTP route; a fixed read using the earlier
`(headSeq,sealedThroughTick)` still returns the exact old prefix after the journal head advances.
The member’s old fixed page accepts its health checkpoint, and two independent production Node
replay consumers replay the actual fresh HTTP reconnect page using the unmodified
`recovery-snapshot.js` and `wave-replay.js` modules. After a later sealed tick, the test reads the new
input suffix, submits damage, retries the old repair UID and verifies the immutable original receipt,
unchanged wallet/use count, and no healing. It finishes through the API with canonical closed HP of 750,000,
checks between-wave healing resumes, then disables new-v1 admission and verifies the saved v1 island
can start another protocol-2 wave with a fresh three-use quota. A stale paid quote after the second
wave expires settles the wave without charge; its later API finish returns zero loot and the same
closed HP, with no owner credit.

Only disposable timestamps are moved to put the synthetic wave into combat, cross the minimum finish
time and place a second wave just beyond expiry. Short real sleeps verify pause and resume behavior.
No product timeouts, assertions or server thresholds are changed. The JavaScript check imports the production snapshot
and replay modules directly; it does not run the browser or the T59 authenticated frontend transport.
The HTTP path repairs one wall. Broader SQL regressions exercise the other paid quota, old-UID,
final-slot race and mutation cases.

**Combined focused SQL/API command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_api_sql.py \
  server/tests/island_sql/test_structure_recovery_mutations_sql.py \
  server/tests/island_sql/test_structure_recovery_schema_sql.py \
  server/tests/island_sql/test_structure_repair_sql.py \
  server/tests/island_sql/test_structure_recovery_http_pg.py
```

**Historical result:** the earlier combined focused SQL/API command passed 71 tests in 14.42 seconds
before stateless fixed-seal paging.

**Full island SQL sweep:** the complete `server/tests/island_sql` folder passed 367 tests in 33.98
seconds on code commit `fafd000f`, before the stateless page SQL/API changes. The current full sweep
on `795eaf47` passed 368 in 34.59 seconds.

**Focused Python route/transport command** (from `backend/`):

```bash
UV_CACHE_DIR=/tmp/t55-uv-cache uv run pytest -q \
  server/tests/test_wave_recovery_routes.py \
  server/tests/test_wave_recovery_transport.py \
  server/tests/test_structure_recovery_routes.py \
  server/tests/test_structure_repair_routes.py \
  server/tests/test_wave_routes.py \
  server/tests/test_captain_skills_routes.py
```

**Result:** 140 passed in 24.60 seconds. These are request/model/transport tests with local fakes;
the actual API-to-Postgres path is the dedicated HTTP fixture above.

The narrow adapter allowlists only the local tables and RPCs needed by these calls. It does not
read environment credentials, connect to a hosted Supabase instance, or create a network client.
No screenshot is applicable because the tested slice has no browser UI path.

**Known compatibility limit outside this fixture:** on a saved v1 island, a built `cannon_8` or
`culverin` may be filtered from the snapshot template when `more_tower_spots` or `defenses_v2` is
off. The database then rejects the incomplete snapshot with `recovery_snapshot_structure_mismatch`;
it does not silently omit the built structure. This fixture uses one wall and does not prove that
flag combination. The all-built D060 capability behavior remains T55 work.

For separate deterministic simulator-only repair balance coverage, see the
[T57 diagnostic report](../T57-wave-recovery/README.md); it does not prove API, SQL or multiplayer
authority.

## Journal volume and retention diagnostic

The bounded diagnostic uses the real `recovery_wave_join`, `recovery_wave_inputs` and
`recovery_wave_events_page` PostgreSQL functions from the disposable local Unix-socket fixture.
Four synthetic clients each append 2,500 commands (10,000 total) in valid batches of up to 32;
three participant-join events bring the fixed journal head to 10,003. It then drains that captured
head in 40 pages of at most 256 events, checking sequence continuity and an unchanged sealed-tick
watermark.

**Source:** `backend/server/tests/island_sql/test_structure_recovery_journal_budget_sql.py`, using
`20261117020000_structure_recovery.sql` and `20261117040000_structure_recovery_api.sql`.

**Reproduce (from `backend/`):**

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_journal_budget_sql.py
```

To explicitly regenerate `journal-budget.json`, run the same command with
`WRITE_RECOVERY_DIAGNOSTIC=1`. Regular test runs do not write artifacts.

**Measured result:** 1 passed. PostgreSQL 16.2 stored 2,840,450 bytes of JSON payload columns and
4,120,768 bytes of event tuples for this wave. The scratch database reported 4,317,184 bytes for the
event table and 6,529,024 bytes for the table plus indexes/TOAST. The three named event indexes
reported 2,179,072 bytes; the fixed head was 10,003. In this run, mean page time was 11.169 ms
(maximum 22.467 ms); mean batch RPC time was 7.460 ms (p95 14.727 ms). These in-process timings
exclude network latency. Relation and index sizes are global scratch-database allocated bytes, not
isolated per-wave index attribution. The full measured record is in
[journal-budget.json](journal-budget.json).

The API has per-player, per-process HTTP token buckets: input and health writes share a refill rate
of 8 requests/second with a burst capacity of 12; event reads refill at 8 requests/second with a
burst capacity of 8. The four-client, 4 Hz one-command scenario is 14,400 input events over 900
seconds; filling each 4 Hz request with the maximum 32 inputs gives 460,800. For comparison, one
process serving four players at the full 8 write tokens/second, with every write token used for a
32-input batch for 900 seconds, could admit up to 923,136 input rows including each player's
12-token initial burst. These are scenarios, not a durable global bound: input and health share the
write bucket, each application process has its own buckets, and this SQL diagnostic bypasses the
HTTP buckets entirely. It does not measure HTTP throttling, multiple-worker behavior or production
capacity.

The migrations keep the event journal append-only; there is no automatic journal cleanup or
retention cap. Wave-history growth therefore has no durable global per-wave journal cap or retention
policy yet. Activation should wait for an explicit operating-budget and retention decision.

## Lifecycle draft probe

Before the SQL owner committed the lifecycle work, I copied read-only draft snapshots into the
working tree as temporary untracked test inputs. Their source SHA-256 hashes were:

- `20261117025000_legacy_wave_locks.sql`: `2572253fbb3b7cc09381719a897eb8b8970cabd984c184139611c7f62e105009`
- `20261117040000_structure_recovery_api.sql`: `8e9f3604e35388a0d1157719a3e4ae748f1e54a29145177bb8c6afbf85088d23`
- `test_structure_recovery_api_sql.py`: `fce6122918525682fae1bee2b05c6234ffca6955727e8597c3fc773a86eb6149`

The command used was:

```bash
UV_CACHE_DIR=/tmp/t60-uv-cache CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_structure_recovery_api_sql.py \
  server/tests/island_sql/test_structure_recovery_http_pg.py \
  server/tests/island_sql/test_structure_recovery_schema_sql.py \
  server/tests/island_sql/test_structure_repair_sql.py
```

**Result:** 51 passed, 4 failed. Two failures exposed that new protocol-2 join responses omitted
`lastActorCounter: 0` and that the new join RPC fell through to the legacy `wave_join` client
version guard, returning `client_update_required` for a member. The HTTP test confirmed the same
join failure after a real v2 start. The schema test found the draft granted `service_role` direct
`UPDATE` on `recovery_wave_participants`, contrary to the foundation's explicit privilege check.
The remaining finish test also refused the participant join. These were reported to the SQL
owners; no assertion was changed. This draft probe is diagnostic evidence only and is not counted
as a passing lifecycle check.

## 2026-11-17 local multiplayer browser follow-up

The historical multiplayer failure above describes the earlier integrated checkpoint on
`dcc5a89b`; it is preserved as recorded. A later harness-only follow-up completed the documented
multiplayer browser journey on source SHA-256
`41e8df74dfb3db365dded59ef9166716d648040b2bc5e760ee7a07c80cf2152a` (harness source was reviewed
and committed as `d48f1d4084d1d706a3e8216a9ab9ed3f61274c4d`). It used local fake room members and an
ephemeral local Chromium launcher, not a real account or hosted protocol-2/database transport.

From `frontend/`, with dependencies installed from the repository lockfile:

```bash
env -u TEST_URL CHROME_PATH=/tmp/t60-local-chromium npm run test:mp -- /tmp/t60-browser-final-41e8df74
```

The command exited 0; the [saved full output](browser-followup/full-run-output.txt) is copied unchanged from `/tmp/t60-browser-final-41e8df74.log`. The run retained
the original seed, game rules, timeouts and assertions. It passed cooperative build/upgrade/research/
demolish, captain fall/revive and shared health, a held eight-second break, cross-page loot and
upgrade state, ship-fire/militia/event samples, mid-wave joins, own and teammate musket poses at
1280×720 and 375×812, four-page boss practice/late-join checks, and shared finisher participation
and outcome. The runner reported `check-multiplayer: OK (4 pages)`.

The harness repairs the local fixture's defense and observation sequence using normal captain
controls: it resumes auto-blade after the deliberate fall/revive assertion, defends the first wave,
uses contextual fire during later ship encounters so close boarders still receive normal cutlass
defense, and arms the existing pose observation before firing. It does not force simulation health,
victory, clocks or acceptance. The pose observer retains the original three-second bound, exact mesh assertions and both viewport
checks, and additionally requires a fresh event from the expected actor to the selected target. A separate focused
four-page late-wave-4 pose run at the same source revision also passed, including the desktop/phone
screenshot workloads. Pose success is established by the runtime event and mesh assertions; the
screenshots are taken after observation and may miss the short-lived pose. Earlier failures at
revisions `9ed5f06a`, `62b3b911` and `cec9164e` remain
diagnostic failures and were not relabeled as passes.

Selected full-run captures are in
[`browser-followup/full-run/`](browser-followup/full-run/): paused break, four-member mid-wave
game view after joining, own and teammate phone context following pose observation, finisher haul, and game view after the shared outcome. The focused
four-page late-wave pose captures are in
[`browser-followup/targeted-pose/four-page-late-wave4/`](browser-followup/targeted-pose/four-page-late-wave4/).
These local browser screenshots and fake-room assertions do not prove hosted realtime delivery,
authenticated protocol-2 transport, database persistence, physical-device behavior or release
readiness. No feature flag was activated. The saved-v1 D060/culverin compatibility outcome is approved,
but its implementation [PR #238](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/238) is closed
without merging. Operating-budget/retention and release decisions remain open.


### Review evidence and synchronization

| Capture | What it shows |
|---|---|
| [Held break](browser-followup/full-run/04-paused-break-me.png) | The local host has paused the eight-second break. |
| [Running wave](browser-followup/full-run/05-four-captains-mid-wave-me.png) | Wave 4 after the visitors join; roster membership is asserted in the output, not displayed in this image. |
| [Phone context](browser-followup/full-run/05b-musket-pose-own-375x812.png) | Phone layout after the runtime musket observation; this image alone does not prove a short animation. |
| [Finisher task](browser-followup/full-run/07-finisher-haul-mid-task-me.png) | The local haul task after the midpoint state was recorded. |
| [After the finisher](browser-followup/full-run/07-finisher-outcome-me.png) | The game view after the task; the output records all four pages reporting `finisher_won`, 244/224. |

After the full browser run, `main` at `2f81f276` was merged into this task branch. Its new Tab overview
is inactive unless Tab is held; the browser harness, default camera path and recovery code were not
changed by this synchronization. All committed STATUS lines from both parents were preserved.
`node --check scripts/check-multiplayer.js` passed, and the incoming Tab/tutorial checks passed
19 tests across three files in 7.43 seconds. The unchanged long browser journey was not rerun solely
for that synchronization. No full-suite or settings-matrix rerun is claimed for this harness/docs follow-up.
