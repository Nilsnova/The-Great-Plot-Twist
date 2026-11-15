# T35 tower obstacle evidence

Captured by `npm run test:rules` (`node scripts/check-rules-mp.js`) in the browser's desktop two-client scenario, on 2026-11-15. The wave had `tower_health`, `pathing`, and `tower_obstacles` enabled for both clients. The run advanced 451 ticks, compared both clients' deterministic state, and confirmed the same frozen rule set after the pathing flag was disabled for subsequent waves. Both clients started with 80/80 tower HP and received identical repair events.

- `towers-host.png`: host client during the tower obstacle wave.
- `towers-ben.png`: second client during the same wave.

These screenshots document the desktop game state for the simulated two-client harness. They do not represent physical-device coverage, a production realtime session, or performance measurements.
