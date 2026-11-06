# G9 browser handoff

Checkpoint notes and server requests for Claude. All authored changes stay under `frontend/`.
The setup update keeps G9 on the laptop; G10–G16 run in Codex cloud. G10 publishes the case contract on
`feat/case-backend`; do not use an older draft as the final route contract.

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
- `REAL_ADAPTER_READY` stays false until stream 2 conformance passes. The reserved real factory currently
  returns the disconnected adapter. Do not treat it as completed U1.
- Diagnostic APIs: `noteIntentOutcome`, `noteAdapterView`, `notePerformanceSummary`, and
  `createProblemDescription`. UI call-state's optional `reportLink` is filled throughout in stream 5.
- `security-headers.js`: `buildSecurityHeaders(url?, {platformConfig})`, `toVercelHeaders(headers)`;
  exact bare HTTPS Supabase origin only; source-of-truth drift fails. Current main has no headers.
- Next: repeat the secret scan over `origin/main..HEAD`, push checkpoint 0; then stream 2.
  Add real-adapter conformance, reasons/UID/scheduler and public/private clients before wiring auth.
  Run `test:online` from stream 2 onward and the full sequential G9 driver from checkpoint 1.
- New evidence stays below 3 MB; use relative paths. Extra unchanged captures remain in local test cache.
  Existing historical absolute paths are stream 21 cleanup; newly committed checkpoint evidence is redacted.

## Requests for Claude

Open means no published answer is present on main `c26f303`. Do not repeat a request; update its status.
Settings and database changes belong to Claude/G10. No request authorizes G9 to change them.

| Id / status | Route or setting | Missing behaviour / why it matters | Proposed shape | Blocks | Meanwhile |
| --- | --- | --- | --- | --- | --- |
| R1 · open | Local API startup and test sign-in | Online golden path part B needs two fixed players and a host without real GitHub or live DB access | One documented scratch/in-memory startup command; test sign-in enabled only by explicit opt-in + `APP_ENV=local` + no `VERCEL`; tests refuse preview/production | Stream 20 B | Recorded answers, part A |
| R2 · open | `vercel.json` headers | No headers on main; production sign-in and Realtime need exact public origins under enforced CSP | Catch-all security header block from `npm run print:headers -- https://uqcjihigqjgyuafrfbnp.supabase.co`; report-only first, enforce before sign-in flag | Production sign-in / stream 17 | Enforced local preview proposal; no deployment change |
| R3 · open | `GET /api/config`, `FLAG_NAMES` | Production must hide sign-in until headers/settings are ready | `flags.sign_in: boolean`, default false, enabled after R2 | Production sign-in | Hide unless strictly true |
| R4 · open | `/api/auth/exchange`, `/auth-check.html`, coupled backend tests/checklist | Temporary team check should retire together after in-game sign-in is live | Remove temporary route/page/tests together in a server/integration package | Nothing | G9 never calls the exchange route and leaves public auth-check files untouched |
| R5 · partial | Vercel public build values and Supabase redirect allowlist | In-game auth needs configured client and return to the game; config currently gives provider/public URL only | Production `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; allowed root return `https://the-great-plot-twist.vercel.app/`; Claude gives Nils values privately/settings only | Live sign-in | Plain not-set-up state; no env file or real login |
| R6 · open | `GET /api/config`, bulletin flag | Bulletin/tonight/hook must remain off until Nils enables them | `flags.bulletin: boolean`, default false | Production open-world screens | `bulletin.status: off` |
| R7 · open | Own crew's `crew_seats.player_id` RLS read | A4 needs member ids for crewmate flags; crew route deliberately exposes none | Confirm own-crew read through auth client under RLS, or add opaque member ids to crew answer | Crewmate flags | Crew room with empty member-id list |
| R8 · open | Realtime crew pushes | Forming crew should update on join/muster without repeated reads | `live_crew_updated {kind: crew_changed, data}` on join and muster | Nothing | Poll own crew every 5 s while forming screen is open |
| R9 · optional/open | `POST /api/crews/join` | Optional server preview before spending a wrong guess | `{code, preview:true}` returns preview only, never joins | Nothing | First tap normalizes/previews code shape locally, second confirms |
| R10 · partial | `GET /api/me` | GET lacks reroll/host fields; POST name answers already include rerollsLeft | Add `rerollsLeft` and `isHost` | Nothing | Idempotent POST name after sign-in; host controls hidden |
| R11 · waiting for G10 | Published case contract and `case_fixtures` on `feat/case-backend` | Browser case mapping needs approved route/view shapes | G10 note names published ref and case section; placeholders replace all suspect/card/deduction/reveal texts/ids in browser fixtures | Checkpoint 4 | Work on other streams; no secret/case copy |
| R12 · open | Weather section of `docs/INTERFACES.md` | Old wording still requires credits beside HUD, contradicting Nils' 6 Nov decision | Attribution/licences only under Settings → Credits | Nothing | Preserve clean HUD and existing weather-wiring check |
| R13 · process/open | G10 changes to `backend/content/secret/` | New secret content can invalidate committed reveal fingerprints | Same server commit runs frontend build and commits regenerated hash-only fingerprint fixture | Subsequent build gates | Regenerate only the hash fixture after a merge if build requests it |
| R14 · open | Public preview URL / Vercel system build values | GitHub reports successful deployment but only links an inaccessible dashboard; preview SHA cannot be checked without login | Give an accessible preview origin and confirm `build-stamp.json` has a real SHA and `environment: preview`; enable Vercel system build values if SHA is dev | Stream 0 preview verification only | Compiled local stamp/env/fallback and browser checks pass; no account login attempted |

## Browser pass

Checkpoint 0 local browser checks pass; exact evidence is linked above. Public preview verification is R14. Real OAuth, a live
Supabase session/socket, deployed headers, Safari/Firefox, VoiceOver, a physical phone and controller are
not verified by the recorded-answer Chrome checks.
