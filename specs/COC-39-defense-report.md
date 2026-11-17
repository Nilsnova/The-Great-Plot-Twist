# COC-39: the last local defense report

Responsible teammate: Johannes Franz Lang (`frcola`). Task: [#180](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/180). This is the bounded collector and read-only menu slice; tactical recommendations and camera navigation remain COC-40. No merge, feature activation, migration or deployment is authorized by this note.

## Resulting behavior

After an island wave ends, **Menu → Last defense report** shows its end reason, observed heart damage, per-structure damage taken/dealt and zero-HP transitions. A structure's initial spot ID and position remain in the report so a player can identify it. Structures with no observed activity are omitted from the view. The report appears only after a completed local wave, is unavailable during the next active island wave, and clears when travelling or resetting the island. It is held only in memory for this game session.

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
| Damage taken | Positive observed wall/tower damage for a known initial ID | Unknown IDs do not create an unbounded registry |
| Damage done | Positive observed ship/boarder hit damage whose `by` equals a known defense ID | Not a predicted DPS value or claim of whole-kill attribution |
| Breaks | Positive damage causing HP zero after the structure was not already broken | Known repair/rebuild with positive HP enables a later distinct break |
| Loot | The existing finish answer's accepted amount | Pending, refused and unknown are never displayed as awarded money |

Only walls, cannon, mortar, harpoon, culverin and swivel defenses enter the aggregate. Houses and watchtowers are not introduced as damageable structures. At most 64 structure entries are retained, which exceeds the current bounded catalogue without creating unlimited history. One current and one last-wave aggregate are kept; older results are discarded.

## Repetition, replay and context

Identical real hit events both count. The current event format has no global event UID, so content hashing would wrongly erase legitimate identical hits. A duplicate start for the same current wave does not reset its aggregate. A future complete replay must explicitly `clear()` and `begin()` before rebuilding; it must not append a second copy of the history. This API is documented and tested; integrating Ianno's future ordered replay remains an owner-coordinated follow-up.

Report payout updates match a retained wave UUID and cannot confirm a different wave. A confirmed amount is immutable to later failure/double-answer updates. A late answer for an evicted wave is ignored. Travel/reset clears state and closes the modal; ordinary UI redraw reads copied data. Starting another wave closes the old report and removes its menu entry during active combat.

## Verification

Actual focused runs so far:

- `npm test -- --maxWorkers=1 tests/pirates/defense-report.test.js tests/pirates/multiplayer.test.js`: **24 passed, 2 files, 868 ms** after the menu-active-wave guard. The final observer-isolation wrapper will be included in the next focused rerun.
- `npm test -- --maxWorkers=1 tests/pirates/defense-report-dom.test.js`: **2 passed, 1 file, 5.60 s** before that guard; final rerun is pending the shared browser slot.
- `node scripts/text-lint/index.mjs`: **0 errors, 8 report-only findings** on the branch's player text before that guard; those existing report-only findings remain outside this feature.

The tests cover identical legitimate hits, zero-HP transitions and rebuilding, explicit replay rebuilding, payout guards, memory bounds, copied snapshots, actual `mountPirates` event forwarding and the actual running-game wiring's reachable menu provider. DOM cases at 1280×720 and 375×812 exercise end reason, amounts, stale payout, Escape/focus, travel cleanup and overflow.

`frontend/scripts/capture-defense-report.js` is prepared for four before/after screenshots. It renders the existing real pause menu and the branch's real report component using a controlled `createWave` event stream. It makes no API writes and does not claim a production backend run. Captures and the final browser rerun remain pending until Root releases the exclusive browser slot. Full-suite/build/budget/a11y/demo validation is coordinated centrally by Root and is not claimed here.

## Explain-back preparation

The change adds a small listener and a report view around the existing simulation. It reuses the real event hook and the real finish adapter so it does not become a second combat or payment system. Local observations can help a player understand a loss, but they cannot prove a fair score or recreate missing multiplayer inputs. A replay integration could later rebuild the same aggregate from the approved ordered history. COC-40 can consume copied report data for a separate navigation surface.

Johannes should rehearse these questions from the actual diff before requesting ready review:

1. Why are identical hit events counted twice, while an explicit replay must rebuild the aggregate?
2. How can the report show a known local end reason while coins are still pending?
3. Why does travelling or resetting clear the report instead of applying a late result to the new island?
