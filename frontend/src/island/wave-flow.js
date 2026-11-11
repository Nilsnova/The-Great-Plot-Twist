// The bell and the wave around it, without DOM: ring (POST start) or join a running wave, tell the game
// (`wave_started_server`), count down to startsAt, and finish (POST finish) with the loot toast.
// The wave itself (ships, cannons) is lane P's: until a renderer is registered in wave-hooks.js, a
// placeholder finishes the wave as survived 20 s after the countdown, but only when `placeholder` is
// true (the fake server, or ?wavedebug=1), so the loop can be tried end to end.
import {WAVE_STARTED, WAVE_FINISHED, hasWaveRenderer as defaultHasRenderer, setWaveFinisher} from './wave-hooks.js';
import {coinText, countdownText, lootText, secondsUntil} from './card-model.js';

export const PLACEHOLDER_SECONDS = 20;
const HERE_SECONDS = 3;

export function createWaveFlow({api, emit, notify = () => {}, banner = () => {}, onChange = () => {},
  defensesOf = () => [], placeholder = false, hasRenderer = defaultHasRenderer,
  now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id)} = {}) {
  let current = null; // {wave, where, joined, finished}
  let busy = false, disposed = false;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimer(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; };
  const stopTimers = () => { for (const id of timers) clearTimer(id); timers.clear(); };
  const changed = () => { try { onChange(); } catch { /* A card cannot stop the wave. */ } };

  function countdown(wave, fresh) {
    const tick = () => {
      if (current?.wave.waveId !== wave.waveId) return;
      const left = Math.max(0, Math.ceil((current.startAt - now()) / 1000));
      banner(countdownText(left, wave.wave));
      changed();
      if (left > 0) later(tick, 1000);
      else later(() => { if (current?.wave.waveId === wave.waveId) banner(null); }, HERE_SECONDS * 1000);
    };
    const seconds = secondsUntil(wave.startsAt, now(), {fresh});
    current.startAt = now() + seconds * 1000;
    tick();
    if (placeholder && !hasRenderer()) {
      later(() => {
        if (current?.wave.waveId === wave.waveId && !current.finished && !hasRenderer()) {
          void finish({waveId: wave.waveId, survived: true, shipsSunk: 0});
        }
      }, (seconds + PLACEHOLDER_SECONDS) * 1000);
    }
  }
  // A wave we are in: remember it, tell the game, count down.
  function begin(wave, where, {fresh = false} = {}) {
    if (current?.wave.waveId === wave.waveId && current.joined) return;
    stopTimers();
    current = {wave, where, joined: true, finished: false, startAt: now()};
    emit({type: WAVE_STARTED, waveId: wave.waveId, wave: wave.wave, seed: wave.seed, startsAt: wave.startsAt,
      weather: wave.weather, flagship: wave.flagship, where, defenses: defensesOf()});
    countdown(wave, fresh);
    changed();
  }
  async function run(task) {
    if (busy || disposed) return {ok: false, status: 0, code: 'busy', message: 'One moment…'};
    busy = true; changed();
    try { return await task(); } finally { busy = false; if (!disposed) changed(); }
  }
  const ring = (where = 'own') => run(async () => {
    const answer = await api.startWave({where});
    if (disposed) return answer;
    if (answer.ok) begin(answer.data, where, {fresh: true});
    else if (answer.code === 'wave_running') await look(where);
    return answer;
  });
  const join = (where = 'own') => run(async () => {
    const waveId = current?.wave.waveId;
    if (!waveId) return {ok: false, status: 404, code: 'no_such_wave', message: 'There is no wave to join.'};
    const answer = await api.joinWave({waveId});
    if (disposed) return answer;
    if (answer.ok) begin(answer.data, where);
    else if (answer.code === 'wave_over') { current = null; changed(); }
    return answer;
  });
  // A friend sailing in (or a page reload) asks whether a wave runs there; it is shown, not joined.
  async function look(where = 'own') {
    const answer = await api.currentWave({where});
    if (disposed || !answer.ok) return answer;
    if (answer.data && current?.wave.waveId !== answer.data.waveId) {
      stopTimers(); current = {wave: answer.data, where, joined: false, finished: false, startAt: now()};
    } else if (!answer.data && current && !current.joined) current = null;
    changed();
    return answer;
  }
  async function finish({waveId, survived, shipsSunk = 0} = {}) {
    const answer = await api.finishWave({waveId, survived, shipsSunk});
    if (disposed) return answer;
    if (!answer.ok && answer.code === 'wave_too_early') {
      later(() => { void finish({waveId, survived, shipsSunk}); }, (answer.retryAfterSeconds ?? 2) * 1000);
      return answer;
    }
    if (!answer.ok) { notify(answer.message, 'error'); return answer; }
    if (current?.wave.waveId === waveId) { current.finished = true; stopTimers(); banner(null); current = null; }
    if (survived) notify(lootText(answer.data), 'success');
    else notify(`The pirates broke through. You have ${coinText(answer.data.coins)}.`, 'error');
    emit({type: WAVE_FINISHED, survived: survived === true, waveId, ...answer.data});
    changed();
    return answer;
  }
  const stopFinisher = setWaveFinisher(finish);
  return {
    ring, join, look, finish,
    get busy() { return busy; },
    get current() { return current ? {...current} : null; },
    secondsLeft: () => (current ? Math.max(0, Math.ceil((current.startAt - now()) / 1000)) : null),
    // Leaving the island ends the countdown on screen; the wave itself keeps its server time.
    reset() { stopTimers(); current = null; banner(null); changed(); },
    dispose() { if (disposed) return; disposed = true; stopTimers(); stopFinisher(); current = null; banner(null); },
  };
}
