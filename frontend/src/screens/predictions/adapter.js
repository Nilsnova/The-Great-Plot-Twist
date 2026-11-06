// Chooses the adapter the desk talks to.
//   * In development with ?desk=local in the address: the practice desk, a fake that never calls a server.
//   * Everywhere else: the real server, through the desk's own small request wrapper.
//
// The practice desk is loaded with a dynamic import inside a development-only branch, so the production
// build drops it: it is not in the files players download (tests/predictions/adapter-choice.test.js
// checks the guard, and the build can be searched for the label "Practice desk").
//
// The game has no sign-in yet (package A2), so no token is sent and every player is "not signed in".
// When A2 is merged, import its `api` (src/online/api.js) and pass it as `request` below; it has the
// same get and post, and request.js can be deleted.
//
// Used by: desk.js and the tests.

import { createHttpDeskAdapter } from './adapter-http.js';
import { createRequest } from './request.js';

const noToken = () => null;

export async function createDeskAdapter({ search = globalThis.location?.search ?? '' } = {}) {
  const wantsPractice = new URLSearchParams(search).get('desk') === 'local';
  if (import.meta.env.DEV && wantsPractice) {
    const practice = await import('./adapter-fake.js');
    return practice.createFakeDeskAdapter();
  }
  return createHttpDeskAdapter({ request: createRequest({ getToken: noToken }) });
}
