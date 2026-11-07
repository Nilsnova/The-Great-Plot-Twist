# R16: presenter-laptop frame proof

1. **Route or setting:** no API, database or header change. This is the existing presenter-laptop
   performance requirement in G9 stream 19 and the checkpoint browser driver.
2. **Missing proof:** clean source `03dd379` (published through `367189d`) passes 37/44 commands.
   Its unchanged night-storm gate measures 26–33 FPS / 109–111 draw calls on the cloud ANGLE/Vulkan
   SwiftShader renderer; it requires at least 55 FPS and fewer than 150 calls. The ten-trip sample is
   20 FPS / 97 calls; it requires at least 30 FPS. All results and failures are retained in the C1 evidence.
3. **Why it matters:** the classroom/presenter frame requirement is not proved. G9 must not label
   checkpoint 1 complete or claim a hardware pass from a cloud software-renderer result.
4. **Exact request:** run the unchanged offline/intercepted checks `node scripts/check-living.js` and
   `node scripts/check-world.js` on the approved presenter hardware and installed Chrome, at 1440 × 900
   with device DPR 1. Use the current verified G9 source and note its commit. Never use real accounts,
   tokens, services or databases. Preserve every original frame/draw, visual and resource assertion.
   If it also fails there, report that failure for the next bounded renderer investigation; do not
   lower a gate, rendering density, art/weather quality or crowd count to turn the report green.
5. **Proposed evidence shape:** numeric metadata plus fixed renderer/browser strings:
   `{sourceCommit, browserVersion, renderer, viewport:{width,height,devicePixelRatio},
   drawingBuffer:{width,height,densityScale}, captains:{drawn,hidden},
   living:{fps,calls}, worldAfter:{fps,calls}, errors:[]}`. No names, ids, codes, tokens or case content.
6. **Blocked streams:** checkpoint-1 browser completion and stream-19 presenter frame proof; this
   does not block building the remaining crew/presence/panel work or collecting other required gates.
7. **Workaround:** keep passed streams published with the explicit “not a checkpoint” label, and
   continue independent G9 streams. The same-pixel off-camera-culling experiment is preserved only
   in an ignored cache: its geometry/pixel proofs passed, but no reliable FPS gain was established,
   so active rendering remains main's version. No budget or visual quality was changed.
