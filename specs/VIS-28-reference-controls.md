# VIS-28: existing Move and village controls

For Johannes Franz Lang (`frcola`, `83476@novasbe.pt`) and the visual reviewers; tracking [VIS-28 #233](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/233). The detailed visual concepts are approved and implementation is authorized. Base: camera checkpoint `9b55460e`, immutable `review/vis-28-camera-9b55460e`.

## Scope and contract

The existing Move and village bars receive the approved parchment, teal and gold treatment, a real confirmed-building portrait and a directional layout for the existing half-unit step controls. Work returns to the VIS-33 close district; Fit remains explicit. No new selection dock, purchase flow or Move state machine is introduced.

The game consumes VIS-33 without forcing Fit on Move/builder entry. Coordinate/message changes create a placement focus intent; unchanged animation frames, quotes or repaint calls must not continually override explicit Fit. Canvas drag pan stays available during placing, while the existing movement threshold/defaultPrevented guard prevents a drag from becoming a placement tap. Captain, dialog, pause, battle and text-entry priority remain.

Portrait identity comes from confirmed kind/level/spec data. The shared frame provider supplies actual pixels, asynchronously through paintIds when present and through existing frameCanvas on the pinned procedural source. Keep one cached current portrait, ignore stale selection/disposal completions and show a neutral fallback for unsupported/unbuilt/unavailable art. Never repaint on each nudge or substitute a hardcoded cannon. The image provider/registry is another writer's scope.

Own game.js consumer hooks, a small pure placement-intent helper if needed, village-bar.js, move-bar.js, move-mode.js presentation fields and scoped styles/tests. Root owns BASE-06 selected-building cards; world-art/texture registration belongs to the pipeline lane. Preserve all existing messages, eligibility, server requests, unknown-action holds, coordinates and gameplay authority.

## Plan and evidence

Claim first, add failing pure/model/semantic DOM and drag tests, implement the bounded consumers and bars, then run focused checks. All enabled targets must remain at least44px and long refusal text must remain readable without hiding Cancel. Actual layout/text/selected-foot checks need the coordinator's sole Chrome lane; no concurrent browser/full frontend job is started here. Capture existing artwork and combined new materials separately at1280×720 and375×812, recording exact source/assets, paid state and limits.

Keep source/test/capture changes roughly below400 lines; split a larger slice. Build/budget/text and applicable accessibility/demo/overlap checks must report exact results, with broad combined checks coordinated centrally. Keep Draft for explain-back and independent human review. No dependency, environment file, live migration/flag, main/force push, deployment or merge.
