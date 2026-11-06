# Threat model and security findings (G27)

Source review for Nils and Claude, 6 November 2026, against `origin/main` commit `c26f3032b150af970d57fbbcd6eea439eb26f4c4`. File/line references below refer to that baseline. This is a report, not a code fix or deployed security certification. No live site, Supabase project, secret or workflow was accessed. [Security process](SECURITY.md) · [dependency/licence audit](LICENSES-THIRD-PARTY.md) · [reproduction and raw evidence](../scripts/audit/README.md).

## Assets and actors

| Asset | Security property and consequence |
| --- | --- |
| Supabase service-role key, OAuth/client secrets, keep-alive credential | Confidentiality; the service-role key bypasses RLS. Exposure can compromise all application records. No credential values were read. |
| Login access tokens and PKCE verifier | Confidentiality, correct identity and bounded lifetime; theft enables actions as a player. |
| Profiles/IDs, saves, holdings, wallet ledger, crew membership and name rerolls | Owner/member access, integrity, data minimisation and deletion. Authenticated users may read all profile rows (including UUID/timestamps) and wallet reasons by design; other records are own/member/server-only. |
| Play-money balances, kit awards and trades | Atomicity, replay safety and server-authoritative rules. No real-money redemption is in scope. |
| Case solution, reveal text and progression | Fair play within the served game. The public source repository already contains spoilers; source confidentiality is not promised. |
| Static bundles, package graph, art/audio/story and external recordings | Supply-chain integrity, reproducible versions and lawful redistribution. |
| Vercel/Supabase quotas and provider access | Availability for the class; abuse can deny legitimate users service on shared free-tier budgets. |

| Actor | Capability and motivation |
| --- | --- |
| Player | Legitimate browser/user token; owns one account's requests, may belong to a crew. Can accidentally retry or use stale tabs. |
| Cheater | All player capabilities plus arbitrary requests, modified JS/storage, replay/concurrency and knowledge of public source/rehearsal data. |
| Outsider | Unauthenticated HTTP traffic, public static files/source, arbitrary guessed codes/tokens and framing links. |
| A leaked preview | A URL is not an identity. It exposes a second app entry surface; compromised preview code/configuration can reach the shared production database and secrets. |
| Maintainer or compromised dependency/provider | Trusted build/server execution or untrusted external data; can affect all players if the trusted boundary is compromised. |

## Trust boundaries

1. **Browser → API.** Treat all JS, action logs, IDs, amounts, saved state and browser storage as untrusted. Identity is supplied by `PlayerDep`, not a body field (`backend/server/auth.py:199`). Local/demo state is not a wallet authority.
2. **API → Supabase Auth.** The provider validates bearer tokens; successful results are cached for 60 seconds (`backend/server/auth.py:42`, `:137`). PKCE code exchange uses the configured provider URL (`backend/server/sign_in_code.py:86`). Provider readiness/configuration was not tested.
3. **Publishable-key client → Data API.** SQL grants and RLS limit rows and operations. Migrations are evidence of intended policy, not evidence they were applied. See the table map below.
4. **Service-role API → database.** RLS is bypassed; route authorization, input rules, RPC grants and atomic SQL are critical. A leaked service-role key is not stopped by RLS (`supabase/migrations/20261106000000_foundation.sql:498`, `:652`).
5. **Public/static/rehearsal content → authoritative content.** `PUBLIC_CONTENT` is a fixed allowlist (`backend/server/routes/content.py:39`); fake/demo adapters must never grant real rewards. Static files and public source cannot hold secrets.
6. **External feeds → server → browser.** Fixed-destination adapters parse/cache/timeout weather and market data; external data is not executable code. Recorded fallbacks are labelled. Per-instance caches do not enforce a global quota.
7. **Contributor/package registry → build/server.** Frozen locks and integrity hashes reduce version drift; dependency execution and advisory/notice review remain necessary. See the SBOM.
8. **Preview → production data.** Both environments share one Supabase project (`docs/ARCHITECTURE.md:94`, `:100`). `APP_ENV` is not a data-isolation boundary.

## Complete entry-point inventory

Twenty application method/path pairs are registered through `backend/server/app.py:100`. Router line references are definitions, not claims of deployed reachability. Public routes may still fail closed when dependencies are absent.

