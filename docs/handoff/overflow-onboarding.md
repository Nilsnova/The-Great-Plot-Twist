# Overflow 3: first-time hints

The hint rules and optional quiet world card are ready for integration. They read the real adapter view and write only the existing device hint preferences. The card gives one action at a time: account, arrival kit, crew, signal station, first pin. No game progress, crew codes, account identifiers or tokens are stored by this feature.

## Integration seam

Load `src/shell/hints/onboarding.js` with the world, never from the cold title entry. Its CSS is imported by that module.

```js
const onboarding = createOnboarding({
  container,
  preferences: getPreferences(),
  onPreferences: setPreferences,
  onAction, // fixed actions below; open existing interfaces only after this click
  focus, // optional: return focus to the game after an explicit Dismiss
});
onboarding.update(adapterView, {introComplete});
onboarding.tick(deltaSeconds, {blocked});
onboarding.setPreferences(nextPreferences);
onboarding.active; // boolean
onboarding.dispose();
```

`onAction` receives one of `account`, `arrival`, `crew`, `islet`, `board`. Root owns routing and passes the account callback from the account UI. `introComplete` must come from the completed story or confirmed replayed ending facts. The default arrival label is not proof of story completion. An arrival action requires both `introComplete` and the actual pending arrival view. Before that, story guidance stays in the existing story UI. The widget never claims the kit or opens anything on its own.

Pass `blocked: true` during intro/dialogue, a room, cinematics, open panels/modals, map and held touch controls. The two-second active-play delay restarts while blocked. Show and hide do not move focus; only an explicit Dismiss can call `focus`. Keep the tip clear of contextual interaction prompts when wiring the world layout.

The existing `createHints` API is preserved. It additionally accepts `onboardingAction` and `readIntroComplete`; the What next screen uses the same hint rules, fixed IDs and device dismissals. Pass the full public adapter view to `update`, as before. A dismissal in either surface should be propagated to both with the existing preferences listener.

Existing device storage (`plot_twist_preferences_v1`) handles malformed or denied storage. Hint history is validated and bounded at 100 IDs; a new dismissal evicts the oldest entry when full. No new storage key or account/cloud state is introduced. The five onboarding IDs are fixed strings.

## Verification

Passed locally:

- `cd frontend && npm test -- --maxWorkers=1 --reporter=dot tests/onboarding-hints.test.js tests/hints.test.js tests/preferences.test.js`: 18 tests, 3 files.
- `node scripts/text-lint/index.mjs --json`: zero editable diagnostics; 38 existing report-only notices.
- `git diff --check`.

Prepared, awaiting the coordinator's serialized browser run:

```sh
cd frontend
npm test -- --maxWorkers=1 --reporter=dot tests/onboarding-dom.test.js
```

These three real-DOM tests cover all five hints exactly once, action routing, preference reload, focus after dismissal, What next integration, 320/375/1280px bounds, 44px targets and reduced motion. This isolated component proof does not substitute for the coordinator's full game run, modal/touch blocking check, initial bundle budget or live sign-in/crew verification.

## Remaining

Root wires the world and What next callbacks, then runs the browser tests and final game verification. This branch does not change the database, feature flags, secrets, deployments, account state or story content.
