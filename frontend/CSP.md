# Strict CSP readiness · G9 starter

Inventory of the production build, 6 November 2026. This document proposes the HTTP policy for Claude to enable. `vercel.json` and deployed headers are not changed by this package. Development Vite/HMR is outside this production policy.

## Scripts, styles and URL schemes

The built site has four Vite entry documents (`index.html`, `asset-library.html`, `ui-kit.html`, `host.html`) and three existing public pages (`auth-check.html`, `help.html`, `privacy.html`). The inventory requires exactly these seven paths and the four declared manifest entries. Each uses external same-origin module scripts and CSS. There are **zero inline script bodies, inline event handlers, `<style>` blocks or authored `style=` attributes** in those HTML files. The title emblem is drawn in a 2D canvas; it is not an embedded image URL. Local PNG sprites, place plates, the SVG favicon, JavaScript chunks and styles all load from the same origin.

There are no authored `eval()` or `new Function()` calls, embedded `data:` resources, `blob:` object URLs, workers, remote fonts, downloaded audio or remote textures. Audio is synthesized with Web Audio. Fonts are the system `Courier New`/monospace stack, with no font request.

The Three.js texture chunk contains **dormant** `blob:` protocol recognition, data-URL recognition and a `toDataURL()` image-serialization helper. The game does not call those loading/serialization branches. They are library capabilities, not resource dependencies; the policy does not allow `blob:` or `data:`. No `unsafe-eval`, `unsafe-inline`, nonce, hash or wildcard origin is needed by the current build.

The pinned Supabase 2.118.0 dynamic chunk also contains a dormant standalone auth default
(`http://localhost:9999`) and fixed MDN/GitHub documentation links in warning text. The inventory
classifies these only in the exact SDK manifest entry, with reviewed URL boundaries, counts and
installed package versions. The configured client supplies the project's auth URL. These literals
add no CSP permission; authored or changed uses fail the inventory and require another review.


The two constant `style.cssText` assignments in `ui/chart.js` and `world/others/index.js` are moved to `.chart-partner-lines` and `.other-captain-label` stylesheet rules. Constant chart signal marker/legend styles also move to CSS. Runtime geometry, colour and visibility still use individual CSSOM properties. These can appear as `style` attributes in a live DOM inspection, although there is no authored HTML style attribute or arbitrary CSS text insertion. [MDN documents the distinction between direct properties and restricted `cssText`/style-attribute insertion.](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr)

### Remaining runtime CSSOM writes

Paths below are under `src/`. No values in this list contain credentials or remote URLs.

| Module | Direct properties |
| --- | --- |
| `audio/captions-view.js` | `bottom`, `removeProperty('bottom')` for avoiding controls |
| `controls/touch.js` | thumb `transform` |
| `core/renderer.js` | `imageRendering`, integer canvas `width`, `height`, `position`, `left`, `top` |
| `screens/board.js` | `borderImageSource`, same-origin clue-frame PNG |
| `screens/finale.js` | `touchAction` |
| `screens/partners.js` | portrait `transform` |
| `screens/partners/index.js` | chart `display` |
| `screens/relighting.js` | supplied lantern `borderColor` |
| `ui/chart.js` | marker `left`, `top`, `--chart-scale` |
| `ui/kit/dialogue.js` | portrait `width`, `height` |
| `ui/sailing.js` | fade `opacity` |
| `world/cinematics/controller.js` | integer `--cinematic-scale` |
| `world/others/index.js` | label `opacity`, `fontSize`, `display`, `left`, `top`, `width` |

Three.js also assigns individual canvas/image properties internally. The production browser check exercises rendering under `style-src-attr 'none'`; it does not grant a general style-string exception.

## Origins and navigation

| Origin / route | Use | CSP consequence |
| --- | --- | --- |
| Same origin `/assets/`, `/pixel/`, `/places/`, favicon, galleries and public team-check modules | Scripts, CSS, local graphics | `'self'` in script/style/image sources |
| Same origin `/api/weather`, `/api/content/intro-story` | Existing weather/story reads; demo has local fallbacks | `connect-src 'self'` |
| Same origin `/api/config`, `/api/auth/exchange`, `/api/me` | Existing team sign-in check page | `connect-src 'self'`; that page has a second restrictive meta policy |
| `https://uqcjihigqjgyuafrfbnp.supabase.co` | Approved future real auth/adapter connection origin | Explicit HTTPS `connect-src` allowance; real traffic not exercised on this branch |
| `wss://uqcjihigqjgyuafrfbnp.supabase.co` | Approved future Realtime connection origin | Explicit WSS `connect-src` allowance; currently unwired |
| Configured Supabase origin `/auth/v1/authorize` | Existing team check uses top-level OAuth navigation | Navigation, not a fetch/iframe allowance; Claude must confirm config uses the approved project |
| `https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new` | Player-initiated problem-report draft in a new tab | Navigation only; `noopener noreferrer`, encoded allow-listed diagnostics, no issue submission |
| `https://open-meteo.com/` | Settings → Credits attribution link | Navigation only; weather is fetched through the same-origin API |
| `https://creativecommons.org/licenses/by/4.0/` | Weather licence link in Credits | Navigation only |
| `https://data.binance.vision/` | Existing data-credit link in Credits | Navigation only; no browser market-data fetch |
| `https://creativecommons.org/licenses/by-nc-sa/4.0/` | Existing replay-licence link in Credits | Navigation only |

