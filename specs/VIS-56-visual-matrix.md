# VIS56: inspect real upgrade artwork and wall geometry

Used by Johannes Franz Lang (`frcola`) and the visual-review coordinator for [#424](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/424).

The approved scope improves presentation while retaining the game's controls, economy, combat, placement and progression. This task supplies a developer-only browser fixture and focused source tests; it does not change product code or claim a full-game journey.

## Contract

- Use the game's actual compiled PNG provider and real world/combat frame selection for five defense families, levels 1–5, intact/firing/damaged/broken.
- Render connected, damaged, breached and selected walls at levels 1–5 through the actual wall connections and WebGL material path.
- Preserve the real house cap (level 3), role variants, watchtower level aliases and core health states. Do not invent progression to fill a sheet.
- Record exact source, file hashes, viewport, frame IDs, native draw counts, topology, errors and external requests with each artifact.
- Own a loopback Vite server and installed Chromium, and close both in `finally`. No remote art, game API, production write or new package.
- Clearly label renderer/art fixtures separately from the coordinator's actual paid-placement, upgrade and combat screenshots.

## Verification

Run the pure matrix registration/state tests and relevant existing art/wall tests. The coordinator owns the exclusive browser slot and will run the native helper on a frozen combined candidate. Keep original assertions and timing limits; record any failures rather than weakening a check.

## Limits and review

The fixture proves selected rendering inputs and produces review images. It does not prove player input, payment, live health, multiplayer, Safari, physical devices, sustained performance, balance or final human visual acceptance. Those are separate checks and remain explicit in the combined review. All work stays Draft; a different human reviews before merge.
