# Continue G9 in the cloud

## Latest instruction and branch

Nils asked to stop the laptop session at a clean, pushed point because the laptop is closing, and
explicitly requested a handover to a cloud session. That overrides the original laptop-only setup
note. Continue in the cloud repository checkout, on **`feat/g9-real-adapter`**. Do not recreate,
reset, rebase or force-push this branch. Claude integrates; never merge into main or deploy.

Read this file, `HANDOFF-G9.md`, then the full portable approved task in `G9-BRIEF.md`. Read repository
AGENTS, CONTRIBUTING, ENGINEERING, DECISIONS, INTERFACES and current graphics documents as that brief
requires. Paths in this file are relative to `frontend/`. No laptop/private-folder access is needed.
Fetch and merge current `origin/main` before the next checkpoint. Main last verified here is
`60f7fd0`, merged through `93386f8`; keep Claude's version in team-owned merge conflicts.

## What is finished

- G9 starter and checkpoint 0 are pushed: `cae6dad`, `bb7599e`, `f413006`, `0b6b809`, `ee72758`, `cfbabd7`.
- Main sync: `93386f8`. It supplies Supabase **2.118.0**, A4's Realtime/presence modules, L2's islet
  panel and enforcing platform headers. `npm ci --offline` passed locally. Use `npm ci` in the cloud.
- **Stream 2 is complete and pushed at `c8e94d7`.** The real core is in `src/online/case-adapter/`.
  It returns immediately, retains all 24 schema-1 view keys and 25 intents, publishes cloned
  `case_updated` views before intent resolution, and has no `dev` property or fake-rule dependency.
- Public config uses a token-free API. Private reads/writes use A2. Input/envelope validation fails
  closed. Session epochs reject late private responses and recovery writes. Unknown writes reread
  then retry once with the same UID; PUT save is excluded from blind retries.
- Ordinary play uses `adapter/lazy-online.js` after the first title frame. Local/demo selection is
  unchanged. Anonymous Act 1 and its accepted-move journal work, without a locally granted kit.
- `scripts/api-browser-fixture.js` supplies the shared closed-service baseline. The online golden
  path and resumable G9 driver are wired in package.json. Header preview mirrors main's exact policy.

## Small stream-3 preparation in this handoff commit

These helpers are **tested but unused**. They do not mean that sign-in or checkpoint 1 is finished.

- `src/online/auth-storage.js`: `AUTH_STORAGE_MODE='session'`, `AUTH_STORAGE_KEY='plot-twist-auth-v1'`,
  `createAuthStorage({mode,sessionStorage,localStorage})`. Raw SDK strings; guarded storage with memory
  fallback; every owned verifier key stays in sessionStorage, including memory/local session modes.
  `canKeepVerifier()` tests a nonsecret probe. `clearVerifiers()` and `clearSession()` remove owned
  keys only. `close()` clears and blocks old SDK writes. Use **`close({clear:false})` for normal app
  disposal**, preserving the stored session for reload; use clearing close for sign-out/deletion.
- `src/online/auth-return.js`: `takeAuthReturn({href,history})` returns ephemeral
  `{code,error,flowId}` or null. It immediately strips code/error/error_description/sb_flow_id,
  preserves other game parameters, rejects ambiguity, and fails closed if address cleaning fails.
- Their tests cover 31 cases. No `auth.js`, library wiring, API renewal hook, sign-in UI gate or
  callback integration exists yet. The reserved selector hook is still empty.

## Resume at stream 3

1. Implement `src/online/auth.js` with lazy SDK import and injected fake client tests. Only auth.js
   and A4's realtime.js may import the SDK. PKCE/GitHub only; no `/api/auth/exchange` use.
2. Integrate callback cleaning, idle session restoration, access-token renewal into A2's memory
   session, sign-out and lifecycle guards. Never inspect/log/copy the refresh token yourself.
3. Hide production sign-in unless config `flags.sign_in === true`; handle missing public build
   values with plain not-set-up text. Current R3/R5 settings still need checking on latest main.
4. Extend the intercepted production golden path through sign-in/reload/sign-out. Generate tokens
   at runtime. Never sign in to a real service. Preserve the default sessionStorage choice for N11.
5. The cold title has only **109 bytes** spare. Do not raise its 21,080-byte cap. A good next split is
   moving title gamepad polling from main.js into an after-paint module, retaining gamepad behavior.
