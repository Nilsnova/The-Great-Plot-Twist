# Reference-style village: tasks and delivery plan

For Johannes Franz Lang (`frcola`) and the coding agents assigned to this work. This is the task index; the linked GitHub issue holds each task’s current scope and acceptance.

**17 November 2026:** [delivery epic VIS-00](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/205), **32 new child tasks** and **eight refined existing base-building tasks**. All new implementation tasks are proposed and unassigned. The plan has 29 core tasks and three optional/conditional routes. Creating the tasks does not implement the target style.

[Reference and technical boundaries](REFERENCE.md) · [Parallel ownership](PARALLEL-WORK.md) · [Current-code audit](SOURCE-AUDIT.md) · [Verification](VERIFICATION.json)

## What the target must demonstrate

Solid roof, wall and plinth planes; readable stone, wood and metal; consistent light and ground contact; raised cliffs with a grass lip; lush but intentional vegetation; coherent paths and waterline; accurate building selection and a real grid/ghost preview. Increasing density or changing only the palette is insufficient. The concept is not a screenshot of completed gameplay.

## First trial and the art-route decision

Start with [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206) for the style/frame/shoreline contract, then [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207) for a real-game trial: one cannon, a small ground/cliff/contact sample and the existing Move interaction. Reuse the village and camera behavior already merged by the team.

Record an explicit accepted or rejected result. A rejected trial is not a passed visual target. It can trigger conditional [VIS-32](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/237): original sprite assets under an explicit contract and a real sample in both world and combat-atlas rendering. [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208) supplies only necessary painter primitives or explicitly records an N/A/provider/export outcome on the selected image route. A closed investigation issue alone does not authorize bulk conversion.

Only a runtime art route accepted against the reference releases the independent family work. VIS-31 remains the final playable-style gate.

## The 32 child tasks

| Task | Concrete work | Prerequisites | Route |
|---|---|---|---|
| [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206) | Agree the reference style, frame and shoreline contract | Shared contract first | Core |
| [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207) | Prove the richer pirate-village style in one runtime vertical slice | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206) | Core |
| [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208) | Add bounded painted material and contact-shadow primitives | [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207) | Core |
| [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Keep richer art bounds, anchors and picking consistent | [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207) | Core |
| [VIS-05](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/210) | Redraw the existing cabin as the village hero building | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-06](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/211) | Restyle the full house and support-role family without losing level silhouettes | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-07](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/212) | Restyle the cannon level and firing family in the approved village look | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-08](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/213) | Restyle the mortar level and firing family in the approved village look | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-09](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/214) | Restyle the harpoon level and firing family in the approved village look | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-10](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/215) | Restyle the culverin level and firing family in the approved village look | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/216) | Restyle the swivel level and firing family in the approved village look | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-12](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/217) | Restyle the watchtower and harbor bell as readable tall landmarks | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-13](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/218) | Restyle the tech hub and arsenal without adding new building systems | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-14](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/219) | Restyle wall segments and joins without changing breach rules | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-15](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/220) | Bring captains, crew and boarders into the new material and scale language | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-16](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/221) | Bring the existing naval fleet into the reference material style | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-17](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/222) | Carry the richer style through damage and recovery states in both renderers | [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209), [VIS-07](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/212), [VIS-08](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/213), [VIS-09](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/214), [VIS-10](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/215), [VIS-11](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/216), [VIS-14](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/219) | Core |
| [VIS-18](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/223) | Integrate the richer art with deterministic depth and phase handoff | [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209), [VIS-05](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/210), [VIS-06](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/211), [VIS-12](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/217), [VIS-13](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/218), [VIS-15](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/220), [VIS-16](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/221), [VIS-17](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/222), [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224), [VIS-22](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/227), [VIS-27](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/232), [VIS-29](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/234) | Core |
| [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224) | Paint layered rock cliffs and a readable grass lip around the current island | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206), [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207), [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-20](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/225) | Give existing village paths stone edges and grass a richer terrain material | [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224), [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208) | Core |
| [VIS-21](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/226) | Redraw palms, trees, rocks and shrubs with the reference material depth | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-22](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/227) | Compose a lush island edge while keeping build space and attack windows clear | [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224), [VIS-21](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/226) | Core |
| [VIS-23](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/228) | Tune the existing sea and foam to the new cliff waterline | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206), [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224) | Core |
| [VIS-24](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/229) | Add a warm nautical cove and mooring set without inventing new walkable land | [VIS-21](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/226), [VIS-22](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/227) | Core |
| [VIS-25](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/230) | Agree a usable home-pier surface, shore access and existing-service contract | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206) | Optional / conditional |
| [VIS-26](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/231) | Implement the approved walkable home pier and real existing-service access | [VIS-25](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/230), [VIS-19](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/224), [VIS-24](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/229) | Optional / conditional |
| [VIS-27](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/232) | Give existing Move mode a ground grid, ghost and explicit validity marker | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-28](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/233) | Give the existing Move bar a real building portrait and directional layout | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Core |
| [VIS-29](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/234) | Restyle existing combat effects without obscuring play | [VIS-03](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/208), [VIS-07](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/212), [VIS-16](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/221) | Core |
| [VIS-30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/235) | Keep new art within atlas, load and lifecycle budgets | [VIS-18](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/223), [VIS-20](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/225), [VIS-23](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/228), [VIS-24](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/229), [VIS-28](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/233) | Core |
| [VIS-31](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236) | Accept the reference style in a complete playable village scene | [VIS-30](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/235) | Core |
| [VIS-32](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/237) | Conditionally support original sprite assets if the style proof rejects painters | [VIS-01](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/206), [VIS-02](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/207), [VIS-04](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/209) | Optional / conditional |

