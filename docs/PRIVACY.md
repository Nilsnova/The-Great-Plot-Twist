# Privacy and play-money notice

For players of The Great Plot Twist and the course team. **Student project, not legal advice.**

Reviewed on 8 November 2026 against the current repository, including browser sign-in, cloud saves, crews, the case, Exchange, festival, host console and sports packages. This is not a check of live provider retention settings. The [data inventory](DATA-INVENTORY.md) gives the technical record.

## What we keep and why

You can explore and play the opening story without signing in. The connected game uses GitHub sign-in for cloud saves, crews and the shared mystery. A local rehearsal does not create a live account, crew, cloud save or reward.

Connected account features use GitHub (or, when switched on, Google) sign-in through Supabase. During the class demo only, a guest can join without an account through Supabase's anonymous sign-in, while the host has guest play switched on. A guest gets a generated captain name and a starter kit like any player; the host deletes guest accounts that are older than 24 hours, and "Delete my data" works for guests at any time, also after guest play is switched off. The game identifies you by a player ID and a generated captain name, rather than displaying your GitHub name or email. Supabase's own login records can contain account details.

The database can keep your profile, save, kit, play-coin balance and ledger, Exchange positions/events, prediction and sports stakes, duel signals/results, islet buildings, crew membership, case actions and contributions, and festival reservations/queue history. Retry IDs prevent one request being applied twice. Failed crew-code lookups record player ID and time, not the guessed code or IP address. Host actions also have a private audit record. Do not put personal messages or secrets in a cloud save.

## Who can see it

Signed-in players can read public captain profiles, including player IDs and signup times. Their own saves, wallets, ledger, Exchange records, stakes and islet records have database read restrictions. Crew members can read their crew and seats, including the invitation code, kits, player IDs and times. Share crew codes privately.

The server returns earned case information to the crew and public world information to visitors. Shared wall names identify contributing captains. Duel signals stay sealed until the rules allow a participant to see them. Festival visitors see reservation status; another player's identity or queued signals are not published. The host console requires a server-approved host account and exposes operational summaries, not login tokens or secret case content.

Visitors who are not signed in cannot read application tables directly. The privileged game server and authorised project/database operators can access stored data. Generated names and IDs still link activity to an account; they do not make it anonymous.

## How long it stays

Most account-linked records remain until account deletion. Saves replace their previous version. Closed Exchange positions and their event history remain until deletion; closing a position does not erase it. Shared crew/case/world history can outlive one player's account. Festival claims stop appearing after the 48-hour event, but event expiry does not purge its database history.

Old failed-lookup counters are removed on that player's next lookup, so the ten-minute counting window is not a retention guarantee. Server memory briefly caches verified logins and rate limits; cleanup is lazy or happens when the process ends. There is no automatic account expiry or agreed course-end deletion date in code.

Application failures can log request paths and tracebacks. Supabase/Vercel logs and backups follow provider settings. We have not established a numeric retention or backup-erasure time in this notice.

## Delete my data

When signed in, open **Account and saves**, choose **Delete my data**, read the notice and choose **Confirm deletion**. If sign-in or deletion is unavailable, contact **Nils through the course page** for access or deletion help. Clearing site data or signing out does not delete an account.

Successful account deletion removes the Supabase login, profile, saves, wallet and **all of your ledger history**, together with your account-linked game rows. A shared crew you own is passed to the other human player in the lowest occupied seat. An owned crew with no other human member is removed. Other players and surviving shared case/world records remain; applicable historical actor links become empty. A timeout leaves the outcome unknown and needs a follow-up check.

Deletion does not remove Supabase's own security audit records, platform logs/backups, your GitHub account, local browser data, host configuration or existing process caches. Supabase security audit records can contain login email, player ID and IP address. The game has no audit-log purge; provider retention is separate. Verified login cache entries can remain valid on an existing server instance for up to 60 seconds after deletion.

## Your browser

The game code has no advertising or analytics integration and sets no application cookies. Sign-in providers and hosting can use their own cookies and logs.

- Local storage keeps graphics/audio/accessibility preferences and the intro action list. Starting a new intro replaces its actions; clearing this site's data removes local progress and preferences. There is no automatic expiry.
- An older story helper can leave a legacy save key on a browser that used it.
- GitHub sign-in keeps the Supabase SDK's sign-in session, including tokens and user details returned by Supabase, in this tab's `sessionStorage`. Temporary PKCE secrets for the sign-in return are stored there too. Reloading can restore sign-in; the browser controls the tab session's lifetime and can restore it with a saved browser session.
- Sign-out or a rejected session clears the current in-memory access token and removes this game's stored sign-in session and PKCE entries when browser storage permits. Finishing or rejecting the sign-in return also removes its PKCE entries. An abandoned sign-in can leave them until sign-out or the tab session ends. These steps do not delete cloud records or local progress/preferences.
- The team's separate sign-in check temporarily keeps a PKCE secret in tab session storage until used, forgotten or the tab session ends.

The standalone help and privacy pages make no game API calls, write no storage and send no telemetry. Their external links open only when followed. Use your own browser profile on a shared device.

## Outside services

GitHub and Supabase handle sign-in, which includes browser visits to those services. Supabase stores authentication and game data; the project setup selects **Ireland**. Vercel serves the pages and backend, with functions configured in **Dublin**. This does not guarantee that every provider log, backup or CDN request stays there.

Outside data-feed requests run on the server:

- **Open-Meteo** receives configured game-place coordinates and weather fields, not your device location or player token.
- **The Keeper's Lock** (class demo) asks about the real sky where you are. The server takes your city from Vercel's IP geolocation headers (city name and approximate coordinates, no browser location permission), or from a place you pick yourself. It sends the coordinates, rounded to about 11 km, to Open-Meteo, and a typed place search to Open-Meteo's geocoding service. The place is used for that one answer and is **never stored or logged**; the database keeps only which sky you picked and whether the lock opened. Server memory caches the weather of a rounded place for 10 minutes and a search text for 24 hours.
- **Binance** receives public instrument symbols for prices, not your game holdings or identity.
- **Finnhub** is the integrated stock-price provider and receives public stock symbols, not your player ID, positions or token.
- **Manifold** supplies public prediction questions/results. Requests do not include your stakes or identity.
- **Football-Data.org** and **BALLDONTLIE** are the football/basketball feed implementations. Sports remains closed while its provider access is unavailable; recorded fixtures are explicitly labelled for local rehearsal.

Providers also receive server network metadata. Recorded fallbacks can replace live feeds. Player IDs and login tokens are not added to outside-data query parameters.

## Play money only

Coins, positions, fees, predictions, sports stakes and rewards have **no real monetary value**. There are **no real-money purchases**, deposits, cash-outs or real prizes. A game fee spends play coins only. Public market data does not make a game position a real investment.

Questions or corrections: **Nils through the course page**.
