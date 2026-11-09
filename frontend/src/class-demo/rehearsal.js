// ?demo=1: the whole demo path for one presenter alone. Simulated captains walk around Saltreach
// Harbor and wave, a practice rival answers a friendly duel, a fixture lock asks the weather question
// and two simulated captains help with the lamps. Nothing here talks to a server: every answer is made
// on this device and only for showing. The shapes equal the server's (docs/INTERFACES.md).
import {kits} from '../adapter/shared/kits.js';
import {allValidSequences, resolve} from '../screens/duels/logic.js';

// Names in the style of the server's captain names (backend/content/names.json).
const ADJECTIVES = ['Bold', 'Brave', 'Bright', 'Calm', 'Clever', 'Gentle', 'Jolly', 'Keen', 'Lucky', 'Merry'];
const NOUNS = ['Puffin', 'Gull', 'Otter', 'Heron', 'Crab', 'Dolphin', 'Gannet', 'Wren', 'Seal', 'Tern'];
const nameOf = index => `${ADJECTIVES[index % 10]} ${NOUNS[(index * 3 + Math.floor(index / 10)) % 10]} ${11 + index}`;
const KITS = Object.values(kits);
const AREA = {minX: -10, maxX: 11, minZ: 12, maxZ: 20};
const SPEED = 2.2;

export function createRehearsalCaptains({count = 14, canStand = () => true, random = Math.random} = {}) {
  const pick = (min, max) => min + random() * (max - min);
  function spot() {
    for (let i = 0; i < 20; i++) { const x = pick(AREA.minX, AREA.maxX), z = pick(AREA.minZ, AREA.maxZ); if (canStand(x, z)) return {x, z}; }
    return {x: 0, z: 18};
  }
  const bots = Array.from({length: Math.max(0, Math.min(40, count))}, (_, index) => {
    const start = spot(), kit = KITS[index % KITS.length];
    return {id: `rehearsal-captain-${index + 1}`, name: nameOf(index),
      kit: {id: kit.id, name: kit.name}, archetype: kit.archetype, x: start.x, z: start.z, target: spot(), wait: pick(0, 3),
      facing: 'front', moving: false, emote: null, emoteUntil: 0};
  });
  // A simulated captain stops and waits while the presenter stands next to it, like a person would.
  function step(delta, now, player = null) {
    for (const bot of bots) {
      if (player && Math.hypot(bot.x - player.x, bot.z - player.z) < 3) { bot.moving = false; bot.wait = Math.max(bot.wait, 1); continue; }
      if (bot.wait > 0) { bot.wait -= delta; bot.moving = false; continue; }
      const dx = bot.target.x - bot.x, dz = bot.target.z - bot.z, distance = Math.hypot(dx, dz);
      if (distance < 0.2) { bot.target = spot(); bot.wait = pick(1, 6); bot.moving = false; continue; }
      const stepLength = Math.min(distance, SPEED * delta), nx = bot.x + dx / distance * stepLength, nz = bot.z + dz / distance * stepLength;
      if (!canStand(nx, nz)) { bot.target = spot(); continue; }
      bot.x = nx;bot.z = nz;bot.moving = true;
      bot.facing = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'left' : 'right') : (dz < 0 ? 'back' : 'front');
      if (random() < delta * 0.02 && now > bot.emoteUntil + 4000) { bot.emote = random() < 0.7 ? 'wave' : 'cheer'; bot.emoteUntil = now + 1800; }
    }
  }
  // The same shape as the online adapter's presence view.
  function presence(now, place) {
    return {status: 'live', place, hiddenCount: 0, sampledAt: now,
      others: bots.map(bot => ({id: bot.id, name: bot.name, kit: bot.kit, archetype: bot.archetype, place, x: bot.x, y: bot.z,
        facing: bot.facing, moving: bot.moving, emote: bot.emoteUntil > now ? bot.emote : null, isCrew: false, at: now}))};
  }
  return {bots, step, presence, wave(now) { const bot = bots[0]; if (bot) { bot.emote = 'wave'; bot.emoteUntil = now + 1800; } }};
}

// A finished duel from one side, in the server's detail shape.
export function rehearsalDuel({id, you = 'challenger', myName = 'You', otherName, mine, theirs}) {
  const challenger = you === 'challenger' ? mine : theirs, opponent = you === 'challenger' ? theirs : mine;
  const result = resolve(challenger, opponent);
  const point = value => (value === 'even' ? 'even' : value === you ? 'you' : 'them');
  const reveal = result.roundResults.map((value, index) => ({round: index + 1, yours: mine[index], theirs: theirs[index], point: point(value)}));
  const score = {you: reveal.filter(entry => entry.point === 'you').length, them: reveal.filter(entry => entry.point === 'them').length};
  return {id, status: 'finished', you, challengerName: you === 'challenger' ? myName : otherName, opponentName: you === 'challenger' ? otherName : myName,
    rounds: mine.length, stake: 0, coinsChange: 0, score, yourResult: score.you > score.them ? 'won' : score.you < score.them ? 'lost' : 'draw', reveal};
}

