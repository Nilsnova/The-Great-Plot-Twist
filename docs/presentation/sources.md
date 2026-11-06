# Evidence behind the slides

Baseline: `origin/main`, full commit
`60f7fd0b89fcbaad346b05ac365b1386aa6c0f8d`. Inspected and tested on 6 November
2026. This is an implementation snapshot, not a claim that production has deployed
every feature. Later main changes require refreshing claims and counts.

| Slides | Claim | Repository evidence |
| --- | --- | --- |
| 1–2 | Text adventure expanded into a browser island world; original pixel art; playable intro, chart travel and local journal | [README](../../README.md), [graphics implementation](../../frontend/GRAPHICS.md), `frontend/src/story/`, `frontend/src/world/places/`, `frontend/src/adapter/bridge.js` |
| 3 | Browser JavaScript/Three.js/Vite; FastAPI; same-address Vercel services; configured Dublin region | [architecture](../ARCHITECTURE.md), [Vercel configuration](../../vercel.json), [frontend package](../../frontend/package.json) |
| 3 | Supabase Auth, Postgres grants/RLS; Realtime is **built, flag off, game integration pending** | [architecture](../ARCHITECTURE.md), [interfaces](../INTERFACES.md), [Realtime module](../../frontend/src/online/realtime.js), [database policy matrix](../../supabase/README.md), [status](../STATUS.md) |
| 4 | Existing name reroll API validates `actionUid`, verifies identity, uses an atomic database function, returns 409 on repeat | [route](../../backend/server/routes/captain_name.py), [auth](../../backend/server/auth.py), [name store](../../backend/server/account/name_store.py), [accounts migration](../../supabase/migrations/20261106020000_accounts.sql) |
| 5 | Browser sends intent; server authorizes writes; grants/RLS and constraints protect access/data; stable references prevent repeat effects | [architecture](../ARCHITECTURE.md#3-who-may-do-what), [wallet](../../backend/server/wallet.py), [database README](../../supabase/README.md) |
| 6 | Current protected-line fingerprints and elimination-data build checks; private/no-store account responses | [build guard](../../frontend/scripts/check-spoilers.js), [account route](../../backend/server/routes/me.py) |
| 6, 10 | Sitewide security headers are configured; deployed coverage still needs verification | [vercel.json](../../vercel.json) sets CSP, nosniff, referrer/permissions policies, COOP and framing denial. [Vite preview](../../frontend/vite.config.js) also sets headers; [browser CSP check](../../frontend/scripts/check-csp.js) tests the built site. This docs task does not establish deployed response behavior. |
| 7 | Tests, build and lint results below | [backend project configuration](../../backend/pyproject.toml), [frontend scripts](../../frontend/package.json), existing test suites |
| 8 | D015 owner authorization, extended 6 November; Claude integration gates, database extras, owner review timing and teammate peer review | D015 in [decision log](../DECISIONS.md); [contribution rules](../../CONTRIBUTING.md); [agent rules](../../AGENTS.md). Other decision titles were reviewed; story decisions are not reproduced. |
| 9–10 | Lessons and integration priorities | Interpretation of the above implementation, tests and boundaries; next steps are proposals, not completed features. |

The C3 main merge added the requested [frontend/HOW-IT-WORKS.md](../../frontend/HOW-IT-WORKS.md),
which was read along with graphics docs and the actual implementation. C1 and C2
record an earlier main snapshot where that guide was absent. Account screens are
now built, but the real auth/API adapter remains disconnected; Realtime's module
exists but is not started by the game and its feature flag is off.
Some older overview prose in README/architecture predates newer code, so concrete
claims were checked against code and tests as well.

## Test run on main

| Working directory | Exact command | Result |
| --- | --- | --- |
| `backend/` | `UV_CACHE_DIR=/workspace/.cache/uv uv run --locked pytest` | 6,408 passed; no skips/failures; 52.93 seconds |
| `backend/` | `UV_CACHE_DIR=/workspace/.cache/uv uv run --locked ruff check .` | All checks passed |
| `frontend/` | `npm test` | 886 passed across 72 test files |
| `frontend/` | `npm run build` | Passed; 99 built text files / 12 protected lines; no suspect elimination data |

Combined: **7,294 test cases, including parameterized cases**, not 7,294 player journeys.
The caches above are local tool configuration, not required application settings.
Logs from this run were kept outside the repository in
`/workspace/cloud-setup/g25/current-main/`.

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
