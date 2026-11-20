// The wave controller's module-level constants and pure helpers (controller.js): recovery playout timing, the
// HUD's texts and timings, the captain's target pickers, the battle camera, the wave answer reader, the finish
// retry policy and the lazily loaded renderer, HUD, guide, event art and finisher scene. controller.js
// re-exports the public ones; import them from there.

import { CONFIG } from './sim.js';
import { captainStats } from './captain-stats.js';
import { getPreferences } from '../settings/preferences.js';
import { readWalls } from './wall-health.js';
import { readRules } from './wave-rules.js';
import { isParticipantToken, readRecoveryPolicy } from './recovery-policy.js';
import { readRecoverySnapshot } from './recovery-snapshot.js';
import { RECOVERY_POLL_LEAD_MS, RECOVERY_POLL_MARGIN_MS, RECOVERY_POLL_MIN_MS } from './recovery-transport.js';
import {nativeOrigin,validInitialCaptains} from '../island/shared-wave-shapes.js';

export const MAX_TICKS_PER_FRAME = 600;      // a friend joining late catches up 30 s of wave per frame
// Recovery waves (structure_recovery) may only run ticks the server has sealed, and the seal moves on
// each poll. Run them this far behind real time, like a video buffer, so ships and shots move every
// frame instead of freezing and jumping after each poll (#324). Only when ticks run changes, never what
// they compute. It covers a slow 450 ms round trip plus the gap between polls (recovery-transport.js),
// so a wave reads the journal about twice a second instead of back to back.
export const RECOVERY_PLAYOUT_MS = 1000;
// The playout follows the measured round trip (feat/recovery-teammate-instant) instead of a fixed second.
// A read answers the seal of about half a round trip earlier, and recoveryPollDue starts the next read when
// the sealed ticks left fall under max(LEAD, round trip + MARGIN); a playout P then reads every
// P + rtt/2 - that, so P = RECOVERY_POLL_GAP_MS + that - rtt/2 reads about twice a second (fed, and no more
// load than that), with RECOVERY_POLL_MIN_MS + 0.75 x rtt + 150 ms as the floor that never starves.
// Never under RECOVERY_PLAYOUT_MIN_MS nor over the configured RECOVERY_PLAYOUT_MS; it moves by at most
// PLAYOUT_SLEW_MS a second (a few ticks faster, or a short wait), so motion stays smooth.
export const RECOVERY_PLAYOUT_MIN_MS = 600;
export const RECOVERY_POLL_GAP_MS = 500, PLAYOUT_SLEW_MS = 100;
export function recoveryPlayoutTarget(rttMs, ceilingMs = RECOVERY_PLAYOUT_MS) {
  const rtt = Number.isFinite(rttMs) ? Math.max(0, rttMs) : 300;
  const trigger = Math.max(RECOVERY_POLL_LEAD_MS, rtt + RECOVERY_POLL_MARGIN_MS);
  const wanted = Math.max(RECOVERY_POLL_MIN_MS + 0.75 * rtt + 150, RECOVERY_POLL_GAP_MS + trigger - rtt / 2);
  return Math.min(Math.max(0, ceilingMs), Math.max(RECOVERY_PLAYOUT_MIN_MS, Math.round(wanted)));
}
// Cosmetic messages (shots and swings drawn on teammates' screens before the journal replays them): at
// most this many a second from one sender, sent and accepted.
export const COSMETIC_PER_SECOND = 8;
export const PREDICTION_TIMEOUT_MS = 4000;  // a drawn action the journal never replays is forgotten after this
export const CATCH_UP_TICKS = 40;
// Drawn at once for your own (and a teammate's) action; their replayed copies are not drawn again.
export const PREDICTED_KINDS = new Set(['captain_fired', 'captain_struck', 'captain_blast', 'boarder_hit', 'ship_hit']);           // two seconds behind the playout: "Catching up…"

