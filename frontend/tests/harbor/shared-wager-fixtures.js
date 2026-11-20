// Complete common wire receipts for component tests; no financial authority is simulated here.
let sequence = 100;
export const fixtureUuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export function acceptedWager(body, context, actorId = fixtureUuid(2), currentEconomy = null) {
  const product = body.fixtureId ? 'football' : 'market_call';
  const wagerId = fixtureUuid(sequence++), operationId = fixtureUuid(sequence++), sourceId = fixtureUuid(sequence++);
  const held = (BigInt(context.treasury.committedCoins) + BigInt(body.stake)).toString();
  const current = currentEconomy ?? {...context, revision: (BigInt(context.revision) + 1n).toString(),
    treasury: {...context.treasury, committedCoins: held,
      availableCoins: (BigInt(context.treasury.balanceCoins) - BigInt(held)).toString()}};
  const wager = {id: wagerId, operationId, sourceReservationId: sourceId, actorId,
    accountId: context.accountId, runEpoch: context.runEpoch, product,
    eventId: body.asset ?? body.fixtureId, selection: body.direction ?? body.pick, stake: body.stake,
    openedAt: '2026-11-18T15:00:00Z', settleAt: '2026-11-18T15:05:00Z'};
  const financialReceipt = {id: sourceId, accountId: context.accountId, runEpoch: context.runEpoch,
    actorId, actionUid: `fx_${operationId.replaceAll('-', '')}_stake`, kind: 'reserve',
    reason: product === 'market_call' ? 'market_call_stake' : 'prediction_stake',
    reference: `wager:${wagerId}`, balanceDelta: '0', committedDelta: body.stake,
    balanceAtCommit: current.treasury.balanceCoins, committedAtCommit: current.treasury.committedCoins,
    revisionAtCommit: current.revision, sourceReservationId: null};
  const {mode, version, islandOwner, accountId, runEpoch} = context;
  return {ok: true, status: 200, data: {status: 'done', repeat: false, currentEconomy: current,
    receipt: {receiptId: wagerId, action: 'island_bet', actionUid: body.actionUid, actorId,
      origin: {mode, version, islandOwner, accountId, runEpoch},
      result: {wager, settlement: null, financialReceipt}}}};
}
