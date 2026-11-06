# A4 Live presence

> **What this is:** the spec for live presence. Players see each other's captains move in real time and can send preset emotes, and the server can tell a crew the moment something changes. Everything runs on Supabase Realtime's free plan.
>
> **Who uses it:** the agents that build this package (backend helper, migration, `realtime.js`, docs), Codex for the screens adapter on G6, and A2, A6, L3, S3 and S4, which plug into it.

- **Status:** draft for the controller (Claude). Nils set the goal on 5 Nov 2026: live multiplayer is core, it must stay free, and `@supabase/supabase-js` is approved.
- **Branch:** `feat/a4-live-presence` in worktree `/Users/nilslenke/Developer/The-Great-Plot-Twist-a4`, branched from `main` at `3ca7d38`.
- **Migration:** `supabase/migrations/20261106050000_live_presence.sql`.
- **Decision:** D018, the next free number after D017.

## Answer first

- **Rooms.** There are three kinds of private Realtime rooms. `live:world` uses presence only and shows who is online, in which place and room, and with which kit. `live:place:<placeId>:<room>` uses broadcast only and carries moves and preset emotes. `live:crew:<crewId>` is broadcast that players can only receive; only the server sends into it.
- **Room sizes.** Place rooms are numbered and hold at most 9 captains. When 30 players are online they hold 4, which is a crew.
- **Budget.** Moves may use at most 60 of the free plan's 100 messages a second, however many people play. The rate is `updates per second = min(2, 60 / (captains online x captains in my room))`. A crew of 4 gets 2 updates a second; with 30 players online it gets one update every 2 seconds.
- **Security.** Five policies on `realtime.messages`, all for `authenticated`. Anonymous visitors get nothing, crew rooms are open only to their members (`is_crew_member`), and nobody but the server can send into a crew room. Nils switches off "Allow public access" in the dashboard. Positions, presence and emotes are only for showing (D003).
- **Server.** `backend/server/crew_broadcast.py` sends one HTTP request per crew event to Supabase's Broadcast REST API using the secret key. It never subscribes to a room. It sends at most 20 events per crew in 10 s and at most 5 events a second over all crews, and a call takes at most 2 s. It is wired into `create_app(..., broadcaster=...)`. L3, S3, S4 and A6 will call it later.
- **Client.** `frontend/src/online/realtime.js` loads `@supabase/supabase-js@2.118.0` lazily, takes the login token through an injected `getAccessToken`, and emits `live_*` events for the screens adapter. It does nothing unless `enabled` is exactly `true` and the player is signed in. It is split by job into five files under `frontend/src/net/` plus the coordinator `realtime.js`, so that the coordinator and each helper stay near 200 lines (the pure rules in `live-rules.js` are a table of small functions and run to about 300).
- **Needs the controller's OK.** Two parts go beyond the brief: (a) the world room and the numbered place rooms; (b) splitting the browser module by job into `frontend/src/net/live-rules.js` (the pure rules), `live-rooms.js`, `live-places.js`, `live-sender.js` and `live-view.js`, with `realtime.js` as the coordinator. Other deviations are listed under "Deviations and open questions".

## Why

Nils decided on 5 Nov 2026 that players must see each other live, at no cost. Supabase Realtime is already part of our free project, needs no new account, and its rooms can reuse our crew rule (`is_crew_member`). On the free plan, every copy of a message delivered to a player counts toward the limits, so the design is mainly about keeping fan-out small.

## Facts checked on 5 Nov 2026

Sources: the Supabase docs through `search_docs`, the realtime-js 2.118.0 source on unpkg, and the npm registry.