export const RECOVERY_RTT_START_MS = 300;     // the round-trip guess before the first read has answered
export const SHOWN_LATE_SECONDS = 1;         // events older than this (catching up) are not drawn or heard
export const canonicalJson = value => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
export function validCanonicalClose(receipt, current) {
  const rows = current?.info?.initialSnapshot?.structures;
  if (!receipt || receipt.waveId !== current?.info?.waveId
    || receipt.islandEpoch !== current?.info?.initialSnapshot?.islandEpoch
    || !Number.isFinite(Date.parse(receipt.closedAt))
    || (receipt.checkpointUid !== null && (typeof receipt.checkpointUid !== 'string'
      || !/^[A-Za-z0-9_-]{8,64}$/.test(receipt.checkpointUid)))
    || !Number.isInteger(receipt.throughTick) || receipt.throughTick < 0 || receipt.throughTick > 18_000
    || !Number.isSafeInteger(receipt.inputHeadSeq) || receipt.inputHeadSeq < 0
    || !Number.isSafeInteger(receipt.lastRepairSeq) || receipt.lastRepairSeq < 0
    || !receipt.closedHp || typeof receipt.closedHp !== 'object' || Array.isArray(receipt.closedHp)
    || !receipt.basisRepairSeq || typeof receipt.basisRepairSeq !== 'object' || Array.isArray(receipt.basisRepairSeq)
    || !Array.isArray(rows)) return false;
  const ids = rows.map(row => row.instanceId);
  if (new Set(ids).size !== ids.length || ids.length !== Object.keys(receipt.closedHp).length
    || ids.length !== Object.keys(receipt.basisRepairSeq).length) return false;
  for (const id of ids) {
    const hp = receipt.closedHp[id], sequence = receipt.basisRepairSeq[id];
    if (!Object.hasOwn(receipt.closedHp, id) || !Object.hasOwn(receipt.basisRepairSeq, id)
      || !Number.isInteger(hp) || hp < 0 || hp > 1_000_000
      || !Number.isSafeInteger(sequence) || sequence < 0) return false;
  }
  return true;
}
export const END_BEAT_MS = 1800;             // the last ship sinks on screen before the cutscene
export const LOST_BEAT_MS = 4500;            // a lost run's result stays up a little longer
export const DEFAULT_WAIT_SECONDS = 5;
// A changed health vector is saved at most this often (a paid repair or the end saves at once).
export const HEALTH_CHECKPOINT_COALESCE_MS = 3000;
export const AIM_RADIUS = 8;                 // free aim: a ship this close to the aim point is hit
export const SETTLE_TICKS = 20000;           // more than the longest wave (900 s)
export const BREAK_GRACE_MS = 10000;         // with Auto next on, the break waits this long for the loot answer
export const MOVE_EVERY_MS = 500;     // captain health: your position at most this often (or 2 × the room's wave gap)
export const HEARD_EVERY_MS = 3000;   // and at least this often while you stand still (the sim's stale is 8 s)
// A recovery wave journals every move: standing still, the position goes out this often instead (an input
// lands within about 1.5 s of being sent, so a captain is heard again well inside the sim's 8 s stale).
export const RECOVERY_HEARD_EVERY_MS = 5000;
export const MOVE_STEP = .4;                 // units: a smaller move waits for the next HEARD_EVERY_MS
export const NOTE_MS = 3000;                 // a refused revive's words stay this long
export const LOST_FALLEN = 'Every captain fell.';
export const bossText = warships => (warships >= 2 ? '⚠ Boss wave: two warships!' : '⚠ Boss wave: a warship!');
export const BREAK_SECONDS = 8;       // the break after a won wave (TOWER-DEFENSE.md §1; faster pace, owner 11 Nov)
export const BOSS_WARNING_SECONDS = 6;       // the boss warning stays this long after the wave starts
export const AUTO_KEY = 'tgpt:pirates:auto-next';
export const HINT_KEY = 'tgpt:pirates:goal-hint';   // the first-wave hint (🏝️ → 🧱 → ❤️) shows once per device
export const HINT_SECONDS = 9;
export const readHint = () => { try { return globalThis.localStorage?.getItem(HINT_KEY) === '1'; } catch { return false; } };
export const writeHint = () => { try { globalThis.localStorage?.setItem(HINT_KEY, '1'); } catch { /* private mode: shown again next visit */ } };
export const LOST_TITLE = 'The pirates broke through';
export const LOST_LINE = 'Rebuild and ring the bell again.';
// The coins this player got for this wave (the server's finish answer), the same number as the HUD's "+".
export const roundLootText = loot => `Loot this wave: 🪙 ${Math.max(0, Math.round(loot) || 0)}`;
export const readAuto = () => { try { return globalThis.localStorage?.getItem(AUTO_KEY) === '1'; } catch { return false; } };
export const writeAuto = value => { try { globalThis.localStorage?.setItem(AUTO_KEY, value ? '1' : '0'); } catch { /* private mode: kept for this visit */ } };
/** The nearest ship or boarder within the captain's range of (x, z), or null. range: the gun's (captainStats). */
export function captainTarget(player, state, level = 1, range = captainStats(level).range) {
  let best = null, bestDistance = range;
  for (const item of [...(state?.boarders ?? []), ...(state?.ships ?? [])]) {
    const d = Math.hypot(item.x - player.x, item.z - player.z);
    if (d <= bestDistance) { best = item; bestDistance = d; }
  }
  return best;
}
/** The nearest boarder within cutlass reach of (x, z), or null: close quarters (TOWER-DEFENSE.md §12). */
export function bladeTarget(player, state, reach = CONFIG.captain.cutlass.reach) {
  let best = null, bestDistance = reach;
  for (const boarder of state?.boarders ?? []) {
    const d = Math.hypot(boarder.x - player.x, boarder.z - player.z);
    if (d <= bestDistance) { best = boarder; bestDistance = d; }
  }
  return best;
}
// The automatic cutlass (D052): after this many seconds without an attack of yours, a boarder in cutlass reach
// gets a blow every `reload` seconds (the hand-swung cutlass reloads in CONFIG.captain.cutlass.reload, 0.5 s).
export const AUTO_BLADE = Object.freeze({ after: 1, reload: 1.5 });
export const pirateById = (state, id) => state?.boarders?.find(item => item.id === id) ?? state?.ships?.find(item => item.id === id) ?? null;
export let atlasPromise = null, atlasKey = null;
// The heart's share below which the narrator hears heart_changed (its HEART_LOW).
export const HEART_WARN = 0.3;

