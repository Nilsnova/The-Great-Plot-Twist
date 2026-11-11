# Class demo: the whole class at Pirate Point, then one island

Used by the presenter and the three other members. This is the 5-minute class demo of the current game (the multiplayer tower defense in [TOWER-DEFENSE.md](TOWER-DEFENSE.md)): the class joins from the projector QR, defends Pirate Point together and three captains light the lamps. A 2-minute "own island" segment follows if time allows. Explain only what the deployed build does. Keep the [release checklist](RELEASE-CHECKLIST.md) beside this script.

Rewritten on Wed 11 Nov 2026 from `main` at `e9cbf5d`. It has not been run in front of a class yet: rehearse it twice on the deployed site ([OPEN-TODOS.md](OPEN-TODOS.md), section 5).

## Four roles

| Role | Who | Does |
|---|---|---|
| **Driver** | `<member 1>` | Runs the projector laptop (host account): J, the QR, the Pirate Point bell. |
| **Narrator** | `<member 2>` | Says the lines below; answers "how does it work" in one sentence each. |
| **Phone A** | `<member 3>` | The island owner for the own-island segment; a lamp volunteer if the class holds back. |
| **Phone B** | `<member 4>` | The friend who joins phone A by link; the second lamp volunteer. |

## Before class

1. **Database and flags.** The migrations up to `20261111030000_tower_defense.sql` are applied. The Vercel setting `FEATURE_FLAGS` includes `demo`, `live_presence`, `islands`, `market` and `arena`, and the site is redeployed. Check them in `/host.html` ([host console](HOST-CONSOLE.md)).
2. **The day before:** open the Supabase dashboard once, so a sleeping free project wakes up.
3. **Anonymous sign-ins** stay on in Supabase, with **anonymous sign-ins per hour** at 100 (the class shares one Wi-Fi address). Only a phone with the current class code or an island link can play as a guest.
4. **Host sign-in.** On the projector laptop, sign in with GitHub under **Settings**, then **Account**. The account must be in `HOST_PLAYER_IDS`. A guest is never a host.
5. **Today's class code.** Press **Play**, then **J**, then **New class code**. The panel shows the QR, the code (for example **HARBOR-K7QXM**) and the captain count.
6. **Phones A and B.** Signed in, each pressed **Play** once so their islands exist. Phone A has at least one cannon and 🪙 60 left for an upgrade.
7. **Test one class phone.** Scan the QR, press **Join**, and check that it lands at Pirate Point.
8. **Safety net.** A second tab with `/?demo=1&captains=40`, loaded before class (see [If something fails](#if-something-fails)).

## The five minutes

| Time | Who | Do | Say |
| --- | --- | --- | --- |
| 0:00 to 0:30 | Narrator | Projector shows Pirate Point. | "This is The Great Plot Twist: a pixel tower defense you play with friends, on real weather, real prices and real football." |
| 0:30 to 1:30 | Driver | Press **J**. The QR and the class code show. Wait for the captain count to grow. | "Scan the QR and press Join. No account. You land here, at Pirate Point, the lighthouse island." |
| 1:30 to 2:15 | Narrator | Point at the shared towers and walls. | "Anyone can build here with their own coins, and the towers stay for everyone. Stand near a cannon or a wall; tap a ship to fire your musket." |
| 2:15 to 2:30 | Driver | Press **Ring the Pirate Point bell** on the projector panel. The armada cutscene and the 10-second countdown start. | "Ten seconds. The weather is real: a storm here means more ships." |
| 2:30 to 3:45 | Narrator, phones A and B | The armada sails in. Pick three volunteers for the three lamps by the lighthouse (A and B stand by). | "Cannons cannot sink the flagship. Only the lighthouse can. Three captains, three lamps, at the same time. Hold for two seconds. Go!" |
| 3:45 to 4:30 | Narrator | All three lamps burn; the beam sinks the flagship. The loot toast pops up on every phone. | "Every phone ran the same battle from one seed. Everyone who held the line gets their own loot." |
| 4:30 to 5:00 | Driver | Open **Menu**, then **Harbor**, and read the stall list. | "You spend your loot on your own island, or win more at the Harbor. No prediction market, only play money." |

Notes:

- **Lamps fallback.** A lamp burns for 20 seconds. If volunteers hold back, the host sees **Fill missing lamps (NPC partners)** 20 seconds after the first lamp is lit.
- **One wave at a time.** While a wave runs, the bell cannot start another. Late phones join the running wave on their own.
- **Too many taps at once.** About 30 phones at once can briefly trip the Realtime guard. Ask the class to spread out.

## Own island (2 minutes, optional)

| Time | Who | Do | Say |
| --- | --- | --- | --- |
| 0:00 to 0:30 | Phone A | On its own island: open a cannon's card and press **Upgrade** (🪙 60). Build a wall. | "Prices and unlocks are checked by the server; the browser only asks." |
| 0:30 to 1:00 | Phone A, phone B | Phone A: **Menu**, then **Play with a friend**. Phone B opens the link and presses **Join**. B builds a wall with its own coins; A's screen shows it within a second. | "My friend opens the link and lands on my island. We build together, each with our own coins." |
| 1:00 to 2:00 | Phone A | Ring the bell. If phone A's best wave is 4, this is wave 5: the boss warship. Both fire muskets (F or tap). | "Every 5th wave is a boss. Both phones see the same ships; our shots reach each other's screen 200 milliseconds ahead." |

## If something fails

- **The network fails or the site is slow.** Switch to the `/?demo=1&captains=40` tab. It runs on the laptop alone and sends nothing to a server. Press **J** and choose **Ring the Pirate Point bell**, then sail to Pirate Point on the sea chart (**M**). The simulated captains defend it with you; when you hold E at a lamp, two of them light the other two. Say: "This is our offline rehearsal of the same demo." Load it before class: a dead network cannot load it.
- **On a developer laptop.** `npm run dev`, then `?islands=fake`, runs your island, the waves and Pirate Point against an in-memory fake server, up to four tabs on one island. It works only in a dev build, never on the live site.
- **A phone says the class code is not valid.** It typed an old code. Point at the projector. After 10 tries in 10 minutes a phone (or the whole Wi-Fi address) waits. If every phone fails, check the `demo` flag and anonymous sign-ins.
- **Phone B says "There is no island with that code."** Copy the link again from **Play with a friend**.
- **A friend's phone shows no ships.** Its live room was refused; reload the page ([OPEN-TODOS.md](OPEN-TODOS.md), section 7).

## After class

1. Press **New class code** if the code leaked (a photo of the QR in a group chat).
2. Old guests are removed automatically, a few at a time, when a host opens the console or the projector panel. **Clean up guests** in `/host.html` does it at once.
