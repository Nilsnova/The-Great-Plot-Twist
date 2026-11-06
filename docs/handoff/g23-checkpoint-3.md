# G23 checkpoint 3 — captures and final gates

Branch: `docs/g23-help`, based on `origin/main` `c26f303`. Fetched and merged `origin/main` before C3: already up to date. Prior checkpoints: `a11d405` (manual), `8da0e90` (help page). Push only this branch; do not push or merge main.

## Changed

- Completed the spoiler-free manual and standalone `/help.html` with expandable, captioned local-fake examples and descriptive image alternatives. No existing game page or shared module links to the help yet.
- Added `frontend/public/help/crew-rehearsal.png` and `partners-rehearsal.png`: 922×688 each, about 49–50 KiB. Captured from built `/case-lab.html?demo=1`, one fake captain before muster and three NPC partners afterwards. The visible local-rehearsal disclaimer and captions identify the example codes as fake. No clue cards, deductions, accusations, reveal, real account or API calls were used. Both images were visually inspected.
- Added `frontend/scripts/check-help.js` for production-preview browser checks and explicit `--capture` regeneration. It starts and closes its own preview/browser. No live backend is needed.
- Extended `frontend/tests/help.test.js` to verify that the normal build ships both PNGs, their size/dimensions and alternatives, in addition to the strict CSP, anchors and protected reveal checks.

## Verified

- `(cd frontend && npm test && npm run build)` — **34 test files, 293 tests passed**. Production build passed. Existing spoiler guard passed over **55 built text files**, including the help HTML/script/styles.
- `(cd frontend && CHROME_PATH=/usr/bin/chromium node scripts/check-help.js)` — **26 checks passed**, Chromium 156.0.8078.79. Verified all 12 topics, no overflow at 320/375/960px, skip-link focus, filter/no-results/Clear/Escape, anchor recovery, loaded screenshots, correct report destination, and no API or external asset requests. Normal reading/filtering produced no browser or CSP errors.
- Intentional CSP probes separately confirmed blocking of inline scripts, inline styles and even same-origin API connections; the browser reported `script-src-elem`, `style-src-elem` and `connect-src` violations as expected. These denials are test successes, not normal-operation failures.
- JavaScript-disabled reading passed at 320px; the complete guide and navigation remain available while the optional search stays hidden.
- Capture run (`node scripts/check-help.js --capture`) passed the fake-mode seat/muster/no-cards/no-API assertions and image limits. Run it after a production build to refresh these two owned files, then rebuild so the new captures are copied into `dist/help/`.
- Secret scan empty; whitespace check clean. Final diff is restricted to the new guide/help assets/tests/check script and `docs/handoff/g23-checkpoint-*.md`. Backend, database, deployment config, status/decision logs, existing frontend pages and shared modules are unchanged.

## Source gaps and limits

`frontend/HOW-IT-WORKS.md` is absent on the fetched main; used `frontend/GRAPHICS.md` and actual source. Current main does not integrate GitHub sign-in, cloud kit/crew/case screens, islet building, prediction/duel menus or the bulletin. Help labels unavailable, rehearsal and planned behavior instead of promising those services. Requested 10× leveraged positions closing at zero are an approved next design, not the current market implementation; clearly marked **Planned**, with play-money-only and loss-risk language.

Intro gamepad dialogue navigation is not reliably integrated in current source; help recommends keyboard/touch. No out-of-scope fix was made. Live accounts, multiplayer, trades, prediction settlement, duels, deletion and external weather were not tested. Device coverage is automated Chromium viewports, not a physical phone/gamepad or a complete assistive-technology audit. No deployment was performed.

The public aliases (`public/help.html` → `../help.html`, `public/help/kit.css` → `../../src/ui/kit/kit.css`) intentionally avoid changing the shared Vite entry list or duplicating kit styles. The normal build/test verifies they become ordinary files in `dist`. Help's `connect-src 'none'` intentionally excludes development HMR; validate it through production preview.

## G9 handoff / remaining

G9 should add **How to play** → `/help.html` beside **Settings** in the title and pause menus (`frontend/src/shell/controller.js`), with keyboard focus restored on return. G23 added no inbound game link. The guide has its own **Return to the game** link. Preserve the public aliases unless a later shared-config task registers the help as a Vite entry and bundles its assets instead.

C1–C3 are complete. Update availability labels against actual newly merged code before describing any currently planned feature as live. Branch/PR: `docs/g23-help`; branch-only push, no PR, main push or deployment.
