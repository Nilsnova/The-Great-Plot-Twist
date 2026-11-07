# G9 browser handoff

Checkpoint notes and server requests for Claude. Authored changes stay under `frontend/`, except Nils’s approved eight-word dictionary update.
Nils explicitly authorized cloud continuation. G10 publishes the case contract on
`feat/case-backend`; use its published contract and fixtures only.

## G9 streams done so far, not a checkpoint: checkpoint 1 integration verified; final driver pending (7 Nov 2026; base ca80469)

Merged from main: `64fc731` through `ca80469`, after earlier checkpoint-1 syncs including
`db4ddba`/`1da59ae`, `f23e86e`, `f91f541`/`708b7eb` and `364d178`/`6b65028`.
Branch stays `feat/g9-real-adapter`; no reset, rebase, force push, main integration or deployment.
Streams 2–5 are implemented. This note describes the current uncommitted integration stage; the
checkpoint is not complete, and no checkpoint push is claimed yet.

Changed: stream 2 (`c8e94d7`) supplies the lazy real adapter, shared display data, schema-1 projections,
validation, recovery and production regression driver. Stream 3 (`387e01b`) adds lazy GitHub PKCE,
clean callback handling, tab-only session persistence, renewal and logout. Stream 4 (`9772f3e`) adds
server-owned names/kit grants, own-row rewards, replay saves, explicit conflict choices and confirmed
deletion. Stream 5 (`74d9a82`, followed by `89aa9bc`) adds safe loading/retry/refusal states, cooldowns,
reports and recorded production chaos. Cloud proof portability is committed at `ca20f61`.

The current integration adopts main's compact rooms, original detailed coastal art, short passages,
quiet HUD, three primary case tabs and full case-page picker. Browser journeys use the public account,
Continue/More, Journal, room-exit and light-tab controls. Assertions for outcomes, exact actions/events,
UIDs, timing, resources, frame rates and budgets are preserved. Auth/logout wording, checked-code
cleanup and signed-out Continue no longer retain old account state. Autosaving waits for the current
identity's initial cloud reconciliation. Continue waits for private hydration, checks identity scope and
reconciles fresh save reads before applying any cloud continuation; conflicts preserve the device replay
until an explicit choice. Readable text, 44-pixel controls, solid contrast underlays and modal caption
rows are retained. Expanded account, Journal, indoor dialog and HUD accessibility states are covered.

Verified: the combined gate passes `npm test` (**2,326 tests / 171 files**), build/spoiler guard,
`npm run test:online` (**18 anonymous + 21 auth + 7 flag/expiry + 45 account checks**), production
chaos (**28 cases / 160 assertions**, four groups; nine later groups explicitly pending), main's six
case/interior/intro/HUD/movement/integration browser checks, loading, CSP and CSP inventory.
Accessibility passes **43 contexts / 129 viewport samples**, with no failures or browser errors.
Cold title: **21,072 JS / 11,878 CSS bytes**, caps **21,080 / 12,000** unchanged; original detailed
WebP is 274,026 bytes under main's reviewed 350,000-byte cap. No package or browser was added.
Phone arrival and deletion were reviewed. Exact summary: `captures/20261106_G9-C1/main-integration-verification.json`.

Browser pass: the combined pre-commit gate above is green. Four remaining legacy harnesses now share
the already verified atomic public text-reveal gesture, avoiding the same disappearing-role race.
Their exact-commit proof remains pending in `npm run test:g9 -- --phase=after --keep-going` (44 commands).
Record the tested SHA and every command in the checkpoint JSON; first-driver failures remain historical.
Do not reuse resume results after source/commit changes: the driver checks both commit and source state.

Not verified: the final committed 44-command checkpoint driver and final
commit-range secret scan; actual OAuth/accounts, live databases or sockets; deployed callback/headers
or a public preview stamp; Safari/Firefox, VoiceOver or physical phone/controller. Tests use injected
clients, intercepted endpoints, generated credential placeholders and an owned loopback fixture serving
unchanged public intro bytes through Vite's actual proxy. They do not use real services or accounts.