| Fact | Source |
|---|---|
| Free plan limits: 200 concurrent connections, 100 messages/s, 100 channel joins/s, 100 channels per connection, 20 presence messages/s, 10 keys per presence object, 256 KB per broadcast, 2 million messages a month. | Realtime Limits; Realtime Pricing |
| A broadcast counts once when sent and once for each client that receives it. Presence counts too. | Manage Realtime Messages usage |
| "Concurrent connections" means the total number of subscribed channels, so each room a player joins counts as one. | Realtime Concepts |
| Going over a per-second limit makes Supabase close the channel. It first sends a `system` message: "Too many messages per second", "Too many presence messages per second" or "Client presence rate limit exceeded". The client should throttle before it rejoins. | Realtime Protocol, Error handling |
| Going over the monthly quota on the free plan brings a notice, a grace period, then restrictions. There is no bill. | Manage Realtime Messages usage |
| Private rooms are governed by RLS on `realtime.messages`. Policies are checked when a room is joined and again when a new token arrives, and cached in between. `realtime.topic()` returns the room's topic. `extension` is `broadcast` or `presence`. A `select` policy allows receiving; an `insert` policy allows sending or tracking. A player needs at least one permission to join. | Realtime Authorization |
| Private rooms are enforced only when "Allow public access" is switched off. Any change on the Realtime Settings screen disconnects every client. | Realtime Authorization; Realtime Settings |
| A broadcast the policies refuse is dropped silently. | Realtime Protocol, Broadcast errors |
| The server REST call is `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with an `apikey` header and body `{"messages": [{"topic", "event", "payload", "private": true}]}`. The Getting Started page shows a garbled `/rest/v1/rpc/broadcast` example; ignore it. | Broadcast guide; realtime-js `send()` |
| With the `accessToken` option, supabase-js asks for a token on connect and on every heartbeat (25 s) and sends a changed token to joined rooms. If a token expires and no new one arrives, the room closes and nothing rejoins it. If the callback throws, the library keeps the last token. If it returns null, the library sends null. | JS reference `setAuth`; realtime-js `RealtimeClient` |
| realtime-js 2.118.0 has no client-side rate limit. The socket reconnects after 1, 2, 5, then 10 s. Calling `send()` before the room is joined falls back to REST and logs a deprecation warning. | realtime-js 2.118.0 |
| Presence is meant for slowly changing state, never for positions. | Presence guide |
| `@supabase/supabase-js@2.118.0` was published 15 Oct 2026. The next version, 2.119.0 (4 Nov), is too new to pin. 2.118.0 is MIT, needs Node >= 22, has no install scripts, and pins its dependencies except `iceberg-js ^0.8.1`. | npm registry |

## Design

### 1. Rooms

| Room | Topic | Kind | Who may join | Who may send | Used for |
|---|---|---|---|---|---|
| World | `live:world` | presence only | any signed-in player | any signed-in player (track) | who is online, their place, room and kit |
| Place room | `live:place:<placeId>:<room>`, for example `live:place:saltreach_harbor:1` | broadcast only | any signed-in player | any signed-in player | moves and emotes of the captains in that room |
| Crew room | `live:crew:<crewId>` | broadcast only | only players seated in the crew | only the server (REST, secret key) | crew events: "something changed, fetch it" |

- **Topics.** All rooms are created with `config: { private: true }`. Place ids are the registry ids from `frontend/src/world/places/registry.js` and match `^[a-z][a-z0-9_]{1,39}$`. Room numbers run from 1 to 99. `home_islet` gets no room, because each player has their own islet.
- **Room choice on arrival.** This is the pure function `chooseRoom`:
  1. Take the lowest-numbered room in this place where a crewmate already is, even if it is full.
  2. Otherwise take the lowest-numbered room with fewer captains than `roomLimit(online)`.
  3. `roomLimit(online) = clamp(floor(120 / online), 4, 9)`. That is 9 captains (you plus 8 others) while 13 or fewer are online, and 4 when 30 are online. The 120 comes from 60 messages a second times the slowest gap we accept, 2 seconds.
  4. If two crewmates arrive at the same moment and land in different rooms, the one in the higher-numbered room moves down when the world presence shows the other.
- **Why a world room.** It solves three problems with one presence update per trip:
  - the budget formula needs the number of captains online, and no single room can see that;
  - "a count of the rest" needs to know where everybody is;
  - a newcomer needs to know who is in its room before anyone moves.
- **Why numbered rooms.** Every message reaches everyone in its room, so a room's cost grows with the square of its size. One room of 30 costs 30 messages per move. At a rate that keeps the project safe, that is one update every 15 seconds.
- **Connections.** Each player is in at most 3 rooms. If Supabase counts every room as a connection, about 66 players fit in the 200.

### 2. Messages

Payloads are small camelCase JSON with `v: 1`. They never contain free text, a name, a login or an e-mail address.

| Room | Event | Payload | Sent when |
|---|---|---|---|
| world | presence track | `{v, place, room, kit}`. `place` and `room` are null at sea; `room` is null on the home islet. | On joining, and on every change of place, room or kit. At most one track per 1.5 s; changes within that window are merged and sent together. |
| place room | `position` | `{v, id, place, x, z, facing, moving, seq, everyMs}` | While moving, at the allowed rate. Also once on stopping, once right after we announced our place and room, and once 200 to 800 ms after a newcomer appears in the room. Nothing is sent before the announcement, because receivers ignore a captain they do not know. |
| place room | `emote` | `{v, id, emote, seq}` | When the player picks an emote. At most one every 3 s. |
| crew room | `crew_event` | `{v, kind, data}` | Only from the server, after it has saved a change. |

What each field means:

- `id`: the sender's player id. Supabase does not tell receivers who sent a broadcast, so the sender must include it. The presence key is also the player id.
- `x`, `z`: `controller.player.position.x` and `.z`, rounded to 2 decimals, with an absolute value of at most 200.
- `facing`: `up`, `down`, `left` or `right`. This is the same choice `createCharacter().face(dx, dz)` makes; it is exported as `facingFrom`.
- `seq`: starts at the sender's `Date.now()` and grows by 1 per message, so it keeps growing after a page reload. Receivers keep only messages newer than the last `seq` they accepted from that id.
- `everyMs`: the sender's current gap between updates, from 500 to 20000.
- `kit`: matches `^[a-z][a-z_]{1,23}$`, or is null.
- `emote`: one of `wave`, `cheer`, `nod`, `shrug`, `follow_me`, `help`. The list is the constant `EMOTES`; D006 (A2) may rename the entries.
- `kind`: `board_changed` (L3), `finale_changed` (L3), `case_changed` (S3), `partner_changed` (S4) or `crew_changed` (A6).
- `data`: a JSON object of at most 1 KB, usually `{version: n}`. It never contains spoilers or another crew's data.

**Names.** Names are never sent. The receiver reads `display_name` from `profiles`: one read for up to 50 ids at a time, cached, through the same client (RLS already lets signed-in players read every profile). The brief allowed a "captain name" in presence, but that text would come from the sender's browser, and D003 forbids showing names a browser chose.

### 3. Sending and receiving

**Sending.** One allowance covers moves, emotes and replies.

- `gapMs = max(500, 1000 / rate rounded up to the next 100 ms)`, where `rate = min(2, 60 / (online x room))`. In slow mode the rate is halved.
- `online` is the number of valid keys in the world presence. `room` is the number of captains in my room, counting me even before my own presence appears.
- When I am alone in the room (`room` = 1), nothing is sent.
- When the allowance frees up, the order is: a queued emote, then the stop update, then a reply, then the regular update while moving.
- A message goes out only while the room is joined (`channel.state` is `joined`) and the socket is open, so the library's REST fallback never runs. It also waits until the world presence holds our current place and room, because receivers ignore a captain they do not know. Our position follows right after each announcement.

**Receiving.** A message that fails any check is dropped without a word.

- The sender's id must be in my place and room according to the world presence.
- `v` must be 1, and the shape and ranges must match section 2.
- `place` must equal my place.
- `seq` must be newer than the last one accepted from that id.
- A position must come at least 400 ms after the last accepted one from that id; an emote at least 2 s after.

**What is shown.**

- At most 8 other captains: crewmates first, then the rest ordered by id.
- `hiddenCount` is the number of other captains in my place across all its rooms, minus those shown. On the home islet it is 0.

**Interpolation on the receiving side.**

- On each accepted position, the captain glides in a straight line from where it is drawn now to the new spot, over `everyMs`.
- It snaps instead when the jump is longer than a captain could sprint in 1.5 x `everyMs`. Sprint speed is 6 units/s, from `player/controller.js`.
- The walk animation plays while `moving` is true.

### 4. Security

**Policies.** The full SQL is in Appendix A. All five policies are on `realtime.messages` and apply `to authenticated`.

1. "Live: players can see who is online": `select` when the topic is `live:world` and `extension = 'presence'`.
2. "Live: players can say where they are": `insert` with the same conditions.
3. "Live: players can watch a place room": `select` when the topic matches `^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$` and `extension = 'broadcast'`.
4. "Live: players can move in a place room": `insert` with the same conditions.
5. "Live: crew members can hear their crew room": `select` when `extension = 'broadcast'` and `public.is_crew_member(public.live_crew_id((select realtime.topic())))`.

There is no insert policy for crew rooms, no policy for `anon`, and no policy for any other topic. The helper `public.live_crew_id(text)` returns the uuid inside a `live:crew:<uuid>` topic, or null. It never raises, so a malformed topic is refused instead of causing an error. Only `authenticated` may execute it.

**Dashboard switch (a step for Nils).** Realtime > Settings > Channel restrictions: switch off "Allow public access". Until this is off, anyone holding the public key can use public rooms that our policies never cover, and spend the shared budget. This gap exists today, before any of this code. Switching it now disconnects nobody, because no client uses Realtime yet.

**The `live_presence` flag.** Browsers start live presence only when `/api/config` reports the flag as on, and the server helper sends nothing while it is off. The flag cannot stop a modified browser; only the policies and the dashboard can. So apply the migration only when the team wants to test. Until then every private join is refused.

**What a forged or flooding client can and cannot do.**

| It can | It cannot |
|---|---|
| Join `live:world` and see which place and room every online captain is in. Players can already see this in the game, and names are public to signed-in players anyway. | Join anything without signing in. `anon` has no policy, and public rooms are off. |
| Track a fake place, room or kit for itself. | Join or listen to another crew's room. |
| Join any place room, claim any position (including teleporting), or claim another player's id. The worst result is a misplaced captain showing another player's server-written name. | Send anything into a crew room, so it cannot fake a server event. Refused writes are dropped silently. |
| Flood messages. Each copy delivered counts toward the project's 100/s and 2M a month. A flood can make Supabase close every player's rooms. The API and the game itself keep working; only live presence stops. | Use presence in place rooms, or broadcast in the world room. |
| Create empty junk rooms that match the topic pattern. | Change any game state. Realtime stores no client messages, and pins, beam locks, accusations and coins stay on the server (D003). |
| | Show free text to others. Receivers accept only numbers, known ids and preset emotes; names come from `profiles`. |
| | Read anyone's GitHub login or e-mail address. No payload contains them. |

**How floods are limited.**

- Honest clients slow down (the guard in section 6).
- Rooms hold at most 9 captains, so one flooded room costs at most 9 copies per message.
- Receivers drop floods.
- Kill switch, from fastest to slowest:
  - **Immediate:** Realtime > Settings > "Enable Realtime service" off.
  - **Drop the five policies:** use the SQL in the README. Rooms already joined keep their rights until the player's next token, at most about an hour.
  - **Delete the account:** its current token stays valid until it expires, at most about an hour.

### 5. Server pushes: `backend/server/crew_broadcast.py`

```python
CREW_EVENT_KINDS = ("board_changed", "finale_changed", "case_changed", "partner_changed", "crew_changed")