## Extend existing tasks rather than duplicate features

These eight existing issues received reference-specific acceptance. No second implementation ticket was created for a full HUD, camera, catalogue or general action-dock feature.

| Existing task | Reference refinement |
|---|---|
| [BASE-02 #143](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/143) | Keep camera work in the existing task; fit richer actual visual bounds. |
| [BASE-05 #146](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/146) | Use the reference HUD composition with truthful coin and wave sources. |
| [BASE-06 #147](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/147) | Keep the general selected-building action dock in this existing task. |
| [BASE-08 #149](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/149) | Assess identity and level at actual whole-village size, not only on a large art board. |
| [BASE-09 #150](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/150) | Split the reference environment into concrete child tasks against current main. |
| [BASE-15 #156](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/156) | Make actual coverage readable beside the new grid and materials. |
| [BASE-38 #179](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/179) | Reuse the style Move preview for the future catalogue confirmation flow. |
| [BASE-48 #189](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/189) | Use the style gate as one evidence slice of the wider playable loop. |

## Parallel work and completion

After art-route acceptance and the shared frame contract, building families, terrain and Move presentation can progress in separate clones. One active integration owner coordinates shared registry, world, combat, resource and ground hooks. [PARALLEL-WORK.md](PARALLEL-WORK.md) gives an initial allocation and exact handoffs.

VIS-25/26 are an optional genuinely usable new pier. Implementation stays blocked until walking, building eligibility, naval geometry and combat-phase policy are reviewed. They do not block the core style gate. Without that route, shore dressing must not imply that a nonfunctional off-shore deck is a usable path. VIS-32 is selected only by an explicit art-route decision.

Every task includes likely files, a small plan, acceptance, concrete input/action/expected cases, verification, risks and three explain-back questions. Together the children contain **96 cases**, **96 questions** and **170 acceptance checks**. Both the default and selected-image dependency graphs are acyclic.

The final gate needs actual-game paired captures at **1280 × 720** and **375 × 812**, real selection/Move/cancel/confirm, long refusals, wave transitions, damage/recovery states and resource measurements. An isolated art sheet is supplementary and cannot replace this proof.

This does not complete the wider base-building roadmap, land growth, free-wall permissions, atomic catalogue purchases or highscore continuity. It adds no online-play requirement. Submission/freeze rules remain unchanged; larger work is scheduled by the team. Author walkthrough and a different human’s review remain required before a merge.

**Changed:** tasks, preserved reference and planning documents. **Verified:** GitHub publication/read-back, source links and dependencies. **Not verified:** future runtime appearance, interaction, Safari, physical phones or production. **Remaining:** assignment and scoped implementation. **Branch/PR:** `docs/vis-00-reference-roadmap`, [Draft #204](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/204); no merge by this request.


[Current-game / target-concept comparison](COMPARISON.md). The source baseline passed 75 existing tests in 6 files; target-style functionality is not implemented by this documentation.
