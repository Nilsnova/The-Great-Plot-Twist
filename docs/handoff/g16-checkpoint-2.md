# G16 checkpoint 2 — browser transfer budget

- Branch `chore/g16-reliability`; fetched and merged `origin/main` (`c26f303`) before this checkpoint; no main push.
- Cold title JS **21,639 → 21,639 bytes**, gzip **9,895 → 9,895**; below existing **35,000-byte** limit. Three.js, runtime, destinations, cinematics, gallery and case screens already load dynamically.
- Cold title CSS **15,003 → 10,472 bytes** (−30.2%); gzip **5,141 → 3,679**. Moved existing world/HUD CSS behind `game.js`; shared page/focus rules remain eager. Added a **12,000-byte** CSS regression budget.
- No additional audio/menu async split: title input/gesture unlock must remain reliable; no unnecessary race/failure path introduced. No gameplay screens, online or adapter files edited.
- Full emitted chunk/media sizes (raw, gzip per JS/CSS file, initial/deferred, PNG dimensions): [before](g16-browser-before.json), [after](g16-browser-after.json); actual [build output](g16-browser-build.txt).
- Largest deferred JS: game about **399 kB**, shared Three.js chunk **207.5 kB**, fake adapter **31 kB**. G9 finding: adapter remains deferred; investigate splitting its runtime/content at G9 ownership boundary if needed; G16 leaves it unchanged.
- Images unchanged: **393,381 bytes total** (195 PNGs **392,991 bytes**, plus SVG); cold title PNG **29,530 bytes**, 480×300. No oversized image download identified.
- Audio unchanged: **0 transferred audio bytes**; procedural ambience allocates one 2-second mono float buffer (`8 × sampleRate` bytes) and three looping sources after activation. No added preload.
- Repeat report: `cd frontend && node scripts/report-budget.js --check` after build. Budgets: title JS <35 kB, CSS <12 kB, title PNG <40 kB.
- Local production load check: **19 checks passed**, including all 11 required lazy entries, zero title WebGL allocation, movement into production world/settings, no browser errors/external asset requests; contrast **6.48:1**. [Report](g16-loading-checks.json).
- Repeat load check: `cd frontend && CHROME_PATH=/usr/bin/chromium CAPTURE_DIR=/tmp/g16-captures CAPTURE_PREFIX=G16 npm run test:loading` (capture overrides protect tracked files).
- G8-specific/CSP runner is absent on this `origin/main`; existing auth-check CSP assertion in backend tests remains green. No game CSP is claimed. Exact deployment-header proposal for Claude follows in checkpoint 3; `vercel.json` untouched.
- Gates (`set -o pipefail`): backend **3110 passed**, Ruff clean; frontend **288 passed**; build and **51-file** spoiler guard passed; load and budget checks passed.
- Post-commit secret gate: `UV_CACHE_DIR=/workspace/.cache/uv uv run --no-project --with detect-secrets python scripts/check-diff-secrets.py`; zero findings required before branch push.
- No live requests, Supabase/`.env`/credential access, new dependencies/lock changes, migrations, STATUS or DECISIONS edits.