The `http://www.w3.org/2000/svg` and `http://www.w3.org/1999/xhtml` strings are DOM namespace identifiers, not requests. `http://fixture.local` is a conformance-fixture URL base in test support and is absent from the normal build. Generic `http://` / `https://` validation strings in the team-check client are not origins. The inventory check reports every literal origin found in built text; no outside origin is used to load game art, fonts, scripts or sound.

## Proposed HTTP policy

```text
default-src 'self';
script-src 'self';
script-src-attr 'none';
style-src 'self';
style-src-elem 'self';
style-src-attr 'none';
img-src 'self';
font-src 'self';
connect-src 'self' https://uqcjihigqjgyuafrfbnp.supabase.co wss://uqcjihigqjgyuafrfbnp.supabase.co;
media-src 'none';
worker-src 'none';
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none'
```

`frontend/scripts/security-headers.js` owns the parameterized policy and header set; `csp-policy.js` keeps a no-address compatibility export. Preview also sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. These are test headers, not evidence of the deployed configuration. `frame-ancestors` belongs in an HTTP header.

Keep `public/auth-check.html` and its own meta policy unchanged. Both policies apply together; widening the HTTP header cannot relax that page's same-origin-only `connect-src` or its `form-action 'none'`. It does not need to fetch Supabase directly for its existing redirect flow. Do not add GitHub to `connect-src` just for report links or OAuth navigation.

## Checks and integration requests

`npm run test:csp:inventory` builds, runs the spoiler guard and scans the seven approved built HTML files, source style insertion, dynamic-code constructors, embedded URL schemes and literal outside origins. `npm run test:csp` rehearses the built pages and nine-beat demo under the proposed header with all APIs returning 503. It records policy violations, browser errors and external requests. The test-only Playwright init script is instrumentation; it is not shipped inline code.

Claude should enable the HTTP header after integration, then verify deployed response headers and real OAuth/session expiry/Realtime with the approved HTTPS and WSS origins. Confirm any avatar/storage images, extra auth origin, workers, media or downloaded fonts before changing the source list. No extra wildcard, `data:`, `blob:`, inline-script or inline-style exception is proposed. Safari/Firefox and physical assistive-technology checks remain manual; current automated evidence uses installed Chrome.

The static inventory is lexical. It cannot prove the absence of computed URLs or aliased dynamic-code calls; manual source inspection and the enforced-policy browser checks provide the additional evidence. An origin's appearance in the literal allowlist does not grant it a connection allowance: the actual CSP permits only self and the two exact Supabase connection origins.

Final evidence is in `captures/20261106_G9-4/`: 360 unit tests, build/spoiler guard, four zero-inline HTML pages, enforced-preview page/tour checks with no policy violations or external requests, and the combined `Verification.json`. The first identity check's Chrome process stalled in `browser.newPage`; its log is retained and the clean restart passes. A retry assertion was corrected to allow a successful confirmation notice while requiring the failure action to clear.


## Security headers (G9)

`buildSecurityHeaders(supabaseUrl?, {platformConfig})` has a self-only connection list without an address.
A bare validated `https://<single-label>.supabase.co` origin adds only that HTTPS origin and its WSS pair.
Paths, ports, credentials, fragments, queries, non-HTTPS and lookalike hosts are refused. No public build
value other than the Supabase origin affects headers. The builder never reads a key.

Vite preview and the CSP check use this same set. When `vercel.json` has a supported catch-all header
entry, its exact enforcing/report-only mode and values are checked and preserved; incompatible shapes
or policy drift fail visibly. At main `c26f303`, that entry is absent, so the strict proposal applies.
`npm run print:headers -- https://uqcjihigqjgyuafrfbnp.supabase.co` prints the proposed Vercel block.
Claude owns adding it: report-only first, enforced before `flags.sign_in` becomes true.

Checkpoint 0 validates the base proposal and the exact address pair, selection table, HTML/CSS title
stamp, report privacy and the built pages/tour. The Supabase package has not reached main yet, so its
configured browser behavior is not claimed here. No worker/blob/data exception is proposed.
The first preview's deployment reports success on GitHub, but its status provides a Vercel dashboard
URL that could not be read without account access. No login was attempted; public preview stamp
verification remains R14.


Main `60f7fd0` supplies the enforced policy and additional security headers. Preview preserves that
compact policy exactly, including its `default-src` fallbacks; it does not append the earlier
proposal's redundant directives. The parser still requires self-only scripts/styles/images, the
fixed object/base/form/frame boundary and at most one exact HTTPS/WSS Supabase origin pair.
Duplicate directives, unsafe sources and mismatching public build origins fail. Live deployed header
verification remains separate from the recorded local browser proof.
