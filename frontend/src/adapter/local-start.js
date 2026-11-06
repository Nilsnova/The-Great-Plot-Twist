// Read convenience intro moves only for the explicit local rehearsal adapter.
import {introJournal} from '../story/intro-journal.js';
import {createFakeCaseAdapter} from './fake/index.js';

export function createLocalAdapter() {
  let localActions = null;
  try {
    const saved = JSON.parse(introJournal().read());
    if (saved?.version === 1 && Array.isArray(saved.actions)
      && saved.actions.every(id => typeof id === 'string')) localActions = saved.actions;
  } catch { /* An invalid device save never blocks the title. */ }
  return createFakeCaseAdapter({localActions});
}
