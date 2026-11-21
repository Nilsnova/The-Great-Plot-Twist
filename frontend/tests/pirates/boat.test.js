// D057: the own boat's games (src/pirates/boat/rules.js): pure scoring of 100 ms samples like the boss finishers,
// the timing windows, the difficulty by wave (finisher/difficulty.js), the stars, the coins (the same formula as
// backend/server/island/boat.py and boat.json), the unlock at wave 30, and the fake server's once-per-wave cap.
import { describe, expect, it } from 'vitest';
import server from '../../../backend/content/boat.json';
import copy from '../../src/pirates/boat/boat.json';
import {
  BOAT, GAME_TEXT, boatDifficulty, boatSalt, coinsFor, dice, enemyX, fallOf, itemsOf, passAt, passesOf, scoreBroadside, scoreDash,
  scoreOf, shotAt, starsOf,
} from '../../src/pirates/boat/rules.js';
import { CURVES, difficultyFor, pressure } from '../../src/pirates/finisher/difficulty.js';
import { waveOf } from '../../src/campaign/index.js';
import { sailModel, wreckModel } from '../../src/island/card-model.js';
import { campaignOf } from '../../src/campaign/index.js';
import { isBoatReward, isBoatStatus } from '../../src/island/api.js';
import { createFakeIslandApi, createFakeWorld } from '../../src/pirates/fake-api.js';

const WAVES = [30, 31, 45, 60, 80, 99, 100];
const CODE = 'ISLE-K7Q2M';
const at = (game, wave) => ({ salt: boatSalt(CODE, wave, game), difficulty: boatDifficulty(game, wave) });

// A broadside captain who fires `lag` samples after the ship is closest to the middle (0 = a perfect eye).
function broadsideShots(passes, lag = 0) {
  const shots = new Map();
  for (const pass of passes) {
    let best = pass.from, off = Infinity;
    for (let s = pass.from; s < pass.to; s++) { const now = Math.abs(enemyX(pass, s + .5) - 50); if (now < off) { off = now; best = s; } }
    shots.set(Math.min(pass.to - 1, best + lag), 1);
  }
  return shots;
}
// A dash helmsman who heads for the next coin `look` samples ahead at the boat's real speed and skips cannonballs.
function dashCourse(items, { lag = 0 } = {}) {
  const samples = new Map(), step = BOAT.dash.steer / 10;
  let x = 50;
  for (let s = 0; s < BOAT.samples; s++) {
    const next = items.find(item => item.kind === 'coin' && item.at >= s + lag);
    if (next) x += Math.sign(next.x - x) * Math.min(Math.abs(next.x - x), step);
    samples.set(s, x);
  }
  return samples;
}

describe('the boat table', () => {
  it('is the same data as backend/content/boat.json, and opens after wave 30 with the campaign', () => {
    expect(copy).toEqual(server);
    expect(BOAT.games).toEqual(['broadside', 'dash']);
    expect(waveOf('ship')).toBe(30);
    expect(Object.keys(GAME_TEXT)).toEqual(BOAT.games);
  });
  it('plays 20 s rounds of 100 ms samples, after a 3 s picture card', () => {
    expect(BOAT.samples * BOAT.sampleMs).toBe(20000);
    expect(BOAT.intro * BOAT.sampleMs).toBe(3000);
  });
});

describe('the coins: modest, by stars and the wave, capped', () => {
  it('pay stars x (6 + wave / 5), the wave capped at 100 and the stars at 3', () => {
    expect([30, 34, 35, 50, 100, 400].map(wave => coinsFor(3, wave))).toEqual([36, 36, 39, 48, 78, 78]);
    expect([-2, 0, 1, 2, 3, 7, 2.9].map(stars => coinsFor(stars, 30))).toEqual([0, 0, 12, 24, 36, 36, 24]);
    expect(coinsFor('x', 'y')).toBe(0);
  });
  it('stay well under a won wave\'s loot (25 + 10n to wave 30, then +4 a wave): both games together under a third', () => {
    for (const wave of WAVES) {
      const loot = wave <= 30 ? 25 + 10 * wave : 325 + 4 * (wave - 30);
      expect(2 * coinsFor(3, wave), `wave ${wave}`).toBeLessThan(loot / 3);
    }
  });
});

