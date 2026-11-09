# Privacy and play-money notice

For players of The Great Plot Twist and the course team. **Student project, not legal advice.**

Reviewed on 9 November 2026 against the current repository, including browser sign-in, guest play, the class demo (class harbor and Keeper's Lock), cloud saves, crews, the case, Exchange, festival, host console and sports packages. This is not a check of live provider retention settings. The [data inventory](DATA-INVENTORY.md) gives the technical record.

## What we keep and why

You can explore and play the opening story without signing in. The connected game uses GitHub sign-in, or a sign-in code sent by email when that is switched on, for cloud saves, crews and the shared mystery. A local rehearsal does not create a live account, crew, cloud save or reward.

Connected account features use GitHub sign-in or, when switched on, a 6-digit code sent by email, both through Supabase. During the class demo, a guest can join without an account through Supabase's anonymous sign-in. A guest plays only after entering the current class code from the presenter (from the projector QR or typed under **Join**). When the code is accepted, the database records that this player was admitted (`demo_guests`: the player ID and the time, nothing else); the code itself is not stored with you. A guest gets an automatic captain name and the Stranger starter kit. In **Settings**, under **Account**, a guest can keep their progress by linking GitHub, or (when switched on) by confirming an email address with a code, on the same player. The host can run a clean-up that deletes guest accounts older than 24 hours; a guest who has linked GitHub or confirmed an email is kept. Old guest accounts are also removed automatically, a few at a time, when the host opens the host console or the projector panel. Deleting a guest account removes its admission record too. **Delete my data** works for guests at any time, also without a valid code.

The game identifies you by a player ID and a generated captain name, rather than displaying your GitHub name or email. Supabase's own login records can contain account details.

**Email sign-in.** If you sign in with an email code, Supabase stores your email address with your login and sends the code through the mail provider of this project, which receives your address and the message. The game uses the address only to sign you in. It never shows your email to other players, and your captain name stays generated. Your browser sends the address and the code only to our Supabase project, so email sign-in adds no new outside service to the browser. **Delete my data** removes the address together with the login.

The database can keep your profile, save, kit, play-coin balance and ledger, Exchange positions/events, prediction and sports stakes, duel signals/results, islet buildings, crew membership, case actions and contributions, festival reservations/queue history, and your Keeper's Lock answers (see below). Retry IDs prevent one request being applied twice. Failed crew-code lookups record player ID and time, not the guessed code or IP address. Host actions also have a private audit record. The class demo window holds only an end time and the host who switched it last. Do not put personal messages or secrets in a cloud save.

## Who can see it

Signed-in players can read public captain profiles, including player IDs and signup times. Their own saves, wallets, ledger, Exchange records, stakes and islet records have database read restrictions. Crew members can read their crew and seats, including the invitation code, kits, player IDs and times. Share crew codes privately. While Supabase anonymous sign-ins are switched on, guests count as signed-in players, so they can read public captain profiles too.

In the class harbor, everyone who joined (with the class code or the projector QR) shares one live room that shows up to 40 other captains. They see your captain name, kit, position and preset emotes. Positions and emotes are display-only. Lamp lights and friendly-duel invitations travel in that room only. The game stores none of it.

The server returns earned case information to the crew and public world information to visitors. Shared wall names identify contributing captains. Duel signals stay sealed until the rules allow a participant to see them. Festival visitors see reservation status; another player's identity or queued signals are not published. The host console requires a server-approved host account and exposes operational summaries, not login tokens or secret case content.

Visitors who are not signed in cannot read application tables directly. The privileged game server and authorised project/database operators can access stored data. Generated names and IDs still link activity to an account; they do not make it anonymous.

## How long it stays

Most account-linked records remain until account deletion. Saves replace their previous version. Closed Exchange positions and their event history remain until deletion; closing a position does not erase it. Shared crew/case/world history can outlive one player's account. Festival claims stop appearing after the 48-hour event, but event expiry does not purge its database history.

Old failed-lookup counters are removed on that player's next lookup, so the ten-minute counting window is not a retention guarantee. Server memory briefly caches verified logins and rate limits; cleanup is lazy or happens when the process ends. There is no automatic account expiry or agreed course-end deletion date in code. A guest account stays until the host runs the guest clean-up (accounts older than 24 hours, at most 100 per run) or the guest deletes it. Your Keeper's Lock answers stay until account deletion.

Application failures can log request paths and tracebacks. Supabase/Vercel logs and backups follow provider settings. We have not established a numeric retention or backup-erasure time in this notice.

## Delete my data

When signed in, open **Account and saves**, choose **Delete my data**, read the notice and choose **Confirm deletion**. If sign-in or deletion is unavailable, contact **Nils through the course page** for access or deletion help. Clearing site data or signing out does not delete an account.

Successful account deletion removes the Supabase login, profile, saves, wallet and **all of your ledger history**, together with your account-linked game rows. A shared crew you own is passed to the other human player in the lowest occupied seat. An owned crew with no other human member is removed. Other players and surviving shared case/world records remain; applicable historical actor links become empty. A timeout leaves the outcome unknown and needs a follow-up check.

Deletion does not remove Supabase's own security audit records, platform logs/backups, your GitHub account, local browser data, host configuration or existing process caches. Supabase security audit records can contain login email, player ID and IP address. The game has no audit-log purge; provider retention is separate. Verified login cache entries can remain valid on an existing server instance for up to 60 seconds after deletion.

## Your browser

The game code has no advertising or analytics integration and sets no application cookies. Sign-in providers and hosting can use their own cookies and logs.

- Local storage keeps graphics/audio/accessibility preferences and the intro action list. Starting a new intro replaces its actions; clearing this site's data removes local progress and preferences. There is no automatic expiry.
- The class demo adds a few small browser entries. Local storage keeps your quest ticks (Wave, Duel, Keeper's Lock) per captain name or device, and whether you chose the full mystery path. Tab session storage keeps the invitation to the class harbor (`plot_twist_join_v1`: the class code you scanned or typed, or the word `harbor`) and, if you used **Change place**, the place you picked (`plot_twist_lock_place_v1`: its name and coordinates) until the tab session ends or you choose **Use my area again**.
- An older story helper can leave a legacy save key on a browser that used it.
- Sign-in (GitHub, email code or guest) keeps the Supabase SDK's sign-in session, including tokens and user details returned by Supabase, in this tab's `sessionStorage`. Temporary PKCE secrets for the sign-in return are stored there too. Reloading can restore sign-in; the browser controls the tab session's lifetime and can restore it with a saved browser session.
- Sign-out or a rejected session clears the current in-memory access token and removes this game's stored sign-in session and PKCE entries when browser storage permits. Finishing or rejecting the sign-in return also removes its PKCE entries. An abandoned sign-in can leave them until sign-out or the tab session ends. These steps do not delete cloud records or local progress/preferences.
- The team's separate sign-in check temporarily keeps a PKCE secret in tab session storage until used, forgotten or the tab session ends.

The standalone help and privacy pages make no game API calls, write no storage and send no telemetry. Their external links open only when followed. Use your own browser profile on a shared device.

## Outside services

GitHub and Supabase handle sign-in, which includes browser visits to those services. For email sign-in, Supabase sends the code through the mail provider of this project; the browser connects only to Supabase. Supabase stores authentication and game data; the project setup selects **Ireland**. Vercel serves the pages and backend, with functions configured in **Dublin**. This does not guarantee that every provider log, backup or CDN request stays there.

Outside data-feed requests run on the server:

- **Open-Meteo** receives the coordinates of the game's configured weather place, and for the Keeper's Lock the rounded coordinates of your city (see the next point), plus weather fields. It does not receive your browser location or player token.
- **The Keeper's Lock** (class demo) asks about the real sky where you are. The server takes your approximate city from Vercel's IP geolocation headers (city name and coordinates; the browser's location permission is not used), or from a place you pick yourself with **Change place**. A place you pick is sent to the game server in the request address. The server sends the coordinates, rounded to 0.1 degree (about 11 km), to Open-Meteo for the weather. For **Change place**, the text you type goes to Open-Meteo's geocoding service. The place is used for that question only. The game does not save it in the database and does not write it to its own logs. Hosting logs are outside the game's control and may record request addresses. The database keeps only which sky you picked, the server's verdict and whether the lock opened. Server memory caches the weather of a rounded place for 10 minutes and a search text with its results for 24 hours.
- **Binance** receives public instrument symbols for prices, not your game holdings or identity.
- **Finnhub** is the integrated stock-price provider and receives public stock symbols, not your player ID, positions or token.
- **Manifold** supplies public prediction questions/results. Requests do not include your stakes or identity.
- **Football-Data.org** and **BALLDONTLIE** are the football/basketball feed implementations. Sports remains closed while its provider access is unavailable; recorded fixtures are explicitly labelled for local rehearsal.

Cutscene voice lines are made in advance with ElevenLabs and shipped as audio files with the game. The game does not contact ElevenLabs while you play. Providers also receive server network metadata. Recorded fallbacks can replace live feeds. Player IDs and login tokens are not added to outside-data query parameters.

## Play money only

Coins, positions, fees, predictions, sports stakes and rewards have **no real monetary value**. There are **no real-money purchases**, deposits, cash-outs or real prizes. A game fee spends play coins only. Public market data does not make a game position a real investment.

Questions or corrections: **Nils through the course page**.
