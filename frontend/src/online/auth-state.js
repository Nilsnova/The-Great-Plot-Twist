// Fixed auth messages and address checks keep SDK errors and credential data out of screens.
export const AUTH_MESSAGES = {
  signed_out: 'You are signed out. Your progress on this device is kept.',
  signing_in: 'Opening GitHub sign-in. Your progress on this device is kept.',
  signed_in: 'You are signed in.',
  expired: 'Your session expired. Sign in again; your progress on this device is kept.',
  error: 'Sign-in could not finish. Try signing in again.',
  not_setup: 'Sign-in is not set up on this build',
  storage: 'This tab cannot keep the sign-in check. Allow browser storage, then try again.',
  disposed: 'This sign-in client has closed.',
};

export function authConfiguration(url, key) {
  if (typeof key !== 'string' || !key.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return {url: parsed.origin, key};
  } catch { return null; }
}

// Provider consent pages a guest upgrade (linkIdentity) may send the browser to, after Supabase
// answered with the provider's own address. Ordinary sign-in always starts on our Supabase origin.
const linkPages = {github: ['https://github.com/login/oauth/authorize']};
export function signInAddress(value, configuration, {provider = 'github', upgrade = false} = {}) {
  try {
    const url = new URL(value);
    if (upgrade) return (linkPages[provider] ?? []).includes(url.origin + url.pathname) ? url.href : null;
    return url.origin === configuration.url && url.pathname === '/auth/v1/authorize'
      && url.searchParams.get('provider') === provider
      && url.searchParams.get('code_challenge_method') === 's256' ? url.href : null;
  } catch { return null; }
}

// Email code sign-in (Supabase email OTP). The address goes only to our Supabase project.
export function normalEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email.length >= 3 && email.length <= 254 && !/[\s\x00-\x1f\x7f]/.test(email)
    && /^[^@]+@[^@]+\.[^@.]+$/.test(email) ? email : null;
}
export const validEmailCode = value => typeof value === 'string' && /^\d{6}$/.test(value);

// Sorts an SDK error into a fixed reason, so no SDK text or address reaches a screen.
// rate_limited: Supabase answered 429 (one code per address a minute, or the project limit).
export function emailFailure(error, step) {
  const status = Number(error?.status), code = typeof error?.code === 'string' ? error.code : '';
  if (status === 429 || /rate_limit/.test(code)) return 'rate_limited';
  if (['email_provider_disabled', 'signup_disabled', 'otp_disabled'].includes(code)) return 'email_off';
  if (['email_exists', 'user_already_exists', 'identity_already_exists'].includes(code)) return 'email_taken';
  if (step === 'verify' && (code === 'otp_expired' || [400, 401, 403, 404, 422].includes(status))) return 'wrong_code';
  if (step === 'send' && (/email_address|validation_failed/.test(code) || [400, 422].includes(status))) return 'invalid_email';
  return 'error';
}

export function ownReturnAddress(href) {
  try {
    const url = new URL(typeof href === 'function' ? href() : href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

export function validAuthCode(result) {
  const code = result?.code;
  return !result?.error && typeof code === 'string' && code.length > 0 && code.length <= 4096
    && !/[\s\x00-\x1f\x7f]/.test(code);
}

export function guardAuthStorage(storage, sdkKey, storageKey) {
  let active = true, detached = false;
  const memory = new Map();
  const mapped = key => typeof key === 'string' && (key === sdkKey || key.startsWith(`${sdkKey}-`))
    ? `${storageKey}${key.slice(sdkKey.length)}` : key;
  function remember(key, value) {
    if (typeof value === 'string') memory.set(key, value);
    else memory.delete(key);
    return value;
  }
  return {
    getItem(key) {
      if (!active) return null;
      const name = mapped(key);
      return detached ? memory.get(name) ?? null : remember(name, storage.getItem(name));
    },
    setItem(key, value) {
      if (!active) return;
      const name = mapped(key);
      remember(name, value);
      if (!detached) storage.setItem(name, value);
    },
    removeItem(key) {
      if (!active) return;
      const name = mapped(key);
      memory.delete(name);
      if (!detached) storage.removeItem(name);
    },
    // The SDK can finish logout from opaque memory strings after persistent auth has been erased.
    detach() { detached = true; },
    close() { active = false; memory.clear(); },
  };
}