describe('difficulty by wave', () => {
  it('uses the finishers\' curve: early numbers before wave 10, late at 100, harder in between', () => {
    expect(difficultyFor('broadside', 10)).toEqual({ speed: 1, width: 9, easyWidth: 13 });
    expect(difficultyFor('broadside', 100)).toEqual({ speed: 1.45, width: 6.5, easyWidth: 10 });
    expect(difficultyFor('dash', 100)).toEqual({ speed: 1.4, catch: 6.5, easyCatch: 9, balls: 16 });
    let before = null;
    for (const wave of WAVES) {
      const b = boatDifficulty('broadside', wave), d = boatDifficulty('dash', wave);
      if (before) {
        expect(b.speed).toBeGreaterThanOrEqual(before.b.speed); expect(b.width).toBeLessThanOrEqual(before.b.width);
        expect(d.speed).toBeGreaterThanOrEqual(before.d.speed); expect(d.catch).toBeLessThanOrEqual(before.d.catch);
        expect(d.balls).toBeGreaterThanOrEqual(before.d.balls);
      }
      expect(b.easyWidth).toBeGreaterThan(b.width); expect(d.easyCatch).toBeGreaterThan(d.catch);
      expect(Number.isInteger(d.balls)).toBe(true);
      before = { b, d };
    }
    expect(Object.keys(CURVES)).toEqual(expect.arrayContaining(['broadside', 'dash']));
    expect(pressure(30)).toBeCloseTo(.22, 2);
  });
  it('sends faster, more ships at a higher wave, and gives a dash item less time on screen', () => {
    const early = passesOf(at('broadside', 30).salt, boatDifficulty('broadside', 30));
    const late = passesOf(at('broadside', 30).salt, boatDifficulty('broadside', 100));
    const mean = list => list.reduce((sum, pass) => sum + pass.to - pass.from, 0) / list.length;
    expect(mean(late)).toBeLessThan(mean(early));
    expect(late.length).toBeGreaterThanOrEqual(early.length);
    expect(fallOf(boatDifficulty('dash', 100))).toBeLessThan(fallOf(boatDifficulty('dash', 30)));
  });
});

describe('the same sea for the whole crew', () => {
  it('comes from the island, its best wave and the game, never from the clock', () => {
    expect(boatSalt('ISLE-K7Q2M', 30, 'dash')).toBe(boatSalt('isle-k7q2m', 30, 'dash'));
    expect(boatSalt(CODE, 30, 'dash')).not.toBe(boatSalt(CODE, 31, 'dash'));
    expect(boatSalt(CODE, 30, 'dash')).not.toBe(boatSalt(CODE, 30, 'broadside'));
    const { salt, difficulty } = at('dash', 42);
    expect(itemsOf(salt, difficulty)).toEqual(itemsOf(salt, difficulty));
    expect(passesOf(salt, boatDifficulty('broadside', 42))).toEqual(passesOf(salt, boatDifficulty('broadside', 42)));
    const roll = dice(7), again = dice(7);
    expect([roll(), roll(), roll()]).toEqual([again(), again(), again()]);
  });
});

