# G9 browser handoff

Checkpoint notes and server requests for Claude. All authored changes stay under `frontend/`.
Nils explicitly authorized cloud continuation. G10 publishes the case contract on
`feat/case-backend`; use its published contract and fixtures only.

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

- Branch `feat/g9-real-adapter`; starter commits `cae6dad`, `bb7599e`, `f413006`, `0b6b809` are pushed.
  Merge `996daef` and stream 0 `ee72758` are included in this checkpoint; stream 1 is committed with this note.
- Root owns shared hooks/configs/docs and sequential browser checks. Bounded diagnostics/header
  subagents are finished. Freeze source during dev-browser runs.
- Stream 2 now selects the lazy online core in ordinary play. Explicit local/demo selection is unchanged.
  Its stream gate passes; sign-in/account/state streams remain before completed U1 or checkpoint 1.
- Diagnostic APIs: `noteIntentOutcome`, `noteAdapterView`, `notePerformanceSummary`, and
  `createProblemDescription`. UI call-state's optional `reportLink` is filled throughout in stream 5.
- `security-headers.js`: `buildSecurityHeaders(url?, {platformConfig})`, `toVercelHeaders(headers)`;
  exact bare HTTPS Supabase origin only; source-of-truth drift fails. Current main has no headers.
- Next: cloud continuation at stream 3 (auth), then streams 4–5. Stream 2 is pushed at c8e94d7.
  Supabase 2.118.0 is installed from main. The module/API-type review is complete.
  Browser/GPU work remains root-only and sequential. Keep all stream gates and the full checkpoint driver.
- New evidence stays below 3 MB; use relative paths. Extra unchanged captures remain in local test cache.
  Existing historical absolute paths are stream 21 cleanup; newly committed checkpoint evidence is redacted.

## Requests for Claude

Requests are checked against main `60f7fd0`. Do not repeat a request; update its status.
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
