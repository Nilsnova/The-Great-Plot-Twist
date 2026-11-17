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

- [x] Actual best/current wave is distinct from captain level and next wave.
- [x] Missing/malformed/visited-island values cannot produce a fictitious record.
- [x] Goals progress and fold preference survive management entry/updates/Exit.
- [x] Known coins, unknown coins and confirmed animation retain their rules.
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

## Final focused verification

Verified source: `60573698c68e0902554e06a4c3ac9a6315760862` on
17 November 2026. The final followup empties the hidden wave icon for legacy
coin-only callers; a DOM assertion checks that hidden text does not contaminate
the coin label. No further runtime changes were needed.

From `frontend/`:

```text
npx vitest run --maxWorkers=1 tests/ui/reference-hud.test.js
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    11.55s

npx vitest run --maxWorkers=1 tests/ui/hud.test.js -t 'shows coins as|with the island as coin source|counts the loot up'
Test Files  1 passed (1)
Tests       3 passed | 11 skipped (14)
Duration    7.39s

npx vitest run tests/ui/wave-progress.test.js
Test Files  1 passed (1)
Tests       20 passed (20)
Duration    222ms
```

Both commands exited0. The11 skipped cases were deliberately excluded by the
selection filter; this is not a pass claim for the full legacy HUD file. The
tests used actual Chromium DOM at1280×720,375×812 and320×568, including
7,180 and2,147,483,647 coin balances. They verify best/current labels, captain
Menu context, unknown versus real zero, Goals progress/fold/hint restoration,
focus leaving suppressed Goals,17px wave text,44px Menu targets and no
horizontal overflow or header/Menu/Goals overlap. The legacy cases verify
wallet-source isolation, exact coin-only text and confirmed balance animation.
After process exit, `/proc` showed zero live, non-zombie Chrome/Chromium
processes and the coordinated browser lane was explicitly released.

These are focused HUD checks. They do not prove the final composed village
camera insets, visual resemblance to the reference, full-suite success, live
account behavior or screenshot acceptance. Root still owns the combined scene
and before/after1280×720 and375×812 captures. The broader BASE-05 budget
preview remains open. Keep Draft until Johannes explains the code and a
different human reviews the current revision.
