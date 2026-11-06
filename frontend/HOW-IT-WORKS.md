# How the browser client works

Technical notes for contributors to the Vite browser client. Used alongside [GRAPHICS.md](GRAPHICS.md) and the repository's [engineering guide](../docs/ENGINEERING.md).

## Host and demo console (G14)

`host.html` is a separate Vite entry using the pixel UI kit. Its strict CSP permits only same-origin external scripts, styles and requests. `src/host/auth.js` completes PKCE through our API and places the access token in the existing memory-only session; the console never writes directly to Supabase.

`src/host/controller.js` asks the server for host access before displaying anything. `view.js` and `panels.js` render explicit safe fields with text nodes. Refresh failures and sign-out remove the panels, and stale responses cannot restore them. Crew cleanup requires confirmation and reuses one action UUID after an unknown outcome.

The clock is hidden unless `/api/config` confirms G10 is installed and `case` is on. Its input and quick buttons send `{seconds, actionUid}` with 1–3600 whole seconds. Only the outcome message/time is displayed; the returned case view is ignored. `?perf=1` is linked for the demo rehearsal; G14 does not change the game's production performance display.

Run `npm test` and `npm run build`; after the build, `CHROME_PATH=/usr/bin/chromium npm run test:host` checks the page at desktop and phone widths against fake same-origin API responses only. Operator guidance and backend contracts are in [HOST-CONSOLE.md](../docs/HOST-CONSOLE.md).
