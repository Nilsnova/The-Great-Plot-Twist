# Fleet art in the game

Compare the matched [desktop](desktop.png) and [phone](phone.png) frames, or watch a [three-second gameplay clip](gameplay.webm). The close-ups enlarge pixels taken from the live renderer in wave 31. The phone uses Chrome touch emulation.

Both browsers use main `ea9a2c29` and the same island, seed and camera. The after captures use the exact fleet painter from `5395b6b5`, with source SHA-256 `0af41c933d7a071ca625eb37e3d447d5e9769d59e19a4ed7d6dbad55e6be3350`. The low-graphics run also used reduced motion. All 21 paired frames show the same simulation tick. Four use an adjacent ambient sprite phase.

All three views recorded the same 200 combat events per version. The shared sampled ship and boarder counts and island health match. Both versions peaked at 80 draw calls. There were no browser errors, external requests or lost graphics contexts. [Capture metrics](capture-metrics.json)

The full local frontend suite passed 4,672 tests. The production build, spoiler guard, loading budget and text lint passed. [Art contract and raster checks](../../../specs/VIS-16-29-fleet-art.md)
