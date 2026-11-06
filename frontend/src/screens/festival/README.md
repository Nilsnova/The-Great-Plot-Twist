# Lantern festival

`entry.js` installs the optional title/pause launcher and creates the screen only when opened. It observes the shell's stable body slot so menu changes do not require a second shell owner. `game.js` adds a HUD launcher and blocks world input while the modal is open. The ordinary case adapter is independent.

The live adapter reads the existing session through `online/api.js`. It first checks `flags.festival`, then reads `GET /api/festival`. The server supplies phase, UTC timestamps, remaining seconds, twelve canonical lamps and the viewer's ring state. The displayed countdown only subtracts elapsed display time; it never starts or extends a live festival.

The only writes are `POST /api/festival/claim {lampId, actionUid}`, `/ring/join {signals, actionUid}` and `/ring/leave {actionUid}`. The signal picker reuses the three-round A7 oil constraints. The server creates and resolves friendly duels; this package calculates no winnings or coin changes. A paired `duelId` opens the existing Lantern Duels detail screen.

Unknown write outcomes retain the exact request body and action id. The player can retry that request; other writes stay disabled until it is confirmed. Reads keep the last good view after a failure. Sign-out clears private reservation markers, queue/duel references and pending actions. Polling runs only for an open, visible screen, every 30 seconds or every 5 seconds while queued.

Only `?demo=1&festival=1` selects `local.js`. That constructor receives no API, token or fetch function. Its claims, lifecycle controls and practice pairing exist in memory and are labelled as local rehearsal. A practice pairing creates no real duel. `?festival=1` alone cannot enable the live feature.

Original WAVs play through the existing trusted-gesture audio owner, music/effects buses and shared master/music/effects settings. The loop needs an explicit Play press. Closing the panel stops it; captions and visible state work when sound is muted or unavailable.

Run `npm test` and `npm run build`. With Chromium available, run `CHROME_PATH=/usr/bin/chromium CAPTURE_DIR=/tmp/festival npm run test:festival:ui` for the production CSP, keyboard, phone, recording and transport-boundary gate. `npm run test:festival` checks the original workshop. These browser checks use local fixtures; they do not prove authenticated production writes or physical-phone/Safari behavior.
