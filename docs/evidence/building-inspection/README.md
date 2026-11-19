# Building inspection review

| Flow | Desktop 1280 × 720 | Phone 375 × 812 |
| --- | --- | --- |
| Next Cannon level | [Comparison](desktop-cannon-next-level.png) | [Comparison](phone-cannon-next-level.png) |
| Workshop role and Move | [Valid preview](desktop-workshop-valid-move.png) | [Valid preview](phone-workshop-valid-move.png) · [Refused preview](phone-workshop-invalid-move.png) |
| Barracks | | [Militia guard area](phone-barracks-current.png) |
| Return to approach coverage | | [Ground restored after Cancel](phone-ground-after-cancel.png) |

In the accepted fixture, Cannon level 2 to 3 shows clear-weather range 31 to 34, reload 0.91 to 0.77 seconds, and damage 16 to 24 per projectile. The existing server-backed action still shows 120 coins. The preview uses accepted layout, research, crew and rule context. It uses the normal level path, and the battle still determines actual hits.

The legacy Workshop fixture has two walls in the current area and four in a valid proposed area. The refusal restores the current two and disables placement. Cancel clears the proposed marks. The phone camera crops the farther walls in this fixture, and their names remain in the visible support text. The Barracks fixture shows its actual starting militia's guard area. The selected-house view also reports the inactive Workshop state on recovery v1. Tavern support applies to captains.

Chrome tested the same workflows on desktop and with phone touch emulation. The captured comparison and Moves preserved accepted balance, levels, positions, layout and crew. Measured touch targets were at least 44 pixels. Both runs finished without browser errors or external requests.

With Ground coverage active, seven approach gap markers appeared before selection. The house support area took over during the valid and refused Move previews. Cancel cleared the support marks and restored the same seven Ground markers and legend.

The missing-crew browser fixture cleared the exact upgrade rows after a stale context was replaced. Restoring the accepted crew snapshot restored the comparison. The real insufficient-funds action stayed disabled. Fifteen seeded battle replays matched the base across 1,852 sampled states and 4,932 events.

## Finding a building from Base overview

[Desktop overview](desktop-overview.png) · [Phone after Find](phone-found-building.png)

Find uses the accepted row's exact slot identity. In the fixture, two Cannons share the same displayed name. The selected Cannon remains the moved level-2 building. Desktop keyboard and phone touch both opened its existing card, while a wave reservation withheld Find. Levels, positions and balance matched before and after.

## Visual presentation

[Phone ground rings before](rings-phone-before.png) · [Phone ground rings after](rings-phone-after.png) · [Obscured Cannon on desktop](cannon-desktop-before.png) · [Visible Cannon on desktop](cannon-desktop-after.png)

Ground rings are quieter on the home island. Build and lock badges, footprint picking, prices and unlock cues remain legible. The paired early, middle and late fixtures preserved the same layout, camera, geometry and draw counts. At middle progression the local Chrome frame intervals stayed near 16.7 ms across the paired runs.

A single northwest palm is smaller at its existing ground anchor. In matched views, the visible Cannon raster rose from roughly 25–30% to 82–85% of the unobstructed view. Its location, scenery clearance, collision radius and painter order were preserved.

The short phone view keeps the arrows and actions in two compact rows. Chrome and WebKit on the Mac both completed the full 320 × 568 journey, including [the protected-point refusal](short-phone-refusal.png).

## Damage and Settings readability

[Destroyed tower before](ruin-phone-before.png) · [Destroyed tower after](ruin-phone-after.png) · [Controls before](settings-phone-before.png) · [Controls after](settings-phone-after.png)

Destroyed towers keep their rubble and zero-health indicator. Level stars return with confirmed positive health. Chrome exercised zero, one positive unit, partial recovery and full health on desktop and phone, including the older recovery policy and unchanged adjacent towers.

The Controls labels use the existing parchment color. Their measured contrast rose from 6.70:1 to 7.96:1 on desktop and phone. The Settings audit covered five viewport sizes. The production startup check now follows the actual first-run panels before asserting world focus. The underlying app already returned focus correctly when those panels were dismissed.

The documented legacy-travel check passed all 38 checks. After ten round trips, the same scene retained 95 draw calls, 101 geometries, 30 textures and one active scene root. The sample returned 60 browser frames per second on this Mac.

## Keeping the active battle visible

| View | Before | After |
| --- | --- | --- |
| Desktop 1280 × 720 | [Battle](combat-desktop-before.png) | [Smaller keyboard cue](combat-desktop-after.png) |
| Touch phone 375 × 812 | [Battle](combat-phone-before.png) | [Context on the touch button](combat-phone-after.png) |
| Short touch phone 320 × 568 | [Battle](combat-short-phone-before.png) | [Compact wave bar](combat-short-phone-after.png) |

On touch, the existing in-world interaction appears on its action button during a battle, leaving the center clear. The keyboard cue stays over the same spot and shrinks from 150 × 50 to 110 × 32 CSS pixels. Its normal styling returns outside combat. A fine-primary hybrid still has the keyboard cue and the usual touch Use button. Wave-specific actions retain priority.

On the 320 × 568 phone, the counts and captain health share a row. The measured wave bar is 159 CSS pixels tall, down from 186, with both danger lines and the event control visible. The named action remains 48 pixels tall. The extended short-screen probe confirmed space for wrapping loot and no horizontal scrolling.

Friendly gunners use navy and teal with a brass cap detail. Enemy boarders keep their red headwear. The gunner's original silhouette, anchor and occupied pixels are unchanged. Native before and after used the same local island, Wave 9 seed 25135766 at tick 240, weather, positions and high-quality reduced-motion settings. Both recordings made 53 draw calls. Desktop E and the touch button opened the same existing card and left the wallet and layout intact. The screenshots are from `a15f5af3` and `98a4fe58` in Chrome on the Mac with touch emulation for the two phone sizes.

## From the first wave to the first wall

[Short phone before](post-wave-short-before.png) · [Short phone after](post-wave-short-final.png)

The first-session check starts a fresh island, buys two Cannons, wins the normal first wave, and spends 10 of the confirmed coins on Wall 1. Chrome passed the same journey at 1280 × 720, 375 × 812 and 320 × 568. The final local fixture balance is 45 coins. At 320 pixels, the first unlock notice fits beside the movement stick while the narrator and victory sound caption stay visible. The full announcement remains available to screen readers and in the existing unlock cards. The default caption-size check kept Build here and Skip independently tappable.

The 320 × 568 combat check also passed in WebKit after allowing a wider counter column. The build panel header at 844 × 390 stays within its bottom sheet. The updated native phone walking check passed with actual touch, joystick and the current Menu. The lifecycle check exercised real one-shot WebGL startup failure and normal retry while preserving the existing shared adapter.

The three High–Low–High cycles retained the same installed layout, hit targets, colliders and renderer resources at each repeated quality. The first village view fetched 2,868,430 bytes of artwork. A wave that starts on Low allocates a 10.17 MiB battle atlas. Changing quality during a wave immediately resizes the framebuffer and the existing battle atlas stays resident until the next wave. These local measurements use Mac browser emulation for phones.
