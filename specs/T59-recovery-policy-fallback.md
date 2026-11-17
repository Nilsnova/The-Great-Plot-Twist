# T59 saved recovery policy fallback

- **Issue:** [#344](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/344)
- **Responsible teammate:** Ianno (@Iannomh123456)
- **Branch:** `fix/recovery-policy-fallback`
- **Scope:** preserve a saved recovery-v1 policy when `GET /api/island/structures` temporarily answers `feature_off`.

## Bug

The island API can already identify a saved recovery-v1 island, or the client can have learned recovery-v1 from an earlier canonical structure read. If a later structure read answers `feature_off`, treating that response as a legacy-policy signal loses the saved version. The UI can then show the legacy wall Repair card and allow a tower upgrade without checking current canonical health.

## Fix

When the target island or the last canonical structure response identifies recovery v1, keep that policy through `feature_off`, show the health-load error, and retain the cached version for retry. A structure read must be ready before cards use its HP for repair or upgrade decisions. Legacy islands still treat `feature_off` as recovery disabled. A transient read failure keeps the last-known world damage appearance; paid repair and upgrades remain unavailable until canonical health is ready.

## Verification

The browser fixture regression covers both a first `feature_off` response with canonical island version 1 and a later `feature_off` after recovery v1 was learned from a successful structure response. It checks that the error appears, legacy wall Repair stays hidden, tower upgrades stay disabled, and a later successful read restores the card. The fixture also exercises the existing version-0 fallback.

Focused frontend verification: `./node_modules/.bin/vitest run --maxWorkers=1 tests/island/structure-recovery-policy.test.js tests/island/structure-recovery-upgrade-dom.test.js tests/island/structure-recovery-card.test.js tests/island/structure-recovery-card-dom.test.js tests/island/card-model.test.js tests/island/structure-recovery-model.test.js tests/island/structure-recovery-api.test.js tests/island/captain-recovery-tree.test.js tests/campaign/captain-repair-policy.test.js` passed 103 tests across 9 files. These checks use local fixtures; they do not demonstrate live API, database, payment or multiplayer behavior.

Optional browser fixture captures show the Wall health-load error at 1440 × 900 and the disabled Cannon upgrade at 375 × 812: [Wall](../frontend/captures/t59-policy-fallback-wall-error-desktop.png), [Cannon](../frontend/captures/t59-policy-fallback-cannon-phone.png). The cards are real DOM UI with production styles, driven by a local fake-island/API-shaped response; they are not live service evidence.
