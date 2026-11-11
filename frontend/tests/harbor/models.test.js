// The pure parts of the Harbor cards: which assets show, card states, stake sizes, win estimates,
// empty states, refusal words and the weather mapping (BUILD-PLAN 3.2, 3.4, lane H).
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {STAKES, STAKE_EVENT, offeredStakes, poolGain} from '../../src/harbor/stakes.js';
import {callView, callsView, countdownText, reasonText, rememberPrices} from '../../src/harbor/market-model.js';
import {matchView} from '../../src/harbor/match-model.js';
import {fortuneView} from '../../src/harbor/fortune-model.js';
import {PIRATE_LINES, weatherView} from '../../src/harbor/weather-model.js';
import {EXPLAIN, SIGN_IN, priceText, refusalText, resultText} from '../../src/harbor/words.js';
import {NOW, callAssets, fixture, marketCall, question, sportsBoard, weatherAnswer} from './fixtures.js';

describe('stakes', () => {
  it('are 5, 10 and 25 and nothing else', () => {
    expect(STAKES).toEqual([5, 10, 25]);
    expect(STAKE_EVENT).toBe('harbor_stake_placed');
  });
  it('keep only the sizes the server accepts', () => {
    expect(offeredStakes({minStake: 1, maxStake: 50})).toEqual([5, 10, 25]);
    expect(offeredStakes({minStake: 10, maxStake: 500})).toEqual([10, 25]); // today's Exchange rule
    expect(offeredStakes({minStake: 30, maxStake: 50})).toEqual([]);
    expect(offeredStakes(undefined)).toEqual([5, 10, 25]);
  });
  it('estimate a share of the other side after the cut, in whole coins', () => {
    expect(poolGain({stake: 10, mine: 40, total: 60, cutPercent: 5})).toBe(3); // 10/50 * 20 * 0.95 = 3.8
    expect(poolGain({stake: 25, mine: 0, total: 100, cutPercent: 0})).toBe(100);
    expect(poolGain({stake: 10, mine: 40, total: 40, cutPercent: 5})).toBe(0);
    expect(poolGain({stake: 0, mine: 0, total: 50})).toBe(0);
  });
});

