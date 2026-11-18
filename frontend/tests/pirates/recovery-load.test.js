// The request load of one recovery wave (structure_recovery, wave protocol 2) on one browser.
// A fake clock drives the controller frame by frame against a small in-memory journal server with a
// fixed round trip; it seals like the real one (floor(elapsed * 20) - 1 at the moment it answers).
// Production showed 100-500 event reads per wave from one player (T54 budget: 8 reads/s, 8 writes/s).
import { describe, expect, it } from 'vitest';
import { createWaveController, RECOVERY_PLAYOUT_MS } from '../../src/pirates/controller.js';
import { readWaveMessage } from '../../src/net/live-rules.js';

const START = Date.UTC(2026, 10, 17, 20, 0, 0), PREP_MS = 5000, STARTS = START + PREP_MS, TICK_MS = 50, FRAME_MS = 16;
const TOKEN = '7165d60f-14f5-4b9e-96a0-2ed457b4c219';
const defenses = [
  { id: 'wall_1', kind: 'wall', level: 2, x: 0, z: 11 },
  { id: 'wall_2', kind: 'wall', level: 2, x: 8, z: 8 },
  { id: 'cannon_1', kind: 'cannon', level: 2, x: -8, z: -3 },
  { id: 'cannon_2', kind: 'cannon', level: 2, x: 8, z: -3 },
];

function snapshot({ ships = 3, islandHp = 10_000, wave = 12 } = {}) {
  return { recoveryVersion: 1, waveProtocol: 2, configVersion: 1, waveId: 'wave-load', islandEpoch: 'epoch-load', seed: 20261117,
    startsAt: new Date(STARTS).toISOString(), weather: { kind: 'calm', ships, fog: 0 }, rules: ['structure_recovery'],
    participants: [{ participantToken: TOKEN, captain: { level: 1, skills: [], weapon: 'musket' } }],
    createWave: { seed: 20261117, wave, weather: { ships, fog: 0 }, island: { hp: islandHp }, towerHealth: true, pathing: true,
      towerObstacles: true, defenses },
    structures: defenses.map(item => ({ spot: item.id, instanceId: `${item.id}-load`, kind: item.kind, level: item.level, x: item.x, z: item.z,
      hpUnits: 1_000_000, maxHP: item.kind === 'wall' ? 120 : 130, repairSeq: 0 })) };
}

