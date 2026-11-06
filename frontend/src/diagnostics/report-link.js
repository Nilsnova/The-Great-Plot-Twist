// Prepare an external public issue draft with an explicit account notice; never submit it.
import {node, uniqueId} from '../ui/kit/dom.js';
import {createProblemUrl} from './report-url.js';
import {noteUiAction, readDiagnostics} from './runtime.js';

const explanation = 'Opens GitHub in a new tab. A GitHub account is required to submit a public report. '
  + 'Check the draft before submitting and remove any private information.';
export function createProblemDescription(link) {
  const description = node('p', 'problem-report-description', explanation);
  description.id = uniqueId('problem-report-description');
  link.setAttribute('aria-describedby', description.id);
  return description;
}
export function createProblemLink(openedFrom) {
  const link = node('a', 'kit-button kit-quiet problem-report', 'Report a problem');
  requestAnimationFrame(() => {
    if (link.isConnected) noteUiAction(openedFrom);
  });
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = explanation;
  const refresh = () => { link.href = createProblemUrl(readDiagnostics()); };
  link.addEventListener('focus', refresh);
  link.addEventListener('click', refresh);
  refresh();
  return link;
}
