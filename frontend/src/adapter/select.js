// The sole adapter composition point. Background network work belongs to the real factory.
import {createUnavailableCaseAdapter} from './unavailable.js';
import {adapterChoice,hasSignInReturn} from './selection.js';

const REAL_ADAPTER_READY = false; // Stream 2 switches this after its conformance gate.

async function prepareSignInReturn() {
  // Stream 3 handles PKCE here before starting an ordinary online session.
}

export async function createClientAdapter() {
  const search = location.search;
  const choice = adapterChoice(search, import.meta.env.DEV);
  if (choice === 'local') {
    const {createLocalAdapter} = await import('./local-start.js');
    return createLocalAdapter();
  }
  if (choice === 'unavailable') return createUnavailableCaseAdapter();
  if (hasSignInReturn(search)) await prepareSignInReturn();
  if (!REAL_ADAPTER_READY) return createUnavailableCaseAdapter();
  try {
    const {createRealCaseAdapter} = await import('../online/case-adapter/index.js');
    return createRealCaseAdapter();
  } catch {
    return createUnavailableCaseAdapter({message:'The account service could not load. You can still play Act 1.'});
  }
}
