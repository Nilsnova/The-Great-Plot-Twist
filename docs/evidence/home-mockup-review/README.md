# Home Island visual review

[Desktop Fit before and after](desktop-fit-before-after.jpg) · [Phone Fit and Work before and after](touch-fit-work-before-after.jpg) · [Cannon selection and short phone](touch-selection-and-short-fit.jpg) · [Mooring detail](phone-landing.jpg)

Home Island now has a taller portrait Fit view, planted sandstone terraces, broad front cliff faces, narrower limestone footpaths and a timber mooring beside the tender. The cabins, house roles, Arsenal, Heart, Bell, Harbor and wreck use a shared material palette. Village controls and the selected-building card use the same navy and brass treatment. A short phone keeps the selected building visible when the narrator and expanded Range card share the screen.

The matched screenshots use the same ten built structures, saved positions, 15,500 coins and daylight. The previous terrain build is `55e52b6a` and the revised runtime is `4321ef01`. Both Chrome and WebKit exercised 1280 × 720 desktop, 375 × 812 touch, and 320 × 568 touch. The browsers rendered the Fit, Work, ridge, mooring, and low-quality night views. Both selected the actual house art and restored the ordinary camera after rotation and a Sea Chart voyage to Saltreach Harbor. The matched Fit fixture uses 109 draw calls and 45 textures on the revised build, compared with 100 and 45 on the previous terrain revision.

## Play checks

- Desktop and phone each accepted 33 priced wall transactions and the same free edge snap. Both refused a fourth row and reached the first Wave 31 wall breach at 15.25 seconds. The portrait lens reset for combat. The timber stage, tender and rope cleared the combat view while the dry landing stayed visible.
- In the final desktop and touch captures, the Smugglers anchored over clear water at 13.9 seconds and landed at 14.5 seconds through the existing north inlet.
- Keyboard and touch crossed the existing Heart passage. The dry landing remains reachable and the water remains outside the walking area.
- A real House upgrade charged 100 coins and reached Level 2. The next Upgrade control stayed gold. Reduced motion used stationary dust and zero glints.
- The local two-player placement run preserved saved wall and cannon moves across both players, reload, battle, invalid placement, and wall repair.

The combined current-main runtime `fdce01bf` passed all 5,069 frontend tests across 465 files, plus the production build, 7 production browser checks, 19 loading checks, 41 world checks, 30 mobile movement checks and 24 overlay checks.

The playable map retains two buildable cottages, a walk-through Heart, the original building positions, and the existing wall lanes. The concept has four cottages, a different arrangement and a larger pier. Visual acceptance, building-adjacent wall placement beyond the current pirate approaches, physical phone coverage, and VoiceOver remain tracked in [#236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).
