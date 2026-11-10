// Decide which adapter may run without importing a transport or reading player data.
// ?adapter=local is the memory-only fake (dev builds, or with ?demo=1); ?demo=1 alone stays offline.
export function adapterChoice(search, dev = false) {
  const query = new URLSearchParams(search);
  if (query.get('adapter') === 'local') {
    return dev || query.get('demo') === '1' ? 'local' : 'unavailable';
  }
  return query.get('demo') === '1' ? 'unavailable' : 'online';
}

export function hasSignInReturn(search) {
  const query = new URLSearchParams(search);
  return query.has('code') || query.has('error');
}
