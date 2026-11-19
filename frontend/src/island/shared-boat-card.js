// Shared reward copy uses the server's cumulative cap, never another personal allowance.
export function sharedBoatPay(game) {
  return game.remainingCoins === '0' ? 'Island cap reached · play for fun'
    : `Island +${game.claimedCoins} / ${game.maximumCoins} · ${game.remainingCoins} left`;
}
export function sharedBoatResult(answer) {
  if (!answer?.ok) return {line: answer?.message ?? 'Retry this round to confirm its reward.', coins: 0};
  const result = answer.data.receipt.result, coins = Number(result.coins);
  const line = result.coins !== '0' ? `Island treasury +${result.coins} · ${result.cumulativeCoins} / ${result.maximumCoins} earned`
    : result.cumulativeCoins === result.maximumCoins ? 'Island cap reached for this game and record. Play for fun!'
    : `No improvement · island ${result.cumulativeCoins} / ${result.maximumCoins} earned`;
  return {line, coins};
}
