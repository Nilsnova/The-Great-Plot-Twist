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
    return createFakeMarketAdapter({ scenario: new URLSearchParams(search).get('scenario') ?? undefined });
  }
  const { createMarketHttpAdapter } = await import('./http.js');
  return createMarketHttpAdapter({ getToken: ctx.getToken });
}

export function createMarketEntry(ctx) {
  let panel = null, pending = null, disposed = false;

  async function build() {
    const adapter = await makeAdapter(ctx);
    const { createMarketPanel } = await import('./panel.js');
    if (disposed) return null;
    const { container, resetInput, focusGame, openShareholderRegister } = ctx;
    panel = createMarketPanel({ container, adapter, resetInput, focusGame, openShareholderRegister });
    if (import.meta.env.DEV) window.__market = { adapter, panel };
    return panel;
  }
  function load() {
    pending ??= build().catch(error => { pending = null; throw error; });
    return pending;
  }

  return {
    get active() { return Boolean(panel?.active); },
    async open() {
      const view = await load();
      if (view && !disposed) view.open();
    },
    close() { panel?.close(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      panel?.dispose();
      if (import.meta.env.DEV) delete window.__market;
    },
  };
}
