// Current-epoch observer delivery is isolated; reset and unsubscribe stop older publications.
export function createIsletPublications({getView, getEpoch, current}) {
  const listeners = new Set();
  // "answered" marks a change that came from a good GET answer. The host tells the world about those.
  function publish(answered = false) {
    const view = getView();
    view.revision += 1;
    const event = {type: 'islet_updated', view: structuredClone(view), answered};
    const owner = getEpoch();
    for (const listener of [...listeners]) {
      if (!current(owner)) break;
      if (!listeners.has(listener)) continue;
      try { const pending = listener({...event, view: structuredClone(event.view)}); pending?.catch?.(() => {}); }
      catch { /* Observers do not own an outcome. */ }
    }
  }
  return {publish,
    subscribe(listener) {
      if (!current(getEpoch())) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() { listeners.clear(); },
  };
}
