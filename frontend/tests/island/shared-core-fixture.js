// Exact synthetic shared replies. Used by client contract and browser tests; no live account is used.
export const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const economy = () => ({
  mode: 'island_shared', version: 1,
  islandOwner: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  accountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  runEpoch: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', revision: '1',
  treasury: {balanceCoins: '9007199254741001', committedCoins: '1', availableCoins: '9007199254741000'},
});
const quote = (target, intent) => ({target, intent, available: true, reason: null});
const emptySpot = (id, kind) => ({id, kind, kinds: [kind], built: false, level: 0,
  instanceId: null, spec: null, treeA: 0, treeB: 0, revision: '0', x: 1, z: 2, hpUnits: null, maxHP: null});

export function sharedFixture() {
  const crewOffers = [
    {crew: 'gunner', priceCoins: '50', maxCount: 5, unlockWave: 3},
    {crew: 'lookout', priceCoins: '20', maxCount: 1, unlockWave: 3},
    {crew: 'carpenter', priceCoins: '100', maxCount: 2, unlockWave: 3},
    {crew: 'guard', priceCoins: '75', maxCount: 2, unlockWave: 3},
  ].map(row => ({...row, count: 0, available: row.crew !== 'carpenter', reason: row.crew === 'carpenter' ? 'crew_unavailable' : null}));
  return {
    snapshotVersion: 1, actorId, code: 'ISLE-K7Q2M', ownerName: 'Ianno', economy: economy(),
    admissionState: 'active', waveBest: 20, nextWave: 21, flags: 0, recoveryVersion: 1, waveProtocol: 2,
    serverNow: '2026-11-18T12:00:00Z', crew: {gunner: 0, carpenter: 2, guard: 0, lookout: 0}, crewOffers,
    personalCaptain: null, spots: [emptySpot('cannon_1', 'cannon'), emptySpot('wall_1', 'wall')],
    research: [{branch: 'cannon', tier: 0, choice2: null, choice3: null, revision: '0', coinsPaid: '0'}],
    wreck: {paidCoins: '0', goalCoins: '500'}, layout: {version: 2, grid: 1, movable: false},
    quotes: {
      build: [quote({spot: 'cannon_1', kind: 'cannon'}, {spot: 'cannon_1', kind: 'cannon', instanceId: null, expectedLevel: 0, quotedCoins: '10'}),
        quote({spot: 'wall_1', kind: 'wall'}, {spot: 'wall_1', kind: 'wall', instanceId: null, expectedLevel: 0, quotedCoins: '10'})],
      upgrade: [], demolish: [], towerSkill: [], towerTree: [],
      research: [quote({branch: 'cannon', tier: 1, choice: null, change: false},
        {branch: 'cannon', tier: 1, choice: null, change: false, expected: {tier: 0, choice2: null, choice3: null, revision: '0'}, quotedCoins: '180'})],
      wreck: [quote({amount: 25}, {amount: 25, quotedCoins: '25'})],
    },
    capabilities: Object.fromEntries(['arsenal', 'session', 'move', 'repair', 'reset', 'market', 'match']
      .map(key => [key, {available: false, reason: 'economy_path_unavailable'}])),
  };
}

export function receipt(snapshot, body, action) {
  const {mode, version, islandOwner, accountId, runEpoch} = snapshot.economy;
  let result = {spot: body.spot, kind: body.kind, level: 1, chargedCoins: body.quotedCoins, refundedCoins: '0',
    instanceId: '11111111-1111-4111-8111-111111111111'};
  if (action === 'hire') result = {crew: body.crew, previousCount: 0, count: 1, chargedCoins: '50',
    treasuryReceiptId: '11111111-1111-4111-8111-111111111111'};
  if (action === 'research') result = {chargedCoins: body.quotedCoins, treasuryReceiptId: '11111111-1111-4111-8111-111111111111',
    research: {branch: body.branch, tier: body.tier, choice2: body.choice, choice3: null, revision: '1', coinsPaid: body.quotedCoins},
    building: null, wreckPaid: null};
  return {status: 'done', repeat: true, currentEconomy: null, receipt: {
    receiptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', actionUid: body.actionUid, action, actorId: snapshot.actorId,
    origin: {mode, version, islandOwner, accountId, runEpoch}, result,
  }};
}

// The fixture represents server affordability decisions, including prices different from bundled legacy data.
export function fundedFixture(economy) {
  const snapshot = sharedFixture(); snapshot.economy = economy;
  for (const rows of Object.values(snapshot.quotes)) for (const row of rows) {
    if (row.intent && BigInt(row.intent.quotedCoins) > BigInt(economy.treasury.availableCoins)) {
      row.available = false; row.reason = 'insufficient_funds';
    }
  }
  for (const row of snapshot.crewOffers) if (BigInt(row.priceCoins) > BigInt(economy.treasury.availableCoins)) {
    row.available = false; row.reason = 'insufficient_funds';
  }
  return snapshot;
}

// Translate a legacy scene fixture into the current negotiated server DTO for domain wiring tests.
export function sharedProjection(legacy, changes = {}) {
  const snapshot=sharedFixture(),wreck=legacy.campaign?.wreck;
  return {...snapshot,code:legacy.code,ownerName:legacy.ownerName??'Fixture captain',
    waveBest:legacy.waveBest,nextWave:(legacy.waveBest??0)+1,flags:legacy.flags??0,
    spots:legacy.spots.map((row,index)=>({...row,kinds:row.kinds??[row.kind],level:row.built?row.level??1:0,
      instanceId:row.built?`10000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`:null,
      spec:row.spec??null,treeA:row.tree?.a??0,treeB:row.tree?.b??0,revision:'0',
      x:row.x??1,z:row.z??2,hpUnits:null,maxHP:null})),
    wreck:{paidCoins:String(wreck?.paid??0),goalCoins:String(wreck?.goal??500)},...changes};
}