/** Run one wave for `seconds` after its start; answers the requests seen and what overlapped. */
async function measureRecoveryWave({ roundTripMs = 200, seconds = 60, fireEveryMs = 700, ships = 3, islandHp = 10_000,
  wave: waveNo = 12, hold = false, hidden = null } = {}) {
  let now = START;
  const listeners = new Map(), bus = {
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
  };
  const journal = [];
  let sealed = -1;
  const queue = [], counts = { events: 0, inputs: 0, emptyInputs: 0, health: 0, finish: 0 };
  const flight = { events: 0, inputs: 0, health: 0, finish: 0 }, maxFlight = { events: 0, inputs: 0, health: 0, finish: 0 };
  const eventStarts = [];
  const serverTick = at => Math.floor((at - STARTS) / TICK_MS);
  // The answer is computed half a round trip after the request and arrives half a round trip later.
  function request(kind, answer) {
    counts[kind]++; flight[kind]++; maxFlight[kind] = Math.max(maxFlight[kind], flight[kind]);
    return new Promise(resolve => {
      const sent = now;
      queue.push({ at: sent + roundTripMs / 2, run: () => {
        const value = answer(now);
        queue.push({ at: sent + roundTripMs, run: () => { flight[kind]--; resolve(value); } });
      } });
    });
  }
  const transport = {
    readEvents: ({ after = 0, through, sealedThroughTick } = {}) => {
      eventStarts.push(now);
      return request('events', at => {
        if (through === undefined) {
          sealed = at < STARTS ? Math.max(sealed, -1) : Math.max(sealed, serverTick(at) - 1);
          return { headSeq: journal.length, sealedThroughTick: sealed, events: journal.slice(after, after + 256) };
        }
        return { headSeq: through, through, sealedThroughTick, events: journal.slice(after, Math.min(through, after + 256)) };
      });
    },
    sendInputs: ({ inputs }) => {
      if (!inputs?.length) counts.emptyInputs++;
      return request('inputs', at => ({ headSeq: journal.length + inputs.length, accepted: inputs.map(item => {
        const event = { serverSeq: journal.length + 1, type: 'captain_input', participantToken: TOKEN,
          effectiveTick: at < STARTS ? 0 : Math.max(item.tick, serverTick(at) + 1, sealed + 1),
          payload: { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: TOKEN, command: item.command,
            captain: { level: 1, skills: [], weapon: 'musket' } } };
        journal.push(event);
        return event;
      }) }));
    },
    checkpoint: ({ checkpoint: body }) => request('health', () => ({ accepted: true, throughTick: body.throughTick,
      inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
    finishWave: body => request('finish', at => ({ ok: true, data: { survived: body.survived, loot: 10, recovery: { waveId: body.waveId,
      islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(at).toISOString(), closedHp: body.checkpoint.hpUnits,
      checkpointUid: body.checkpoint.checkpointUid, throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
      lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } })),
  };
  const timers = [];
  const controller = createWaveController({ bus, now: () => now, recoveryTransport: transport, world: {}, getDefenses: () => defenses,
    holdBreak: () => (hold ? { paused: true, line: 'Paused', label: 'Resume', canToggle: true } : null),
    createRenderer: () => null, createHud: () => null, startNextWave: () => new Promise(() => {}), loadAuto: () => false, saveAuto: () => {},
    setTimer: (run, ms) => { const timer = { at: now + ms, run }; timers.push(timer); return timer; },
    clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); } });
  const snap = snapshot({ ships, islandHp, wave: waveNo });
  bus.emit({ type: 'wave_started_server', waveId: 'wave-load', wave: waveNo, seed: snap.seed, startsAt: snap.startsAt, weather: snap.weather,
    rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: TOKEN, lastActorCounter: 0 });
  let nextFire = STARTS + 200, maxStep = 0, frozen = 0, frames = 0, lastTicks = 0, endedAt = null, freeze = 0, longestFreezeMs = 0;
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  while (now < STARTS + seconds * 1000) {
    now += FRAME_MS;
    for (let again = true; again;) {
      again = false;
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) { queue.shift().run(); again = true; }
      for (const timer of timers.filter(item => item.at <= now)) { timers.splice(timers.indexOf(timer), 1); timer.run(); again = true; }
      await settle();
    }
    const isHidden = hidden ? hidden(now - STARTS) : false;
    if (!isHidden) controller.update(FRAME_MS / 1000); // the game loop does not run in a hidden tab (src/core/loop.js)
    if (!isHidden && now >= nextFire && controller.wave && !controller.wave.done) {
      controller.fire('cannon_1', 'ship_1');
      nextFire = now + fireEveryMs;
    }
    if (!isHidden) await settle();
    const wave = controller.wave;
    if (wave && !wave.done && now > STARTS + RECOVERY_PLAYOUT_MS + 1500) {
      const step = wave.ticks - lastTicks;
      maxStep = Math.max(maxStep, step); frames++;
      if (step === 0) { frozen++; freeze += FRAME_MS; longestFreezeMs = Math.max(longestFreezeMs, freeze); } else freeze = 0;
    }
    if (wave?.done && endedAt === null) endedAt = now - STARTS;
    lastTicks = wave?.ticks ?? lastTicks;
  }
  const result = { counts, maxFlight, eventStarts, maxStep, longestFreezeMs, frozenShare: frames ? frozen / frames : 0, endedAt,
    finishAnswered: controller.wave ? controller.wave.recoveryFinishAnswered === true : null, survived: controller.wave?.result?.survived ?? null, journal: journal.length };
  controller.dispose();
  return result;
}

// Printed even for a passing run (vitest hides console output of passing tests here), for the PR numbers.
const report = (label, value) => process.stdout.write(`\n[recovery-load] ${label} ${value}\n`);
const perSecond = (starts, from, to) => starts.filter(at => at >= from && at < to).length / ((to - from) / 1000);

describe('recovery wave request load (one browser, fake clock)', () => {
  it('stays well inside the per-participant budgets over a 60 s wave and never overlaps a request', async () => {
    const result = await measureRecoveryWave({ roundTripMs: 200 });
    report('60 s wave, 200 ms round trip:', JSON.stringify({ ...result.counts, maxFlight: result.maxFlight,
      maxStep: result.maxStep, longestFreezeMs: result.longestFreezeMs, endedAt: result.endedAt }));
    expect(result.maxFlight).toEqual({ events: 1, inputs: 1, health: 1, finish: result.counts.finish ? 1 : 0 });
    expect(result.counts.emptyInputs).toBe(0);
    // Wave protocol 2 sizing (T54): the whole 65 s (prep included) at no more than ~2.5 event reads a second.
    expect(result.counts.events / (PREP_MS / 1000 + 60)).toBeLessThanOrEqual(2.5);
    // No second within the wave goes above 3 reads (the server allows 8 a second).
    for (let at = STARTS; at < STARTS + 59_000; at += 1000) expect(perSecond(result.eventStarts, at, at + 1000)).toBeLessThanOrEqual(3);
    // One write per flush at most every 250 ms while commands wait; health at most once a second.
    expect(result.counts.inputs).toBeLessThanOrEqual(60 * 4);
    expect(result.counts.health).toBeLessThanOrEqual(62);
    // Motion stays smooth: at most two ticks in a 16 ms frame and never a stall longer than a tick.
    expect(result.maxStep).toBeLessThanOrEqual(2);
    expect(result.longestFreezeMs).toBeLessThanOrEqual(64);
  }, 60_000);

  it('keeps the playout fed at a slow 450 ms round trip without going back to back', async () => {
    const result = await measureRecoveryWave({ roundTripMs: 450 });
    report('60 s wave, 450 ms round trip:', JSON.stringify({ ...result.counts, maxFlight: result.maxFlight,
      maxStep: result.maxStep, longestFreezeMs: result.longestFreezeMs }));
    expect(result.maxFlight.events).toBe(1);
    expect(result.counts.events / (PREP_MS / 1000 + 60)).toBeLessThanOrEqual(2.5);
    expect(result.maxStep).toBeLessThanOrEqual(2);
    expect(result.longestFreezeMs).toBeLessThanOrEqual(64);
  }, 60_000);

  it('stops reading the journal once the wave is closed, even while the room holds the break open', async () => {
    // A short won wave (about 13 s) whose break the room's Pause keeps open: the close is answered, then nothing more is read.
    const result = await measureRecoveryWave({ roundTripMs: 200, seconds: 60, ships: 1, wave: 1, hold: true });
    report('won wave, held break:', JSON.stringify({ ...result.counts, endedAt: result.endedAt, finishAnswered: result.finishAnswered }));
    expect(result.endedAt).not.toBeNull();
    expect(result.survived).toBe(true);
    expect(result.finishAnswered).toBe(true);
    const closedBy = STARTS + result.endedAt + 3000;
    expect(result.eventStarts.filter(at => at > closedBy)).toEqual([]);
  }, 60_000);
});

// Two players on one island: one shared in-memory journal server (inputs land one tick after the server's
// now, 20261118030000) and, with `room`, the island's realtime room between the two browsers with a fixed
// latency, wrapped and checked like the live room ({v, id, seq, data}, readWaveMessage). Each player shoots
// at the nearest ship. Measures per player the event reads, input and health writes a second; the time from
// a key press to the shot's first drawing on the shooter's screen (own) and on the teammate's (teammate);
// the time from a teammate's press to its replayed shot in this sim (journal effect: hits and kills);
// whether a teammate's shot is drawn exactly once; room messages a second; nothing requested after the close.
// `hidden(player, msFromStart)` hides a tab (no frames), `defenses` and `ships` shape the wave's length.
const TOKENS = [TOKEN, '2b8c0f0e-5a71-4c2e-9d55-0f6b2b7e9a10'];
const PLAYER_IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
async function measureTwoPlayers({ roundTripMs = 200, seconds = 60, shootEveryMs = 900, room = false, roomLatencyMs = 100,
  hidden = null, frameMs = FRAME_MS, ships = 2, wave: waveNo = 6, islandHp = 10_000, shooters = [0, 1], defenses: waveDefenses = defenses,
  inspect = null, closeAt = null } = {}) {
  let now = START;
  const journal = [], queue = [];
  let sealed = -1, closed = false, roomSent = 0;
  const serverTick = at => Math.floor((at - STARTS) / TICK_MS);
  const request = (counts, kind, answer) => {
    counts[kind]++;
    counts.at.push(now);
    return new Promise(resolve => {
      const sent = now;
      queue.push({ at: sent + roundTripMs / 2, run: () => {
        const value = answer(now);
        queue.push({ at: sent + roundTripMs, run: () => resolve(value) });
      } });
    });
  };
  const roomHandlers = [new Map(), new Map()];
  const players = TOKENS.map((token, index) => {
    const counts = { events: 0, inputs: 0, health: 0, finish: 0, at: [] }, presses = [], drawn = [], replayed = [], drawnOthers = [];
    const busTypes = new Set();
    const transport = {
      readEvents: ({ after = 0, through, sealedThroughTick } = {}) => request(counts, 'events', at => {
        if (through === undefined) {
          if (!closed) sealed = at < STARTS ? Math.max(sealed, -1) : Math.max(sealed, serverTick(at) - 1);
          return { headSeq: journal.length, sealedThroughTick: sealed, events: journal.slice(after, after + 256), closed };
        }
        return { headSeq: through, through, sealedThroughTick, events: journal.slice(after, Math.min(through, after + 256)), closed };
      }),
      sendInputs: ({ inputs }) => request(counts, 'inputs', at => {
        if (closed) return { refused: true, status: 409, code: 'wave_over', retryAfterSeconds: null };
        return { headSeq: journal.length + inputs.length, accepted: inputs.map(item => {
          const event = { serverSeq: journal.length + 1, type: 'captain_input', participantToken: token,
            effectiveTick: at < STARTS ? 0 : Math.max(item.tick, serverTick(at) + 1, sealed + 1),
            payload: { inputUid: item.inputUid, actorCounter: item.actorCounter, participantToken: token, command: item.command,
              captain: { level: 1, skills: [], weapon: 'musket' } } };
          journal.push(event);
          return event;
        }) };
      }),
      checkpoint: ({ checkpoint: body }) => request(counts, 'health', () => ({ accepted: true, throughTick: body.throughTick,
        inputHeadSeq: body.inputHeadSeq, lastRepairSeq: body.lastRepairSeq, hpUnits: body.hpUnits })),
      finishWave: body => request(counts, 'finish', at => { closed = true; return { ok: true, data: { survived: body.survived, loot: 10, recovery: { waveId: body.waveId,
        islandEpoch: body.checkpoint.islandEpoch, closedAt: new Date(at).toISOString(), closedHp: body.checkpoint.hpUnits,
        checkpointUid: body.checkpoint.checkpointUid, throughTick: body.checkpoint.throughTick, inputHeadSeq: body.checkpoint.inputHeadSeq,
        lastRepairSeq: body.checkpoint.lastRepairSeq, basisRepairSeq: body.checkpoint.basisRepairSeq } } }; }),
    };
    const listeners = new Map(), bus = {
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      emit(event) {
        busTypes.add(event.type);
        if (event.type === 'captain_fired' && event.by !== token) replayed.push({ at: now, by: event.by });
        for (const fn of listeners.get(event.type) ?? []) fn(event);
      },
    };
    const renderer = { events: list => { for (const event of list) if (event.type === 'captain_fired') (event.by === token ? drawn : drawnOthers).push(now); },
      update() {}, setVisible() {}, dispose() {} };
    let seq = 0;
    const islandRoom = room ? {
      send(type, payload) {
        roomSent++;
        const wrapped = { v: 1, id: PLAYER_IDS[index], seq: ++seq, data: payload };
        queue.push({ at: now + roomLatencyMs, run: () => {
          const message = readWaveMessage(type, wrapped);
          if (message) for (const fn of roomHandlers[1 - index].get(type) ?? []) fn(message.data);
        } });
        return true;
      },
      on(type, fn) { if (!roomHandlers[index].has(type)) roomHandlers[index].set(type, new Set()); roomHandlers[index].get(type).add(fn); return () => roomHandlers[index].get(type).delete(fn); },
    } : null;
    const world = { scene: {}, player: shooters.includes(index) ? { position: { x: 0, z: 0 } } : null };
    const timers = [];
    const controller = createWaveController({ bus, now: () => now, recoveryTransport: transport, world, getDefenses: () => waveDefenses,
      room: islandRoom, createRenderer: () => renderer, createHud: () => null, startNextWave: () => new Promise(() => {}),
      loadAuto: () => false, saveAuto: () => {},
      setTimer: (run, ms) => { const timer = { at: now + ms, run }; timers.push(timer); return timer; },
      clearTimer: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); } });
    const snap = snapshot({ ships, wave: waveNo, islandHp });
    snap.createWave.defenses = waveDefenses;
    snap.structures = snap.structures.filter(row => waveDefenses.some(item => item.id === row.spot));
    snap.participants = TOKENS.map(participantToken => ({ participantToken, captain: { level: 1, skills: [], weapon: 'musket' } }));
    bus.emit({ type: 'wave_started_server', waveId: 'wave-load', wave: waveNo, seed: snap.seed, startsAt: snap.startsAt, weather: snap.weather,
      rules: snap.rules, recoveryVersion: 1, waveProtocol: 2, initialSnapshot: snap, participantToken: token, lastActorCounter: 0 });
    return { token, counts, presses, drawn, drawnOthers, replayed, controller, world, timers, busTypes, nextShot: STARTS + 1500 };
  });
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  let closedAt = null;
  while (now < STARTS + seconds * 1000) {
    now += frameMs;
    // The server ends an abandoned wave (nobody read its journal for three minutes): its seal stops.
    if (closeAt !== null && !closed && now >= STARTS + closeAt) closed = true;
    for (let again = true; again;) {
      again = false;
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= now) { queue.shift().run(); again = true; }
      for (const player of players) for (const timer of player.timers.filter(item => item.at <= now)) {
        player.timers.splice(player.timers.indexOf(timer), 1); timer.run(); again = true;
      }
      await settle();
    }
    for (const [index, player] of players.entries()) {
      if (hidden?.(index, now - STARTS)) continue; // a hidden tab runs no frames
      const { controller, world } = player;
      controller.update(frameMs / 1000);
      const ship = controller.wave && !controller.wave.done && world.player ? controller.state?.ships?.[0] : null;
      if (ship && now >= player.nextShot) {
        world.player.position = { x: ship.x + 2, z: ship.z }; // stand within musket range of it
        if (controller.shoot(ship.id)) player.presses.push(now);
        player.nextShot = now + shootEveryMs;
      }
      inspect?.(index, player, now - STARTS);
    }
    await settle();
    if (closed && closedAt === null) closedAt = now;
  }
  const end = closedAt ?? STARTS + seconds * 1000, span = (end - STARTS) / 1000;
  const result = players.map(({ counts, presses, drawn, controller }, index) => {
    const own = presses.map(at => (drawn.find(time => time >= at) ?? Infinity) - at);
    const mate = players[1 - index], teammatePresses = mate.presses.filter(at => at < end - 3000);
    const teammate = teammatePresses.map(at => (players[index].drawnOthers.find(time => time >= at) ?? Infinity) - at);
    const journalEffect = teammatePresses.map(at => (players[index].replayed.find(item => item.at >= at && item.by === mate.token)?.at ?? Infinity) - at);
    return { readsPerSecond: counts.events / span, inputsPerSecond: counts.inputs / span, healthPerSecond: counts.health / span,
      presses: presses.length, pressToVisibleMs: median(own.filter(Number.isFinite)), neverDrawn: own.filter(value => !Number.isFinite(value)).length,
      teammatePressToVisibleMs: median(teammate.filter(Number.isFinite)),
      teammateDrawn: players[index].drawnOthers.filter(at => at < end).length, teammatePresses: mate.presses.filter(at => at < end).length,
      journalEffectMs: median(journalEffect.filter(Number.isFinite)),
      afterClose: closedAt === null ? null : counts.at.filter(at => at > closedAt + 5000).length,
      ended: controller.wave === null, waveDone: controller.wave?.done ?? null, busTypes: [...players[index].busTypes],
      finishes: counts.finish };
  });
  players.forEach(player => player.controller.dispose());
  return { players: result, closedAt: closedAt === null ? null : closedAt - STARTS, roomPerSecond: roomSent / span,
    journal: journal.length, controllers: null };
}

