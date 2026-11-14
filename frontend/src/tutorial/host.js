// Menu › How to play: loads the card on first use and owns it while it is open (the game treats an
// open card like any other panel and pauses walking). With one island only (GAME-V3.md §2) the Harbor page
// says it is a building on the island and the controls drop the sea chart.
import {oneIsland} from '../island/one-island.js';
import {tutorialPages} from './pages.js';
import {createModal} from '../ui/kit/modal.js';
import {createButton} from '../ui/kit/button.js';
import './loading.css';

export function createTutorialHost(container, {load = () => import('./card.js'), onClose = () => {}, one = () => oneIsland()} = {}) {
  let card = null, disposed = false, request = 0, loading = false;
  let feedback = null, message = null, retry = null;
  function clearFeedback() { feedback?.dispose(); feedback = message = retry = null; }
  function showFeedback(failed = false) {
    if (!feedback) {
      message = document.createElement('p');
      retry = createButton({label: 'Try again', onClick: () => void open()});
      const back = createButton({label: 'Back to game', variant: 'quiet', onClick: close});
      const body = document.createElement('div'); body.append(message, retry.element, back.element);
      feedback = createModal({title: 'How to play', body, onCancel: close});
      feedback.element.classList.add('tutorial-load-feedback');
    }
    message.setAttribute('role', failed ? 'alert' : 'status');
    message.textContent = failed ? 'How to play could not load. Try again, or return to the game.' : 'Loading How to play…';
    retry.element.hidden = !failed;
    feedback.open(container);
    if (failed) retry.element.focus();
    else feedback.element.querySelector('button').focus();
  }
  function close() {
    request++;
    const hadFeedback = loading || !!feedback;
    loading = false; clearFeedback();
    if (card?.isOpen) card.close('closed');
    else if (hadFeedback) onClose('closed');
  }
  const readOne = () => { try { return one() !== false; } catch { return true; } };
  async function open() {
    if (disposed || loading) return null;
    if (card?.isOpen) return card;
    const token = ++request;
    loading = true; showFeedback();
    try {
      const {createTutorialCard} = await load();
      if (disposed || token !== request) return null;
      clearFeedback();
      card?.dispose();
      const current = card = createTutorialCard({mode: 'menu', pages: tutorialPages(readOne())});
      current.open(container);
      void current.done.then(reason => { if (card === current) { card = null; current.dispose(); if (reason !== 'disposed') onClose(reason); } });
      return current;
    } catch {
      if (!disposed && token === request) showFeedback(true);
      return null;
    } finally { if (token === request) loading = false; }
  }
  return {open,
    get active() { return loading || !!feedback?.element.open || !!card?.isOpen; },
    close,
    dispose() { disposed = true; request++; loading = false; clearFeedback(); card?.dispose(); card = null; },
  };
}
