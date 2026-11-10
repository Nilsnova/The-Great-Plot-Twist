// The sole adapter composition point. Background network work belongs to the real factory.
import {createUnavailableAdapter} from './unavailable.js';
import {adapterChoice,hasSignInReturn} from './selection.js';
import {createLazyOnlineAdapter} from './lazy-online.js';

async function prepareSignInReturn() {
  const {takeAuthReturn} = await import('../online/auth-return.js');
  const returned = takeAuthReturn();
  const {createAuth} = await import('../online/auth.js');
  const auth = createAuth();
  void auth.handleReturn(returned);
  return auth;
}

export async function createClientAdapter() {
  const search = location.search;
  const choice = adapterChoice(search, import.meta.env.DEV);
  if (choice === 'local') {
    const {createFakeAdapter} = await import('./fake/index.js');
    return createFakeAdapter();
  }
  if (choice === 'unavailable') return createUnavailableAdapter();
  const auth = hasSignInReturn(search) ? await prepareSignInReturn() : null;
  return createLazyOnlineAdapter(auth ? {deps: {auth}} : undefined);
}
