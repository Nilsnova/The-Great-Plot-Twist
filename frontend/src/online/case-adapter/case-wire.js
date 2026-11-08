// Published case request/envelope boundary only. No sending, identity, UID generation or view validation.
const uid = /^[A-Za-z0-9_-]{8,64}$/;
const card = /^C[1-8]$/;
const searchRoute = /^C[1-8][.][a-z0-9_]{2,40}$/;
const partnerTarget = /^[A-Za-z][A-Za-z0-9_]{1,63}$/;
const light = /^[a-z][a-z0-9_]{1,60}$/;
const suspect = /^[a-z0-9_]{2,40}$/;
const text = value => typeof value === 'string';
const matches = (pattern, value) => text(value) && pattern.exec(value)?.[0] === value;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const routes = {
  pin: ['/api/board/pin', ['cardId'], body => matches(card, body.cardId)],
  pair: ['/api/board/pair', ['cards'], body => Array.isArray(body.cards) && body.cards.length === 2
    && [body.cards[0], body.cards[1]].every(value => matches(card, value)) && body.cards[0] !== body.cards[1]],
  search: ['/api/case/search', ['routeId', 'paidConfirmed', 'expectedPrice'], body => matches(searchRoute, body.routeId)
    && typeof body.paidConfirmed === 'boolean'
    && (body.expectedPrice === null || (Number.isSafeInteger(body.expectedPrice) && body.expectedPrice >= 0))],
  orderPartner: ['/api/crews/me/orders', ['seat', 'order', 'target', 'allowPaid'], body => Number.isInteger(body.seat)
    && body.seat >= 1 && body.seat <= 4 && ['fetch', 'man_light'].includes(body.order)
    && matches(partnerTarget, body.target) && body.allowPaid === false],
  callNightfall: ['/api/finale/nightfall', [], () => true],
  takePost: ['/api/finale/post', ['light'], body => matches(light, body.light)],
  aim: ['/api/finale/signal', ['light', 'bearing'], body => matches(light, body.light) && finite(body.bearing)],
  accuse: ['/api/case/accuse', ['suspect'], body => matches(suspect, body.suspect)],
};

// Caller supplies an existing action UID and any price/permission facts from its validated held view.
export function buildCaseRequest(intent, input) {
  try {
    if (!Object.hasOwn(routes, intent) || !record(input)) return null;
    const [route, fields, valid] = routes[intent], required = [...fields, 'actionUid'];
    const keys = Reflect.ownKeys(input);
    if (keys.length !== required.length || keys.some(key => !required.includes(key))
      || required.some(key => !Object.hasOwn(input, key)) || !matches(uid, input.actionUid)
      || !valid(input)) return null;
    const body = Object.fromEntries(required.map(key => [key, key === 'cards' ? [...input.cards] : input[key]]));
    if (intent === 'aim') body.bearing = ((body.bearing % 360) + 360) % 360;
    return {method: 'POST', route, body};
  } catch { return null; }
}

// Only the outer intent contract is checked. A returned answer is NOT approval to apply its case.
// Route-specific extras and the case payload stay opaque; the eventual DTO validator must own them.
export function parseCaseIntentAnswer(answer) {
  try {
    if (!record(answer) || !['accepted', 'reason', 'message', 'case'].every(key => Object.hasOwn(answer, key))
      || typeof answer.accepted !== 'boolean'
      || (answer.case !== null && !record(answer.case))
      || !text(answer.message) || (answer.accepted ? answer.reason !== null : !text(answer.reason) || !answer.reason.length)
      || (Object.hasOwn(answer, 'repeat') && typeof answer.repeat !== 'boolean')) return null;
    return {...answer};
  } catch { return null; }
}
