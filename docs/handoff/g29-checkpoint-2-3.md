# G29 checkpoints C2 and C3: class harbor, quest strip, duel shortcut, Keeper's Lock, three lamps

Branch `feat/g29-wave2` (integrate/g29 + feat/g29-assets). No migration. No change to vercel.json or the case rules.

**C2 (class multiplayer).** `?join=harbor`, the code HARBOR or "Join the class harbor" puts a player in one
presence room, `live:place:class_harbor:1`, while standing in Saltreach Harbor: 40 drawn captains, no
start delay, a 0 to 4 s announcement jitter, 1.8x emote bubbles, an arrival splash and "<Captain> joined"
toasts (names from `profiles`, never from a browser). Normal rooms keep 4 to 9 captains and 8 drawn.
The quest strip (Wave, Duel, Keeper's Lock; tap for a hint; done state per captain in local storage)
replaces the case toolbar, chapter, bulletin and onboarding while on the demo path; "Full mystery" in
the pause menu restores the unchanged HUD and starts the Lighthouse prologue ("Class demo" goes back).
Near a captain: tap or E, then Wave or "Friendly duel (3 rounds)" (POST /api/duels, stake 0). The named
captain hears a `duel` extra in the class room (or finds it within 20 s by GET /api/duels) and gets
"Accept / Not now" in place, then both see the arena's reveal in a spotlight dialog with the ring bell.
The host (GET /api/host/demo 200) or `?present=1` presses J for the projector: QR on a canvas for
https://the-great-plot-twist.vercel.app/?join=harbor, HARBOR, the live count, the demo window and
"Open demo for 2 hours" (POST /api/host/demo, same action id after an unknown outcome).

**C3 (lock and finale).** The Keeper's Lock stands right of the ferry pier. It shows the server's question,
"Change place" (GET /api/places/search; the choice stays in session storage), five sky buttons with
pixel icons (the riddle's own choices when `weatherSource` is `clue`), the server's messages, the hint
path ("That's not what I see outside", then the server's prompt) and plain words for 403 demo_closed,
409 too_many_tries and 429. Opening plays cutscene `lock_opens`, ticks the goal and shows a reward line.
Three lamp posts: hold the button or E for 2 s; a lamp burns 20 s; three at once relight the lighthouse
for everyone (cutscene `lamps_relit`, sparks, foghorn and beam cues). States travel only as the `lamp`
extra in the class room (ages, no names, idempotent, one tick every 5 to 7 s); no table, no world_state.
The host can fill missing lamps with NPC partners 20 s after the first lamp.

**Rehearsal.** `?demo=1`: simulated captains (`&captains=N`, default 14), a practice rival that answers and
challenges you after 25 s, a fixture lock (sky "cloudy") and two helpers for the lamps. No server writes.

**Server.** `backend/content/keeper_lock.json`: "Coloured flags" -> "Colored flags" (house spelling; the
text lint gate failed on integrate/g29). Words added to `scripts/text-lint/words.txt`.

**Checks.** `npm run test:demo` is now the journey (`scripts/check-demo-journey.js`, screenshots in
`/Users/nilslenke/Developer/fri6-integration/g29-wave2-shots/`); the highlights tour is `test:demo:tour`.

**Nils, before class.** Switch on the flags `demo`, `live_presence` and `arena`; open the demo window from
the projector panel; ask the class to wave in turns (30 waves at once briefly trip the Realtime guard).
