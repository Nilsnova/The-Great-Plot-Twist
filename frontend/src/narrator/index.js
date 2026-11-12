// The narrator (GAME-V3.md section 6): listens to the game's bus, picks the line for the moment from
// lines.json (logic.js), keeps one line at a time in a queue, shows it on the caption card (card.js) and
// plays its recording through the game's audio (audio.playVoice, Settings › Voice volume, music ducked).
// Captions show also with the sound off; a missing recording keeps the caption for a reading time.
// What was told is stored per island game (localStorage, keyed by island code), so a returning crew
// is not told again, except the "welcome back" line.
//
//   const narrator = createNarrator({container, on, audio, getGame: () => ({code, waveBest})});
//   narrator.begin()   the crew is on the island (game.js, after Play): the opening, or welcome back
//   narrator.dispose()
//
// Bus events it listens to. The first group is emitted today; the second is the contract for the
// lanes that build those parts:
//   wave_started_server {waveId, wave, boss?, where}   (island lane) a wave starts: waves 1-5 and 100,
//       every 10th, the first boss. where is "own", an island code or "pirate_point".
//   wave_controller_started {waveId, wave}             (pirates lane) the same wave on screen
//   wave_finished {waveId, survived, wave?}             (pirates and island lanes, deduplicated by waveId)
//       a win plays a milestone or a "wave won" line (not on a wave that opens something).
//   --- to be emitted by the other lanes ---
//   game_started {code, first?, resumed?, wave?}        (rooms lane R) the host pressed Start: the opening
//       the first time on this island, else welcome back. Replaces narrator.begin().
//   campaign_unlocked {wave, ids?, code?}               (campaign lane P, src/island/index.js) what winning
//       `wave` opened on the island `code`; plays the wave_unlock:<wave> lines, each once per island game.
//   boarders_ashore {wave?, count?}                     (boarding lane C) the first boarders land.
//   heart_changed {hp, max}                             (boarding lane C) the island's heart; below 30% warns.
//   player_fell {playerId, self?} / player_revived {playerId, by?, self?}  (health lane H)
//   captains_all_fallen {}                              (health lane H) every captain is down.
//   wave_event_announced {event, wave}                  (v3 waves) a wave's event: its line the first time in this game.
//   finisher_moment {kind, phase: start|won|failed}     (v3 waves) a boss finisher starts or ends.
import data from './lines.json';
import {createNarratorCard} from './card.js';
import {getPreferences, onPreferences as watchPreferences} from '../settings/preferences.js';
import {indexLines, selectLines, ruleFor, startTriggers, finishTriggers, wonLineDue, readingMs, gameKey,
  createMemory, createQueue, HEART_LOW, PRIORITY} from './logic.js';

const TAIL_MS = 500;          // quiet after a line before the next one
const HOLD_MS = 400;          // how often a held queue looks again (a cutscene is open)
const GAME_WAIT_MS = 4000;    // how long begin() waits for the island to know its code
const FILE = /^narrator-[a-z0-9_]{1,48}\.mp3$/;
const safeLocal = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const base = () => import.meta.env?.BASE_URL ?? './';

// The narrator's entries of public/audio/voice/manifest.json: {lineId: {file, seconds}}.
export function narratorVoices(manifest) {
  const voices = {};
  if (!manifest || manifest.version !== 1 || !manifest.lines || typeof manifest.lines !== 'object') return voices;
  for (const [name, entry] of Object.entries(manifest.lines)) {
    if (!name.startsWith('narrator-') || typeof entry?.file !== 'string' || !FILE.test(entry.file)) continue;
    voices[name.slice(9)] = {file: entry.file, seconds: Number.isFinite(entry.seconds) ? entry.seconds : null};
  }
  return voices;
}

