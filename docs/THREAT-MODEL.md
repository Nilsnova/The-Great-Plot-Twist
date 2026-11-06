# Threat model and source review

For maintainers and reviewers. Integrated source baseline `94a48ad1c445f4cfb70c539daba3fcb1fe7e7d99`; 6 November 2026. This is a bounded source/dependency review, with local fixture/scratch proofs recorded by the feature packages. This integration performed no live application, Auth, database or provider test. [Security process](SECURITY.md) · [audit evidence](../scripts/audit/README.md).

## Assets and trust boundaries

Tokens, PKCE verifiers and server credentials require confidentiality. Profiles, saves, crew membership, wallet history and action receipts require correct owner/member access, atomic writes and deletion. The case reveal is withheld by the served API until earned; the public repository intentionally contains story spoilers and cannot promise source secrecy. Coins have no cash redemption.

Players and outsiders can send arbitrary requests, retry actions, race tabs, modify browser state and know public/demo data. The browser presents intents; verified server identity and database transactions decide rewards and progress. A service-role credential bypasses RLS, so server authorization and narrowly granted RPCs remain essential.

| Boundary | Current source control |
| --- | --- |
| Browser to API | [auth.py](../backend/server/auth.py) bounds tokens to 4096 ASCII characters and three nonempty parts before upstream calls; verified IDs, never caller-supplied player IDs, drive actions. Success cache is 60 seconds. |
| Login and local storage | [sign_in_code.py](../backend/server/sign_in_code.py) uses PKCE and returns only the required access token; [session.js](../frontend/src/online/session.js) keeps it in memory. API requests use explicit bearer credentials and same-origin paths. |
| API response and errors | [cache.py](../backend/server/cache.py) and [errors.py](../backend/server/errors.py) default to no-store. Case/festival/host/personal sports middleware also covers handled dependency and validation errors. Host console sends nosniff and no-referrer. |
| Host authority | [hosts.py](../backend/server/hosts.py), [host_case.py](../backend/server/routes/host_case.py) and [host_console.py](../backend/server/routes/host_console.py) use verified server allowlists; browser capabilities do not confer host access. Shared HostDep retains 401; console maps unauthorised access to 403. |
| Data API and RPC | [migration chain](../supabase/migrations/) enables RLS, limits player reads and revokes direct client mutations. Server-only case/festival/host tables have no player policies. New invoker RPCs require service-role authority; existing definers retain explicit search paths and ACLs. |
| Realtime | [crew_broadcast.py](../backend/server/crew_broadcast.py), [live client](../frontend/src/online/realtime.js) and [presence migration](../supabase/migrations/20261106050000_live_presence.sql) use private crew channels and membership policies. Bounded change hints request a fresh authorised view; messages are not progress authority. |
| Public content | [content.py](../backend/server/routes/content.py) exposes only an allowlist. Private case content is filtered through the crew view; production fingerprint/content probes protect public bundles without printing reveal prose. |
| External data | Weather, market and sports use fixed HTTPS providers, bounded requests and explicit freshness/fallback rules. Sports missing-key responses fail closed; recorded examples never accept stakes. Provider strings render as DOM text, never executable markup. |
| Preview to production | Both deployments currently share one Supabase project. APP_ENV does not isolate data. This source review does not claim preview protection/provider redirect settings were verified. |
| Build and delivery | Frozen locks, public metadata/advisory evidence and the complete SBOM below. [vercel.json](../vercel.json) and [Vite headers](../frontend/vite.config.js) define CSP/framing/nosniff/referrer controls; production excludes the optional case lab unless explicitly built. |

## Complete API entry-point inventory

The following **55 method/path pairs** are declared in the current route modules and mounted by [app.py](../backend/server/app.py). This describes source contracts, not deployed flag/configuration state. API documentation is disabled in production. Local/preview documentation is informational, not an authorization bypass.