describe('two players on one recovery wave (fake clock)', () => {
  it('draws your own shot at once and stays inside the read/write bounds; nothing after the close', async () => {
    const result = await measureTwoPlayers({ roundTripMs: 200, seconds: 60 });
    report('two players, 200 ms round trip, no room:', JSON.stringify(result, (key, value) => (key === 'busTypes' ? undefined : value)));
    for (const player of result.players) {
      expect(player.presses).toBeGreaterThan(3);
      // A shot shows on the shooter's screen in the frame of the key press (cosmetic prediction).
      expect(player.pressToVisibleMs).toBeLessThanOrEqual(FRAME_MS);
      expect(player.neverDrawn).toBe(0);
      expect(player.readsPerSecond).toBeLessThanOrEqual(2.5);
      expect(player.inputsPerSecond).toBeLessThanOrEqual(2);
      expect(player.healthPerSecond).toBeLessThanOrEqual(0.4);
      if (result.closedAt !== null) expect(player.afterClose).toBe(0);
    }
  }, 120_000);

  it("draws a teammate's shot within 250 ms over a 100 ms room, exactly once, and replays it sooner", async () => {
    const result = await measureTwoPlayers({ roundTripMs: 200, seconds: 60, room: true, roomLatencyMs: 100 });
    report('two players, 200 ms round trip, 100 ms room:', JSON.stringify(result, (key, value) => (key === 'busTypes' ? undefined : value)));
    for (const player of result.players) {
      expect(player.teammatePresses).toBeGreaterThan(3);
      expect(player.teammatePressToVisibleMs).toBeLessThan(250);
      // The replayed copy of a shot the room already drew is not drawn again.
      expect(player.teammateDrawn).toBe(player.teammatePresses);
      // The journal's own effect (hits, kills) follows the adaptive playout, well under the old ~1.3 s.
      expect(player.journalEffectMs).toBeLessThan(1100); // main (1 s playout, 5-tick lead): about 1.4 s
      expect(player.readsPerSecond).toBeLessThanOrEqual(2.5);
    }
    // One message per shot at most (shots are seconds apart here): far inside the room's budget.
    expect(result.roomPerSecond).toBeLessThanOrEqual(2 * 8);
  }, 120_000);
});