class CrewBroadcaster:
    def __init__(self, base_url: str, secret_key: str, enabled: bool,
                 transport: httpx.AsyncBaseTransport | None = None, clock: Clock = utc_now) -> None: ...
    async def send(self, crew_id: str, kind: str, data: dict[str, Any] | None = None) -> bool: ...

def broadcaster_from_settings(settings: Settings, transport=None, clock: Clock = utc_now) -> CrewBroadcaster
def get_broadcaster(request: Request) -> CrewBroadcaster
BroadcasterDep = Annotated[CrewBroadcaster, Depends(get_broadcaster)]
```

What `send` does, in order:

1. **Checks its arguments.** A bad argument is a bug in the caller, so it raises `ValueError`:
   - `crew_id` must parse as a UUID; it is normalised to lowercase text;
   - `kind` must be one of `CREW_EVENT_KINDS`;
   - `data` must be None or a dict whose compact JSON is at most 1024 bytes.
2. **Flag off:** returns False and sends nothing.
3. **Not set up** (`SUPABASE_URL` or the secret key missing): returns False and logs one warning.
4. **Too many events:** if this server instance has already sent 20 events for this crew in the last 10 s, or 5 events in the last second over all crews together, it returns False and logs a warning. A skipped event is not counted. This stops a loop bug from burning the budget (even a loop that walks over every crew: one event costs 1 message to send and up to 4 to deliver), but lets ordinary bursts through.
5. **Sends** `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with headers from `supabase_admin.build_headers(secret_key)`. The whole call, from connecting to the answer, is bounded at 2 s (httpx counts 2 s for each phase on top of that). The body is `{"messages": [{"topic": "live:crew:<id>", "event": "crew_event", "payload": {"v": 1, "kind": kind, "data": data or {}}, "private": true}]}`.
6. **Result:** a 2xx answer returns True. Any other status logs a warning with only the status code and returns False. A network error or timeout logs a warning with the error's class name and returns False. Network problems never raise.
7. **Logging:** it never logs the key, the crew id, the payload or Supabase's answer. It never opens a WebSocket.

**Wiring and settings.**