| Method and path | Boundary | Definition |
| --- | --- | --- |
| POST `/api/auth/exchange` | Bounded PKCE fields; provider exchange discards refresh/provider tokens; no-store. | [auth_exchange.py](../backend/server/routes/auth_exchange.py) |
| POST `/api/board/pin` | Case flag and verified crew member; earned-card pins/pairs; atomic private receipts. | [board.py](../backend/server/routes/board.py) |
| POST `/api/board/pair` | Case flag and verified crew member; earned-card pins/pairs; atomic private receipts. | [board.py](../backend/server/routes/board.py) |
| GET `/api/bulletin` | Public derived weather/calendar bulletin, cache guards; approved public hook only. | [bulletin.py](../backend/server/routes/bulletin.py) |
| POST `/api/me/name` | Verified player; generated names; bounded once-only reroll and durable receipt. | [captain_name.py](../backend/server/routes/captain_name.py) |
| POST `/api/me/name/reroll` | Verified player; generated names; bounded once-only reroll and durable receipt. | [captain_name.py](../backend/server/routes/captain_name.py) |
| GET `/api/case` | Case flag and verified crew member; earned clue filtering, private replies and durable receipts. | [case.py](../backend/server/routes/case.py) |
| POST `/api/case/search` | Case flag and verified crew member; earned clue filtering, private replies and durable receipts. | [case.py](../backend/server/routes/case.py) |
| POST `/api/case/accuse` | Case flag and verified crew member; earned clue filtering, private replies and durable receipts. | [case.py](../backend/server/routes/case.py) |
| GET `/api/config` | Public capability flags and publishable auth config; no server keys. | [config.py](../backend/server/routes/config.py) |
| GET `/api/content/{name}` | Fixed public content allowlist; secret paths never served. | [content.py](../backend/server/routes/content.py) |
| POST `/api/crews/me/orders` | Verified crew player; free eligible NPC duties, server timing and durable action receipts. | [crew_orders.py](../backend/server/routes/crew_orders.py) |
| POST `/api/crews` | Verified player; own/member crew scope, server rules, durable guess limit and version locks. | [crews.py](../backend/server/routes/crews.py) |
| POST `/api/crews/join` | Verified player; own/member crew scope, server rules, durable guess limit and version locks. | [crews.py](../backend/server/routes/crews.py) |
| POST `/api/crews/me/start` | Verified player; own/member crew scope, server rules, durable guess limit and version locks. | [crews.py](../backend/server/routes/crews.py) |
| GET `/api/crews/me` | Verified player; own/member crew scope, server rules, durable guess limit and version locks. | [crews.py](../backend/server/routes/crews.py) |
| DELETE `/api/me` | Verified player; explicit confirmation; atomic own-account cascade and crew handover. | [delete_me.py](../backend/server/routes/delete_me.py) |
| GET `/api/duels` | Flag and verified player; participant scope, A7 glyph rules and atomic ledger changes. | [duels.py](../backend/server/routes/duels.py) |
| POST `/api/duels` | Flag and verified player; participant scope, A7 glyph rules and atomic ledger changes. | [duels.py](../backend/server/routes/duels.py) |
| GET `/api/duels/{duel_id}` | Flag and verified player; participant scope, A7 glyph rules and atomic ledger changes. | [duels.py](../backend/server/routes/duels.py) |
| POST `/api/duels/{duel_id}/move` | Flag and verified player; participant scope, A7 glyph rules and atomic ledger changes. | [duels.py](../backend/server/routes/duels.py) |
| POST `/api/duels/{duel_id}/cancel` | Flag and verified player; participant scope, A7 glyph rules and atomic ledger changes. | [duels.py](../backend/server/routes/duels.py) |
| GET `/api/festival` | Flag; public timer and optional verified own fields; authenticated exclusive claims/ring, exact 48-hour end and receipts. | [festival.py](../backend/server/routes/festival.py) |
| POST `/api/festival/claim` | Flag; public timer and optional verified own fields; authenticated exclusive claims/ring, exact 48-hour end and receipts. | [festival.py](../backend/server/routes/festival.py) |
| POST `/api/festival/ring/join` | Flag; public timer and optional verified own fields; authenticated exclusive claims/ring, exact 48-hour end and receipts. | [festival.py](../backend/server/routes/festival.py) |
| POST `/api/festival/ring/leave` | Flag; public timer and optional verified own fields; authenticated exclusive claims/ring, exact 48-hour end and receipts. | [festival.py](../backend/server/routes/festival.py) |
| POST `/api/finale/nightfall` | Case flag and verified crew member; occupied posts, exact timing and server signal validation. | [finale.py](../backend/server/routes/finale.py) |
| POST `/api/finale/post` | Case flag and verified crew member; occupied posts, exact timing and server signal validation. | [finale.py](../backend/server/routes/finale.py) |
| POST `/api/finale/signal` | Case flag and verified crew member; occupied posts, exact timing and server signal validation. | [finale.py](../backend/server/routes/finale.py) |
| GET `/api/health` | Public nonsecret health/version metadata. | [health.py](../backend/server/routes/health.py) |
| POST `/api/host/case/clock` | Verified allowlisted host; case flag, retry UID and audited controlled clock movement. | [host_case.py](../backend/server/routes/host_case.py) |
| GET `/api/host/overview` | Verified allowlisted host; private aggregates; narrow own-forming-crew cleanup and audit. | [host_console.py](../backend/server/routes/host_console.py) |
| GET `/api/host/crews` | Verified allowlisted host; private aggregates; narrow own-forming-crew cleanup and audit. | [host_console.py](../backend/server/routes/host_console.py) |
| POST `/api/host/crews/{crew_id}/close` | Verified allowlisted host; private aggregates; narrow own-forming-crew cleanup and audit. | [host_console.py](../backend/server/routes/host_console.py) |
| POST `/api/intro/complete` | Verified player; server replays bounded actions; once-only atomic kit grant. | [intro.py](../backend/server/routes/intro.py) |
| GET `/api/islet` | Verified player; own buildings, server eligibility and atomic existing wallet reasons. | [islet.py](../backend/server/routes/islet.py) |
| POST `/api/islet/build` | Verified player; own buildings, server eligibility and atomic existing wallet reasons. | [islet.py](../backend/server/routes/islet.py) |
| GET `/api/keepalive` | Configured shared credential, constant-time comparison; no anonymous database probe. | [keepalive.py](../backend/server/routes/keepalive.py) |
| GET `/api/market` | Public guarded board; authenticated own positions/open/close, Exchange v2 SQL caps and receipts. | [market.py](../backend/server/routes/market.py) |
| GET `/api/market/portfolio` | Public guarded board; authenticated own positions/open/close, Exchange v2 SQL caps and receipts. | [market.py](../backend/server/routes/market.py) |
| POST `/api/market/open` | Public guarded board; authenticated own positions/open/close, Exchange v2 SQL caps and receipts. | [market.py](../backend/server/routes/market.py) |
| POST `/api/market/close` | Public guarded board; authenticated own positions/open/close, Exchange v2 SQL caps and receipts. | [market.py](../backend/server/routes/market.py) |
| GET `/api/me` | Verified player; own profile, balances, kit and crews; no-store. | [me.py](../backend/server/routes/me.py) |
| GET `/api/predictions` | Flag and verified player for stakes/mine/settle; provider-verified settlement, atomic pool rules. | [predictions.py](../backend/server/routes/predictions.py) |
| GET `/api/predictions/mine` | Flag and verified player for stakes/mine/settle; provider-verified settlement, atomic pool rules. | [predictions.py](../backend/server/routes/predictions.py) |
| POST `/api/predictions/stake` | Flag and verified player for stakes/mine/settle; provider-verified settlement, atomic pool rules. | [predictions.py](../backend/server/routes/predictions.py) |
| POST `/api/predictions/settle` | Flag and verified player for stakes/mine/settle; provider-verified settlement, atomic pool rules. | [predictions.py](../backend/server/routes/predictions.py) |
| GET `/api/save` | Verified player; own save, strict version/UTF-8/NUL/size checks; optimistic concurrency. | [save.py](../backend/server/routes/save.py) |
| PUT `/api/save` | Verified player; own save, strict version/UTF-8/NUL/size checks; optimistic concurrency. | [save.py](../backend/server/routes/save.py) |
| GET `/api/sports` | Flag; guarded public current board; verified own stakes/mine; fresh provider-only settlement; recorded examples read-only. | [sports.py](../backend/server/routes/sports.py) |
| GET `/api/sports/mine` | Flag; guarded public current board; verified own stakes/mine; fresh provider-only settlement; recorded examples read-only. | [sports.py](../backend/server/routes/sports.py) |
| POST `/api/sports/stake` | Flag; guarded public current board; verified own stakes/mine; fresh provider-only settlement; recorded examples read-only. | [sports.py](../backend/server/routes/sports.py) |
| POST `/api/sports/settle` | Flag; guarded public current board; verified own stakes/mine; fresh provider-only settlement; recorded examples read-only. | [sports.py](../backend/server/routes/sports.py) |
| GET `/api/weather` | Public fixed-destination cached feed, timeout and labelled fallback. | [weather.py](../backend/server/routes/weather.py) |
| GET `/api/world` | Public filtered world state/Wall; only approved solves, no secret case contents. | [world.py](../backend/server/routes/world.py) |