// A hidden tab runs no frames (src/core/loop.js). Player 1 hides from 5 s for `minutes` while player 0 plays on
// (no defenses and a strong heart: the wave runs to the sim's 150 s); back, it reads the journal and replays
// 30 s of wave a frame under "Catching up…", then runs level with player 0 again (or ends the finished wave).
async function hiddenFor(minutes) {
  const hideFrom = 5000, hideTo = hideFrom + minutes * 60_000;
  let shown = false, caughtUpAt = null, behindAtEnd = null;
  const result = await measureTwoPlayers({ roundTripMs: 200, seconds: (hideTo + 20_000) / 1000, frameMs: 50, room: true,
    defenses: [], ships: 2, wave: 6, islandHp: 1e9, shooters: [],
    hidden: (index, at) => index === 1 && at >= hideFrom && at < hideTo,
    inspect: (index, player, at) => {
      const wave = player.controller.wave;
      if (index !== 1 || !wave || at < hideTo) return;
      if (wave.catchingUp) shown = true;
      else if (shown && caughtUpAt === null) caughtUpAt = at - hideTo;
      behindAtEnd = wave.ticks;
    } });
  return { result, shown, caughtUpAt, behindAtEnd };
}

describe('a hidden tab comes back to the wave (fake clock)', () => {
  for (const minutes of [1, 3, 10]) {
    it(`catches up after ${minutes} min hidden within a few seconds, saying so meanwhile`, async () => {
      const { result, shown, caughtUpAt } = await hiddenFor(minutes);
      report(`hidden ${minutes} min:`, JSON.stringify({ shown, caughtUpAt, closedAt: result.closedAt }));
      expect(shown).toBe(true);
      expect(caughtUpAt).not.toBeNull();
      expect(caughtUpAt).toBeLessThanOrEqual(5000);
      if (minutes >= 3) {
        // A sim wave lasts at most 150 s: the teammate finished it meanwhile. The returning tab replays it to
        // its end, sends its finish (the server answers the first close) and lets go of the wave.
        expect(result.closedAt).not.toBeNull();
        expect(result.players[1].finishes).toBeGreaterThanOrEqual(1);
        expect(result.players[1].ended).toBe(true);
      } else expect(result.players[1].ended).toBe(false); // still the same running wave
    }, 600_000);
  }

  it('ends a wave the server closed while every tab was away: clear message, finish sent, the wave stops', async () => {
    const result = await measureTwoPlayers({ roundTripMs: 200, seconds: 40, frameMs: 50, defenses: [], ships: 2, islandHp: 1e9,
      shooters: [], hidden: (index, at) => at >= 5000 && at < 25_000, closeAt: 15_000 });
    for (const player of result.players) {
      expect(player.busTypes).toContain('recovery_closed_away');
      expect(player.finishes).toBeGreaterThanOrEqual(1);
      expect(player.ended).toBe(true); // the controller stopped: the island frees its bell (wave_controller_stopped)
    }
  }, 120_000);
});
