// A malformed success answer cannot confirm a captain name.
export function validNameReply(data) {
  return typeof data?.captainName === 'string' && !!data.captainName.trim()
    && Number.isInteger(data.rerollsLeft) && data.rerollsLeft >= 0;
}
