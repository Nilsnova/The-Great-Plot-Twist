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
