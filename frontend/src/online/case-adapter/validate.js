// Validate intent shapes before transport; all game outcomes still come from the server.
const actionId = /^[a-z0-9_]{1,40}$/;
const identifier = /^[a-zA-Z0-9_.-]{1,80}$/;
const invalid = reason => ({accepted: false, reason, message: 'Check this action and try again.'});
export function validActions(actions) {
  return Array.isArray(actions) && actions.length > 0 && actions.length <= 300
    && actions.every(value => typeof value === 'string' && actionId.test(value));
}
export function normalizeCrewCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{1,20}$/.test(code) ? code : null;
}
// {provider: 'email', email} sends a code; adding code: '123456' checks it. Only email takes them.
function validSignIn(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.every(key => ['provider', 'guest', 'upgrade', 'email', 'code'].includes(key))) return false;
  if (value.provider !== undefined && !['github', 'email'].includes(value.provider)) return false;
  if (value.guest !== undefined && value.guest !== true) return false;
  if (value.upgrade !== undefined && value.upgrade !== true) return false;
  const email = value.provider === 'email';
  if (email !== (value.email !== undefined)) return false;
  if (email && (typeof value.email !== 'string' || value.email.length > 254)) return false;
  // code is either the class code of a guest start (the server decides whether it is the current
  // one) or the 6-digit code of an email sign-in.
  if (value.code !== undefined && !(typeof value.code === 'string'
    && ((value.guest === true && /^[A-Za-z0-9\s-]{1,32}$/.test(value.code)) || (email && /^\d{6}$/.test(value.code))))) return false;
  return !(value.guest && (value.upgrade || value.provider));
}
export function validateIntent(name, args) {
  const [first, second, third] = args;
  if (name === 'completeIntro' && !validActions(first?.actions)) return invalid('intro_incomplete');
  if (name === 'joinCrew' && !normalizeCrewCode(first)) return invalid('invalid_request');
  if (name === 'joinCrew' && second !== undefined && (!second || typeof second !== 'object'
    || (second.confirm !== undefined && typeof second.confirm !== 'boolean'))) return invalid('invalid_request');
  if (name === 'signIn' && first !== undefined && !validSignIn(first)) return invalid('invalid_request');
  if (name === 'deleteMyData' && first?.confirm !== true) return invalid('confirmation_required');
  if (name === 'resolveSaveConflict' && !['keep_this_device', 'use_cloud'].includes(first)) {
    return invalid('unsupported_choice');
  }
  if (['pin', 'search', 'accuse'].includes(name) && (typeof first !== 'string' || !identifier.test(first))) {
    return invalid('invalid_request');
  }
  if (name === 'pair' && [first, second].some(id => typeof id !== 'string' || !identifier.test(id))) {
    return invalid('invalid_request');
  }
  if (name === 'inspectSpot' && (typeof first !== 'string' || !identifier.test(first))) {
    return invalid('unknown_spot');
  }
  if (['buildLight', 'takePost', 'aim'].includes(name) && typeof first !== 'string') {
    return invalid('unknown_light');
  }
  if (name === 'aim' && !Number.isFinite(second)) return invalid('invalid_request');
  if (name === 'claimLantern' && typeof first !== 'string') return invalid('unknown_colour');
  if (name === 'orderPartner' && (!Number.isInteger(first) || first < 1 || first > 4
    || typeof second !== 'string' || typeof third !== 'string')) return invalid('invalid_request');
  if (name === 'setEmote' && !['wave', 'cheer', 'point', 'lantern', 'shrug'].includes(first)) {
    return invalid('invalid_emote');
  }
  if (name === 'reportPosition' && (!first || !Number.isFinite(first.x) || !Number.isFinite(first.y)
    || typeof first.place !== 'string' || typeof first.moving !== 'boolean'
    || !['front', 'back', 'left', 'right'].includes(first.facing))) return invalid('invalid_request');
  return null;
}