Remaining: commit the reviewed integration and curated evidence, run the exact-commit checkpoint
driver and safety check, then push. Keep the checkpoint evidence to about 3 MB.
After checkpoint-1 proof/push, SHA-check and restore the isolated stream-6/7 preparations and wire,
verify and commit them separately. Then finish streams 8–11 (checkpoint 3), streams 12–15 against the
published case DTO fixtures (checkpoint 4), streams 16–21 (checkpoint 5), and the ordered overflow.
Never stall on unavailable case examples: advance another authorized stream whose inputs exist.

Requests for Claude: **R11 remains open for sanitized serialized case DTO examples**. Published routes
for all four phases exist at `3098c0a` and on main, but `case_fixtures` currently provide CaseSnapshot
inputs, not exact nested response keys/types. Please publish redacted serialized GET-case answers for
active/night/solved states, replacing all IDs and prose with placeholders while preserving shapes for
cards, leads, search jobs, lights/posts/locks, partner targets/jobs, credits and parted state. This blocks
verified projections in streams 12–15. Current workaround: approved frontend schema fixtures only;
never inspect case secrets or the server view implementation. R2/R5 deployment/callback proof and
R14 public preview proof remain external; the full request table below is retained.

Contract changes Claude must mirror: `mode: 'online'`, reason `sign_in_required`, additive account
sign-in/setup, name/connection/retry and save-summary fields, and `rewards.status`. Schema stays 1;
the 24 view keys, 25 intents and exact event/replay behavior remain. Cloud `data` is
`{kind:'intro'|'world', actions:[accepted_id,...], place:known_place_id}` (at most 300 validated IDs /
100,000 bytes), never an engine snapshot, auth data or case answers. Default auth persistence is this
tab's `sessionStorage`, with guarded memory fallback and a tab-persisted PKCE verifier. The game
never calls `POST /api/auth/exchange`; Claude owns its eventual retirement with the check page/tests.
The cancelled AI companion stays removed. Credits stay only in Settings → Credits.

Decisions for Nils: none for the current approved scope. Before a final checkpoint note, replace this
in-progress heading with the required checkpoint-1 heading, final Lisbon time/SHA and verified counts
only after every required gate is green. If pushing passed streams earlier because the checkpoint has
exceeded about three hours, retain the exact label “streams done so far, not a checkpoint”.

## Checkpoint-1 cloud portability follow-up (not yet a completed checkpoint)

The first full committed run at `89aa9bc` passed 30 of 38 commands. All failures are retained in
`captures/20261106_G9-C1/checkpoint1-first-driver.json`; this is not a green checkpoint. The account
mapper now keeps the controller's explicit setup message. Cloud browser runs use installed Chromium
through `CHROME_PATH`, with no browser download. The intro check owns an anonymous loopback fixture
serving unchanged public story bytes through Vite's actual proxy, rather than assuming a laptop API.
World presentation uses the existing fictional sports board; demo allows only anonymous config/weather
GETs while preserving every timed-tour, journal and event assertion. SDK origin inventory classifies
only exact pinned-library literals without adding CSP permissions. HTML inventory checks the exact
four compiled entries plus the existing auth-check/help/privacy pages, rejecting extra/missing pages.

Main has advanced from `364d178` to `64fc731` with the approved visual/interior release. Adopt its
modules and original actions before final checkpoint proof. The latest published G10 contract at
`3098c0a` still lacks sanitized serialized case DTO examples; R11 remains open for those examples.
No actual service/account/database or deployed proof is claimed. Prepared streams 6–7 remain backed up
and separate. Next: finish targeted portability checks, merge main, then the full committed driver.

## Checkpoint-1 review follow-up in progress

Stream-5 foundation is committed at `74d9a82`; the complete driver is not yet accepted. Its first pass
found a night-storm frame miss (49 FPS, 112 draw calls on SwiftShader) and review found one ungated
previous-request sign-in control. The follow-up gates that control from the latest view, blocks hidden
activation, avoids unchanged status DOM updates and keeps failed Continue on the title. A queued native
close event no longer clears a reopened modal's active state. A new production journey covers a loaded
account modal, live flag-off, expired Continue, reachable report action and return to title (7 assertions).
Targeted tests pass 111/6 plus 8/2; the storm rerun passes at 60 FPS / 112 calls without changing its
55-FPS gate, quality or art. Full checkpoint verification must run again on the committed follow-up.