describe('market stall', () => {
  const board = (extra = {}) => ({assets: callAssets(), calls: [], balance: 100, ...extra});
  it('shows one item per asset with the server names, in the server order', () => {
    expect(callsView({answer: board(), now: NOW}).assets.map(asset => asset.name)).toEqual(['Bitcoin', 'Ether', 'Gold', 'Apple', 'NVIDIA']);
  });
  it('shows plain dollar prices; real prices may be big', () => {
    expect(priceText(74339.12)).toBe('$74,339');
    expect(priceText(271.2)).toBe('$271.20');
    expect(priceText(0.5123)).toBe('$0.5123');
    expect(priceText(null)).toBeNull();
  });
  it('is open with the stakes 5, 10 and 25 on an open asset, and says the balance', () => {
    const view = callsView({answer: board(), now: NOW});
    expect(view).toMatchObject({state: 'open', balance: 100, full: false});
    expect(view.assets[0]).toMatchObject({id: 'harbor-trust', name: 'Bitcoin', price: '$74,339', reason: null, canStake: true,
      stakes: [5, 10, 25], calls: []});
  });
  it('words why a closed asset takes no call, from the server reason', () => {
    const view = callsView({answer: board(), now: NOW});
    expect(view.assets[3]).toMatchObject({name: 'Apple', price: '$271.20', reason: 'Closed outside market hours', canStake: false});
    expect(view.assets[4]).toMatchObject({name: 'NVIDIA', price: 'No price yet', reason: 'Prices unavailable right now', canStake: false});
    expect(['weekend', 'holiday', 'quote_old', 'source_off', 'demo', 'delisted', 'something_new'].map(reasonText)).toEqual([
      'Closed for the weekend', 'Closed for a holiday', 'Prices are catching up. Try again in a minute.', 'Prices unavailable right now',
      'Recorded prices only, so no calls right now', 'This stall takes no new stakes.', 'Market closed for now']);
    expect(['weekend', 'quote_old', 'source_off', 'demo'].map(reasonText).join(' ')).not.toMatch(/_|leverage|fee|position/i);
  });
  it('counts an open call down to its hour', () => {
    expect(countdownText('2026-11-11T12:42:00Z', NOW)).toBe('Decided in 42 min');
    expect(countdownText('2026-11-11T12:41:30Z', NOW)).toBe('Decided in 42 min');
    expect(countdownText('2026-11-11T12:00:30Z', NOW)).toBe('Decided in under a minute');
    expect(countdownText('2026-11-11T11:59:00Z', NOW)).toBe('Being decided now...');
    expect(callView(marketCall(), NOW)).toMatchObject({open: true, line: 'You said Up with 🪙 10.', state: 'Decided in 18 min', tone: 'info'});
  });
  it('says won with the payout, refunded with the coins back, and lost', () => {
    const decided = extra => callView(marketCall({status: 'won', settlePrice: 75000, payout: 20, ...extra}), NOW);
    expect(decided()).toMatchObject({open: false, state: 'You won 🪙 +20', tone: 'good'});
    expect(decided({status: 'refunded', payout: 10})).toMatchObject({state: 'Refunded 🪙 10', tone: 'info'});
    expect(decided({status: 'lost', direction: 'down', payout: 0})).toMatchObject({line: 'You said Down with 🪙 10.', state: 'Lost', tone: 'bad'});
  });
  it('lists the open calls and the two newest decided ones under their asset', () => {
    const calls = [marketCall(), marketCall({id: 'old', status: 'lost', payout: 0, settleAt: '2026-11-11T09:00:00Z'}),
      marketCall({id: 'new', status: 'won', payout: 20, settleAt: '2026-11-11T11:00:00Z'}),
      marketCall({id: 'mid', status: 'refunded', payout: 10, settleAt: '2026-11-11T10:00:00Z'}),
      marketCall({id: 'gold', asset: 'greyfathom-salvage', direction: 'down', stake: 5})];
    const view = callsView({answer: board({calls}), now: NOW});
    expect(view.assets[0].calls.map(call => call.id)).toEqual(['call-1', 'new', 'mid']);
    expect(view.assets[2].calls.map(call => call.state)).toEqual(['Decided in 18 min']);
  });
  it('takes no new call once 3 calls are open', () => {
    const calls = [1, 2, 3].map(n => marketCall({id: `c${n}`}));
    const view = callsView({answer: board({calls}), now: NOW});
    expect(view.full).toBe(true);
    expect(view.assets.every(asset => !asset.canStake)).toBe(true);
  });
  it('is unavailable without any answer, and loading before the first answer', () => {
    expect(callsView({failure: {ok: false, code: 'network_error', status: 0}})).toMatchObject({state: 'unavailable', line: 'Prices unavailable right now'});
    expect(callsView({}).state).toBe('loading');
    expect(callsView({answer: board(), failure: {ok: false, code: 'network_error', status: 0}, now: NOW}).state).toBe('open');
  });
  it('asks a signed-out player to sign in, never "Session expired"', () => {
    const view = callsView({answer: board(), failure: {ok: false, code: 'unauthorized', status: 401, message: 'Session expired. Sign in again.'}, now: NOW});
    expect(view).toMatchObject({state: 'signed_out', assets: []});
    expect(JSON.stringify(view)).not.toMatch(/expired/i);
    expect(SIGN_IN).toBe('Sign in or join with a class code to place a stake');
  });
  it('says the stall is closed while the market flag is off', () => {
    expect(callsView({failure: {ok: false, code: 'feature_off', status: 404}})).toMatchObject({state: 'off', line: 'This stall is closed for now.', assets: []});
  });
  it('remembers prices for the sparkline only when the quote changed', () => {
    const history = new Map();
    rememberPrices(history, callAssets());
    rememberPrices(history, callAssets());
    expect(history.get('harbor-trust')).toHaveLength(1);
    rememberPrices(history, callAssets({priceShift: 50}).map(row => ({...row, priceAt: '2026-11-11T12:00:30Z'})));
    expect(history.get('harbor-trust')).toHaveLength(2);
  });
});

