# R16: presenter-laptop frame proof

Latest local observation, 7 Nov 2026, source `95de0b6`: the driver was stopped at Nils’s request
after 35/44 commands (32 passed, three failed). This is a partial run. Storm records **31 FPS /
108 calls**; cinematics **16 FPS /97 calls**; world passes **32 FPS /97 calls** and all subsequent
assertions. A separate local bulletin-opening failure is unrelated to this hardware request.
Evidence: `captures/20261107_G9-C3-market-paused/paused-proof.json`. Source is not pushed yet;
last verified remote remains `8844962`. Historical full-run observations below remain unchanged.


1. **Route or setting:** no API, database or header change. This is the existing presenter-laptop
   performance requirement in G9 stream 19 and the checkpoint browser driver.
2. **Missing proof:** clean committed source `e720eaf` initially passes **41/44 commands**. Two
   unchanged production-command reruns passed after an initial intro timeout; latest individual
   outcomes are 42/44, with no second full-run claim. The cloud ANGLE/Vulkan SwiftShader run
   records **12 FPS / 112 draw calls** in the eight-captain night storm (requires 55 FPS and fewer
   than 150 calls), and **14 FPS / 97 calls** after ten round trips (requires 30 FPS). Those two
   commands stopped at their original frame assertions; later assertions were not reached.
   **Cinematics passed** this run at **30 FPS / 97 calls**, including its subsequent assertions.
   Exact current metrics, all 44 logs, initial failures, reruns and clean source stamps are under
   `captures/20261107_G9-C3-after/`. Historical `443400c` evidence remains under C2 (41/44 with
   three frame failures), with its logs in `captures/20261106_G9-C1-after/`. These observations
   do not establish a cause or a hardware pass.
3. **Why it matters:** the classroom/presenter frame requirement is not proved. G9 must not label
   checkpoint 1 complete or claim a hardware pass from a cloud software-renderer result.
4. **Exact request:** run the unchanged offline/intercepted checks `node scripts/check-living.js`,
   `node scripts/check-world.js` and `node scripts/check-cinematics.js` on approved presenter
   hardware and installed Chrome, at 1440 × 900 with device DPR 1. Use the current verified G9
   source and note its commit. Never use real accounts, tokens, services or databases. Preserve
   every original frame/draw, visual, resource, event and cleanup assertion. If a check fails there,
   publish that failure for a bounded renderer investigation; do not lower a gate, rendering
   density, art/weather quality or crowd count to turn the report green.
5. **Proposed evidence shape:** numeric metadata plus fixed renderer/browser strings:
   `{sourceCommit, browserVersion, renderer, viewport:{width,height,devicePixelRatio},
   drawingBuffer:{width,height,densityScale}, captains:{drawn,hidden},
   living:{fps,calls}, worldAfter:{fps,calls}, cinematic:{fps,calls}, errors:[]}`.
   No names, ids, codes, tokens or case content.
6. **Blocked streams:** checkpoint-1 browser completion and stream-19 presenter frame proof.
   Independent G9 panel work and the other gates can continue.
7. **Workaround:** publish passed streams with the explicit “not a checkpoint” label and continue
   independent streams. The same-pixel off-camera-culling experiment remains only in an ignored
   cache: geometry/pixel comparisons passed, but no reliable FPS gain was established, so active
   rendering remains main's version. No budget or visual quality was changed.
