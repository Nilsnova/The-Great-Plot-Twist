// The sole adapter composition point. Background network work belongs to the real factory.
import {createUnavailableCaseAdapter} from './unavailable.js';
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
    const {createLocalAdapter} = await import('./local-start.js');
    return createLocalAdapter();
  }
  if (choice === 'unavailable') return createUnavailableCaseAdapter();
  const auth = hasSignInReturn(search) ? await prepareSignInReturn() : null;
  return createLazyOnlineAdapter(auth ? {deps: {auth}} : undefined);
}
