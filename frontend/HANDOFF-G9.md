# G9 browser handoff

Checkpoint notes and server requests for Claude. All authored changes stay under `frontend/`.
The setup update keeps G9 on the laptop; G10–G16 run in Codex cloud. G10 publishes the case contract on
`feat/case-backend`; do not use an older draft as the final route contract.

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
| R1 · open | Local API startup and test sign-in | Online golden path part B needs two fixed players and a host without real GitHub or live DB access | One documented scratch/in-memory startup command; test sign-in enabled only by explicit opt-in + `APP_ENV=local` + no `VERCEL`; tests refuse preview/production | Stream 20 B | Recorded answers, part A |
| R2 · on main / deployed proof pending | `vercel.json` headers | Main `60f7fd0` adds enforcing CSP and five other headers | Preview mirrors main’s exact compact policy, including inherited self-only restrictions; unsafe/wildcard drift still fails validation | Deployed proof / stream 17 | Local enforcing preview; no deployment change |
| R3 · open | `GET /api/config`, `FLAG_NAMES` | Production must hide sign-in until headers/settings are ready | `flags.sign_in: boolean`, default false, enabled after R2 | Production sign-in | Hide unless strictly true |
| R4 · open | `/api/auth/exchange`, `/auth-check.html`, coupled backend tests/checklist | Temporary team check should retire together after in-game sign-in is live | Remove temporary route/page/tests together in a server/integration package | Nothing | G9 never calls the exchange route and leaves public auth-check files untouched |
| R5 · partial | Vercel public build values and Supabase redirect allowlist | In-game auth needs configured client and return to the game; config currently gives provider/public URL only | Production `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; allowed root return `https://the-great-plot-twist.vercel.app/`; Claude gives Nils values privately/settings only | Live sign-in | Plain not-set-up state; no env file or real login |
| R6 · open | `GET /api/config`, bulletin flag | Bulletin/tonight/hook must remain off until Nils enables them | `flags.bulletin: boolean`, default false | Production open-world screens | `bulletin.status: off` |
| R7 · open | Own crew's `crew_seats.player_id` RLS read | A4 needs member ids for crewmate flags; crew route deliberately exposes none | Confirm own-crew read through auth client under RLS, or add opaque member ids to crew answer | Crewmate flags | Crew room with empty member-id list |
| R8 · open | Realtime crew pushes | Forming crew should update on join/muster without repeated reads | `live_crew_updated {kind: crew_changed, data}` on join and muster | Nothing | Poll own crew every 5 s while forming screen is open |
| R9 · optional/open | `POST /api/crews/join` | Optional server preview before spending a wrong guess | `{code, preview:true}` returns preview only, never joins | Nothing | First tap normalizes/previews code shape locally, second confirms |
| R10 · partial | `GET /api/me` | GET lacks reroll/host fields; POST name answers already include rerollsLeft | Add `rerollsLeft` and `isHost` | Nothing | Idempotent POST name after sign-in; host controls hidden |
| R11 · phase 1 published / later phases pending | Case contract on `feat/case-backend` at `6507dc7`, latest `2a2fccd` | Phase 1 documents GET case, search and accuse; finale and partners are reserved, pin/pair routes are not in this section | Adopt G10’s published contract as phases reach main; all browser fixture text/ids stay placeholders | Later checkpoint 4 streams | Read only the authorized case contract/fixtures; no secret/case copy |
| R12 · open | Weather section of `docs/INTERFACES.md` | Old wording still requires credits beside HUD, contradicting Nils' 6 Nov decision | Attribution/licences only under Settings → Credits | Nothing | Preserve clean HUD and existing weather-wiring check |
| R13 · process/open | G10 changes to `backend/content/secret/` | New secret content can invalidate committed reveal fingerprints | Same server commit runs frontend build and commits regenerated hash-only fingerprint fixture | Subsequent build gates | Regenerate only the hash fixture after a merge if build requests it |
| R14 · open | Public preview URL / Vercel system build values | GitHub reports successful deployment but only links an inaccessible dashboard; preview SHA cannot be checked without login | Give an accessible preview origin and confirm `build-stamp.json` has a real SHA and `environment: preview`; enable Vercel system build values if SHA is dev | Stream 0 preview verification only | Compiled local stamp/env/fallback and browser checks pass; no account login attempted |

## Browser pass

Checkpoint 0 local browser checks pass; exact evidence is linked above. Public preview verification is R14. Real OAuth, a live
Supabase session/socket, deployed headers, Safari/Firefox, VoiceOver, a physical phone and controller are
not verified by the recorded-answer Chrome checks.
