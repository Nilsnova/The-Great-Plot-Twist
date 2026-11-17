## Goal

Remove redundant level stars from combat walls that already use the approved material/post atlas. The actual composed wave capture (`stage-04/wave-projectiles-1280x720.png`) shows repeated stars over21 level-three inner walls, obscuring the new wall materials. Parent: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236).

Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one renderer-polish agent in a separate clone, pinned to the coordinator's frozen `414559fb` integration dependency.

## Scope

Only the existing pip condition in `frontend/src/pirates/render.js`, meaningful actual renderer-buffer tests and a bounded spec. Suppress pips only when the post is a wall and the active material wall renderer confirms `wallConnections.hasPost(id)`. Preserve all tower pips, legacy/pixel wall pips, health, smoke, repair/crew behavior, collision and gameplay. No new dependency, flag, source artwork, main/force push or merge.

## Acceptance and verification

- An actual material-wall level-three renderer layer contains no redundant pip quads.
- Its legacy/pixel fallback still draws the existing three pips.
- A level-three tower retains its pips.
- Use actual renderer root/layer buffers, not a new Boolean helper test. Run focused pure checks and build. No Chrome until the coordinator grants a slot.
- Final composed-game screenshot acceptance, full suite and human review remain coordinator work. Keep Draft; no production activation.
