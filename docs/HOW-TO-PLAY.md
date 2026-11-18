# How to play The Great Plot Twist

A short guide for players. Every game is one island. Up to 10 captains defend it together against 100 waves of pirates. A narrator tells the story and introduces each new thing as it arrives.

## The loop in one line

**Fight a wave → earn 🪙 loot → build and upgrade → fight a harder wave.**

You start with 🪙 200. Coins are play money only. You cannot buy them or cash them out.

## Start a game

1. On the title screen, press **Play**. The first time, a short voiced intro and the first pages of How to play show. Skip them with the Skip button, Escape or a tap.
2. The games card opens. Choose one:
   - **Create a game.** It makes your game and its code, like `ISLE-K7Q2M`. You are the host.
   - **Join a game.** Type or paste a friend's code, or open their link. No account needed: you can play as a guest.
   - **Continue.** The games you are in, newest first, with the wave reached and who plays.
3. The **lobby** opens over the island. It shows the code, a Copy link button, a QR code and who is online.
4. The host presses **Start**. If the host is away for 60 seconds, any player can press it.

A game holds 1 to 10 players. Once you join, you stay a member until you leave. To leave a friend's game, open **Menu**, then **Leave this game**. In class, Join with the class code from the projector instead: you land in Saltreach Harbor with the class goals.

## One island, your own coins

- Everyone plays on the same island and sees the same ships.
- Every player keeps their own coins. You build and upgrade with your own coins, and the buildings stay on the island.
- Everyone who wins a wave gets their own loot.
- Your captain, crew and skills stay your own.
- In a friend's game, the chip at the top left says whose game it is, like **Nils's game · ISLE-K7Q2M**. Its **Players** button opens the lobby.

## Build

Walk up to a glowing spot (about 3 to 4 steps). A prompt shows over it: press **E**, or the **Use** button on a phone. The card shows the price and your coins. Press **Build**.

| Building | Level 1 | What it does |
|---|---|---|
| Wall | 🪙 10 | Stops pirates who come ashore. |
| Cannon | 🪙 30 | Fires at one ship on its own. |
| Mortar | 🪙 60 | Hits every ship near the impact. Not at close range. |
| Watchtower | 🪙 40 | Towers reach further. From level 3 they also hit harder. |
| House | 🪙 50 | 🪙 10 more loot per won wave. |

The island has 16 build spots. After wave 5, six more spots form an inner ring of walls around the heart. On a tower spot you choose cannon or mortar at the first build. An upgrade keeps the kind.

## Upgrade

Open a built spot's card and press **Upgrade**. Each level costs twice the one before. Pips above a building show its level: brass stars for levels 1 to 3, gold stars on teal for 4 and 5.

| Kind | Levels | Level 4 opens | Level 5 opens |
|---|---|---|---|
| Wall | 1 to 5 | after wave 12 | after wave 20 |
| Cannon | 1 to 5 | after wave 12 | after wave 20 |
| Mortar | 1 to 5 | after wave 15 | after wave 20 |
| Watchtower | 1 to 5 | after wave 15 (level 3 after wave 12) | after wave 20 |
| House | 1 to 2 | | |

Levels 4 and 5 have their own look: gold trim and the island's banner. A locked level says on its card when it opens.

## Tear down

Between waves, any player in the game can open a built spot's card and press **Tear down**. The card first shows what each player gets back: everyone who paid for the building gets half of what they paid for it (the build and the levels), rounded down. Your teammates get a message when their coins come back. The spot is empty again for everyone, and you can build anything there that is open. The heart of the island, the bell, the Harbor, the Tech hub and the wreck never come down.

## Ring the bell

The **harbor bell** stands near the south beach. Walk up to it and press **E** (or **Use**), and choose **Ring the bell**.

