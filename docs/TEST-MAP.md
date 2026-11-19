# Test map

> **What this file is:** per area, which tests cover it, the exact command, how many there are and
> what they do **not** cover (task E1 in [FINAL-ROADMAP.md](FINAL-ROADMAP.md)). It backs question Q2
> of the [walkthrough](WALKTHROUGH.md#q2-what-do-the-tests-cover-and-what-do-they-not-cover).
>
> **Counts** were taken on Wed 11 Nov 2026 at `b0b6fd3` with `ls` and `grep -c`, not by running the
> suites; the island, pirate and tower-defense rows and the totals were refreshed at `e9cbf5d` (evening): a "test" is one `def test_` (Python) or one `it(`/`test(` line (Vitest). Parametrized
> cases count once, so the number of cases that run is higher.

## How to read it

- Every command starts in the repository root. `cd backend` or `cd frontend` comes first, as in [ENGINEERING.md, section 3](ENGINEERING.md#3-commands).
- **Read the evidence layer.** Default unit/component tests inject outside services,
  sign-in, transport or clocks. Opt-in SQL checks execute real disposable PostgreSQL.
  Separately recorded authenticated acceptance uses actual Auth, REST and Realtime;
  it is not established by a fake transport or an emulated phone viewport.
- **No CI.** The only GitHub Actions workflow is the keep-alive ([.github/workflows/keepalive.yml](../.github/workflows/keepalive.yml)). Each pull request pastes its own results ([CONTRIBUTING.md](../CONTRIBUTING.md)).

The integrated shared economy has a separate [MP-ECO-20 acceptance matrix](economy/ACCEPTANCE.md).
Its [offline assertion/evidence tests](../backend/server/tests/test_economy_acceptance.py)
run with `cd backend && uv run pytest -q server/tests/test_economy_acceptance.py`.
They validate decimal treasury reconciliation and evidence metadata, using synthetic
inputs. They do not verify treasury RPCs, hosted authentication or the integrated
multiplayer economy. Runtime SQL, authenticated-browser and physical-device evidence
remain separate; the existing fake-room `test:mp` check does not establish them.

## Shared economy integration checkpoint — 19 November 2026

Application/test source inventory: `9f107a6cbb57e0a9f01b1f4b8fb60da5d19dacad`. Canonical
authority, native sessions/journal/closure worker, personal Captain progression,
domain transactions, reset/deletion and coordinated clients are present. The shared
snapshot advertises arsenal/session/repair/reset/market/match; move remains unavailable.
The source contains 107 migrations, including the
[accepted-prefix freshness boundary](../supabase/migrations/20261119014418_shared_revival_checkpoint_freshness.sql),
and the client includes the [native clock and incomplete-hold correction](../specs/MP-ECO-11-canonical-client.md#native-clock-correction-and-incomplete-holds).
These source facts and the rows below locate checks. Completed backend,
frontend/component and build results retain their exact sources; the authenticated
rendered scenario matrix has its own explicit status.

| Layer / area | Checks | Boundary |
|---|---|---|
| Python HTTP and coherent reads | [core routes](../backend/server/tests/test_core_economy_routes.py), [shared snapshots](../backend/server/tests/test_shared_snapshot.py), [session routes](../backend/server/tests/test_shared_session_routes.py), [wave routes](../backend/server/tests/test_shared_wave_routes.py) | Strict capability/origin/controller DTOs, verified-actor forwarding, quote and replay handling; fake Auth/Admin remain explicit. |
| Native canonical SQL | [control](../backend/server/tests/island_sql/test_shared_session_control_sql.py), [accepted bell/journal](../backend/server/tests/island_sql/test_shared_session_wave_sql.py), [terminal effects](../backend/server/tests/island_sql/test_shared_session_close_sql.py), [worker](../backend/server/tests/island_sql/test_shared_session_worker_sql.py) | Actual provider and producer RPCs. Trusted templates, combat reports, selected clock/state fixtures and the worker's SQL transport adapter are qualified per module; these are not provider-authenticated clients. |
| Domain SQL and races | [cross-domain acceptance](../backend/server/tests/island_sql/test_shared_domain_acceptance_sql.py), [native combat](../backend/server/tests/island_sql/test_shared_combat_native_sql.py), [revival journal](../backend/server/tests/island_sql/test_shared_revival_journal_sql.py) | Real treasury/registry/assets, rollback and concurrency. Domain-unit helpers seed canonical facts without replacing the provider. Native revival uses real producer/hold time but synthetic accepted combat reports; it does not verify every simulated hit. |
| Lifecycle SQL | [reset/deletion](../backend/server/tests/island_sql/test_shared_lifecycle_transactions_sql.py), [committed lock races](../backend/server/tests/island_sql/test_shared_lifecycle_races_sql.py), [native lifecycle](../backend/server/tests/island_sql/test_shared_lifecycle_native_sql.py), [membership](../backend/server/tests/island_sql/test_canonical_membership_lifecycle_sql.py) | Actual lifecycle transactions, original-account retention, private aliases and lock order; isolated database setup is not actual provider account deletion. |
| Client/component | [session client](../frontend/tests/island/shared-session-client.test.js), [wave API](../frontend/tests/island/shared-wave-api.test.js), [shared core](../frontend/tests/island/shared-core.test.js), [arsenal](../frontend/tests/island/shared-arsenal.test.js), [wagers](../frontend/tests/harbor/shared-wagers-http.test.js) | Real client modules with controlled HTTP/auth/channel inputs; browser DOM checks remain component evidence. |

Recorded checkpoints must retain their exact sources:

| Source and check | Actual result | Limit |
|---|---|---|
| `799242b4a494f8760136bead5b2ed02c461c0bdd`, broad backend excluding the documented unchanged exhaustive settings matrix, disposable SQL enabled | **15,185 passed, 28 failed, 5 skipped in 1003.19s**, exit 1 | A failed historical checkpoint, not the final result. The five skips lacked the Node/client dependencies used by place-registry checks. |
| `b696faf485443444cf4ffc98e080e51b95ca17f8` plus `491265ff` and `374df4c6`, affected modules after test/dev-tool compatibility alignment | **121 passed in 64.35s**, then **98 passed in 44.63s**, both exit 0, no skips | 219 distinct affected cases include all 28 formerly failing nodes. These bounded runs do not relabel the earlier broad run or replace a final aggregate run. |
| `5107d5b49516e34cd3ac51075d12321b6ebcbc24`, earlier broad backend | Interrupted, exit 130: **5,029 passed, 5 failed, 116 errors**, no skips | Partial counts only. Three semantic assertions were investigated separately; confirmed disk exhaustion invalidated the remaining affected execution. This is not a completed pass. |
| `581b65db61692cc1a56c7e1bcff4eedfd3caffc9`, earlier full frontend | **5,262 passed, 30 failed, 121 skipped**, exit 1; separate normal build exit 0 | The frontend run remains failed, including explicit ENOSPC failures and a paid-revival assertion. Its successful build does not establish a current-candidate frontend/build pass. |
| `37570bf9e5e3c67ebd2eb1a735c9df3c709f3b80`, full backend excluding only the documented unchanged exhaustive settings matrix, disposable SQL enabled | **15,284 passed in 958.28s**, exit 0, zero failures/errors/skips; full Ruff and **107** migration parse/unique-version checks passed | All five registry cases and both calm/storm SQL → Python → Node decoder cases executed. Backend/static evidence only; no new authenticated browser acceptance is implied. |
| `b239bdf094d132fc57969fb31f652f106db8abc5`, comparison with tested `37570bf9` | Backend tree and all 825 backend blobs/modes, 107 migration hashes, 13 decoder-closure hashes and both dependency locks match exactly; repository diff is only `frontend/src/campaign/tutorials.json` | Comparison, not another test run. Keep the backend result assigned to `37570bf9`; subsequent frontend/build and rendered outcomes are separate rows. |
| `b239bdf0`, earlier unfiltered frontend | **5,464 passed, one failed, no skips**, exit 1, 1172.06s | The Nearby desktop whole-test 20-second timeout remains a failed result. A same-budget diagnostic completed the E/Use interactions before the deadline interrupted remaining assertions; no production fix is inferred. |
| `9f107a6cbb57e0a9f01b1f4b8fb60da5d19dacad`, full unfiltered one-worker frontend, then standard build | **5,465 passed / 507 files in 1229.67s**, exit 0, zero failures/errors/skips; standard build exit 0 | Clean source and unchanged locks/migrations. The explicit Nearby per-test budget matches existing full-game tests; assertions and fixtures are unchanged. This is frontend/component/build evidence. |
| `37570bf9` → `9f107a6c`, backend comparison; `b239bdf0` → `9f107a6c`, production frontend comparison | Complete backend tree/all 825 blobs/modes, 107 SQL hashes, 13 decoder hashes and both locks exact; all 1,484 non-test frontend blobs/modes exact | Comparison, not another run or a changed source label. Authenticated observations retain application source `b239bdf0` and their own outcomes. |
| `a6de304bbeb5f45983e18d043c848c71a4566609`, fresh 106-migration local stack and three actual registered Chromium/SDK users | Limited native HTTP/WSS probe completed: real attachment/adoption, bell/replay/input, outsider denial, topic isolation across admission/departure and terminal observation after last withdrawal | Service-only admission of a fresh island is labeled setup. SDK channels manually follow metadata; rendered gameplay, automatic product topic changes and the complete scenario matrix are not verified. |
| `a8fa5de1`, rendered native combat on the subsequent 107-migration local provider | Two genuine accepted WON receipts/personal completions; independent committed-state inspection found one 35-coin original-account wave credit, treasury 100 → 135, confirmed participation and released assignments/reservation | Personal wallets stayed unchanged. This observed wave-income case does not establish free revival, automatic pacing or the complete scenario matrix. |
| `5a111e05`, rendered idle owner reset on the 107-migration local provider | Reset changed account/epoch and owner's accepted private topic; automatic member session/topic reacquisition **failed** | Preserve this failure. The subsequent reconciliation verification is a separate row below. |
| `b239bdf0`, subsequent actual Settings reset on the 107-migration local provider | Both honest clients automatically acquired replacement session/topic with accepted product WebSocket joins; cached-old-socket isolation, stale-proof refusal, original UID replay and personal Captain/wallet preservation passed | Cached old SDK sockets were established before reset; post-reset new-topic/fresh-revoked-old diagnostic joins waited for both replacement product joins. Owner deletion was disabled; other membership/deletion transitions retain separate status. The earlier failed reset remains failed. |
| `b239bdf0`, rendered free-revival attempt on the 107-migration local provider | Ordinary guide dismissal/movement and enemy-caused fall observed; ordered helper hold-start input POST received HTTP 200; both Captains then fell before a complete hold was observed and both native loss receipts settled | **Failed** free-revival scenario. No completed revival or committed zero-cost accounting pass is claimed. |
| `b239bdf0`, subsequent actual free teammate revival and independent committed accounting on the 107-migration local provider | Both clients observed the same fall at 23.45 and journal revival at 37.7/50 HP; repeated requests retained one original body/UID and one immutable receipt/journal effect. Before terminal, treasury 200, both personal wallets/ledgers and paid repair quota stayed unchanged, with no financial child/direct-UID debit | Free revival/accounting **passed**. The subsequent natural loss settled both own native receipts; automatic pacing and other matrix scenarios remain separate. The earlier failed attempt remains failed. |
| `b239bdf0`, actual defended win, break controls and worker auto-next on the 107-migration local provider | Three current quoted cannon buys (200 → 110); paired distinct own WON receipts; paused Auto next held for nine real seconds, then ordinary Resume; one non-player SYS start after deadline rendered on both clients | **Passed** for an eligible connected leader. Exactly one initial browser start POST/UID and no extra start are proved by the complete browser trace, not the worker observer alone. No unconnected-leader auto-start claim. |
| `b239bdf0`, regular due-worker closure after both pacing browsers closed | After both actual last-seen +60-second deadlines, the unchanged worker closed that SYS attempt abandoned/zero loot, withdrew slots and released controls/assignments; quiescent reread matched | Real elapsed timestamps; no injected combat state, clock changes or forced finish. This separate closure is not a win or a new grant. |
| `b239bdf0`, separate actual local test-owned Account deletion UI | Initial confirmation returned 409; explicit additional account-and-island confirmation returned 200. Peer automatically cleared the island room and kept personal Captain/progress/wallet; cached owner API returned exact 404 `player_not_set_up` and independent Auth returned 403 | **Passed** for this temporary local owner. No reset, Auto next toggle or new grant. No immediate cache-eviction, universal 401, malicious cached-socket deletion or complete lifecycle-matrix claim. |

### Reproducible local provider follow-up

The [isolated provider harness](../specs/MP-ECO-20-authenticated-provider-harness.md)
runs the actual production API/frontend with official Auth, PostgREST and private
Realtime on disposable PostgreSQL 17 Alpine. New observations use application
source `3bdd8eda16470795fdedd68c42fffab54e5f2ced` and all 107 then-current
migrations. Small-image extension/hosting limits and explicit fresh-island
admission remain documented. Offline checks are separate: seven Python boundary
tests and two Node endpoint/source-boundary tests passed; Ruff and new script syntax
checks passed. These do not establish provider acceptance by themselves.

The table accounts for every required scenario. **Partial** means useful evidence
exists but the complete row is not established on one current source. Retained
`b239bdf0` results above keep that original source and were not rerun; current
frontend applicability requires component-specific comparison.

| Scenario | Current or retained evidence | Remaining boundary |
|---|---|---|
| `treasury-concurrent-spending` | Partial: current two real members raced three quoted purchases for the last 20 coins; two committed and one returned 409; independent ledger/wallet reconciliation | Cross-domain purchase/wager/repair competition and concurrent grants/reset remain separate. The fresh 30-coin admission was explicit last-funds setup. |
| `settlement-source-account` | Partial: current registered-session reset with real-clock settlement credited retired origin 402/0 while replacement stayed 200/0; repeated receipts and independent ledgers matched | Old personal commitments and the full leave/change-island combination remain separate. Market source facts were explicit fixtures. |
| `wave-income-once` | Partial: retained `a8fa5de1` paired 35-coin win and `b239bdf0` defended win | Current multiple-finish/bonus/terminal-race combinations. |
| `personal-participation` | Partial: canonical SQL and retained confirmed-combat completion | Current spectator/countdown/absent negatives and recovery after departure/reset. |
| `engineer-generation` | Partial: current free role/respec, two 9-coin discounted buys with one pending generation, blocked role change and legacy-route evasion; unchanged wallets | Saved eligibility fixtures do not establish earned milestones or delayed completion of a superseded generation. |
| `arsenal-holder-lifecycle` | Partial: current island unlock refusal/acceptance, exact 60-coin buy/replay, one-copy two-member take race and stale-tenure refusal | Complete current capacity/excess/frozen-loadout/departure/grace/deletion combination. Capacity 20 was displayed/read, not filled in this case. |
| `repairs-free-revival` | Partial: retained `b239bdf0` genuine free revival/accounting and natural loss; current paid owner repair and exact retry were observed in a separate incomplete follow-up | Retained revival had treasury 200. Paid-repair follow-up stopped at member reconnect/promotion; no completed row is claimed. Current zero-coin revival and full repair quota/order remain separate. |
| `unrestricted-bets` | Partial: current one-coin and all-remaining 199-coin same-event stakes, two-coin winnings reinvestment, exact 200/changed 409 retries and zero-available refusal; separate all-in 180 loss | Actual five-minute deadlines elapsed; trusted readings were explicit fixtures and genuine fresh opener returned `prices_stale`. Fees, cross-domain races and excluded-product combinations remain separate. |
| `ship-reward-cap` | Partial: cap/idempotency/source-account SQL | Current authenticated ten-member/parallel-record/old-origin combination. |
| `member-owner-permissions` | Partial: current member build/demolition/bell, member reset 403, owner reset; outsider mutation 403, forged actor 422; actual canonical private channel owner/member success and outsider refusal | Full invited guest, research-change and session-succession combinations remain separate. Private SDK delivery is not automatic rendered-client lifecycle proof. |
| `reset-deletion` | Partial: current zero-funds owner reset/replay gave one 200 grant, old account 0; retained actual Account deletion | Current authenticated open old-epoch settlement and member deletion/copy return. |
| `legacy-class-contexts` | Partial: existing legacy/class/excluded-product regression coverage | Current authenticated context switches and prerequisite-read-failure no-fallback cases. |
| `old-client-rejection` | Partial: current provider passed missing/unsupported capability reads 409, missing-capability mutation 409, missing epoch 422, authorized first read and outsider/actor forgery refusal; SQL/route checks retained | No older released client binary was launched. Unsupported mutation variants retain separate route-test evidence. |
| `wave-protocol-1` | Partial: legacy/protocol admission SQL and HTTP checks | Current authenticated shared-admission refusal and explicit no-personal-payout fallback. |
| `wave-protocol-2` | Partial: current zero-funds rendered native bell/natural loss; current session duplicate/cross-island refusal, real grace reconnect and withdrawal; retained Auto next and expiry | Session reconnect retained healthy HP, position and an empty cooldown set. Fallen-state and nonempty-cooldown persistence are not inferred. |

The [current zero-funds evidence](evidence/MP-ECO-22/authenticated-combined-result.json)
records real registered identities and production transactions from 15:12:26Z to
15:20:04Z on 19 November 2026. Harness hash
`69ded16a9514aa6072080f7c6f743865917935add1fc9c6fcadfab3b28c98688` identifies
the executed scenario. Saved advanced island state and trusted market readings
were explicit setup; the five-minute deadline, rendered member bell, enemy-caused
wave 31 loss, member 403 and owner reset/replay were actual observations. Clock,
HP and outcome were not edited during the scene. The separate session evidence is
in `docs/evidence/MP-ECO-20-sessions/result.json`, recorded from 15:38:50Z to
15:41:00Z with unchanged helper hashes; its source/transport partition limits are
explicit. New [core and personal/arsenal evidence](evidence/MP-ECO-20-local-provider/README.md)
is authenticated browser transport,
not rendered-card passes. Earlier successful rendered zero-funds actions retain
their own evidence. The [registered-session origin case](evidence/MP-ECO-20-origins-provider/README.md)
adds real-clock origin settlement and reinvestment with explicit market fixtures;
no natural fresh-provider opening is claimed. This does not complete #505.

### Explicit candidate and current authority follow-up

The [current authority evidence](evidence/MP-ECO-20-provider-authority/README.md)
pins full candidate `64ee02b360d68836b2de9247121ab47dc6a3ecbf`, with 108 migrations.
The harness now requires `runtime.expectedCommit` and records/checks the actual
running API/frontend source. Historical `3bdd8eda` results above keep their source.

| Current check | Actual result and layer | Limit |
|---|---|---|
| Explicit provider configuration and source guards | Nine focused Python tests, two Node guard tests, scoped Ruff and script syntax passed; real GoTrue-to-production verification and independent Chromium session restoration passed | Local provider only; no hosted deployment or broad regression rerun. |
| Registered research/demolition/succession/owner lifecycle | Six authenticated HTTP groups passed, with independent shared-ledger/private-wallet checks | Saved unlock/capital setup is explicit; initialized Captain preservation is separate from earned receipts. |
| Concurrent game creation and reset grants | Three authenticated groups passed: shared starting capital did not multiply, identical reset UID had one effect, different UIDs against one epoch had one winner | This does not perform real save conversion. |
| Genuine anonymous invited member | Real official-provider anonymous identity, normal invite/class admission, guest build/demolition/research change and owner-only reset refusal passed | Separate anonymous-enabled Auth and demo-flag API; the frozen primary context remained unchanged. API-only, not anonymous browser UX. |

Successful wager opening, actual personal participation/Engineer generations,
boss/house reward accounting, full arsenal lifecycle, cross-domain contention and
paid-repair quota retain their own scenario reports and precise boundaries.
Passing this authority slice alone does not close the complete matrix.

### Fifteen-row accounting for candidate `64ee02b3`

The complete declared SHA is `64ee02b360d68836b2de9247121ab47dc6a3ecbf`.
The acceptance procedure requires targeted SQL and authenticated-browser evidence
for each row. A real Node HTTP client or sealed production simulation establishes
its stated Auth/API layer, not a browser observation. The separate combat gate
also explicitly requires a rendered zero-coin revival. Historical browser runs
keep their original source until a relevant source comparison establishes their
applicability. This does not require every counterexample at every layer, a
natural external feed, a physical device or a historical client executable.

| Required scenario | Actual current proof and SQL boundary | Remaining browser/combined boundary |
|---|---|---|
| `treasury-concurrent-spending` | Actual Auth construction/wager and naturally damaged repair/wager races, observed scope-lock overlap, no personal fallback; four current disposable-SQL cases. Concurrent create/same-UID and distinct-UID reset grants passed with one replacement account/grant. | New contention/grant drivers are API-only. Current quota supplies browser repair evidence for its own slice; it does not render these contention races. |
| `settlement-source-account` | Actual HTTP one-coin/all-funds/reinvestment with both real 300-second deadlines, owner reset and old-account-only settlement; original personal duel recipient is independently tested. Retained lifecycle SQL keeps its source. | New complete origin combinations are API-only. Targeted browser applicability and leave/change-island combinations retain their separate status. |
| `wave-income-once` | Current API/sealed-simulation wave-two win credited 45 once; late victory could not reverse a saved loss. Natural boss-five/house case credited `(75+50+0)×3=375` once across three participants/six acknowledgments. Current quota has a genuine two-browser 35-coin victory. | Expanded duplicate/bonus combinations are API-only. Retained reward SQL and the targeted current browser slice must keep their exact scope. |
| `personal-participation` | Actual provider combat/disconnect/reconnect, spectator/countdown/absent negatives, departure/reset receipt recovery and duplicate claims passed; participation SQL retains its documented trust boundaries. | New participation matrix uses API/sealed simulation; a complete current authenticated-browser row is not inferred. |
| `engineer-generation` | Real Auth generation C1/C2, discounted purchases, captured/delayed completion, role/respec fences and matching-generation clearing passed. Existing generation SQL is retained, not reported rerun. | The new generation matrix is API-only; historical browser/source applicability remains separate. |
| `arsenal-holder-lifecycle` | Twenty actual purchases included four carried copies; converted-overflow fixture 24 remained intact. Exclusive full swap, stale tenure, frozen loadouts, member leave/deletion and an independent worker's real-grace return all passed, including post-deletion copy competition. SQL races retain their sources. | The comprehensive new lifecycle case explicitly does not render. It does not claim real conversion or a simultaneous deletion/take browser race. |
| `repairs-free-revival` | Current staged two-independent-browser quota observed three 40-coin repairs, fourth `repair_limit_reached`, exact old UID/later damage, member reconnect, natural victory and full current HP with damaged closed HP retained. A separate actual Auth/sealed-simulation zero-bank timed revival passed with one event and no debit/quota. | The interrupted quota driver remains failed; the completed staged observation is separate. The new zero-bank case is API/simulation only; the explicit rendered zero-bank target/hold gate remains pending a separate observation. |
| `unrestricted-bets` | Unchanged production HTTP handlers with explicitly trusted external quote transport accepted 1+1+198 same-event stakes, exact/changed retries, real deadlines, all-proceeds reinvestment and original-account settlement. A genuine admitted anonymous guest's one-coin opening/retry passed. Current RPC/SQL contention is separate. | New full wager cases are API-only; trusted quote fixtures are not natural feeds. No successful browser betting journey is inferred. |
| `ship-reward-cap` | Eleven real registered identities exercised ten-member caps for both games, parallel improvements, 60 exact retries, lower/repeated rounds, foreign-record fences, reset and immutable old receipts. SQL cap coverage remains source-qualified. | API-only with declared saved unlock/wreck and trusted result inputs; no rendered minigame/claim journey is claimed. |
| `member-owner-permissions` | Real registered and genuine anonymous invited members built, demolished and changed research; nonmembers/forged origins failed; session leadership allowed settings but not reset. Current quota supplies actual member-repair browser evidence. | Broad rights/anonymous coverage is API-only. Required UI agreement and applicable historical browser evidence retain separate boundaries. |
| `reset-deletion` | Registered owner reset/retries, concurrent grants, old research receipt replay, real member deletion with pending copies, confirmed owner account/island deletion and continuing personal preservation passed; wager origin isolation passed through HTTP. Retained lifecycle SQL remains separate. | Broad new combinations are API-only. Historical deletion UI/topic-transition evidence is not silently relabeled to this candidate. |
| `legacy-class-contexts` | Actual Auth personal duel recipient, legacy Point purchase/replay, private island context, genuine guest invitation/class admission and excluded-product fences passed. Focused prerequisite-failure tests retain their fake-transport layer. | New context drivers are API-only. No current full browser context or actual backend outage is inferred from injected failure tests. |
| `old-client-rejection` | Actual Auth missing/unsupported capabilities, strict epoch/actor/account proofs, old shared protocol/no native proof and excluded payload refusals passed; route/SQL tests remain distinct. | New probes are API-only. A historical binary is not an additional requirement; applicable targeted browser evidence is still required by the existing procedure. |
| `wave-protocol-1` | Separately configured current production API exercised same/different UID bells, natural production-controller win, exact 35-coin payment/retry, idle-null and shared admission refusal. Current SQL covers expiry with explicit timestamp fixtures. | This compatibility case is API/headless with recovery disabled only in its local settings. No browser or actual 900-second expiry wait is claimed. |
| `wave-protocol-2` | Current quota supplies native browser countdown/reconnect/repair/order/natural closure. Current personal, arsenal/worker and zero-revival cases add real Auth authority/state evidence. Retained session SQL/browser observations keep their sources. | Broader new duplicate/cross-island/fallen/cooldown/grace/withdrawal/pacing combinations remain at their recorded layers; they do not automatically complete the browser row. |

Exact package evidence is recorded under `MP-ECO-20-provider-authority`,
`MP-ECO-20-personal-provider`, `MP-ECO-20-boss-income-provider`,
`MP-ECO-20-zero-revival-provider`, `MP-ECO-20-provider-arsenal`,
`MP-ECO-20-compatibility`, `MP-ECO-20-protocol-one`,
`MP-ECO-20-ship-cap`, `MP-ECO-20-http-wagers` and
`MP-ECO-20-repair-quota` in `docs/evidence`. Their exact source hashes, fixture
boundaries, retained failures and timestamps are authoritative. These bounded
passes improve coverage; **#505 remains open** for the documented browser and
combined-layer completion requirements. No hosted activation is implied.

Before the final pinned backend run, provide Node and frontend dependencies matching
`frontend/package-lock.json` (`cd frontend && npm ci`, or a verified matching local
installation). A source worktree without those packages must report registry skips.
The final command, from the repository root, is:

```bash
cd backend
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --ignore=server/tests/correctness/test_settings_contract.py
```

This command completed at the exact backend source above. Preserve its command,
exit status, JUnit, dependency and migration evidence; later-source applicability
requires the recorded comparison. Full frontend tests/build also completed at
their exact source above; authenticated rendered acceptance remains separate.
The [current acceptance gates](economy/ACCEPTANCE.md#current-integration-and-open-gates)
also require the actual rendered two-player journey and product Realtime transitions.

## 1. Backend unit tests (pytest)

Command for all of them: `cd backend && uv run pytest` (paths `server/tests` and `plot_twist/tests`, set in [backend/pyproject.toml](../backend/pyproject.toml)). One file: `cd backend && uv run pytest -q server/tests/test_wave_routes.py`.

Size: 188 test files under [backend/server/tests/](../backend/server/tests/) (159 at the top, 29 in subfolders, the opt-in SQL files included) and 5 in [backend/plot_twist/tests/](../backend/plot_twist/tests/); about 4,060 test functions in all.

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Islands and waves | `test_island_routes.py`, `test_island_rules.py`, `test_wave_routes.py` | 90 | Prices from `islands.json`, wrong kind or spot, repeats, `feature_off`, budgets, loot caps (boss × 2, house levels), timing refusals, `shipsSunk` bounds | The real SQL (see section 2); whether `survived` is true |
| Tower defense v2 | `test_tower_defense_routes.py` | 35 | Upgrades and `max_level`, `locked` with its wave, crew and captain, co-op builds with `code`, Pirate Point builds, the friend invite (admitted guest, `no_such_island`, budget, `demo_closed`) | Real anonymous sign-in; the browser's simulation |
| Wallet and accounts | `test_wallet.py`, `test_wallet_matches_migration.py`, `test_me.py`, `test_delete_me.py`, `test_saves.py` | 352 | Reasons and directions match the migrations, zero, negative and repeated amounts, delete my data | A real Supabase project |
| Sign-in, guests, hosts | `test_auth*.py`, `test_demo_gate.py`, `test_demo_join.py`, `test_hosts.py` | 125 | Bad and missing tokens, the guest gate, class-code join and its budget, host-only routes | Real GitHub OAuth; the email code with a real inbox |
| Keeper's Lock | `test_lock_routes.py`, `test_lock_rules.py` | 39 | Sky answers, close-enough answers, cache, riddle fallback | Real Vercel geo headers |
| Market (Exchange) | `test_market_*.py` (17 files) | 619 | Binance and Finnhub parsing, stale and closed states, no trade on stale prices, replay | Binance or Finnhub over hours; Finnhub's live key (rejected on 10 Nov, [OPEN-TODOS.md](OPEN-TODOS.md) 4c) |
| Predictions (backend only) | `test_prediction_*.py` (11 files) | 512 | Manifold parsing, recorded fallbacks, stake rules, 15-minute staleness, pools; the game no longer calls these routes (removed from the frontend on 11 Nov at the owner's request, D035) | Real Manifold answers over days |
| Sports | `test_sports_*.py` (7 files) | 51 | football-data.org parsing, the 90-minute result rule (D033), unavailable answers, stakes | Real matches; the international break |
| Weather | `test_weather_*.py`, `test_fog_nights.py` | 260 | Open-Meteo parsing, cache, stale, recorded fallback, weather states | Open-Meteo outages over hours |
| Duels | `test_duels_*.py` (7 files) | 309 | Signals, rounds, secrecy of sealed moves, refusals | Two real phones in one duel |
| App, settings, flags, errors | `test_app.py`, `test_settings.py`, `test_flags.py`, `test_request_policy.py`, `test_adapters_*.py`, `test_keepalive.py` | 185 | Error shape, no-store default, unknown flags stop start-up, adapter pattern | Vercel's real environment variables |
| Abuse and correctness | [abuse/](../backend/server/tests/abuse/), [correctness/](../backend/server/tests/correctness/) | 29 + 37 | Token bounds, hostile saves, economy model, arithmetic and settings boundaries | Load from many real clients |
| Host console | `test_host_console.py` | 11 | Host-only answers, no case data | The deployed console |
| Mystery-era code (unused since D031) | `test_case_*.py`, `test_board_*.py`, `test_finale_*.py`, `test_npc_*.py`, `test_crew*.py`, `test_festival*.py`, `test_islet_*.py` and others | 895 | The case, crews, festival and old islet, still mounted on the server | Nothing new: it leaves with the case cleanup (C1) |
| Story engine | [backend/plot_twist/tests/](../backend/plot_twist/tests/) | 45 | Story engine and its JavaScript parity (skipped without Node.js) | The removed prologue in the browser |

## 2. Backend SQL suites (opt-in)

They build a throwaway PostgreSQL on a Unix socket and apply **all migrations twice**.
Tests use rollback transactions or module-isolated clusters for committed races;
they never read a hosted database URL or credentials
([case_sql/conftest.py](../backend/server/tests/case_sql/conftest.py)). Plain
`uv run pytest` skips these opt-in checks.

Command pattern (from `backend/`):
`CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/<suite>`

| Suite | Files | Tests | What it covers | Extra for the command |
|---|---|---|---|---|
| [island_sql/](../backend/server/tests/island_sql/) | 3 | 48 | `island_open`, `wave_start`, `wave_join`, `wave_finish`, loot caps, one wave per island, `fresh_start.sql`; the tower-defense functions (`island_build`, `island_upgrade`, `island_hire`, `island_captain`, `pp_build`, `pp_upgrade`), levels and unlock checks, boss loot and house levels, the restart rule, four players with their own loot, no new browser rights | none |
| [demo_sql/](../backend/server/tests/demo_sql/) | 2 | 28 | Class code, `demo_guests`, the guest guard in policies | none |
| [sports_sql/](../backend/server/tests/sports_sql/) | 2 | 21 | Atomic stakes and settlement, deletion | none |
| [case_sql/](../backend/server/tests/case_sql/) | 5 | 65 | Case phases 1 to 4 (unused since D031) | none |
| [festival_sql/](../backend/server/tests/festival_sql/) | 1 | 15 | Festival timing and claims (unused since D031) | none |
| [followups_sql/](../backend/server/tests/followups_sql/) | 1 | 11 | Save versions and deletion | add `--with pglast` |
| [group3_sql/](../backend/server/tests/group3_sql/) | 1 | 3 | Schema, wallet directions, server-only grants | none |
| `abuse/test_scratch_postgres.py` | 1 | 26 | Abuse cases on real SQL | run without `CASE_PG_SCRATCH`: `uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q server/tests/abuse/test_scratch_postgres.py` |
| `test_local_server_pg.py`, `test_festival_api_pg.py`, `test_host_console_api_pg.py` | 3 | 5 | The API on top of the real SQL chain | same pattern, give the file path |
| T60 structure recovery integration | [recovery API, mutation, schema, paid-repair and HTTP/PG tests](../backend/server/tests/island_sql/) | Full island SQL suite 368 passed; route/transport suite 140 passed; strict HTTP/replay path 1 passed | Actual FastAPI route → disposable PostgreSQL RPC → production snapshot/replay modules, prep/combat healing pause, same-actor reconnect from `after=0`, fixed `(headSeq,sealedThroughTick)` read after a newer event, dual production replay, sealed journal checkpoints, immutable UID retry, finish/expiry, resumed healing and next-wave quota; saved-v1 next wave still starts when admission is off | The API fixture does not invoke the browser/T59 transport adapter, hosted Supabase, live migration history, physical devices or saved v1 `cannon_8`/culverin while their availability flags are off; see the fail-closed limit in the evidence README |

The bounded journal volume diagnostic is [test_structure_recovery_journal_budget_sql.py](../backend/server/tests/island_sql/test_structure_recovery_journal_budget_sql.py). From `backend/`, run `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_structure_recovery_journal_budget_sql.py`; add `WRITE_RECOVERY_DIAGNOSTIC=1` to explicitly regenerate the report. It measures local append/page volume and relation allocation through SQL, bypassing HTTP token buckets; the [release gate](RELEASE-CHECKLIST.md#t55t60-structure-recovery-release-gate) requires an operating-budget and retention decision before activation.

**Do not cover:** Supabase itself (Auth, the hosted Data API, Realtime policies under real tokens), the live project's applied migration history, and settings in the Supabase dashboard. The manual plan for those is in [supabase/README.md](../supabase/README.md#manual-test-plan).

The T60 command and exact fixture limitations are recorded in [its evidence README](evidence/T60-structure-recovery/README.md). The focused API/replay command is run from `backend/`: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_structure_recovery_http_pg.py`.

The later local fake-room `npm run test:mp` follow-up passed on 2026-11-17; see the [browser evidence](evidence/T60-structure-recovery/README.md#2026-11-17-local-multiplayer-browser-follow-up) for exact source, command and scope. It does not extend the API/PG or hosted transport evidence.

## 3. Frontend unit tests (Vitest)

Command: `cd frontend && npm test` (runs `vitest run`; files `tests/**/*.test.js`, one file at a time, set in [frontend/vite.config.js](../frontend/vite.config.js)). Input only: `npm run test:input`.

Size: 193 test files in [frontend/tests/](../frontend/tests/), about 1,830 `it`/`test` lines (the run before the 11 Nov release reported 2,563 tests, because of `it.each`; one Harbor overview test fails, [OPEN-TODOS.md](OPEN-TODOS.md) section 7).

CW1 adds 15 focused cases in [scattershot-latency.test.js](../frontend/tests/pirates/scattershot-latency.test.js):
`cd frontend && npm test -- tests/pirates/scattershot-latency.test.js`.
They cover moving ships and boarders at cone/range boundaries, the existing two-second
history limit and fallbacks, historical nearest-three ordering, current projectile endpoints
and deterministic journal replay. They use the real local simulator and replay modules;
they do not exercise a hosted room or prove deployment. See [the CW1 spec](../specs/CW1-scattershot-latency.md).

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Pirate waves | [pirates/](../frontend/tests/pirates/) (`sim`, `td-sim`, `fog-balance`, `multiplayer`, `controller`, `td-flow`, `pirate-point`, `render`, `art`, `fake-api`) | 72 | Same seed and inputs give the same wave at any frame rate; the balance curve (wave 1 with one cannon, the wave 5 boss, wave 10, wave 20, below wave 30 with a full island); mortar, crew, captain musket and bad shots; boss waves; the break, Next wave and Auto next; two captains ringing at once; the single-flight join; re-sent `wave_start` | The real Realtime room; slow phones; drift after late packets |
| Island | [island/](../frontend/tests/island/) | 71 | Cards and prices, spots, the invite link and landing, visits and fake mode, start/join/finish flow, art placement | The live API |
| Class demo | `g29-*.test.js`, `duels-logic.test.js` | 175 | Class code parsing, quests, duel shortcut, lock states, lamp sync, projector, email and guest adapters | Real phones, real projector |
| Realtime and presence | `live-rules.test.js`, `realtime*.test.js`, `real-presence*.test.js` | 175 | Room names, send gaps, accepted messages, the guard, join and retry, with fake channels | The live Supabase Realtime service |
| Market | [market/](../frontend/tests/market/), `market*.test.js` | 302 | Board view, refusals, poller, formats | Live prices |
| Sports | [sports/](../frontend/tests/sports/) | 22 | Panel words and actions | Live fixtures |
| Home islet | `islet*.test.js`, `real-islet*.test.js` | 229 | Build panel, outcomes, lifecycle | The new island screens (lane P/U) |
| Sign-in, account, adapter | `auth*.test.js`, `account*.test.js`, `adapter*.test.js`, `real-adapter*.test.js`, `online*.test.js` | 200 | PKCE return, session, adapter contract and conformance | Real GitHub or email sign-in |
| Input and controls | `g20-*.test.js`, `map-touch.test.js`, `tap-path.test.js` | 64 | Keyboard, gamepad, touch mapping | Real touch screens |
| Loading and build | `lazy*.test.js`, `build*.test.js` | 30 | Lazy modules, build stamp | Load time on a real phone network |

## 4. Browser checks (`frontend/scripts/check-*.js`)

38 scripts. They drive an **installed Chrome** through `playwright-core`, mostly against a built copy with fake or recorded API answers; none signs in for real. Several build first (`npm run build && ...`). Run one at a time from `frontend/`.

| npm script (`cd frontend && npm run ...`) | Script | Checks |
|---|---|---|
| `build` | `check-spoilers.js` | No protected story text in the built files |
| `test:loading` | `check-loading.js` | Title budgets: JS at most 21,080 bytes, CSS under 12 kB, no title picture (drawn in code); the game, cutscene, class-demo, island, destination and gallery code are separate on-demand chunks the cold title does not request; Play reaches the production harbor without errors |
| `test:csp`, `test:csp:inventory` | `check-csp.js`, `check-csp-inventory.js` | The built site under the production CSP; no forbidden inline code |
| `test:production` | `check-production.js` | The production build end to end with an offline API stub |
| `test:demo` | `check-demo-journey.js` | The class-demo journey with recorded API answers |
| `test:mp` | `check-multiplayer.js` | Two, then four pages on one island against the shared fake server (`?islands=fake`) and a BroadcastChannel room with the live room's rules: a co-op build shows on the owner's page, identical ships every second, musket shots cross pages, loot for each, one shared Next wave, a mid-wave join. **Not** the real Supabase Realtime, real accounts or the network; Pirate Point with four players and the lamps is not in it yet |
| `test:placement` | `check-placement-mp.js` | T36 flexible placement on two pages of one island (shared fake server, BroadcastChannel room): host and member move a wall and a cannon from the card and the other page's answer and map follow within 2 s; sea, overlap and a closed heart route are refused on the bar and by the fake server with the server's codes; in a wave Move is off and a move is refused `wave_running`; both pages' sims fight the moved squares; a reload keeps them; with `wall_recovery` on too, a damaged or destroyed wall's card keeps Repair/Rebuild and Move. **Not** the real `POST /api/island/move` or Postgres (`island_sql/test_island_layout_sql.py` covers `island_move()`), real Realtime, phones |
| `test:arsenal` | `check-arsenal-mp.js` | Release check of the flag `arsenal` (T40/T41, D042) on two pages of one island (shared fake server with `?fakeflags=arsenal`, BroadcastChannel room): the building drawn and opened by walking up and pressing E; a buy paid once on a double click and a same-click-id retry, into empty hands, else onto the rack; a member's take and swap, both cards showing who carries what (the other card within 2 s); two captains taking one copy at once (one gets it, the other `taken`); a full rack (20 of 20) refusing the return with the copy kept in hand; no Weapons tab and the old weapon buy `409 use_arsenal`; every move `wave_running` in a wave; both sims fire each captain's carried weapon; a reload keeps it; with the flag off no building and the old shop as before. **Not** the real `/api/island/arsenal` routes or Postgres (`test_arsenal_routes.py`, `island_sql/test_arsenal_sql.py`), real Realtime, phones |
| `test:browser`, `test:world`, `test:readability` | `check-browser.js`, `check-world.js`, `check-readability.js` | The world loads, places, text contrast |
| `test:mobile`, `test:panels` | `check-mobile-walking.js`, `check-open-panels.js` | Touch walking at phone size; every panel a player can open (account, settings, the Harbor cards, the old islet panel, the island cards) fits at four sizes |
| `test:overlaps` | `check-overlaps.js` (`--all`: every state at 1280×720, 1440×900, 390×844, 375×667, 844×390; `--shots <folder>`: screenshots) | The overlap audit with `?islands=fake`: island idle, Goals folded, a long toast, a wave's first-wave hint, boarders ashore and a toast in a wave at 1280×720, 390×844 and 844×390 (`--all` adds the building, Captain, Tech hub, Harbor, crew and lobby cards, each with a toast). Fails when two HUD boxes intersect (coins, Menu, Goals, wave bar, hint, toasts, F button, prompts, banners, narrator card), a toast covers a card's title or ×, a label clips its text, or the page scrolls sideways. **Not** the battle guide's canvas badges (look at the `--shots` screenshots), touch (`pointer:coarse`) layouts |
| `test:market` | `check-market-hall.js` | The Harbor market stall ("Up or down in 5 minutes?", `/api/market/calls`) in the production build with recorded answers: anonymous, the flag off, a 🪙 10 call on Up with its countdown, the request body, the HUD wallet |
| `test:signin` | `check-online-signin.js` (runs `check-online-auth.js`, then `check-online-signin-gate.js`; exits 1 on the first failure) | The built game with an intercepted Supabase origin and generated credentials: the bundled GitHub PKCE sign-in, reload, sign-out at 1280 and 375 px, then a live sign-in flag change while an expired-account failure is showing. **Not** a real GitHub login. The two files only export a function, so `node scripts/check-online-auth.js` alone checks nothing and exits 0; always use `npm run test:signin` |
| `test:online:islet`, `test:online:islet:chaos` | `check-online-islet.js` | Islet build with intercepted accounts; failures |
| `test:a11y`, `test:ui`, `test:help`, `test:credits` | `check-a11y.js`, `check-ui-kit.js`, `check-help.js`, `check-credits.js` | Keyboard, focus, reduced motion, hostile text (the Harbor market stall included; the fortune teller audit was removed on 11 Nov with the fortune teller), help and credits pages |
| `test:host` | `check-host-console.js` | Host console against fake responses |
| others | `test:art` (`check-pixel.js`), `test:weather:wiring`, `test:harbor:life`, `test:lifecycle`, `test:living`, `test:title-start`, `test:settings:visuals`, `test:build-stamp`, `test:problem-report`, `test:islet:world`, `test:festival` | See the first line of each script |
| no npm script | `check-islet.js`, `check-local-dev.js`, `check-redesign-hud.js`, `check-redesign-movement.js`, `check-sports.js`, `check-sports-hotspot.js`, `capture-integrated.js` (the first 3 minutes with `?islands=fake`, screenshots) | Run with `node scripts/<name>` |

Village checks cover keyboard and pointer selection, the shared range calculation, selected-tree fading, the decorative mooring and shore access. The browser captures add touch checks in Fit, Work and a live Treasure Galleon wave. [Village review evidence](evidence/village-polish/README.md)

The final local frontend suite passed 3,694 tests across 322 files. The separate `npm run test:mp`
smoke test did not pass: it timed out waiting for the host's wave break with `wave=null`. The same
failure reproduced on exact main `a09787c`. A passive retry recorded the host wave ending with
`survived:false` and no break state, so the flow's unconditional break wait does not account for a
lost wave. This is not evidence of a recovery/break regression; it did not change multiplayer
assertions or gameplay. See the
[T60 evidence](evidence/T60-structure-recovery/README.md#final-integrated-verification-and-multiplayer-result).

**Do not cover:** physical phones and their browsers, real audio output (headless Chrome has no real audio device), real sign-in, the live API and Realtime, and slow class Wi-Fi.

## 5. Live smoke test

| Command | What it checks | Does not cover |
|---|---|---|
| `bash scripts/smoke-live.sh https://the-great-plot-twist.vercel.app` (optional: an expected 40-character commit and a JSON of expected flags, [RUNBOOK.md](RUNBOOK.md)) | Signed out: home page and security headers, `/api/health`, `/api/config` flags, a private route answers `401` with `no-store`, the build stamp, bundle size, a spoiler scan ([scripts/smoke-live.mjs](../scripts/smoke-live.mjs)) | The database ("database readiness is not checked"), sign-in, Realtime, any write |
| `node --test scripts/test-smoke-live.mjs` | The smoke checker itself, against local fixtures | The live site |

## 6. Other small suites

| Command | Covers |
|---|---|
| `python3 -m unittest discover -s docs/tests` | Table and column coverage of [DATA-INVENTORY.md](DATA-INVENTORY.md) against the migrations |
| `cd backend && uv run ruff check .` | Python style and likely bugs |
| `cd frontend && npm audit` | Known npm vulnerabilities (0 on 11 Nov 2026) |

## 7. What no test covers today

- Physical phones (iOS Safari, Android Chrome) and the real projector setup ([OPEN-TODOS.md](OPEN-TODOS.md), section 5, two-phone test).
- 40 real users on one Wi-Fi: Supabase's per-address sign-in limits and Realtime's 200 connections ([ARCHITECTURE.md](ARCHITECTURE.md), free-tier limits).
- Provider outages over hours, and Vercel running several instances with separate caches and budgets.
- The email flow end to end with a real inbox and the Brevo mail service ([OPEN-TODOS.md](OPEN-TODOS.md) 4b).
- Real audio output on a device.
- The real Supabase Realtime room with four devices: `test:mp` uses a BroadcastChannel stand-in with the same message rules.
- Pirate Point with four players and the three lamps in one automated run.
- Whether the browser's `survived` in a wave is true: by design the server only bounds the loot ([D032](DECISIONS.md)).

## 8. Lane rows (to be filled by the lane's members)

The rows that start with "v3" were written on Fri 13 Nov 2026 at `6c9ffb3`. Counts are `def test_` lines (Python) or `it(`/`test(` lines (Vitest) per file, taken with `grep`, not by running the suites. The page of the [walkthrough](WALKTHROUGH.md) for each area is named in the first column. The SQL commands start in `backend/` and need no database URL.

| Lane | Tests (files) | Command | What they cover | What they do not cover |
|---|---|---|---|---|
| U / Johannes, Fleet materials and combat effects (VIS-16 and VIS-29) | [combat-effect-frames.test.js](../frontend/tests/art/combat-effect-frames.test.js), [cartoon-art.test.js](../frontend/tests/cartoon-art.test.js), [gunboat.test.js](../frontend/tests/pirates/gunboat.test.js) | `cd frontend && npm test -- tests/art/combat-effect-frames.test.js tests/cartoon-art.test.js tests/pirates/gunboat.test.js` (use `CHROME_PATH` for native Chrome) | Three atlas densities, five hull families across their three bob frames, splash contact, effect bounds and smoke transparency. Gunboat tests cover the jam and firing rules. | Physical-device performance and human visual acceptance. The separate game captures show the effects in context. |
| U / Johannes, B3 Arsenal replies after travel | [arsenal-context.test.js](../frontend/tests/island/arsenal-context.test.js) | `cd frontend && npx vitest run tests/island/arsenal-context.test.js` | Eleven controlled cases cover delayed success/refusal for buy/take/return, late read success/error, travel during refusal refresh, normal delayed success and a completed fake-server purchase surviving the ignored answer. | These are controlled controller replies. The persistent-purchase case uses the in-memory fake, not SQL or real Realtime. Returning to the same island before a reply finishes is not a new navigation-generation protocol. |
| U / Johannes, B3 Retrying an arsenal load | [arsenal-retry.test.js](../frontend/tests/island/arsenal-retry.test.js) | `cd frontend && npx vitest run tests/island/arsenal-retry.test.js` | Three native Chrome cases use the full shared stylesheet order at 1280x720 and 375x812: keyboard activation, 44px target, duplicate retry suppression, repeated failure then success, and closing before completion. | The replies are controlled at the controller boundary. These tests do not exercise a live account, real timeout duration, physical phone or server/database rules. |
| U / Johannes, B3 Closing the harbor while loading | [host-loading.test.js](../frontend/tests/harbor/host-loading.test.js) | `cd frontend && npx vitest run tests/harbor/host-loading.test.js` | Eight controlled host cases cover close/reopen, repeated opens, both view orders, load rejection/retry, obsolete failure and success/failure after disposal. Existing Harbor card browser tests exercise real rendering. | The focused tests control module resolution and use card-factory spies. Screenshots separately use the real cards with a controlled module delay. Network throttling, physical phones and a full live journey are not claimed. |
| U / Johannes, Comparing arsenal weapons | [weapon-comparison.test.js](../frontend/tests/island/weapon-comparison.test.js), [weapon-comparison-dom.test.js](../frontend/tests/island/weapon-comparison-dom.test.js) | `cd frontend && npx vitest run tests/island/weapon-comparison.test.js tests/island/weapon-comparison-dom.test.js` | 10 new cases: all five types, exact deltas, same type, invalid ids, learned skills/role/level, minimum reload and rounding, immutable server answer, native comparison at desktop/phone widths, actual fake-server learned skill, retained disclosure after refresh and no write from comparison. | Per-hit numbers do not predict fleet outcomes, aim, pierce alignment or total area damage. Real provider/login/database behavior, physical phones and a screen-reader session are not covered. The UI word compare was checked in the macOS word dictionary before adding it to the house list. |
| U / Johannes, Filtering and grouping the arsenal | [arsenal-filters.test.js](../frontend/tests/island/arsenal-filters.test.js), [arsenal-filters-dom.test.js](../frontend/tests/island/arsenal-filters-dom.test.js) | `cd frontend && npx vitest run tests/island/arsenal-filters.test.js tests/island/arsenal-filters-dom.test.js` | 10 new cases: 20 stored plus carried copies, stable ordering and immutable input, all empty views, bad optional filters/input, pending/wave restrictions, retained filter on refresh, keyboard/phone controls, no request from filtering, exact copy id for intentional Take and recovery when the chosen filter becomes empty. | Filters last for this controller session, not browser storage. They do not change stock, reclaim another captain weapon or grant permission. Real multi-client races/SQL, physical phones and screen readers are not covered by these controlled UI tests. |
| U / Johannes, Wave preparation at the bell | [preparation.test.js](../frontend/tests/island/preparation.test.js), [preparation-dom.test.js](../frontend/tests/island/preparation-dom.test.js) | `cd frontend && npx vitest run tests/island/preparation.test.js tests/island/preparation-dom.test.js` | 15 new cases: nextWave after defeat, older-answer/final-wave fallback, built-only counts, campaign boundaries, partial/invalid/foreign health, running-wave behavior, native keyboard/phone disclosure and preserved focus, unchanged ring callback, and delayed wall read after an actual fake-island visit. | Wall health is the last successful read, not a live guarantee; a failed read may leave labeled last-known data. The late-repair UI guard does not undo a completed server repair. Physical phones, live Realtime and SQL are not proven by controlled fixtures or the fake-server run. |
| P, Pirates (`frontend/src/pirates/`) | [tests/pirates/](../frontend/tests/pirates/) (10 files), `check-multiplayer.js` | `cd frontend && npx vitest run tests/pirates` and `npm run test:mp` | Determinism, the balance curve to wave 100, towers, crew, captain, boss waves, the break, room sync with a stand-in room | The real Realtime room, physical phones, drift after late packets |
| H, Harbor and coins (`frontend/src/harbor/`, `lib/coins.js`) | to be written by the lane's members | | | |
| U / Johannes, T19 nearby interactions | [nearby-interactions.test.js](../frontend/tests/island/nearby-interactions.test.js), [nearby-game.test.js](../frontend/tests/island/nearby-game.test.js); existing [island DOM](../frontend/tests/island/dom.test.js), [input](../frontend/tests/g20-input.test.js) and [health](../frontend/tests/pirates/health.test.js) tests | `cd frontend && npm test` (Chrome required; set `CHROME_PATH`) | Real pointer reach/height boundaries, blocked/missing input, native E and phone Use; explicit UI fixtures for a fallen captain and a revive taking priority; existing controller hold/cancel/payment tests use fake services | Physical phones, live sign-in/Realtime, actual database payments or races; the UI state fixtures are not a live multiplayer proof |
| v3 Rooms: games, lobby, 10 players (WALKTHROUGH part 16) | [test_games_routes.py](../backend/server/tests/test_games_routes.py) (21), [island_sql/test_game_rooms_sql.py](../backend/server/tests/island_sql/test_game_rooms_sql.py) (8), [island/games.test.js](../frontend/tests/island/games.test.js) (13), `island/invite.test.js`, `island/one-island.test.js`, [pirates/ten-players.test.js](../frontend/tests/pirates/ten-players.test.js) (4) | `cd backend && uv run pytest -q server/tests/test_games_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_game_rooms_sql.py`; `cd frontend && npx vitest run tests/island/games.test.js tests/pirates/ten-players.test.js` | Create once, join, the 10th member and the refused 11th, a guest turned away by a full game is not admitted, budgets, leave and re-join, the lobby for members only, ten senders keep one order inside the send budget | Ten real devices (`test:mp` uses at most four pages), real Realtime, a membership check at room level (none exists) |
| v3 Simulation and sync (part 17) | [pirates/sim.test.js](../frontend/tests/pirates/sim.test.js) (10), `pirates/td-sim.test.js` (15), [pirates/multiplayer.test.js](../frontend/tests/pirates/multiplayer.test.js) (17), `pirates/controller.test.js`, `pirates/td-flow.test.js`, [live-rules.test.js](../frontend/tests/live-rules.test.js) (43), `check-multiplayer.js` | `cd frontend && npx vitest run tests/pirates tests/live-rules.test.js`; `npm run test:mp` | Same seed and inputs give the same wave at any frame rate, inputs run at their target tick in a fixed order, every message shape and rate limit; `test:mp`: at least 90% of samples identical on two and four pages | The real Supabase Realtime, drift after late packets (not measured), 10 devices, a message sent in another player's name (not checked) |
| v3 Captain health and help-up (part 18) | [pirates/health.test.js](../frontend/tests/pirates/health.test.js) (21), `pirates/boarding.test.js` (17), [test_wave_revive_routes.py](../backend/server/tests/test_wave_revive_routes.py) (11), [island_sql/test_captain_revive_sql.py](../backend/server/tests/island_sql/test_captain_revive_sql.py) (9) | `cd frontend && npx vitest run tests/pirates/health.test.js`; `cd backend && uv run pytest -q server/tests/test_wave_revive_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_captain_revive_sql.py` | Falling, the 2 s hold, the price 20 + 5 × wave, a repeat pays once, a second helper of one fall pays nothing, only a member in the wave pays, balance on 8 seeds | Real players, whether a fall really happened (the server cannot know), slow phones |
| T34/T35 Enemy targets and wall pathing (D040) | [pirates/targeting.test.js](../frontend/tests/pirates/targeting.test.js) (21), [pirates/pathing.test.js](../frontend/tests/pirates/pathing.test.js) (17), [pirates/pathing-wiring.test.js](../frontend/tests/pirates/pathing-wiring.test.js), [pirates/pathing-performance.test.js](../frontend/tests/pirates/pathing-performance.test.js) (1) | `cd frontend && npx vitest run tests/pirates/targeting.test.js tests/pirates/pathing.test.js tests/pirates/pathing-wiring.test.js tests/pirates/pathing-performance.test.js` | Target matrix, captain limits, ties and switching; wall routes, gaps, breaches, rebuild while crossing, no loops and deterministic fields; sim integration; 300 boarders for a whole wave | Phones, two real browsers |
| T35 damageable tower obstacles (D058 proposed, draft #84) | [pirates/tower-obstacles.test.js](../frontend/tests/pirates/tower-obstacles.test.js), [pirates/pathing-wiring.test.js](../frontend/tests/pirates/pathing-wiring.test.js), [pirates/tower-health.test.js](../frontend/tests/pirates/tower-health.test.js), [pirates/battle-guide.test.js](../frontend/tests/pirates/battle-guide.test.js), [pirates/wave-rules.test.js](../frontend/tests/pirates/wave-rules.test.js), [pirates/tower-obstacle-performance.test.js](../frontend/tests/pirates/tower-obstacle-performance.test.js), [backend wave/settings/config tests](../backend/server/tests/) and [wave-rule SQL test](../backend/server/tests/island_sql/test_wave_rules_sql.py) | Full commands and performance details in [T35 tower path obstacles](../specs/T35-tower-path-obstacles.md) | Footprint parity; route breach and detour; break/rebuild/escape; edge reach and collision; deterministic replay; frozen dependency flags; guide preview; 300-boarder movement and tower rebuild workload | No physical-phone or live Realtime proof; the generic `test:mp` script times out in the pause/break UI flow on both branch and unchanged base after the revive succeeds |
| v3 Campaign, Harbor gate, wreck (part 19) | [campaign/campaign.test.js](../frontend/tests/campaign/campaign.test.js) (11), [test_harbor_campaign.py](../backend/server/tests/test_harbor_campaign.py) (4), `test_tech_hub_routes.py` (13), `island_sql/test_tech_hub_sql.py` (8) | `cd frontend && npx vitest run tests/campaign`; `cd backend && uv run pytest -q server/tests/test_harbor_campaign.py` | The browser copy of `campaign.json` equals the server's, locks and unlock waves, the market stall closed before wave 4, the wreck never passes 500 | Sailing out to sea (not built), the pace of unlocks in real play |
| v3 Tech hub and research tiers (part 20) | `test_tech_hub_routes.py` (13), [test_research_tiers_routes.py](../backend/server/tests/test_research_tiers_routes.py) (8), `island_sql/test_research_tiers_sql.py` (9), `test_respec_and_wave_guards_sql.py` (6), [pirates/research-tiers.test.js](../frontend/tests/pirates/research-tiers.test.js) (11) | `cd backend && uv run pytest -q server/tests/test_research_tiers_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_research_tiers_sql.py`; `cd frontend && npx vitest run tests/pirates/research-tiers.test.js` | Tier prices and unlock waves, one tier at a time, the other option closed unless paid again, capstones only after the island chose, no research during a wave, balance with tiers | Whether players understand the choice, play beyond a headless model |
| v3 Tower levels 4 and 5, late game (part 21) | [island/tiers.test.js](../frontend/tests/island/tiers.test.js) (9), `pirates/campaign-scaling.test.js` (11), [pirates/late-game.test.js](../frontend/tests/pirates/late-game.test.js) (4), `test_tower_tiers_match_migration.py` (4), `island_sql/test_tower_tiers_sql.py` (6) | `cd frontend && npx vitest run tests/island/tiers.test.js tests/pirates/campaign-scaling.test.js tests/pirates/late-game.test.js` | Prices equal on the cards and in `islands.json`, unlock waves 12, 15 and 20, the difficulty never goes down, every wave 1 to 100 runs to its end, a strong crew wins 30, 50, 70 and 100 on the model | Human play in waves 30 to 100, frame rate with 40+ ships on a phone |
| v3 Tear down and refunds (part 22) | [test_demolish_routes.py](../backend/server/tests/test_demolish_routes.py) (7), `test_demolish_matches_migration.py` (7), [island_sql/test_demolish_sql.py](../backend/server/tests/island_sql/test_demolish_sql.py) (12), `island/demolish.test.js` (16) | `cd backend && uv run pytest -q server/tests/test_demolish_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_demolish_sql.py` | Each payer gets half of their own payments, legacy buildings pay the host, a repeat pays nothing twice, nothing during a wave, protected buildings, a member who left while the click waited (two real connections) | Many simultaneous tear-downs over the network, a phone's confirm card |
| v3 House roles (part 23) | [pirates/houses.test.js](../frontend/tests/pirates/houses.test.js) (18), [test_house_roles_routes.py](../backend/server/tests/test_house_roles_routes.py) (9), `test_house_roles_match_migration.py` (6), `island_sql/test_house_roles_sql.py` (8) | `cd frontend && npx vitest run tests/pirates/houses.test.js`; `cd backend && uv run pytest -q server/tests/test_house_roles_routes.py` | Militia, healing, repair speed and the stacking caps in the sim, `409 house_level`, `422 wrong_kind`, the Tavern's 25% off a revive, the recreated functions equal the old ones plus the marked lines | How the roles feel in play; militia and healing are not checked by the server |
| v3 Captain tree, roles, respec (part 24) | [test_captain_tree_routes.py](../backend/server/tests/test_captain_tree_routes.py) (9), `island_sql/test_captain_tree_sql.py` (6), `test_respec_wave_guards_match_migration.py` (6), [pirates/captain-stats.test.js](../frontend/tests/pirates/captain-stats.test.js) (16), `island/captain-tree.test.js` (7) | `cd backend && uv run pytest -q server/tests/test_captain_tree_routes.py`; `cd frontend && npx vitest run tests/pirates/captain-stats.test.js tests/island/captain-tree.test.js` | Five tiers and two forks per branch, a fork closes its twin, capstones need the role, the respec price under the lock, no respec during a wave, the Engineer discount, the two copies of the tree equal | Real crews picking roles; whether a receiving screen checks the skills a message carries |
| v3 Wave events and boss finishers (part 25) | [pirates/wave-events.test.js](../frontend/tests/pirates/wave-events.test.js) (18), `pirates/wave-events-controller.test.js` (4), [pirates/finisher.test.js](../frontend/tests/pirates/finisher.test.js) (14), [test_wave_events.py](../backend/server/tests/test_wave_events.py) (10), `test_wave_routes.py` (39) | `cd frontend && npx vitest run tests/pirates/wave-events.test.js tests/pirates/finisher.test.js`; `cd backend && uv run pytest -q server/tests/test_wave_events.py` | The server picks the same event as the browser from shared samples, no event before wave 3, a bonus counts only where the wave allows it and is dropped otherwise, finisher scoring from samples; `test:mp`: the same event on two pages and a finisher on four | A finisher on slow phones or ten players, touch controls on a real device, the look at every screen size |
| v3 Narrator and voice pipeline (part 26) | [narrator/logic.test.js](../frontend/tests/narrator/logic.test.js) (13), `narrator/narrator.test.js` (10), `pirates/narrator-events.test.js` (2), [scripts/voice/test_generate.py](../scripts/voice/test_generate.py) (29) | `cd frontend && npx vitest run tests/narrator`; `python3 -I -m unittest discover -s scripts/voice -v` (from the repository root) | Triggers, told-once memory, the queue and expiry, the manifest, a missing voice file, the generator's key and budget guards with a fake network | Real speech output (headless Chrome has no audio device), the real ElevenLabs, a check that every line has a file (not a test: I counted 80 of 80 by hand) |
| v3 Cartoon art (part 27) | [cartoon-art.test.js](../frontend/tests/cartoon-art.test.js) (4), [hires-art.test.js](../frontend/tests/hires-art.test.js) (4), [v3-raster-free.test.js](../frontend/tests/v3-raster-free.test.js) (6), `island/world-art.test.js` (7) | `cd frontend && npx vitest run tests/cartoon-art.test.js tests/hires-art.test.js tests/v3-raster-free.test.js` | Every wave sprite has a drawing with the old box and anchor, ten captain palettes, texture density within the memory budget, more texels never move collision, v3 screens load no painted or pixel pictures | How it looks (no picture comparison), memory and frame rate on real phones |
| v3 Database and server house style (part 28) | [island_sql/](../backend/server/tests/island_sql/) (13 files, 125 tests), `test_wallet_matches_migration.py` (58) and the four `test_*_matches_migration.py` files | `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql`, run from `backend/` | Every v3 function on a real Postgres with all migrations applied twice: refusals, repeats, lock order, two real connections in some, no browser rights; Python and SQL say the same about reasons and recreated functions | The live project (applied grants, applied history, md5 of the stored text), Supabase Auth and Realtime, load |
| Wall recovery, including delayed records after paid repair (D039, #82) | [test_wall_recovery.py](../backend/server/tests/test_wall_recovery.py), [island_sql/test_wall_recovery_sql.py](../backend/server/tests/island_sql/test_wall_recovery_sql.py) | `cd backend && uv run pytest -q server/tests/test_wall_recovery.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_wall_recovery_sql.py` | A paid restore stays whole when an earlier wave report arrives late; a later wave can record after repair; equal timestamps conservatively fence; two-connection tests cover both record/restore lock orderings; ordinary damage, repair pricing, repeats, participants, limits and browser grants | Live database application/grants, production traffic/load, client-reported damage validation |

### T26 · Ianno Hollensteiner · Harbor weather access

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Opens the existing weather board from the island Harbor after wave 4; reuses the existing fetcher and card | [model test](../frontend/tests/island/card-model.test.js), [DOM test](../frontend/tests/island/weather-board.test.js): `cd frontend && npm test -- --run tests/island/card-model.test.js tests/island/weather-board.test.js`; [game journey](../frontend/scripts/check-island-weather.js): `cd frontend && node scripts/check-island-weather.js` | Wave 3/4 boundary, storm/fog/stale/missing weather, one dialog, focus/reset, Escape, cleanup; real game wiring and viewport containment at 1280 × 720 and 375 × 812 with recorded APIs | Real Open-Meteo outages, physical touch devices, deployed sign-in; changes while the weather card remains open |

### T46 · Nils · Harbor weather follow-through

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| The weather board says when an old reading was taken, never promises a fresh one for a recorded reading, says where a wave takes its weather from, and shows the forecast for tonight as words only (D045, no stake) | [model tests](../frontend/tests/harbor/models.test.js), [card test](../frontend/tests/harbor/cards.test.js): `cd frontend && npx vitest run tests/harbor tests/island/weather-board.test.js`; [game journey](../frontend/scripts/check-island-weather.js): `node scripts/check-island-weather.js after` and `… after live` | stale vs recorded wording, bad times, live/cache show no notice, the wave-place line on and offline, known/null/unknown/missing forecast; real game wiring at 1280 × 720 and 375 × 812 | Which place a wave really used (the wave answer has no place), real Open-Meteo outages, physical phones |

### T5 · Ianno Hollensteiner · Island milestones

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Number-only rank shield beside the cabin, statue at wave 25 and tree sizes of 100% / 110% / 120%; makes saved island progress visible | [Rule tests](../frontend/tests/island/decorations.test.js) and [browser component test](../frontend/tests/island/decorations-dom.test.js): `cd frontend && npm test -- tests/island/decorations.test.js tests/island/decorations-dom.test.js`; [game capture](../frontend/scripts/check-island-decorations.mjs): `cd frontend && node scripts/check-island-decorations.mjs` | Recorded win events update 21 → 22 → 29 → 30; each ten-wave rank boundary, 24/25 statue boundary, invalid records, house removal/duplicates, actual local house builds grow trees from 100% to 110% to 120%, lower progress on another island, art reuse, cleanup and unchanged colliders; full local game wiring and 1280 × 720 / 375 × 812 screenshots with a fake API | Live Supabase progress and real visits, physical phones, actual competitive play balance; ornaments are drawn on Canvas rather than exposed as interactive controls |

## T27 — Ianno Hollensteiner — Captain shooting direction

| What I built / where / why | Checks | What they cover | What they miss |
|---|---|---|---|
| Exact-angle musket aiming and upright directional bodies: `pirates/poses.js`, `pirates/shot-art.js`, `art/people.js`; shared by `player/character.js` and `world/others/index.js` | `cd frontend && npm test -- tests/pirates/poses.test.js`; `node scripts/check-shooting-direction.js`; `npm run test:mp` | Projected aim at cardinal, diagonal and intermediate angles; malformed/zero directions; color and expiry; real local/remote renderers at 1280 × 720 and 375 × 812; one body, idle restoration, texture reuse/disposal; multiplayer uses the fake room | Live Supabase, physical phones, a continuously turning 3D body; direction fixture injects controlled events; body/gun overlap is also visually reviewed |

[Walkthrough part 30](WALKTHROUGH.md#30-captain-shooting-direction--ianno-hollensteiner-t27)
and [recorded results](../specs/T27-shooting-direction.md).

### B3 shortcuts recovery — Johannes Franz Lang

| Built / why | Where / run | Covers | Misses |
|---|---|---|---|
| Touch-usable shortcuts loading/error recovery | [browser tests](../frontend/tests/ui/shortcuts-loading.test.js); `cd frontend && npm test -- tests/ui/shortcuts-loading.test.js` | Real blocked module request/retry, duplicate pending open, cached reopen, late success/failure, disposal, keyboard retry, Back/Escape, focus and both viewports | Real prolonged outages, physical phones and screen readers; no API/login changes |

### T7 · Ianno Hollensteiner · Weekly island leaderboard

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Read-only top ten island teams this UTC week; highest successful wave survives a restart; wooden scoreboard with medal badges | [Backend](../backend/server/tests/test_island_leaderboard.py): `cd backend && uv run pytest -q server/tests/test_island_leaderboard.py`; [browser/API](../frontend/tests/island/leaderboard.test.js): `cd frontend && npm test -- --run tests/island/leaderboard.test.js`; [game evidence](../frontend/scripts/check-island-leaderboard.mjs): `cd frontend && node scripts/check-island-leaderboard.mjs after` | Weekly/year boundaries and query filters, duplicate/shared islands, highest win after restart, ties, bounded SQL top-ten query, malformed rows, login/flag/no-store; loading/error/retry/empty states, exact three rows, medals and stale response after closing; 1280 × 720 and 375 × 812, long names and 44 px controls | SQL history scan cost and live PostgREST behavior (T48), concurrent deletion during reads, real accounts and physical phones, screen-reader behavior and fairness between crew sizes; fixture screenshots show sample captains |

### T45 · Highscore and statue stages (D046, proposed)

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Weekly and all-time boards, earliest-first ties, solo/crew label, "This island" milestones, cosmetic statue stages at 25/50/75/100 | [Backend](../backend/server/tests/test_island_leaderboard.py): `cd backend && uv run pytest -q server/tests/test_island_leaderboard.py`; [rules](../frontend/tests/island/progression.test.js) and [card](../frontend/tests/island/leaderboard.test.js): `cd frontend && npm test -- --run tests/island/progression.test.js tests/island/leaderboard.test.js`; [game evidence](../frontend/scripts/check-t45-progression.mjs): `cd frontend && node scripts/check-t45-progression.mjs` | All-time window and filters, lower later wins and resets cannot lower a score, tie order, crew counts and empty-crew fallback, scope 422; stage boundaries 24/25/49/50/74/75/99/100, milestone text, T7-shaped answers, tab switching/remembering; statue stages on the island and card at 1280 × 720 and 375 × 812 with contrast and 44 px checks | SQL query cost on larger histories and live Supabase data (T48), physical phones, T38/D044 reset interaction (see the spec's re-check list) |

## T28 — Ianno Hollensteiner — Boss minigame practice

| Part and why | Existing and new checks | Covers | Misses |
|---|---|---|---|
| Personal first-time explanations and practice using the existing finisher scene | [Memory/barrier tests](../frontend/tests/pirates/finisher-practice.test.js), [real DOM and two pages](../frontend/tests/finisher-introduction.test.js), [controller](../frontend/tests/pirates/wave-events-controller.test.js), [room validation](../frontend/tests/wave-rooms.test.js); `cd frontend && npm test`; `npm run test:mp -- <folder>` | Player/island/task separation, blocked storage, skip and later encounters, keyboard/touch input and focus reset, private practice samples, spectator/old-boss/duplicate readiness, wait limit, real BroadcastChannel exchange between two pages; the multiplayer script additionally checks one practicing captain and three skipping | Real Supabase sender/delivery, packet loss and late joins beyond existing room assumptions, physical phones, projector and screen readers |

[Walkthrough part 31](WALKTHROUGH.md#31-learn-boss-minigames-with-optional-practice--ianno-hollensteiner-t28)
and [results, screenshots and manual checkpoints](evidence/T28/README.md).

## T38 + T39 — Minigame difficulty and last-chance rescue

| Part and why | Existing and new checks | Covers | Misses |
|---|---|---|---|
| Wave-based speed/timing/error-budget curves and one frozen snapshot per run ([spec](../specs/T38-T39-minigames-rescue.md)) | [Curves and playability](../frontend/tests/pirates/finisher-difficulty.test.js), [finisher](../frontend/tests/pirates/finisher.test.js); `cd frontend && npm test` | Boundary waves 1–100, today's numbers up to wave 10, monotonic and bounded, rounding waves, unknown task refused, frozen snapshot and late joiner, lagging bot wins in crews 1/2/4/10 on both settings, Redtide two of three at wave 100, wrong input fails, smaller late error budget | Human playtests (T3), mixed client versions in one wave |
| Last-chance rescue rules, scene and settlement (D044, flag `rescue`) | [Rescue rules](../frontend/tests/pirates/rescue.test.js), [finish pass-through and fake server](../frontend/tests/pirates/rescue-finish.test.js), [server](../backend/server/tests/test_wave_rescue.py): `cd backend && uv run pytest -q server/tests/test_wave_rescue.py` | Triggers and reasons, wave 4–100, fallen versus away captains, no captain, once per wave, win/fail/timeout, preparation limit and watchers, disconnects with a frozen goal, chunk/order determinism, `rescued` only true, flag off, Pirate Point/early/won waves ignored, loot arguments unchanged, JS/Python parity | The `sim.js` hook and a two-browser run (not built here), real `wave_finish()` SQL with `p_restart_back = 1` against Postgres, human playtest |

## B2 — Johannes Franz Lang — Phone-sized island actions

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Remove four 40px overrides so island secondary actions use the existing 44px kit rule | [CSS](../frontend/src/island/island.css), [four browser cases](../frontend/tests/island/phone-targets.test.js); `cd frontend && npm test -- --run tests/island/phone-targets.test.js` | Four affected targets at 375x812, 390x844, 1280x720; width/height, scroll into viewport, focus/Escape, card/document overflow, one callback per enabled action, disabled Move/Tear down do nothing | Physical touch/keyboard, other engines, screen readers, live APIs/refunds and complete B2 journey; fake-game screenshots separately measure chip/goal gap |

[Before/after images and measurements](evidence/B2-phone-targets/README.md), [spec/results](../specs/B2-phone-controls.md).

## B2 — Johannes Franz Lang — Entry and full lobby

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Phone lobby rows show full generated names with status below | [CSS](../frontend/src/island/island.css), [seven regressions](../frontend/tests/island/phone-lobby.test.js); `cd frontend && npm test -- --run tests/island/phone-lobby.test.js` | 375x812/390x844: ten names, roles/no role, online/away/you, list scroll and reachable host Start, focus/Escape, disabled member Start; desktop bounds/Start; Continue/Create/Join, invalid code/no call and valid callbacks at all three sizes | Real Start/room authority, actual login or money writes, physical devices/keyboard, screen readers, other engines |
| Repeatable real local fake-game entry audit | [Tool](../frontend/scripts/check-phone-entry.js); `cd frontend && node scripts/check-phone-entry.js` | Title, title Join opened, intro, tutorial, game choice, goal and lobby at 375x812/390x844/1280x720: panel bounds/overflow, 44px buttons, Escape from title Join, route reaches fake island, no browser errors/external requests | Ten connected clients, submitted title Join/auth, real invitations, every possible overlap/contrast, physical keyboard/phone and B2 outside entry/lobby |

[Evidence and commands](evidence/B2-entry-lobby/README.md), [exact results](../specs/B2-entry-lobby.md).

### B3 help recovery — Johannes Franz Lang

| Built / why | Where / run | Covers | Misses |
|---|---|---|---|
| Visible loading and recoverable How to play failure | [help tests](../frontend/tests/ui/help-loading.test.js), existing [tutorial tests](../frontend/tests/ui/tutorial.test.js); `cd frontend && npm test -- tests/ui/help-loading.test.js tests/ui/tutorial.test.js` | Real Chromium modal/card, retry, duplicate requests, cancellation, stale success/failure, disposal, focus, Escape/back and 1280x720 / 375x812 fit | Real browser import caching/network outages, physical phones and screen readers; API/login unchanged |

## B3 — Johannes Franz Lang — Connection retry feedback

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Visible pending and recoverable callback failure; prevent stale feedback | [Banner](../frontend/src/ui/connection-banner.js), [six browser cases](../frontend/tests/ui/connection-retry.test.js); `cd frontend && npm test -- --run tests/ui/connection-retry.test.js` | Failure and second success, one pending intent, button label/reset, identical frames retain feedback, newer online/idle/cycled views, dispose | Real adapter/provider outages, server/database writes, physical phones, screen readers and combined drafts #31/#32 |

[Results](../specs/B3-connection-retry.md) and [1280x720 / 375x812 screenshots](evidence/B3-connection/README.md).

## B3 — Johannes Franz Lang — Repeatable feedback fixtures

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Durable assertions and screenshots for eight existing feedback states | [Runner](../frontend/scripts/check-feedback.mjs), [fixture](../frontend/scripts/feedback-fixtures.js); `cd frontend && node scripts/check-feedback.mjs` | Each case at 1280x720/375x812; messages, repeated join counts, zero invalid builds, successful Create retry, valid cannon, callback intent, no horizontal overflow/errors/external traffic; deliberate enabled-button countercheck fails | Live API/server/database rules, rewards, real accounts/outages, multiplayer, physical keyboard/phone, screen readers, complete journey and unmerged B3 fixes |

[Case table and limitations](evidence/B3-repeatable/README.md), [results](../specs/B3-feedback-check.md).

## B2 — Johannes Franz Lang — Harbor and menus

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Narrow match-side choices use full rows so club words remain intact | [CSS](../frontend/src/harbor/harbor.css), [36 browser cases](../frontend/tests/harbor/phone-layout.test.js), [fixtures](../frontend/tests/harbor/phone-fixtures.js); `cd frontend && npm test -- --run tests/harbor/phone-layout.test.js` | Ten views x 375x812/390x844/1280x720: bounds, panel overflow, 44px effective targets, no clipped choice text or fragmented club words, Tab/focus and Escape destination; Harbor stand IDs, one controlled confirmation/10 coins with no earlier spend, compact coin rows, pause-to-Harbor, local preference save and all help pages at both phone sizes | Actual sports/provider accuracy, server settlement/login/room authority, account view, real phones/keyboards/VoiceOver/Safari, actual external-link/clipboard use and game cards outside this pass |

[Evidence, exact scope and commands](evidence/B2-harbor-menus/README.md), [results](../specs/B2-harbor-menus.md).

## #74 — Nicolas Radomski — Fresh start resets the old personal weapons

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| The admin script [fresh_start.sql](../scripts/admin/fresh_start.sql) resets the island game, but it forgot the two old weapon columns, so players kept bought weapons after a fresh start. Now it puts every island back to the musket (`weapons_owned`, `weapon_equipped`) and counts those islands | The two fresh-start tests in [test_islands_and_waves_sql.py](../backend/server/tests/island_sql/test_islands_and_waves_sql.py); from `backend/`: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql` | One test island with pistols: the dry run only counts (`island weapons reset: 1`) and the pistols stay; the real run, twice, leaves only the musket, and the second run changes nothing | The real Supabase database (the tests use a throwaway test database), so not what the real players' data looks like; no test with many weapons at once |

[Walkthrough part](WALKTHROUGH.md#74--fresh-start-resets-the-old-personal-weapons--nicolas-radomski).


## COC-07 — Johannes Franz Lang — Visible house levels

| What / why | Files and command | Covers | Does not establish |
|---|---|---|---|
| Distinct house silhouettes with the same role and placement contract | [Painter](../frontend/src/art/island.js), [mapping](../frontend/src/island/world.js), [new cases](../frontend/tests/island/house-level-art.test.js); `cd frontend && npm test -- --maxWorkers=1 tests/island/house-level-art.test.js tests/island/world-art.test.js tests/pirates/houses.test.js tests/cartoon-art.test.js` | Actual Chromium alpha masks, all valid neutral/role frame boxes and anchors, invalid-state fallback, required lazy frame loading, replaced geometry disposal, stable refresh; **4 files / 32 tests passed, 18.46s** | Whole-game layouts, new economy/recovery behavior, physical touchscreens, Safari; full frontend/build/budget/a11y/demo integration is coordinated separately |

[Capture runner and fixture results](evidence/COC-07-house-levels/README.md); [explanation and limitations](../specs/COC-07-house-levels.md).

## COC-13 — Johannes Franz Lang — between-wave wall joins

| What / why | Where and command | Covers | Does not cover |
|---|---|---|---|
| Connect genuine full shared wall sides while arranging the base; retain actual level art and visible gaps | [wall-connections.test.js](../frontend/tests/island/wall-connections.test.js), existing [world-art.test.js](../frontend/tests/island/world-art.test.js); `cd frontend && npm test -- --maxWorkers=1 tests/island/wall-connections.test.js tests/island/world-art.test.js` | Line/L/T adjacency; gaps, partial/diagonal/overlapping contacts; unbuilt/broken/non-wall rows; nonmutation; mixed levels; cache invalidation and disposal. Actual result: 2 files / 17 tests passed | New placement policy, canonical HP persistence, combat connection art, server payments and production state |
| Real application browser fixture at two sizes | [capture-wall-connections.js](../frontend/scripts/capture-wall-connections.js), [screenshots and reports](evidence/COC-13/README.md) | Normal builds and valid Moves form a T; before/after 1280×720 and 375×812; unchanged position/level data; normal bell hides base joins | Safari, physical devices, broad UI audit, full frontend/build/budget results before central integration |

## COC-39: local defense-report slice

| Coverage | Evidence / limits |
|---|---|
| Bounded event aggregation, identical hits, rebuilding, payout guards | `frontend/tests/pirates/defense-report.test.js`; real local simulation forwarding and actual gameplay menu wiring are exercised; no live API/payment proof |
| Reachable menu, copied report, focus/escape, stale result, travel, mobile overflow | `frontend/tests/pirates/defense-report-dom.test.js` at 1280×720 and 375×812; controlled browser component data, not a production account |
| Screenshot reproduction | `frontend/scripts/capture-defense-report.js`; four controlled component images and JSON in docs/evidence/COC-39, zero API writes |

[Exact run results and remaining central checks](../specs/COC-39-defense-report.md). Full replay authority, production multi-client completeness and COC-40 tactical navigation are not covered by this bounded report slice.

COC-39 ownership follow-up: `frontend/tests/pirates/defense-report-ownership.test.js` uses the actual running game with a local fake island and standard-mapped gamepad. Window-level keyboard state and analog input cannot move the captain while `waves.reportActive` owns both global overlay guards; closing restores motion. Isolated result:1 passed /14.34s. The report still does not pause canonical wave ticking.

## BASE-40 — Battle report to village

- `frontend/tests/pirates/defense-report.test.js` verifies that an observed wall break wins over ordinary hits and keeps the accepted wave position.
- `frontend/tests/pirates/defense-report-dom.test.js` checks desktop and phone layouts, current payout updates, keyboard focus, incomplete reports and canceling a pending location search when a new wave begins.
- `frontend/tests/island/report-site-game.test.js` uses the real village controller and controlled recovery reads to check existing and replacement instances, epoch mismatch, an active reservation, travel cancellation and zero purchase calls.

## COC-31 — Johannes: base overview

| What / where | Evidence | Coverage and limits |
|---|---|---|
| Read-only model and actual menu/card integration; `src/island/upgrade-overview*.js` | `tests/island/upgrade-overview.test.js`, `upgrade-overview-dom.test.js`; [capture report](evidence/COC-31-base-overview/README.md) | Extra offered plots, duplicate/unknown entries, server prices, affordability, loading/locks/roles, filters, accepted refresh, focus, 375px overflow and zero overview POST writes. Local fake transport + Chromium; no live backend, Safari or physical phone proof. Focused four-file run: 40 tests passed; broader parent checks reported separately. |
| Find a building by its accepted plot | [Desktop and touch game test](../frontend/tests/island/upgrade-overview-jump.test.js) | A moved extra tower with the same name as another tower opens its own card. Focus survives a refresh and transfers to the selection. A wave reservation blocks a stale action. The fake transport records no build, upgrade or Move calls after setup. |

## COC-49 — Johannes Franz Lang — Village management

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Explicit own-island management lets players select distant structures while keeping captain controls still | `frontend/tests/island/village-mode.test.js`, `frontend/tests/island/village-game.test.js`; `cd frontend && npm test -- --maxWorkers=1 tests/island/village-mode.test.js tests/island/village-game.test.js` | Controller entry/context/disposal; real game picking and movement with existing fake API at 1280×720/375×812; Move Escape/text-focus and reservation exit | Live login/API/database authority, Ianno's future repair behavior, real phones/Safari, independent camera/catalogue, and runtime performance beyond the focused browser runner |

Exact executed results and screenshots belong to [PR #192](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/192).
A listed check is not a claim that every run passed; an initial desktop timeout is
recorded in the PR and must be resolved or remain explicit. No assertions or
shared runner timeouts were weakened.
The reservation follow-up also holds the accepted-start preparation read and
checks exit before the bell promise resolves; pending/refused start and join
requests block re-entry without automatically resuming management after failure.
Menu eligibility is queried without entering/rendering. Unavailable contexts do
not offer a Manage action; after a reservation the full-game test checks both
Manage and Exit Menu entries are absent. Existing islet-boundary tests preserve
the outside-overlay/StopPlots assertions through the captain-blocking wrapper.

## Building inspection and support

The [upgrade comparison tests](../frontend/tests/pirates/defense-upgrade-comparison.test.js) compare both levels against real wave acquisition, attack events and reload. They cover Gunner reassignment, spatial bonuses and unknown or stale inputs. The [Village Mode journeys](../frontend/tests/island/village-game.test.js) exercise the comparison from **Details** and check the saved levels and wallet. The [house model](../frontend/tests/island/house-support-model.test.js) covers role policy, distance boundaries and valid or refused drafts. The [scene test](../frontend/tests/island/house-support-markers.test.js) covers marker reuse, cancellation and disposal. The checks cover nominal attack values and support geometry. Hit rate, damage totals, live party forecasts and server purchases use their existing checks.

## COC-02 — village overview camera (Johannes)

`frontend/tests/player/village-camera.test.js`: eight tests cover real current-land and overlay-inset fit at both required viewport sizes, captain/zoom restoration, battle/tutorial precedence, resize/travel, motion preferences and invalid/paused updates. Run `cd frontend && npx vitest run tests/player/village-camera.test.js --maxWorkers=1`. Final focused result: 1 file / 8 tests passed, 516 ms. This does not prove production, Safari, expanded land or integrated UI; [evidence](evidence/COC-02/README.md) records later checks.

## T58 — Versioned Captain and Tech recovery policy

| Part | Checks and command | Covers | Misses |
|---|---|---|---|
| Recovery-v1 Captain choices, persisted-version tutorial help, and shared wall Tech copy | [Focused tests](../frontend/tests/campaign/captain-repair-policy.test.js), [Captain tree](../frontend/tests/island/captain-recovery-tree.test.js), [card model](../frontend/tests/island/card-model.test.js), [structure upgrade DOM gate](../frontend/tests/island/structure-recovery-upgrade-dom.test.js), [tutorial pages](../frontend/tests/tutorial-pages.test.js) and [tutorial host](../frontend/tests/tutorial/host.test.js); `cd frontend && npm exec vitest -- run tests/tutorial-pages.test.js tests/tutorial/host.test.js tests/campaign/captain-repair-policy.test.js tests/island/captain-recovery-tree.test.js tests/island/card-model.test.js`; recovery views: `cd frontend && npm exec vitest -- run tests/island/structure-recovery-policy.test.js tests/island/structure-recovery-model.test.js`; backend rate: `cd backend && uv run pytest -q server/tests/test_structure_recovery_rate.py`; build: `cd frontend && npm run build`; [fixture capture](../frontend/scripts/capture-captain-repair.js) | Legacy-vs-v1 page selection, stable first four pages, E help-up/F fire controls, retired saved IDs and spent-point display, Engineer discount, Quick Mend/Bastion exclusivity, Mason stacking, paused recovery factor, no level upgrades when v1 HP is damaged/reserved, base-strength label, Tech copy and production island UI presentation at 1280×800 and 375×812 | Fixture data is supplied directly to UI models, not fetched from a saved island; no live API, server transaction, wave runtime, payment, multiplayer, physical phone or release activation. Combined dependency/release checks are pending. |

See the [T58 evidence README](evidence/T58-captain-repair/README.md) for fixture values, screenshots and reproducible commands.


## CF1 captain range and danger feedback (18 Nov 2026)

[Task #453](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/453), [spec](../specs/CF1-captain-combat-feedback.md) and [evidence/limits](evidence/CF1-captain-combat-feedback/README.md). Pure range/danger tests cover intent lifetime, weapon/skill reach, priority, expiry and once-per-episode sound. Audio regressions cover sustained/critical warnings, priority switches, independently clearing threats, menus, mute/unmute and wave reset. The visual revision checks sparse arc gaps, exact projected direction, the absence of damage labels, and preserved firing/impact events. Controller/native component tests cover refusal, reload, hit truth, keyboard focus, announcements and cleanup; overlay tests check projection and disposal. `node scripts/check-captain-feedback.js` runs the actual local fake game at desktop/phone sizes with native F and captures before/after state. No live multiplayer, physical touch or screen-reader speech proof is claimed.

## Village approach coverage (BASE-16)

[Issue #157](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/157) · [Coverage contract](../specs/COC-coverage-model.md) · [Desktop and phone evidence](evidence/COC-16/README.md)

The focused model tests cover target eligibility, minimum range, conditional shots, saved health, and valid and refused Move previews. The battle-guide tests check the actual route samples, marker shapes, WebGL transparency and stable buffers. The local browser journey checks the Village Mode switch, the same paid defenses across screen sizes, and cleanup on travel and wave entry.
