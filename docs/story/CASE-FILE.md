# The Light That Shouldn't Be: case file

> **What this file is:** the complete case for one crew. It holds the premise and the question, the suspects, the eight cards with their exact text and every route to them, the four deductions, the credit rules, the Night of Three Lights, the accusation, the twist, the rewards and the Relighting switch.
>
> **Who uses it:** the four teammates and their coding agents, above all the owners of the case package (S3), the NPC partner package (S4), the map and finale-visuals packages, and whoever explains the story in the code walkthrough. The machine-readable copy is [`backend/content/secret/case.json`](../../backend/content/secret/case.json), and its format and linter rules are in [the case data section of `backend/content/README.md`](../../backend/content/README.md#the-case-data-secretcasejson-and-partnersjson). Where these files live, and why, is in [README.md](README.md#where-the-files-live).

**Spoiler warning.** This file names the culprit. The repository is public, so anyone can read it here. In the game, the culprit's name reaches only crews that solved the case.

- **Status:** approved by Nils on 5 November 2026, with the 19 decisions of the approval sheet and two scope decisions that evening (D018). Changed after the review of the same day, then folded together with his answers. Three review changes to the text of the approval sheet wait for his OK ([README.md](README.md#changes-to-the-approval-sheet-after-the-review)). Open points in section 19 say who decided each one.
- **Built from:** the story skeleton v1 that Nils approved on 5 November ("The Light That Shouldn't Be") and his five decisions of the same day: each crew plays its own copy and the first solve relights the coast for everyone; Story v2 is small edits to `story.json`; NPC partners v1 are scripted errand runners; the class demo shows highlights only; the culprit is the harbor master, with titles only. On the evening of 5 November he also approved the 19 recommendations of the approval sheet, and he decided that there is no separate demo world for now.
- **Sibling documents:** [STORY-V2-CHANGES.md](STORY-V2-CHANGES.md) (the Act 1 edits this case relies on), [NPC-PARTNERS.md](NPC-PARTNERS.md) (partner orders, minutes and kit order), [OPEN-WORLD.md](OPEN-WORLD.md) (the world beside the case, prices and fees), [TIMING.md](TIMING.md) (the simulated run behind the minutes).
- **If this file and `case.json` disagree,** the game runs `case.json`. Fix the wrong one in the same pull request.
- **What the server sends.** A crew gets only what it has earned: a card when a seat finds it, a finding when a deduction forms, the reveal after the accusation.
- **Play money only.** No coin in this case can be bought or cashed out.
- **Names** of places and companies (Saltreach, Greyfathom, Gull's Rest and the rest) are placeholders until the final name check.
- **Ids** of places, hotspots and lights are the ones in the place registry on `main` (`frontend/src/world/places/registry.js`, as the G6 merge `9f5bf97` left it), except the virtual place `anywhere` (your journal and satchel). A test keeps them equal (section 17).
- **The least to build by 23 November** is in the box at the end of [section 1](#the-minimum-for-23-november).

## Contents

1. [The case in one minute](#1-the-case-in-one-minute)
2. [Premise and question](#2-premise-and-question)
3. [Who plays: crews, seats and kits](#3-who-plays-crews-seats-and-kits)
4. [Suspects and how each is cleared](#4-suspects-and-how-each-is-cleared)
5. [The eight cards](#5-the-eight-cards)
6. [The four deductions](#6-the-four-deductions)
7. [The board and the credit rules](#7-the-board-and-the-credit-rules)
8. [The case clock](#8-the-case-clock)
9. [NPC partners in the case](#9-npc-partners-in-the-case)
10. [The Night of Three Lights](#10-the-night-of-three-lights)
11. [The accusation](#11-the-accusation)
12. [The twist reveal](#12-the-twist-reveal)
13. [Rewards](#13-rewards)
14. [The Relighting switch](#14-the-relighting-switch)
15. [Timing](#15-timing)
16. [Fair play: what Act 1 planted](#16-fair-play-what-act-1-planted)
17. [What the tests must prove](#17-what-the-tests-must-prove)
18. [Answers to the other story documents](#18-answers-to-the-other-story-documents)
19. [Open points](#19-open-points)

## 1. The case in one minute

| Question | Answer |
|---|---|
| What is the mystery? | A false light flashes the harbor alarm from open sea on fog nights, and ships that answer it wreck on the Teeth. Who sends it, and where does it hide? |
| Who did it? | The harbor master. **Plot twist: the man who answered your alarm was the one sending it.** |
| How big is it? | 8 cards (C1 to C8), 4 deductions (D1 to D4), 4 suspects, 3 lights at once in the finale, one accusation. |
| Who plays it? | One crew of four seats. Each seat holds a player or an NPC partner. Each crew plays its own copy. |
| How long? | About 120 minutes for a crew of four, Act 1 included. About 150 minutes solo with three partners. Any mix of Act 1 endings works, including four identical ones. |
| Why can nobody solve it alone? | Every deduction needs its two cards pinned by two different seats, and the finale needs three seats at three lights at the same time. |
| What does solving change? | The first solve anywhere relights the coast for everyone (the Relighting). Later crews add their names and one more light. |

### The minimum for 23 November

The full case is bigger than a beginner owner can build and explain by the freeze on Wed 18 Nov. This is the smallest version that keeps every promise in the table above. It is the first pull request of package S3 (with L3 for the board and the finale). The rest comes after submission, or when days free up.

| Build for 23 Nov | Leave for later |
|---|---|
| **8 cards with 12 routes:** the 4 `kit`, the 4 `timed` and the 4 `open` routes. The free-route results in [TIMING.md](TIMING.md) use only these routes. | The 4 paid routes, the share route, the world route and the log-reader route (7 routes). |
| **4 deductions**, the credit rules, the accusation, the reveal with its four closing lines. | The Keeper's Star, the recovered lens and the epilogue lines. |
| **The finale with three lights:** the Keeper's lamp, the Harbor Light and a home signal station. | The ruin light with its lens, and the 12 extra lamps for later crews. |
| **Rewards in coins** and the Wall of Lights, and the Relighting switch (one conditional update, locked by one server setting until the game opens, section 14.1). | The festival, the lower fees and the delisting of Greyfathom. |
| **Linter rules** L1 to L8, L10 to L12, L14, L15, L18 and L19, and the 15 tests in [section 17](#17-what-the-tests-must-prove). | L9 and L17 (the timing program already checks them). L13 and L16 follow with the paid routes and the finale geometry. |

Do not cut the finale to two lights. A two-light finale needs Nils' OK, because it changes the answer to "why nobody solves it alone". The roadmap lines that had to change to match are listed in [README.md](README.md#changes-outside-this-folder).

## 2. Premise and question

**Premise (shown when the case starts):** "Lighthouses on the Saltreach Isles keep losing their lenses. On some nights a light flashes the harbor alarm, long, short, long, from the open sea where no lighthouse stands. Ships that answer it are wrecked on the Teeth. The harbor master has posted a reward for whoever finds the light."

**Question:** "Who is the 'someone out at sea' in Elena's log, and where does the light hide?"

**What really happened (never shown before the reveal).** The harbor master runs the wrecks from a dark schooner that hides in the fog bank west of the Teeth. On fog nights it flashes the harbor alarm, the very pattern the coast trusts, and ships that come to help hit the reef. His office orders the coastguard away on those nights. Greyfathom Salvage takes the cargo and the stolen lighthouse lenses and holds them for its owner, who is the harbor master; the payments go to a pigeonhole in his own post room. The fisherman's crew carries the sealed crates for pay. The harbor master never comes ashore after dark: his night clerk keeps his window lit so the coast thinks he is home. Elena found out, wrote it on the page after "Tell the harbor master.", and the fisherman tore that page out of her desk and left it at the drop in the old watchtower, as he had been told.

## 3. Who plays: crews, seats and kits

A crew has four seats, numbered 1 to 4 (the `crews` and `crew_seats` tables of the foundation). Each seat holds a player or an NPC partner, never both. The muster fills every empty seat with a partner, so the case always runs with four seats. Partners take the kits the players lack, in the order Informant, Stranger, True Keeper, Witness (decision 12; NPC-PARTNERS.md, section 4.2 owns this order, and `partners.kit_order` in `case.json` repeats it).

The referee (package A3) turns each player's Act 1 ending into one of four kits:

| Kit (`id`) | Act 1 ended with | Starts the case at | Kit item | Coins at the start | Cheap card |
|---|---|---|---|---|---|
| True Keeper (`true_keeper`) | Warned the harbor and flashed the alarm (rescue ending) | Lighthouse Isle | Keeper's permit: opens the keepers' post room | 1,000 | C6 |
| Witness (`witness`) | Warned the harbor, then locked in | Saltreach Harbor, off the morning ferry | Words through the door: C2 is in the journal from the start | 1,000 | C2 |
| Informant (`informant`) | Trusted the fisherman, then locked in | Saltreach Harbor, off the ferry | The fisherman's red token: opens the smugglers' back room | 1,000 | C4 |
| Stranger (`stranger`) | Never decided, then locked in | Saltreach Harbor, off the ferry | A face nobody knows: the salvage yard hires people who took no side | 1,600 (1,000 + 600) | C5 |

- **Every seat carries** the brass key and the oil lantern from Act 1. All 8 end states hold both, and partners carry them too.
- **Eight entry profiles.** Each kit comes with or without the log card (did the player read Elena's log in Act 1?). The fairness rules check all eight.
- **The log card** (from Story v2, change 6) puts C8's lead on the crew board from the start: "From Elena's log: a page was torn out right after 'Tell the harbor master.' Two words still show through: 'old watchtower'." After D3, a log reader finds the torn page at once. It is not one of the eight cards and cannot be pinned. Partners never carry it. Nils decided on 5 November 2026 that it stays this small (decision 8), so the twist keeps its pace.
- **Homes.** Every player has a home islet, a True Keeper too (OPEN-WORLD.md, section 5.1). A True Keeper starts the case on Lighthouse Isle and keeps the flavour line "Maybe the light should be yours now.", but builds on their islet like everyone else. So every crew can build the third light, whatever the mix of endings. This is a review change that waits for Nils' OK ([README.md](README.md#changes-to-the-approval-sheet-after-the-review)): the approval sheet's kit table said "Lighthouse Isle, now home".
- **Coins at the start** follow OPEN-WORLD.md (section 6.1). The entry-kit package is the source of truth; the linter compares once `backend/content/entry_kits.json` exists (package A3, decision D016).

## 4. Suspects and how each is cleared

Titles only. Elena is the only named character, and she is not a suspect.

| Suspect (`id`) | Why players look at them | Cleared by | What a wrong accusation shows |
|---|---|---|---|
| The fisherman in the yellow coat (`fisherman`) | The man with the red boat. Elena's log says not to trust him, and she told you he uses her light to guide the smugglers in. In the rescue ending the coastguard took him, yet he is free again. | D2 | "Refused. D2: the crates carry the Harbor Office seal, and the fisherman only carries them for pay. He is a smuggler, not the captain." |
| The salvage foreman (`salvage_foreman`) | Runs Greyfathom's yard at Wreck Point and buys whatever the wrecks leave behind. | D3 | "Refused. D3: the lenses are held for an owner whose post goes to the Harbor Office. The foreman only runs the yard." |
| The coastguard commander (`coastguard_commander`) | Commands the cutter at the harbor's signal station. On the wreck nights, nobody answered the alarm. | D4 | "Refused. D4: on every wreck night, Harbor Office orders sent the cutter away. The commander obeyed and wrote it down." |
| The harbor master (`harbor_master`) | Hardly anyone suspects him. He runs the Harbor Office, posted the reward, and Elena's log says to tell him. Nobody has met him face to face, only his lit window across the bay. | Never | The twist (section 12) |

**Continuity line at the harbor jail** (for every player who has not solved): "The harbor jail's only cell is empty. A release order is pinned to the door: 'Release the fisherman. By order of the Harbor Office.' It is stamped with a small seal: an anchor with an open eye." It explains why the fisherman is free after the rescue ending, and it is one more fair hint.

The twist does not rest on who: by the end three suspects are cleared, and players may guess. It rests on how: the light used the alarm everyone trusted, and it was sent by the man Elena told them to trust.

## 5. The eight cards

Four cards are open to every kit. Four are cheap for one kit and slower for the others: they cost coins, or they wait for a window on the case clock (low tide is one), or, for C6 only, a Greyfathom share.

### 5.1 At a glance

Minutes are planning estimates for a first-time player who sets off from Saltreach Harbor: 1 minute to cross (a crossing takes about 4 to 6 seconds, up to 15 in fog or storm, OPEN-WORLD.md 5.2), 2 minutes to find the spot, the route's timer, and 1 minute to read. A True Keeper starts on Lighthouse Isle and adds 1 minute for the first crossing. Partners always take 10 case minutes per fetch plus 5 to pin, and the pin is a second order (NPC-PARTNERS.md). **Bold** marks the cheap route.

| Card | True Keeper | Witness | Informant | Stranger |
|---|---|---|---|---|
| **C1** The reward notice (open) | Notice board: free, 3 | Same | Same | Same |
| **C2** Fog nights only (Witness) | Ferry office: free in the ferry window, 6 plus up to 15 waiting; or 150 coins, 6 | **In the journal from the start: 1** | As the True Keeper | As the True Keeper |
| **C3** The seal on your key (open) | Your satchel: free, 1 | Same | Same | Same |
| **C4** Sealed crates (Informant) | Low-tide cave: free at low tide, 9 plus up to 12 waiting; or the doorman, 200 coins, 12 | As the True Keeper | **Back room with the red token: free, 9** | As the True Keeper |
| **C5** Greyfathom's manifest (Stranger), after D2 | Yard gate: free from the shift change, 19 plus up to 12 waiting; or the dockhand, 250 coins, 22 | As the True Keeper | As the True Keeper | **A salvage-yard shift: free, 19** |
| **C6** The owner's post (True Keeper), after D2 | **Post room with the keeper's permit: free, 3** | Harbor Office counter: free in the mail-boat window, 6 plus up to 15 waiting; or the clerk, 200 coins, 6; or a Greyfathom share, 6 | As the Witness | As the Witness |
| **C7** The coastguard night log (open) | Signal station: free, 3 | Same | Same | Same |
| **C8** The torn page (open), after D3 | Watchtower ruin: free, 9 (a log reader: 4) | Same | Same | Same |

Every card has a free route for every kit. Coins only buy time. The case needs no coins at all except one building for the finale (section 10).

### 5.2 Windows on the case clock

A timed route can start only while its window is open. Every window repeats every 20 case minutes. The server works it out from the minute; nothing runs in the background.

| Window (`id`) | Open in each 20 minutes | Longest wait | Used by | What a player sees while it is shut |
|---|---|---|---|---|
| Low tide (`low_tide`) | minutes 12 to 19 | 12 minutes | C4 cave | "The cave mouth is under water. It opens at low tide, in {minutes} minutes." |
| Ferry in (`ferry_in`) | minutes 10 to 14 | 15 minutes | C2 ferry log | "The ferry is out, and the clerk with it. It comes back in {minutes} minutes." |
| Mail boat (`mail_boat`) | minutes 15 to 19 | 15 minutes | C6 mail sorting | "The mail boat is not in yet. It docks in {minutes} minutes." |
| Shift change (`shift_change`) | minutes 0 to 7 (8 wide since decision 13) | 12 minutes | C5 yard gate | "The gate is shut while the shift works. The next change of shift is in {minutes} minutes." |

This tide is the case's own. It does not follow the open world's weather or any real tide.

### 5.3 Card by card

Each card has one exact text that players read, whichever route found it, plus one found line for the route. A timer counts case minutes from starting the route until the card lands in the seat's journal; the seat may do other things meanwhile.

#### C1. The reward notice (open, part of D1)

> REWARD. On some nights a light flashes the harbor alarm, long, short, long, from the open sea west of the Teeth. No lighthouse stands there, and none ever has. Ships that answer it are lost on the reef. Whoever finds the light will be paid from the harbor purse. Report to the Harbor Office. By order of the harbor master.

- **Found at:** Saltreach Harbor, the notice board outside the Harbor Office.
- **Open from the start.** Lead on the board: "The harbor master has posted a notice about a strange light."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C1.notice_board` | Every seat | Free | 0 | 3 | "The notice is nailed to the board outside the Harbor Office. The ink is still fresh." |

The culprit posts the reward for finding his own light. It reads as civic duty now and as irony after the twist.

#### C2. Fog nights only (cheap for the Witness, part of D1)

> All three wrecks this season happened on nights of thick fog. They are the three nights Elena circled in her tide tables. On clear nights, nobody has seen the light.

- **Found at:** the Witness's journal (a memory from Act 1), or Saltreach Harbor, the ferry pier (`ferry_pier`).
- **Open from the start.** Lead: "Someone knows which nights the ships were lost."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C2.radio_words` | Witness seats, in the journal from minute 0 | Free | 0 | 1 | "You remember the locked tower door. On the stairs below, the fisherman talked into a radio: 'No fog tonight. We wait for the next one.'" |
| `C2.ferry_log_timed` | Every seat | Free, only in the ferry window | 3 | 6, plus up to 15 waiting | "The ferry is in, so the clerk has time for you. The sailing log shows crossings cancelled for fog on all three wreck nights." |
| `C2.ferry_log_paid` | Every seat | 150 coins | 3 | 6 | "The ferry clerk copies the sailing log for 150 coins. Crossings were cancelled for fog on all three wreck nights." |

The radio words are the Witness ending note from Story v2 (change 3), word for word. A Witness partner starts with C2 in its satchel and only needs a pin order.

#### C3. The seal on your key (open, part of D2)

> The tag on your brass key reads TOWER DOOR. It is stamped with a small seal: an anchor with an open eye. Held to the lantern, tiny letters show under the seal: CUT AND SEALED BY THE HARBOR OFFICE.

- **Found at:** your own satchel, wherever you are (inspect the brass key).
- **Open from the start.** Lead: "Look closely at the key you carry."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C3.key_tag` | Every seat (everyone holds the key) | Free | 0 | 1 | "You hold the tag to your lantern and turn it until the light catches the brass." |

Story v2 (changes 7 and 8) already shows the seal in Act 1. The case adds the tiny letters that tie it to the Harbor Office.

#### C4. Sealed crates (cheap for the Informant, part of D2)

> Crates from the wrecks. Every lid is stamped with a seal: an anchor with an open eye. Chalked on each lid is the smugglers' rule: 'Carry only. Never open. Paid per crate.'

- **Found at:** Smugglers' Cove (the back room with its doorman, and the low-tide cave), or the player's own driftline beach.
- **Open from the start.** Lead: "The smugglers at the cove are moving crates."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C4.back_room` | Informant seats (the red token) | Free | 5 | 9 | "You show the fisherman's red token. The doorman sends a boy for the tally man, and you wait by the fire until he lets you into the back room." |
| `C4.low_tide_cave` | Every seat | Free, only at low tide | 5 | 9, plus up to 12 waiting | "At low tide you wade into the cave under the cove, your lantern held high. The crates are stacked above the waterline." |
| `C4.doorman_paid` | Every seat | 200 coins | 8 | 12 | "The doorman counts your 200 coins twice, then makes you wait until the back room is empty. You get one look." |
| `C4.beach_crate` | Players only | A sealed crate on your beach, the morning after a real fog night, before the first solve (OPEN-WORLD.md 5.3) | 2 | 6 | "A sealed crate has washed up on your beach after the fog. The chalk on its lid is still readable." |

The beach crate links the open world to the case. It depends on real weather, so it never counts toward solvability.

#### C5. Greyfathom's manifest (cheap for the Stranger, part of D3)

> MANIFEST, Greyfathom Salvage, Wreck Point. Taken from the wrecks on the Teeth this season: 12 lighthouse lenses, crated and sealed. Not for sale. Hold for the owner. At the bottom, in chalk: a small drawing of a tower.

- **Found at:** Wreck Point (the salvage yard with its gate, and the wreck beach).
- **Opens after D2.** Lead: "Greyfathom's yard keeps a record of what the wrecks bring in." Before D2 the yard says: "The yard is busy with crates. You do not know what to ask about yet."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C5.yard_shift` | Stranger seats | Free | 15 | 19 | "Nobody on this coast knows your face, so the foreman hires you for a shift and asks no questions. When it ends, the manifest lies open in the yard office." |
| `C5.yard_gate_timed` | Every seat | Free, start at the shift change | 15 | 19, plus up to 12 waiting | "You start waiting at the change of shift and sit out the whole shift by the gate. When it ends, the foreman pins the new manifest to it." |
| `C5.dockhand_paid` | Every seat | 250 coins | 18 | 22 | "A dockhand on the beach takes 250 coins and makes you wait while he copies the manifest by hand." |

Ships do not carry lighthouse lenses. Twelve of them "from the wrecks" is the odd fact players should notice. The number twelve returns in the last beat of the reveal.

#### C6. The owner's post (cheap for the True Keeper, part of D3)

> The Harbor Office keeps a pigeonhole stamped with the seal, an anchor with an open eye. It is labelled GREYFATHOM SALVAGE, OWNER. In it lies a payment slip for every wreck this season, each marked with a small chalk tower.

- **Found at:** Saltreach Harbor (the Harbor Office, with its counter and the keepers' post room behind it, and the market hall).
- **Opens after D2.** Lead: "Someone collects Greyfathom's post." Before D2: "The Harbor Office is busy. You do not know what to look for yet."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C6.back_room` | True Keeper seats (the keeper's permit) | Free | 0 | 3 | "Your keeper's permit opens the post room behind the Harbor Office. Your own pigeonhole is empty. The one next to it is not." |
| `C6.mail_boat_timed` | Every seat | Free, only in the mail-boat window | 3 | 6, plus up to 15 waiting | "The mail boat is in. You watch the clerk sort the post: one bundle goes to the back, into a pigeonhole stamped with the seal." |
| `C6.clerk_paid` | Every seat | 200 coins | 3 | 6 | "The day clerk pockets 200 coins and lets you look through the post rack while he counts them." |
| `C6.shareholder_register` | Players only | Hold one Greyfathom share; needs the `market` flag | 3 | 6 | "As a Greyfathom shareholder you may read the register. The owner's post goes to the Harbor Office, with a payment for every wreck." |

The share is one unit of Greyfathom Salvage (ticker GREY), bought on the Island Exchange at its price: between 5.00 and 80.00 coins a unit, plus the 2% fee (D017, OPEN-WORLD.md 7.7). Holding one unit opens the register. If the Exchange is cut from the build, drop the share route and nothing else changes. If Greyfathom is delisted at the first solve (should, section 14), only the share route closes.

#### C7. The coastguard night log (open, part of D4)

> The coastguard's night log. On each of the three wreck nights, the same entry: 'Alarm seen at sea. Cutter ordered to the far side of the isles by the Harbor Office. Unable to answer.'

- **Found at:** Saltreach Harbor, the coastguard's signal station.
- **Open from the start.** Lead: "The coastguard writes down every alarm."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C7.night_log` | Every seat | Free | 0 | 3 | "The coastguard commander opens the night log for you at the signal station. 'We answer every alarm we are allowed to.'" |

#### C8. The torn page (open, part of D4)

> A page torn from Elena's logbook, the one after 'Tell the harbor master.' In her shaking hand: 'I was wrong to trust the office. He never comes ashore after dark. His window is a lie: his night clerk keeps the lamp burning. The lenses go to the old watchtower.' Across the top, in another hand: 'Found in her desk. Left at the drop, as you asked.'

- **Found at:** the Teeth, the old watchtower ruin. The brass key opens its rusted door; the lantern lights the dark inside.
- **Opens after D3** (D3 shows the chalk tower that marks the drop). Lead: "Something is hidden in the old watchtower on the Teeth." A log reader's crew sees this lead from the start. Before D3 the ruin says: "Rain blows through the old watchtower. The walls are full of loose stones, and you do not know which one to try yet."

| Route | Who | Cost or condition | Timer | Minutes | Found line |
|---|---|---|---|---|---|
| `C8.ruin` | Every seat | Free | 5 | 9 | "Your brass key opens the rusted door of the old tower. Inside, one stone is marked with the chalk tower. Behind it is the drop, and among the payment slips lies a page, damp but readable." |
| `C8.log_reader` | Players whose profile read the log | Free | 0 | 4 | "You know Elena's missing page is somewhere in the drop, so you go straight to it." |

This page answers Act 1's open question: Elena wrote "Tell the harbor master." before she knew better, and the next page says so. The second hand is the fisherman's: he tore the page out of her desk and left it at the drop for his boss. It is also where every crew first meets the night clerk, a title only, who keeps the lit window burning. Every crew holds C8 before it can accuse, so the clerk in the reveal (section 12) is planted fairly. Nils decided on 5 November 2026 to keep the clerk (decision 5).

## 6. The four deductions

A deduction forms when a player pairs its two cards on the board and the two cards were pinned by two different seats.

| Deduction | Cards | Finding (shown to the whole crew) | Clears | Opens |
|---|---|---|---|---|
| **D1 Where** | C1 + C2 | "The light shows only on fog nights, and where no lighthouse stands. So it is no lighthouse. It is a ship that hides in the fog bank west of the Teeth and flashes the harbor alarm." | nobody | Nightfall: "Your crew can now call nightfall and hunt the light." |
| **D2 The seal** | C3 + C4 | "The crates from the wrecks carry the seal that is on every keeper's key: the seal of the Harbor Office. The smugglers only carry the crates, for pay." | The fisherman: "This clears the fisherman: he is a smuggler, but not the one with the light." | C5 and C6: "Follow the money: Greyfathom's manifest and the Harbor Office post can now be found." |
| **D3 The money** | C5 + C6 | "Greyfathom holds twelve stolen lighthouse lenses for its owner, and the owner's post, a slip for every wreck, goes to the Harbor Office. The wrecks pay someone in the office, not the yard. Both papers carry the same chalk tower, and only one tower on this coast has no keeper: the old watchtower on the Teeth." | The salvage foreman: "This clears the salvage foreman: the foreman only runs the yard." | C8: "The watchtower ruin on the Teeth can now be searched." With the optional ruin light (should), the line ends "..., and relit with a lens." |
| **D4 The signal** | C7 + C8 | "On every wreck night, Harbor Office orders sent the coastguard away. And the lit window across the bay is a decoy: whoever it belongs to is out at sea after dark." | The coastguard commander: "This clears the coastguard commander: the commander only followed orders." | The accusation: "With D2, D3 and D4 on the board, your crew can make an accusation once the schooner is found." |

The gates keep the story in order: D2 opens the money trail, D3 opens the ruin, and the page that unmasks the window comes last. D1 opens the night at any time, so a crew may hunt the light early, but it can accuse only with D2, D3 and D4.

## 7. The board and the credit rules

1. **Finding.** A seat that takes a route gets the card in its own journal (a partner: in its satchel). Other seats can read it, but only the seat that holds it can pin it.
2. **Pinning.** A player pins from the journal, wherever they are, at once. A partner's pin takes 5 case minutes (NPC-PARTNERS.md). Several seats may pin the same card, and every pin is kept with its seat number.
3. **Pairing.** Only a player pairs: drag one pinned card onto another. The server accepts when the two cards form a deduction and **two different seats** pinned them. **NPC partners count as seats**, so a partner's pin and a player's pin make a valid pair.
4. **Refusals change nothing.** A pair that is not a deduction gets "These two cards do not fit together." and the crew waits 30 seconds before the next try ("Give it a moment. Your crew can try another pair in 30 seconds."). A pair with a card that is not pinned gets "Pin both cards on the board first." A pair pinned by one seat only gets "One seat pinned both cards. A different seat must pin one of them too." Partners never pair cards.
5. **Credit.** A player is **part of a deduction** if they pinned one of its two cards, or ordered a partner's pin of it, before the deduction formed. (Nils decided on 5 November 2026 that a partner's pin pays the player who ordered it, decision 9.) A **finale role** goes to each player who made one of the three locks that parted the fog (a lock aimed for a partner's light counts for the player who aimed it) and to the player whose accusation was accepted.
6. **Taking over a seat.** When a friend takes a partner's seat with the crew code, the seat's pins stay on the board (NPC-PARTNERS.md, section 7). The friend earns only for what they do after joining.

## 8. The case clock

- Each crew has its own case clock. It starts at minute 0 when the muster ends, and it counts whole case minutes.
- The crew model (a separate spec) decides how the clock moves, for example whether it pauses while nobody in the crew is online. The case only reads it.
- Nothing runs in the background. Timers, windows, nights, lock lengths and waits are stored as minutes or timestamps and worked out when someone asks, as F0 and Vercel Hobby require.
- Waits in the case: route timers (0 to 18 minutes), the four windows (section 5.2), the night (up to 20 minutes), dawn (3 minutes), a wrong pair (30 seconds), a wrong accusation (60 seconds).

## 9. NPC partners in the case

Partners are scripted errand runners (decision 3). NPC-PARTNERS.md owns their rules; this is what the case needs from them.

| Topic | In the case |
|---|---|
| Which kit | The kits the players lack, in the order Informant, Stranger, True Keeper, Witness (NPC-PARTNERS.md, section 4.2). Alone you get the three kits you lack. |
| What they can fetch | Any card that is open (a lead), by the cheapest route they may use: their own kit route, open routes and timed routes (the window must be open when they arrive, 4 minutes after the order). Paid routes only when the order says `allowPaid` (decision 11; NPC-PARTNERS.md, section 5.4), charged to the player who gave the order. Never share, world or log-reader routes. |
| How long | 10 case minutes per fetch, 5 per pin, whatever the route's own timer. A pin is an order of its own. |
| A Witness partner | Starts with C2 in its satchel and needs only a pin order. |
| Lights | They may man the Keeper's lamp (`keepers_lamp`) and the Harbor Light (`harbor_light`) (`partners_may_man`). A home signal station (`islet_signal_station`) and the relit ruin (`ruin_light`) need a player. |
| Never | Pair cards, accuse, call nightfall, aim a beam, hold shares, craft a lens, give hints, speak with an AI voice. |
| Words | Every partner line is in `backend/content/partners.json`, including one found line and one pinned line per card. The skeleton's line "Same seal on the crates. Pinning it." is C4's pinned line. |

**Solo, in one picture.** You sail with three partners. They fetch the three kit cards you lack, pin them, and on the night man the Keeper's lamp and the Harbor Light. You explore, read, pair every deduction, build and man the third light, aim all three beams, lock them one after another and accuse.

## 10. The Night of Three Lights

### 10.1 When and how long

- Once D1 is solved, any player may call nightfall (decision 7). The clock never calls it by itself, so a crew is never dragged into the night before it is ready. Before D1 the button says: "Nobody knows what to hunt for yet. Solve D1 first."
- A case night is always a fog night for that crew: its own fog bank and false light, drawn for that crew only. Nobody waits for real fog.
- A night lasts at most 20 case minutes. A prepared crew needs about 15. The rules alone need 4 minutes for three or four players, 12 for two players and 14 for one (TIMING.md, section 4.2).
- Nightfall line: "Night falls on your crew's chart. Fog rolls in from the west, and far out past the Teeth a light starts to flash: long, short, long."

### 10.2 The lights

Three of these four kinds must be lit at once, by three different seats. Positions are on the 448 by 256 sea chart (section 10.7).

| Light (`id`) | Where | Ready | Who may man it | Cost | Chart position | Bearing to the fog's centre |
|---|---|---|---|---|---|---|
| The Keeper's lamp (`keepers_lamp`) | Lighthouse Isle, the zone `keepers_lamp` in the lamp room above the tower door | From the start | Any seat, partners too. Every seat's brass key opens the tower door. A True Keeper starts here. | Free | 95.5, 168.75 | 50 degrees |
| The Harbor Light (`harbor_light`) | Saltreach Harbor | From the start | Any seat, partners too | Free | 221.5, 156.83 | 14 degrees |
| A home signal station (`islet_signal_station`) | A player's home islet | Once a level 1 signal station stands there | Players of the crew only | 300 coins and 10 timber (the building) | 302, 193.18 | 341 degrees |
| The old watchtower (`ruin_light`), an extra (tier should) | The Teeth | Once a player fits a lens in the ruin, which needs D3. The lens is made at a level 1 workshop on `plot_2` of their home islet (3 minutes), and may be made before D3. Fitting it takes 2 minutes (decision 14) | Players of the crew only | 300 coins and 10 timber (the workshop) | 362.5, 60.75 | 280 degrees |

- **Every crew builds one light for the finale** (decision 6). The two public lights are always there, so the third is a home signal station. Every player has a home islet, a True Keeper too, so every mix can build one. The sheet's finale said "a signal station, or the watchtower ruin relit with a lens"; making the station the third light is a second review change that waits for Nils' OK ([README.md](README.md#changes-to-the-approval-sheet-after-the-review)). The muster reminds the crew: "Your crew will need a third light for the night. Build a signal station on your home islet."
- **The ruin light is an extra,** not part of the 23 Nov minimum and not needed by any crew. Its data stays in `case.json` so it can come back later. A crew that builds a workshop and fits a lens may use it instead of a station. Nils decided on 5 November 2026 that a lens can be made before D3 and only fitting it waits for D3 (decision 14).
- **Every mix can afford it.** A level 1 building costs 300 coins and 10 timber, every new player gets 20 timber once, and every kit starts with at least 1,000 coins (OPEN-WORLD.md 5.1 and 6.1).
- **A crew counts one home station.** All home islets share one chart position (the registry has a single home islet), so a second station would add no new bearing.

### 10.3 Taking a post

- A seat mans a light after nightfall. One seat per light, one light per seat.
- A player sails there (seconds) and climbs: 1 minute. On post: "You light {light} and swing its beam out over the fog."
- A partner takes a man-a-light order: 10 case minutes (NPC-PARTNERS.md). The light is reserved from the moment the order is accepted, and the partner is on post when the 10 minutes are over.
- A player may sail to a light's island before nightfall, so only the climb is left once night falls.

### 10.4 Aiming a beam

- Each manned light shows a flat gold beam: a wedge 10 degrees wide, drawn on the chart. A light that a partner order has reserved shows its beam at once, so a player can aim it while the partner is still sailing.
- The false light flashes long, short, long as a soft gold glow in the fog bank. The brightest point of the glow is the hidden schooner.
- A player drags the beam around its light with the mouse, or turns it with the arrow keys (1 degree a press, 5 with Shift), until the glow sits inside the wedge, then presses **Lock**.
- **Aiming happens in the browser and costs no request.** The browser keeps each beam's bearing. Lock sends that bearing to the server (`POST /api/finale/signal {light, bearing, actionUid}`).
- **A beam stays where it was aimed** after its lock ends or is refused. Pressing Lock again re-sends the same bearing. So one player can aim every beam first and then lock them one after another, as long as all three locks fall inside the 90 seconds of section 10.5.
- **A lock is accepted only when a seat is on post** at that light: a player has climbed, or a partner has arrived. Before that the answer is "Nobody is at that light yet." and nothing changes.
- Only players aim. A player can aim and lock a beam for a light a partner holds, from their own screen.

### 10.5 Tolerance and the time window

- **Tolerance:** the server accepts a lock when the beam's centre line is within **5 degrees** of the true bearing from that light to the schooner. So "the glow inside the wedge" is exactly the rule.
- **Bearing:** compass degrees, 0 is north and 90 is east. `bearing = atan2(dx, dy)` in degrees, then modulo 360, where dx is how far east and dy how far north the schooner lies from the light. On the chart y grows to the south, so dy is the light's y minus the schooner's y. The server keeps the schooner's position, and the browser gets it only when the fog parts.
- **Off target:** "The beam sweeps empty fog." Nothing changes, and that light can lock again after 5 seconds.
- **On target:** "Beam locked on the flashing light. It holds for 90 seconds." A lock ends after **90 seconds**, or as soon as the seat at that light leaves it.
- **The fog parts** the moment three accepted locks from three different seats at three different lights hold at the same time: "Three beams cross in the fog. Where they meet, the fog thins, and a dark schooner rides at anchor with its lamp shuttered." The schooner stays revealed for this crew. So the last of the three locks must be accepted less than 90 seconds after the first.
- **One player can hold several locks.** A solo player locks three beams one after another. Three presses of about 10 seconds each take about 30 seconds (45 at first-time pace), well inside the 90. The timing program checks this (TIMING.md, section 4.2).

### 10.6 If it fails

If the night ends first: "Dawn breaks, and the fog keeps its secret. Your crew can call nightfall again in 3 minutes." Locks clear. Cards, deductions, buildings and lenses stay. There is no coin cost and no limit on tries.

### 10.7 Chart geometry

- The sea chart is 448 by 256 units, the native pixels of the chart in the game (`frontend/GRAPHICS.md`). x grows to the east and y to the south, so north is up. Light positions are copied from the place registry (`frontend/src/world/places/registry.js`): the place's chart position plus half the light's beam origin, with the vertical part flipped. A test keeps the two equal (section 17). The server needs the positions to check bearings, and the registry stays in the browser (D016), so `case.json` holds its own copy.
- The fog bank sits west of the Teeth marker at (365, 65): centre (250, 40), radius 30. Every light lies outside it.
- The schooner's spot is chosen per crew, seeded by the crew id, within 20 units of the fog's centre. The spot varies the picture, not the difficulty: seen from 120 to 200 units away, the whole disc spans about 6 to 10 degrees, so a copied bearing often still hits. Copying gains nothing, because every crew sees its own glow.
- The two public lights see the fog's centre from 50 and 14 degrees, 36 apart (at least 20 are required), and the home station sees it from 341, so the beams visibly cross. Aimed at the Teeth marker instead, the same two lights would be only 11 degrees apart. So the G4 cinematic `three_lights` must receive the schooner's chart position as its `target` (its default is the Teeth marker), and L3 passes it.

### 10.8 Not part of the case

The skeleton's idea of phones tapping long, short, long to brighten the beams belongs to the demo. Since decision 4 the class demo shows highlights only. If a phone layer is ever built, it may brighten beams on screen but never counts as a lock.

## 11. The accusation

| Rule | Value |
|---|---|
| Needs | D2, D3 and D4 on the board, and the schooner found |
| Who accuses | One player aboard the schooner (a crossing of seconds from any light). Partners may come aboard but never accuse. |
| On boarding | "You climb aboard. The masked captain stands at the wheel and says nothing." |
| The choice | One of the four suspects. The crew's D2, D3 and D4 are laid out as the evidence. |
| A wrong suspect | Refused with that suspect's line from section 4. Nothing changes. The crew waits 60 seconds ("Your crew can accuse again in one minute."). No coins are lost. |
| Too early | Without the schooner: "There is nobody to accuse yet. Find the light first." Without D2, D3 and D4: "You need D2, D3 and D4 on your board before the charge will stick." |
| The right suspect | The harbor master. Accepted once. The reveal plays for every seat of the crew, rewards are paid, and the Relighting check runs (section 14). |

`accusation.culprit` is the only field in `case.json` that holds the culprit's id, and the server never sends it before the accusation is accepted. The reveal, closing and epilogue texts name him in words and are held back the same way. This repository is public, so anyone can read this file; the game does not show him to a crew until it solved.

## 12. The twist reveal

Shown in this order to every seat of the solving crew. Each line lists the cards that make it fair. Every cited card is reachable by all 8 entry profiles (linter rule L11), and every crew that accuses holds C8, which plants the night clerk. The note-and-blink callback is not in line 6, because only the True Keeper and the Witness saw the warned note in Act 1: it sits in their own closing lines.

| Order | Line | Cites |
|---|---|---|
| 1. Unmasking | "You pull back the captain's hood. It is the harbor master. He does not look surprised. 'Someone flashes the alarm,' he says, 'and I answer. I always have.'" | C1, C7 |
| 2. The twist | "Plot twist: the man who answered your alarm was the one sending it." | C1, C7, C8 |
| 3. How | "He posted a reward for finding a light he lit himself." | C1 |
| 4. How | "His office seal was on every crate, and every wreck paid into his post room." | C3, C4, C6 |
| 5. How | "On every wreck night, his orders sent the coastguard away." | C7 |
| 6. How | "His lit window was a lamp his night clerk kept burning while he sailed." | C8 (it names the clerk) |
| 7. Your closing line | One line for the viewer's own kit (below) | see below |
| 8. Log readers | "Elena wrote 'Tell the harbor master.' before she knew. The page that was torn out said the rest." Only for players whose profile read the log. | C8 |
| 9. Last beat | "His ledger counts the stolen lenses waiting at Gull's Rest: eleven. Greyfathom's manifest said twelve. One lens is missing." | C5 |

**One closing line per kit**, each calling back the player's own Act 1 ending:

| Kit | Closing line | Cites | Act 1 callback |
|---|---|---|---|
| True Keeper | "You flashed his own alarm with the whole bay watching, so he had to answer it. When your note came, his clerk blinked the window and the red boat ran. He let the coastguard take the fisherman, and his office freed him by morning. This time the light really is yours." | C7, C8 | "The harbor master has been watching", the window that went dark and lit again, "Maybe the light should be yours now." |
| Witness | "Your note is how the red boat knew to run: his clerk blinked the window when it came. The harbor master never came, because he was already out at sea." | C8 | The window that went dark and lit again before the boat slipped away; "The harbor master never came." |
| Informant | "'Thanks for telling me where to look,' the fisherman said. He only ever carried the crates. The seal on every one of them was the harbor master's." | C3, C4 | "Thanks for telling me where to look" |
| Stranger | "'Whoever you are, nobody knows you're up there,' he called through the door. That is also why the yard would hire you. Every lens on its manifest was bought with a wreck and held for the harbor master." | C5, C6 | "Whoever you are, nobody knows you're up there." |

The missing lens is the hook for what comes after: Chapter 2 starts from it (OPEN-WORLD.md, section 10, "Chapter 2 hook").

## 13. Rewards

### 13.1 Who earns

- A **contributor** is a player seat with at least one accepted pin, one of the three locks that parted the fog, or the accepted accusation. The list is frozen when the accusation is accepted and shown as credits.
- **Partners never earn.** A partner's pin counts for the player who ordered it (`ordered_by` in NPC-PARTNERS.md). Nils decided this on 5 November 2026 (decision 9, open point 2).
- **Once per player.** Every reward `ref` names the case but no crew, so the ledger refuses a second payout when the same player solves again in another crew (409 `already_applied`).

### 13.2 Coins

| Reward | Amount | When | Wallet reason | `ref` (idempotent) | Most per player |
|---|---|---|---|---|---|
| First card | 50 | Your first accepted pin of each card, in any crew | `clue_reward` | `false_light:card:C1` to `false_light:card:C8` | 400 |
| Deduction | 200 | A deduction forms and you are part of it | `mystery_reward` | `false_light:deduction:D1` to `false_light:deduction:D4` | 800 |
| Solve share | 400, plus 100 per deduction you were part of, plus 100 for a finale role, at most 800 | The accusation is accepted, to every contributor | `mystery_reward` | `false_light:solve` | 800 |

- A contributor earns between 450 and 2,000 coins from the case. The full 2,000 means every card, every deduction and the full share.
- **Wallet reasons (decision 15).** The case uses the foundation's own reasons: `clue_reward`, `mystery_reward` and `clue_purchase`. Every `ref` starts with the case id, so a later chapter's entries never collide with these. Nils decided this on 5 November 2026.
- **Example, a crew of four.** The Witness pins C2 and C7 and locks one beam: 2 cards (100) + D1 and D4 (400) + a share of 400 + 200 + 100 (700) = 1,200 coins.
- **Example, solo.** A solo player is part of every deduction through their own pins and their partners' ordered pins, so they can reach the full 2,000. Solo takes about 30 minutes longer and one person does every player job.
- **Paid routes** use the wallet reason `clue_purchase`. A player's `ref` is `false_light:{crew_id}:buy:{card_id}`, so one player pays for one card at most once per crew. A partner's paid route uses `false_light:{crew_id}:npc:{order_uid}` (NPC-PARTNERS.md, rule N17), so every wallet `ref` of the case starts with the case id. The server refuses a paid route, and charges nothing, when that seat already holds the card.
- Each `ref` fits the wallet's 120 character limit, even with a 36 character crew id and a 64 character `order_uid`: the partner `ref` is at most 12 + 36 + 5 + 64 = 117 characters.

### 13.3 Keepsakes (once per player)

| Keepsake | What it is |
|---|---|
| Title | "Relighter", next to your captain name. |
| Keeper's Star | A star over your home on every chart. |
| Wall of Lights | Your captain name on the Wall of Lights in Saltreach Harbor. |
| Recovered lens | One lens for your signal station. It cannot be traded. Its later uses belong to the open world and Chapter 2. |
| Epilogue line | One line in your journal, from your kit, plus "Read Elena's log first." for log readers. |

Epilogue lines (private to the player, and they name nobody):

| Kit | Epilogue line |
|---|---|
| True Keeper | "Flashed the alarm, kept the light, and found out who was answering it." |
| Witness | "Sent a warning to the wrong man, then proved it." |
| Informant | "Trusted the fisherman, then followed his crates to the seal." |
| Stranger | "Took no side, and saw what both sides were hiding." |

## 14. The Relighting switch

### 14.1 The first solve

The first accepted accusation by any crew in the live world moves the world stage from `dark` to `relit`, exactly once: one conditional database update ("only if it is still dark"). One server setting keeps this switch locked until the game opens (the relight lock; the proposed name is `RELIGHT_OPEN`, off by default). While it is locked, an accepted accusation still pays its rewards and plays the reveal, but the stage stays `dark`, so the team's own test solves cannot relight the live coast (decision 19). There is no separate demo world for now (Nils, 5 November 2026, late evening): rehearsals and the class demo use the `?demo=1` highlights tour, which runs in the browser on a stand-in and never touches the live world.

What changes for everyone, solved or not:

| Change | Detail |
|---|---|
| Lights come on | Every public lighthouse on the shared chart comes on, and the night lanes are lit. |
| The fog lifts | The fog bank west of the Teeth rolls back. The false light no longer shows on real fog nights (before the first solve it appears on the shared chart as a teaser). |
| Gull's Rest opens | A new place behind the old fog line, where the stolen lenses are kept. |
| Greyfathom is delisted (should) | It leaves the Island Exchange and every holder is cashed out at the last price. D017 has no delisting yet, so this needs a small change in L4 first (OPEN-WORLD.md 7.7). Until then it stays listed and nothing else in this table depends on it. |
| Fees drop (should) | The Exchange fee falls from 2% to 1%, which needs L4 to read the world stage (D017 has a fixed 2% today). Fast travel has no fee for now (decision 16), so there is nothing to lower there. |
| Festival | 48 hours of double salvage on every driftline, fireworks at night and a free lantern colour. |
| Wall of Lights | Goes up in Saltreach Harbor with the first crew's captain names. |

### 14.2 Later crews

Each later crew that solves adds its captain names to the Wall of Lights and lights one more lamp on the shared chart. There are 12 spots for extra lamps; after that, later crews add names only. The world stage stays `relit`.

### 14.3 The spoiler rule

Anything that names or shows the culprit appears only to players who have solved the case, in any crew. That covers the reveal, the closing and epilogue lines, the jailed harbor master and his lines, the Lightkeepers' Hall in the old Harbor Office, the ledger and papers at Gull's Rest, the reason Greyfathom left the Exchange, and any case summary. Everyone else sees: "The false light is out. A crew found it." The Wall of Lights shows captain names and the order of solving, nothing else.

### 14.4 Crews still on the case

- They see the relit chart, Gull's Rest, the lower fees and the Wall of Lights (names only), like everyone.
- Their case keeps working. In their case view the Harbor Office (notice board, counter, post room, lit window), Greyfathom's yard, the cove, the jail's release order and the ruin stay as they were.
- On their own case nights, their fog bank and false light are drawn for their crew only.
- If Greyfathom is delisted, the share route to C6 closes. The True Keeper's post room, the paid clerk and the mail boat stay open.
- Inside an unsolved case every place shows its case state, even to a player who solved the case in another crew.

## 15. Timing

### 15.1 The timetables

| Phase | Crew of four | Solo with three partners |
|---|---|---|
| Act 1, each alone | 12 | 12 |
| Muster: kits, seats, first building | 8 | 8 |
| First leads: D1, D2 | 25 | 35 |
| Follow the money: D3 | 30 | 35 |
| The Teeth, third light: D4 | 15 | 20 |
| Night of Three Lights | 15 | 25 |
| Board, accuse, unmask | 10 | 10 |
| Relighting, rewards | 5 | 5 |
| **Total** | **120** | **150** |

The crew column is the skeleton's timetable, unchanged. Solo is slower because one person reads every card, gives every order, pairs every deduction, builds the third light and aims and locks all three beams. In the timing program the partner chains also set the pace (TIMING.md, section 4.5).

### 15.2 Where the minutes come from

A crossing takes about 4 to 6 seconds, up to 15 in fog or storm (OPEN-WORLD.md 5.2), so sailing is not where time goes. Time goes into: finding the right spot on an island the first time (each island has decoy spots), the enforced route timers (the salvage shift is 15 minutes), the windows (up to 15 minutes), partner errands (10 plus 5), reading, pairing and talking, the night, and the reveal.

### 15.3 A planning check

The timing program ([TIMING.md](TIMING.md), run with `python3 -I backend/tools/simulate_case.py`) tried all 69 mixes of 1 to 4 player kits, with partners filling the other seats by NPC-PARTNERS.md's kit order, the two-seat rule, the gates, the windows and the minutes above. At best play and without talk, it measures case minutes until D4 is paired (the column "D4 best" in TIMING.md, Appendix B):

| Crew | Best play to D4 | The timetable gives |
|---|---|---|
| Four players, four different endings | 43 | 70 |
| Four identical endings, buying shortcuts | 46 to 49 | 70 |
| Four identical endings, free routes only | 49 to 52 | 70 |
| Two or three players with partners | 42 to 52 | 70 |
| One player with three partners | 52 to 53 | 90 |

Every mix finished. The most a whole crew spent on shortcuts was 550 coins. The gap between best play and the timetable (about 18 to 37 minutes) is the room for first-time play: reading, getting lost, talking. TIMING.md is that simulated run: at first-time pace (1.5 times slower than the planning minutes) all 14 classes of crews fit their promise, with 102 to 110 minutes for a crew of four and 121 to 124 for one player with three partners (the approval sheet said 118 to 122 for solo; that is a review change that waits for Nils' OK, [README.md](README.md#changes-to-the-approval-sheet-after-the-review)). A human timed playtest is still owed (open point 5). If real crews turn out much faster than 120 minutes, lengthen the kit timers first (the salvage shift), not the card count.

### 15.4 Expected totals

| Crew | About |
|---|---|
| Four players, mixed endings | 120 minutes |
| Four identical endings, buying shortcuts | 125 minutes |
| Four identical endings, free routes only | 135 minutes |
| Two or three players with partners | 120 to 150 minutes |
| Solo with three partners | 150 minutes, over one or two sittings |

The simulated first-time totals behind these promises are in TIMING.md: 102 to 110 minutes for a crew of four on free routes, 121 to 124 solo.

## 16. Fair play: what Act 1 planted

Story v2 plants hints that every kit sees. Every hint pays off in a card, and every card in the reveal is reachable by every kit.

| Act 1 line or plant | Who saw it | Pays off in |
|---|---|---|
| "The tag is stamped with a small seal: an anchor with an open eye." (key, Story v2 changes 7 and 8) | Everyone | C3, D2 |
| "Three nights in the tide tables are circled in pencil." (desk, change 9) | Everyone | C2, C7 |
| "A page has been torn out of the logbook." (desk, change 9) | Everyone | C8 |
| "Across the bay, the harbor master's window glows." (shore, change 10) | Everyone | D4, C8, reveal line 6 |
| "Light the great lamp and flash the harbor-alarm pattern" (lamp room) | Everyone: all 8 end states reach the lamp room | C1, the twist |
| "Say nothing to him and send a note to the harbor master" (shore choice) | Everyone, before deciding | The twist, the Witness and True Keeper closing lines |
| "He uses my light to guide the smugglers in." (Elena, lamp room) | Everyone | The fisherman as the obvious suspect |
| "The harbor master has been watching" (signal) | True Keeper | True Keeper closing line |
| The window goes dark and lights again, then the red boat slips away (warned note, change 12) | True Keeper and Witness | The True Keeper and Witness closing lines (the clerk blinking the window) |
| "His window is a lie: his night clerk keeps the lamp burning." (C8, written in the card text) | Every crew that accuses: C8 is needed for D4 | Reveal line 6 |
| "No fog tonight. We wait for the next one." and "The harbor master never came." (change 3) | Witness | C2, Witness closing line |
| "Thanks for telling me where to look" (change 2) | Informant | Informant closing line |
| "Whoever you are, nobody knows you're up there." (change 4) | Stranger | Stranger closing line |
| "Tell the harbor master." and "old watchtower" (log and change 6) | Log readers | C8, the log card, the log readers' line |
| "Inside the back cover, Elena has drawn a lamp and a row of long and short flashes, with a question mark beside them." (desk, change 13, after reading the log) | Log readers | Chapter 2's hook beam (OPEN-WORLD.md, section 10.2), not the case |

## 17. What the tests must prove

The linter rules L1 to L19 are listed in [the case data section of `backend/content/README.md`](../../backend/content/README.md#linter-rules). These are the behaviour tests for the case package (S3, with S4 for partners and L3 for the finale), each one test with a sentence name. All 15 belong to the 23 Nov minimum.

| Test | Proves |
|---|---|
| `test_one_seat_can_never_form_a_deduction` | A pair whose two cards were pinned by one seat only is refused and changes nothing. |
| `test_fewer_than_three_seats_never_part_the_fog` | Two seats, or one seat hopping between lights, never reveal the schooner. A lock ends when its seat leaves. |
| `test_one_player_can_hold_three_locks_for_partner_lights` | One player aims all three beams, then locks them one after another inside 90 seconds, with partners on duty at two lights: the fog parts. A beam stays aimed after its lock ends. A lock for a light that nobody has reached yet is refused ("Nobody is at that light yet."). |
| `test_every_player_mix_solves_on_starting_coins` | All 69 mixes, partners by the kit order, finish with the `market` flag off, no world events and no coins beyond one building. |
| `test_four_identical_endings_can_solve` | The four identical mixes finish on free routes only. |
| `test_kit_route_is_the_fastest_free_route` | For every kit card, the kit route's timer is the shortest and its price is 0. |
| `test_gated_cards_wait_for_their_deduction` | C5 and C6 are refused before D2, C8 before D3, and nightfall before D1. |
| `test_window_routes_open_only_inside_their_window` | A timed route at the last closed minute is refused; at the first open minute it starts. |
| `test_off_target_lock_is_refused_and_changes_nothing` | A bearing 6 degrees off is refused; 5 degrees off is accepted. |
| `test_wrong_accusation_only_costs_a_minute` | A wrong suspect is refused with their line, nothing changes, and the next accusation waits 60 seconds. |
| `test_world_relights_exactly_once` | Two solves in a row move the stage once; the second adds names and one light. |
| `test_a_solve_while_the_relight_lock_is_on_pays_its_rewards_and_leaves_the_world_dark` | With the relight lock on (decision 19), an accepted accusation pays its rewards and plays the reveal, but the stage stays `dark`. With the lock off, the same solve relights once. |
| `test_rewards_are_paid_once_per_player` | The same pin, deduction and solve in a second crew pay nothing. |
| `test_culprit_is_never_sent_before_the_solve` | No answer to a crew that has not solved contains the reveal or the culprit's id. |
| `test_case_ids_and_light_positions_match_the_place_registry` | Every place, hotspot and light id in `case.json` exists in `frontend/src/world/places/registry.js`, except the virtual place `anywhere`, and each light's `chart_xy` equals the registry's chart position plus half the beam origin (within 0.01). The test may run Node to read the registry, as the parity test does. |

The timing program, `backend/tools/simulate_case.py`, checks the planning numbers. Its fast parts run in `backend/server/tests/test_case_timing.py` (the paths, the decisions in the data, every crew of four, the solo starts). The full run takes 15 seconds or more, so it stays a command with exit code 0 and is not in `uv run pytest`. `backend/server/tests/test_content.py` proves that no name and no path serves a file from `backend/content/secret/`, which is where this case lives.

## 18. Answers to the other story documents

**STORY-V2-CHANGES.md, section 7 (what the case file should do).**

- C2 matches the Witness's radio words: its found line quotes "No fog tonight. We wait for the next one." word for word.
- C8 mentions the old watchtower and says who tore it out and why it is in the ruin: Elena's page ends "The lenses go to the old watchtower", and the fisherman's note across the top reads "Found in her desk. Left at the drop, as you asked." The ruin is the drop where Greyfathom's payments and the stolen lenses wait for the harbor master's schooner. The same page names the night clerk.
- The three circled nights are the three wreck nights (C2, C7).
- Who made his window go dark and light again on the warned night: his night clerk, who keeps the lamp burning while he sails. C8 plants the clerk, reveal line 6 names him, and the True Keeper and Witness closing lines call back the blink on the warned night. The clerk is a minor character with a title only.
- The log card's text and what it saves are in section 3.
- The closing lines call back the lines Story v2 suggested (section 12).

**NPC-PARTNERS.md.**

- Routes follow its model: who may use a route (`kit`, `players_only`), a price (`coins`) and when it is open (`open_when`). All four windows map to its single reason `locked_window`.
- Each hotspot holds at most one card (linter rule L4), and a card is a lead once it is open (`opens_after`).
- `partners_may_man` is true only for the Keeper's lamp and the Harbor Light. A solo player builds the third light: 300 coins and 10 timber, inside the 1,000 coin start and the 20 timber starter pack.
- C6 now has two slow routes that partners can use (the mail boat and the paid clerk), so its section 4.3 reason "C6 is the one card whose slow route a partner cannot use at all" no longer holds. The kit order still works; the timing program ran with it (TIMING.md, section 8).
- The case data section of `backend/content/README.md` describes `partners.json`, as its open point about ENGINEERING.md 4.6 asked.

**OPEN-WORLD.md, section 15.2 (open points for the case document).**

- Point 7: if Greyfathom is delisted, crews still on the case keep three routes to C6 (the True Keeper's post room, the paid clerk and the free mail boat). Only the share route closes.
- Point 8: the 20 timber starter pack covers the one building the case needs. Crossings of about 4 to 6 seconds (up to 15 in fog or storm) fit: the case's minutes come from finding spots, timers, windows and talk (section 15.2).
- The sealed crate on the beach is route `C4.beach_crate`, and the shareholder register is route `C6.shareholder_register`. Neither is ever needed.

## 19. Open points

| # | Point | Recommendation | Who decides |
|---|---|---|---|
| 1 | **Wallet reasons and refs: closed.** OPEN-WORLD.md section 13.1 now uses the F0 wave 2 names (`clue_reward`, `mystery_reward`, `clue_purchase`) and refs that start with the case id (`false_light:card:C1`), and keeps `service_fee` for fast travel only. | Keep the case id in every ref, so Chapter 2's cards never collide with these in the ledger. | Decided by Nils on 5 November 2026 (decision 15). Closed. |
| 2 | **Partner pins pay the ordering player.** Without it, a solo player earns nothing for a deduction whose cards partners pinned. With it, a solo player can earn the full 2,000. | Adopted, as NPC-PARTNERS.md recommends. | Decided by Nils on 5 November 2026 (decision 9). Closed. |
| 3 | **How much the log card saves.** Today: C8's lead from the start, and no search timer after D3. A bigger reward would let log readers search the ruin before D3, but then the torn page can arrive before the money trail. | Kept small, so the twist keeps its pace. | Decided by Nils on 5 November 2026 (decision 8). Closed. |
| 4 | **The night clerk.** A new minor character, title only, who keeps the harbor master's lamp lit. It answers Story v2's question about the window. C8 plants him. | Kept. | Decided by Nils on 5 November 2026 (decision 5). Closed. |
| 5 | **A human timed playtest is still owed.** [TIMING.md](TIMING.md) is the simulated run: all 14 classes fit at first-time pace (1.5 times slower than the planning minutes). It does not model how long players need to work out which cards pair. | Run the paper playtest in TIMING.md section 9, and tune the salvage shift and the windows first. | The team, in the S0 or S3 week |
| 6 | **Dependencies.** All 14 Story v2 edits must land for the plants in section 16 (the 12 of the first list, and changes 13 and 14, which Nils approved on 5 November 2026 as decisions 3 and 4). The place registry on `main` holds the places, hotspots and lights of this case since the G6 merge (`9f5bf97`), and the case ids follow it. The G6 stand-in (`frontend/src/adapter/fake/`) uses the same ids with one exception. It puts C2's radio words at `satchel`, next to C3's key tag, where `case.json` has `journal`, because rule L4 allows one card per hotspot. The G6 owner and the S3 owner agree one id. F0 wave 2 must merge before any reward is paid. G4 and L3 agree that the `three_lights` cinematic gets the schooner position as its `target` (section 10.7). | Track them in the S3 issue. | Package owners |
| 7 | **ROADMAP v0.2 disagreed in five places.** Its minimum for S1 ("the import plus the ending lines only"), S3 ("one route per card, no slower routes"), S4 ("two orders, search a place and man a light") and L3 ("a finale with two lights") each broke a guarantee proved here. S0 "Provides" named `specs/S3-the-light.md` and `specs/S4-npc-partners.md`, which do not exist. | Done in the same branch as this file: the five lines are changed as listed in README.md, "Changes outside this folder". Three lights stay unless Nils says otherwise. | Closed |
| 8 | **Names.** Saltreach, Greyfathom, Gull's Rest, Smugglers' Cove, Wreck Point and the Teeth are placeholders. | Run the final name check before the demo. | Nils |
| 9 | **A crew that loses players.** A crew of four players has no partners. If two stop coming, the two left cannot man three lights, because partners are added only when the crew starts. | A6 lets a crew release an absent player's seat to a partner, by a vote or after a set idle time. The seat keeps its pins; NPC-PARTNERS.md sections 7.2 and 7.3 define what carries over. | A6 owner, with Nils |
| 10 | **The highlights demo and the unmasking.** The repository is public and the demo is short. Showing the unmasking spoils the case for classmates who play later (STORY.md asks the same). The demo is the `?demo=1` tour on the browser-side stand-in, not a separate demo world. | Stop the demo at the schooner and do not show the unmasking. | Nils (still open) |
