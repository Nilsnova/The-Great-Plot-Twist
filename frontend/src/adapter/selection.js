// Decide which adapter may run without importing a transport or reading player data.
export function adapterChoice(search, dev = false) {
  const query = new URLSearchParams(search);
  if (query.get('case') === 'local') {
    return dev || query.get('demo') === '1' ? 'local' : 'unavailable';
  }
  return query.get('demo') === '1' ? 'unavailable' : 'online';
}

export function hasSignInReturn(search) {
  const query = new URLSearchParams(search);
  return query.has('code') || query.has('error');
}
