// Production combat, driven by declared deterministic policies for funded balance measurements.
// Used by backend/tools/economy/funded_play.py; JSON lines in, JSON lines out. No game services.
import {registerHooks} from 'node:module';
import {createInterface} from 'node:readline';
registerHooks({load(url, context, next) {
  return next(url, url.endsWith('.json') ? {...context, importAttributes: {type: 'json'}} : context);
}});
const {createWave} = await import('../src/pirates/sim.js');
const {captainStats} = await import('../src/pirates/captain-stats.js');
const {zoneAt, spotAt, promptAt, promptLength} = await import('../src/pirates/finisher/rules.js');
const {canStand, moveWithCollisions} = await import('../src/player/collision.js');
const {placeGround} = await import('../src/world/places/surfaces.js');
const {layouts, edgeTrees} = await import('../src/world/places/layouts.js');
const {CABIN} = await import('../src/island/spots.js');
const {FOOTPRINTS} = await import('../src/island/placement.js');

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const round = value => Math.round(value * 100) / 100;

function taskInputs(state, profiles, remembered) {
  const task = state.finisher;
  if (!task) return [];
  const inputs = [];
  for (const profile of profiles) {
    const by = profile.id;
    if (!task.players.includes(by)) continue;
    if (task.phase === 'prepare') { inputs.push({type: 'finisher_ready', by, shipId: task.shipId}); continue; }
    if (task.phase !== 'task') continue;
    const row = task.tasks[task.task], key = `${task.shipId}:${by}`;
    const from = Math.max(row.from, remembered.get(key) ?? row.from), to = Math.min(row.to, task.sample);
    if (from >= to) continue;
    const difficulty = task.difficulty[row.task], lag = profile.policy === 'novice' ? 8 : 1;
    const marks = Array.from({length: to - from}, (_, offset) => {
      const s = from + offset - row.from, seen = Math.max(0, s - lag);
      if (row.task === 'haul' || row.task === 'rescue') return Math.round(zoneAt(seen, task.salt, difficulty.speed));
      if (row.task === 'cannon') return s % 6 ? -1 : Math.round(spotAt(seen, task.salt, difficulty.speed));
      const length = promptLength(false, difficulty);
      return s % length ? -1 : promptAt(by, Math.floor(seen / length), task.salt);
    });
    inputs.push({type: 'finisher_input', by, from, marks});
    remembered.set(key, to);
  }
  return inputs;
}

export function legalMovement(position, goal, seconds, colliders = []) {
  const d = distance(position, goal), travel = Math.min(d, 5 * seconds);
  if (!d) return {x: position.x, z: position.z};
  const ground = placeGround('home_islet');
  const point = moveWithCollisions(position, (goal.x - position.x) / d * travel,
    (goal.z - position.z) / d * travel, colliders, ground);
  const rounded = {x: round(point.x), z: round(point.z)};
  return canStand(rounded.x, rounded.z, colliders, ground) ? rounded : {x: position.x, z: position.z};
}

function combatColliders(options) {
  // Actual home ground, scenery and cabin, plus conservative full funded building footprints.
  // Broken structures remain blockers in this experiment; this grants no easier path than play.
  return [...layouts.home_islet.filter(row => row.collider).map(row => row.collider),
    ...edgeTrees.home_islet.map(([x, z]) => ({x, z, radius: .48})),
    {x: CABIN.x, z: CABIN.z - 1.8, width: 4.8, depth: 3.6},
    ...options.defenses.map(row => {
      const side = row.kind === 'wall' ? FOOTPRINTS.wall : row.kind === 'house' ? FOOTPRINTS.house
        : row.kind === 'watchtower' ? FOOTPRINTS.watchtower : FOOTPRINTS.tower;
      return {x: row.x, z: row.z, width: side, depth: side};
    })];
}

function actions(state, profiles, step, colliders) {
  const inputs = [];
  for (let index = 0; index < profiles.length; index++) {
    const profile = profiles[index], hero = state.party.find(item => item.id === profile.id);
    if (!hero || hero.down || profile.policy === 'idle') continue;
    const novice = profile.policy === 'novice';
    const stats = captainStats(profile.level, profile.skills, profile.weapon, {recoveryVersion: 1});
    const targets = [...state.boarders, ...state.ships].sort((a, b) => distance(a, hero) - distance(b, hero) || a.id.localeCompare(b.id));
    const target = targets[0];
    let position = {x: hero.x, z: hero.z};
    // Novices hold a heart post. Veterans walk toward a ranged target and kite boarders.
    // Every 250ms move uses production land/collision checks; nobody walks through the sea.
    let goal = {x: Math.cos(index * 2 * Math.PI / profiles.length) * 3,
      z: 2 + Math.sin(index * 2 * Math.PI / profiles.length) * 3};
    if (!novice && target) {
      const d = distance(target, hero), reach = target.id.startsWith('boarder') ? 2.2 : stats.range * .8;
      if (d > reach) goal = target;
      else if (state.boarders.some(item => distance(item, hero) < 3)) goal = {x: -hero.x, z: 4 - hero.z};
      else goal = hero;
    }
    position = legalMovement(hero, goal, .25, colliders);
    inputs.push({type: 'captain_move', by: profile.id, x: round(position.x), z: round(position.z)});
    if (novice && step % 4) continue;
    const close = state.boarders.find(item => distance(item, position) <= 2.6);
    const common = {by: profile.id, level: profile.level, skills: profile.skills,
      weapon: profile.weapon, x: round(position.x), z: round(position.z)};
    if (close) inputs.push({type: 'captain_strike', ...common, targetId: close.id});
    else if (target && distance(target, position) <= stats.range) inputs.push({type: 'captain_shot',
      ...common, targetId: target.id, ax: target.x, az: target.z});
  }
  return inputs;
}

export function playFundedWave({options, profiles}) {
  if (!profiles.length || profiles.length > 10) throw new Error('One to ten frozen profiles required.');
  const canonicalCaptains = Object.fromEntries(profiles.map(profile => [profile.id,
    {x: 0, z: 0, hpUnits: 1000000, downAtTick: null, fallId: null, reviveBasisSeq: 0}]));
  const canonicalLoadouts = Object.fromEntries(profiles.map(profile => [profile.id,
    {level: profile.level, skills: profile.skills, weapon: profile.weapon}]));
  const sim = createWave({...options, canonicalCaptains, canonicalLoadouts}), colliders = combatColliders(options);
  const counts = {}, remembered = new Map();
  let steps = 0;
  while (!sim.done) {
    if (steps >= 20000) throw new Error('Combat exceeded the measured 5,000-second safety boundary.');
    const state = sim.state();
    const inputs = [...actions(state, profiles, steps, colliders), ...taskInputs(state, profiles, remembered)];
    for (const event of sim.step(.25, inputs)) counts[event.type] = (counts[event.type] ?? 0) + 1;
    steps++;
  }
  const state = sim.state();
  return {...sim.result(), reason: sim.endReason, events: counts,
    structures: [...state.walls, ...state.towers].map(item => ({id: item.id, hp: item.hp, maxHp: item.maxHp})),
    captains: state.party.map(item => ({id: item.id, hp: item.hp, down: item.down}))};
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  for await (const line of createInterface({input: process.stdin, crlfDelay: Infinity})) {
    try { process.stdout.write(`${JSON.stringify({ok: true, result: playFundedWave(JSON.parse(line))})}\n`); }
    catch (error) { process.stdout.write(`${JSON.stringify({ok: false, error: error.message})}\n`); }
  }
}
