// Reject malformed read envelopes before they can replace a last-good server snapshot.
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const nullableText = value => value === null || typeof value === 'string';
export function validReadReply(kind, data) {
  if (!object(data)) return false;
  if (kind === 'config') return object(data.flags);
  if (kind === 'me') {
    return typeof data.id === 'string' && Number.isFinite(data.coins) && data.coins >= 0
      && Array.isArray(data.crews) && nullableText(data.captainName)
      && nullableText(data.kit) && nullableText(data.place);
  }
  return false;
}