describe('match board', () => {
  it('lists open matches with picks, stakes and what a win brings', () => {
    const view = matchView({board: sportsBoard(), mine: {stakes: []}, signedIn: true, now: NOW, timeZone: 'UTC'});
    expect(view.state).toBe('open');
    expect(view.matches[0]).toMatchObject({name: 'Harbor Athletic v Island United', when: 'Primeira Liga · Sat 20:00', canStake: true, stakes: [5, 10, 25]});
    expect(view.matches[0].picks.map(pick => pick.label)).toEqual(['Harbor Athletic', 'Draw', 'Island United']);
    expect(view.matches[0].hint('away', 10)).toBe('If you are right you win about 🪙 12'); // 10/30 * 40 * 0.95
    expect(view.matches[0].hint('draw', 5)).toBe('If you are right you win about 🪙 57');
  });
  it('has a friendly empty state', () => {
    expect(matchView({board: sportsBoard([]), now: NOW})).toMatchObject({state: 'empty', line: 'No matches this week. Leagues pause for internationals.'});
  });
  it('is closed while the sports flag is off, and unavailable when the board fails', () => {
    expect(matchView({boardFailure: {ok: false, status: 404, code: 'feature_off'}})).toMatchObject({state: 'closed', line: 'The match board is closed for now.'});
    expect(matchView({boardFailure: {ok: false, status: 0, code: 'connection_lost'}})).toMatchObject({state: 'unavailable', line: 'Matches unavailable right now'});
  });
  it('lets nobody pick once a match closed, and not signed out players', () => {
    const late = matchView({board: sportsBoard([fixture({closesAt: '2026-11-11T11:00:00Z'})]), signedIn: true, now: NOW});
    expect(late.matches[0]).toMatchObject({canStake: false, reason: 'Picks for this match are closed.'});
    expect(matchView({board: sportsBoard(), now: NOW, signedIn: false}).matches[0].canStake).toBe(false);
  });
  it('lists my stakes with their result in coins', () => {
    const stakes = [{id: 'a', fixtureId: 'fd-101', pick: 'home', amount: 10, payout: 18, home: 'Harbor Athletic', away: 'Island United', status: 'settled', settlement: 'winners'},
      {id: 'b', fixtureId: 'fd-102', pick: 'away', amount: 5, payout: 0, home: 'Gull Rovers', away: 'Reef Town', status: 'settled', settlement: 'winners'},
      {id: 'c', fixtureId: 'fd-103', pick: 'draw', amount: 25, payout: 25, home: 'A', away: 'B', status: 'settled', settlement: 'refund_void'}];
    const view = matchView({board: sportsBoard(), mine: {stakes}, signedIn: true, now: NOW});
    expect(view.mine.map(row => row.text)).toEqual([
      '🪙 10 on Harbor Athletic (Harbor Athletic v Island United): You won 🪙 +8',
      '🪙 5 on Reef Town (Gull Rovers v Reef Town): You lost 🪙 −5',
      '🪙 25 on Draw (A v B): Refunded 🪙 25']);
    expect(view.matches[0].taken).toBe('Your pick: Harbor Athletic, 🪙 10');
  });
});