export function createNarrator({container = globalThis.document?.body, on, audio = null, getGame = () => null,
  lines = data.lines, storage = safeLocal(), preferences = getPreferences, onPreferences = watchPreferences,
  fetchImpl = globalThis.fetch?.bind(globalThis), now = () => Date.now(),
  setTimer = (run, ms) => setTimeout(run, ms), clearTimer = id => clearTimeout(id),
  held = () => !!globalThis.document?.querySelector('dialog.cutscene[open]'), createCard = createNarratorCard} = {}) {
  const index = indexLines(lines), memory = createMemory(storage, {now}), queue = createQueue({now});
  const card = createCard(container, {onSkip: () => skip(), large: () => preferences()?.subtitleSize === 'large'});
  const stops = [], started = new Map(), finished = new Set(), lastSpoken = new Map();
  let disposed = false, key = null, speaking = null, timer = null, watch = null, heartWarned = false, beginTicket = 0;
  const begun = new Set();
  let voices = null, voicesLoad = null;

  const settings = () => preferences() ?? {};
  const enabled = () => settings().narrator !== false;
  const captions = () => settings().captions !== false;
  const audible = () => { const value = settings(); return (value.master ?? 1) > 0 && (value.voice ?? 1) > 0; };
  const current = () => key ?? gameKey(getGame?.()?.code) ?? 'local';
  function later(run, ms) { clearTimer(timer); timer = setTimer(() => { timer = null; if (!disposed) run(); }, ms); }

  function loadVoices() {
    if (voices || !fetchImpl) return Promise.resolve(voices ?? {});
    voicesLoad ??= Promise.resolve().then(() => fetchImpl(`${base()}audio/voice/manifest.json`, {headers: {Accept: 'application/json'}}))
      .then(response => (response?.ok ? response.json() : null)).then(manifest => (voices = narratorVoices(manifest)))
      .catch(() => (voices = {}));
    return voicesLoad;
  }

  // Queue the lines a trigger brings, mark them told (so a reload never repeats them), and play.
  function say(trigger, {seed = 0, game = current()} = {}) {
    if (disposed || !enabled()) return [];
    const rule = ruleFor(trigger);
    if (!rule) return [];
    if (rule.cooldown && now() - (lastSpoken.get(trigger) ?? -Infinity) < rule.cooldown) return [];
    const picked = selectLines(index, trigger, {told: memory.told(game), seed});
    if (!picked.length) return [];
    lastSpoken.set(trigger, now());
    const queued = picked.filter(line => queue.push(line, {priority: rule.priority, ttl: rule.ttl}));
    if (rule.once) memory.mark(game, [trigger, ...picked.map(line => line.id), ...picked.flatMap(line => line.covers ?? [])]);
    pump();
    return queued.map(line => line.id);
  }

  function pump() {
    if (disposed || speaking || timer !== null) return;
    if (held()) { later(pump, HOLD_MS); return; }
    const item = queue.next();
    if (item) void speak(item.line);
  }

  async function speak(line) {
    const turn = speaking = {line, voice: null, skipped: false, at: now()};
    if (captions()) card.show(line);
    // A cutscene that opens meanwhile has its own voice: the narrator steps aside.
    const look = () => { watch = null; if (speaking !== turn || disposed) return; if (held()) skip(); else watch = setTimer(look, HOLD_MS); };
    watch = setTimer(look, HOLD_MS);
    const known = await loadVoices();
    if (disposed || speaking !== turn) return;
    const entry = known[line.id];
    if (entry && audible() && audio?.playVoice) turn.voice = audio.playVoice(`${base()}audio/voice/${entry.file}`) ?? null;
    let played = false;
    if (turn.voice) played = await turn.voice.done.catch(() => false);
    if (disposed || speaking !== turn) return;
    // No recording, sound locked or muted: the caption stays for a reading time (or the recording's length).
    // After a recording it stays at least three quarters of the reading time, so it can still be read.
    if (!turn.skipped) {
      const minimum = played ? readingMs(line.text) * .75 : Math.max(readingMs(line.text), (entry?.seconds ?? 0) * 1000);
      const wait = minimum - (now() - turn.at);
      if (wait > 0) await new Promise(resolve => { turn.resolve = resolve; later(resolve, wait); });
    }
    if (disposed || speaking !== turn) return;
    end();
  }
  function end() {
    speaking = null; card.hide(); clearTimer(watch); watch = null;
    later(pump, TAIL_MS);
  }
  function skip() {
    const turn = speaking;
    if (!turn) return;
    turn.skipped = true; turn.voice?.stop(); speaking = null; card.hide(); clearTimer(watch); watch = null;
    clearTimer(timer); timer = null; turn.resolve?.();
    later(pump, TAIL_MS);
  }
  function hush() {
    queue.clear();
    if (speaking) { speaking.voice?.stop(); speaking.skipped = true; speaking.resolve?.(); speaking = null; }
    clearTimer(timer); timer = null; clearTimer(watch); watch = null; card.hide();
  }

  // The crew is on an island: the opening the first time, welcome back after that.
  function arrive(code, {resumed = false, wave = 0} = {}) {
    const game = key = gameKey(code, 'local');
    if (begun.has(game)) return;
    begun.add(game);
    if (memory.told(game).has('game_opening') || resumed || wave > 0) {
      memory.mark(game, ['game_opening']);
      say('game_welcome_back', {seed: wave >= 10 ? 1 : 0, game});
    } else say('game_opening', {game});
  }
  async function begin() {
    const ticket = ++beginTicket, until = now() + GAME_WAIT_MS;
    let game = getGame?.() ?? null;
    while (!game?.code && now() < until && !disposed && ticket === beginTicket) {
      await new Promise(resolve => setTimer(resolve, 250));
      game = getGame?.() ?? null;
    }
    if (disposed || ticket !== beginTicket) return;
    arrive(game?.code ?? null, {wave: Number.isSafeInteger(game?.waveBest) ? game.waveBest : 0});
  }

  // A wave's own island game: the code it is played on, or the crew's own island.
  const waveGame = where => (where && where !== 'own' ? gameKey(where, current()) : current());
  function waveStarted(event) {
    const wave = Number(event?.wave);
    if (!Number.isSafeInteger(wave) || wave < 1) return;
    const id = event.waveId ?? `wave-${wave}`;
    if (started.has(id)) return;
    started.set(id, {wave, game: waveGame(event.where)});
    if (started.size > 50) started.delete(started.keys().next().value);
    heartWarned = false;
    queue.dropBelow(PRIORITY.HIGH); // the last break's chatter is stale now
    for (const trigger of startTriggers(wave, {boss: event.boss === true})) say(trigger, {seed: wave, game: started.get(id).game});
  }
  function waveFinished(event) {
    const id = event?.waveId ?? null, info = id !== null ? started.get(id) : null;
    if (id !== null) { if (finished.has(id)) return; finished.add(id); }
    const wave = Number.isSafeInteger(event?.wave) ? event.wave : info?.wave ?? null, game = info?.game ?? current();
    const survived = event?.survived === true;
    const told = finishTriggers(wave, survived).flatMap(trigger => say(trigger, {seed: wave ?? 0, game}));
    if (survived && told.length === 0 && wonLineDue(wave)) say('wave_won', {seed: wave ?? 0, game});
  }

  stops.push(
    // The lobby's Start (src/island/game-room.js) sends {first, code}: first false is a game started before.
    on('game_started', event => arrive(event?.code ?? getGame?.()?.code ?? null, {resumed: event?.resumed === true || event?.first === false, wave: Number(event?.wave) || 0})),
    on('wave_started_server', waveStarted),
    on('wave_controller_started', waveStarted),
    on('wave_finished', waveFinished),
    on('campaign_unlocked', event => {
      if (Number.isSafeInteger(event?.wave)) say(`wave_unlock:${event.wave}`, {seed: event.wave, game: event?.code ? gameKey(event.code, current()) : current()});
    }),
    on('boarders_ashore', () => say('boarders_ashore')),
    on('player_fell', event => say('player_fell', {seed: event?.self ? 1 : 0})),
    on('player_revived', event => say('player_revived', {seed: event?.self ? 0 : 1})),
    on('captains_all_fallen', () => say('all_fallen')),
    // v3 waves (src/pirates/controller.js): a wave's event, the first time it comes in this game, and a boss finisher.
    on('wave_event_announced', event => { if (typeof event?.event === 'string') say(`wave_event:${event.event}`, {seed: Number(event.wave) || 0}); }),
    on('finisher_moment', event => {
      if (typeof event?.kind === 'string' && ['start', 'won', 'failed'].includes(event?.phase)) say(`finisher_${event.phase}:${event.kind}`);
    }),
    on('heart_changed', event => {
      const hp = Number(event?.hp), max = Number(event?.max);
      if (!(max > 0) || !(hp >= 0) || hp / max >= HEART_LOW || heartWarned) return;
      heartWarned = true; // once per wave
      say('heart_low', {seed: started.size});
    }),
  );
  // Narrator off: stop at once. Captions off: hide the card (the voice goes on).
  stops.push(onPreferences(() => {
    if (!enabled()) hush();
    else if (!captions()) card.hide();
    else if (speaking && !card.visible) card.show(speaking.line);
  }) ?? (() => {}));

  return {
    begin, say, skip,
    get speaking() { return speaking?.line.id ?? null; },
    get queued() { return queue.ids; },
    get game() { return current(); },
    dispose() {
      if (disposed) return;
      hush(); disposed = true;
      for (const stop of stops) { try { stop?.(); } catch { /* already gone */ } }
      card.dispose();
    },
  };
}
