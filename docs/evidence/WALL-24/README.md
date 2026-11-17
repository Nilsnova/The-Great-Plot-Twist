# WALL-24 actual-game evidence

These are actual Chromium screenshots of the unmerged local game. They establish the bounded functional prototype on source `b1755351b07e5c7e76c22de199ab5ddb70068d0c`, frontend tree `85f2140ffd36b4c488fc3105dc89d7dde649191e`, using QA helper revision `1ba621da2728a61bf0cc04aa94dcab51ce772366`. [Machine-readable actions, positions, receipts and rendering report](report.json).

**Visual acceptance remains open.** The expanded phone Fine position panel consumes about 516px and the island's southern edge overlaps its inset. WALL-44 is addressing the real layout and camera measurement. The phone image is retained as evidence of that defect. A subsequent source revision must supply superseding captures before calling the phone workspace accepted.

## What was exercised

The fixture uses the existing shared local fake API, with `perimeter_walls` and `wall_recovery` explicitly enabled. It starts with 8,000 coins, best wave 40 and seven ordinary paid level-1 buildings. That declared progression opens the necessary catalogue; it is not the default player experience. Noon and a captain beside the bell are reapplied when a new page opens. No wall positions, saved purchases, receipts or wallets are injected after setup.

1. Real Menu → Manage village → Build walls, a normal canvas click and ArrowUp create the first two exact cells. Actual fine-arrow buttons shift the whole unpaid draft by 0.5 and back. Two real ghosts and their fine grid are present. Cancel leaves the wallet and built inventory unchanged.
2. Long drafting uses the **public builder controller**, explicitly separated from the pointer/keyboard proof. Four real Get price/Build confirmations purchase 32/32/32/6 pieces. Their prices are 320/320/320/60 coins, with four distinct persisted receipt identities and 102 paired IDs/positions.
3. An actual page reload and normal Continue/Start route recover all paid positions, levels, coins and receipts from the shared fake world. The actual wall card upgrades `wall_1` for 20 coins. The final wallet is 6,660 coins.
4. Normal Zoom/Fit/Exit controls preserve the captain. A declared one-request delayed Move refusal starts from a valid empty square; the ordinary Place here button receives the refusal, payment stays unchanged and the real camera responds to its larger measured panel.
5. A nearby captain selects the actual bell and presses its ordinary Ring the bell button. The accepted API answer reaches the actual game controller with a frozen local-demo version 1, `pathing:true`, `perimeterWalls:true` and all 102 paid walls. Browser clock acceleration advances the real controller/simulation/renderer; combat state is not fabricated.
6. The actual accepted HP break removes exactly the relevant visual joins. World joins are absent during combat. The real world material and combat-atlas cannon routes also pass 40 raster cases per viewport: five levels, four states, two densities, with maximum pixel delta 0.

The measured fixture follows legal free-grid terrain and required coastal service/landing exclusions. It is one reproducible layout, rather than an optimal defense or a new default save. The paid upgrade changes one wooden post to level 2; other material families and the wider reference-village art programme remain separate.

## Before and after construction

Both sides below use the **same tested source** and real renderer. “Before” means before buying the 102-piece ring. Earlier software-before terrain comparisons belong to VIS-19. Generated reference artwork remains a concept target.

| View | Before purchase | After purchase and one upgrade |
|---|---|---|
| Desktop Fit, 1280 × 720 | [Before](before-construction-1280x720.png) | [After](after-construction-1280x720.png) |
| Desktop working Zoom | [Before](before-working-zoom-1280x720.png) | [After](working-zoom-1280x720.png) |
| Phone Fit, 375 × 812 | [Before](before-construction-375x812.png) | [After](after-construction-375x812.png) |
| Phone working Zoom | [Before](before-working-zoom-375x812.png) | [After](working-zoom-375x812.png) |

| Actual state | Desktop | Phone |
|---|---|---|
| Unpaid draft and expanded fine controls | [Desktop](unpaid-ghost-1280x720.png) | [Phone: known composition defect](unpaid-ghost-375x812.png) |
| Frozen local-demo wave before breach | [Desktop](wave-standing-1280x720.png) | [Phone](wave-standing-375x812.png) |
| Actual first wall breach | [Desktop](wave-breach-1280x720.png) | [Phone](wave-breach-375x812.png) |

## Exact recorded results

Command from the QA checkout:

```sh
node frontend/scripts/capture-perimeter-game.mjs /workspace/village-perimeter-work/integration/frontend /workspace/village-perimeter-work/wall-24-accepted
```

```text
PASS: 2 actual-game viewports; 4 paid runs each / 102 exact walls, cancel/reload/upgrade/camera/refusal, frozen wave and 40 cannon frames each; 0 page errors / 0 external requests
```

| Metric | Desktop | Phone |
|---|---:|---:|
| Paid walls / final wallet | 102 / 6,660 | 102 / 6,660 |
| Paid construction / wall upgrade | 1,020 / 20 | 1,020 / 20 |
| Visible enabled target minimum | 44px | 44px |
| Recorded control centers hit-tested | All | All |
| Delayed Move refusal shore clearance | 36.7px | 10.7px |
| Native snapshot drawing size | 1280 × 720 | 375 × 812 |
| Paid Fit/working draw calls | 375 | 375 |
| Paid Fit/working geometry / textures | 269 / 30 | 269 / 30 |
| Standing / first-breach joins | 106 / 104 | 106 / 104 |
| First broken wall | `wall_56` | `wall_56` |
| Actual local-demo wave / seed | 41 / 25135766 | 41 / 25135766 |
| Cannon world/atlas cases / max delta | 40 / 0 | 40 / 0 |
| Page exceptions / external requests | 0 / 0 | 0 / 0 |
| Deliberate offline-service console 503 lines | 2 | 2 |

The differing 15/20 accelerated seconds at observation reflect real-frame polling, not a deterministic first-break timing claim. The frozen seed and source are recorded. Each screenshot requests existing high quality through the game's own preference before recording its actual renderer metadata. The desktop adaptive renderer had previously reduced density to 0.5; the snapshots were taken at native pixel ratio 1. These stills do not prove sustained frame rate or memory stability over repeated travel.

The two console resource errors per viewport are the deliberately closed services from `api-browser-fixture.js`; its config response is 200 and other API services answer 503. The fake island uses its own actual in-memory/shared transport. No global clean-console claim is made.

Supplementary sheets are generated from real raster routes and **are not gameplay screenshots**: desktop [density 1.5](supplementary-cannon-1280-1.5.png) / [density 2](supplementary-cannon-1280-2.png); phone [density 1.5](supplementary-cannon-375-1.5.png) / [density 2](supplementary-cannon-375-2.png).

## Limits and handover

This proof found the normal-bell event losing the frozen demo; WALL-43 fixes that adapter and supplies API → normal flow → bus → real controller regressions. The final screenshots above use the corrected adapter. Prior failed/diagnostic runs are excluded.

Remaining: WALL-44 phone workspace correction and superseding evidence, final human art/playability acceptance, Safari/physical devices, sustained performance, broader automated suites and production authorization. Real HTTP/private PostgreSQL evidence belongs to WALL-38 and the coordinator's separate results. Nothing here applies a live migration, enables a deployed offer, merges a PR or establishes completion of all visual families or WALL-24 rollout gates.
