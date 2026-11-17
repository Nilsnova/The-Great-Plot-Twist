# VIS-02: richer cannon runtime trial

Responsible teammate: Johannes Franz Lang (`frcola`). Parent: [VIS-02 #207](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207). Base: `569d8fda3474cb84af36af190853d1a0e02b7abf`. Branch: `feat/vis-02-cannon-style`.

Johannes authorized implementation of the published reference-village roadmap on 17 November. This bounded trial proves an original richer cannon through the existing code-painted route. It does not establish human acceptance of the final art direction or implement the rest of the village.

## Plan and boundaries

1. Replace only cannon painting with a small original helper: beveled stone pad, timber carriage, graded metal barrel, brass fittings and restrained contact shadow.
2. Preserve every existing level 1–5 identity, firing recoil/flash, gold/banners, frame name, 48×32 dimensions and anchor 5.
3. Reuse the same registered painter in world `loadArt` and combat `cartoonAtlas`; retain actual damaged and broken frame selection.
4. Add meaningful frame/paint-state checks; exercise every registered cannon through both consumers in the browser capture fixture.
5. Capture actual before/after at 1280×720 and 375×812 with declared fake API data; source, quality and camera mode must be recorded.
6. Record accepted/rejected quality and remaining limits after visual review. Keep the PR Draft for explain-back and independent human review.

No gameplay, footprint, selection, prices, projection, atlas registration, recovery, collision, walking, coast or camera change belongs to this slice. The existing Fit-only camera needs the separate BASE-02 working-zoom change before a phone art-quality decision. The small cannon pad is the only ground-contact sample here; a convincing raised coastline and full terrain trial remain separate work.

## Evidence that is required

- All cannon levels have distinct intact/firing/damaged/broken registrations and the same frame geometry in world and combat routes.
- Every painter runs with a real Canvas2D context; the barrel, muzzle and banner fit within the canvas without losing state identity.
- Broken frames do not fire. Firing recoils only barrel/shot; it does not move the logical foot point.
- Actual-game paired desktop/phone screenshots show the scope. Isolated asset sheets supplement those captures and are not playable integration evidence.
- Applicable focused tests, build/budget/text and UI checks report exact source/results. The shared verification lane runs broad checks.

## Risks and remaining decisions

Detail can disappear at Fit zoom, and the original 48×32 frame bounds limit silhouette height. Canvas gradients must remain compatible with low quality, damage wrappers and the combat atlas. A successful registration test is not visual acceptance. Broader art or geometry changes require explicit later contracts; no runtime image downloads or new packages are introduced.
