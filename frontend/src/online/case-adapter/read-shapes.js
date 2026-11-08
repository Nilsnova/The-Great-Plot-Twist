// Reject malformed read envelopes before they can replace a last-good server snapshot.
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const nullableText = value => value === null || typeof value === 'string';
export function validCrew(data) {
  if (!object(data)) return false;
  if (data.crew === null) return true;
  const crew = data.crew;
  if (!object(crew) || typeof crew.id !== 'string' || !nullableText(crew.code)
    || !['forming', 'active', 'finished'].includes(crew.status) || !Array.isArray(crew.seats)) return false;
  if (crew.mode !== undefined && !['solo', 'crew'].includes(crew.mode)) return false;
  if (crew.mySeat !== undefined && crew.mySeat !== null
    && (!Number.isInteger(crew.mySeat) || crew.mySeat < 1 || crew.mySeat > 4)) return false;
  if (crew.startedAt !== undefined && crew.startedAt !== null
    && typeof crew.startedAt !== 'string' && !Number.isFinite(crew.startedAt)) return false;
  const seats = crew.seats;
  return seats.length === 4 && new Set(seats.map(seat => seat?.seatNo)).size === 4
    && seats.every(seat => object(seat) && Number.isInteger(seat.seatNo) && seat.seatNo >= 1 && seat.seatNo <= 4
      && ['player', 'partner', 'open'].includes(seat.holder) && nullableText(seat.name) && nullableText(seat.kit));
}
export function validReadReply(kind, data) {
  if (!object(data)) return false;
  if (kind === 'config') return object(data.flags);
  if (kind === 'me') {
    return typeof data.id === 'string' && Number.isFinite(data.coins) && data.coins >= 0
      && Array.isArray(data.crews) && nullableText(data.captainName)
      && nullableText(data.kit) && nullableText(data.place);
  }
  if (kind === 'save') {
    return Number.isInteger(data.version) && data.version > 0 && object(data.data)
      && (data.updatedAt === undefined || nullableText(data.updatedAt) || Number.isFinite(data.updatedAt));
  }
  if (kind === 'crew') return validCrew(data);
  return false;
}
