# Overnight visual polish

Follow-up to [playable scene acceptance](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236). The scope starts at `d98a21ce`, and the final world art captures use `8bf8d65b`. Individual comparisons use the relevant earlier build and the same local island state and camera within each pair. The browser checks used a loopback game with the built-in fake island and weather. Desktop and touch viewports ran on the Mac. Physical-phone performance remains open.

## Island edge and touch controls

[Desktop shoreline](shore-desktop.jpg) · [Phone shoreline](shore-phone.jpg) · [WebKit dropdown targets](dropdowns-webkit.jpg)

Low shrubs, rocks and flowers make four clusters at the edges of the grass. The world draws them below the buildings and their action markers. Scenery uses the existing nature sheet and the same number of meshes as the original scattered grass and flowers. In the matched day scenes, both views retained 95 draws and 722 triangles. Reserve and collision coordinates, all three shoreline approaches and the established landmark routes matched. Early, middle and dense layouts passed Fit and Work on desktop and 375 × 812. The coastal Wave 9 still removes the skiff and its rope from the approach while leaving the bollard on shore.

In WebKit, the original native Find building and Approach coverage select controls measured 24 CSS pixels tall. Both now measure 44 and their centers receive the hit at 1280 × 720, 375 × 812 and 320 × 568. The native option list and keyboard navigation use the same select controls.

The composed build passed three rounds between the Home Islet and Saltreach Harbor and two real fixture resets in Chrome on both viewports. Prepared Home returned to 37 uploaded textures and Harbor to 27 on each trip. The two new visible nature textures account for the two additional Home textures in this scene. Both resets returned 100 coins, wave 0 and no buildings. The place count stayed at one.

## Crew silhouettes

[Enlarged source frames](militia-spear-source-frames.png)

The original militia spear point was cut off by its own frame at the top when held upright and at the right when thrust forward. The five corrected poses keep the geometry within their existing 24 × 32 frames and retain the foot anchor. Matched Wave 31 runs in Chrome and WebKit covered desktop and touch, High with normal motion and Low with Reduced Motion. All 44 comparison captain, crew and pirate frames outside the modified spear poses remained pixel-identical. The paired runs retained the same accepted simulation events and draw counts.

## Damage and recovery

[Phone ruin during combat](damage-phone.jpg)

Village and combat now use the same compact badge with a visible fill for a tiny positive HP value and a distinct ruin mark at zero. The wall’s health in combat comes from its existing simulation state, and the frozen defense position gives the badge its anchor. This fixes the missing wall badge when a wave starts. The local recovery flow verified preparation, persistent damage while an accepted update was held, a refused repair and removal of the badge after the accepted repair. Testing all five wall tiers in three damage states in both WebKit phone sizes showed that the inherited wall height keeps a front ruin’s marker clear of a legal rear wall. The lower prototype crossed all solid rear tiers, so the inherited elevation stays in the release.

## Subtitles and live wave status

[320 px wave result before and after](large-subtitles-phone.jpg) · [320 px live danger and subtitle](large-subtitles-live.jpg)

In short portrait, the 22 px caption keeps its own scrolling area below the game controls. The full authored line remains available while the player is reading. A focused reader can scroll with End and Close returns focus to the previous usable control. Rotation preserves the caption and its scroll position. During a live wave, urgent instructions still take priority. Shift+Tab reaches the reader using the browser’s normal focus order and plain Tab keeps the game's overview behavior.

Paired 320 × 568 and 375 × 812 Chrome and WebKit fixtures completed the native Wave 1 win, map movement, paid wall and next countdown. Actual Chrome gameplay also reached a live warning and the Musket control with the complete caption available, and a real undefended loss with its separate defeat message. The full authored long Wave 15 caption and simultaneous Wave 2 briefing were exercised separately in the two-engine layout fixture. In both engines, a reader reached through native keyboard input retained the same caption and exact scroll offset after rotating the phone twice. Focus returns to the active game or result dialog while the reader is unavailable. Physical-phone and VoiceOver acceptance remains open.

When a long Standard caption cannot fit next to the live wave HUD, it moves below the touch controls. On the 320 × 568 Fog Bank run, the caption moved from the HUD’s y93–272 lane to y505–562. Both phone sizes and graphics modes exercised the expanded and collapsed event panel in Chrome and WebKit. The live Wave 1 warning still stays clear of the Musket and movement. At the Harbor bell, a defender already in the wave sees “View wave status,” which opens the existing status card. [Fog Bank at 320 × 568](fog-bank-standard-subtitles-before-after.jpg)

## Clash Royale comparison

