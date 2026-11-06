# G13: Relighting festival extras

Implementation and handover for Nils. Branch: `feat/g13-festival`. This checkpoint
is art, sound, the opt-in flag and pure rules; it does not create live services.

## Goal and current acceptance scope

- Original pixel art for twelve lamps in four states, plus claim marker, stall,
  bunting and duel ring with night variants; searchable workshop entries.
- One original festival loop and three cues, with user-initiated workshop audition.
- Pure, immutable timer, exclusive claim and FIFO pairing decisions, tested at
  boundaries and across timezone changes. No I/O, money or live duel creation.
- `festival` appears in `/api/config`, off unless explicitly listed in
  `FEATURE_FLAGS`. No new player screen, gameplay call or runtime audio is wired.

## Source and decisions

`docs/story/OPEN-WORLD.md` sections 9–10 and `CASE-FILE.md` section 14 specify
48 elapsed hours from the actual first Relighting, twelve extra lamp spots and
the Keepers' Ring at the harbor. There are no published timed subphases: content
uses `waiting`, `active`, `ended`, rather than inventing celebrations or rewards.
Double driftline materials, the unchanged sales cap, free lantern colour and
night fireworks belong to their existing owners; this checkpoint changes none.

`backend/content/festival.json` is non-secret configuration, not a new public
content endpoint. Its `festival_lamp_01`–`festival_lamp_12` IDs are G13 proposals
pending adoption of G10's actual lamp identities. No map positions or additional
lamps are placed by this checkpoint. A future caller reads the content and passes
`durationSeconds` and `lampIds` to the pure functions. Timer arithmetic is UTC;
the first Relighting timestamp must be supplied by G10, never a later crew solve.

Claims are exclusive per lamp and repeat unchanged for the same owner. The
request limits a player/lamp pair, so there is no invented one-lamp-total limit.
Claims disappear at the exact festival end. Durable action replay must be kept
separately so a repeat never extends a claim or creates another duel.

The FIFO ring function returns a **proposal**, not a duel. It requires an active
festival and `arena`, excludes active duel players, never self-pairs, and leaves
the input queue unchanged. It does not choose A7 stakes, move rules or payouts.
Future routes must check `festival` before using it. No wallet reason is added.

## Dependencies before checkpoints 2–3

As of base `c26f303`, `origin/main` has no G10 `world_state`/`GET /api/world`, A7
duel implementation, G8 CSP implementation, `frontend/HOW-IT-WORKS.md`, or R1
roadmap row. Re-fetch and merge main before the next checkpoint; adopt those
owners' files and contracts. Do not implement stand-in live APIs or persistence.

When G10/A7 land, add `GET /api/festival`, the authenticated claim/ring POSTs
with `actionUid`, atomic exclusive claims and queue pairing, and durable repeat
answers. Only then add the reserved migration
`supabase/migrations/20261106160000_festival.sql` and scratch-Postgres tests. Never
connect to live Supabase or read `.env`/secrets; Claude reviews and applies SQL.

After that, wire the timer, claim interaction and ring screens, and the strictly
local `?demo=1&festival=1` rehearsal. Gate every live screen/route with `festival`;
the query must never enable real server writes. Adopt G8's CSP/regression rules.
There is no migration, server endpoint, live queue or rehearsal mode in checkpoint 1.

## Verification commands

- `cd backend && uv run --frozen pytest` (local TestClient socket support).
- `cd backend && uv run --frozen ruff check .`.
- `cd frontend && npm test`.
- `cd frontend && npm run build` (includes the production spoiler guard).
- `cd frontend && CHROME_PATH=/usr/bin/chromium npm run test:festival` after build.
- Existing `test:art` and `test:production`, with the same `CHROME_PATH`.

`test:festival` adds a self-only CSP header to the built workshop response and
checks all new art entries, audio decode/playback, keyboard/phone layout and no
writes/external requests. It is a workshop check, not a claim that G8 or live
festival integration exists. `CAPTURE_DIR` selects an external evidence directory.
Existing browser scripts write date-stamped captures; preserve existing evidence.