- `create_app` gets a keyword-only parameter `broadcaster: CrewBroadcaster | None = None` after `market_service`, and stores it in `app.state.broadcaster`.
- There is no new environment variable. The helper uses `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the flag `live_presence`.
- The `settings.py` docstring gains `crew_broadcast.py` in its "Used by" list and in the list of files that call `.get_secret_value()`.
- `server/__init__.py` gains one line describing the new file.

**Who calls it later.** Each caller sends after its database change has succeeded, using `data={"version": n}`:

- **L3:** after a pin, a deduction, nightfall, a change of post, a beam lock change, or the Relighting.
- **S3:** after a card is found or an accusation is made.
- **S4:** after an NPC errand finishes.
- **A6:** after someone joins or leaves the crew.

Callers send on state changes only, never on every input (so no aim updates). L3 and A7 keep polling as their fallback; crew events let them poll slowly (for example every 30 s) and refresh at once when an event arrives.

### 6. Budget

**Formula.**
- Moves: `rate = min(2, 60 / (online x room))`. This holds the whole project at or under 60 msgs/s even if every player is walking.
- Rooms: `roomLimit = clamp(floor(120 / online), 4, 9)`. This keeps a full room at one update every 2 s or faster.

| Case | Online | Room | One update every | What a player sees | Worst case, everyone moving |
|---|---|---|---|---|---|
| A crew of 4, nobody else online | 4 | 4 | 0.5 s | the other 3, live | 4 x 2 x 4 = 32 msgs/s; 115,200 per hour (57,600 if half are moving) |
| A place with 8, the only players online | 8 | 8 | 1.1 s | 7 others | 8 x 0.91 x 8 = 58 msgs/s |
| The same 8 in one place, 30 online | 30 | 4 | 2 s | 3 others, plus "+4 more here" | counted in the next row |
| A class of 30 | 30 | 4 (rooms shrink) | 2 s | the player's crew, plus a count of others in the same place | 30 x 0.5 x 4 = 60 msgs/s |

**Other costs in the class of 30.**

| Source | How it adds up | Messages per second |
|---|---|---|
| Presence | about 2 x 30 per trip, at one trip per player every 3 minutes | about 10 |
| Arrival replies | small, because rooms hold 4 | about 3 |
| Crew events | at most 5 each | about 2 |
| Start or reconnect burst | every announcement is delivered to everyone online: N captains announcing within W s cost about N x N / W deliveries a second near the end of the window. 30 captains over 15 s (5 s start + 10 s wait before the first announcement) | about 60 for 15 s (180 if they all announced within 5 s) |
| **Total** | worst case, everyone moving | **about 75**, under 100 |
| **Total** | realistic | about 45 |

A 90-minute class costs at most 324,000 messages for moves, and about 240,000 in all on a realistic day.

**The month.** 2 million messages a month is the limit that really binds. It covers about 8 class sessions, or about 35 hours of a crew of 4 playing with half of them moving at any moment. Test traffic counts too.

**The guard: slowing down near the limit.**
- **Estimate.** Once a second, `estimate = (updates per second heard in my room plus those I sent, averaged over the last 10 s) x online`. That is the cost of the whole game if every room were as busy as mine.
- **Slow mode.** If the estimate goes above 80, the rate is halved for 5 minutes and the status becomes `slow`.
- **"Too many messages per second" from Supabase:** the client turns on slow mode and waits at least 10 s before rejoining.
- **A presence rate-limit message:** the client waits at least 30 s.
- **Retry delays** after any other failure: `1 s + random x min(30 s, 2 s x 2^tries)`. The retry count resets after 60 s of being SUBSCRIBED.
- **First join:** waits a random 0 to 5 s, and tracks presence only once (with the place) after the place room is joined. The first announcement after every join of the world room waits a further random 0 to 10 s (`TRACK_JITTER_MS`), also after a Realtime blip. A class that opens the game together then stays far under 20 presence tracks and 100 joins a second, and its announcements are spread over 15 s. This is our arithmetic, not a measurement: after the first class, read Realtime > Reports (Presence Events and messages per second) and widen `TRACK_JITTER_MS` if the peak comes near 100.
- **Join allowance:** a room of one kind (world, place, crew) starts to join at most once a second (`JOIN_GAP_MS`), so a place or crew that changes in every frame cannot flood the project's 100 channel joins a second. A room that waits for its turn is dropped if the game changes its mind, and the latest wish joins when the turn comes.

### 7. The client module: `frontend/src/online/realtime.js`

```js
export function startRealtime({
  enabled,          // true only if /api/config has flags.live_presence and the player is signed in
  playerId,         // GET /api/me (A2)
  getAccessToken,   // async () => string | null (A2's session module)
  kit = null,       // A3, or null
  crew = null,      // { id, memberIds } from A6, or null
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  emit = busEmit,   // src/core/events.js
  createClient = null, // tests pass a fake; otherwise await import('@supabase/supabase-js')
  random = Math.random,
  now = () => performance.now(),
} = {})
// returns { setPlace(placeId|null), update({x, z, facing, moving}), emote(id) -> boolean,
//           setCrew(crew|null), setKit(kit|null), stop() }
```

**When it does nothing.** If `enabled` is not exactly `true`, or `playerId`, `getAccessToken`, the URL or the key is missing, the function returns a controller whose methods do nothing. It imports nothing, connects to nothing and emits nothing.

**Starting up.**
1. Wait a random 0 to 5 s.
2. Ask for a token. If there is none, the status becomes `off`.
3. Import the library dynamically. This keeps it out of the 35 kB title budget (`scripts/check-loading.js`).
4. Call `createClient(url, key, { accessToken })`. The wrapper always returns the newest token. On null, it returns the last good token and stops everything (status `off`). On an error, it logs a warning and returns the last good token.
5. Join `live:world` with `{ private: true, presence: { key: playerId } }` and recompute everything from `presenceState()` on each `sync`.
6. After the first sync, apply the place that was asked for.

**Changing place.** `setPlace` takes the place it is given and reconciles:
1. Leave the old place room.
2. For a private place or null, only track presence.
3. Otherwise choose a room, join it, then on SUBSCRIBED track presence and queue our own position.

**Crew room.** `setCrew` joins or leaves `live:crew:<id>` (private). The module listens there but never sends. If the rules refuse the room ("Unauthorized"), it is not joined again by itself, but a later `setCrew` with the same crew knocks again (the seat may exist by then).

**When a room fails.** Statuses `CHANNEL_ERROR`, `TIMED_OUT` and an unexpected `CLOSED` are handled the same way:
1. Remove the room with `removeChannel`, which also stops the library's own retries.
2. Rejoin after the delay from section 6.
3. If the error mentions "Unauthorized", give up on that room. For the world room, the status becomes `offline`.
4. `system` messages, received with `.on('system', {}, ...)`, decide the longer waits. If they never arrive, the CLOSED status still leads to a rejoin.

**Names.** Display names are read once per session and kept. A captain that the server renames keeps the old name until the page is loaded again.

**Stopping.** `stop()` clears all timers, removes every room, and sets the status to `off`.

**Events for the screens adapter.** All payloads are plain data.

| Event | When | Payload |
|---|---|---|
| `live_status_changed` | the connection changes state | `{state}`: `connecting`, `live`, `slow`, `offline` or `off` |
| `live_presence_changed` | the shown set, a count or a name changes | `{place, room, shown: [{id, name, kit, crewmate}], hiddenCount, crew: [{id, name, place}]}` |
| `live_peer_moved` | a shown captain sends a valid position | `{id, x, z, facing, moving, everyMs}` |
| `live_peer_emoted` | a shown captain sends a valid emote | `{id, emote}` |
| `live_crew_updated` | the server sends a crew event | `{kind, data}` |

Emits are wrapped in try/catch so a listener that throws does not break the module. If `name` is null, the adapter shows "Captain".

**Wiring it into the game.** This is done later by the integrator, not in this package. INTERFACES section 7 gets these steps:

1. Start it once, after sign-in, when the flag is on.
2. Call `live.setPlace(null)` on the `travel` event and `live.setPlace(e.place)` on `arrived`. Pass null during the intro, cinematics and the `?demo=1` tour.
3. In the game loop, call `live.update({x, z, facing, moving: speed > 0.05})` every frame.
4. The adapter draws other captains with `createCharacter(art, ...)` and moves them with `glide()`.
5. Call `live.stop()` in `dispose()` and when the player signs out.

## What

- **Database:** one migration with the helper function and the 5 policies.
- **Backend:** `backend/server/crew_broadcast.py` and its tests, plus the `create_app` parameter.
- **Frontend:** the `@supabase/supabase-js` pin, `realtime.js`, its parts `live-rules.js`, `live-rooms.js`, `live-places.js`, `live-sender.js` and `live-view.js`, and their tests.
- **Docs:** listed under "Docs to change".

**Files likely to change:**

- `supabase/migrations/20261106050000_live_presence.sql` (new).
- `backend/server/crew_broadcast.py` (new) and `backend/server/tests/test_crew_broadcast.py` (new).
- `backend/server/app.py`: the `broadcaster` parameter, `app.state`, and the docstring.
- `backend/server/settings.py` and `backend/server/__init__.py`: docstrings only.
- `frontend/package.json` and `frontend/package-lock.json`: add `"@supabase/supabase-js": "2.118.0"` exactly, using `npm install --save-exact @supabase/supabase-js@2.118.0`.
- `frontend/src/online/realtime.js` (new). The coordinator: it starts and stops, holds the login token and the crew room, joins the parts together and gives the five methods. About 200 lines.
- `frontend/src/net/live-rooms.js`, `live-places.js`, `live-sender.js` and `live-view.js` (new; need the controller's OK, with `live-rules.js`). One job each: the life of a room (join, fail, wait, join again, leave, and the join allowance); the world room and our place room (who is where, what we announce); what we send, inside one allowance, and the guard; what the screens are told (who is shown, names, the messages that pass the checks). None passes about 200 lines.
- `frontend/src/net/live-rules.js` (new; needs the controller's OK). It holds the pure rules: topics, `roomLimit`, `chooseRoom`, `sendGapMs`, `estimatedLoad`, `readPosition`, `readEmote`, `readCrewEvent`, `readPresenceMeta`, `pickShown`, `glide`, `shouldSnap`, `facingFrom`, `backoffMs`, and the constants including `EMOTES` and `CREW_EVENT_KINDS`. It imports nothing that touches the network or Three.js. Fallback if not approved: one file with two marked halves, about 330 lines.
- `frontend/tests/live-rules.test.js`, `frontend/tests/realtime.test.js`, `frontend/tests/realtime-library.test.js` (the real library against a pretend server, with a fake `fetch`), `frontend/tests/realtime-startup.test.js` (stopping while the library loads) and `frontend/tests/realtime-fakes.js` (new). The fake client provides `channel`, `removeChannel`, `removeAllChannels` and `from().select().in()`. The fake room provides `on`, `subscribe`, `send`, `track`, `presenceState`, plus test triggers `status()`, `broadcast()`, `presence()` and `system()`.
- Docs (see "Docs to change").

## Out of scope

| Item | Where it goes instead |
|---|---|
| Drawing captains, the emote menu, the crew panel | Codex's adapter on the G6 branch |
| Wiring the module into `game.js` | Integration after A2 and the adapter exist |
| Calling the broadcast helper | L3, S3, S4, A6 |
| `api.js` and the session module | A2 |
| Crew routes | A6 |
| Visiting another player's home islet | later |
| Live beam angles in the finale | L3 decides; it would need a crew topic members can send into, or server pushes |
| Applying the migration and turning the flag on in production | Nils' approval |
| `vercel.json`, `docs/STATUS.md`, `ROADMAP.md`, `frontend/GRAPHICS.md`, `frontend/vite.config.js`, `.env.example`, any other file in `frontend/src/online/` | not touched |

## Tests to write first

Tests marked **must** cover what the brief listed.

**`backend/server/tests/test_crew_broadcast.py`** (httpx `MockTransport`, `FakeClock`, `asyncio.run`):

| Test | What it proves |
|---|---|
| `test_sends_one_private_message_to_the_crew_room` (must) | Exactly one POST is sent to `/realtime/v1/api/broadcast` with the exact body above, and the call returns True on 202. |
| `test_sends_the_secret_key_as_apikey_and_never_in_the_body` | The key is in the `apikey` header only. |
| `test_old_style_secret_key_also_goes_in_the_bearer_header` | It uses `build_headers`. |
| `test_sends_nothing_while_the_flag_is_off` | No request; returns False. |
| `test_sends_nothing_when_supabase_is_not_set_up` | An empty URL or key gives no request and returns False. |
| `test_returns_false_and_logs_only_the_status_when_supabase_refuses` | Parametrized over 400, 401, 403, 429, 500 and 503. The log contains no key, crew id or payload. |
| `test_returns_false_on_a_network_error_or_a_timeout` | `ConnectError` and `ReadTimeout` both return False. |
| `test_refuses_a_crew_id_that_is_not_a_uuid` | Raises `ValueError` and sends nothing. |
| `test_refuses_an_unknown_kind` | Raises `ValueError`. |
| `test_refuses_data_over_one_kilobyte` | Raises `ValueError`. |
| `test_skips_events_beyond_20_in_10_seconds_for_one_crew` | The 21st returns False; after 10 s it sends again; another crew is not affected. |
| `test_create_app_builds_a_broadcaster_from_the_settings` and `test_create_app_uses_the_broadcaster_it_is_given` | The keyword-only wiring works. |
| `test_the_event_kinds_match_the_browser_list` | Reads `CREW_EVENT_KINDS` from `frontend/src/net/live-rules.js`, as `helpers.read_check_page` does for another file. |

**`frontend/tests/live-rules.test.js`** (pure functions):

| Test | What it proves |
|---|---|
| `builds the world, place-room and crew topics`, with table cases `builds no place topic for the place ...`, `... for the room ...` and `builds no crew topic for the id ...` | Topic builders return null for bad ids. |
| `the topics that we build for the place ... fit the database rule` and the tests next to it | Reads the migration's patterns with `node:fs` and matches them against the builders' output. |
| `rooms shrink from 9 to 4 as the game fills` (must) | `roomLimit`: 1, 8 and 13 give 9; 14 gives 8; 20 gives 6; 30 and 60 give 4. |
| `the gap between updates grows as the room and the game fill` (must) | `sendGapMs`: (2,2) and (4,4) give 500; (8,8) gives 1100; (30,4) gives 2000; (30,9) gives 4500; slow mode on (4,4) gives 1000. |
| `sends nothing when alone in the room` | A room of 1 gives null. |
| `the guard estimate multiplies the room traffic by the captains online` | 3 heard plus 0.5 sent, with 30 online, gives 105, which is over 80. |
| `chooses the crewmate's room first, then the first room with space` | Crewmate in a full room; full room 1; empty place. |
| `shows at most 8 other captains, crewmates first, and counts the rest` (must) | 12 in the place with 2 crewmates: 8 shown, crew first, `hiddenCount` correct. |
| `accepts a well-formed position and rejects every malformed one` | A table of NaN, out of range, wrong facing, wrong place, a bad id, a bad `everyMs`, a negative `seq`, `v` = 2. Extra fields such as `name` are dropped. |
| `accepts only preset emotes` | |
| `accepts only known crew event kinds with small data` | |
| `reads presence metas and ignores names, logins and unknown fields` | |
| `glides from the drawn spot to the new one over the sender's gap and snaps on jumps` | |
| `turns a movement into a facing like the local character does` | |
| `waits longer after each failed join, with jitter, never more than 31 seconds` | |

