# How to play The Great Plot Twist

A short field guide for players: how to get in, what to do in the harbor, and the controls.

> **10 Nov 2026:** the game is changing direction ([PITCH.md](PITCH.md)). Your own island to build and defend against pirate waves, a shared trading Harbor and a joint Pirate Point battle are being built now. The old mystery (the Lighthouse prologue, crews, the case board, the accusation and the reveal) has left the game. This guide describes what you can play today.

## The short path: the class demo

This is the quickest way in. It takes about five minutes.

1. **Play.** On the title screen, press **Play**. The first time, you see a short intro cutscene. Subtitles are always on. Voice lines play only when voice files are installed in your copy of the game. You can skip the intro with the Skip button, Escape or a tap. **Replay the intro** in **Settings** shows it again.
2. **Goal card.** One card, **Your goal**, says what to do and lists the controls. Press **Got it**.
3. **Harbor.** You stand in Saltreach Harbor. If you came with a class code, the game signs you in as a guest: you get an automatic captain name, with no account. Otherwise you play on this device and can sign in from **Settings**.
4. **Join the class.** Scan the QR code on the projector with your phone camera; the Join page opens with the class code filled in, so press **Join**. Or press **Join** on the title screen, type the class code shown on the projector (for example **HARBOR-K7QXM**; `HARBOR-` and capitals are optional) and press **Join**. If the page says the code is not valid, ask the presenter for the current code and type it again. Everyone who joins this way shares one live room, the class harbor. It shows up to 40 other captains. Positions and emotes are for show only.
5. **The quest strip.** The **Class demo goals** strip shows three small goals. Tap one to see a hint. Done goals stay ticked in this browser.
   - **Wave to a captain.** Walk up to another captain, then tap them or press E and choose **Wave**.
   - **Duel a captain.** Tap a captain or press E next to them and choose **Friendly duel (3 rounds)**. No coins are staked. The other captain sees **Accept** and **Not now**. This is the one way to start a duel.
   - **Open the Keeper's Lock.** The lock stands on the lighthouse path, right of the ferry pier. Press E next to it. It asks what the sky over your place looks like right now, and checks your answer against the real weather. The server finds your approximate city from your network address, or you can press **Change place** and search for a city. If you answer wrongly, you can tap **That's not what I see outside**, then **I looked outside**. If the weather cannot be read, the lock asks a riddle instead.
6. **The three lamps.** Three lamp posts stand along the path. Hold the button, or hold E, for 2 seconds to light a lamp. A lamp burns for 20 seconds, and each lamp needs one captain. When all three burn at once, the lighthouse is relit for everyone in the class harbor.

**Keep your progress.** A guest account is temporary: the host deletes guest accounts older than 24 hours. To keep your progress, open **Settings**, then **Account**, and choose **Keep progress with GitHub**, or, when email sign-in is switched on, enter your email under **Keep progress with email** and type the 6-digit code you receive. Your captain stays the same.

## Sailing and your islet

Open **Sea chart**, choose a destination and let the passage finish. **M** opens the chart on a keyboard. Visit your Home islet and look at the cabin, workshop, windmill, greenhouse and signal station plots. Building screens show the requirements and play-coin cost before you confirm. An offline or signed-out captain cannot build; wait for the success message and the updated building.

## The Island Exchange and its risks

Visit the market hall for **Prices** and **Your positions**. The Exchange uses **10× leveraged positions**, either **Long** (rising prices) or **Short** (falling prices). A small movement against you can consume your stake quickly. A position **closes at zero**; do not count on waiting for it to recover. Read its price source, freshness and market hours. **Closed**, stale or unavailable prices mean trading is paused for that company.

**Play money only.** Coins have no cash value; this is not an investment service. Do not deposit real money or pay anyone for a game balance. A signed-in account is required to trade. Review direction, stake, fees and confirmation before acting. If the answer is uncertain, use **Check again** or **Send again** for that same trade and inspect **Your positions**; do not assume another click starts a safe new trade.

## Prediction kiosk and sports

The prediction kiosk opens posted questions. Read the closing time, outcome source and play-coin stake before confirming a choice. A weather picture is not a settled result. A signed-in account is needed to place a stake. The sports pavilion shows the available fixtures with their source freshness and pool rules; a closed desk says so.

## Weather

Cloud, rain, fog and wind shape the islands, from the real weather of the game's place. The game requests weather at startup and periodically afterwards. If an update fails, the previous conditions can remain; the picture alone does not prove that data is live. A demo or unavailable source can use recorded conditions. Weather attribution appears in the interface, and wind also affects the sailing presentation.

## Controls

| Action | Keyboard and mouse | Touch | Standard gamepad |
|---|---|---|---|
| Walk | WASD or arrow keys | Drag the movement stick, or tap a clear spot | Left stick or D-pad |
| Run | Hold Shift while walking | No separate run button | No separate run button |
| Interact | E near a prompt | Interact | A |
| Sea chart | M or Sea chart button | Chart | Y |
| Close a view / pause | Escape | Close button / Menu | B in a menu; Menu closes or pauses |
| Zoom | Mouse wheel over the world | No separate zoom button | No separate zoom button |
| Menus | Tab / Shift+Tab; Enter or Space on buttons | Tap the labelled control | D-pad to focus, A to activate; left/right adjusts supported selects and sliders |

Click or tap the game after closing another view if movement has lost focus. Keyboard and touch remain available if your browser does not expose a standard-mapped gamepad.

## Settings and accessibility

Open **Settings** from the title or pause menu, or use the settings button in the game. Try **Low** quality if weather effects make movement slow. Adjust master, music and effects volumes separately. Use **Reduced motion: On** for still transitions, or follow your device preference. Enable **Color-blind-safe highlights** if helpful.

Settings are stored in this browser. If storage is blocked, they apply for the current visit only. Buttons have text labels and keyboard focus. These options do not amount to a promise that the entire WebGL world is usable with every assistive technology. Include the affected control in an accessibility report so it can be checked.

## Report a problem

First check whether the screen says **not connected**, **local fake** or **pending**. Those labels describe this version's limits. For a new fault, use the project's [GitHub issue form](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/new) (GitHub sign-in may be required), or tell your teammate or class host if you cannot use GitHub.

Include the page name, device/browser, keyboard/touch/gamepad, what you expected, what happened and short steps to repeat it. Say whether it was local fake mode and whether refreshing changed it. A screenshot of the controls can help; crop out private information. **Do not post class codes, tokens, passwords or account details in a public issue.** The help page does not upload a report automatically.

## Privacy in short

Quest ticks and preferences use local browser storage. A place you pick at the Keeper's Lock stays in this tab's session storage until the tab session ends. The game does not save that place in its database. Guest play uses Supabase's anonymous sign-in with the class code. Clearing site data or switching browsers can lose that local progress; private browsing may not retain it. Use your own browser profile on a shared device.

Connected account features use a temporary sign-in session. The account screen offers **Delete my data** followed by **Confirm deletion** when your account is connected. Deletion removes your own game data, including coins and ledger history. While the game cannot confirm your account, contact Nils through the course page for help. Clearing local site data is a separate action. Provider security logs and backups follow their own retention rules. Read the [privacy notice](PRIVACY.md).

The standalone help page does not sign you in, contact the game API, save your search or submit telemetry. Its report link opens GitHub only when you follow it.
