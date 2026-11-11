# Class demo: islands, then the whole class at Pirate Point

Used by Nils and the presenter. This is the five-minute class demo of the pirate game in [PITCH.md](PITCH.md): two phones defend one island together, then the whole class fights the armada at Pirate Point and three captains light the lamps. Explain only what the deployed build does. Keep the [release checklist](RELEASE-CHECKLIST.md) beside this script.

Written on Wed 11 Nov 2026 from the code on the integration branch, before the pirate game went live. It has not been run in front of a class yet: rehearse it once on the deployed site.

## Before class

Setup details are in [SETUP.md](SETUP.md), step 3c.

1. **Database and flags.** The migrations up to `20261111010000_market_calls.sql` are applied. The Vercel setting `FEATURE_FLAGS` includes `demo`, `live_presence`, `islands`, `market` and `arena`, and the site is redeployed. Check them in `/host.html` ([host console](HOST-CONSOLE.md)).
2. **Anonymous sign-ins (Nils, once).** In Supabase, **Allow anonymous sign-ins** stays on. Raise the **anonymous sign-ins per hour** limit: the whole class shares one Wi-Fi address, and the limit counts per address. Only a phone with the current class code can play as a guest.
3. **Host sign-in.** On the projector laptop, open the game and sign in with GitHub under **Settings**, then **Account**. The account must be listed in `HOST_PLAYER_IDS`. A guest is never a host.
4. **Make today's class code.** Press **Play**, then press **J** to show the projector panel. Press **New class code** and confirm. The panel shows the QR, the code in big letters (for example **HARBOR-K7QXM**) and the number of captains. A new code stops last lecture's code at once, so a photo of an old QR lets nobody in. The same button is in the **Class demo** panel of `/host.html`.
5. **Phone A (the island owner).** A teammate's phone, signed in (GitHub, email code or a class-code guest). Press **Play** once before class so the island exists and the intro is seen. It needs at least 🪙 30 for a cannon; a fresh island has 🪙 100. Mirror it to the projector, or play phone A in a second browser window on the laptop, narrowed to phone width and signed in with a second account.
6. **Phone B (the friend).** A second teammate's phone, signed in too. Visiting an island needs a signed-in captain.
7. **Test one class phone.** Scan the projector QR, press **Join**, and check that it lands at Pirate Point. If it says the class code is not valid, the QR is older than the current code: press J twice to reload it.
8. **Safety net.** Open a second tab with `/?demo=1&captains=40` and leave it loaded (see [If something fails](#if-something-fails)).

## The five minutes

| Time | Do | Say |
| --- | --- | --- |
| 0:00 to 0:30 | Show phone A on its island. Point at the 🪙 coins top left, the goals top right and the Menu button. | "Every captain gets their own island and 🪙 100. Build, survive the pirates, trade at the Harbor. That is the whole game." |
| 0:30 to 1:20 | Phone A walks to a glowing corner spot, presses E (or taps it) and builds a **Cannon** for 🪙 30. Then it walks to the bell on the beach and presses **Ring the bell**. | "A cannon costs 30 coins. Now we ring the bell. Ten seconds, then the pirates come. The weather is real: a storm here means more ships." |
| 1:20 to 2:10 | The wave sails in. The cannon fires on its own. Phone A stands at the cannon and taps a ship to fire, then patches a wall with E. The loot toast pops up. | "The cannon fires by itself. I can grab it and pick a target, and my shots hit twice as hard. Survive and you get loot: 10 plus 5 per wave." |
| 2:10 to 2:50 | Phone A walks to the cabin and opens **Invite a friend**. Phone B presses **Join** and types the `ISLE-` code, or scans the QR. Phone B lands on phone A's island. Phone A rings the bell again; both phones fight wave 2. | "My friend types my island code and lands right here. We fight the same wave: every shot and every repair shows on both phones." |
| 2:50 to 3:30 | On the laptop, press **J**. The panel shows the QR, the class code and the captain count. Wait for the count to grow. | "Now all of you. Scan the QR and press Join, or type the code. No account. You land at Pirate Point, the lighthouse island." |
| 3:30 to 4:30 | Press **Ring the Pirate Point bell** on the projector panel. The armada cutscene and the 10-second countdown start. Pick three volunteers for the three lamps by the lighthouse; everyone else mans a cannon or repairs a wall. The volunteers each hold the button (or E) for 2 seconds. When all three burn, the beam sinks the flagship. | "Cannons cannot sink the flagship. Only the lighthouse can. Three captains, three lamps, at the same time. Hold for two seconds. Go!" |
| 4:30 to 5:00 | Show the loot toast. Open **Menu**, then **Harbor**, and read the stall list. | "Everyone who held gets loot. You spend it at the Harbor: real prices, real football, real weather, each in one sentence. That is The Great Plot Twist." |

Notes for the table above:

- **Class goals.** A phone that joined with the class code shows **Wave to a captain**, **Help defend Pirate Point** and **Light a lamp**. Tap a goal for a hint. The Keeper's Lock and the friendly duel are still in the Harbor if there is time.
- **Lamps fallback.** A lamp burns for 20 seconds. If volunteers hold back, the host sees **Fill missing lamps (NPC partners)** 20 seconds after the first lamp is lit.
- **One wave at a time.** Pirate Point is one island: while a wave runs, the bell cannot start another. Late phones join the running wave on their own.
- **Too many taps at once.** About 30 phones sending at the same moment can briefly trip the Realtime guard. Ask the class to spread out over the cannons and walls rather than all tapping at once.

## If something fails

- **The network fails or the site is slow.** Switch to the tab you loaded earlier with `/?demo=1&captains=40`. This is rehearsal mode. It runs on the laptop alone and sends nothing to a server: simulated captains walk around, a practice rival answers a friendly duel, and two simulated captains help light the lamps. Say so: "This is our offline rehearsal of the same demo." `/?demo=1` alone shows 14 captains; `captains` accepts 0 to 40. Load the page before class, because a dead network cannot load it. Rehearse this tab once, so you narrate what it really shows.
- **On a developer laptop.** `npm run dev` with `?islands=fake` runs your island, the waves and Pirate Point against an in-memory fake server. It works only in a dev build, never on the live site.
- **A phone says the class code is not valid.** It typed an old or mistyped code. Point at the code on the projector. After 10 tries in 10 minutes a phone (or the whole Wi-Fi address) waits a few minutes. If every phone fails, check that the `demo` flag is on and that Supabase anonymous sign-ins are still on.
- **Phone B says "There is no island with that code."** The code was mistyped. Read it from phone A's **Invite a friend** card again; `ISLE-` must be typed.
- **The bell says a wave is running.** Wait for it to end, or press **Join the defense** on the bell card.
- **A volunteer cannot find a lamp.** Tap the goal in the quest strip for its hint. The three lamp posts stand next to the lighthouse.

## After class

1. Nothing has to be switched off. Anonymous sign-ins stay on; a new phone can only join as a guest with the current class code, and the next lecture starts with **New class code**. If the code leaked during class (for example a photo of the QR in a group chat), press **New class code** now.
2. Old guests are removed automatically, a few at a time, whenever a host opens the console or the projector panel. To do it at once, press **Clean up guests** in the **Class demo** panel of `/host.html` and tick the confirm box. It deletes anonymous guests older than 24 hours, at most 100 per press. Guests who linked GitHub or confirmed an email are kept.
3. Optional: take `demo` out of `FEATURE_FLAGS` and redeploy. Then no guest plays at all, with or without a code.

The older scripts for the mystery (the coast, the schooner and the public-name inventory) were removed on 11 Nov 2026 with the mystery itself. They are in the git history of this file.
