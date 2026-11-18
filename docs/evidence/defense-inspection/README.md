# Defense inspection in battle and Village Mode

## Live range

During an island wave, choose **Menu → Inspect defense range**. The picker reads the selected defense’s range and target class from the running simulation. The ground overlay includes the Mortar or Culverin minimum distance. A dashed edge shows the extra reach for lit targets at night. Destroyed, jammed or silenced defenses retain the selection marker and show their status.

| View | What to look for |
| --- | --- |
| [Desktop fog and full-island view](desktop-fog.png) | The selected Mortar stays visible while holding Tab. Its range and minimum distance use the current Fog Bank wave. |
| [Phone Night Raid](phone-night.png) | The same Mortar can reach 25.35 units normally and 39 units for lit targets, with an 8-unit minimum. |
| [320 × 568 phone](short-phone.png) | Range and weather details alternate on short touch screens. The whole joystick and the Fire and E controls stay usable. |

Native Chrome ran the actual game with offline wave fixtures. The live panel and ring closed on Escape, Close, opening the Menu, sailing away and a naturally completed wave. Touch dragging and canvas firing still worked while the panel was open.

## Selected wall

The fixture bought a wall, paid for both upgrades and moved it through the actual Move interface to the valid square at (16.5, −0.5). Selecting it faded the foreground oak and raised its measured visibility from 3% to 100% on desktop and from 2.4% to over 99% on touch. Closing selection restored the tree. Wall position, wallet and draw counts matched the baseline. [Magnified before and after](selected-wall.png)

The paired wall captures compare `ada779ba` and `f391607c`. The narrow-phone capture uses `a670a1ca`. Desktop fog and phone night use combined runtime `afaf9666`, with current main `b357b522` and the earlier combat and fleet changes. Integration checks use `e80a8c90`, which also keeps the docked caption in place while it fades in. The phone captures use native Chrome touch emulation.