describe('Broadside duel: timing windows and scoring', () => {
  it('ships cross one after another inside the round, never two at once', () => {
    for (const wave of WAVES) {
      const passes = passesOf(at('broadside', wave).salt, boatDifficulty('broadside', wave));
      expect(passes.length, `wave ${wave}`).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < passes.length; i++) {
        expect(passes[i].to).toBeLessThanOrEqual(BOAT.samples);
        if (i) expect(passes[i].from).toBeGreaterThan(passes[i - 1].to);
      }
    }
  });
  it('a shot in the band\'s middle third is a bullseye, inside the band a hit, outside a miss', () => {
    const pass = { k: 0, from: 0, to: 100, dir: 1 }; // 1 unit a sample: the ship is at s + .5
    expect(shotAt(pass, 50, 9)).toBe('bull');   // 0.5 off
    expect(shotAt(pass, 53, 9)).toBe('hit');    // 3.5 off: outside 9 / 3
    expect(shotAt(pass, 58, 9)).toBe('hit');    // 8.5 off
    expect(shotAt(pass, 59, 9)).toBe('miss');   // 9.5 off
    expect(shotAt(pass, 40, 9)).toBe('miss');
    expect(shotAt(null, 50, 9)).toBe('miss');
    // A fast ship jumps more than the band in one sample: there is still always one bullseye sample.
    const fast = { k: 0, from: 0, to: 8, dir: -1 };
    expect([...Array(8).keys()].some(s => shotAt(fast, s, 2) === 'bull')).toBe(true);
  });
  it('a perfect eye sinks every ship with a bullseye (3 stars); a quarter second late still wins stars', () => {
    for (const wave of WAVES) {
      const { salt, difficulty } = at('broadside', wave), passes = passesOf(salt, difficulty);
      const perfect = scoreBroadside(broadsideShots(passes), { salt, difficulty });
      expect(perfect).toMatchObject({ hits: passes.length, bulls: passes.length, score: perfect.max });
      expect(starsOf('broadside', perfect)).toBe(3);
      const late = scoreBroadside(broadsideShots(passes, 1), { salt, difficulty });
      expect(starsOf('broadside', late), `wave ${wave}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('the guns reload: firing blind all round wins at most one star, and a ship sinks once', () => {
    for (const wave of WAVES) {
      const { salt, difficulty } = at('broadside', wave), blind = new Map();
      for (let s = 0; s < BOAT.samples; s++) blind.set(s, 1);
      const result = scoreBroadside(blind, { salt, difficulty });
      expect(result.shots).toBe(Math.ceil(BOAT.samples / BOAT.broadside.cooldown));
      expect(starsOf('broadside', result), `wave ${wave}`).toBeLessThanOrEqual(1);
      expect(result.hits).toBeLessThanOrEqual(result.ships);
    }
    const { salt, difficulty } = at('broadside', 30), [first] = passesOf(salt, difficulty);
    const twice = broadsideShots([first]); const [s] = twice.keys(); twice.set(s + BOAT.broadside.cooldown, 1);
    expect(scoreBroadside(twice, { salt, difficulty }).hits).toBe(1);
  });
  it('a miss at 0 points leaves no hidden debt: miss, then bullseye, is 2 points like the bullseye alone', () => {
    const { salt, difficulty } = at('broadside', 30), [first, second] = passesOf(salt, difficulty);
    const bull = [...broadsideShots([first]).keys()][0], early = bull - BOAT.broadside.cooldown;
    expect(shotAt(passAt(passesOf(salt, difficulty), early), early, difficulty.width)).toBe('miss'); // the early ball finds only sea
    expect(scoreBroadside(new Map([[bull, 1]]), { salt, difficulty })).toMatchObject({ score: 2, misses: 0 });
    expect(scoreBroadside(new Map([[early, 1], [bull, 1]]), { salt, difficulty })).toMatchObject({ score: 2, misses: 1, bulls: 1 });
    // A miss after points still costs one, and never more than the points held.
    const late = Math.min(first.to - 1, bull + BOAT.broadside.cooldown), after = second.from - 1 > late ? late : null;
    if (after !== null) expect(scoreBroadside(new Map([[bull, 1], [after, 1]]), { salt, difficulty })).toMatchObject({ score: 1, misses: 1 });
  });
  it('ignores input outside the round and values other than a shot; easy widens the band', () => {
    const { salt, difficulty } = at('broadside', 60);
    expect(scoreBroadside(new Map([[-1, 1], [BOAT.samples, 1], [5, 7], [6, -1]]), { salt, difficulty }).shots).toBe(0);
    const passes = passesOf(salt, difficulty), pass = passes[0];
    const edge = [...Array(pass.to - pass.from).keys()].map(i => pass.from + i)
      .find(s => shotAt(pass, s, difficulty.width) === 'miss' && shotAt(pass, s, difficulty.easyWidth) !== 'miss');
    expect(edge).toBeDefined();
    const one = new Map([[edge, 1]]);
    expect(scoreBroadside(one, { salt, difficulty }).hits).toBe(0);
    expect(scoreBroadside(one, { salt, difficulty, easy: true }).hits).toBe(1);
    expect(passAt(passes, pass.from)).toBe(pass);
  });
});

describe('Treasure dash: coins, cannonballs and scoring', () => {
  it('lays out patterns of four coins and the wave\'s cannonballs, never one right on a coin', () => {
    for (const wave of WAVES) {
      const { salt, difficulty } = at('dash', wave), items = itemsOf(salt, difficulty);
      const coins = items.filter(item => item.kind === 'coin'), balls = items.filter(item => item.kind === 'ball');
      expect(coins.length % 4).toBe(0);
      expect(balls).toHaveLength(difficulty.balls);
      for (const item of items) { expect(item.at).toBeGreaterThan(0); expect(item.at).toBeLessThan(BOAT.samples); expect(item.x).toBeGreaterThanOrEqual(6); expect(item.x).toBeLessThanOrEqual(94); }
      for (const ball of balls) expect(coins.some(coin => Math.abs(coin.at - ball.at) <= 2 && Math.abs(coin.x - ball.x) < 14), `wave ${wave}`).toBe(false);
    }
  });
  it('a coin under the boat is +1, a cannonball -2 with a short shelter after, never below 0', () => {
    const items = itemsOf(at('dash', 30).salt, boatDifficulty('dash', 30));
    const coin = items.find(item => item.kind === 'coin'), ball = items.find(item => item.kind === 'ball');
    const { salt, difficulty } = at('dash', 30);
    expect(scoreDash(new Map([[coin.at, coin.x]]), { salt, difficulty })).toMatchObject({ coins: 1, hits: 0, score: 1 });
    expect(scoreDash(new Map([[coin.at, coin.x + difficulty.catch + .5]]), { salt, difficulty }).coins).toBe(0);
    expect(scoreDash(new Map([[coin.at, coin.x + difficulty.catch + .5]]), { salt, difficulty, easy: true }).coins).toBe(1);
    expect(scoreDash(new Map([[ball.at, ball.x]]), { salt, difficulty })).toMatchObject({ hits: 1, score: 0 });
    const hits = new Map(); for (const item of items) if (item.kind === 'ball') hits.set(item.at, item.x);
    expect(scoreDash(hits, { salt, difficulty }).score).toBe(0);
    expect(scoreDash(new Map([[ball.at, 150]]), { salt, difficulty }).hits).toBe(0); // a place off the sea is ignored
  });
  it('an early cannonball at 0 coins leaves no debt for the coins caught after it', () => {
    for (const wave of WAVES) {
      const { salt, difficulty } = at('dash', wave), items = itemsOf(salt, difficulty);
      const ball = items.find(item => item.kind === 'ball');
      const later = items.filter(item => item.kind === 'coin' && item.at > ball.at + BOAT.dash.shelter).slice(0, 3);
      const before = items.filter(item => item.kind === 'coin' && item.at <= ball.at).length;
      if (later.length < 3) continue;
      const samples = new Map([[ball.at, ball.x], ...later.map(coin => [coin.at, coin.x])]);
      const result = scoreDash(samples, { salt, difficulty });
      // Coins that happen to lie under the boat before the ball may be lost to it; the three after it always count.
      expect(result.hits, `wave ${wave}`).toBeGreaterThanOrEqual(1);
      if (before === 0 || result.coins === 3) expect(result.score, `wave ${wave}`).toBeGreaterThanOrEqual(3 - (result.hits - 1) * BOAT.dash.ballCost);
    }
    // The plain case, hand-made: ball at 0 coins, then one coin: 1 point, not 0.
    const { salt, difficulty } = at('dash', 30), items = itemsOf(salt, difficulty);
    const ball = items.find(item => item.kind === 'ball'), coin = items.find(item => item.kind === 'coin' && item.at > ball.at + BOAT.dash.shelter);
    expect(scoreDash(new Map([[ball.at, ball.x], [coin.at, coin.x]]), { salt, difficulty })).toMatchObject({ hits: 1, coins: 1, score: 1 });
  });
  it('a helmsman who follows the coins wins 3 stars; one who sits still wins none', () => {
    for (const wave of WAVES) {
      const { salt, difficulty } = at('dash', wave), items = itemsOf(salt, difficulty);
      expect(starsOf('dash', scoreDash(dashCourse(items), { salt, difficulty })), `wave ${wave}`).toBe(3);
      const still = new Map(); for (let s = 0; s < BOAT.samples; s++) still.set(s, 50);
      expect(starsOf('dash', scoreDash(still, { salt, difficulty })), `wave ${wave}`).toBe(0);
    }
  });
});

describe('both games', () => {
  it('score through scoreOf with the wave\'s numbers, and stars follow the share of the best score', () => {
    expect(scoreOf('dash', new Map(), { wave: 30, salt: 1 }).max).toBeGreaterThan(0);
    expect(() => scoreOf('kraken', new Map())).toThrow();
    expect([0, .24, .25, .5, .74, .75, 1].map(share => starsOf('broadside', { score: share * 100, max: 100 }))).toEqual([0, 0, 1, 2, 2, 3, 3]);
    expect([.39, .4, .65, .85].map(share => starsOf('dash', { score: share * 100, max: 100 }))).toEqual([0, 1, 2, 3]);
    expect(starsOf('dash', { score: 5, max: 0 })).toBe(0);
  });
});

describe('the wreck card: the boat opens after wave 30, repaired', () => {
  const campaign = (wave, paid = 500) => campaignOf({ waveBest: wave, campaign: { wave, wreck: { paid, goal: 500, gifts: [25, 100] } } });
  it('waits for wave 30, then for the repair, then lists both games with their pay', () => {
    expect(sailModel({ campaign: campaign(29), done: true })).toMatchObject({ open: false, note: 'She sails after wave 30.', games: [] });
    expect(sailModel({ campaign: campaign(30, 300), done: false })).toMatchObject({ open: false, note: 'Finish her repair and she sails.' });
    const open = wreckModel({ campaign: campaign(30), coins: 10 });
    expect(open.title).toBe('Your ship');
    expect(open.sail.games.map(game => [game.id, game.pay, game.disabled])).toEqual([['broadside', '★★★ = 🪙 36', false], ['dash', '★★★ = 🪙 36', false]]);
    const paid = sailModel({ campaign: campaign(40), done: true, boat: { open: true, games: [{ id: 'dash', paid: true, best: 42 }] } });
    expect(paid.games.map(game => game.pay)).toEqual(['★★★ = 🪙 42', 'Paid ✓ · play for fun']);
    expect(sailModel({ campaign: campaign(40), done: true, battle: true })).toMatchObject({ note: 'Sail between waves.' });
    expect(sailModel({ campaign: campaign(40), done: true, battle: true }).games.every(game => game.disabled)).toBe(true);
  });
});

describe('the fake server pays like the real one: once per game, player, island and best wave', () => {
  it('locks before 30, asks for the repair, pays the server\'s coins once, and again after the next won wave', async () => {
    const world = createFakeWorld(), api = createFakeIslandApi({ world, version: 2 });
    const mine = await api.island();
    const island = world.islands.get(mine.code.replace('ISLE-', ''));
    island.waveBest = 29; island.wreck = 500;
    expect(await api.boatStatus()).toMatchObject({ open: false, reason: 'locked', unlockWave: 30 });
    await expect(api.boatReward({ game: 'dash', stars: 3 })).rejects.toMatchObject({ status: 409, code: 'locked' });
    island.waveBest = 30; island.wreck = 400;
    expect(await api.boatStatus()).toMatchObject({ open: false, reason: 'not_repaired' });
    island.wreck = 500;
    const status = await api.boatStatus();
    expect(isBoatStatus(status)).toBe(true);
    expect(status.games).toEqual([{ id: 'broadside', paid: false, best: 36 }, { id: 'dash', paid: false, best: 36 }]);
    const before = (await api.island()).coins;
    const paid = await api.boatReward({ game: 'dash', stars: 2 });
    expect(isBoatReward(paid)).toBe(true);
    expect(paid).toMatchObject({ coins: 24, paid: true, balance: before + 24 });
    expect(await api.boatReward({ game: 'dash', stars: 3 })).toMatchObject({ coins: 0, paid: false, already: true });
    expect((await api.boatStatus()).games.map(game => game.paid)).toEqual([false, true]);
    await expect(api.boatReward({ game: 'dash', stars: 4 })).rejects.toMatchObject({ status: 422 });
    await expect(api.boatReward({ game: 'raft', stars: 1 })).rejects.toMatchObject({ status: 400 });
    island.waveBest = 31;
    expect(await api.boatReward({ game: 'dash', stars: 3 })).toMatchObject({ coins: 36, paid: true });
  });
});
