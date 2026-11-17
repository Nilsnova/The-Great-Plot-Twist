# VIS-33: actual camera regression with unchanged artwork

Prepared for Johannes Franz Lang (`frcola`) and [Draft PR #351](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/351). These are actual local Chromium game screenshots. They show the camera change on the existing artwork; **they do not establish acceptance of the newly approved shaded reference style**.

## Matched runtime, assets and saved layout

Before: `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9`. After capture/QA helper: `f117a446013309ac8c7002ecf6b763b911a07cce`, whose camera source is `37faa5b6295b236d4632da437607070a05449225`. Evidence-only commits afterward do not change that captured runtime. [manifest.json](manifest.json) records full application/source and asset hashes. The art tree, public assets, world-art module and texture module are identical across the pair. The old 1.4 decorative cliff profile is retained here; the later 3.2 profile and new image skins require separate combined evidence.

Each viewport starts a fresh shared local fake world with declared 8,000 coins, best wave 40, noon lighting and seven ordinary paid buildings. Four public builder quote/confirm runs pay for the identical 102-wall layout, then one existing wall upgrade costs20 coins. The paid positions, levels, 102-wall inventory and final6,660-coin wallet match exactly within each before/after pair. Progression/funding is declared setup, not default first-session earnings. No paid walls or coins are injected after that initial fixture setup.

After preparation, real Exit/Manage controls re-enter management. This isolates initial camera composition from the old consumer hook that still forces Fit when construction starts. That hook and the final Work/focus controls are owned by the integration writer, not this camera-only source.

## Actual checks

Both scripts passed at1280×720 and375×812 with0 JavaScript page errors and0 external requests. Each viewport records one expected offline-service503 console diagnostic; this is not a clean-console claim. The screenshot helper uses existing high-quality preferences and records actual native pixel ratio1, with no image/DOM/canvas painting or hiding.

| Viewport | Old entry zoom | Close entry zoom | Unchanged Fit target |
|---|---:|---:|---|
| 1280×720 | 0.35168 | 0.99988 | Same original whole-shore formula |
| 375×812 | 0.33340 | 0.99975 | Same original whole-shore formula |

Normal animation is enabled, so raw snapshots are eased values rather than exact reduced-motion state. The helper checks Fit/Tab within0.005 zoom and restored working position within0.05 units. Unit tests separately prove exact reduced-motion Fit/Tab restoration and unchanged analytic bounds.

Real pointer drag pans the close view without selecting a building. Held Tab shows the whole-island frame and release restores the dragged working view. The ordinary Fit button works at both sizes. Actual remote ground clicks open the paid mortar card, the captain stays fixed and the wallet/layout remain unchanged. In the after case, remote focus is explicitly a **public camera API diagnostic** before that real canvas click; normal consuming selection hooks are not claimed here. Every visible enabled village control has an unobscured44px target and its label fits the actual padding clip.

No performance improvement is claimed from camera cropping. These are settled frames, not physical-device, sustained-FPS, Safari, production or new-art acceptance.

## Before and after initial entry

| Viewport | Before: whole-island entry | After: close district entry |
|---|---|---|
| 1280×720 | [Before desktop](before-entry-1280x720.png) | [After desktop](after-entry-1280x720.png) |
| 375×812 | [Before phone](before-entry-375x812.png) | [After phone](after-entry-375x812.png) |

## Explicit Fit remains available

| Viewport | Before | After |
|---|---|---|
| 1280×720 | [Fit before](before-fit-1280x720.png) | [Fit after](after-fit-1280x720.png) |
| 375×812 | [Fit before](before-fit-375x812.png) | [Fit after](after-fit-375x812.png) |

## Reproduction and handover

From the camera checkout at QA commit `f117a446`:

```sh
node frontend/scripts/capture-village-composition.mjs /workspace/reference-village-work/camera-before/frontend /workspace/reference-village-work/camera-evidence/before before
node frontend/scripts/capture-village-composition.mjs /workspace/reference-village-work/camera/frontend /workspace/reference-village-work/camera-evidence/after after
```

Actual result lines:

```text
PASS: before old-art camera at1280x720/375x812;102walls/6660coins unchanged; entry/Fit/Tab/drag/ground pick;0page errors/external
PASS: after old-art camera at1280x720/375x812;102walls/6660coins unchanged; entry/Fit/Tab/drag/ground pick;0page errors/external
```

Raw reports: [before](before-report.json), [after](after-report.json). All copied PNGs/reports are untouched and hashed in the manifest. Browser/server closure completed after each sequential run, then the sole Chrome lane was released to the coordinator.

Remaining: consuming controls/pan/focus integration, new image skins and larger decorative-cliff envelope checks, build/transfer budget and applicable wider browser gates, followed by human visual acceptance and explain-back. Nothing was merged, deployed, migrated or enabled live.
