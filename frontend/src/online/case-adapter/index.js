// Checkpoint 0 reserves the real adapter entry; stream 2 supplies its transport core.
import {createUnavailableCaseAdapter} from '../../adapter/unavailable.js';

export function createRealCaseAdapter() {
  return createUnavailableCaseAdapter();
}