The 11 prepared stream-6/7 files are SHA-256 preserved in the coordinator's ignored node cache, with
another temporary backup. They are intentionally absent from the committed checkpoint workspace.
Restore/verify them after the checkpoint push. The driver now stamps the commit and source-dirty state;
resume cannot reuse a different commit or changed source. No reset/rebase/force push or second worktree.

## G9 stream 5: core request-state foundation verified (cloud, November 2026)

Checkpoint 1's full committed driver remains pending. Main is merged through `364d178` via `6b65028`;
stream 3 is `387e01b`, stream 4 is `9772f3e`. Main cancelled the AI companion; do not restore the old
`companion_llm` flag from the portable brief. The adopted privacy notice is unchanged; its stale test
now checks the cancelled feature is absent while preserving all provider/deletion/security assertions.

Changed: 300-ms loading, five-second slow reads, global/inline connection words, explicit report/retry,
original-control cooldowns, quiet screen-reader start/end announcements and first-sign-in actions.
GETs retry at 5/15/30 seconds, then on a tap; hidden timers pause and stale account finishes cannot apply.
Config focus respects both backoff and exhaustion. Recovered own-account reads finish name/save/crew/
ledger hydration, including recovery during pending name setup; recovered saves recheck conflicts.
SDK failures retain safe numeric status only. Ledger failures show unavailable, not an empty history.
Manual captain-setup retry is explicit. An anonymous arrival's sign-in action is flag/build gated;
its accepted journal survives OAuth return and Continue confirms the first server grant exactly once.
Expired writes require another explicit action. Account copy is 18 px; controls remain 16 px / 44 px.

Verified: `npm test` **2,284 / 163 files**, build (166-file/twelve-line spoiler guard), loading, CSP,
recorded online, shared call states and production chaos. Full working-tree counts include prepared
stream-6/7 files; the exact committed checkpoint driver will exclude them. Online has 45 account checks
plus 21 auth checks; chaos has **28 cases / 159 assertions** across account, intro, save and crew.
Accessibility passes **38 contexts / 114 viewport samples** at 1280/375/320 with no findings/errors.
Phone deletion/cooldown captures were reviewed. Exact evidence: `captures/20261106_G9-C1/stream5-verification.json`.
Cold title remains **20,873 JS / 11,771 CSS bytes** (caps 21,080 / 12,000). No new dependency or browser.
Independent review fixes and regressions cover read hydration, busy initialization, deadline/focus races,
and sign-in gating; native typing/restoration fixture races were fixed without weakening outcomes.

Coverage limit: remaining chaos groups are explicitly pending until their streams; `--all-groups`
fails while any are missing. Later streams must extend the same production runner. Not verified:
actual OAuth/accounts/database/socket, deployment, other engines, VoiceOver or physical devices.
Contract additions: account.connection/namePending/canRetryName and rewards.status; no new public intent,
top-level schema key or event. Prepared crew/presence files remain uncommitted and unwired.
Next: preserve those files, run the complete checkpoint-1 driver on the committed code and push; then
wire/verify/commit streams 6–7 and continue checkpoints 3–5 and overflow. Claude integrates; no deploy.

## G9 stream 4: account and replay saves verified (6 Nov 2026, UTC)

Checkpoint 1 remains incomplete. Main is merged through `f91f541` via `708b7eb`; stream 3 is `387e01b`.
Changed: server-owned name initialization/reroll, confirmed first kit and replay arrival, own-row rewards,
versioned accepted-action saves, minute/scene autosaving, both conflict choices and two-tap deletion.
Cloud selection also updates the device journal, so a later timer cannot overwrite that choice. Anonymous
Act 1 immediately updates its device-save view without a cloud write. Sign-in generation and account
scopes reject late auth, save and deletion completions. Normal logout keeps the journal; deletion clears it.

