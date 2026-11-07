// The way into the Island Exchange panel. game.js loads this file the first time the player uses the market hall.
// It picks the adapter (the local fake only in a dev build with ?market=local, else the real server) and loads
// the panel only when it is first needed. This is the only file that imports http.js or fake.js.
//   const market = createMarketEntry({ container, resetInput, focusGame, openShareholderRegister, getToken });
//   await market.open();   market.active;   market.close();   market.dispose();

// Dev builds only: ?market=local uses the fake, and &scenario=demo (or us-open, holiday, off, relit) picks its board.
export function chooseAdapterKind({ dev = false, search = '' } = {}) {
  return dev && new URLSearchParams(search ?? '').get('market') === 'local' ? 'fake' : 'http';
}

async function makeAdapter(ctx) {
  const search = typeof location === 'undefined' ? '' : location.search;
  // import.meta.env.DEV stands in front on purpose: the build then drops this branch, and the fake is not shipped.
  if (import.meta.env.DEV && chooseAdapterKind({ dev: import.meta.env.DEV, search }) === 'fake') {
    const { createFakeMarketAdapter } = await import('./fake.js');
    return { adapter: createFakeMarketAdapter({ scenario: new URLSearchParams(search).get('scenario') ?? undefined }), local: true };
  }
  const { createMarketHttpAdapter } = await import('./http.js');
  return { adapter: createMarketHttpAdapter({ getToken: ctx.getToken, request: ctx.request, publicGet: ctx.publicGet }), local: false };
}

export function createMarketEntry(ctx) {
  let panel = null, pending = null, disposed = false, generation = 0, opening = false;
  const loadPanel = ctx.loadPanel ?? (() => import('./panel.js'));

  async function build(scope) {
    const { adapter, local } = await makeAdapter(ctx);
    if (disposed || scope !== generation) return null;
    const { createMarketPanel } = await loadPanel();
    if (disposed || scope !== generation) return null;
    const { container, resetInput, focusGame, openShareholderRegister, onSessionChange, onSignIn } = ctx;
    const created = createMarketPanel({ container, adapter, resetInput, focusGame, openShareholderRegister,
      onSessionChange: local ? undefined : onSessionChange, onSignIn });
    if (disposed || scope !== generation) { created.dispose(); return null; }
    panel = created;
    if (import.meta.env.DEV) window.__market = { adapter, panel };
    return panel;
  }
  function load(scope) {
    if (panel) return Promise.resolve(panel);
    if (pending?.scope === scope) return pending.promise;
    const task = {scope, promise: null};
    task.promise = build(scope).finally(() => { if (pending === task) pending = null; });
    pending = task;
    return task.promise;
  }

  return {
    get active() { return opening || Boolean(panel?.active); },
    async open() {
      if (disposed) return;
      const scope = generation; opening = true;
      try { const view = await load(scope); if (view && !disposed && scope === generation) view.open(); }
      catch (error) { if (!disposed && scope === generation) throw error; }
      finally { if (scope === generation) opening = false; }
    },
    close() {
      const active = opening || Boolean(panel?.active);
      generation += 1; opening = false; pending = null; panel?.close();
      return active;
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation += 1; opening = false; pending = null;
      panel?.dispose();
      if (import.meta.env.DEV) delete window.__market;
    },
  };
}
