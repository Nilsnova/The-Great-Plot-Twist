# Privacy and play-money notice

For players of The Great Plot Twist and the course team. **student project, not legal advice**.

Last reviewed: 6 November 2026. This describes the current repository, not a check of the live providers' settings. The [data inventory](DATA-INVENTORY.md) lists every application table and column, with sources.

## What we keep and why

You can explore the local game without signing in. When you use account features, GitHub sign-in through Supabase gives the game a player ID. The public game profile uses a generated captain name, not your GitHub name or email. Supabase's own login records can still contain account details from sign-in.

The game database can keep your profile and signup time, saved progress/settings, intro outcome and awarded kit, play-coin balance and coin history, fictional market holdings/trades, crew ownership/membership and name re-roll. It also records the player ID and time of failed crew-code lookups to slow guessing; it does not store the guessed code or an IP address in that counter. These records make progress, shared crews and game rules work. The intro result stores a move count; it has no dedicated column for the complete move log. A cloud save is a flexible JSON object: do not put private messages or secrets in it.

## Who can see it

Every signed-in player can read all public profile columns: captain name, player ID and signup time. Your save, wallet, coin history, market records, re-roll and intro result have database rules limiting player reads to your own rows. Crew members can read their crew and seat details, including player IDs, kits, joining code and times. The join API uses the code to assign a seat and then returns crew details; it does not provide a separate preview before joining. Share the code only with people you intend to invite.

Visitors who are not signed in cannot read application tables directly. The game's privileged server and authorised project/database operators can access stored data. Generated names and IDs still link activity to a player; they do not make it anonymous.

## How long it stays

Most account-linked records remain until account deletion. Current progress is replaced when saved; a fictional market position disappears when fully sold. Failed-lookup counters older than the ten-minute counting window are removed on that player's next lookup, so inactive counters can last longer. There is no automatic account expiry or agreed course-end deletion date in the code.

Server memory also briefly remembers verified logins and recent trading requests. The login check is valid for up to 60 seconds; expired memory is removed lazily or when the process ends. Deletion does not explicitly clear these caches. Application errors can produce request paths and tracebacks in logs; do not assume logs are anonymous. Supabase/Vercel logs and backups follow provider settings, which were not checked for this notice. We cannot give an exact retention or backup-erasure time from this code.

## Delete my data

Contact **Nils through the course page** to ask about your data or request deletion. The server implements an account-deletion operation that requires confirmation, but this notice does not promise that a player-facing button is already available. D022 still marks deletion/audit-policy choices as pending; this notice records what the implementation does.

When the implemented deletion succeeds, it removes the Supabase login, profile, cloud save, wallet, **all coin-history rows**, fictional holdings/trades, intro result, name re-roll, failed-lookup counters and your crew seats. A shared crew you own is first passed to the other human player in the lowest seat. A crew with no other human member is removed. Other players' records remain. A timeout needs a follow-up check; it does not prove that deletion failed.

Deletion **does not** clear Supabase's own `auth.audit_log_entries` (which can contain login email, player ID and IP address), platform logs/backups, your GitHub account or provider records, local browser data, host configuration or existing process caches. Provider retention is separate. The project has not implemented an audit-log purge. Clearing browser data is a separate step; forgetting a login is not account deletion.

## Your browser

The game code sets no application cookies and has no advertising or analytics integration found in this review. Sign-in providers and hosting can use their own cookies/logs.

- Local storage keeps graphics/audio/accessibility preferences and the intro action list so the game can resume after reload. There is no expiry. Starting a new intro resets its action list; clearing this site's data removes local progress and preferences.
- An older story-storage helper can leave a local save key on a browser that used it; it is not wired to the current intro.
- The team sign-in check keeps a temporary PKCE secret in tab session storage until used, forgotten or the tab session ends.
- Login tokens stay in memory, not application cookies or local storage. Reloading or “Forget me” drops the page's token; it does not remove cloud records.

The [inventory](DATA-INVENTORY.md#login-browser-data-memory-and-logs) names the exact storage keys. The standalone privacy page itself adds no cookies, storage or API calls.

## Outside services

GitHub handles sign-in. Your browser visits GitHub and Supabase, so sign-in itself is not server-only. Supabase handles authentication and the database; the project setup chooses **Ireland**. Vercel serves pages and runs the backend, with functions configured in **Dublin**. That does not mean every provider log, backup or CDN request stays there.

Outside **data-feed calls are server-side only**:

- **Open-Meteo** receives the configured game place's coordinates and weather fields, not your device's location or player ID/token.
- **Binance** receives public instrument symbols for game prices, not your game holdings, trades or identity. It does not open a real trading account for you.
- **Finnhub** is not integrated; it was a rejected source candidate. No current calls were found.
- **Manifold** is reserved for future public question reads and is not implemented. No current calls were found. Any later feed must remain server-side and needs this notice reviewed.

Providers receiving server calls also see server network metadata. Demo/recorded fallbacks can replace live feeds. No player IDs or login tokens are part of the outside-data query parameters.

## Play money only

Coins, shares, fees, predictions and rewards are game mechanics. They have **no real monetary value**. There are **no real-money purchases**, deposits, cash-outs, exchanges for money or real prizes. A game “buy” or “fee” spends play coins only. Public market data does not make a game trade a real investment.

Questions or corrections: **Nils through the course page**.
