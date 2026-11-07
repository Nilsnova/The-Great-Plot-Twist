// Keeps account-scoped home-islet buildings separate from presenter-only previews.
export const isletPlots = Object.freeze({
  plot_1: Object.freeze({ asset: 'cabin', x: -8, z: 6, defaultBuilt: true }),
  plot_2: Object.freeze({ asset: 'workshop', x: 7, z: 6 }),
  plot_3: Object.freeze({ asset: 'windmill', x: -8, z: -7, locked: true }),
  plot_4: Object.freeze({ asset: 'greenhouse', x: 7, z: -7, locked: true }),
  islet_signal_station: Object.freeze({ asset: 'islet-signal-station', x: 0, z: -14, locked: false }),
});

const known = new Set(Object.keys(isletPlots));
const cabinOnly = Object.freeze(['plot_1']);

// Accept only complete, internally consistent events before replacing the visible build state.
export function builtFromIsletChanged(event) {
  if (!event
      || event.type !== 'islet_changed'
      || !Array.isArray(event.built)
      || typeof event.signalStationBuilt !== 'boolean') return null;
  const built = new Set(event.built);
  const containsUnknownPlot = [...built].some(id => !known.has(id));
  if (built.size !== event.built.length || containsUnknownPlot) return null;
  if (!built.has('plot_1')) return null;
  if (event.signalStationBuilt !== built.has('islet_signal_station')) return null;
  return Object.freeze([...event.built]);
}

// `on` is the app event subscription function; no screen or transport is imported here.
// Keep event-backed state separate from presenter preview state so previews never become writes.
export function createIsletState({ on }) {
  let latest = cabinOnly;
  let preview = null;
  let disposed = false;
  const listeners = new Set();
  const actualListeners = new Set();
  const read = () => preview ?? latest;
  const publish = () => {
    const previewing = preview !== null;
    for (const listener of [...listeners]) listener([...read()], { preview: previewing });
  };
  const unsubscribe = on('islet_changed', event => {
    if (disposed) return;
    const next = builtFromIsletChanged(event);
    if (!next) return;
    latest = next;
    for (const listener of [...actualListeners]) listener([...latest]);
    publish();
  });
  return {
    getBuilt: () => [...read()],
    getLatestBuilt: () => [...latest],
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener([...read()], { preview: preview !== null });
      return () => listeners.delete(listener);
    },
    subscribeActual(listener) {
      if (disposed) return () => {};
      actualListeners.add(listener); listener([...latest]);
      return () => actualListeners.delete(listener);
    },
    previewBuilt(ids) {
      if (disposed) return false;
      const containsUnknownPlot = !Array.isArray(ids) || ids.some(id => !known.has(id));
      if (containsUnknownPlot || !ids.includes('plot_1')) return false;
      preview = Object.freeze([...new Set(ids)]);
      publish();
      return true;
    },
    clearPreview() {
      if (disposed || !preview) return;
      preview = null;
      publish();
    },
    resetAccount() {
      if (disposed) return false;
      const actualChanged = latest.length !== 1 || latest[0] !== 'plot_1';
      if (!actualChanged && preview === null) return false;
      latest = cabinOnly;
      preview = null;
      if (actualChanged) for (const listener of [...actualListeners]) listener([...latest]);
      publish();
      return true;
    },
    dispose() { if (disposed) return; disposed = true; unsubscribe?.(); listeners.clear(); actualListeners.clear(); },
  };
}
