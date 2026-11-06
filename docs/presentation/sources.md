# Evidence behind the slides

Baseline: `origin/main`, full commit
`c26f3032b150af970d57fbbcd6eea439eb26f4c4`. Inspected and tested on 6 November
2026. This is an implementation snapshot, not a claim that production has deployed
every feature. Later main changes require refreshing claims and counts.

| Slides | Claim | Repository evidence |
| --- | --- | --- |
| 1–2 | Text adventure expanded into a browser island world; original pixel art; playable intro, chart travel and local journal | [README](../../README.md), [graphics implementation](../../frontend/GRAPHICS.md), `frontend/src/story/`, `frontend/src/world/places/`, `frontend/src/adapter/bridge.js` |
| 3 | Browser JavaScript/Three.js/Vite; FastAPI; same-address Vercel services; configured Dublin region | [architecture](../ARCHITECTURE.md), [Vercel configuration](../../vercel.json), [frontend package](../../frontend/package.json) |
| 3 | Supabase Auth, Postgres grants/RLS; Realtime is **planned, not connected** | [architecture](../ARCHITECTURE.md), [interfaces, Realtime budget](../INTERFACES.md#7-realtime-budget), [database policy matrix](../../supabase/README.md) |
| 4 | Existing name reroll API validates `actionUid`, verifies identity, uses an atomic database function, returns 409 on repeat | [route](../../backend/server/routes/captain_name.py), [auth](../../backend/server/auth.py), [name store](../../backend/server/account/name_store.py), [accounts migration](../../supabase/migrations/20261106020000_accounts.sql) |
| 5 | Browser sends intent; server authorizes writes; grants/RLS and constraints protect access/data; stable references prevent repeat effects | [architecture](../ARCHITECTURE.md#3-who-may-do-what), [wallet](../../backend/server/wallet.py), [database README](../../supabase/README.md) |
| 6 | Fingerprint-based build spoiler check; account responses use private/no-store; separate sign-in page uses CSP metadata | [build guard](../../frontend/scripts/check-spoilers.js), [account route](../../backend/server/routes/me.py), [sign-in page](../../frontend/public/auth-check.html) |
| 6, 10 | Sitewide security headers still need hardening/verification on this revision | No headers section in [vercel.json](../../vercel.json), no security-header middleware in [app factory](../../backend/server/app.py). Do not infer deployed HTTP headers from the sign-in page's CSP metadata. |
| 7 | Tests, build and lint results below | [backend project configuration](../../backend/pyproject.toml), [frontend scripts](../../frontend/package.json), existing test suites |
| 8 | D015 owner authorization, extended 6 November; Claude integration gates, database extras, owner review timing and teammate peer review | D015 in [decision log](../DECISIONS.md); [contribution rules](../../CONTRIBUTING.md); [agent rules](../../AGENTS.md). Other decision titles were reviewed; story decisions are not reproduced. |
| 9–10 | Lessons and integration priorities | Interpretation of the above implementation, tests and boundaries; next steps are proposals, not completed features. |

The requested `frontend/HOW-IT-WORKS.md` does not exist on this baseline.
`frontend/GRAPHICS.md` and the actual implementation were consulted instead.
Some older overview prose in README/architecture predates newer code, so concrete
claims were checked against code and tests as well.

## Test run on main

| Working directory | Exact command | Result |
| --- | --- | --- |
| `backend/` | `UV_CACHE_DIR=/workspace/.cache/uv uv run --locked pytest` | 3,100 passed; no skips/failures; 37.01 seconds |
| `backend/` | `UV_CACHE_DIR=/workspace/.cache/uv uv run --locked ruff check .` | All checks passed |
| `frontend/` | `npm test` | 288 passed across 33 test files |
| `frontend/` | `npm run build` | Passed; 51 built text files checked by spoiler guard |

Combined: **3,388 parameterized test cases**, not 3,388 player journeys.
The caches above are local tool configuration, not required application settings.
Logs from this run were kept outside the repository in
`/workspace/cloud-setup/g25/`.

Representative behaviors:

- `backend/server/tests/test_wallet.py`: repeated wallet references cannot apply twice.
- `backend/server/tests/test_saves.py`: stale save versions are refused without mutation.
- `backend/plot_twist/tests/test_web_parity.py`: Python/JavaScript engine agreement.
- `frontend/tests/spoiler-guard.test.js`: protected reveal fingerprint handling.
- Other cases exercise auth refusals, crew access/seats, weather fallback and
  SQL/Python contracts.

Most external services are controlled fakes. These results do not establish live
database RLS enforcement, real concurrent-player behavior, every browser path or
production headers. No credentials or live database were needed for the count.

## Original assets and offline policy

`images/island.svg`, `images/architecture.svg` and `images/request.svg` were authored
for G25. They use only local vector shapes and system fonts. No screenshots, remote
assets, external diagrams, libraries or fonts are included in the deck runtime.
The request graphic is the one sequence diagram; the architecture graphic is a
component diagram. Neither contains case clues or a solution.

The deck's CSP permits its own external script, stylesheet and local images,
blocks connections and inline script/style, and uses no evaluation or storage.
Speaker windows exchange slide numbers only, accepting messages from the known
paired window reference. Opaque `file:` origins require `postMessage`'s wildcard
target; source-window and message-shape checks limit the receiver.
