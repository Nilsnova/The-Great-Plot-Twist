// Menu › How to play: loads the card on first use and owns it while it is open (the game treats an
// open card like any other panel and pauses walking). With one island only (GAME-V3.md §2) the Harbor page
// says it is a building on the island and the controls drop the sea chart.
import {oneIsland} from '../island/one-island.js';
import {tutorialPages} from './pages.js';

export function createTutorialHost(container, {load = () => import('./card.js'), onClose = () => {}, one = () => oneIsland()} = {}) {
  let card = null, disposed = false, request = 0, loading = false;
  const readOne = () => { try { return one() !== false; } catch { return true; } };
  async function open() {
    const token = ++request;
    if (card?.isOpen) return card;
    loading = true;
    try {
      const {createTutorialCard} = await load();
      if (disposed || token !== request) return null;
      card?.dispose();
      const current = card = createTutorialCard({mode: 'menu', pages: tutorialPages(readOne())});
      current.open(container);
      void current.done.then(reason => { if (card === current) { card = null; current.dispose(); if (reason !== 'disposed') onClose(reason); } });
      return current;
    } catch { return null; } finally { if (token === request) loading = false; }
  }
  return {open,
    get active() { return loading || !!card?.isOpen; },
    close() { request++; loading = false; card?.close('closed'); },
    dispose() { disposed = true; request++; loading = false; card?.dispose(); card = null; },
  };
}