// The wider view during a wave: cannons reach about 28 units, ships appear about 40 units out, so the
// camera shows about 34 units either side of the player (half zoom on a 16:9 screen, 0.4 on a phone).
export const battleZoom = camera => {
  const half = Number.isFinite(camera.right - camera.left) ? (camera.right - camera.left) / 2 : 17.8;
  return Math.max(.4, Math.min(.85, half / 34));
};
// Where the camera leans during a wave: from the player a little towards the ships (or the lanes they
// will come in on), at most 14 units across and 9 units up or down, so the player stays on screen.
export function battleLean(player, state, lanes = []) {
  if (!player) return { x: 0, z: 0 };
  const pirates = [...(state?.ships ?? []), ...(state?.boarders ?? [])];
  const points = pirates.length ? pirates : lanes;
  if (!points?.length) return { x: 0, z: 0 };
  let x = 0, z = 0;
  for (const point of points) { x += point.x; z += point.z; }
  x = x / points.length - player.x; z = z / points.length - player.z;
  return { x: Math.max(-14, Math.min(14, x * .5)), z: Math.max(-9, Math.min(9, z * .5)) };
}
export const parseTime = value => (typeof value === 'number' ? value : Date.parse(value));
export function readWaveInfo(info) {
  if (!info || typeof info !== 'object' || typeof info.waveId !== 'string' || !info.waveId) return null;
  const startsAtMs = parseTime(info.startsAt);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(Number(info.seed))) return null;
  const recoveryVersion = info.recoveryVersion ?? 0, waveProtocol = info.waveProtocol ?? 1;
  const recoveryPolicy = readRecoveryPolicy({ recoveryVersion, waveProtocol });
  if (!recoveryPolicy) return null;
  const snapshot = recoveryPolicy === 'structure-recovery-v1' ? readRecoverySnapshot(info.initialSnapshot, info.waveId) : null;
  const nativeShared=!!snapshot && Object.hasOwn(snapshot,'economy'),spectator=nativeShared && info.spectator===true;
  if(nativeShared && (!nativeOrigin(snapshot.economy) || !validInitialCaptains(snapshot) || typeof info.spectator!=='boolean'
    || !spectator && !isParticipantToken(info.controlSessionId)))return null;
  if (recoveryPolicy === 'structure-recovery-v1' && (!snapshot || (!spectator && (!isParticipantToken(info.participantToken)
    || !Number.isSafeInteger(info.lastActorCounter) || info.lastActorCounter < 0))
    || snapshot.seed !== Number(info.seed)
    || Date.parse(snapshot.startsAt) !== startsAtMs
    || snapshot.createWave.seed !== snapshot.seed
    || snapshot.createWave.wave !== info.wave)) return null;
  const rules = readRules(info.rules);
  if ((recoveryPolicy === 'structure-recovery-v1') !== rules.structureRecovery) return null;
  if (snapshot && JSON.stringify(readRules(snapshot.rules)) !== JSON.stringify(rules)) return null;
  const wave = Number.isInteger(info.wave) && info.wave > 0 ? info.wave : 1;
  const weather = info.weather && typeof info.weather === 'object' ? info.weather : {};
  return { waveId: info.waveId, wave, seed: Number(info.seed), startsAtMs, weather, flagship: info.flagship === true,
    boss: typeof info.boss === 'boolean' ? info.boss : undefined, walls: readWalls(info.walls), rules,
    recoveryVersion, waveProtocol, ...(snapshot ? { initialSnapshot: snapshot, participantToken: info.participantToken??null,
      lastActorCounter: info.lastActorCounter??0 } : {}),...(nativeShared?{nativeShared,spectator,controlSessionId:info.controlSessionId??null}:{}),
    serverTimeMs: Number.isFinite(parseTime(info.serverTime)) ? parseTime(info.serverTime) : null,
    // The browser's clock offset to the server, measured when the wave answer arrived (island/api.js clockOffset).
    clockOffsetMs: Number.isSafeInteger(info.clockOffsetMs) && Math.abs(info.clockOffsetMs) <= 86_400_000 ? info.clockOffsetMs : null };
}

