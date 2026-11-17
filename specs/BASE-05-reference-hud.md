# BASE-05: truthful reference village HUD

For Johannes Franz Lang (`frcola`), [issue #146](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/146).
This bounded slice builds on approved visual candidate
`cd6dc2e77218762ba512d147a860f9228aed85d6`, using fixed review baseline
`review/base-05-cd6dc2e7`. Broader budget-preview acceptance in the issue remains.

## Scope and behavior

Keep confirmed coins and their existing animation/unknown-payment semantics.
Replace the ambiguous swords/captain chip with an explicitly sourced wave status:
the displayed island's best between waves and its actual active wave during a
visible battle. Unknown data remains unknown; captain level stays in the Menu's
existing progress/status context. No rank, reward, wave increment or persistence.

Temporarily hide the large Goals strip in village management, preserving folded
preference, hint state and quest progress. Normal display returns on Exit. The
integration/projection owner supplies optional `managing` and
`waveStatus: {bestWave, currentWave}` through the existing HUD model, and applies
management visibility before measuring camera insets. No new global event.

Owned files: HUD/view-model/scoped CSS, focused tests, spec and evidence. Root
serializes `game.js`; the selected-building owner keeps `island/index.js`.
Shared modal, cold-title and global styles remain outside this slice.

## Plan and acceptance

1. Claim Draft and agree the model/seam with both shared-file owners.
2. Add an explicit best/current wave model with unknown-state handling.
3. Keep captain level discoverable and confirmed coins unchanged.
4. Suppress Goals only while managing; restore preferences and normal state.
5. Keep desktop/phone text legible and enabled targets at least44px.
6. Verify actual source state, focused DOM/model checks and before/after captures.

- [ ] Actual best/current wave is distinct from captain level and next wave.
- [ ] Missing/malformed/visited-island values cannot produce a fictitious record.
- [ ] Goals progress and fold preference survive management entry/updates/Exit.
- [ ] Known coins, unknown coins and confirmed animation retain their rules.
- [ ] No stale hidden-Goals camera inset or phone/Menu collision.
- [ ] Actual1280×720/375×812 evidence and applicable exact checks recorded.

## Explain-back

Why is captain level a different value from best wave? Why must a temporary
management view not write the folded preference? Why does hiding Goals before
camera measurement matter? Keep Draft for a different human's review; no merge,
deployment, live flag/database action or new app dependency.

## First source handover

Pure source/model checks:20tests passed in262ms. Build passed in1.19s with
spoiler guard242text files/12protected lines; cold-title transfer passed at
18,734JavaScript bytes and9,410CSS bytes. Native HUD/Goals/layout tests are
written and await the coordinated sole browser lane; no DOM pass is inferred.

The game bridge applies `hud.setManaging(managing)` before measuring Goals,
includes hidden/coin-header state in the layout key, and clears a taller phone
header in the safe inset. It reads the displayed controller and current island's
real best record. Root must preserve VIS-34's primary projection, selected-dock
selection/focus and resource hooks when composing these `game.js` hunks.