Verified: `npm test` **2,175 passed / 157 files**, build (162-file/twelve-line spoiler guard), loading,
recorded online, CSP and accessibility. The full count includes prepared, uncommitted stream-5 kit/tests;
the combined checkpoint gate remains required. Evidence: `captures/20261106_G9-C1/stream4-verification.json`.
Account has 42 browser assertions at 1280/375; auth has 21. Accessibility passes 29 contexts / 87 viewport
samples at 1280/375/320 with no findings/errors. The phone deletion warning/focus was reviewed and fixed.
The final frozen gate passes after fixing cold test imports and fake-socket ownership/cleanup, preserving
all assertions and timeouts. Independent review also found and fixed auth/logout and anonymous-save races.
Cold title: **20,874 JS bytes / 11,771 CSS bytes**; caps unchanged at 21,080 / 12,000.

Cloud `data`: `{kind: 'intro' | 'world', actions: [accepted_id, ...], place: known_place_id}`; max 300
validated IDs / 100,000 bytes, no snapshots, auth or case answers. Details are in GRAPHICS.md.
Not verified: live accounts/OAuth/database/socket, deployed callbacks/preview, other browsers or hardware.
Remaining: stream 5 states/retries/chaos, checkpoint-1 full driver/push, then checkpoints 2–5 and overflow.
Prepared stream-5 files stay separate. Requests remain in the table; no new intent/event/schema change.
Decisions for Nils: none. Branch `feat/g9-real-adapter`; Claude integrates; no main merge or deployment.

## G9 stream 3: in-game PKCE wired and locally verified (6 Nov 2026, Berlin)

Checkpoint 1 remains incomplete. Merged main `db4ddba` through `1da59ae`, then `f23e86e`.
Changed: lazy GitHub/S256 auth, callback cleaning, default tab-only SDK persistence, idle restoration,
access-token renewal, immediate persisted logout and bounded SDK cleanup. Private views clear on expiry.
A2 renews a 401 once, retains the same request body, and rejects late identity changes before replay.
Cached public reads never carry a bearer, including callers in the adopted festival module.
Production controls require `flags.sign_in`; missing build values show plain setup text. The installed
Supabase MIT notice is under Settings → Credits, with main's exact generated notices retained.

Verified: `npm test` **2,141 passed / 152 files** (includes 23 prepared, uncommitted stream-4 tests),
`npm run build` (161-file/twelve-line spoiler guard), `node scripts/check-online-golden.js`,
`node scripts/check-loading.js`, `node scripts/check-csp.js`, `node scripts/check-a11y.js`.
Exact logs: `captures/20261106_G9-C1/stream3-verification.json`. Production auth has 20 assertions at
1280/375, runtime-generated placeholders, intercepted endpoints, tab reload and SDK sign-out. Public
requests remain anonymous. Independent review found three lifecycle races; regression fixes were
independently re-reviewed with no unresolved findings. Phone account capture was reviewed.
Cold title: **20,873 JS bytes**, **11,771 CSS bytes**, contrast **6.48:1**. Caps remain 21,080 / 12,000.
Title gamepad polling, world preload inventory and call-state styles now load lazily. The redundant
module-preload polyfill is omitted for Vite's supported modern-browser target.

Not verified: actual OAuth/account/database/socket, deployed callback/preview, Safari/Firefox,
VoiceOver or physical devices. No real services/accounts, browser downloads or configuration writes.
Remaining: wire prepared stream 4, finish stream 5, then checkpoint-1 complete driver and checkpoints 2–5.
Requests: R15 resolved by Nils's explicit exception: only eight reviewed dictionary words outside
frontend were added; the linter and assertions are unchanged. Main's current readiness note answers
R1/R3/R6/R7/R8/R10/R11/R12; update the detailed request table during checkpoint-1 completion.
Contract changes: additive `account.canSignIn` / `account.signInMessage`; no intent/event/schema change.
Decisions for Nils: none. Branch: `feat/g9-real-adapter`; Claude integrates; no main merge/deploy.

## Cloud handoff: laptop work stopped cleanly (6 Nov 2026, Lisbon; handoff commit accompanies this note)