/** How long to wait before finishing again, from a 409 wave_too_early refusal; null for other errors. */
export function tooEarlyWait(error) {
  const code = error?.code ?? error?.body?.error?.code ?? error?.error?.code;
  if (code !== 'wave_too_early') return null;
  const seconds = Number(error.waitSeconds ?? error.retryAfter ?? error.body?.error?.waitSeconds ?? error.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(60, seconds) : DEFAULT_WAIT_SECONDS;
}
// A legacy finish whose outcome is unknown (no answer, 429, a 5xx such as 503 database_unavailable) is sent
// again, byte for byte: the server answers a repeat with the stored result and pays nothing twice. Without it
// one failed request left the wave open on the server (the bell "under way" until its 900 s ran out).
export const FINISH_RETRY_SECONDS = Object.freeze([2, 5, 10, 20]);
export function finishRetryWait(error, attempt) {
  const status = error?.status;
  if (error?.code === 'not_ready' || !Number.isInteger(status) || !(status === 0 || status === 429 || status >= 500)) return null;
  const wait = FINISH_RETRY_SECONDS[attempt];
  if (wait === undefined) return null;
  const asked = Number(error.retryAfter);
  return Number.isFinite(asked) && asked > wait ? Math.min(60, asked) : wait;
}

export const defaultCutscene = (world, reducedMotion) => async id => {
  if (!world.container) return { status: 'skipped' };
  const module = await import('../cutscenes/player.js');
  return module.playCutscene({ container: world.container, id, reducedMotion }).done;
};
export const defaultRenderer = async options => {
  const module = await import('./render.js');
  // One atlas at a time, painted again when your lobby colour (the musket and cutlass poses) changes.
  // T33: a wave with tower health also paints the damaged and broken towers (another atlas, another key).
  // T43: a wave that fights with a culverin also paints the culverin (another atlas, another key).
  // D055: a wave with a swivel-gun nest paints the nest too, the same way.
  const key = `${options.quality?.() === 'low' ? 'low' : 'high'}:${options.colour ?? 0}${options.towerStates ? ':towers' : ''}${options.culverins ? ':culverins' : ''}${options.swivels ? ':swivels' : ''}`;
  if (atlasKey !== key) { atlasPromise = null; atlasKey = key; }
  atlasPromise ??= module.loadAtlas({ quality: key.split(':')[0], colour: options.colour ?? 0, towerStates: options.towerStates === true,
    culverins: options.culverins === true, swivels: options.swivels === true })
    .catch(error => { atlasPromise = null; throw error; });
  return module.createWaveRenderer({ ...options, atlas: await atlasPromise });
};
export const defaultHud = async options => (await import('./hud.js')).createWaveHud(options);
// The battle guide (battle-guide.js): where pirates land, the way they walk, the heart and the walls' bars. Drawing only.
export const defaultGuide = async options => (await import('./battle-guide.js')).createBattleGuide(options);
// v3 waves: the event's drawing and the finisher's scene load with their first wave; the finisher slows the sea.
export const defaultEventArt = async options => (typeof document === 'undefined' ? null : (await import('./wave-events-art.js')).createEventArt(options));
export const defaultFinisherScene = async options => {
  if (typeof document === 'undefined') return null; // no page (a headless test): the sim alone
  const [module, water] = await Promise.all([import('./finisher/introduction.js'), import('../world/water.js').catch(() => null)]);
  const scene = module.createFinisherIntroduction(options);
  if (!options.reducedMotion?.()) water?.setSeaPace?.(.25);
  const dispose = scene.dispose;
  scene.dispose = () => { water?.setSeaPace?.(1); dispose(); };
  return scene;
};
export const FINISHER_FRAME_Z = 7;     // units: the camera looks this far south of the boss, so it shows above the panel
export const EVENT_BANNER_SECONDS = 8;   // the event's line shows this long under the wave bar, then its title alone
export const EVENT_ICONS = Object.freeze({ fog_bank: '☁', storm: '⛈', night_raid: '🌙', fire_ships: '🔥', pincer: '⚔', armada: '⛵',
  siege_barge: '💣', treasure_galleon: '💰', smugglers: '🛶', kraken: '🐙' });
export const readEasy = () => { try { return getPreferences()?.easyFinishers === true; } catch { return false; } };