- A short countdown starts. Then the ships sail in.
- Towers fire on their own.
- The wave bar at the top shows the wave, the ships left and the ♥ of the island.
- **The weather is real.** A storm brings more ships. Fog hides them longer.
- **Every 5th wave is a boss wave** with a warship. A boss wave pays three times the loot, the boss wave 40 five times. From wave 41 every island wave pays half as much again.
- **Boss minigames get harder slowly after wave 10**: the target moves a little faster, the window is a little narrower and a little more must go right, up to a fixed limit at wave 100. Waves 5 and 10 play as before. The crew always shares one goal, and one captain alone can still win.
- **Loot** for a won wave *n*: 🪙 25 + 10 × *n*, plus 🪙 10 for each house. From wave 30 it grows more slowly. A lost wave pays nothing.
- A lost wave ends the run. You keep your buildings and coins. The next bell starts at your best wave minus 2.
- *Planned, not in the game yet (T38, flag `rescue`):* when the island falls from wave 4 on, the captains still on it, fallen ones too, get a 10-second **last chance**: hold to haul the treasure chest to safety. Saved, the next bell starts at your best wave minus 1 instead of minus 2. Your best wave never goes down.

## The break, Pause and Continue

After a won wave a short card shows your loot and a **break** of 8 seconds.

- Press **Next wave** when you are ready, or tick **Auto next wave** and the next wave starts by itself.
- The **×** closes the card. A small Next wave button stays under the wave bar.
- The host can press **Pause** to hold the break for everyone. Every player sees who paused. **Resume** ends the pause. If the host is away for 60 seconds, any player can pause or resume.
- You can leave at any time. The island, its buildings and the wave reached are saved. Any player can open the game again from **Continue** and ring the next wave, alone or with others.

## Your captain

You carry a musket.

- **Click** anywhere to aim and fire there. On a phone, tap where to fire.
- Press **F** to fire at the nearest ship or pirate. Hold F to keep firing. On a phone, use the musket button at the bottom right.
- Up close to a pirate on foot, F swings your **cutlass** instead.

Open **Menu**, then **Captain and skills**. There you raise your captain's level (🪙 20, 40, 80 and 160), spend skill points and buy other guns. You earn skill points by winning new waves.

## Pirates come ashore

Ships that reach the shore let **boarders** climb out. They walk to the heart of the island and attack any captain nearby.

- A standing wall stops them until they break it.
- **Legacy recovery v0:** press **E** at a damaged wall to repair it, and at a broken one to rebuild it.
- **Legacy wall recovery v0:** when a wave ends every wall is whole again (owner, 18 Nov); a wall damaged before that rule mends by itself 10 minutes later, or its card offers **Repair** or **Rebuild** for a few coins. The versioned recovery v1 preview below describes the replacement behavior for an island served with that policy.
- Your gun and your cutlass beat them.

## Structure health · recovery v1 preview

**Preview only, not a claim that recovery v1 is enabled or released.** When the server serves an island with recovery version 1, these are the intended player rules. Legacy recovery v0 remains described above.

- Damaged **walls, cannons, mortars, harpoons, culverins and swivels** show a small health bar and exact HP in the structure card. Houses and watchtowers have no structure HP and are excluded. Full-health bars and repair offers are hidden. A destroyed structure shows an empty bar, a small **!** and its broken appearance; during a reserved wave it stays inactive until a paid repair succeeds. It is whole again the moment the wave ends. Base level upgrades are available between waves.
- **When a wave ends, every wall and tower is repaired at once** (won or lost, finished or timed out; owner, 18 Nov). The break starts with everything whole: no waiting, nothing to pay between waves.
- During a wave nothing heals by itself. The card shows **Repair now: pay N coins** (three uses a wave, shared by the crew) and that everything is repaired when the wave ends.
- A successful **Repair now** restores one structure immediately. Its server-quoted price is the current level's catalogue price, independent of damage or who pays. The team shares three successful repairs per island and wave, including preparation/countdown; repairs outside the reserved wave are unlimited. Failed requests do not charge coins or use a slot.
- In recovery v1, Captain **E** structure repair/rebuild and repair-only Captain skills are removed. Carpenter hiring, the Workshop house role, **Quick Mend** and **Mason Drill** are being retired because there is no gradual repair to speed up. **Bastion** keeps +50% maximum wall HP; **Engineer** keeps the 10% construction/upgrade discount. Other crew/house abilities and Captain/Tavern healing remain. See [current implementation tasks](OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov) for review/release status.