const reply = data => Promise.resolve({ok: true, status: 200, data});
const later = (ms, value) => new Promise(done => setTimeout(() => done(value), ms));

// The practice rival: every challenge is answered after a short pause with a random sealed sequence.
export function createRehearsalDuels({random = Math.random, answerAfterMs = 2600} = {}) {
  const duels = new Map();let serial = 0;
  const sequence = () => { const all = allValidSequences(3); return all[Math.floor(random() * all.length)]; };
  return {
    async challenge({opponentName, signals}) {
      const id = `rehearsal-duel-${++serial}`;
      duels.set(id, {id, opponentName, signals, readyAt: Date.now() + answerAfterMs});
      await later(300);
      return {ok: true, status: 200, data: {duel: {id, status: 'open', you: 'challenger', opponentName, rounds: 3, stake: 0, reveal: null}}};
    },
    async detail(id) {
      const duel = duels.get(id);
      if (!duel) return {ok: false, status: 404, code: 'no_such_duel'};
      if (Date.now() < duel.readyAt) return reply({duel: {id, status: 'open', reveal: null}});
      duel.finished ??= rehearsalDuel({id, you: duel.you ?? 'challenger', otherName: duel.opponentName, mine: duel.signals ?? sequence(), theirs: sequence()});
      return reply({duel: duel.finished});
    },
    // A simulated captain challenges the presenter.
    invite(challengerName) {
      const id = `rehearsal-duel-${++serial}`;
      duels.set(id, {id, opponentName: challengerName, you: 'opponent', readyAt: 0});
      return {id, status: 'open', challengerName, opponentName: 'You', rounds: 3, stake: 0, canAnswer: true};
    },
    async answer({id, signals}) {
      const duel = duels.get(id);
      if (!duel) return {ok: false, status: 404, code: 'no_such_duel'};
      await later(500);
      duel.finished = rehearsalDuel({id, you: 'opponent', otherName: duel.opponentName, mine: signals, theirs: sequence()});
      return reply({duel: duel.finished});
    },
    async decline(id) { duels.delete(id); return {ok: true, status: 200, data: {}}; },
  };
}

// The fixture lock: Lisbon, live weather "cloudy"; one step away counts as close; the hint path works
// after one wrong answer, exactly like the server's rules.
const CHOICES = [{id: 'clear', label: 'Sunny or clear'}, {id: 'cloudy', label: 'Cloudy'}, {id: 'rain', label: 'Rain'}, {id: 'fog', label: 'Fog or mist'}, {id: 'snow', label: 'Snow'}];
const CLOSE = {clear: ['cloudy'], cloudy: ['clear', 'fog', 'rain'], fog: ['cloudy', 'rain'], rain: ['cloudy', 'fog', 'snow'], snow: ['rain']};
export function createRehearsalLock({sky = 'cloudy'} = {}) {
  let wrong = 0, offered = false, opened = false;
  const view = place => ({question: `What does the sky over ${place?.name ?? 'Lisbon'} look like right now?`,
    note: 'Rehearsal: this lock pretends the sky is cloudy. In class it uses the real weather of your place (Open-Meteo).',
    place: {name: place?.name ?? 'Lisbon', latitude: place?.latitude ?? 38.72, longitude: place?.longitude ?? -9.14, source: place ? 'chosen' : 'ip'},
    weatherSource: 'live', choices: CHOICES, opened, hintReady: wrong > 0, attribution: 'Weather data by Open-Meteo.com, adapted for the game'});
  let place = null;
  return {
    read: async chosen => { place = chosen; return reply(view(place)); },
    async answer({answer}) {
      await later(250);
      if (opened) return reply({accepted: true, reason: null, match: null, alreadyOpen: true, message: 'The lock is already open.', lock: view(place)});
      if (answer === 'hint' || answer === 'hint_confirm') {
        if (!wrong) return reply({accepted: false, reason: 'hint_too_early', match: null, message: 'Try one answer first.', lock: view(place)});
        if (answer === 'hint' || !offered) { offered = true; return reply({accepted: false, reason: 'hint_offered', match: null, prompt: 'I looked outside', message: 'Look outside once more. If the sky really looks different, the lock trusts you.', lock: view(place)}); }
        opened = true;return reply({accepted: true, reason: null, match: 'hint', message: 'You looked outside, and the lock believes you. It opens.', lock: view(place)});
      }
      if (answer === sky || CLOSE[sky]?.includes(answer)) {
        opened = true;
        return reply({accepted: true, reason: null, match: answer === sky ? 'exact' : 'close',
          message: answer === sky ? `Right: the sky over ${view(place).place.name} is cloudy. The lock opens.` : 'Close enough: the reading says Cloudy, one step from your answer. The lock opens.', lock: view(place)});
      }
      wrong += 1;
      return reply({accepted: false, reason: 'wrong', match: null, message: 'Not quite. Look out of the window and try again.', lock: view(place)});
    },
    search: async text => reply({places: [{name: text.trim().replace(/^./, letter => letter.toUpperCase()), region: 'Rehearsal', country: 'Portugal', latitude: 38.72, longitude: -9.14}],
      attribution: 'Place search by Open-Meteo.com, data from GeoNames'}),
  };
}
