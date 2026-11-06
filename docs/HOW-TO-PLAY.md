# How to play The Great Plot Twist

A spoiler-free field guide for players. It explains the controls and systems without naming the culprit, solving a deduction or interpreting a clue.

## What you can play now

This guide follows the current `main` build. You can explore the islands, play Act 1 and change your settings. **Continue** restores the intro saved in this browser. Integrated sign-in and the live case connection are not available in this version: **Captain pending**, **Local intro only** and **The case service is not connected yet** mean exactly that.

Crew and case screens can be rehearsed with a local fake. They show the intended workflow, not a live crew, cloud save or real reward. Features marked **Planned** below are not playable just because their building appears on the map.

## Getting started: sign-in, Act 1 and your kit

1. Choose **New game** on the title screen to open Act 1. Use **Continue** to resume an existing local intro instead. **New game** replaces that browser's previous intro progress. On a shared computer, remember that this save belongs to the browser, not a signed-in account.
2. Read the opening story, choose an offered action and check your inventory and notes. **Show full text** reveals the current dialogue immediately; it does not choose for you. **Return to the island** closes the story so you can explore Lighthouse Isle and revisit interaction prompts.
3. Play *The Keeper's Last Log*, the solo first act. Your choices matter. There is no required answer sequence in this guide. **Start a new intro** replaces your existing intro progress and starts it again.
4. A connected case service must confirm your ending before it awards a kit. The arrival screen will show your kit, starting place, items and coins. The four kit names are True Keeper, Witness, Informant and Stranger. Different kits offer different ways into the case; none is a reason to restart for a supposed best ending.

**Sign-in:** GitHub is the project's intended account provider, but this build has no integrated sign-in button. You can play the local intro without signing in. Do not assume that finishing it has created an account or saved a kit online. If a later version offers GitHub sign-in, use that version's sign-in flow and read its save status before changing devices.

## Crews and partners

**Local rehearsal only in this build.** Open **Crew** to see the four seats and connection status. When connected, the screen offers **Start a crew** or a crew-code field. To join, enter the code, choose **Check crew code**, review **Your seat**, then **Confirm join**. Share the code privately with the friends you intend to invite.

**Muster with NPC partners** fills empty seats so a smaller group can rehearse a full crew. Partners carry their own kits. In **Partners**, choose an offered order and target, then **Send order**. Read the travel/work timer and return for the report. Partners can search, pin cards and take light posts; they do not choose your deductions, accuse for you or supply puzzle hints. A friend's join must be confirmed by the crew screen; never assume an empty seat is already reserved.

Local-fake examples: [a forming crew with open seats](../frontend/public/help/crew-rehearsal.png), then [three NPC partners after muster](../frontend/public/help/partners-rehearsal.png). These show no live players, usable crew invitation, rewards or case progress.

## The case, without solutions

**Local rehearsal only in this build.** The case is about investigating a dangerous light at sea. Explore at your own pace and use the information your crew actually discovers.

- **Searches and satchel:** inspect a location's available routes. Read its price, duration and restrictions before confirming. A paid search explicitly names the coins it will cost. A timer means the action is still underway; check its result before starting something else.
- **Case board and pins:** a found card is not automatically a shared deduction. Use **Pin my card** to contribute it. The board records who pinned it. Coordinate with other seats instead of trying to do every contribution as one person.
- **Deductions:** select **First card** and **Second card**, then **Pair cards**. Dragging cards is an alternative, not a requirement. The pair needs contributions from different seats. Read the screen's response and progress indicators; this guide never identifies a useful pair or explains what a card means.
- **Night of Three Lights:** when the case offers it, coordinate several seats at different light posts. Use **Call nightfall**, take available posts, aim using the offered compass controls or slider, and **Lock this beam**. Watch the timers together. This is a case event; do not wait for a particular real-world hour or real fog.
- **Accusing:** use only evidence your crew has earned. When the accusation screen is available, review the offered evidence and suspect selection before **Present this accusation**. A refusal or cooldown is shown on screen. Follow that message before retrying. This guide does not name the correct person or evidence.

## Sailing and your islet

Open **Sea chart**, choose an available destination and let the passage finish. **M** opens the chart on a keyboard. Your home islet is a place you can visit: look around the cabin, workshop, windmill and greenhouse plots. Building, production and saved upgrades are **Planned**; selecting a plot in this build does not buy or build anything. Do not mistake a location label for a completed purchase.

## The Island Exchange and its risks