| Method and path | Boundary/control or open gap | Exact definition |
| --- | --- | --- |
| GET `/api/health` | Public; nonsecret status/version/environment | `backend/server/routes/health.py:23` |
| GET `/api/config` | Public; flags and auth URL, no keys | `backend/server/routes/config.py:42` |
| GET `/api/content/{name}` | Public; only `intro-story` allowlisted; unknown/path-like names rejected | `backend/server/routes/content.py:54` |
| GET `/api/weather` | Public; cached/timeout/fallback adapter; no player input destination | `backend/server/routes/weather.py:84` |
| GET `/api/keepalive` | Shared credential, constant-time comparison; no anonymous DB reads | `backend/server/routes/keepalive.py:74`, `:106` |
| POST `/api/auth/exchange` | Public PKCE code/verifier; bounded code/verifier fields and no-store; abuse limit **open** | `backend/server/routes/auth_exchange.py:61` |
| GET `/api/me` | PlayerDep; caller's profile, wallet, crews, kit; no-store | `backend/server/routes/me.py:180` |
| DELETE `/api/me` | PlayerDep; strict true confirmation; caller's ID; no-store | `backend/server/routes/delete_me.py:78` |
| POST `/api/me/name` | PlayerDep; generated word lists, one-time DB assignment; no-store | `backend/server/routes/captain_name.py:102` |
| POST `/api/me/name/reroll` | PlayerDep; once only and replay ID; no-store | `backend/server/routes/captain_name.py:112` |
| GET `/api/save` | PlayerDep; own save; no-store | `backend/server/routes/save.py:106` |
| PUT `/api/save` | PlayerDep; version bounds, optimistic concurrency, encoded size check; no-store; ingress cap **open** | `backend/server/routes/save.py:115` |
| POST `/api/intro/complete` | PlayerDep; server replays 1–300 actions, atomic single kit grant; no-store | `backend/server/routes/intro.py:205` |
| GET `/api/market` | Public board even with trading off; rejects query cache-busting; public cache | `backend/server/routes/market.py:307` |
| GET `/api/market/portfolio` | PlayerDep and market flag; caller's holdings; explicit no-store **open** | `backend/server/routes/market.py:335` |
| POST `/api/market/trade` | PlayerDep/flag; rate brake, replay ID, DB holding/cap/wallet checks; no-store **open** | `backend/server/routes/market.py:354` |
| POST `/api/crews` | PlayerDep; reuse draft; server membership rules; no-store | `backend/server/routes/crews.py:190` |
| POST `/api/crews/join` | PlayerDep; code validation and durable per-player guess limiter; no-store | `backend/server/routes/crews.py:198` |
| POST `/api/crews/me/start` | PlayerDep; caller membership, status/version/locks; no-store | `backend/server/routes/crews.py:207` |
| GET `/api/crews/me` | PlayerDep; caller's crew only; no-store | `backend/server/routes/crews.py:214` |

Other entry surfaces:

| Surface | Present boundary and residual exposure |
| --- | --- |
| `/api/docs`, `/api/openapi.json` | Enabled for local/preview; disabled in production. ReDoc and OAuth redirect disabled (`backend/server/app.py:52`). A leaked preview exposes the API schema, not a privilege bypass. |
| Static `/`, `/asset-library.html`, `/ui-kit.html`, `/case-lab.html` | Four build inputs (`frontend/vite.config.js:9`). Bundles, public assets and demo/fake content are downloadable. `?demo=1` rehearsal is not real progression (`frontend/src/adapter/lab.js:9`). No general CSP/frame policy is defined in tracked configuration. |
| `/auth-check.html` plus its JS | PKCE, verifier in tab storage, access token in memory, URL cleanup/plain text output; page-specific CSP (`frontend/public/auth-check.html:24`). This is a team diagnostic page, still a public auth entry surface. |
| Direct Supabase Auth and REST/RPC | Provider config is outside repo. Client reads must respect grants/RLS; server RPCs use service-role authority. OAuth redirect allowlist, GitHub-only provider, project grants actually deployed: **open verification**. |
| Realtime channels | **None implemented**: no client subscriptions/channels or SQL publication found. `docs/INTERFACES.md:627` and `supabase/README.md:1595` say not enabled. Any future crew/presence/broadcast channel must have membership authorization, payload minimisation and rate/connection budgets; current RLS is not evidence of broadcast authorization. |
| Local Vite/dev inspector | Development exposes source and inspection hooks. Do not publish the dev server or treat fake adapter data as a secret. Production test asserts absence of `window.__island` (`frontend/scripts/check-production.js:27`). |
| Public Git source and dependencies | Story spoilers are intentionally public (`README.md:27`). Registry/advisory results below cover versions, not malicious maintainer/build execution or an exhaustive secret-history scan. |

## Data API/RLS map

All 13 declared public application tables enable RLS. Authenticated table rights are read-only; anonymous users have no application table grants. This is a static migration review; manual two-user deployed RLS tests remain unrun.