Nils explicitly moves the continuation to a cloud session because the laptop is closing. This
supersedes the old laptop-only setup. Read `CLOUD-HANDOVER-G9.md` then the full portable `G9-BRIEF.md`.
Stable stream 2 is committed and pushed at **`c8e94d7`**. Main last verified: `60f7fd0`, via `93386f8`.
This handoff adds only tested, unused auth storage/return helpers and portable instructions; no
sign-in wiring is claimed. Latest full unit suite: **1,127 passed / 93 files**. Production build and
117-file/twelve-line spoiler guard pass; recorded online, loading, CSP and a11y are green.
The regression manifest remains **37/37 green**, refreshed for the helper handoff. Exact results:
`captures/20261106_G9-C1/cloud-handoff-verification.json`.
Resume at **stream 3**, then 4–5 to finish checkpoint 1. Checkpoints 2–5 and overflow remain.
No live OAuth/database/Realtime or deployed proof. Do not resume laptop implementation unless Nils
requests it. The cloud session has all necessary code, brief, contracts and evidence on this branch.

## G9 streams done so far: real adapter core (6 Nov 2026, Lisbon; stream 2 commit accompanies this note)

This is a partial checkpoint 1, not its completion. Merged main `60f7fd0` via `93386f8`; adopted A4's
pinned library/presence modules, L2's panel and enforcing headers. STATUS conflict took main's version.
Changed: `src/online/case-adapter/` owns held answers, schema-1 projections, validation, reason/UID
mapping, guarded recovery and config refresh. Shared kit display data carries no rehearsal rules.
`adapter/lazy-online.js` starts after the first title frame. Production checks share recorded API
answers; `test:online` and the sequential G8-plus-G9 driver are added. Header preview mirrors main.
Verified: `npm ci --offline`; `npm test` — 1,096 passed, 91 files; `npm run build` and its spoiler guard;
`npm run test:online` at 1280/375. `npm run test:g9 -- --phase=after --keep-going`, followed by
`--resume --rerun=tests,build,loading,csp,online`, finishes **37/37 passed**. Exact commands/results:
`captures/20261106_G9-C1/stream2-verification.json` and `captures/20261106_G9-C1-after/Verification.json`.
Browser pass: all existing G8 checks plus build stamp, report privacy, call states, inventory and
recorded online intro. Cold title is **20,971 bytes**, 109 below the unchanged 21,080 cap. The adapter
request starts after the first title frame. Title contrast is 6.48:1. World round trips retain resources.
Not verified: actual OAuth/session/socket/database, public preview/deployed headers, physical devices,
Safari/Firefox and VoiceOver. The online browser test currently covers the anonymous part only.
Remaining: streams 3–5 for checkpoint 1, then checkpoints 2–5 and overflow. The library is on main.
Requests for Claude: R2 is now on main (deployed proof pending); R11's phase 1 is published by G10.
Contract changes Claude must mirror: `mode: online`; additive reason `sign_in_required`; 25 intents,
all 24 schema keys, exact events and local replay preserved. Replayed case refusals stay refused,
per G10's published contract. No real adapter dependency imports fake rules.
Decisions for Nils: none needed to finish stream 2. A paste-ready main-chat update is due at completion.

## G9 checkpoint 0: playtest identity and online slot ready (6 Nov 2026, Lisbon; verified build ee72758-dirty)

Merged from main: `c26f303`, via `996daef`; the final sync found nothing newer on main.
Changed: stream 0 (`ee72758`) completes title/perf stamps, dirty/environment labels, public issue drafts,
validated context/outcomes and report-link hooks. Stream 1 defers the account summary, preserves the
contract while splitting refusal vocabulary, reserves selection/PKCE entry points and adds the shared
validated security-header builder. No real adapter or sign-in is claimed at this checkpoint.
Verified: `npm test` — 500 passed, one canonical-bulletin parity check skipped until its input reaches
main, 67 files; `npm run build` — built, 112-file/twelve-line spoiler guard green. Stream 1 browser commands
and exit codes are in `captures/20261106_G9-C0/Verification.json` and `stream1-verification.json`.
Browser pass: loading, title timing, build stamp, report privacy, CSP/tour, inventory and accessibility
are green on the candidate build: `node scripts/check-loading.js`,
`node scripts/check-title-start.js --phase=after`, `node scripts/check-build-stamp.js`,
`node scripts/check-problem-report.js`, `node scripts/check-csp.js`,
`node scripts/check-csp-inventory.js`, `node scripts/check-a11y.js`. Cold title 19,679 bytes, 1,401 bytes of room. 23 a11y contexts pass.
Not verified: public Vercel preview stamp (R14), deployed headers, real OAuth/session/Realtime, physical
phone/controller, Safari/Firefox and VoiceOver. Title timing observations are not a controlled speed comparison.
Remaining: stream 2 real-adapter core, then 3–5 for checkpoint 1. Group 2/library and panels are not on
main yet. The canonical bulletin test resumes automatically when its main input exists.
Requests for Claude: R1–R13 retained; R14 asks for an accessible public preview URL/stamp check.
Contract changes Claude must mirror: none to schema/methods/reasons/events. Reports add only fixed enums,
coarse browser version, numeric perf fields and contract-vocabulary outcomes; no arguments or player data.
Decisions for Nils: none required for checkpoint 0.