## The heart of the island

The heart stands in the middle of the island. Its ♥ shows in the wave bar. Boarders who get past the walls attack it. When the ♥ reaches 0, the wave is lost for everyone. The inner ring of walls after wave 5 is how you guard it.

## Health, falling and helping up

- Every captain has 100 health. A small bar shows over each captain, and yours also shows under the wave bar.
- After too many hits from boarders you **fall**. You cannot walk, shoot or build. A red ring and a timer show over you.
- A teammate next to you holds **E** for 2 seconds to help you up. It costs the helper 🪙 20 + 5 for each wave number (🪙 35 at wave 3). You stand up with half your health.
- If nobody helps, you stand up at the next break.
- If every captain on the island falls, the wave is lost.

## Crew

Open **Menu**, then **Crew**. You hire crew once and keep them.

- **Gunner** (🪙 40, up to 2): your strongest tower reloads faster. After wave 3.
- **Carpenter** (legacy recovery v0 only; 🪙 30, up to 2): repairs your most damaged wall during a wave, unlocked after wave 5. New recovery-v1 hiring is being retired; full recovery happens at wave end without workers.
- **Lookout** (🪙 25, one): sees further in fog. Ships show 3 seconds earlier. After wave 8.

## What opens when

New things open when your game first **wins** a wave. A toast and the narrator say what is new. The Harbor, the wreck and the Tech hub stand on the island from the start as building sites with a sign showing the wave.

| Win wave | What opens |
|---|---|
| Start | Walls, cannons, your captain's musket |
| 1 | Captain upgrades, houses |
| 2 | Level 2, the mortar |
| 3 | The watchtower, the gunner |
| 4 | **The Harbor** and its market stall |
| 5 | Level 3, the inner ring of walls; Carpenter in legacy recovery v0 only |
| 6 | **A wreck washes ashore.** Anyone can pay into her repair. |
| 7 | The football match board at the Harbor |
| 8 | **The Tech hub**, the lookout, captain levels 4 and 5 |
| 12 | Level 4 for cannons and walls, watchtower level 3, fast raiders |
| 15 | Level 4 for mortars, watchtower level 4, tougher bosses |
| 20 | Level 5 for all four, brutes ashore |
| 30 | Iron-plated ships, and **your own ship**: the repaired wreck sails and has her own games |
| 50 | Dreadnoughts |
| 99 | The final battle is next: wave 100 |

What you may build follows the best wave won on that island, whoever pays. Your captain, crew and weapons follow your own best wave.

## The arsenal (once the team switches it on)

The arsenal is a stone armory north-west of the island's heart, between the watchtower hill and the west house. Walk up to it and press **E** (or tap it, or **Use**). Your crew shares its weapons: up to 20 stored on the rack, and every captain carries at most one.

- **Take** a stored weapon to carry it. If you carry one already, **Swap** puts yours back and takes the other in one step (this works even on a full rack).
- **Return to the rack** gives your weapon back for a crewmate. A full rack (20 of 20) cannot take it: swap instead; you keep it, nothing is lost.
- **Buy** a new copy with your own coins. It goes into your hands, or onto the rack if you already carry one. Each weapon opens after the wave shown on the card.
- Every captain always has the **musket**. The card shows each weapon's damage, range and reload for your captain level, and who carries each copy.
- Between waves only. A weapon stays with you when you reload or lose the connection.

While the arsenal is on, weapons are bought there instead of in Menu › Captain and skills.

## The Harbor

The Harbor is a building on the east beach. Walk up to it and press **E** (or **Use**).

- **Market stall** (after wave 4): will a real price go up or down in 5 minutes? Stake 🪙 5 to 10,000 with − and + or 10 %, 25 %, 50 % or All in of your coins. Right pays twice your stake. The same price gives it back.
- **Match board** (after wave 7): pick the winner of a real football match with 🪙 1 to 10,000 (at most 🪙 25,000 a day). A right pick pays twice your stake; a wrong one loses it; a called-off match gives it back.

## The Tech hub, the wreck and your ship

