// Menu › How to play: loads the card on first use and owns it while it is open (the game treats an
// open card like any other panel and pauses walking).
export function createTutorialHost(container, {load = () => import('./card.js'), onClose = () => {}} = {}) {
  let card = null, disposed = false, request = 0, loading = false;
  async function open() {
    const token = ++request;
    if (card?.isOpen) return card;
    loading = true;
    try {
      const {createTutorialCard} = await load();
      if (disposed || token !== request) return null;
      card?.dispose();
      const current = card = createTutorialCard({mode: 'menu'});
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
