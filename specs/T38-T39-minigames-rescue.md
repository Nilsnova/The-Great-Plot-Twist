# T38 + T39 Minigame difficulty and the last-chance rescue

> **What this is:** wave-based difficulty curves for every wave minigame (T39, implemented) and the design plus the
> self-contained code of the last-chance rescue after a lost wave (T38, implemented except one small sim hook).
>
> **Who uses it:** the experience/progression lane, the owner of `frontend/src/pirates/sim.js` (for the hook),
> T45 (score survives a rescue) and the reviewer.

- **Status:** in review on branch `feat/t38-t39-minigames-rescue`; decision [D044](../docs/DECISIONS.md#d044--last-chance-rescue-and-minigame-difficulty-by-wave--2026-11-14) PROPOSED (agreed by: pending team review)
- **Responsible teammate:** Nils (`Nilsnova`), who authorized this work; plan author Ianno (`Iannomh123456`), BUILD-PLAN §6 / OPEN-TODOS §9
- **Coding agent used:** yes; Nils stays responsible for its output.
- **Reviewer (a different human teammate):** to be named in the PR
- **Depends on:** T28 (merged machinery). T30/T37/T42 are not blockers for this scope: the rescue changes no building, wallet or permission state (see "Interactions").
- **Feature flag:** `rescue` (server, off by default). With it off, the server ignores `rescued` and the game plays exactly as today.
- **Migration:** none. The rescue only changes the existing `p_restart_back` argument of `wave_finish()`.

## T39 — Audit: which activities count as minigames

| Activity | Where | Counts? | Why |
|---|---|---|---|
| Haul the chain (boss waves 5, 10) | `finisher/rules.js` `haul` | yes | timed skill task inside a wave |
| Aim the great cannon (boss waves 15–25) | `cannon` | yes | same |
| Board and duel (boss waves 30–95) | `duel` | yes | same |
| Captain Redtide (wave 100: all three, 80 samples each, two of three) | `redtide` | yes | same tasks, same curves at wave 100 |
| T28 first-time practice | `finisher/introduction.js` | yes, follows the run | practice now uses the **same frozen numbers** as the scored attempt |
| T38 last-chance rescue | `finisher/rescue.js` | yes (new) | timed co-op task after a lost wave |
| Wave events (galleon, barge, fog, …) | `pirates/wave-events.js` | no | battle conditions, no separate skill task; unchanged |
| Pirate Point lamps (`lamps_lit`) | `sim.js` | no | one action, not timed; unchanged |
| Lantern duels (A7), Harbor stalls, market calls, weather board | `harbor/`, `server/duels`, `server/market` | no | economy/strategy activities settled by the server on their own rules; **Harbor settlement rules are not changed** |

## T39 — Curves (current versus new)

Today the only wave dependence is *which* task a boss brings; every number inside a task is fixed. New
(`frontend/src/pirates/finisher/difficulty.js`): each number moves in a straight line from its early value
(today's, kept up to wave 10) to its late value at wave 100, `pressure = clamp((wave − 10) / 90, 0, 1)`.
Whole numbers are rounded, so they change at known waves only. Never past the late value.

| Task | Speed (target motion ×) | Timing window | Error budget | Changes at |
|---|---|---|---|---|
| haul | 1 → 1.3 | width 12 → 10 (easy 18 → 15) gauge units | in-zone share 60% → 65% (budget 40% → 35% of 10 s) | waves 5/10 unchanged; only Redtide's haul (wave 100) uses the late numbers |
| cannon | 1 → 1.3 | width 8 → 7 (easy 12 → 10.5); reload 0.5 s unchanged | hits 7 → 8 of ~20 possible shots | hits 8 from wave 55 |
| duel | — | prompt 0.9 s → 0.7 s (easy 1.3 s → 1.1 s) | right-net-of-wrong share 55% → 60%; a wrong arrow still −1 | prompt 0.8 s from wave 33, 0.7 s from wave 78 |
| rescue (new) | 0.85 → 1.15 | width 14 → 12 (easy 20 → 17) | in-zone share 50% → 58% of 10 s | kinder than a boss on purpose |

Examples (normal setting): wave 15 cannon 1.02× / width 7.94 / 7 hits; wave 30 duel prompt 9 / share 0.56;
wave 55 duel prompt 8 / share 0.57; wave 95 duel prompt 7 / share 0.6; wave 100 every task at its late value.

**Crew size.** Unchanged and separate: the goal is `per-captain goal × n × crewScale(n)` (one captain 100%,
ten captains 80% each). A solo captain can win every task at every wave.

**Shared snapshot.** A run reads `difficultySnapshot(tasks, wave)` once when it starts, from the server-given
wave number; it is frozen, exposed as `state().difficulty`, and used by scoring, the scene's drawing, the
practice and its goal text. A captain who joins later changes neither the numbers nor the goal. All clients of a
wave therefore agree. **Mixed client versions** of one wave would disagree for boss waves above 10 (old clients
use the early numbers): ship both together; the existing room has no version handshake.

**Playtest notes.** Simulated, not human: a "lagging" bot (0.3 s late on the needle, 0.2 s on the cannon, the
arrow 0.4 s into each prompt) wins every boundary wave alone and in crews of 2, 4 and 10 on both settings and
four seeds; at wave 100 it clears at least two of Redtide's three tasks; a wrong-input bot fails everywhere; a
captain idle for 38% of the haul wins at wave 10 and loses at wave 100. **Human playtests are still needed**
(T3): especially the 0.7 s duel prompt and the 1.3× haul at wave 100.

## T38 — Rescue rules (decision D044, proposed)

1. **Trigger.** The existing heart (the island's crossroads): the sim ends a wave with `island_lost` (heart hp 0)
   or `captains_fallen` (every present captain down). Either one, once per wave, offers the rescue. **No new
   central building** (it would depend on T33 health and T36 placement). Not on Pirate Point (flagship wave), not
   for a won wave or a timeout, not below wave 4, and only with the flag `rescue` on.
2. **Who plays.** Every captain still on the island at that moment, **fallen ones too** (they are "present":
   heard within the sim's `stale` window). Away/disconnected captains watch. With **no captain present**, there is
   no rescue and the wave ends exactly as today.
3. **The minigame.** "Last chance! Haul the treasure to safety": the haul's needle (hold Space / the Haul button /
   the pointer), 10 seconds, the treasure chest climbs the cliff with the crew's progress. It reuses the boss
   finisher machinery: the same scene, the same recorder, the same synced `finisher_input` / `finisher_ready`
   messages (ship id `rescue`), the same T28 first-time introduction and practice (bounded to 20 s instead of 60),
   the same grace time. Goal: `ceil(100 samples × share(wave) × n × crewScale(n))`, frozen at the start.
4. **Success / failure.** The wave is **lost either way** (no loot, no flag, no best wave). Success: the next bell
   rings the island's **best wave − 1**. Failure (or no rescue): **best wave − 2**, today's rule. Both at least 1.
5. **Wave zero.** Not a playable wave. `wave_best = 0` means "no wave won yet"; the bell never rings wave 0;
   every fallback is clamped to wave 1. Below wave 4 the best is at most 2, so both fallbacks give wave 1 and the
   rescue is not offered (nothing to save).
6. **Kept / lost.** Kept in both outcomes: coins (revive payments already made stay spent), buildings with their
   kind and level (their health follows whatever T30/T31 decide; the rescue changes nothing there), crew, captain
   level/skills/role, weapons, research. Lost: this wave's loot and flag; the current wave pointer falls back.
7. **Current vs best vs unlocked.** *Current* = `islands.next_wave` (null = best + 1): the only value a rescue
   changes. *Best* = `islands.wave_best` (leaderboard, flags): never lowered or overwritten. *Unlocked* =
   `islands.won_wave_best` per player: never lowered. T45 scoring may rely on this.
8. **Timeout.** Preparation ≤ 20 s (400 ticks), title 2 s, haul 10 s, grace ≤ ~2 s, outro ~2.5 s: at most about
   37 s, during which the battle stands still. Nobody playing simply fails. The server's 900 s wave maximum still
   applies: an expired finish pays 0 and (today's SQL) skips the restart rule, rescued or not.
9. **Disconnect / reconnect.** Participants and goal are frozen at the start. A captain who drops leaves the goal
   unchanged (the crew total counts, so partners can cover: half a crew of four can still save it, one captain of
   four cannot). A reconnecting client replays the room's inputs like any wave; its late windows still count up to
   the grace time. A watcher's input does nothing.
10. **Exactly-once settlement.** Every participant still finishes for themselves (`POST /api/waves/finish`,
    `survived: false`, plus `rescued: true` after a won rescue). The server (`island/rescue.py`) turns a rescue that
    counts into `p_restart_back = 1` (else 2). `wave_finish()` applies the restart rule only at the **first finish
    that closes the run** (row lock, `finished_at is null`, not `flag_counted`), so the first finisher decides once;
    repeats and later participants change nothing; a later survived finish of the same wave still wins over it.
    All clients run the same deterministic rescue, so their claims agree. Like `survived`, the claim cannot be
    proven: at worst a cheating client gains one wave of fallback, never loot, flags or a best wave.

**Accepted quirk.** The fallback is measured from the best wave, as today. Losing a *replay* wave (one below the
best) with a won rescue can therefore set the next bell one wave higher than the wave just lost, never above
best − 1. Clamping it to the lost wave would need the server to read `wave_best` or an SQL change; left for review.

### Interactions with other tasks

T30/T31 (recovery) and T37 (permissions) are untouched: the rescue neither repairs nor charges. T42 (absent
members): presence uses the sim's existing `presentAt`; if T42 changes who counts as present, the rescue follows.
T45 can show "best" without worrying about rescues. T33/T36: no new building, so nothing to place or damage.

## The sim hook still needed (owner of `sim.js`)

Without it the rescue never starts and nothing changes in the game. About ten lines in `createWave`:

```js
import { createRescue } from './finisher/rescue.js';
// next to createFinisher(...):
const rescue = createRescue({ wave: waveNumber, seed: options?.seed, enabled: options?.rescue === true && !withFlagship,
  preparation: options?.finisherPreparation === true, gapMs: typeof options?.gapMs === 'function' ? options.gapMs : null });
// after finisher.bind(...):
rescue.bind({ party, presentAt: (hero, t) => presentAt(hero, t), now: () => now(), heart });
// applyInput: hand the rescue the same messages, and freeze the battle while it runs
if (input.type === 'finisher_input' || input.type === 'finisher_ready') { finisher.input(input); rescue.input(input); return; }
if ((finisher.active || rescue.active) && input.type !== 'captain_move') return;
// end(reason, events), first lines:
if (rescue.active) return;                                     // the rescue decides; end() comes again after it
if (rescue.offer(reason, events)) return;                      // island_lost / captains_fallen: the last chance
// tick(), right after `if (done) return;` (before finisher.tick):
if (rescue.active) { if (!rescue.tick(events)) end(rescue.reason, events); return; }
// result(): add the rescue's flag
return { ..., ...rescue.result() };                            // {rescued: true} after a won rescue
// state(): the scene and controller already draw a finisher-shaped state
finisher: finisher.state() ?? rescue.state(),
```

The controller then passes `rescue: config.flags.rescue === true` in its sim options (one line in
`controller.js`, where it passes `finishers: true`), so the frontend **hides the rescue while the flag is off**.
Everything after that is already wired: `controller.submitFinish` sends `rescued: true` from `result()`,
`island/api.js` and `wave-flow.js` pass it on, `fake-api.js` applies the same rule. Add a sim test that a lost
wave with the option on waits for the rescue and that `result().rescued` follows its outcome, plus a
`test:mp` two-page run, in that PR.

## Done when (acceptance checks)

- [x] `cd frontend && npm test`: difficulty boundary waves, snapshot, playability, rescue rules and finish pass-through tests pass.
- [x] `cd frontend && npm run build` passes.
- [x] `cd backend && uv run pytest -q` and `uv run ruff check .` pass (`test_wave_rescue.py`).
- [x] Rescue scene screenshot via `?pirates=demo&practice=rescue` (dev harness checkpoint).
- [ ] Sim hook PR by the `sim.js` owner, then flag `rescue` on in a test environment and a two-browser run.
- [ ] Human playtest of late waves (T3) and team agreement on D044.
- [ ] A different human teammate has reviewed and approved the current change.

## Contracts touched

- [x] API: `POST /api/waves/finish` optional `rescued` (boolean, default false) — [INTERFACES.md](../docs/INTERFACES.md#t38-last-chance-rescue-and-t39-difficulty).
- [x] Shared lists: feature flag `rescue` (off by default, listed in `/api/config`).
- [x] Browser/room messages: none new (reuses `finisher_input` / `finisher_ready`; ship id `rescue`). New sim events `rescue_started`, `rescue_won`, `rescue_failed`, `rescue_ended` once the hook exists.
- [ ] Database: none.
- [x] Decision: D044 (proposed).

- **Last updated:** 2026-11-14
