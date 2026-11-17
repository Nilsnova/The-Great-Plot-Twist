# T58 Captain and Tech verification evidence

These screenshots render the production Captain/Tech/build-card DOM with controlled fixture models. The script passes `recoveryVersion: 1` directly to those models; it does not verify the canonical GET version getter or a saved island. The images do not show a live API response, active wave, payment, multiplayer room, deployed flag, or release activation.

The capture script is `frontend/scripts/capture-captain-repair.js`. Run it from `frontend/` with:

```sh
node scripts/capture-captain-repair.js
```

The screenshots are generated from source commit `db77e714`. Capture environment: Linux, Node.js `v24.22.1`, Chromium `156.0.8078.79` (`/usr/bin/chromium`).

The local Vite/browser fixture uses offline API stubs, then supplies fixture models to the production island UI components. The URL is `?islands=fake&fakeplayer=t58_fixture&fakename=Ianno`; no recovery activation flag is set. First-run tutorials, narrator captions, and transient help hints are disabled in the isolated browser context for clean screenshots. The fixture uses a saved-points Captain record containing all seven retired IDs (`points: 0`, `spent: 18`), Engineer role, researched Wall Tech tier 2 Mason Drill and tier 3 Bastion, and a damaged level-one wall. The UI therefore shows ordinary spent-point accounting while the version-1 tree omits the retired choices. Tech fixture text demonstrates Mason Drill's 1.5× modifier and Bastion's +50% max HP / 3× between-wave repair only when equipped to an individual wall. The wall-card fixtures include Mason Drill in their saved rate: Quick Mend has 60 max HP, 750,000/1,000,000 HP units, 5,000 rate units/second and a 50-second ETA; Bastion has 90 max HP, 750,000 HP units, 7,500 rate units/second and a rounded 34-second ETA. Both show the unchanged level-one price of 10 coins. Policy/model tests cover Quick Mend ×2 versus Bastion ×3 exclusivity, Mason stacking, the Engineer 10% construction and upgrade discount, and no island-wide Bastion effect from research alone.

The captured files are:

| Viewport | Fixture | Image |
|---|---|---|
| 1280 × 800 desktop | Legacy version-0 Captain tree with saved Shipwright choices | [captain-legacy-desktop.png](captain-legacy-desktop.png) |
| 1280 × 800 desktop | Captain and skills | [captain-desktop.png](captain-desktop.png) |
| 375 × 812 phone | Captain and skills | [captain-phone.png](captain-phone.png) |
| 1280 × 800 desktop | Wall Tech with Mason Drill researched | [tech-mason-drill-desktop.png](tech-mason-drill-desktop.png) |
| 375 × 812 phone | Wall Tech with Bastion researched | [tech-bastion-phone.png](tech-bastion-phone.png) |
| 1280 × 800 desktop | Quick Mend wall card | [wall-quick-mend-desktop.png](wall-quick-mend-desktop.png) |
| 375 × 812 phone | Bastion wall card | [wall-bastion-phone.png](wall-bastion-phone.png) |

The Captain-tree and help-copy checks were run with:

```sh
cd frontend
npm exec vitest -- run tests/tutorial-pages.test.js tests/tutorial/host.test.js tests/campaign/captain-repair-policy.test.js tests/island/captain-recovery-tree.test.js tests/island/card-model.test.js
npm run build
```

Result: 5 files, 66 tests passed; Vite transformed 504 modules and the spoiler guard passed. The recovery rate parity and structure-recovery view checks also passed:

```sh
cd frontend && npm exec vitest -- run tests/island/structure-recovery-policy.test.js tests/island/structure-recovery-model.test.js
cd backend && uv run pytest -q server/tests/test_structure_recovery_rate.py
```

Results: 2 frontend files / 29 tests, and 9 backend rate tests. The backend test used a task-local uv cache under `/tmp` because the default cache directory was read-only in this environment.

The tutorial host uses the read-only `island.recoveryVersion` value derived from canonical saved island state; the admission flag does not select the help copy. Version 0 retains the historical help, including manual E repair and Shipwright choices. Version 1 documents automatic between-wave recovery, the shared three successful Repair now uses from bell acceptance through finish/expiry, current-level fixed price, no special refund/respec, the retained E help-up and F firing controls, and the Engineer discount.

**Limits:** fixture screenshots are not persisted-API or live-game proof; they do not exercise a real wave, physical phone, multiplayer delivery, SQL transaction, payment, or runtime recovery. The combined T55/T57/T59/T60 review and full release checks are tracked separately; this draft evidence does not authorize activation or deployment.