describe('fortune teller', () => {
  it('shows open questions with yes and no', () => {
    const view = fortuneView({listReply: {kind: 'ok', data: {questions: [question()], rules: {minStake: 1, maxStake: 50, cutPercent: 5}}},
      mineReply: {kind: 'ok', data: {stakes: []}}});
    expect(view.questions[0]).toMatchObject({canStake: true, stakes: [5, 10, 25]});
    expect(view.questions[0].sides.map(side => side.label)).toEqual(['Yes', 'No']);
    expect(view.questions[0].hint('yes', 10)).toBe('If you are right you win about 🪙 11'); // 10/40 * 50 * 0.95
  });
  it('has a friendly empty state and a closed state', () => {
    expect(fortuneView({listReply: {kind: 'ok', data: {questions: [question({canStake: false, status: 'closed'})], rules: {}}}}))
      .toMatchObject({state: 'empty', line: 'No open questions right now'});
    expect(fortuneView({listReply: {kind: 'closed'}})).toMatchObject({state: 'closed', line: 'The fortune teller is closed for now.'});
  });
  it('asks a signed-out player to sign in and offers no stakes', () => {
    const view = fortuneView({listReply: {kind: 'ok', data: {questions: [question()], rules: {}}}, mineReply: {kind: 'signin'}});
    expect(view).toMatchObject({signedIn: false, signInNeeded: true});
    expect(view.questions[0].canStake).toBe(false);
  });
});

describe('weather board', () => {
  it('matches the wave weather of the server (BUILD-PLAN 3.4)', () => {
    const catalogue = JSON.parse(readFileSync(new URL('../../../backend/content/islands.json', import.meta.url), 'utf8')).weather;
    expect(Object.keys(PIRATE_LINES).sort()).toEqual(catalogue.map(entry => entry.kind).sort());
    const storm = catalogue.find(entry => entry.kind === 'storm'), fog = catalogue.find(entry => entry.kind === 'fog');
    expect(storm.ships).toBe(1.5); expect(PIRATE_LINES.storm).toBe('Storm: 50% more pirate ships');
    expect(fog.fog).toBeGreaterThan(0); expect(PIRATE_LINES.fog).toBe('Fog: pirates are seen later');
    expect(PIRATE_LINES.calm).toBe('Calm: a quiet sea');
  });
  it('shows the real weather and what it does to the pirates', () => {
    expect(weatherView(weatherAnswer('storm'))).toMatchObject({state: 'storm', line: 'Right now at Carcavelos, Portugal: Thunderstorm, windy',
      pirates: 'Storm: 50% more pirate ships', old: null});
    expect(weatherView(weatherAnswer('fog', {source: 'stale'})).old).toMatch(/last weather/);
  });
  it('falls back to a calm sea when the weather is not in', () => {
    expect(weatherView(null)).toMatchObject({state: 'calm', pirates: 'Calm: a quiet sea', line: 'The weather is not in yet. Until it is, the sea counts as calm.'});
    expect(weatherView({summary: 'Odd', state: 'hail'}).state).toBe('calm');
  });
});

describe('words', () => {
  it('say results in coins', () => {
    expect(resultText(10)).toBe('You won 🪙 +10');
    expect(resultText(-4)).toBe('You lost 🪙 −4');
    expect(resultText(0)).toBe('You got your coins back');
  });
  it('turn refusals into plain words and never repeat the server message', () => {
    expect(refusalText('insufficient_funds')).toBe('You do not have enough coins for this stake.');
    expect(refusalText('too_many_calls')).toBe('You have 3 calls waiting. Place a new one once one is decided.');
    expect(refusalText('market_closed')).toBe('The market just closed. Try again when it opens.');
    expect(refusalText('something_new')).toBe('The stall said no this time. Try again later.');
  });
  it('explain every stall in one sentence', () => {
    for (const id of ['market', 'match', 'fortune', 'weather', 'duel']) expect(EXPLAIN[id].split(/[.:]\s/).length).toBeLessThanOrEqual(2);
    expect(EXPLAIN.market).toMatch(/Binance/);
    expect(EXPLAIN.match).toMatch(/football-data\.org/);
    expect(EXPLAIN.fortune).toMatch(/Manifold/);
    expect(EXPLAIN.weather).toMatch(/Open-Meteo/);
  });
});