| Tables | Intended authenticated read boundary | Evidence |
| --- | --- | --- |
| `profiles`, `wallet_reasons` | All rows for display names and reason catalogue | `supabase/migrations/20261106000000_foundation.sql:512`, `:547` |
| `saves`, `wallets`, `wallet_transactions` | Own player ID | same foundation migration `:523`, `:535`, `:558` |
| `crews`, `crew_seats` | Member through `is_crew_member`, avoiding recursive policy reads | same foundation migration `:569`, `:578` |
| `market_bases` | All market base rows; no client writes | `supabase/migrations/20261106010000_island_exchange.sql:294` |
| `market_positions`, `market_trades` | Own player ID | same exchange migration `:302`, `:310` |
| `captain_name_rerolls` | Own player ID | `supabase/migrations/20261106020000_accounts.sql:123` |
| `entry_profiles` | Own player ID | `supabase/migrations/20261106030000_entry_profiles.sql:148` |
| `crew_join_failures` | No authenticated reads; server-only guess ledger | `supabase/migrations/20261106040000_crew_codes.sql:187`, `:192` |

Provider-owned auth tables, audit logs and settings are outside these application migrations. Table policies do not protect service-role requests. Source includes explicit SECURITY DEFINER search paths and service-role-only mutation RPC grants; verify new functions retain those properties.

## Threat/control register

“Controlled” means a source control exists, not that every deployed setting has been tested. “Open” names residual work; severity is scoped to a student play-money application, not real financial loss.

| Threat/actor | Control that stops or limits it | Status/residual |
| --- | --- | --- |
| Outsider forges identity; cheater supplies another player's ID | Provider verification and `PlayerDep` (`backend/server/auth.py:199`); server derives target IDs | Controlled; token theft and 60-second cache window remain |
| PKCE code interception/token persistence | Randomness + SHA-256 (`frontend/public/auth-check-pkce.js:24`, `:39`), consume/remove verifier (`:56`), server discards refresh/provider tokens (`backend/server/sign_in_code.py:66`), memory token (`frontend/src/online/session.js:24`) | Controlled; same-origin XSS can still read memory |
| Cross-origin request steals bearer token | API same-origin path validation (`frontend/src/online/api.js:50`); auth is explicit bearer, not ambient application cookies | Controlled for current client; does not stop stolen tokens or malicious same-origin JS |
| Cheater reads/writes others' rows | Read-only grants plus own/member RLS above; server identity checks for service-role calls | Controlled in source; deployed RLS **open verification** |
| Cheater becomes host | `HostDep` fails closed on verified ID allowlist (`backend/server/hosts.py:31`, `:44`) | Implemented but **unused by any current route** (`:17`); future presenter endpoints **open** |
| Duplicate reward/trade or concurrent overspend | Atomic ledger with unique player/reason/ref (`supabase/migrations/20261106000000_foundation.sql:321`, `:735`); service-role RPC grants (`:752`, `:762`); atomic entry grant (`20261106030000_entry_profiles.sql`) and market trade (`20261106010000_island_exchange.sql`) | Controlled; on 503 outcome is unknown—reconcile ref before retry/refund |
| Cheater invents intro ending/kit | Server action replay and first award only (`backend/server/routes/intro.py:205`, `backend/server/game/referee.py`) | Controlled; arbitrary saved browser JSON is not a reward authority |
| Stale tabs overwrite progress; rename injection | Optimistic save version (`backend/server/routes/save.py:76`, `supabase/migrations/20261106020000_accounts.sql:378`); generated words, no free text (`backend/server/account/names.py`) | Controlled; browser save remains untrusted data |
| Outsider/cheater guesses crew codes | Login required plus DB player lock, ten failures/600 seconds (`backend/server/crews/codes.py:28`, `supabase/migrations/20261106040000_crew_codes.sql:371`, `:387`) | Controlled per player; many accounts/global abuse **open** |
| Trade flood/provider quota exhaustion | Ten trades/30 seconds in memory (`backend/server/market/limits.py:23`); cached fixed-destination feeds/timeouts (`backend/server/adapters/base.py`, `backend/server/weather/source.py`) | Partial: limiter/caches are per instance (`market/limits.py:9`); auth/global abuse **open**, G27-01 |
| Case solution downloaded early | Content allowlist (`backend/server/routes/content.py:39`); two exact normalized reveal fingerprints in build (`frontend/scripts/check-spoilers.js:5`, `:8`; `spoiler-guard.js:3`) | Partial: guard cannot detect paraphrases, images, elimination or public-repo spoilers. No claim of public-source secrecy |
| XSS/clickjacking through static pages | Plain text auth output, fixed content; auth-check CSP only (`frontend/public/auth-check.html:24`) | General CSP/frame control **open**, G27-02; no exploit demonstrated |
| Leaked preview accesses production | PlayerDep still required; preview login protection is documented but unverified | Isolation **open**, G27-03; URL disclosure alone is not auth bypass |
| Secret leak through build/log/diff | Server-only SecretStr, no VITE secrets (`backend/server/settings.py:70`); suppress HTTP URL INFO logs (`backend/server/app.py:98`); diff gate (`../scripts/audit/secret_scan.py`) | Partial; service-role compromise remains high-impact; full history/deployed bundles not scanned |
| Cache retains personal response | Most personal routes explicitly private/no-store (`backend/server/routes/me.py:183`, `save.py:108`) | Portfolio/trade hardening **open**, G27-04 |
| Malicious dependency or licensing defect | Lockfiles/checksums, npm/pip-audit, SBOM, [licence register](LICENSES-THIRD-PARTY.md) | Known advisories: zero at audit time; notice/licence gaps **open** |

