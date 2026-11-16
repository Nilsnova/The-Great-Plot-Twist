# Handoff: owner session, Mon 16 Nov 2026 (paused, continue in a cloud session)

Nothing in this note is live yet. Live is `main` at the time of writing (this morning's build). Every item below is on a branch.

## Branches to pick up

| Branch | What | State |
|---|---|---|
| `owner/integrate-2026-11-16` | The integration branch: `main` plus everything below that is merged and ready | Merged, NOT yet through the full checks |
| `feat/v3-t50-shipfire` | T50: ships fire at real targets (towers, walls, the heart) and hits cost health; the skull ring reads as a landing marker; flag and wave rule `ship_fire` | 4 commits, agent stopped before its final report; review it before merging |
| `review/rv-ianno` | Review of Ianno's PRs #86 (wall-record race) and #84 (tower path obstacles), plus one fix (`7c8fdfa0`: swivel nests block in the path field and guide) | 12 commits, agent stopped before its final report; review it before merging |

## Merged on `owner/integrate-2026-11-16`

- **T51** water behind the front door; the Play card comes first; a signed-out player who closes it goes back to the title (a play-test find).
- **T52** guided start on a new island (7 steps), a tutorial card for every unlock (`frontend/src/campaign/tutorials.json`, a test fails if one is missing), Settings switch and replay. 7 new narrator lines are captions only: a teammate voices them (see below).
- **T53** Settings › Reset my island: owner only, between waves, type the island code; migration `20261116070000_island_fresh_start.sql` (md5 `02bbd5dbb6ea6efea34618171a947fd8`), coins back to the catalogue's `startingCoins`.
- **Owner's review** of the merged T5, T7, T26, T27, T28 (approved in `docs/OPEN-TODOS.md`; T28 fix: a finisher scene that fails to load marks the player ready), spec PRs #85, #94, #106, #109 and the dependency pins.
- **Johannes's PRs** #92, #88, #90, #96, #98 (Harbor loading, arsenal context, retry, weapon comparison, filters), no bugs found.
- The T51/T52 front-door merge was combined by hand in `frontend/src/front-door/index.js` `run()`: T52's island gate plus T51's Play-card-first and signed-out `leave`. Front-door, tutorial, first-quest and island-mode tests pass (71).

## To do, in order

1. Review `feat/v3-t50-shipfire` and `review/rv-ianno` (read the commits; the agents did not report), merge both into `owner/integrate-2026-11-16`.
2. **Migration check before applying:** `20261116160000_ship_fire_rule.sql` (T50) and `20261116050100_tower_obstacles.sql` (Ianno) may both widen the same list of allowed wave rules. The later file must keep the earlier one's entries (the house-roles/research clash of 13 Nov was the same kind). Diff both against the latest applied definition.
3. Full checks on the integration branch: vitest, build, budget, text lint, `test:mp`, `test:a11y`, `test:demo`, `test:market`, backend pytest and ruff, the island SQL tests.
4. A real play-through as a new player: signed out → Play → guest → create a game → guided start → wave 1 (ships hit real targets, the heart loses health) → Settings › Reset my island → again.
5. Have the new migrations reviewed, apply them in order (050000, 050100, 070000, 160000) with the md5 check, then push to `main` and check live.
6. Switch on any new flag the T50 branch adds (read its commits; it says what to do).
7. Tell Nils when the reset setting is live.

## Other notes

- The owner's island ISLE-9G6UM was reset by hand twice today (backups in `~/Developer/fri6-integration/backups/` on Nils's Mac).
- Narrator voices: Nico voices the new lines with his own ElevenLabs key after the release (`python3 -I scripts/voice/generate.py --narrator --voice-id JBFqnCBsd6RMkjVDRZzb`); do not voice them from the owner's key.
- No personal names in code comments.
- Not done here: T25 (sender check in the wave room); the old branches `fix/v3-t25-sender`, `fix/v3-walls`, `fix/v3-menus` are stale and can be dropped.

## Integration on `integ/owner-0116` (16 Nov, evening)

Nils approved "push all to main". One branch from `main` with `git merge --no-ff` of `owner/integrate-2026-11-16`, `feat/v3-t50-shipfire`, `docs/74-own-words` (#119) and `feat/u-wave-preparation` (#94), plus the one fix commit of `review/rv-ianno` (`7c8fdfa0`, cherry-picked). Not taken:

- `review/rv-ianno`'s merges of #84/#86 (already on `main`) and its `79ad773d`, which renamed Ianno's migrations to `20261116050000`/`20261116050100`: `main` keeps `20261115150000_wall_restore_record_fence.sql` (applied live) and `20261115160000_tower_obstacles.sql` (not applied), so the same migration is never in twice.
- `feat/island-reset` (D054 "Start fresh", migration `20261116010000`, never applied): superseded by T53 (see DECISIONS D054).

**Migrations to apply, in this order, before `main` deploys** (the T53 Settings section calls the new function as soon as the backend is live, only behind the flag `islands`): paste [`apply-2026-11-16.sql`](apply-2026-11-16.sql) into the Supabase SQL editor. It holds `20261115160000_tower_obstacles`, `20261116070000_island_fresh_start` and `20261116160000_ship_fire_rule` verbatim, in one transaction, then registers the three versions. `20261116160000` is the last check rule and lists all six wave rule names (`tower_health`, `pathing`, `tower_obstacles`, `rescue`, `defenses_v2`, `ship_fire`).

Flags: no production flag is switched on. `ship_fire` (new) and `tower_obstacles` stay off; switch `ship_fire` on only after the SQL above is applied.
