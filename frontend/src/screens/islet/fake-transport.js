// A local stand-in for GET /api/islet and POST /api/islet/build, with the server's answers, codes and check order. Nothing is saved.
import {fakeCatalogue as catalogue} from './fake-catalogue.js';

const ISLET_PATH = '/api/islet';
const BUILD_PATH = '/api/islet/build';
const REF_PREFIX = 'islet:';
const START_COINS = 1000;
const NEEDS = ['coins', 'timber'];
const PATTERNS = {plot: /^[a-z0-9_]{2,40}$/, type: /^[a-z0-9_]{2,40}$/, actionUid: /^[A-Za-z0-9_-]{8,64}$/};
// What failNext can ask for. "applies" means the server did the work and only the answer was lost.
const FAILURES = {
  timeout: {applies: true, status: 0, code: 'timeout', message: 'The server took too long to answer. Try again.'},
  network: {applies: false, status: 0, code: 'network_error', message: 'No connection to the server. Check your internet and try again.'},
  server: {applies: false, status: 503, code: 'database_unavailable', message: 'The database could not be reached. Try again in a moment.'},
};

const ok = data => ({ok: true, status: 200, data});
const refuse = (status, code, message) => ({ok: false, status, code, message});
const lower = text => text.toLowerCase();
const wholeSeconds = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const levelOnePrice = () => {
  const {coins, timber} = catalogue.priceList.find(entry => entry.level === 1);
  return {coins, timber};
};
const holdings = state => ({coins: state.coins, timber: state.timber ?? catalogue.starterTimber});
const freshState = coins => ({coins, timber: null, buildings: new Map(), refs: new Set()});

function requireCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a whole number from 0 up.`);
  return value;
}

function spotAnswer(spot, state) {
  const standing = state.buildings.get(spot.plot);
  const base = {
    plot: spot.plot, plotName: spot.plotName, type: spot.type, name: spot.name, about: spot.about, state: 'built',
    level: null, builtAt: null, cost: null, missing: [], canBuild: false, lockedNote: spot.lockedNote ?? null,
  };
  if (spot.standsFromStart) return base;
  if (standing) return {...base, level: standing.level, builtAt: standing.builtAt};
  const cost = levelOnePrice();
  if (!spot.buildable) return {...base, state: 'locked', cost};
  const have = holdings(state);
  const missing = NEEDS.filter(need => have[need] < cost[need]);
  return {...base, state: 'empty', cost, missing, canBuild: missing.length === 0};
}

function isletAnswer(state) {
  const have = holdings(state);
  const stationStands = [...state.buildings.values()].some(building => building.type === 'signal_station');
  return ok({
    coins: have.coins, timber: have.timber, signalStationBuilt: stationStands, playMoneyNote: catalogue.playMoneyNote,
    spots: catalogue.spots.map(spot => spotAnswer(spot, state)),
  });
}

// The request must hold exactly plot, type and actionUid, each in the allowed shape.
function shapeProblem(body) {
  if (typeof body !== 'object' || body === null) return 'The request must be a JSON object.';
  if (Object.keys(body).sort().join() !== Object.keys(PATTERNS).sort().join()) return 'The request must hold exactly plot, type and actionUid.';
  const wrong = Object.keys(PATTERNS).find(field => typeof body[field] !== 'string' || !PATTERNS[field].test(body[field]));
  return wrong ? `The field ${wrong} is not valid.` : null;
}

// The rules in the order of building.check_build on the server: plot, type, pairing, cabin, not buildable yet.
function ruleRefusal(spot, body) {
  if (!spot) return refuse(404, 'no_such_plot', 'That plot is not on your islet.');
  const known = catalogue.spots.find(item => item.type === body.type);
  if (!known) return refuse(404, 'no_such_building', 'That kind of building does not exist.');
  if (spot.type !== body.type) return refuse(422, 'wrong_plot', `The ${lower(known.name)} does not belong on the ${lower(spot.plotName)}.`);
  if (spot.standsFromStart) return refuse(409, 'plot_occupied', `Your ${lower(spot.name)} already stands here.`);
  if (!spot.buildable) return refuse(409, 'not_buildable_yet', spot.lockedNote);
  return null;
}

// The steps of islet_build() in SQL: one building per plot, then timber, then coins, then the work is done.
function charge(state, spot, actionUid, builtAt) {
  const price = levelOnePrice();
  const name = lower(spot.name);
  const timber = state.timber ?? catalogue.starterTimber;
  if (state.buildings.has(spot.plot)) return refuse(409, 'plot_occupied', `A ${name} already stands on ${spot.plotName}.`);
  if (timber < price.timber) return refuse(409, 'not_enough_timber', `The ${name} needs ${price.timber} timber. You have ${timber}.`);
  if (state.coins < price.coins) return refuse(409, 'insufficient_funds', `The ${name} costs ${price.coins} coins. You do not have enough coins.`);
  state.coins -= price.coins;
  state.timber = timber - price.timber;
  state.buildings.set(spot.plot, {type: spot.type, level: 1, builtAt});
  state.refs.add(REF_PREFIX + actionUid);
  return ok({
    plot: spot.plot, type: spot.type, name: spot.name, level: 1, coinsPaid: price.coins, timberPaid: price.timber,
    coins: state.coins, timber: state.timber,
  });
}

function build(state, body, now) {
  const problem = shapeProblem(body);
  if (problem) return refuse(422, 'validation_error', problem);
  if (state.refs.has(REF_PREFIX + body.actionUid)) return refuse(409, 'already_applied', 'This was already done.');
  const spot = catalogue.spots.find(item => item.plot === body.plot);
  return ruleRefusal(spot, body) ?? charge(state, spot, body.actionUid, wholeSeconds(now()));
}

export function createFakeIsletTransport({coins = START_COINS, now = () => new Date()} = {}) {
  let state = freshState(coins);
  const failures = [];
  const notFound = () => refuse(404, 'not_found', 'Not Found');

  // A queued failure hits the next request. A timeout still does the work, because only the answer is lost.
  async function request(work) {
    const kind = failures.shift();
    if (kind === undefined) return work();
    const failure = FAILURES[kind];
    if (failure.applies) work();
    return refuse(failure.status, failure.code, failure.message);
  }

  return {
    get: path => request(() => (path === ISLET_PATH ? isletAnswer(state) : notFound())),
    post: (path, body) => request(() => (path === BUILD_PATH ? build(state, body, now) : notFound())),
    dev: {
      setCoins(value) { state.coins = requireCount(value, 'coins'); },
      setTimber(value) { state.timber = requireCount(value, 'timber'); },
      failNext(kind) {
        if (!Object.hasOwn(FAILURES, kind)) throw new TypeError(`failNext knows ${Object.keys(FAILURES).join(', ')}.`);
        failures.push(kind);
      },
      reset() { state = freshState(coins); failures.length = 0; },
    },
  };
}
