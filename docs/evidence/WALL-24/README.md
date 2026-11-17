# WALL-24 actual-game evidence

These are actual Chromium screenshots of the unmerged local game. They establish the bounded functional prototype on source `525c2ab470d455ac76414bb0b963526897519008`, `frontend/src` tree `64864989885cf3afa9fc5d1e4e663c8b0a6fed84`, using QA helper revision `a1c8509b8e9023b00e89b1b893f07a990f1cacfd`. [Machine-readable actions, positions, receipts and rendering report](report.json).

The corrected phone workspace passes its bounded acceptance guards: expanded controls are 316.1px high, every enabled control has an unobscured 44px target, visible 17px text fits its actual padding clip box without horizontal scroll overflow, and the canonical shore clears the panel by 34.6px. The separate actual quoted-state probe measures 335.0px and 33.2px clearance. WALL-44 fixes the layout/inset and Cancel-label defects; WALL-45 reduces joined-wall drawing while retaining the exact logical connections. Final human art/playability acceptance and production rollout remain open.

The superseded `b1755351` functional pass, its roughly 516px phone defect and original screenshots/report are preserved in [historical evidence commit `4a5105fb`](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/4a5105fb0f16cd26c492b917590d8e643f2e47e9/docs/evidence/WALL-24). The images linked below are the corrected combined source.

| Phone software comparison, 375 × 812 | Actual screenshot |
|---|---|
| Before: `b1755351`, expanded two-wall unpaid draft | [Untouched software-before](software-before-b175-phone.png) |
| After: `525c2ab4`, expanded two-wall unpaid draft | [Corrected software-after](unpaid-ghost-375x812.png) |

The software-before PNG is copied byte-for-byte from the historical actual game capture (SHA-256 `a9992fafa8d6c6b1be0db8b087e2646a37cf262a142cd58b8885d96ee1afc41b`). Both show their source's actual controls/camera. The later combined source also includes main's narrator/guest updates; this is a software-state comparison, rather than an isolated CSS benchmark. The construction pairs below use one source on both sides.

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
| Unpaid draft and expanded fine controls | [Desktop](unpaid-ghost-1280x720.png) | [Corrected phone](unpaid-ghost-375x812.png) |
| Frozen local-demo wave before breach | [Desktop](wave-standing-1280x720.png) | [Phone](wave-standing-375x812.png) |
| Actual first wall breach | [Desktop](wave-breach-1280x720.png) | [Phone](wave-breach-375x812.png) |

The bounded real-phone workspace probe also records [unquoted](workspace/workspace-unquoted-375x812.png) and [quoted](workspace/workspace-quoted-375x812.png) controls, with [its own metadata](workspace/workspace-report.json). It uses a smaller declared 5,000-coin/best-7 fixture with empty building sites; only normal pointer/key/fine/quote/Cancel actions occur and the wallet is unchanged. It establishes the quoted 335px layout without presenting that fixture as the full paid journey. Reproduce with `node frontend/scripts/probe-perimeter-wave.mjs <runtime-frontend> <output> workspace`.

## Exact recorded results

Command from the QA checkout:

```sh
node frontend/scripts/capture-perimeter-game.mjs /workspace/village-perimeter-work/integration/frontend /workspace/village-perimeter-work/wall-24-final-525-v2
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
| Visible text / scroll overflow at actual 17px font | Fits / none | Fits / none |
| Expanded builder height / shore clearance | 183.8px / 43.8px | 316.1px / 34.6px |
| Delayed Move refusal shore clearance | 36.7px | 23.1px |
| Native snapshot drawing size | 1280 × 720 | 375 × 812 |
| Paid Fit/working draw calls | 235 | 235 |
| Paid Fit/working geometry / textures | 199 / 30 | 199 / 30 |
| Logical world joins / draw meshes | 106 / 36 | 106 / 36 |
| Standing / first-breach joins | 106 / 104 | 106 / 104 |
| First broken wall | `wall_56` | `wall_56` |
| Actual local-demo wave / seed | 41 / 25135766 | 41 / 25135766 |
| Cannon world/atlas cases / max delta | 40 / 0 | 40 / 0 |
| Page exceptions / external requests | 0 / 0 | 0 / 0 |
| Deliberate offline-service console 503 lines | 2 | 2 |

The differing 18/20 accelerated seconds at observation reflect real-frame polling, not a deterministic first-break timing claim. The frozen seed and source are recorded. Each screenshot requests existing high quality through the game's own preference before recording its actual renderer metadata. The desktop adaptive renderer had previously reduced density to 0.5; the snapshots were taken at native pixel ratio 1. These stills do not prove sustained frame rate or memory stability over repeated travel.

Visible text uses a DOM Range inside the actual padding clip rectangle plus `scrollWidth <= clientWidth`. A rejected QA assumption used the smaller CSS content rectangle vertically: the normal phone Build walls label's font ascent starts 1px above its content top (658.719px versus 659.719px), while remaining well inside padding (649.719px) with scroll/client width both 108px. That ascent is visible and unclipped. The corrected guard retains real horizontal overflow protection. Phone Cancel now measures 68.25px wide, its full 56.25px label lies at 293.75–350px inside padding 289.75–354px, and scroll/client widths are both 64px. The full and quoted-probe reports preserve these actual rectangles.

The live observer reads cloned logical `wallLinks` independently from draw-mesh counts: the actual accepted zero-HP break changes 106 logical joins to 104 while 36 painter-layer meshes remain. WALL-45's separate parity tests verify actual position/color/index buffers omit broken links; its matching before/after no-reload metric fixture measures 375 → 235 calls, 330 → 260 geometries and 38 unchanged textures at both sizes. That cache/lifetime point differs from this report's reloaded scene. The whole-scene under-150 target remains open.

The two console resource errors per viewport are the deliberately closed services from `api-browser-fixture.js`; its config response is 200 and other API services answer 503. The fake island uses its own actual in-memory/shared transport. No global clean-console claim is made.

Supplementary sheets are generated from real raster routes and **are not gameplay screenshots**: desktop [density 1.5](supplementary-cannon-1280-1.5.png) / [density 2](supplementary-cannon-1280-2.png); phone [density 1.5](supplementary-cannon-375-1.5.png) / [density 2](supplementary-cannon-375-2.png).

## Limits and handover

This proof found the normal-bell event losing the frozen demo; WALL-43 fixes that adapter and supplies API → normal flow → bus → real controller regressions. The final screenshots above use the corrected adapter. Prior failed/diagnostic runs are excluded.

Remaining: final human art/playability acceptance, Safari/physical devices, sustained performance, broader automated suites and production authorization. Real HTTP/private PostgreSQL evidence belongs to WALL-38 and the coordinator's separate results. Nothing here applies a live migration, enables a deployed offer, merges a PR or establishes completion of all visual families or WALL-24 rollout gates.
