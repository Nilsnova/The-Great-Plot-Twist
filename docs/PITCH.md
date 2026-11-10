# The Great Plot Twist: the pitch

> **What this file is:** the product direction from Tue 10 Nov 2026, agreed by the team owner. It replaces the 2-hour mystery as the core of the game. The build plan and the updated task board follow in [FINAL-ROADMAP.md](FINAL-ROADMAP.md).

**In one line:** build your island, trade at the harbor, and fight the pirates with your friends, in a living pixel world that runs on the real weather, real markets and real football.

**The story, in 20 seconds (voiced intro):** the lighthouse of the Saltreach Isles has gone dark, and the pirates have noticed. Every captain gets a small island, a few coins and one job: build, trade and hold the line until the light burns again.

## Three kinds of island, one simple loop

### 1. Your island: build 🏝️

- Everyone gets their own island at the start.
- You build with 🪙 coins:
  - houses and a sawmill, which slowly earn coins and timber;
  - walls and cannons, which protect you.
- Pirates come in waves when **you** ring the bell. Each wave is a bit stronger. Your cannons fire on their own, and you can grab one and tap to fire, or patch a wall.
- Friends can sail over with your island code to defend it with you.
- Survive a wave and you win loot 🪙 plus a pirate flag for your island's flagpole.

### 2. The Harbor: trade (shared by everyone) ⚓

- The meeting place, where you see everyone online.
- All the real-world features live here, each explained in one sentence:
  - 📈 **Market stall:** "Will Bitcoin be higher in an hour? Put 10 🪙 on up or down." Real prices, no leverage jargon.
  - ⚽ **Match board:** "Who wins tonight? Pick a team." Real football results pay out.
  - 🔮 **Fortune teller:** yes/no predictions on real-world questions.
  - 🌦️ **Weather board:** the real weather at your location, and what it does to the sea (storm: more pirate ships; fog: they appear later).
  - ⚔️ **Duel ring:** challenge any captain to a quick 3-round duel in two taps.
- You earn coins here and spend them on your island.

### 3. Pirate Point: fight together (shared by everyone) 🏴‍☠️

- Once in a while the pirate armada attacks the lighthouse island, and everyone online defends it together.
- In class, everyone scans the projector QR and joins one big battle within seconds.
- Climax: three players light the three lamps at the same moment, the lighthouse beam flares up and sinks the flagship. Everyone gets the reward.

## The loop

**Earn 🪙 at the Harbor → build on your island → survive the waves → join the armada battle → build bigger.**

- Small numbers only: you start with 100 🪙, a wall costs 10, a cannon 30. No 7-digit prices, no decimals.

## Playing with friends: one idea everywhere

- **A code.** Your island has a code (for example `ISLE-K7Q2M`). Share it or show the QR, and your friend lands on your island.
- The Harbor and Pirate Point are always shared; you sail there from the sea chart.
- No crews to set up and no menus to learn.

## The first 3 minutes

1. Press **Play** and watch a 20-second voiced intro.
2. You land on your island. One card says: "Build a cannon. The pirates are coming."
3. Place your first cannon (30 of your 100 🪙).
4. Ring the bell. A tiny first wave arrives, you win, and your first 🪙 loot pops up.
5. The quest strip says "Sail to the Harbor". There you see other captains and wave to one.
6. Put 10 🪙 on a real match or price.
7. A friend joins with your code, and you defend wave 2 together.

## What we cut

- The 2-hour mystery: the prologue, journal, case board, clues, case crews, accusation and reveal. It leaves the game and the frontend now; the case server code is removed in a later cleanup; the database tables stay untouched.
- Leverage trading and every big number.
- Most menus. During play the screen keeps three things: your coins 🪙, the quest strip and a menu button.

## Decisions behind it (Tue 10 Nov 2026)

| Question | Decision |
|---|---|
| Who owns a base? | Every player has their own island; friends visit to help defend |
| When do waves come? | Players start them with the harbor bell (10 s countdown); each wave is stronger; the real weather modifies it |
| How do players fight? | Build walls and cannons between waves; during a wave towers fire on their own and players can man a cannon or repair walls |
| The class demo | The whole class defends one shared island against the armada; the three lamps light the lighthouse to sink the flagship |
| Progress | Fresh start for all when the redesign goes live: cloud saves cleared, wallets set to the new starting coins, old local progress dropped once; accounts stay |

## Why it scores well

- **Scope and ambition:** real-time multiplayer, four live data sources, a base-building economy and voiced cutscenes, far beyond a solo project.
- **UX:** one loop you can explain in one sentence, and you're playing in two clicks.
- **Demo:** the whole class fighting one pirate battle from their phones is the wow moment, and it can't be faked with a video.