**`frontend/tests/realtime.test.js`** (fakes and `vi.useFakeTimers()`):

| Test | What it proves |
|---|---|
| `does nothing when the flag is off` (must) | `createClient` is never called; the methods are no-ops; no events. |
| `does nothing when the player is not signed in` | `getAccessToken` returns null: no client. |
| `does nothing when the Supabase address or key is missing` | |
| `creates one client with the publishable key and the token function, after at most 5 seconds` | |
| `asks for a fresh token every time the library asks` (must, token refresh) | Calling `options.accessToken()` twice returns `token-1`, then `token-2`. A throwing callback returns the last good token. |
| `stops and reports off when the token disappears` (must) | |
| `joins the world room privately with the player id as presence key and tracks only v, place, room and kit` | |
| `joins a place room on arrival and leaves it on travel` (must) | Leaves `saltreach_harbor:1`, then joins `wreck_point:1`. |
| `opens no room on the home islet` | |
| `moves to the crewmate's room when both arrive at once` | |
| `never sends more than 2 updates a second` (must, throttle) | `update` every 16 ms for 3 s sends exactly 6 messages, 500 ms apart. |
| `sends nothing while standing still and one update when the captain stops` | |
| `slows down when the room and the game fill` (must, adaptive rate) | Presence with 30 online in a room of 4 gives 2000 ms gaps. |
| `answers a newcomer with one position update` | |
| `turns on slow mode when the room is too busy, and after the server says too many messages` | Rejoins no sooner than 10 s. |
| `passes only valid positions from captains in the room on as live_peer_moved` | |
| `reports at most 8 shown captains, crewmates first, with names from profiles` (must) | |
| `emotes: preset only, one every 3 seconds, sharing the update allowance` | |
| `joins the crew room privately, never sends in it, and passes server events on as live_crew_updated` | |
| `rejoins a failed room with growing waits, and forgets the failed tries after a calm minute`, and `gives up on a room the rules say it may not join, and a world room that is refused is offline` | |
| `stop leaves every room and sends nothing afterwards` | |

