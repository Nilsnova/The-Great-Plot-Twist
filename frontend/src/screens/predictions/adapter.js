// Chooses the adapter the desk talks to.
//   * In development with ?desk=local in the address: the practice desk, a fake that never calls a server.
//   * Everywhere else: the real server, through the desk's own small request wrapper.
//
// The practice desk is loaded with a dynamic import inside a development-only branch, so the production
// build drops it: it is not in the files players download (tests/predictions/adapter-choice.test.js
// checks the guard, and the build can be searched for the label "Practice desk").
//
// Uses the shared in-memory account session through the A2 API client.
//
// Used by: desk.js and the tests.

import { createHttpDeskAdapter } from './adapter-http.js';
import { api } from '../../online/api.js';

export async function createDeskAdapter({ search = globalThis.location?.search ?? '' } = {}) {
  const wantsPractice = new URLSearchParams(search).get('desk') === 'local';
  if (import.meta.env.DEV && wantsPractice) {
    const practice = await import('./adapter-fake.js');
    return practice.createFakeDeskAdapter();
  }
  return createHttpDeskAdapter({ request: api });
}
