# Compact case pages and light controls

Owner: Nils with Codex. Branch: `feat/redesign-case-night`.

Changed: the case dialog keeps one responsive frame while its content scrolls. Three primary
buttons and one page picker replace the ten-button row; every existing page remains available.
The light challenge keeps its chart allocated before, during and after nightfall, uses a newly
drawn 896×512 chart and 360×360 compass, and presents one numbered light's controls at a time.
The disconnected state offers a clear crew action without an unusable clock or aiming controls.

All build, post and lock actions retain their existing adapter intents, permissions and IDs.
No correct bearing is calculated by this view. The glow and reported beams come only from the
snapshot. Native keyboard/touch sliders and gamepad adjustment remain available. A refused aim
now keeps the player's selected angle through cooldown; a changed server bearing still updates
it. A narrow Relighting image no longer causes horizontal overflow at 320px.

Verified:

- `npm test -- --run tests/case-night.test.js`: 7 authority/geometry tests passed.
- `node scripts/check-case-redesign.js`: 147 browser checks passed at 1280×720, 375×667,
  320×568 and 844×390. This exercises every case page, all four light selections, incorrect aim,
  angle preservation, native keyboard input, successful locks, and the disconnected state.
  Waiting/night/dawn/success retain identical frame dimensions; no tested page has horizontal
  overflow. No browser errors or external requests occurred.
- `npm run build`: production build and spoiler guard passed (140 text files, 12 protected lines).
- Inspected the actual desktop/phone/night/disconnected screenshots. The final layout places
  nightfall beside the clock and keeps the offline crew action above the small chart.

Evidence from the isolated run is at `/workspace/redesign-case-evidence/` (report and phase
screenshots). Reproduce it with the browser command above; `CASE_REDESIGN_CAPTURE_DIR` can
choose another output folder.

Not verified: the full merged game journey, G9's real transport, or a production deployment.
The coordinator owns those checks. No database, flags, credentials, backend or deployment changed.
