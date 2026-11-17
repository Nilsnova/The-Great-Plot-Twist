# COC-39: the last local defense report

Responsible teammate: Johannes Franz Lang (`frcola`). Task: [#180](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/180). This is the bounded collector and read-only menu slice; tactical recommendations and camera navigation remain COC-40. No merge, feature activation, migration or deployment is authorized by this note.

## Resulting behavior

After an island wave ends, **Menu → Last defense report** shows its end reason, observed heart damage, per-structure recorded hit damage/dealt damage and zero-HP transitions. A structure's initial spot ID and position remain in the report so a player can identify it. Structures with no observed activity are omitted from the view. The report appears only after a completed local wave, is unavailable during the next active island wave, and clears when travelling or resetting the island. It is held only in memory for this game session.

The report does not buy, repair, heal, move or upgrade anything. It does not submit another finish result or award coins. Earlier report data cannot overwrite the current wallet, island, health or score.

## Data path and authority

1. The existing controller emits `wave_controller_started`. The feature starts a bounded aggregate for that wave/context and the known supported defense IDs.
2. `mountPirates` forwards its **island** controller's existing `onEvents` batches through `game-wiring.js`. The Pirate Point controller is not a source for this report.
3. `defense-report.js` consumes each ordered local batch once. It accepts existing `island_damaged`, `wall_damaged`, `tower_damaged`, `ship_hit`, `boarder_hit` and repair/rebuild/end events. No combat code or event payload changes.
4. On `wave_ended`, the aggregate becomes the last report. The UI reads copied values; repainting cannot add damage.
5. The existing finish adapter still makes the single real finish request. Only its successful answer with a nonnegative integer `loot` confirms the report's coin figure. A too-early response remains pending for the controller's existing retry. Other client refusals and unknown network/server outcomes have separate report states.

The local controller and existing bus are not proof of every combat hit. In particular, `wave_started_server` currently does not forward a verified full input history or a completeness capability. Every live report therefore explicitly says **Local report. Earlier actions may be missing.** A late join cannot silently claim complete history.

## Statistics and boundaries

| Field | Meaning | Limit |
|---|---|---|
| Heart damage | Sum of positive finite observed `island_damaged.damage` values | Not inferred from final HP; healing is not negative damage |
| Hit damage | Positive reported wall/tower hit damage for a known initial ID | Legacy ship shells can report raw damage beyond remaining HP; this is not exact HP loss. Unknown IDs do not create an unbounded registry |
| Damage done | Positive observed ship/boarder hit damage whose `by` equals a known defense ID | Not a predicted DPS value or claim of whole-kill attribution |
| Breaks | Positive damage causing HP zero after the structure was not already broken | Known repair/rebuild with positive HP enables a later distinct break |
| Loot | The existing finish answer's accepted amount | Pending, refused and unknown are never displayed as awarded money |

An independent source review identified the legacy shell path in `sim.js`: it clamps wall HP but emits the raw incoming shell damage. The UI therefore names the field **Hit damage** and explicitly warns that it can exceed health lost; the report does not invent missing pre-hit HP or change combat.

Only walls, cannon, mortar, harpoon, culverin and swivel defenses enter the aggregate. Houses and watchtowers are not introduced as damageable structures. Each aggregate has at most 64 entries. At most a current and a last-wave aggregate are retained (128 entries total while they differ); older results are discarded.

## Repetition, replay and context

Identical real hit events both count. The current event format has no global event UID, so content hashing would wrongly erase legitimate identical hits. A duplicate start for the same current wave does not reset its aggregate. A future complete replay must explicitly `clear()` and `begin()` before rebuilding; it must not append a second copy of the history. This API is documented and tested; integrating Ianno's future ordered replay remains an owner-coordinated follow-up.

Report payout updates match a retained wave UUID and cannot confirm a different wave. A confirmed amount is immutable to later failure/double-answer updates. A late answer for an evicted wave is ignored. Travel/reset clears state and closes the modal; ordinary UI redraw reads copied data. Starting another wave closes the old report and removes its menu entry during active combat.

## Input ownership

The report is an input-owning modal, not merely a native top-layer dialog. `mountDefenseReport.active` is exposed as `wireWaves.reportActive`; both `externalOverlay` and `worldBlocked` in `game.js`, plus the game's public overlay query, include it. This stops world movement, touch paths and the gamepad's gameplay branch while report controls own input. Native dialog inertness alone does not gate window-level input state or controller polling.

Closing clears the report modal, resets input and returns focus to the canvas; normal movement resumes. Opening/closing does not stop the wave clock or change reservations. The report entry remains hidden during an active island wave and a new controller start closes the old report. The zero-building-hit message is explicit even if the heart was damaged, rather than falsely saying no damage happened anywhere.

A dedicated actual-game fake-server browser regression is added for this boundary: it reaches a real completed-wave report through the existing controller hook/menu, injects window-level keyboard state plus a standard-mapped gamepad axis, checks an unchanged captain position while open, and checks movement resumes after close. The isolated actual-game regression passed: **1 passed file / 1 passed test / 14.34 s**. Its first setup attempts used the wrong fake-helper property and lost the harness import helper after full-page navigation; those fixture issues were corrected without weakening the movement assertions. The initial mixed run's two DOM cases passed while that ownership fixture failed. No production gamepad or live payout is claimed.

## Verification

Actual focused runs so far:

- `npm test -- --maxWorkers=1 tests/pirates/defense-report-ownership.test.js`: **1 passed, 1 file, 14.34 s**. Actual game/world with local fake state, real keyboard/gamepad input paths and close-to-resume movement.

- `npm test -- --maxWorkers=1 tests/pirates/defense-report.test.js tests/pirates/multiplayer.test.js`: **25 passed, 2 files, 935 ms**, including the observer boundary and recorded-hit/overkill case.
- `npm test -- --maxWorkers=1 tests/pirates/defense-report-dom.test.js`: **2 passed, 1 file, 2.83 s** on the final view, including active-wave hiding and recorded-hit wording.
- `node scripts/text-lint/index.mjs`: **0 errors, 8 existing report-only findings**. The correctly spelled American English comparative `greater` was manually reviewed and added to the project vocabulary for the hit-damage warning.

An independent read-only source review found the raw-wall-hit/overkill ambiguity; the label and an explicit warning were corrected without changing combat. No other concrete defect was found in that review.

The tests cover identical legitimate hits, zero-HP transitions and rebuilding, explicit replay rebuilding, payout guards, memory bounds, copied snapshots, actual `mountPirates` event forwarding and the actual running-game wiring's reachable menu provider. DOM cases at 1280×720 and 375×812 exercise end reason, amounts, stale payout, Escape/focus, travel cleanup and overflow. The later mixed run also passed both DOM cases including positive heart damage with zero building hits; its overall command failed on the ownership fixture setup before that separate test was corrected and passed.

`node frontend/scripts/capture-defense-report.js` completed: **4 screenshots saved; 2 viewports; browser errors: 0; no API writes.** All four were visually inspected. It renders the existing real pause menu and the branch's real report component using a controlled `createWave` event stream. This is component evidence, not a production backend run. The screenshot JSON records actual event-derived values. Full-suite/build/budget/a11y/demo validation is coordinated centrally by Root and is not claimed here.

## Explain-back preparation

The change adds a small listener and a report view around the existing simulation. It reuses the real event hook and the real finish adapter so it does not become a second combat or payment system. Local observations can help a player understand a loss, but they cannot prove a fair score or recreate missing multiplayer inputs. A replay integration could later rebuild the same aggregate from the approved ordered history. COC-40 can consume copied report data for a separate navigation surface.

Johannes should rehearse these questions from the actual diff before requesting ready review:

1. Why are identical hit events counted twice, while an explicit replay must rebuild the aggregate?
2. How can the report show a known local end reason while coins are still pending?
3. Why does travelling or resetting clear the report instead of applying a late result to the new island?