## Data and transaction boundaries

Foundation profiles/reason labels are shared by design; wallets, saves, entry data, name rerolls, islets and the surviving Exchange v2 positions are scoped to their owner. Crews/seats use membership reads; the `is_crew_member` helper is intentionally callable by authenticated users. The legacy `market_positions`/`market_trades` tables are dropped by Exchange v2: readiness and audit queries must use `exchange_positions` and `exchange_events`.

Case state/finds/deductions/accusations/solvers/actions, board/finale records and NPC orders are server-only. World solves/Wall contributions and festival claims are filtered into approved views. Festival control/actions/queue and host console actions/health are private. Prediction/duel/sports tables use their migration-specific own/participant or server-only boundaries. No client mutation authority is inferred from public board data.

Action UIDs are scoped to the verified player and persisted with accepted/refused outcomes where the contract promises durable replay. Exact original receipts survive changed request bodies and elapsed clocks. SQL locks and existing ledger reasons enforce overspend, exclusive claims, once-only awards and conservation. The reviewed deletion function locks affected crews before user deletion and performs a fresh handover query; festival, host cleanup and sports lock ordering was tested against account deletion. Host audit entries retain crew history but cascade on the host's own account deletion. Cleanup closes only the caller's eligible forming crew and never resets the world or grants money.