**Added after the independent review** (the review found them missing or too weak; each was also run against a deliberate bug in a scratch copy and caught it):

| Test | What it proves |
|---|---|
| `test_sends_at_most_five_events_a_second_over_all_crews` and three more in `test_crew_broadcast.py` | The limit over all crews (5 a second); it frees up one second after the events; skipped events are not counted in it; a refusal for one crew does not use up its allowance. |
| `test_a_slow_supabase_cannot_hold_the_call_longer_than_the_time_limit` | The whole call is bounded, not each phase. |
| `realtime-library.test.js` with a fake `fetch` | The test uses no network: the only thing fetched is the read of captain names, and the global `fetch` is blocked. |
| `joins the crew room again when the crew is set again after the rules refused it` | A refused crew room is not stuck for the rest of the session. |
| `the join allowance` (5 tests) | One join of a kind a second, also when the place or the crew changes in every frame; the latest wish wins; the three kinds take turns apart. |
| `announcing ourselves` (3 tests) | The first announcement waits up to 10 s after every join of the world room, and later changes only 1.5 s. |
| `sends nothing while the socket is closing ...` and `... a room that the library does not count as joined` | The HTTPS fallback of the library never runs. |
| `stops quietly when stop() comes while the token is still being asked for`, and `realtime-startup.test.js` | Stopping during the start leaves no client and no room. |
| `drops a replayed position` and `... emote`, `ignores the presence that a world room it has already removed still reports`, `starts afresh with a captain who left the world and came back` | The receiving checks of the review. |
| `asks for the names ... with one read`, `reads at most 50 names at a time` | The batching of name reads. |
| `waits for a longer time only once after a warning of the server` and two more | A warning of the server delays one join, once. |
| `drops an emote that was still waiting when the captain became alone in the room` | Nothing queued is sent to a room that left. |

**Policies** (must): the scratch Postgres checks L1 to L10 in Appendix B.

## Docs to change

- **`docs/INTERFACES.md`**
  - Section 7: keep the heading so existing links still work, and rewrite the content:
    - the limits table, plus the rule that each room counts as a connection;
    - the rooms table and the messages table;
    - replace the old rules, including "the server enforces it", which our server cannot do;
    - the budget formula and the cost examples;
    - the guard;
    - the events table and the wiring steps;
    - the crew broadcast and its kinds.
  - Section 4: replace "Realtime is not switched on for any table yet" with "Postgres Changes is not used; live presence rights are policies on `realtime.messages` (migration 20261106050000)".
  - Section 8: the `live_presence` row now reads "other captains live: moves, presence, emotes, crew events (Supabase Realtime)", with package A4 and without "later".
  - Section 9: replace the A4 row (it reserved a `presence` table, `POST /api/presence` and `GET /api/harbor/peers`) with the rooms, events, files and migration, marked "built, flag off, migration not applied".
  - The contract-home table at the top: add a row for live presence.
  - Section 3: add a one-line pointer to the `live_*` events.
- **`docs/ARCHITECTURE.md`**
  - Parts table: Realtime is now used.
  - Add a "Live presence" row.
  - Mermaid diagram: a `Realtime (private rooms)` node; a browser-to-Realtime edge (moves, presence, emotes; token); a dotted backend-to-Realtime edge (crew events, secret key, REST).
  - Section 3: the browser sends its own position only for showing; the server sends crew events.
  - Hosting facts: the "Allow public access off" setting, and the Realtime limits row updated with about 66 players and a link.
- **`supabase/README.md`**
  - Files table: add the new migration.
  - Project settings: add a row for Realtime "Allow public access".
  - New section "The live presence migration".
  - Who may do what: add a sub-table for the rooms on `realtime.messages`, and a function row for `live_crew_id()` (`authenticated` only).
  - Quick checks after applying: add the policy listing.
  - Manual test plan: add steps L1 to L7 (below).
  - "Changing the database later": never add `using (true)` on `realtime.messages`; add the kill-switch SQL.
