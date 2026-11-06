// Lazy pavilion owner. One load per game; a disposed game cannot create a late sports dialog.
export function createSportsEntry(ctx, { load = () => Promise.all([import('./http.js'), import('./panel.js')]) } = {}) {
  let panel = null, pending = null, disposed = false, opening = false, generation = 0;
  async function build() {
    const [transport, view] = await load();
    if (disposed) return null;
    panel = view.createSportsPanel({ ...ctx, adapter: transport.createSportsHttp({ getToken: ctx.getToken }) });
    return panel;
  }
  return {
    get active() { return opening || Boolean(panel?.active); },
    async open() {
      if (disposed || opening) return;
      const token = ++generation;
      opening = true; ctx.resetInput?.();
      try {
        pending ??= build().catch(error => { pending = null; throw error; });
        const ready = await pending;
        if (!disposed && token === generation) {
          const loaded = ready?.open(); opening = false; await loaded;
        }
      } finally { if (token === generation) opening = false; }
    }, close() { generation++; opening = false; panel?.close(); },
    dispose() { if (disposed) return; disposed = true; generation++; opening = false; panel?.dispose(); },
  };
}
