# G9 browser handoff

Checkpoint notes and server requests for Claude. All authored changes stay under `frontend/`.
The setup update keeps G9 on the laptop; G10–G16 run in Codex cloud. G10 publishes the case contract on
`feat/case-backend`; do not use an older draft as the final route contract.

## G9 checkpoint 0: in progress, stream 0 gate passed (6 Nov 2026, Lisbon)

Merged from main: `c26f303`, via merge commit `996daef`.
Changed: stream 0 extends build identity, public issue drafts and safe runtime context; stream 1 defers
account-summary paint, reserves the real adapter slot and adds the validated header builder.
Verified: candidate `npm test` passes 500 tests in 67 files; `npm run build` passes the spoiler guard.
Browser pass: baseline title ready 158.3 ms / first contentful paint 192 ms; stream 0 unit/build/loading/stamp/report/CSP/a11y checks pass. Stream 1
is prepared and needs its independent final gate. No checkpoint push until the browser self-check passes.
Not verified: Vercel preview stamp, deployed headers, real sign-in/services, other engines and physical devices.
Remaining: commit stream 0, restore the two shared-file stream 1 variants, run its final gates and commit, push; then stream 2 real adapter core.
Requests for Claude: R1–R13 below, reviewed against `origin/main` at `c26f303`.
Contract changes Claude must mirror: none yet; additive diagnostic fields contain fixed enums/numbers only.
Decisions for Nils: none needed for checkpoint 0.

### Coordinator resume state

- Branch: `feat/g9-real-adapter`. Starter checkpoints `cae6dad`, `bb7599e`, `f413006`, `0b6b809` are pushed.
- Main is merged, without rebase. No new packages were added. Group 2 is not on main yet; Supabase library
  and panels must be adopted from main when they arrive, never installed or rewritten ahead of that merge.
- Two bounded subagents completed diagnostics and header-builder modules. They are idle. Root owns shared
  hooks/configs/docs and all browser runs. Freeze source during browser runs to avoid hot reload invalidation.
- Candidate pure tests: `npm test` → 500 passed / 67 files. See temporary candidate logs in `captures/`;
  collect/redact them into `captures/20261106_G9-C0/` before any commit. Keep the checkpoint below 3 MB.
- `scripts/check-title-start.js --phase=before` records the baseline. Run `--phase=after` on the candidate.
- `scripts/security-headers.js`: `buildSecurityHeaders(url?, {platformConfig})`, `toVercelHeaders(headers)`;
  no-address proposal is self-only. Exact Supabase origin adds its HTTPS/WSS pair. No platform headers exist
  at this main revision. Vite preview/check-csp share the generated set; `print:headers` prints the proposal.
- `src/online/case-adapter/index.js` is deliberately only the disconnected placeholder for checkpoint 0;
  `REAL_ADAPTER_READY` in `adapter/select.js` stays false until stream 2 passes conformance. Do not report it
  as the real adapter implementation.
- New diagnostic APIs: `noteIntentOutcome(name,result)`, `noteAdapterView(view)`,
  `notePerformanceSummary(summary)`, and `createProblemDescription(link)`. They keep only allowed enums
  and numbers; outcome traces never include arguments. UI call-state accepts an optional `reportLink` hook;
  stream 5 still needs to fill it for every error state.
- Shared-file staging: main.js currently uses the original synchronous account summary for the isolated
  stream 0 gate. Stream 1 restores createLazyAccountSummary plus summary.start() on title state, and
  wires Vite preview to buildSecurityHeaders with the readonly platform config. The coordinator retained
  both combined-file versions while running the independent stream gate.
- Next candidate checks: loading (running), title-after, build-stamp, problem-report, CSP/inventory and a11y.
  Run Chrome checks sequentially. Then rerun unit/build and commit per stream. Update this top note with
  exact commands/results and the next unfinished stream before pushing.

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

## Browser pass

Checkpoint 0 candidate checks are pending; exact final evidence will be linked above. Real OAuth, a live
Supabase session/socket, deployed headers, Safari/Firefox, VoiceOver, a physical phone and controller are
not verified by the recorded-answer Chrome checks.