- **`docs/DECISIONS.md`**: add D018, "Live presence on Supabase Realtime", before "Next entry":
  - **Status:** decided by Nils on 5 Nov 2026 (core, free, library approved); the details marked "chosen here" are proposed in this PR.
  - **Decision:** sections 1 to 6 of this spec in short.
  - **Why:** it is free, needs no new account, and reuses `is_crew_member`.
  - **Alternatives:**
    - *Cloudflare Durable Objects* on the free Workers plan, as a bigger option for later. The fan-out would run in our own code. It needs a Cloudflare account and a second deployment. Not priced in detail.
    - *Peer-to-peer WebRTC*, rejected. School and university networks often block peer connections. It needs a TURN relay, which costs money, and a signalling server. Peers also learn each other's IP addresses.
    - *Polling our API*, rejected. 30 players at 1 request a second would make 108,000 Vercel calls an hour.
    - *Postgres Changes*, rejected. Every move would be a database write.
    - *WebSockets in Vercel Functions*, rejected. The feature is in beta and limited to 300 s.
  - **Trade-offs:**
    - positions are claimed by the browser, so they are cosmetic only;
    - a flooder can shut down live presence for the whole project, which is why there is a kill switch;
    - at class scale rooms shrink to 4 and updates slow to every 2 s;
    - 2M messages a month is about 8 class sessions;
    - every signed-in player can see which place each online captain is in;
    - A2 must refresh the token.
  - **Impact:** A2 (provides the token and the player id), A6 (crew members), L3, S3 and S4 (call the helper), G6 (draws the captains).
- **`docs/ENGINEERING.md` section 7** (one row; outside the listed docs): the Realtime row says "enforce it on the server". Change it to "the client slows itself down (`live-rules.js`); our server never sees these messages, see INTERFACES section 7".

**README manual test plan, steps L1 to L7.** Run L3 after step 3 of the main plan and before step 17.

| Step | What to do | Expected result |
|---|---|---|
| L1 | `select policyname, cmd, roles from pg_policies where schemaname = 'realtime' and tablename = 'messages'` | Exactly the 5 names, all `{authenticated}`. |
| L2 | List the grants on `realtime.messages` for `anon`, `authenticated` and `service_role`. | `authenticated` has at least SELECT and INSERT (Supabase sets these, not us). If not, stop and report; do not grant anything by hand. |
| L3 | As player A (claims, plus `set_config('realtime.topic', 'live:crew:CREW_A_ID', true)`), run `select public.is_crew_member(public.live_crew_id(realtime.topic()))`. Repeat as B. | True for A, false for B. Also `live_crew_id` returns the uuid for a good topic and null for `live:crew:nope`. |
| L4 | Check the dashboard. | "Allow public access" is off. |
| L5 | Run the migration a second time. | No error, and L1 is unchanged. |
| L6 | Two GitHub accounts in one crew, plus a third in another crew, with the flag on in a preview or locally. | In Saltreach Harbor all three see each other walk, see emotes and see "+N more here". |
| L7 | Optional, for a teammate whose own `.env` holds the server key. Run the real helper once: `cd backend && uv run --env-file ../.env python -c "..."` with `FEATURE_FLAGS=live_presence`. | It prints True, and a crew member's browser logs `live_crew_updated`. Never type the key into the command itself. |

## Done when

- [ ] `cd backend && uv run pytest -q` passes everything; the result line is pasted.
- [ ] `cd backend && uv run ruff check .` prints "All checks passed!".
- [ ] `uv run ruff format --check` reports already formatted for `server/crew_broadcast.py server/app.py server/settings.py server/__init__.py server/tests/test_crew_broadcast.py`.
- [ ] The pglast parse command from ENGINEERING 4.2 step 9 prints "SQL parses: 3 file(s)".
- [ ] Scratch Postgres (Appendix B): stub, then foundation, exchange and live presence, all applied twice, then the checks. Every assertion passes and the cluster is stopped. Report the Postgres version used.
- [ ] `cd frontend && npm install --save-exact @supabase/supabase-js@2.118.0`, then `npm ls @supabase/supabase-js` shows 2.118.0 and `package.json` has no caret.
- [ ] `cd frontend && npm test` passes everything, and `npm run build` builds, with supabase-js in its own chunk that loads only on demand.
- [ ] The secret scan from ENGINEERING section 6 finds nothing in the diff.
- [ ] The changed files contain no em or en dashes.
- [ ] Nothing is committed (the controller commits).

## Steps for Nils

1. **Now:** Supabase > Realtime > Settings: switch off "Allow public access". This closes a gap that exists today, and disconnects nobody.
2. **When the screens are wired:** approve applying `20261106050000_live_presence.sql`. Claude applies it and runs the security advisor, then README steps L1 to L6 follow.
3. **For testing:** set `FEATURE_FLAGS=live_presence` on a preview or locally. Turn it on in production only when the team is happy.
4. **Weekly:** check Organization > Usage > Realtime messages and peak connections. If usage passes 1M by mid-month, keep the flag off outside class and demos.
5. **Emergency:** Realtime > Settings > "Enable Realtime service" off.

## Contracts touched

- [ ] **API endpoints:** none.
- [x] **Browser events:** `live_status_changed`, `live_presence_changed`, `live_peer_moved`, `live_peer_emoted`, `live_crew_updated`. Their home is the header comment of `realtime.js`, plus INTERFACES section 7.
- [x] **Database:** the function `live_crew_id()` and 5 policies on `realtime.messages`. The README matrix is updated.
- [x] **Shared lists:** `CREW_EVENT_KINDS` in Python and JS, kept equal by a test; `EMOTES` in JS. The flag `live_presence` keeps its name but changes meaning. No new setting.
- [ ] **Content format:** none.
- [x] **Decisions:** D018.

## Deviations and open questions

1. **World room and numbered place rooms.** These replace "one channel per place". If the controller prefers the simpler version (one room per place, presence in place rooms, no world room), the price is that a class of 30 in one place gets an update about every 15 s, a newcomer can cost up to 870 messages, and the budget cannot see how many players are online.
2. **No name in presence.** Names come from `profiles` (see section 2).
3. **`z` instead of `y`, and extra fields.** The position uses the game's own axis names, and adds `v`, `id` and `everyMs`.
4. **Crew rooms are receive-only for players.** Anything players send to each other uses place rooms. A finale feature that needs players to send to each other across places would need a new topic.
5. **The files under `frontend/src/net/`:** `live-rules.js`, `live-rooms.js`, `live-places.js`, `live-sender.js` and `live-view.js`. They are outside the listed scope but do not collide with A2's files (which go in `frontend/src/online/`). The first draft of `realtime.js` was 663 lines; the independent review asked for a split by job, and the coordinator is now about 200 lines. Can they be added?
6. **The ENGINEERING section 7 one-row fix**, and a test helper file `frontend/tests/realtime-fakes.js`.
7. **Commit the scratch SQL harness** as `supabase/tests/live_presence_checks.sql`? The default is no; its checks become README steps instead.
8. **The emote ids** belong to D006 (A2); the list here is a proposal.
9. **The integrator needs to know:**
   - A2 may also add `@supabase/supabase-js`. Both branches must pin 2.118.0, otherwise the lock file conflicts.
   - ROADMAP still lists A4 under "Later".
   - The L3 text still says the board needs no Realtime.
   - The controller owns those files.

