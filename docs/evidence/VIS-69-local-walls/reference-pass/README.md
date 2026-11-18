# Wall visual follow-up

## Revalidation on current main

The wall branch was brought up to main `db573347`. Main and the wall branch each completed the same two Chrome journeys. Each journey paid for all 12 walls and 21 upgrades, placed a free third-row Move and reached an actual breach in wave 31. The wall branch disabled a fourth row in the UI and refused it in the fake API. The matched Work shots below use the same fixture and camera. [Desktop main comparison](mauern-desktop-main.png) · [Phone main comparison](mauern-handy-main.png)

## Previous review and upgrade clips

This pass follows the review of PR #474 at `42e1eb62`. The same village and Work camera appear on both sides of the desktop and phone comparisons. The clips record a paid timber-to-stone upgrade in the game, using the in-memory island transport. [Desktop comparison](vergleich-desktop.png) · [Phone comparison](vergleich-handy.png) · [Desktop upgrade](upgrade-desktop.gif) · [Phone Details upgrade](upgrade-handy-details.gif)

The village tour shows repeated caps, weight at the ground and connected corners. The upgrade footage shows a brief cue attached to the affected segment. This pass applies those observations to the island's own materials and perspective. [Supercell village tour](https://www.youtube.com/watch?v=JkFBR05rlWE&t=405s) · [Wall upgrade footage](https://www.youtube.com/watch?v=H9D0XFDGJbE&t=128s)

The five tiers use broader footings and distinct face and top shading. At a mixed-tier join each wall keeps its own material up to the shared edge. An open breach leaves a gap in both the wall and its footing. A confirmed purchase briefly lights that wall and adds dust and rising glints. Details shows the receipt in its header when open. Reduced motion holds a static highlight. [Wall tier and joint matrix](wall-tiers.png)

Separate agents reviewed reference footage, refined the wall geometry and implemented the purchase cue. Independent Chrome touch and pointer journeys each checked 33 paid wall transactions, free placement on the third row, rejection of a fourth row, and a simulated breach in wave 31. Phone captures use a 375 × 812 Chrome touch viewport and desktop captures use 1280 × 720. The upgrade clips use normal motion. The phone journey also checks reduced motion. [Follow-up issue #477](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/477)

Run the [browser journey](../../../../frontend/scripts/check-wall-integration.mjs) from the repository root with the candidate checkout and an output directory:

```bash
node frontend/scripts/check-wall-integration.mjs . /path/to/evidence revised
```