### Coordinator resume state

The latest note at the top supersedes old stream-resume instructions below earlier checkpoints.
Root owns shared hooks/configuration/docs and all sequential browser/GPU checks. Keep source frozen
while a browser gate runs. Continue checkpoint-1 verification before restoring later-stream source.

The preparations below are **ignored and uncommitted**. Their presence does not establish active
integration or a passed gate. Paths are relative to `frontend/`. Preserve these bytes and their SHA
manifests outside the node cache before any `npm ci`, which can remove them:

- Original eleven stream-6/7 files and manifest: `node_modules/.cache/g9-pending67-h4lu91ts/`.
  It also has an independent coordinator backup. Apply only after checkpoint-1 proof/push, checking
  every recorded SHA and reconciling changed main files rather than overwriting them blindly.
- Presence identity/roster-race fixes and regressions:
  `node_modules/.cache/g9-presence-fix-4f86c4ea29/` (mirrored paths start with `frontend/`).
- Presence renderer identity/pool correction and regressions:
  `node_modules/.cache/g9-presence-render-6bd5bae39249/` (manifest; syntax/static review only).
- Auth/lazy-auth own-crew-seat read helpers and test copies:
  `node_modules/.cache/g9-crew-seats-009362ab55e0/`.
- Crew UI candidate: `node_modules/.cache/g9-crew-ui-fm2FwB/src/screens/crew.js`.
  Root still composes authoritative permission flags, polling and change hooks.
- Market modules/tests: `node_modules/.cache/g9-market-e86f9c6a984c/`.
  Root still injects the adopted A2/session hooks and runs stream gates.
- Bulletin modules, generic fixtures/tests and manifest:
  `node_modules/.cache/g9-bulletin-c3f71def23/`.
  Root still wires strict flag loading, safe projections/observations and stale/attribution wording.

`node_modules/.cache/g9-legacy-light-gates-z1j1mmau/` is an archived SHA-backed preparation for the
three legacy harness fixes already applied by root; do not restore it again over newer source.
Never stage or commit an ignored preparation tree. Verify and commit each restored stream separately.
Use relative evidence paths; add only changed-screen PNGs and keep the checkpoint near 3 MB.

## Requests for Claude

Request status is carried forward through merged main `64fc731`. Do not repeat a request; update its status.
Settings and database changes belong to Claude/G10. No request authorizes G9 to change them.