6. Then stream 4 (name, arrival, saves/conflicts, own wallet rows and delete), stream 5 (all call
   states/chaos), and the rest of the approved brief. No later stream is complete by implication.

### Installed SDK findings, already checked against 2.118.0 declarations/source

- `createClient(url,key,{auth:{flowType:'pkce',storageKey,storage,persistSession:true,
  autoRefreshToken:true,detectSessionInUrl:false,debug:false},global:{fetch}})`.
- **persistSession:false ignores custom storage.** Keep it true even with custom memory storage.
- `auth.signInWithOAuth({provider:'github',options:{redirectTo,skipBrowserRedirect:true}})` returns
  `{data:{provider,url,flowId?},error}`. Inject redirect for unit tests.
- `auth.exchangeCodeForSession(code,flowId?{flowId}:undefined)`, `getSession()`, `refreshSession()`,
  `onAuthStateChange(...)`, `signOut({scope:'local'})`, and `dispose()` are installed APIs.
- Keep the auth-state callback synchronous. SDK dispose does not abort pending fetches or erase
  stored sessions, so maintain your own lifecycle guards.
- PKCE uses legacy, per-flow and flow-index verifier keys. Do not assume one key or clear only one.
- Browser token endpoint fixture is a flat object with runtime access/refresh placeholders,
  bearer type, future expiry and a generic user; it is not `{session:...}`. Intercept authorize,
  PKCE token, refresh token, logout and optional user requests. Capture paths only, never payloads.
- Check installed declarations again if main changes the package. Auth/client packages use MIT;
  add their notice only under Settings → Credits when the library is actually wired.

## Current server inputs and limits

- Full request table R1–R14 remains in HANDOFF-G9.md. Update statuses from latest main; do not repeat
  requests. No server, settings, database or platform changes are authorized in G9.
- G10 published Phase 1 at `6507dc7`, branch `feat/case-backend`, last fetched tip `2a2fccd`. Read only
  its published case section of INTERFACES and case_fixtures. Never read/copy secret case source.
- Phase 1 documents GET case, search, accuse and host clock. Finale is `{}`, partners `[]`; pin/pair,
  errands and finale routes arrive in later phases. Work other streams while waiting for routes.
- Server HTTP-200 repeat preserves the original outcome. A repeated refused accusation **stays
  refused**. The mapper and regression test already preserve this, with a reread request.
- Recorded fixture IDs/text must remain generic placeholders. No solution, reveal or hook prose.

## Verification and evidence

Stream 2: `npm test` **1,096 passed / 91 files**, build/spoiler guard, `npm run test:online` and
**37/37 G9 regression commands passed**. The handoff helpers add 31 tests: latest full count **1,127
passed / 93 files**. See the top handoff note and capture manifests for final exact results.

Evidence: `captures/20261106_G9-C1/` and `captures/20261106_G9-C1-after/Verification.json`.
Cold title **20,971 bytes**, 10,041 gzip; cap **21,080**. Adapter request starts after the first title
frame. Button contrast 6.48:1. World round trips retain resource counts; local Chrome reported 60 fps.
These are local observations, not live-service or physical-device proof.

Run stream gates and checkpoint checks from the full brief. `npm run test:g9 -- --phase=after
--keep-going` runs G8's 31 commands plus G9 checks; `--resume` repeats failures; explicit
`--rerun=tests,build,online,loading,csp,a11y` refreshes those checks after the unused helper addition.
Browser/GPU checks are sequential and coordinator-only. Use available cloud Chrome/Chromium; no
browser downloads. The legacy intro check retains an actual public API proxy probe, so document a
missing local public API rather than weakening it or silently claiming integration proof.

Not verified: real OAuth, database/socket, deployed preview/headers, physical phone/controller,
Safari/Firefox and VoiceOver. R1's scratch/test-auth server is needed for live-server golden part B.
The online test is currently only the anonymous part; extend it as every stream lands.

## Non-negotiable boundaries

Work only inside frontend; never backend, supabase, vercel.json, .github, other docs or team-owned
festival files. Preserve approved pixel art, integer sampling/scales, 16/18/19/18 px text floors,
44 px touch targets, 320 px layout, exact events/replay/cleanup and the server-free demo. Credits
only in Settings → Credits. No new packages, secrets, real service accounts, backend writes during
the demo, spoilers or budget increases. Screens do not fetch or decide game outcomes.

Commit per stream, push verified checkpoints, keep the handoff current, and do not stop at another
plan. Provide Nils a concise status and a paste-ready update for Claude's main chat when finished.
