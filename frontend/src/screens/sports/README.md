# Sports pavilion

`game.js` connects the existing `sports_pavilion` hotspot to `createSportsEntry`.
The panel and transport load on first use. The native modal blocks world/touch/gamepad
actions, restores focus on close and stops polling when closed or disposed. A cancelled
or disposed lazy load cannot open a late dialog.

The board uses anonymous `GET /api/sports`. Signed-in players also read
`GET /api/sports/mine`. A stake sends only `{fixtureId,pick,amount,stakeId}`;
checking an own stake's verified result sends only `{fixtureId}` to `/api/sports/settle`.
All amounts, caps, pool totals, results, refunds and payouts are the server's values.
Unknown stake answers keep the exact reference and payload, including after a rate-limited
retry or closing/reopening the panel. Signing out clears private pending intents.

There is no local betting adapter or provider request in this screen. Recorded examples
are read-only. Missing providers and `feature_off` render unavailable/closed states.
Provider attribution lives in Settings → Credits; the panel shows source and freshness.
The `sports` flag stays off until the server/provider release checks pass.

Local checks (no provider traffic or live writes):

```sh
npm test -- tests/sports
npm run build
node scripts/check-sports.js
node scripts/check-sports-hotspot.js
```

The first browser check loads built assets under the strict preview CSP and intercepts
HTTP with fictional, future fixtures. The second opens the actual harbor hotspot in the
existing local case rehearsal. Captures and reports are written under `captures/G15-Sports-*`.