| Id / status | Route or setting | Missing behaviour / why it matters | Proposed shape | Blocks | Meanwhile |
| --- | --- | --- | --- | --- | --- |
| R1 · ready on main `f23e86e` | Disposable API/test identities | Current readiness note documents four local identities and an opt-in scratch startup | `docs/handoff/g9-cloud-readiness.md` / local test-server guide | Stream 20 B proof remains | Recorded/intercepted part A; no live services |
| R2 · on main / team deployment proof | `vercel.json` headers | Preserve main’s enforcing CSP, exact Supabase origins, audio and popup-compatible COOP | Source of truth remains current main; fixture substitutes only the placeholder origin | G9 deployed callback/preview proof | Exact local enforcing preview |
| R3 · ready / production off | `flags.sign_in` | Registered and default false; enable externally after callback/settings proof | Existing boolean contract | Live sign-in rollout | Production controls strictly gated |
| R4 · open | `/api/auth/exchange`, `/auth-check.html`, coupled backend tests/checklist | Temporary team check should retire together after in-game sign-in is live | Remove temporary route/page/tests together in a server/integration package | Nothing | G9 never calls the exchange route and leaves public auth-check files untouched |
| R5 · bindings ready / callback proof pending | Public build values and redirect | Main confirms Production/Preview binding names; G9’s actual callback round trip is not verified | Existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, root game return | Live sign-in proof | Generated placeholder build and intercepted PKCE |
| R6 · ready / team reports enabled | Bulletin flag | Flag and fail-before-read behavior are on main | Existing `flags.bulletin` boolean | G9 bulletin integration/proof | Read only when strictly true |
| R7 · ready on main | Own-crew member read | Existing authenticated SELECT/RLS permits own crew and rejects outsiders | Auth client reads bounded own-crew rows | G9 presence mapping/proof | Empty member list on refusal |
| R8 · ready on main | Crew push hints | Successful join/muster emits one post-commit version hint | Existing A4 `live_crew_updated` contract | G9 crew/presence wiring | Five-second poll only while forming crew screen is open |
| R9 · optional/open | `POST /api/crews/join` | Optional server preview before spending a wrong guess | `{code, preview:true}` returns preview only, never joins | Nothing | First tap normalizes/previews code shape locally, second confirms |
| R10 · ready on main | Account metadata | GET me supplies verified `rerollsLeft` and `isHost` | Existing additive fields; still initialize the idempotent name after sign-in | G9 mapping/proof | Host controls remain hidden unless verified/capable |
| R11 · all phases published; serialized nested DTO needed | Published case contract / `case_fixtures` at `3098c0a` and main | Current fixtures are CaseSnapshot inputs; exact nested card/lead/search/job/light/partner/credit DTO keys/types are not published there | Add redacted serialized GET-case fixtures for active/night/solved states, replacing every ID/prose value with placeholders while preserving exact keys/types | Verified streams 12–15 projections | Use approved frontend schema fixtures; never inspect secret data or view implementation |
| R12 · resolved on main | Weather attribution | Readiness confirms credits only in Settings → Credits | Existing contract | Nothing | Preserve clean HUD and weather check |
| R13 · process/open | G10 changes to `backend/content/secret/` | New secret content can invalidate committed reveal fingerprints | Same server commit runs frontend build and commits regenerated hash-only fingerprint fixture | Subsequent build gates | Regenerate only the hash fixture after a merge if build requests it |
| R14 · open | Public preview URL / Vercel system build values | GitHub reports successful deployment but only links an inaccessible dashboard; preview SHA cannot be checked without login | Give an accessible preview origin and confirm `build-stamp.json` has a real SHA and `environment: preview`; enable Vercel system build values if SHA is dev | Stream 0 preview verification only | Compiled local stamp/env/fallback and browser checks pass; no account login attempted |

| R15 · resolved by Nils’s explicit eight-word exception | `scripts/text-lint/words.txt` | G24's shared dictionary rejects correctly spelled existing G9 copy and browser names, so the full unit gate fails | Review/add `chrome`, `firefox`, `safari`, `submitting`, `enable`, `perf`, `attempts`, `mit` | All full stream/checkpoint unit gates | Targeted tests/build/browser still run; only the eight approved vocabulary lines changed outside frontend; linter/assertions unchanged |

## Browser pass

Checkpoint 0 local browser checks pass; exact evidence is linked above. Public preview verification is R14. Real OAuth, a live
Supabase session/socket, deployed headers, Safari/Firefox, VoiceOver, a physical phone and controller are
not verified by the recorded-answer Chrome checks.

Additional isolated preparations (syntax/static review only, unapplied and untested):
- `node_modules/.cache/g9-islet-c521ce3c44cc/`: stream-8 L2 identity guards and host hooks.
- `node_modules/.cache/g9-online67-candidates-f91e65db69/`: stream-6/7 intercepted browser fixtures.
- `node_modules/.cache/g9-production-proof-8supx1iy/`: stream-16 production boundary proofs.
All have hash manifests and integration notes; apply only after checkpoint-1 proof, then run real gates.
