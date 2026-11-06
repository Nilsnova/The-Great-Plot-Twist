# G26 checkpoint 1 — source inventory (C1)

Responsible teammate: Nils. Branch: `docs/g26-privacy`, created from fetched `origin/main` at `c26f3032b150af970d57fbbcd6eea439eb26f4c4` on 6 November 2026. Scope: privacy documentation and a new standalone notice, without application/schema/configuration edits.

Read all five migrations and audited `backend/server/`, browser storage/authentication and D022. [DATA-INVENTORY.md](../DATA-INVENTORY.md) covers all 13 application tables and 75 current columns, including the three crew columns added later and the non-personal reference tables.

Key findings carried into the notice:

- Public profiles expose player UUID and signup time as well as the captain name to signed-in players.
- Crew-code lookup reads seat/player IDs internally for the server, not a pre-join browser preview. Members can read crew/seat columns through RLS; the API view omits player UUIDs.
- Failed-join counters contain no guessed code/IP. Their ten-minute counting window uses lazy cleanup, not a maximum retention time.
- Deletion cascades through all player-linked tables, including the complete wallet ledger; shared crews are handed over first. Auth audit records, provider/platform logs, browser data, process caches and host configuration are separate.
- Intro results keep a move count, not a complete action-log column; arbitrary cloud-save JSON must not be described as a fixed field set.
- Active public data feeds are server-side Open-Meteo/Binance. Finnhub was rejected; Manifold is reserved/unbuilt. Browser sign-in redirects to GitHub/Supabase are a separate flow.

No live database, provider retention settings, deletion or region configuration was tested. D022 still describes deletion/audit choices as pending. Documentation must not turn this into an approval or claim that a player-facing delete button exists.