**Planned; no trading screen in this build.** The approved next design uses real prices with **10× leveraged positions** in either direction. A small price movement against a position can consume its play-coin value quickly. A position closes when its value reaches zero: do not count on waiting for it to recover. Ten times the exposure also means ten times the sensitivity to a move before any fees or other rules.

**Play money only.** Coins have no cash value; this is not an investment service. Do not deposit real money or pay anyone for a game balance. When trading becomes available, read the current position value, direction, cost and confirmation before acting, and risk only play coins you are willing to lose. The old market service in this snapshot does not implement the new 10×/close-at-zero design, so it cannot be used to practise those rules. Visiting the market hall is not a trade.

## Prediction desk and duels

**Planned.** The prediction kiosk and arena gate are visible places, not working betting or duel menus. The prediction desk is intended for play-coin predictions on posted questions; read the closing time, outcome source and stake before any future confirmation. Lantern Duels are intended as turn-based challenges between players. Do not assume a round count, stake or payout until a working screen states it. Neither feature currently moves your coins through the game UI.

## Weather and the bulletin

Cloud, rain, fog and wind shape the island atmosphere. The game requests weather at startup and periodically afterwards. If an update fails, the previous conditions can remain; the picture alone does not prove that data is live. A demo or unavailable source can use recorded conditions. Weather attribution appears in the interface, and wind also affects the sailing presentation.

The radio/news **bulletin is Planned**; there is no bulletin screen in this build. Weather conditions are not a clue interpretation or a promise of a prediction result. For a case event, follow its own instructions and clock.

## Controls

| Action | Keyboard and mouse | Touch | Standard gamepad |
|---|---|---|---|
| Walk | WASD or arrow keys | Drag the movement stick | Left stick or D-pad |
| Run | Hold Shift while walking | No separate run button | No separate run button |
| Interact | E near a prompt | Interact | A |
| Sea chart | M or Sea chart button | Chart | Y |
| Close a view / pause | Escape | Close button / Menu | B in a menu; Menu closes or pauses |
| Zoom | Mouse wheel over the world | No separate zoom button | No separate zoom button |
| Dialogue choices | 1–9; arrows to browse, Enter to confirm | Tap a choice | Use keyboard or touch for the intro |
| Other menus | Tab / Shift+Tab; Enter or Space on buttons | Tap the labelled control | D-pad to focus, A to activate; left/right adjusts supported selects and sliders |

Click or tap the game after closing another view if movement has lost focus. Keyboard and touch remain available if your browser does not expose a standard-mapped gamepad. The help page itself uses ordinary links and form controls; the gamepad mappings apply to the game.

## Settings and accessibility

Open **Settings** from the title or pause menu, or use the settings button in the game. Try **Low** quality if weather effects make movement slow. Adjust master, music and effects volumes separately. Use **Reduced motion: On** for still transitions, or follow your device preference. Set text speed to Relaxed, Steady, Quick or **Instant**, and use **Show full text** during dialogue. Enable **Colour-blind-safe highlights** if helpful.

Settings are stored in this browser. If storage is blocked, they apply for the current visit only. Buttons have text labels and keyboard focus; the board's card selectors and the lights' slider provide alternatives to dragging. These options do not amount to a promise that the entire WebGL world is usable with every assistive technology. Include the affected control in an accessibility report so it can be checked.

## Report a problem

First check whether the screen says **not connected**, **local fake**, **pending** or **Planned**. Those labels describe this version's limits. For a new fault, use the project's [GitHub issue form](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new) (GitHub sign-in may be required), or tell your teammate or class host if you cannot use GitHub.

Include the page name, device/browser, keyboard/touch/gamepad, what you expected, what happened and short steps to repeat it. Say whether it was local fake mode and whether refreshing changed it. A screenshot of controls or an empty board can help; crop out private information. **Do not post clue text, deductions, accusations, the solution, crew codes, tokens, passwords or account details in a public issue.** Report a sensitive or spoiler-containing problem privately to the project team. The help page does not upload a report automatically.

## Privacy in short

The intro and preferences use local browser storage. Clearing site data or switching browsers can lose that local progress; private browsing may not retain it. **Local intro only** does not mean cloud backup. Use your own browser profile on a shared device.

The current session module keeps a sign-in token in memory rather than persistent browser storage; integrated sign-in is still pending. Connected account features would send authenticated requests to the game's server and Supabase. A server-side account deletion route exists, but this build has no player-facing deletion button: contact the project team for account help. Deleting local site data is not account deletion, and deletion of game records does not promise removal of all provider logs.

The standalone help page does not sign you in, contact the game API, save your search or submit telemetry. Its report link opens GitHub only when you follow it. Local-fake rehearsal screenshots contain no real player records or rewards.