## Prioritised handoff to Claude (report only)

No confirmed authentication bypass, cross-player write, double award, SQL injection or exploitable XSS was established in this bounded review. Fixes need a separate coding task. File references are exact starting points; do not edit protected configuration or migrations under G27.

| ID / severity | Evidence, impact and proposed separate acceptance check |
| --- | --- |
| **G27-01 · Medium · availability** | `backend/server/routes/auth_exchange.py:67`, `backend/server/sign_in_code.py:96`, `backend/server/auth.py:144`, `:183`: valid-shaped unauthenticated exchanges and arbitrary uncached ASCII bearer tokens reach Auth without an application abuse limit. Add a pre-provider, shared abuse budget suitable for serverless deployments; mock repeated requests must reach 429 before consuming unbounded provider calls. Hosting protections are unknown; no live load test was run. |
| **G27-02 · Medium · browser hardening** | `frontend/index.html:1`, `frontend/public/auth-check.html:24`, `vercel.json:1`: only auth-check has CSP; tracked config defines no general CSP or frame policy. Add tested response headers for all HTML in a separately authorised task, including CSP and frame-ancestors (meta cannot enforce framing). Keep Three.js and accessibility working; verify local build response headers. This is defence in depth, not a demonstrated script injection. |
| **G27-03 · Medium · operational isolation** | `docs/ARCHITECTURE.md:94`, `:100`; `backend/server/routes/delete_me.py:85`: preview and production share DB authority, including ordinary authenticated deletion. Owner should isolate preview data/keys or accept/document the risk and verify access protections privately. Leaked URL alone confers no authority. Do not test against the shared project during this task. |
| **G27-04 · Low · privacy hardening** | `backend/server/routes/market.py:335`, `:354`: personal portfolio/receipt omit explicit private/no-store, unlike other personal routes. Add response headers and offline tests. Authorization ordinarily inhibits shared-cache reuse; no actual cache leak was shown. |
| **G27-05 · Low · resource hardening** | `backend/server/routes/save.py:77`, `:120`; `backend/server/app.py:56`: save size is checked after JSON decoding; there is no application-wide pre-decode body cap. Establish ingress/body limits and test oversized data with fake/local requests. Hosting caps were not inspected; unbounded deployed body size is not claimed. |
| **G27-06 · Low · documented revocation window** | `backend/server/auth.py:42`, `:152`; `backend/server/routes/delete_me.py:85`: successful identity cache may accept expired/revoked/deleted credentials for up to 60 seconds; deletion does not evict it. Decide whether immediate eviction/expiry-aware caching is required, then add fake-clock tests. This residual is already documented in source. |
| **G27-L01 · Medium · release compliance** | `frontend/src/shell/screens.js:20`, `frontend/vite.config.js:9`: Credits names tool licences, but the inspected build has no bundled MIT notices. Three.js and Vite distributed helpers require notice retention. Separate task: ship exact applicable notices and assert their presence in dist. See [licence evidence](LICENSES-THIRD-PARTY.md#open-licence-and-distribution-items). |
| **G27-L02 · Low · attribution consistency** | `frontend/src/demo/tour.js:20`, `frontend/src/game.js:81`, `frontend/src/ui/hud.js:40`: recorded tour weather can leave adjacent credit hidden while live updates are bypassed. Credits already provides source/licence links. Match the documented next-to-weather policy and test offline tour attribution. |
| **G27-L03 · Owner decision · release licensing** | `frontend/ASSETS.md:204`: “project-authored licence” is not defined by a root LICENSE. Owner should document the intended first-party grant/permissions, including imported solo-game material; do not assign a new licence by inference. |

The report's priorities are recommendations for review, not consent to change code, production settings or secrets.

## Verification and limits

Full-lock npm audit and pip-audit both exited 0 with zero known advisories; raw outputs and exact scope are checked in. Licence metadata was fetched from version-specific public npm/PyPI endpoints. Source/route/RLS inventory is static; no deployment, OAuth flow, live response headers, Realtime policy, production RLS, penetration test or account deletion was exercised. See [checkpoint](handoff/g27-checkpoint-1.md) for current validation and branch handoff.