- **Tech hub** (after wave 8): research a skill tree once for a kind of tower, and every tower of that kind on the island can use it. Then each tower picks one skill on its upgrade card.
- **The wreck** (after wave 6): any player pays 🪙 25 or 🪙 100 into her repair, up to 🪙 500.
- **Your ship** (after wave 30, once the wreck is repaired): walk to her on the west beach and press **E**. Between waves, pick one of her games. A round lasts 20 seconds and ends with 0 to 3 stars:
  - **💥 Broadside duel:** enemy ships sail across. Fire when one is inside the gold band: in its middle is a bullseye (+2), inside it a hit (+1), a miss costs 1. The guns reload after every shot. **Space**, **F**, a click or tap on the sea, or **Fire**.
  - **🪙 Treasure dash:** steer your boat left and right to grab coins (+1) and dodge cannonballs (−2; a red arrow shows where one lands). **← →** or **A D**, drag on the sea, or hold **◀ ▶**.
  - Attempts are free. If a friend rings the bell, your unfinished boat round ends and you return to defend the island; an on-screen notice explains that no coins were spent and no reward was used. Completed rounds keep their earned coins.
  - Only the first round with at least one star pays for each game at each won wave. A later better score pays nothing extra. Each game pays coins **once per won wave**: ★ × (6 + wave ÷ 5), so ★★★ is 🪙 36 at wave 30 and 🪙 78 at wave 100. After that you can keep playing for fun until your crew wins the next wave. Every player is paid into their own wallet. Settings › **Easier finishers** widens the gold band and the catch.

## Controls

| Action | Keyboard and mouse | Touch | Standard gamepad |
|---|---|---|---|
| Walk | WASD or arrow keys | Drag the movement stick, or tap a clear spot | Left stick or D-pad |
| Use (build, ring, repair, help up) | E when the prompt shows over a building; hold E to help up | The Use button; hold the prompt to help up | A |
| Fire | Click to aim and fire, or F for the nearest target | Tap where to fire, or the musket button | No separate aim |
| Cutlass | F next to a pirate on foot | The musket button next to a pirate | No separate button |
| Close a card / pause | Escape | Close button / Menu | B in a menu; Menu closes or pauses |
| Zoom | Mouse wheel over the world | No separate zoom button | No separate zoom button |
| Whole island | Hold Tab | Not yet | Not yet |
| Menus | Tab / Shift+Tab; Enter or Space on buttons | Tap the labeled control | D-pad to focus, A to activate |

Cards open only when you stand close. A click or tap on a building from far away shows "Walk closer" next to it. During a wave a fallen teammate next to you always comes first: E helps them up, and it never opens a building.

There is one walking speed. Click or tap the game after closing another view if movement has lost focus.

## Keep your progress

A guest account is temporary: the host deletes guest accounts older than 24 hours. To keep your island and coins, open **Settings**, then **Account**, and choose **Keep progress with GitHub**. When email sign-in is on, you can also confirm your email with a 6-digit code. Your captain stays the same.

## Settings and accessibility

Open **Settings** from the Menu or the title screen. Try **Low** quality if the game runs slowly. Set master, music, effects and voice volumes separately. **Narrator** and **Narrator captions** can each be turned off. **Reduced motion: On** gives still transitions and calmer waves. **Color-blind-safe highlights** are there too.

Settings are stored in this browser. If storage is blocked, they last for this visit only. Buttons have text labels and keyboard focus. The WebGL world may not work with every assistive technology. Name the control in an accessibility report so it can be checked.

## Report a problem

Use the project's [GitHub issue form](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new) (GitHub sign-in may be needed), or tell a teammate or your class host.

Include the device and browser, what you expected, what happened and short steps to repeat it. **Do not post class codes, island codes, tokens, passwords or account details in a public issue.**

## Privacy in short

Quest ticks and settings use local browser storage. A code you visit is kept only for this tab. Guest play uses Supabase's anonymous sign-in with a class code or a game link. The account screen offers **Delete my data**, then **Confirm deletion**. It removes your own game data, including your island, coins and stakes. Read the [privacy notice](PRIVACY.md).
