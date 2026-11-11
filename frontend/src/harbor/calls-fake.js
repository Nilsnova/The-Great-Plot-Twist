// A local stand-in for the market call routes, for the dev build with ?market=local. Memory only, made-up
// prices that drift a little on every read. Same surface and answers as calls-http.js, so the card cannot
// tell them apart. The rules follow INTERFACES.md (the market stall): 5, 10 or 25 coins, at most 3 open
// calls, decided on the first read at or after settleAt (higher or lower than the opening price; the
// same price refunds); a win pays 2 x stake. market-card.js imports it only behind import.meta.env.DEV.
//   const adapter = createFakeCallsAdapter({settleMs, now});
const ASSETS = [
  {id: 'harbor-trust', name: 'Bitcoin', price: 76159.21},
  {id: 'tidewright-works', name: 'Ether', price: 3412.55},
  {id: 'greyfathom-salvage', name: 'Gold', price: 3987.4},
  {id: 'apple', name: 'Apple', price: 271.2},
  {id: 'nvidia', name: 'NVIDIA', price: 190.1, closedReason: 'outside_hours'},
];
const STAKES = [5, 10, 25], MAX_OPEN = 3, KEEP_DECIDED = 10, HOUR_MS = 3600000;

export function createFakeCallsAdapter({settleMs = HOUR_MS, now = () => Date.now(), balance: start = 100} = {}) {
  let balance = start, count = 0;
  const assets = ASSETS.map(asset => ({...asset, closedReason: asset.closedReason ?? null}));
  const calls = [], receipts = new Map();
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const refuse = (status, code) => ({ok: false, status, code, message: ''});
  const assetView = asset => ({id: asset.id, name: asset.name, price: asset.price, priceAt: iso(now()),
    open: asset.closedReason === null, closedReason: asset.closedReason});
  function drift() {
    for (const asset of assets) if (asset.closedReason === null) asset.price = Math.round(asset.price * (1 + (Math.random() - 0.5) / 500) * 100) / 100;
  }
  function settle() {
    for (const call of calls) {
      if (call.status !== 'open' || Date.parse(call.settleAt) > now()) continue;
      const price = assets.find(asset => asset.id === call.asset).price;
      const right = call.direction === 'up' ? price > call.openPrice : price < call.openPrice;
      call.settlePrice = price;
      call.status = price === call.openPrice ? 'refunded' : right ? 'won' : 'lost';
      call.payout = call.status === 'won' ? call.stake * 2 : call.status === 'refunded' ? call.stake : 0;
      balance += call.payout;
    }
  }
  const listed = () => [...calls.filter(call => call.status === 'open'),
    ...calls.filter(call => call.status !== 'open').sort((a, b) => b.settleAt.localeCompare(a.settleAt)).slice(0, KEEP_DECIDED)];
  return {
    async read() {
      drift(); settle();
      return {ok: true, status: 200, data: structuredClone({assets: assets.map(assetView), calls: listed(), balance})};
    },
    async place({asset: id, direction, stake} = {}, {uid} = {}) {
      if (receipts.has(uid)) return {ok: true, status: 200, data: structuredClone({...receipts.get(uid), balance})};
      const asset = assets.find(row => row.id === id);
      if (!asset) return refuse(404, 'no_such_asset');
      if (!['up', 'down'].includes(direction)) return refuse(422, 'validation_error');
      if (!STAKES.includes(stake)) return refuse(422, 'bad_stake');
      if (asset.closedReason !== null) return refuse(409, 'market_closed');
      if (calls.filter(call => call.status === 'open').length >= MAX_OPEN) return refuse(409, 'too_many_calls');
      if (balance < stake) return refuse(409, 'insufficient_funds');
      balance -= stake; count += 1;
      const opened = now();
      const call = {id: `local-call-${count}`, asset: id, direction, stake, openPrice: asset.price, openedAt: iso(opened),
        settleAt: iso(opened + settleMs), status: 'open', settlePrice: null, payout: null};
      calls.push(call); receipts.set(uid, call);
      return {ok: true, status: 200, data: structuredClone({...call, balance})};
    },
  };
}