## Status of the original G27 findings

| Original item | Current observed source state |
| --- | --- |
| G27-02 general CSP/framing | Implemented in tracked Vercel/Vite headers, with a production browser CSP check. No new script injection was demonstrated. |
| G27-04 personal response cache | Default no-store middleware and error handler are installed; feature-specific private middleware protects personal case/festival/host/sports replies. |
| G27-01 provider abuse | Crew guessing and wallet/provider operations have feature-specific budgets; the valid-shaped login/exchange path still has no shared application-wide provider budget. No live abuse was attempted or demonstrated. |
| G27-03 preview isolation | Shared-project architecture remains. No new operational isolation claim is made by this package. |
| G27-05 pre-decode save ingress | Encoded save, NUL and version bounds exist. This package does not establish a global pre-decode request-body cap or inspect hosting caps. |
| G27-06 identity revocation cache | The documented 60-second successful verification cache remains; logout/deletion does not promise immediate cross-instance revocation. |
| G27-L01/L02/L03 | Bundled notices are now emitted and linked from Settings → Credits; weather attribution deliberately remains there. The [licence register](LICENSES-THIRD-PARTY.md#remaining-distribution-and-owner-items) preserves the remaining first-party licence decision. |

These are precise residual source/configuration limits, not claims of a demonstrated cross-player exploit. This integration found no new authentication bypass or secret disclosure and adds no production migration.

## Gated capabilities and proof limits

The full normal-browser online mystery still depends on the G9 adapter being built in the cloud. Festival is enabled and waits for the first Relighting; sports needs the configured provider key and a current-provider proof before activation. The AI companion proposal and its unused context code/flag were removed at Nils' request.

Dependency advisory scans covered every current locked third-party package and returned zero known advisories at the recorded collection time. Registry/schema responses, source graph coverage and route/link checks are reproducible from the audit directory. Earlier [G27 checkpoint 1](handoff/g27-checkpoint-1.md) and [checkpoint 2](handoff/g27-checkpoint-2.md) describe their original baseline only; see the integration handoff for current checks. No production penetration test, provider credential proof or deployment-setting audit is implied.
