# Home Island terrain review

[Desktop before and after](desktop-fit-before-after.jpg) · [Touch Fit and Work before and after](touch-fit-and-work-before-after.jpg)

The playable Home Island has a raised sandstone ridge with moss caps, shaded cliff faces around the landing, shallow surf around the offshore rocks, smaller limestone paving, and contact shadows beneath the trees and buildings. Artillery foundations stay visible when the wave renderer takes over.

The comparison uses the same Wave 40 fixture, ten built structures, 15,500 coins, camera framing, and time of day. The before build is `e24175f3`. The terrain build is `55e52b6a`. Chrome and WebKit rendered Fit, Work, the ridge, the landing, and a Low graphics nighttime view at 1280 × 720 and 375 × 812. The matched Fit frame rose from 96 to 100 draw calls, with no new downloaded image assets. The rear ridge and offshore rocks fit on both screens.

Desktop mouse and phone touch verified the same saved wall positions, paid upgrades, and a free move into a flush join. The fourth row was refused. Both runs reached the same first wall breach in a live Wave 31. A same-frame terrain comparison confirmed that the new layers left the sampled ships and boarders visible.

The project’s existing projection, walkable shoreline, and building layout define play. The original concept still has a taller portrait silhouette, more pronounced tiers across the interior, and building forms drawn for that angle. Full concept acceptance and physical phone testing remain open in [#236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).