The official gameplay footage shows scenery framing the play area, easily distinguished troop silhouettes, and brief impacts with health shown close to the affected tower. Those principles guide the quiet shoreline, the cropped-spear correction, the reserve for warnings and actions, and the shared ruined-wall badge. The player’s perspective and pirate village keep their established identities. [Opening impact and arena layout](https://www.youtube.com/watch?v=_hNxfiXmeAE&t=47s) · [Mid-battle lanes and tower health](https://www.youtube.com/watch?v=_hNxfiXmeAE&t=150s)

The final visual pass also reduced high-detail offshore ripple contrast while preserving the existing foam and shallow-water cues. The shader uses the existing geometry and draw count. In a fixed offshore phone crop, the mean difference between neighboring pixel luminances fell by 24.5%. The matched Low quality phone capture is byte-identical before and after. [Phone Fit water comparison](offshore-ripples.jpg)

## Across the Saltreach Isles

[Six-location desktop gallery](map-six-locations.jpg) · [Desktop ground comparison](map-desktop-comparison.jpg) · [Phone arrival comparison](map-phone-arrival.jpg) · [Pirate Point day and night](pirate-point-day-night.jpg)

Home Islet and the outlying islands now share the same grass, sand and paving art. Each island keeps its natural coast, paths and palette. Harbor uses stone paving, the other outlying locations use sand, and The Teeth stays muted. Four 1024 × 768 backdrops preserve their original alpha byte for byte. Harbor also fills the small cutout under its existing ferry deck. The five painted backdrops add about 458 KiB across separate scene loads. The game uses the existing texture at each location. Pirate Point and the retained Lighthouse route load the same ground image.

Smugglers’ Cove has a low slate cave and a closed timber arena gate. The Teeth’s Raid arch is an open stone portal with worn pennants. In Chrome and WebKit, those landmarks retain their existing canvas, foot anchors and world interactions. The Market Hall now has a striped awning and open counter, and Wreck Point’s salvage shed has a timber hoist and a visible vessel hull. Native inputs opened the Market and sailed to Wreck Point. The six-location route check also verifies three different travel presentations, the harbor office at night and stable graphics resources over ten round trips. [Desktop Cove comparison](cove-landmarks.jpg) · [Walk-up Market Hall](harbor-market-comparison.jpg) · [Salvage Yard on a phone](map-phone-comparison.jpg)

The original building plots in Home Islet’s multi-location mode use the village sand and low sandstone edging. Amber plus signs mark buildable plots, and muted padlock signs mark locked plots. Native Chrome clicks and taps opened the workshop panel at the same canvas positions on desktop and phone. Plot positions, colliders and scene resource counts matched the previous art. The three PNGs add about 2.6 KiB on this route. [Desktop building plots](home-parcels-desktop.jpg) · [Phone building plots](home-parcels-phone.jpg)

The Harbor beach continues beneath the ferry deck. The regenerated Harbor image fills 4,840 natural grass and sand pixels and preserves the existing RGBA values everywhere else. The eight exported runtime movement masks are byte-identical. Desktop and phone input still walk the pier and continue to Home through the Sea Chart. The original Harbor Office uses warmer clay, limestone and a closer contact shadow. Its size, anchor and lit windows are preserved. [Desktop pier comparison](harbor-pier-desktop-before-after.jpg) · [Phone pier comparison](harbor-pier-phone-before-after.jpg) · [Harbor Office by day and night](harbor-office-before-after.jpg)

[Desktop Sea Chart](chart-desktop.jpg) · [Short phone Sea Chart before and after](chart-compact.jpg)

The Sea Chart uses the island menu colors. At phone widths from 320 to 390 CSS pixels, the full illustrated world fits above all permitted destinations with the current island clearly marked. Every destination has at least a 44 px touch target. The three destinations in island play and all six in the retained multi-location mode were exercised in Chrome and WebKit. After a rotation and a voyage, keyboard focus starts on the current landing and Close returns focus to the game. Keyboard travel and the ordinary and fast voyage choices use the existing routes. In short portrait, the arrival name sits beside the HUD and clears the walking route below it.

## First-play controls

[Short title before and after](title-compact.jpg) · [Landscape title](title-landscape.jpg) · [First steps before and after](pre-wave-guide-320.jpg) · [Early combat Guide](combat-guide-320.jpg)

The title keeps the lighthouse and ship visible in both short orientations. Play, Join and Settings all have native targets of at least 44 px. Play works during the initial sky frame, before the animated scene loads. The scene uses code-drawn art and shares the game’s Reduced Motion preference. It also resumes when a player switches their device back to ordinary motion.

The first guide now clears the movement stick and gives both Skip buttons their full targets. Longer instructions scroll inside the guide on the shortest portraits. The compact combat Guide stays accessible while the player shoots and reads. Its full instructions open on demand. At 320 and 375 CSS pixels in Chrome and WebKit, the actual onboarding and Wave 1 flows could walk, build, use the Menu, advance or dismiss the guide, and complete a paid wall without blocking Large subtitles or the danger warning.

The first Cannon receipt now has room below the guide, and the actual touch button carries the nearby action label. Standard and Large captions can be read below the touch controls on short portrait screens, including when the receipt and guide are both visible. Chrome and WebKit exercised the 360 × 640 and 375 × 640 sizes as well as 320 × 568 and the taller phone layouts. [First purchase before and after](paid-cannon-phone-before-after.jpg) · [Both subtitle sizes at 320 px](paid-cannon-with-subtitles-320.jpg) · [First purchase at 360 px](guide-360-cannon-before-after.jpg)

## Confirmed construction feedback

[Desktop Cannon build](native-cannon-build.gif) · [320 px Cannon upgrade](native-phone-cannon-upgrade.gif)

A confirmed Home build or upgrade shows the same brief dust and gold accents as a wall. An open upgrade card also highlights its header, so the player can see confirmation while the island sits behind the card. The two clips are from native Chrome purchases. Chrome and WebKit verified the expected prices, level changes and refusals for the Cannon, House and Watchtower. Reduced Motion keeps a brief still confirmation. Reconciled, refused and stale answers play no success cue.