## Risks and not verified

- **REST broadcast with the new key.** Sending with an `sb_secret_` key and `private: true` has not been tried on the live project. README step L7 checks it, and it is required before any package reduces its polling because of crew events.
- **`system` events.** Whether `.on('system')` delivers in supabase-js 2.118.0 is not verified. The CLOSED status is the fallback.
- **Grants on `realtime.messages`.** The real grants on our project are unchecked. README step L2 checks them.
- **Two conservative assumptions:**
  - presence diffs count as messages;
  - "concurrent connections" counts rooms, not sockets.
- **`realtime.topic()` in the stub.** The scratch stub imitates it by reading the `realtime.topic` setting.
- **Postgres version.** The only local Postgres is 16.2, from the uv-cached pgserver 0.1.4. The SQL used behaves the same in 16 and 17. STATUS.md says "scratch Postgres 17"; no 17 binary was found on this Mac.
- **Token refresh.** A2's token must refresh before it expires, or rooms close after about an hour.

## Appendix A: migration core

The implementer adds the full header (WHAT IT DOES, WHO USES IT, THE RULES IT KEEPS, WHAT IT NEEDS, SAFE TO RUN TWICE, HOW THE FILE IS ORGANISED) and a plain-English comment on every function and policy. The full text of each statement elided as `...` below is in section 4.

```sql
create or replace function public.live_crew_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^live:crew:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(p_topic from 11)::uuid
  end;
$$;
revoke all on function public.live_crew_id(text) from public, anon, authenticated, service_role;
grant execute on function public.live_crew_id(text) to authenticated;

drop policy if exists "Live: players can see who is online" on realtime.messages;
create policy "Live: players can see who is online"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'live:world' and realtime.messages.extension = 'presence');

drop policy if exists "Live: players can say where they are" on realtime.messages;
create policy "Live: players can say where they are"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'live:world' and realtime.messages.extension = 'presence');

drop policy if exists "Live: players can watch a place room" on realtime.messages;
create policy "Live: players can watch a place room"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
         and realtime.messages.extension = 'broadcast');

drop policy if exists "Live: players can move in a place room" on realtime.messages;
create policy "Live: players can move in a place room"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
              and realtime.messages.extension = 'broadcast');

drop policy if exists "Live: crew members can hear their crew room" on realtime.messages;
create policy "Live: crew members can hear their crew room"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and public.is_crew_member(public.live_crew_id((select realtime.topic()))));
-- No insert policy for crew rooms: only the server sends there (its key skips RLS).
```

The policies follow the Supabase docs: they use `realtime.topic()` and `extension`, and do not compare the stored row's `topic` column. That is safe because Realtime keeps no client messages in the table.

## Appendix B: scratch Postgres harness

Nothing in this harness is committed. Put all files in your scratchpad.

- **Binaries.** If no 17 is available, use `PGBIN=/Users/nilslenke/.cache/uv/archive-v0/7Z_M8pWXV3GbqINm/pgserver/pginstall/bin` (PostgreSQL 16.2; nothing to download).
- **Connection.** The scratchpad path is too long for a Unix socket on macOS, so connect over localhost TCP only.

```bash
$PGBIN/initdb -D "$S/data" -U postgres -A trust --no-locale -E UTF8
$PGBIN/pg_ctl -D "$S/data" -l "$S/log" -w -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start
$PGBIN/psql -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -f stub.sql \
  -f F.sql -f X.sql -f L.sql -f F.sql -f X.sql -f L.sql -f checks.sql
$PGBIN/pg_ctl -D "$S/data" -w stop
```

`stub.sql` contains only the parts of Supabase that our migrations need:

```sql
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text,
  private boolean default false, updated_at timestamp not null default now(),
  inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid(),
  primary key (id, inserted_at));
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as
  $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
```

`checks.sql` first seeds three players and two crews: players A, B and C; A and B in crew X (`11111111-1111-4111-8111-111111111111`), C in crew Y. It then defines two helper functions that do Realtime's own check in miniature:

```sql
create function pg_temp.can_read(p_role text, p_user text, p_topic text, p_ext text) returns boolean
language plpgsql as $$
declare seen integer;
begin
  insert into realtime.messages (topic, extension) values (p_topic, p_ext);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('realtime.topic', coalesce(p_topic, ''), true);
  perform set_config('role', p_role, true);
  select count(*) into seen from realtime.messages where topic = p_topic and extension = p_ext;
  perform set_config('role', 'none', true);
  delete from realtime.messages where topic = p_topic;
  return seen > 0;
exception when insufficient_privilege then return false;
end $$;
-- pg_temp.can_write: same settings, then insert as p_role; true if it worked, false on 42501.
```

A `do $$ ... assert ... $$` block then runs these checks:

| Check | What it asserts |
|---|---|
| L1 | `live:world`: presence can be read and written; broadcast cannot. |
| L2 | `live:place:saltreach_harbor:1` and `live:place:the_teeth:12`: broadcast can be read and written; presence cannot. |
| L3 | Bad topics are refused for read and write: `live:place:Saltreach:1`, `live:place:harbor`, `:0`, `:100`, `:1:x`, `live:place::1`, `live:places:harbor:1`, `live:world2`, `room-1`, and the empty string. |
| L4 | Crew X: A and B can read broadcast; C cannot. A cannot write broadcast or presence, and cannot read presence. |
| L5 | `live:crew:not-a-uuid`, crew X's topic plus "x", crew X's topic in upper case, and `live:crew:` are refused without any error. |
| L6 | `anon` can read nothing and write nothing in all three room kinds. |
| L7 | After B's seat is deleted, B can no longer read crew X. |
| L8 | `service_role` can write broadcast to crew X. |
| L9 | `live_crew_id` returns the right uuid, returns null for bad input and for null, and `anon` cannot execute it. |
| L10 | There are exactly 5 policies on `realtime.messages`, all with roles `{authenticated}`. |
